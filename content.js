// 

// =====================================================
// Bilibili & YouTube Double Subtitles - Hybrid Architecture
// Inspired by Immersive Translate for high-performance and zero lag
// =====================================================

let settings = {
  targetLang: 'id',
  autoTranslate: true,
  fontSize: '16',
  subtitleMode: 'dual',
  bgOpacity: '60'
};

// State
let allSubtitles = [];
const translationCache = new Map();
const pendingTranslations = new Set();
const failedTranslations = new Map();
let lastOriginalText = '';
let preTranslationDone = false;
let videoElement = null;
let isTranslationLoopRunning = false;
let hasAutoEnabledSubtitles = false;
let lastUrl = window.location.href;

function checkUrlChange() {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    hasAutoEnabledSubtitles = false;
    allSubtitles = [];
    translationCache.clear();
    failedTranslations.clear();
  }
}

let globalDraggedOffset = null; // Stores { left, top } relative to offsetParent

function makeElementDraggable(el) {
  if (!el || el.dataset.draggableInitialized) {
    if (globalDraggedOffset) {
      applyDraggedPosition(el);
    }
    return;
  }
  el.dataset.draggableInitialized = 'true';

  let posX = 0, posY = 0, mouseX = 0, mouseY = 0;
  let isDragging = false;

  el.style.setProperty('cursor', 'grab', 'important');
  el.style.setProperty('user-select', 'none', 'important');

  if (globalDraggedOffset) {
    applyDraggedPosition(el);
  }

  el.addEventListener('mousedown', dragMouseDown);

  function dragMouseDown(e) {
    if (e.button !== 0) return; // Left click only
    if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || e.target.closest('a') || e.target.closest('button')) {
      return;
    }
    e.preventDefault();
    el.style.setProperty('cursor', 'grabbing', 'important');
    isDragging = true;

    mouseX = e.clientX;
    mouseY = e.clientY;

    document.addEventListener('mousemove', elementDrag);
    document.addEventListener('mouseup', closeDragElement);
  }

  function elementDrag(e) {
    if (!isDragging) return;
    e.preventDefault();

    const deltaX = e.clientX - mouseX;
    const deltaY = e.clientY - mouseY;
    mouseX = e.clientX;
    mouseY = e.clientY;

    const rect = el.getBoundingClientRect();
    const parentRect = el.offsetParent ? el.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
    
    let leftVal = rect.left - parentRect.left + deltaX;
    let topVal = rect.top - parentRect.top + deltaY;

    globalDraggedOffset = { left: leftVal, top: topVal };
    applyDraggedPosition(el);
  }

  function closeDragElement() {
    isDragging = false;
    el.style.setProperty('cursor', 'grab', 'important');
    document.removeEventListener('mousemove', elementDrag);
    document.removeEventListener('mouseup', closeDragElement);
  }

  function applyDraggedPosition(target) {
    if (!globalDraggedOffset) return;
    target.style.setProperty('position', 'absolute', 'important');
    target.style.setProperty('left', globalDraggedOffset.left + 'px', 'important');
    target.style.setProperty('top', globalDraggedOffset.top + 'px', 'important');
    target.style.setProperty('bottom', 'auto', 'important');
    target.style.setProperty('right', 'auto', 'important');
    target.style.setProperty('transform', 'none', 'important');
  }

  const styleObserver = new MutationObserver(() => {
    if (isDragging) return;
    if (globalDraggedOffset) {
      styleObserver.disconnect();
      applyDraggedPosition(el);
      styleObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
    }
  });

  styleObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
}

let isAutoEnabling = false;

