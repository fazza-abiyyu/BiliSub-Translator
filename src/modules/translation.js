// BiliSub content script module: Translation engine (track batch, per-line, loop)
// Content scripts share one isolated scope, so files are loaded in
// manifest order (see manifest.json content_scripts).

async function translateSubtitleTrack(subtitles) {
  if (!settings.autoTranslate) {
    return subtitles;
  }

  console.log('[BiliSub] Network batch translating track of size:', subtitles.length);

  const translatedList = JSON.parse(JSON.stringify(subtitles));
  
  // We only translate the first 150 subtitles to stay within the 4-second network timeout.
  // The rest will be translated on-the-fly and pre-translated by startTranslationLoop.
  const limit = Math.min(subtitles.length, 150);
  const concurrency = 8;
  let currentIndex = 0;
  
  const worker = async (maxIndex) => {
    while (true) {
      if (!extensionContextValid) break;
      const idx = currentIndex++;
      if (idx >= maxIndex) break;

      const sub = subtitles[idx];
      let originalText = sub.content?.trim();
      if (!originalText) continue;

      originalText = originalText.replace(/\|/g, '');

      if (translationCache.has(originalText)) {
        const transText = translationCache.get(originalText);
        const finalContent = settings.subtitleMode === 'translationOnly' 
          ? transText 
          : `${originalText}\n${transText}`;
        translatedList[idx].content = finalContent;
        continue;
      }

      try {
        if (!checkExtensionContext()) break;
        const response = await chrome.runtime.sendMessage({
          type: 'translateText',
          text: originalText,
          targetLang: settings.targetLang
        });
        if (response && response.translation && response.translation !== originalText) {
          const transText = response.translation;
          translationCache.set(originalText, transText);
          
          const finalContent = settings.subtitleMode === 'translationOnly' 
            ? transText 
            : `${originalText}\n${transText}`;
          translatedList[idx].content = finalContent;
        }
      } catch (err) {
        if (err.message?.includes('Extension context invalidated')) {
          extensionContextValid = false;
          console.error('[BiliSub] Extension context invalidated. Stopping batch translation.');
          break;
        }
        console.error('Batch translation error at index:', idx, err);
      }
    }
  };

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, limit); i++) {
    workers.push(worker(limit));
  }
  await Promise.all(workers);

  // Background translation for the remaining subtitles in chunks of 150
  if (subtitles.length > 150) {
    (async () => {
      let chunkStart = 150;
      const chunkSize = 150;
      while (chunkStart < subtitles.length && extensionContextValid) {
        const chunkEnd = Math.min(subtitles.length, chunkStart + chunkSize);
        console.log(`[BiliSub] Background translating next chunk: ${chunkStart} to ${chunkEnd}`);
        currentIndex = chunkStart;
        
        const bgWorkers = [];
        for (let i = 0; i < Math.min(concurrency, chunkEnd - chunkStart); i++) {
          bgWorkers.push(worker(chunkEnd));
        }
        await Promise.all(bgWorkers);
        
        chunkStart += chunkSize;
        // 800ms delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      if (extensionContextValid) {
        console.log('[BiliSub] Background translation of the entire track completed!');
      } else {
        console.log('[BiliSub] Background translation stopped due to invalidated extension context.');
      }
    })();
  }

  console.log('[BiliSub] Network batch translation completed for first', limit, 'items!');
  return translatedList;
}

