// BiliSub content script module: Hover translate button + popup
// Content scripts share one isolated scope, so files are loaded in
// manifest order (see manifest.json content_scripts).

// =====================================================
// Hover & Selection Translation Engine (BiliSub Tooltip & Popup)
// =====================================================

const FOREIGN_TEXT_REGEX = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/; // Chinese, Japanese, Korean
let hoverBtn = null;
let popupCard = null;
let currentTargetEl = null;

function hasForeignText(el) {
  if (!el || !el.textContent) return false;
  
  const ignoredTags = ['HTML', 'BODY', 'SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'VIDEO', 'AUDIO', 'IMG', 'BUTTON', 'SVG', 'PATH', 'CODE', 'PRE', 'NOSCRIPT', 'IFRAME', 'HEADER', 'FOOTER', 'NAV'];
  if (ignoredTags.includes(el.tagName)) return false;
  
  const text = el.textContent.trim();
  if (text.length < 2 || text.length > 600) return false;
  
  return FOREIGN_TEXT_REGEX.test(text);
}

function findTranslationTarget(el) {
  if (!el) return null;
  
  // Look for common Bilibili comment/content wrappers
  const commentContent = el.closest('.reply-content, .reply-text, .comment-text, .reply-item-content, .sub-reply-content, [class*="reply-content"], [class*="comment-text"]');
  if (commentContent && hasForeignText(commentContent)) {
    return commentContent;
  }
  
  if (hasForeignText(el)) {
    return el;
  }
  
  if (el.parentElement && hasForeignText(el.parentElement)) {
    return el.parentElement;
  }
  
  return null;
}

function initHoverTranslation() {
  if (document.getElementById('bilisub-hover-btn')) return;

  // Create hover button
  hoverBtn = document.createElement('button');
  hoverBtn.id = 'bilisub-hover-btn';
  hoverBtn.className = 'bilisub-hover-btn';
  hoverBtn.title = 'Translate with BiliSub';
  hoverBtn.appendChild(parseHTML(`
    <svg viewBox="0 0 24 24">
      <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
    </svg>
  `));
  document.body.appendChild(hoverBtn);

  // Create popup card
  popupCard = document.createElement('div');
  popupCard.id = 'bilisub-popup-card';
  popupCard.className = 'bilisub-popup-card';
  popupCard.appendChild(parseHTML(`
    <div class="bilisub-popup-header">
      <div class="bilisub-popup-title-group">
        <svg viewBox="0 0 24 24">
          <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
        </svg>
        <span class="bilisub-popup-title">BiliSub Translator</span>
      </div>
      <button class="bilisub-popup-close-btn">&times;</button>
    </div>
    <div class="bilisub-popup-content"></div>
    <div class="bilisub-popup-footer">
      <button class="bilisub-copy-btn">
        <svg viewBox="0 0 24 24">
          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>
        <span class="bilisub-copy-label">Copy</span>
      </button>
    </div>
  `));
  document.body.appendChild(popupCard);

  // Close popup handlers
  const closeBtn = popupCard.querySelector('.bilisub-popup-close-btn');
  closeBtn.addEventListener('click', hidePopupCard);

  // Copy button handler
  const copyBtn = popupCard.querySelector('.bilisub-copy-btn');
  const copyLabel = copyBtn.querySelector('.bilisub-copy-label');
  copyBtn.addEventListener('click', () => {
    const targetTextEl = popupCard.querySelector('.bilisub-popup-target');
    if (targetTextEl) {
      navigator.clipboard.writeText(targetTextEl.textContent);
      const originalLabel = copyLabel.textContent;
      copyLabel.textContent = 'Copied!';
      setTimeout(() => {
        copyLabel.textContent = originalLabel;
      }, 1500);
    }
  });

  // Hover button click to translate
  hoverBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentTargetEl) return;

    const textToTranslate = currentTargetEl.textContent.trim();
    if (!textToTranslate) return;

    showPopupLoading(currentTargetEl);

    try {
      const translated = await translateText(textToTranslate, settings.targetLang);
      if (translated) {
        showPopupTranslation(textToTranslate, translated);
      } else {
        showPopupTranslation(textToTranslate, "Translation error or empty response.");
      }
    } catch (err) {
      showPopupTranslation(textToTranslate, "Translation failed. Context invalidated?");
    }
  });

  // Mouse move / hover listeners
  let hideBtnTimeout = null;

  document.addEventListener('mouseover', (e) => {
    if (!settings.hoverTranslate) return;

    const path = e.composedPath();
    const el = path[0];
    if (!el) return;

    if (el === hoverBtn || el.closest('#bilisub-hover-btn') || el === popupCard || el.closest('#bilisub-popup-card')) {
      clearTimeout(hideBtnTimeout);
      return;
    }

    const targetEl = findTranslationTarget(el);
    if (targetEl) {
      clearTimeout(hideBtnTimeout);
      currentTargetEl = targetEl;
      positionHoverBtn(targetEl);
    }
  });

  document.addEventListener('mouseout', (e) => {
    const path = e.composedPath();
    const el = path[0];
    if (!el) return;

    const targetEl = findTranslationTarget(el);
    if (targetEl) {
      hideBtnTimeout = setTimeout(() => {
        if (hoverBtn) hoverBtn.classList.remove('show');
      }, 600);
    }
  });

  // Hide popup on click outside
  document.addEventListener('click', (e) => {
    if (popupCard && popupCard.classList.contains('show')) {
      const path = e.composedPath();
      const el = path[0];
      if (el && !popupCard.contains(el) && el !== hoverBtn && !hoverBtn.contains(el)) {
        hidePopupCard();
      }
    }
  });
}