function autoEnableBilibiliSubtitles() {
  if (hasAutoEnabledSubtitles || isAutoEnabling) return;

  const subtitleBtn = document.querySelector('.bpx-player-ctrl-subtitle') || 
                      document.querySelector('.bili-player-video-btn-subtitle') || 
                      document.querySelector('.bpx-player-ctrl-subtitle-btn');
  if (!subtitleBtn) return;

  const activeTextEl = document.querySelector('.bili-subtitle-x-subtitle-panel-text');
  if (activeTextEl && activeTextEl.textContent?.trim()) {
    hasAutoEnabledSubtitles = true;
    console.log('[BiliSub] Subtitles are already active and showing text.');
    return;
  }

  isAutoEnabling = true;
  console.log('[BiliSub] Attempting to auto-enable subtitles...');

  // Mouse enter to trigger dropdown population
  subtitleBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

  setTimeout(() => {
    const subtitleItems = document.querySelectorAll('.bpx-player-ctrl-subtitle-language-item');
    if (subtitleItems.length === 0) {
      subtitleBtn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      isAutoEnabling = false;
      return;
    }

    let targetItem = document.querySelector('.bpx-player-ctrl-subtitle-language-item[data-lan="ai-zh"]');
    
    if (!targetItem) {
      targetItem = Array.from(subtitleItems).find(item => {
        const lan = (item.getAttribute('data-lan') || '').toLowerCase();
        const text = (item.textContent || '').toLowerCase();
        return lan.includes('zh') || lan.includes('chi') || text.includes('中文') || text.includes('汉语');
      });
    }

    if (!targetItem) {
      targetItem = Array.from(subtitleItems).find(item => {
        const lan = (item.getAttribute('data-lan') || '').toLowerCase();
        const text = (item.textContent || '').toLowerCase();
        return lan && lan !== 'off' && lan !== 'none' && !text.includes('关闭') && !text.includes('off');
      });
    }

    if (targetItem) {
      const isAlreadyActive = targetItem.classList.contains('bpx-state-active') || 
                              targetItem.classList.contains('active');
      
      if (isAlreadyActive) {
        console.log('[BiliSub] Target track is already active:', targetItem.getAttribute('data-lan'));
        hasAutoEnabledSubtitles = true;
      } else {
        console.log('[BiliSub] Selecting subtitle track:', targetItem.getAttribute('data-lan'));
        targetItem.click();
        hasAutoEnabledSubtitles = true;
      }
    } else {
      const isInactive = !subtitleBtn.classList.contains('bpx-state-active') && 
                         !subtitleBtn.classList.contains('active') && 
                         subtitleBtn.getAttribute('aria-pressed') !== 'true';
      if (isInactive) {
        console.log('[BiliSub] No tracks found, clicking main subtitle button');
        subtitleBtn.click();
        hasAutoEnabledSubtitles = true;
      }
    }

    subtitleBtn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    isAutoEnabling = false;
  }, 250);
}

// Load settings
chrome.storage.sync.get(
  {
    targetLang: 'id',
    autoTranslate: true,
    fontSize: '16',
    subtitleMode: 'dual',
    bgOpacity: '60'
  },
  (items) => {
    settings = items;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
    } else {
      initialize();
    }
  }
);

// Listen for settings changes
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'settingsUpdated') {
    const langChanged = settings.targetLang !== message.settings.targetLang;
    settings = message.settings;
    if (langChanged) {
      translationCache.clear();
      failedTranslations.clear();
      preTranslationDone = false;
    }
    updateSubtitleStyles();
  }
});

// Listen for network subtitle events from interceptor.js (main world)
window.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'TRANSLATE_BILIBILI_SUBTITLES') {
    const reqId = event.data.reqId;
    const originalSubtitles = event.data.body;
    
    allSubtitles = originalSubtitles.map(item => ({
      from: item.from,
      to: item.to,
      content: item.content.replace(/\\n/g, ' ')
    }));
    
    const translatedSubtitles = await translateSubtitleTrack(originalSubtitles);
    window.postMessage({ type: 'BILIBILI_SUBTITLES_TRANSLATED', reqId: reqId, subtitles: translatedSubtitles }, '*');
  }
});

