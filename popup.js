document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  chrome.storage.sync.get(
    {
      targetLang: 'id',
      autoTranslate: true,
      fontSize: 'medium',
      subtitleMode: 'dual'
    },
    (items) => {
      document.getElementById('targetLang').value = items.targetLang;
      document.getElementById('autoTranslate').checked = items.autoTranslate;
      document.getElementById('fontSize').value = items.fontSize;
      document.getElementById('subtitleMode').value = items.subtitleMode;
    }
  );

  // Save settings when changed
  document.getElementById('targetLang').addEventListener('change', saveSettings);
  document.getElementById('autoTranslate').addEventListener('change', saveSettings);
  document.getElementById('fontSize').addEventListener('change', saveSettings);
  document.getElementById('subtitleMode').addEventListener('change', saveSettings);
});

function saveSettings() {
  const settings = {
    targetLang: document.getElementById('targetLang').value,
    autoTranslate: document.getElementById('autoTranslate').checked,
    fontSize: document.getElementById('fontSize').value,
    subtitleMode: document.getElementById('subtitleMode').value
  };

  chrome.storage.sync.set(settings, () => {
    // Notify content script about settings change
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'settingsUpdated',
          settings: settings
        }, () => {
          // Clear lastError if content script isn't injected on current tab
          const error = chrome.runtime.lastError;
        });
      }
    });
  });
} 