// Multi-Fallback Translation Engine (Routed through background worker to bypass CORS/CSP)
async function translateText(text, targetLang, retries = 3) {
  console.log(`[BiliSub] translateText requested for: "${text}" with targetLang: "${targetLang}"`);
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (!extensionContextValid) return null;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'translateText',
        text: text,
        targetLang: targetLang
      });
      console.log('[BiliSub] Translation response received:', response);
      if (response?.translation) return response.translation;
      return null;
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        extensionContextValid = false;
        console.error('[BiliSub] Extension context invalidated.');
        return null;
      }
      const isConnError = err.message?.includes('Could not establish connection') ||
                          err.message?.includes('connection') ||
                          err.message?.includes('timeout');
      if (isConnError && attempt < retries) {
        console.warn(`[BiliSub] SW not ready, retry ${attempt + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.error('Translation message error:', err);
      return null;
    }
  }
  return null;
}

// Background Translation Loop (For Pre-translating timeline fallback)
async function startTranslationLoop() {
  if (isTranslationLoopRunning) return;
  isTranslationLoopRunning = true;

  while (extensionContextValid) {
    if (!settings.autoTranslate || !allSubtitles.length) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    const currentTime = videoElement ? videoElement.currentTime : 0;
    let activeIdx = allSubtitles.findIndex(s => s.to >= currentTime);
    if (activeIdx === -1) activeIdx = 0;

    const toTranslate = [];
    function canTranslate(text) {
      if (translationCache.has(text) || pendingTranslations.has(text)) return false;
      const failCount = failedTranslations.get(text) || 0;
      return failCount <= 3;
    }

    for (let i = activeIdx; i < Math.min(activeIdx + 20, allSubtitles.length); i++) {
      const text = allSubtitles[i].content;
      if (canTranslate(text)) toTranslate.push(text);
    }

    if (toTranslate.length === 0) {
      for (let i = 0; i < allSubtitles.length; i++) {
        const text = allSubtitles[i].content;
        if (canTranslate(text)) {
          toTranslate.push(text);
          if (toTranslate.length >= 3) break;
        }
      }
    }

    if (toTranslate.length === 0) {
      preTranslationDone = true;
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    preTranslationDone = false;
    const batch = toTranslate.slice(0, 3);
    batch.forEach(t => pendingTranslations.add(t));
    let hasError = false;

    await Promise.all(batch.map(async (text) => {
      let result = await translateText(text, settings.targetLang);

      if (result && result !== text) {
        translationCache.set(text, result);
        failedTranslations.delete(text);
      } else {
        hasError = true;
        failedTranslations.set(text, (failedTranslations.get(text) || 0) + 1);
      }
      pendingTranslations.delete(text);
    }));

    if (hasError) {
      await new Promise(r => setTimeout(r, 3000));
    } else {
      await new Promise(r => setTimeout(r, 600));
    }
  }
}

// Helper: Ekstrak teks original bersih (tanpa elemen terjemahan kita)
function getCleanOriginalText(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  const customGrp = clone.querySelector('.custom-bili-subtitle-group');
  if (customGrp) customGrp.remove();
  // Gunakan innerText untuk mendeteksi line break (<br>) bawaan Bilibili
  return clone.innerText || clone.textContent || '';
}

// Initializer
function initialize() {
  setupMutationObserver();
  setupVideoTimeSync();
  extractSubtitleData();
  setInterval(extractSubtitleData, 5000);

  // Proactively try to auto-enable subtitles periodically until successful
  setInterval(() => {
    if (settings.autoTranslate && !hasAutoEnabledSubtitles) {
      autoEnableBilibiliSubtitles();
    }
  }, 1000);

  updateSubtitleStyles();
  initHoverTranslation();
}

// Extraction fallback via Bilibili player public API
async function extractSubtitleData() {
  if (allSubtitles.length > 0) return;

  try {
    const match = location.pathname.match(/\/video\/(BV\w+)/);
    if (!match) return;

    const bvid = match[1];
    const infoResp = await fetch(`https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=`, { credentials: 'include' });
    const infoData = await infoResp.json();

    const subtitleList = infoData?.data?.subtitle?.subtitles;
    if (!subtitleList || !subtitleList.length) return;

    let zhSub = subtitleList.find(s => s.lan === 'zh-CN' || s.lan === 'ai-zh' || s.lan === 'ai-cn');
    if (!zhSub) {
      zhSub = subtitleList.find(s => s.lan === 'ai-en' || s.lan.startsWith('en'));
    }
    zhSub = zhSub || subtitleList[0];
    if (!zhSub || !zhSub.subtitle_url) return;

    let subUrl = zhSub.subtitle_url;
    if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl;

    const subResp = await fetch(subUrl);
    const subData = await subResp.json();

    if (subData?.body?.length) {
      allSubtitles = subData.body.map(item => ({
        from: item.from,
        to: item.to,
        content: item.content.replace(/\\n/g, ' ')
      }));
      console.log(`[BiliSub] Safely loaded ${allSubtitles.length} subtitle lines from official API!`);
      startTranslationLoop();
    }
  } catch (e) {}
}