// Track batch translation
async function translateSubtitleTrack(subtitles) {
  if (!settings.autoTranslate) {
    return subtitles;
  }

  console.log('[BiliSub] Network batch translating entire track of size:', subtitles.length);

  const translatedList = JSON.parse(JSON.stringify(subtitles));
  const batchSize = 10;
  
  const translateBatch = async (startIndex) => {
    const batch = subtitles.slice(startIndex, startIndex + batchSize);
    const promises = batch.map(async (sub, index) => {
      let originalText = sub.content?.trim();
      if (!originalText) return;

      originalText = originalText.replace(/\|/g, '');

      if (translationCache.has(originalText)) {
        const transText = translationCache.get(originalText);
        const finalContent = settings.subtitleMode === 'translationOnly' 
          ? transText 
          : `${originalText}\n${transText}`;
        translatedList[startIndex + index].content = finalContent;
        return;
      }

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'translateText',
          text: originalText,
          targetLang: settings.targetLang
        });
        if (response && response.translation) {
          const transText = response.translation;
          translationCache.set(originalText, transText);
          
          const finalContent = settings.subtitleMode === 'translationOnly' 
            ? transText 
            : `${originalText}\n${transText}`;
          translatedList[startIndex + index].content = finalContent;
        }
      } catch (err) {
        console.error('Batch translation error:', err);
      }
    });
    await Promise.all(promises);
  };

  const batchPromises = [];
  for (let i = 0; i < subtitles.length; i += batchSize) {
    batchPromises.push(translateBatch(i));
  }
  await Promise.all(batchPromises);

  console.log('[BiliSub] Network batch translation completed!');
  return translatedList;
}

// Multi-Fallback Translation Engine
async function translateText(text, targetLang) {
  // 1. Try Google Translate (Primary)
  try {
    const sourceLang = /[\u4e00-\u9fa5]/.test(text) ? 'zh' : 'auto';
    const resp = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`,
      { cache: 'no-store' }
    );
    if (resp.ok) {
      const data = await resp.json();
      const result = data?.[0]?.map(x => x[0]).join('');
      if (result && !result.includes('302 Moved') && !result.includes('sorry/index')) {
        return result;
      }
    }
  } catch (e) {
    console.error('Google Translate primary failed, trying fallbacks...', e);
  }

  // 2. Try Lingva Translate API (Backup 1)
  try {
    const sourceLang = /[\u4e00-\u9fa5]/.test(text) ? 'zh' : 'auto';
    const resp = await fetch(
      `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(text)}`,
      { cache: 'no-store' }
    );
    if (resp.ok) {
      const data = await resp.json();
      const result = data?.translation;
      if (result) {
        return result;
      }
    }
  } catch (e) {
    console.error('Lingva backup failed...', e);
  }

  // 3. Try MyMemory Translation API (Backup 2)
  try {
    const sourceLang = /[\u4e00-\u9fa5]/.test(text) ? 'zh' : 'auto';
    const resp = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`,
      { cache: 'no-store' }
    );
    if (resp.ok) {
      const data = await resp.json();
      const result = data?.responseData?.translatedText;
      if (result) {
        return result;
      }
    }
  } catch (e) {
    console.error('MyMemory backup failed...', e);
  }

  // 4. Try Google Translate Mobile API (Backup 3)
  try {
    const sourceLang = /[\u4e00-\u9fa5]/.test(text) ? 'zh' : 'auto';
    const resp = await fetch(
      `https://translate.google.com/translate_a/single?client=at&sl=${sourceLang}&tl=${targetLang}&q=${encodeURIComponent(text)}`,
      { cache: 'no-store' }
    );
    if (resp.ok) {
      const data = await resp.json();
      const result = data?.sentences?.[0]?.trans || (Array.isArray(data) ? data[0] : null);
      if (result && !result.includes('302 Moved')) {
        return result;
      }
    }
  } catch (e) {
    console.error('Google Translate mobile backup failed...', e);
  }

  return null;
}

