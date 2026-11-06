// BiliSub content script module: Settings load/apply + Bilibili subtitle auto-enable
// Content scripts share one isolated scope, so files are loaded in
// manifest order (see manifest.json content_scripts).

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

  // Use click() which creates trusted events browser-side
  subtitleBtn.click();

  // Step 1: wait for player to respond (menu open or toggle)
  setTimeout(() => {
    const subtitleItems = document.querySelectorAll('.bpx-player-ctrl-subtitle-language-item');
    
    if (subtitleItems.length > 0) {
      // Menu opened — try to pick a Chinese track first
      let targetItem = Array.from(subtitleItems).find(item => {
        const lan = (item.getAttribute('data-lan') || '').toLowerCase();
        const text = (item.textContent || '').toLowerCase();
        return lan === 'ai-zh' || lan === 'ai-cn' || lan === 'zh-cn' ||
               lan.includes('zh') || lan.includes('chi') || text.includes('中文') || text.includes('汉语');
      });
      if (!targetItem) {
        // Still no Chinese track — fall back to English (ai-en)
        targetItem = Array.from(subtitleItems).find(item => {
          const lan = (item.getAttribute('data-lan') || '').toLowerCase();
          const text = (item.textContent || '').toLowerCase();
          return lan === 'ai-en' || lan.includes('en') || text === 'english' || text.includes('英语');
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
        targetItem.click();
        hasAutoEnabledSubtitles = true;
        console.log('[BiliSub] Selected subtitle track:', targetItem.getAttribute('data-lan'));
      }
    } else {
      // No menu items — button might have toggled subtitles directly
      // Check if subtitles are now showing
      setTimeout(() => {
        const textEl = document.querySelector('.bili-subtitle-x-subtitle-panel-text');
        if (textEl && textEl.textContent?.trim()) {
          hasAutoEnabledSubtitles = true;
          console.log('[BiliSub] Subtitles toggled on via button click');
        }
        isAutoEnabling = false;
      }, 600);
      return;
    }

    isAutoEnabling = false;
  }, 600);
}

// Load settings with timeout fallback
function loadSettingsAndInit() {
  const defaults = {
    targetLang: 'id',
    autoTranslate: true,
    fontSize: 'medium',
    subtitleMode: 'dual',
    bgOpacity: '60',
    draggedLeftPercent: null,
    draggedTopPercent: null,
    hasBeenManualDragged: false,
    hoverTranslate: true
  };

  let settled = false;

  chrome.storage.sync.get(defaults, (items) => {
    if (settled) return;
    settled = true;
    applySettings(items);
  });

  // Timeout: jika storage.get tidak merespon dalam 3 detik, paksa pakai default
  setTimeout(() => {
    if (settled) return;
    settled = true;
    applySettings(defaults);
  }, 3000);
}

function applySettings(items) {
  console.log('[BiliSub] Loaded settings from storage:', items);
  settings = items;
  if (items.hasBeenManualDragged && items.draggedLeftPercent !== null && items.draggedTopPercent !== null) {
    globalDraggedOffset = {
      left: items.draggedLeftPercent,
      top: items.draggedTopPercent,
      isPercent: true
    };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
}


// Listen for settings changes
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'settingsUpdated') {
    console.log('[BiliSub] Settings updated dynamically:', message.settings);
    const langChanged = settings.targetLang !== message.settings.targetLang;
    settings = message.settings;
    if (langChanged) {
      translationCache.clear();
      failedTranslations.clear();
      preTranslationDone = false;
    }
    if (!settings.hoverTranslate) {
      if (typeof hoverBtn !== 'undefined' && hoverBtn) hoverBtn.classList.remove('show');
      if (typeof popupCard !== 'undefined' && popupCard) popupCard.classList.remove('show');
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
