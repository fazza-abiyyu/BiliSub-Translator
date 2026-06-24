// =====================================================
// background.js - Highly Robust Multi-Fallback Translation Engine
// =====================================================

// Pastikan service worker tetap hidup dengan alarm periodik
// periodInMinutes >= 1 diperlukan agar alarm bisa bangunkan SW dari cold start (MV3)
const ALARM_NAME = 'keepAlive';

async function initDefaults() {
  await chrome.storage.sync.set({
    targetLang: 'id',
    autoTranslate: true,
    fontSize: 'medium',
    subtitleMode: 'dual',
    bgOpacity: '60'
  });
}

// Listen for installation & browser startup
chrome.runtime.onInstalled.addListener(async () => {
  await initDefaults();
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});

// Jaga service worker tetap hidup
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    // NOOP — wakeup sufficient
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'translateText') {
    translateText(request.text, request.targetLang)
      .then(translatedText => {
        if (translatedText) {
          sendResponse({ translation: translatedText });
        } else {
          sendResponse({ translation: request.text });
        }
      })
      .catch(() => {
        sendResponse({ translation: request.text });
      });
    return true; // Respond asynchronously
  }
});

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