// Background Translation Loop (For Pre-translating timeline fallback)
async function startTranslationLoop() {
  if (isTranslationLoopRunning) return;
  isTranslationLoopRunning = true;

  while (true) {
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

      if (result) {
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
  return clone.textContent || '';
}

// Initializer
function initialize() {
  const isYouTube = window.location.hostname.includes('youtube.com');
  if (isYouTube) {
    setupYouTubeObserver();
  } else {
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
  }
  updateSubtitleStyles();
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

    const zhSub = subtitleList.find(s => s.lan === 'zh-CN' || s.lan === 'ai-zh') || subtitleList[0];
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

function setupVideoTimeSync() {
  function findVideo() {
    videoElement = document.querySelector('video, bwp-video');
    if (videoElement) {
      videoElement.addEventListener('timeupdate', onTimeUpdate);
    } else {
      setTimeout(findVideo, 1000);
    }
  }
  findVideo();
}

function onTimeUpdate() {
  checkUrlChange();
  if (settings.autoTranslate && !hasAutoEnabledSubtitles) {
    autoEnableBilibiliSubtitles();
  }
  if (!settings.autoTranslate || !allSubtitles.length) return;

  const currentTime = videoElement.currentTime;
  const activeSub = allSubtitles.find(s => currentTime >= s.from && currentTime <= s.to);

  const subtitlePanel = document.querySelector('.bili-subtitle-x-subtitle-panel');
  if (!subtitlePanel) return;

  const origTextEl = subtitlePanel.querySelector('.bili-subtitle-x-subtitle-panel-text');
  
  if (!origTextEl || !origTextEl.textContent?.trim() || origTextEl.style.display === 'none') {
    const isHiddenByUs = origTextEl && origTextEl.classList.contains('hide-subtitle');
    if (!origTextEl || !origTextEl.textContent?.trim() || (origTextEl.style.display === 'none' && !isHiddenByUs)) {
      const existing = subtitlePanel.querySelector('.translated-subtitle');
      if (existing) {
        existing.textContent = '';
        existing.classList.add('hide');
      }
      return;
    }
  }

  if (!activeSub) {
    const existing = subtitlePanel.querySelector('.translated-subtitle');
    if (existing) {
      existing.textContent = '';
      existing.classList.add('hide');
    }
    return;
  }

  const translated = translationCache.get(activeSub.content);
  if (!translated) return;

  if (origTextEl) {
    const rawText = getCleanOriginalText(origTextEl);
    if (rawText.includes('\n') || !/[\u4e00-\u9fa5]/.test(rawText.replace(/\|/g, '').trim())) {
      const existing = origTextEl.querySelector('.translated-subtitle');
      if (existing) {
        existing.textContent = '';
        existing.classList.add('hide');
      }
      return;
    }
  }

  makeElementDraggable(subtitlePanel);
  injectTranslatedSubtitle(translated, subtitlePanel);
}

// Bilibili observer setup
function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    checkUrlChange();
    if (settings.autoTranslate && !hasAutoEnabledSubtitles) {
      autoEnableBilibiliSubtitles();
    }

    let hasValidMutation = false;
    mutations.forEach((mutation) => {
      if (mutation.target && (
        (mutation.target.classList && mutation.target.classList.contains('translated-subtitle')) ||
        (mutation.target.parentElement && mutation.target.parentElement.classList.contains('translated-subtitle'))
      )) {
        return;
      }
      if (mutation.type === 'childList') {
        const addedOnlyTranslations = Array.from(mutation.addedNodes).every(node => node.classList && node.classList.contains('translated-subtitle'));
        const removedOnlyTranslations = Array.from(mutation.removedNodes).every(node => node.classList && node.classList.contains('translated-subtitle'));
        if (addedOnlyTranslations && removedOnlyTranslations) {
          return;
        }
      }
      hasValidMutation = true;
    });

    if (!hasValidMutation) return;

    const subtitlePanel = document.querySelector('.bili-subtitle-x-subtitle-panel');
    if (subtitlePanel) {
      makeElementDraggable(subtitlePanel);
      applySubtitleMode();
      handleSubtitleUpdate(subtitlePanel);
    }
  });

  function startObserving() {
    const container = document.querySelector('.bpx-player-subtitle-wrap');
    if (container) {
      observer.observe(container, { childList: true, subtree: true, characterData: true });
    } else {
      setTimeout(startObserving, 500);
    }
  }
  startObserving();
}

