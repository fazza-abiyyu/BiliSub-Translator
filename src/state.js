// BiliSub content script module: Shared state, settings defaults, url guards
// Content scripts share one isolated scope, so files are loaded in
// manifest order (see manifest.json content_scripts).

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
let extensionContextValid = true;

function checkExtensionContext() {
  try {
    const valid = !!chrome.runtime.id;
    if (valid) extensionContextValid = true;
    return valid;
  } catch (_) {
    extensionContextValid = false;
    return false;
  }
}

// Periodic context check supaya bisa recovery kalau SW restart
setInterval(() => {
  checkExtensionContext();
  if (!extensionContextValid) {
    try {
      if (chrome.runtime?.id) extensionContextValid = true;
    } catch (_) {}
  }
}, 10000);

function checkUrlChange() {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    hasAutoEnabledSubtitles = false;
    allSubtitles = [];
    translationCache.clear();
    failedTranslations.clear();
  }
}

let globalDraggedOffset = null; // Stores { left, top, isPercent } relative to offsetParent
