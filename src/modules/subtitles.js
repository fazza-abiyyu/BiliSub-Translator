// BiliSub content script module: Subtitle extraction, sync, rendering, styles
// Content scripts share one isolated scope, so files are loaded in
// manifest order (see manifest.json content_scripts).

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
  if (rawText.includes('\n') || !rawText.replace(/\|/g, '').trim()) {
    const existing = originalTextEl.querySelector('.translated-subtitle');
    if (existing) {
      existing.textContent = '';
      existing.classList.add('hide');
    }
    return;
  }

  const originalText = rawText.replace(/\|/g, '').trim();
  if (!originalText) {
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
  if (!translated || translated === originalText) return;
  
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

// Visibility modes
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
    applySubtitleMode();
    return;
  }

  style = document.createElement('style');
  style.setAttribute('data-subtitle-styles', '');
  (document.head || document.documentElement).appendChild(style);

  let fontSizePx = 'clamp(11px, 2.8cqw, 24px)';
  if (settings.fontSize === 'small') {
    fontSizePx = 'clamp(9px, 2.2cqw, 16px)';
  } else if (settings.fontSize === 'medium') {
    fontSizePx = 'clamp(11px, 2.8cqw, 24px)';
  } else if (settings.fontSize === 'large') {
    fontSizePx = 'clamp(14px, 3.8cqw, 36px)';
  } else if (settings.fontSize) {
    // Fallback if settings.fontSize is numeric
    const fs = parseFloat(settings.fontSize) || 16;
    const minFs = Math.max(9, Math.round(fs * 0.7));
    const maxFs = Math.round(fs * 1.5);
    const cqwVal = (fs / 640) * 100; // base on 640px player width
    fontSizePx = `clamp(${minFs}px, ${cqwVal}cqw, ${maxFs}px)`;
  }

  let opacity = '0.6';
  if (settings.bgOpacity !== undefined) {
    opacity = (parseFloat(settings.bgOpacity) / 100).toString();
  }

  style.textContent = `
    /* Definisi Container Query untuk scaling font secara responsif */
    .bpx-player-container, 
    .bili-video-player, 
    #movie_player, 
    .ytp-caption-window-container {
      container-type: inline-size !important;
      container-name: video-player !important;
    }

    /* PERBAIKAN: Hanya paksa overflow agar tidak terpotong, kembalikan posisi ke aslinya */
    html body .bpx-player-video-area label,
    html body .bpx-player-video-wrap {
      overflow: visible !important;
    }

    /* Gunakan z-index yang tinggi tapi terbatas di dalam konteks player saja */
    /* Pastikan subtitle tidak keluar dari batas video player (overflow: hidden pada root player) */
    html body .bpx-player-subtitle-wrap,
    html body .bili-subtitle-x-subtitle-panel,
    html body .bili-subtitle-x-subtitle-panel-text,
    html body .bili-subtitle,
    html body .bilibili-player-video-subtitle {
      overflow: visible !important;
      z-index: 1000 !important; /* Gunakan nilai yang masuk akal agar tidak menembus header situs */
      pointer-events: none !important;
    }

    /* Pastikan subtitle tidak terpotong oleh parent container */
    .bpx-player-primary-area, .bili-video-player {
      position: relative !important;
      overflow: visible !important; 
    }

    /* Pastikan subtitle tetap terlihat di mode mini-player (小窗模式) Bilibili */
    .bpx-player-container[data-screen="mini"] .bili-subtitle-x-subtitle-panel {
      display: block !important;
      visibility: visible !important;
    }

    /* Geser posisi default sedikit ke atas agar tidak menutupi control bar */
    .bpx-player-container:hover .bili-subtitle-x-subtitle-panel:not([data-has-been-manual-dragged="true"]),
    .bili-video-player:hover .bili-subtitle-x-subtitle-panel:not([data-has-been-manual-dragged="true"]) {
      transform: translateY(-40px) !important;
    }
    /* Saat kontrol bar tersembunyi (tidak hover), geser sedikit lebih tinggi */
    .bpx-player-container:not(:hover) .bili-subtitle-x-subtitle-panel:not([data-has-been-manual-dragged="true"]),
    .bili-video-player:not(:hover) .bili-subtitle-x-subtitle-panel:not([data-has-been-manual-dragged="true"]) {
      transform: translateY(-60px) !important;
    }

    #movie_player:hover .caption-window:not([data-has-been-manual-dragged="true"]),
    #movie_player:hover .ytp-caption-window-rollup:not([data-has-been-manual-dragged="true"]),
    #movie_player:hover .ytp-caption-window:not([data-has-been-manual-dragged="true"]) {
      transform: translateY(-40px) !important;
    }
    #movie_player:not(:hover) .caption-window:not([data-has-been-manual-dragged="true"]),
    #movie_player:not(:hover) .ytp-caption-window-rollup:not([data-has-been-manual-dragged="true"]),
    #movie_player:not(:hover) .ytp-caption-window:not([data-has-been-manual-dragged="true"]) {
      transform: translateY(-75px) !important;
    }

    /* MATIKAN paksaan bottom persentase yang bikin dia naik ke atas */
    /* Biarkan posisi asli dari Bilibili yang bekerja */
    
    html body .bili-subtitle-x-subtitle-panel-text, 
    html body .translated-subtitle {
      pointer-events: auto !important;
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
      /* display diabaikan, biarkan Bilibili menggunakan defaultnya */
      z-index: 999999 !important;
    }
    
    /* Wadah kustom — max-content biar teks mengikuti panjang konten,
       max-width dibatasi agar tidak lebih lebar dari player */
    html body .custom-bili-subtitle-group {
      position: absolute !important;
      top: calc(100% + 4px) !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      display: flex !important;
      justify-content: center !important;
      text-align: center !important;
      margin: 0 !important;
      width: max-content !important;
      max-width: min(90vw, 900px) !important;
      pointer-events: auto !important;
      z-index: 1001 !important;
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
      overflow-wrap: break-word !important;
      word-break: break-word !important;
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