async function handleSubtitleUpdate(subtitlePanel) {
  if (!settings.autoTranslate) return;
  makeElementDraggable(subtitlePanel);

  const originalTextEl = subtitlePanel.querySelector('.bili-subtitle-x-subtitle-panel-text');
  if (!originalTextEl) return;

  const rawText = getCleanOriginalText(originalTextEl);
  if (rawText.includes('\n') || !/[\u4e00-\u9fa5]/.test(rawText.replace(/\|/g, '').trim())) {
    const existing = originalTextEl.querySelector('.translated-subtitle');
    if (existing) {
      existing.textContent = '';
      existing.classList.add('hide');
    }
    return;
  }

  const originalText = rawText.replace(/\|/g, '').trim();
  if (!originalText || !/[\u4e00-\u9fa5]/.test(originalText)) {
    const el = originalTextEl.querySelector('.translated-subtitle');
    if (el) {
      el.textContent = '';
      el.classList.add('hide');
    }
    if (!originalText) {
      lastOriginalText = '';
    }
    return;
  }

  if (originalText === lastOriginalText) return;
  lastOriginalText = originalText;

  if (translationCache.has(originalText)) {
    injectTranslatedSubtitle(translationCache.get(originalText), subtitlePanel);
    return;
  }

  const el = originalTextEl.querySelector('.translated-subtitle');
  if (el) {
    el.textContent = '';
    el.classList.add('hide');
  }

  if (pendingTranslations.has(originalText)) return;
  pendingTranslations.add(originalText);

  let translated = await translateText(originalText, settings.targetLang);
  
  pendingTranslations.delete(originalText);
  if (!translated) return;
  
  translationCache.set(originalText, translated);

  const currentTextEl = subtitlePanel.querySelector('.bili-subtitle-x-subtitle-panel-text');
  const currentText = getCleanOriginalText(currentTextEl).replace(/\|/g, '').trim();
  if (currentText === originalText) {
    injectTranslatedSubtitle(translated, subtitlePanel);
  }
}

function injectTranslatedSubtitle(translatedText, subtitlePanel) {
  const originalTextEl = subtitlePanel.querySelector('.bili-subtitle-x-subtitle-panel-text');
  if (!originalTextEl) return;

  // PERBAIKAN DINAMIS: Pastikan originalTextEl bertindak sebagai positioning context (jika static)
  const computedStyle = window.getComputedStyle(originalTextEl);
  if (computedStyle.position === 'static') {
    originalTextEl.style.setProperty('position', 'relative', 'important');
  }
  
  // PERBAIKAN DINAMIS UTAMA: Cegah Bilibili memotong child element dengan overflow:hidden bawaannya
  originalTextEl.style.setProperty('overflow', 'visible', 'important');

  let customGroup = originalTextEl.querySelector('.custom-bili-subtitle-group');
  if (!customGroup) {
    customGroup = document.createElement('div');
    customGroup.className = 'custom-bili-subtitle-group';
    originalTextEl.appendChild(customGroup);
  }

  let el = customGroup.querySelector('.translated-subtitle');
  if (!el) {
    el = document.createElement('div');
    el.className = 'translated-subtitle';
    customGroup.appendChild(el);
  }

  if (el.textContent !== translatedText) {
    el.textContent = translatedText;
  }
  el.classList.remove('hide');
}

// YouTube observer setup
function setupYouTubeObserver() {
  const observer = new MutationObserver((mutations) => {
    let hasValidMutation = false;
    mutations.forEach((mutation) => {
      if (mutation.target && (
        (mutation.target.classList && mutation.target.classList.contains('translated-subtitle')) ||
        (mutation.target.parentElement && mutation.target.parentElement.classList.contains('translated-subtitle'))
      )) {
        return;
      }
      if (mutation.type === 'childList') {
        const addedOnlyTranslations = Array.from(mutation.addedNodes).every(node => node.classList && node.classList.contains('translated-subtitle'));
        const removedOnlyTranslations = Array.from(mutation.removedNodes).every(node => node.classList && node.classList.contains('translated-subtitle'));
        if (addedOnlyTranslations && removedOnlyTranslations) {
          return;
        }
      }
      hasValidMutation = true;
    });

    if (!hasValidMutation) return;

    if (settings.autoTranslate) {
      const captionWindow = document.querySelector('.ytp-caption-window-container');
      if (captionWindow) {
        handleYouTubeSubtitleUpdate(captionWindow);
      }
    } else {
      applyYouTubeSubtitleMode();
    }
  });

  function startObserving() {
    const target = document.querySelector('#movie_player');
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    } else {
      setTimeout(startObserving, 500);
    }
  }
  startObserving();
}