function positionHoverBtn(el) {
  if (!hoverBtn) return;
  const rect = el.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

  const btnWidth = 28;
  const btnHeight = 28;

  let top = rect.top + scrollTop - btnHeight / 2;
  let left = rect.right + scrollLeft - btnWidth / 2;

  if (left + btnWidth > window.innerWidth + scrollLeft) {
    left = window.innerWidth + scrollLeft - btnWidth - 10;
  }
  if (top < scrollTop) {
    top = rect.bottom + scrollTop - btnHeight / 2;
  }

  hoverBtn.style.top = `${top}px`;
  hoverBtn.style.left = `${left}px`;
  hoverBtn.classList.add('show');
}

function showPopupLoading(el) {
  if (!popupCard) return;

  const contentEl = popupCard.querySelector('.bilisub-popup-content');
  replaceChildren(contentEl, parseHTML(`
    <div class="bilisub-popup-loading">
      <div class="bilisub-popup-spinner"></div>
      <span>Translating...</span>
    </div>
  `));

  const rect = el.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

  const cardWidth = 280;
  const cardHeight = 120; 

  let top = rect.bottom + scrollTop + 8;
  let left = rect.left + scrollLeft;

  if (left + cardWidth > window.innerWidth + scrollLeft) {
    left = window.innerWidth + scrollLeft - cardWidth - 16;
  }
  if (left < scrollLeft) {
    left = scrollLeft + 16;
  }

  if (top + cardHeight > window.innerHeight + scrollTop) {
    top = rect.top + scrollTop - cardHeight - 8;
  }

  popupCard.style.top = `${top}px`;
  popupCard.style.left = `${left}px`;
  popupCard.classList.add('show');

  if (hoverBtn) hoverBtn.classList.remove('show');
}

function showPopupTranslation(original, translation) {
  if (!popupCard) return;

  const contentEl = popupCard.querySelector('.bilisub-popup-content');
  const sourceDiv = document.createElement('div');
  sourceDiv.className = 'bilisub-popup-source';
  sourceDiv.textContent = original;

  const targetDiv = document.createElement('div');
  targetDiv.className = 'bilisub-popup-target';
  targetDiv.textContent = translation;

  replaceChildren(contentEl, null);
  contentEl.appendChild(sourceDiv);
  contentEl.appendChild(targetDiv);
}

function hidePopupCard() {
  if (popupCard) {
    popupCard.classList.remove('show');
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}