async function handleYouTubeSubtitleUpdate(captionContainer) {
  if (!settings.autoTranslate) return;

  const captionWindow = captionContainer.querySelector('.caption-window');
  if (captionWindow) {
    makeElementDraggable(captionWindow);
  }
  if (!captionWindow || captionWindow.offsetWidth === 0) {
    const existing = captionContainer.querySelector('.translated-subtitle');
    if (existing) {
      existing.textContent = '';
      existing.classList.add('hide');
    }
    return;
  }

  const segments = Array.from(captionWindow.querySelectorAll('.ytp-caption-segment'));
  if (segments.length === 0) {
    const existing = captionWindow.querySelector('.translated-subtitle');
    if (existing) {
      existing.textContent = '';
      existing.classList.add('hide');
    }
    return;
  }

  const originalText = segments.map(s => s.textContent.replace(/\|/g, '').trim()).join(' ');
  if (!originalText) return;

  applyYouTubeSubtitleMode();

  if (translationCache.has(originalText)) {
    injectYouTubeTranslatedSubtitle(translationCache.get(originalText), captionWindow);
    return;
  }

  if (pendingTranslations.has(originalText)) return;
  pendingTranslations.add(originalText);

  let translated = await translateText(originalText, settings.targetLang);
  
  pendingTranslations.delete(originalText);
  if (!translated) return;

  translationCache.set(originalText, translated);
  injectYouTubeTranslatedSubtitle(translated, captionWindow);
}

function injectYouTubeTranslatedSubtitle(translatedText, captionWindow) {
  let el = captionWindow.querySelector('.translated-subtitle');
  if (!el) {
    el = document.createElement('div');
    el.className = 'translated-subtitle';
    captionWindow.appendChild(el);
  }

  if (el.textContent !== translatedText) {
    el.textContent = translatedText;
  }
  el.classList.remove('hide');
}

function applyYouTubeSubtitleMode() {
  const segments = document.querySelectorAll('.ytp-caption-segment');
  const isTranslationOnly = settings.autoTranslate && settings.subtitleMode === 'translationOnly';
  segments.forEach(seg => {
    if (isTranslationOnly) {
      seg.style.setProperty('display', 'none', 'important');
    } else {
      seg.style.removeProperty('display');
    }
  });

  const captionWindow = document.querySelector('.ytp-caption-window-container .caption-window');
  if (captionWindow) {
    makeElementDraggable(captionWindow);
  }
}

// Visibility modes for both platforms
function applySubtitleMode() {
  const isTranslationOnly = settings.autoTranslate && settings.subtitleMode === 'translationOnly';
  
  const origTexts = document.querySelectorAll('.bili-subtitle-x-subtitle-panel-text');
  origTexts.forEach(origText => {
    const text = getCleanOriginalText(origText);
    
    if (isTranslationOnly) {
      if (text.includes('\n')) { // Network fallback (fallback if DOM translation skips)
        if (!origText.dataset.originalDualText) {
          origText.dataset.originalDualText = text;
        }
        const parts = text.split('\n');
        origText.textContent = parts[1] || parts[0];
        origText.classList.remove('hide-subtitle');
      } else {
        const hasChinese = /[\u4e00-\u9fa5]/.test(text);
        if (hasChinese) {
          origText.classList.add('hide-subtitle');
        } else {
          origText.classList.remove('hide-subtitle');
        }
      }
    } else {
      if (origText.dataset.originalDualText) {
        origText.textContent = origText.dataset.originalDualText;
        delete origText.dataset.originalDualText;
      }
      origText.classList.remove('hide-subtitle');
    }
  });

  applyYouTubeSubtitleMode();
}

// Styling Control
function updateSubtitleStyles() {
  let style = document.querySelector('style[data-subtitle-styles]');
  if (style) {
    style.remove();
  }

  if (!settings.autoTranslate) {
    const existingBiliTranslation = document.querySelectorAll('.custom-bili-subtitle-group');
    existingBiliTranslation.forEach(el => el.remove());
    const existingYtTranslation = document.querySelector('.ytp-caption-window-container .translated-subtitle');
    if (existingYtTranslation) {
      existingYtTranslation.remove();
    }
    applySubtitleMode();
    return;
  }

  style = document.createElement('style');
  style.setAttribute('data-subtitle-styles', '');
  document.head.appendChild(style);

  let fontSizePx = '16px';
  if (settings.fontSize === 'small') fontSizePx = '12px';
  else if (settings.fontSize === 'medium') fontSizePx = '18px';
  else if (settings.fontSize === 'large') fontSizePx = '22px';
  else if (settings.fontSize) {
    fontSizePx = settings.fontSize + 'px';
  }

  let opacity = '0.6';
  if (settings.bgOpacity !== undefined) {
    opacity = (parseFloat(settings.bgOpacity) / 100).toString();
  }

  style.textContent = `
    /* PERBAIKAN: Hanya paksa overflow visible agar teks tidak terpotong */
    html body .bpx-player-video-area,
    html body .bpx-player-video-wrap {
      overflow: visible !important;
    }

    /* Hanya berikan z-index tinggi pada container subtitle agar tidak menutupi kontrol */
    html body .bpx-player-subtitle-wrap,
    html body .bili-subtitle-x-subtitle-panel,
    html body .bili-subtitle-x-subtitle-panel-text,
    html body .bili-subtitle,
    html body .bilibili-player-video-subtitle {
      overflow: visible !important;
      z-index: 2147483647 !important;
    }

    html body .bpx-player-subtitle-wrap,
    html body .bili-subtitle-x-subtitle-panel,
    html body .bili-subtitle,
    html body .bilibili-player-video-subtitle {
      bottom: 12% !important; 
      height: auto !important;
      max-height: none !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-end !important;
      pointer-events: none !important; /* Cegah menutupi klik ke bar kontrol */
    }
    
    html body .bili-subtitle-x-subtitle-panel-text, 
    html body .translated-subtitle {
      pointer-events: auto !important; /* Tapi izinkan interaksi (drag/select) pada teksnya saja */
      word-wrap: break-word !important;
    }
    
    html body .bili-subtitle-x-subtitle-panel-text {
      /* Hanya tambahkan styling visual untuk kotak aslinya, TANPA reset position */
      background-color: rgba(0, 0, 0, ${opacity}) !important;
      color: white !important;
      padding: 6px 12px !important;
      border-radius: 8px !important; 
      line-height: 1.4 !important;
      text-align: center !important;
      white-space: pre-wrap !important;
      border: none !important;
      font-size: ${fontSizePx} !important;
      display: inline-block !important; /* Agar lebarnya membungkus kotak */
      z-index: 999999 !important;
    }
    
    /* Wadah kustom disematkan secara absolut 100% tepat di sisi bawah teks asli */
    html body .custom-bili-subtitle-group {
      position: absolute !important;
      top: calc(100% + 4px) !important; /* Jarak 4px dari kotak aslinya */
      left: 50% !important;
      transform: translateX(-50%) !important; /* Menengahkannya mengikuti teks asli */
      display: flex !important;
      justify-content: center !important;
      text-align: center !important;
      margin: 0 !important;
      width: max-content !important;
      max-width: 90vw !important;
      pointer-events: auto !important;
      z-index: 2147483647 !important;
    }
    
    html body .custom-bili-subtitle-group .translated-subtitle {
      display: inline-block !important;
      font-size: ${fontSizePx} !important;
      color: white !important;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.9) !important;
      background: rgba(0, 0, 0, ${opacity}) !important;
      padding: 6px 12px !important;
      border-radius: 8px !important; 
      margin: 0 !important;
      line-height: 1.4 !important;
      border: none !important;
      white-space: pre-wrap !important;
    }
    
    /* Untuk mode "Translation Only": Menyembunyikan parent tanpa menghilangkan child (terjemahan) */
    html body .bili-subtitle-x-subtitle-panel-text.hide-subtitle {
      background-color: transparent !important;
      color: transparent !important;
      font-size: 0 !important;
      padding: 0 !important;
      min-height: 0 !important;
      height: 0 !important;
    }
    html body .bili-subtitle-x-subtitle-panel-text.hide-subtitle .custom-bili-subtitle-group {
      top: 0 !important; /* Naikan posisi terjemahan karena aslinya dihilangkan */
    }

    html body .ytp-caption-window-container .translated-subtitle {
      display: block !important;
      text-align: center !important;
      font-size: ${fontSizePx} !important;
      color: #eaeaea !important;
      background: rgba(0, 0, 0, ${opacity}) !important;
      padding: 4px 8px !important;
      border-radius: 8px !important;
      margin-top: 12px !important;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.9) !important;
      z-index: 999999 !important;
      position: relative !important;
    }
    .translated-subtitle.hide {
      display: none !important;
    }
    .hide-subtitle {
      /* display none di-handle spesifik di bilibili untuk cegah child hilang */
    }
  `;

  applySubtitleMode();
}