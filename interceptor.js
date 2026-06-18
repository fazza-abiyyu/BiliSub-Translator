(function() {
  const SUBTITLE_URL_PATTERNS = [
    '/bfs/subtitle/',
    '/bfs/ai_subtitle/',
    'aisubtitle.hdslb.com/bfs/'
  ];

  function isSubtitleUrl(url) {
    if (typeof url !== 'string') return false;
    return SUBTITLE_URL_PATTERNS.some(p => url.includes(p));
  }

  // Intercept Fetch API — fire-and-forget: pass data to content.js but
  // return the original response immediately so Bilibili's player isn't delayed.
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    if (!isSubtitleUrl(args[0])) {
      return originalFetch.apply(this, args);
    }

    let response;
    try {
      response = await originalFetch.apply(this, args);
      // Clone the response for content.js to translate in background;
      // the original response is returned immediately to Bilibili's player.
      response.clone().json().then(data => {
        if (data && data.body && Array.isArray(data.body)) {
          const reqId = Math.random().toString(36).slice(2);
          const handler = (event) => {
            if (event.data && event.data.type === 'BILIBILI_SUBTITLES_TRANSLATED' && event.data.reqId === reqId) {
              window.removeEventListener('message', handler);
            }
          };
          window.addEventListener('message', handler);
          window.postMessage({ type: 'TRANSLATE_BILIBILI_SUBTITLES', reqId: reqId, body: data.body }, '*');
          setTimeout(() => window.removeEventListener('message', handler), 30000);
        }
      }).catch(() => {});
      return response;
    } catch (e) {
      if (response) return response;
      return originalFetch.apply(this, args);
    }
  };

  // Intercept XMLHttpRequests — same fire-and-forget pattern
  const originalXHR = window.XMLHttpRequest.prototype.open;
  const originalSend = window.XMLHttpRequest.prototype.send;

  window.XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return originalXHR.apply(this, arguments);
  };

  window.XMLHttpRequest.prototype.send = function() {
    const url = this._url;
    if (!isSubtitleUrl(url)) {
      return originalSend.apply(this, arguments);
    }

    const self = this;
    const originalOnReadyStateChange = this.onreadystatechange;

    this.onreadystatechange = function() {
      if (self.readyState === 4 && self.status === 200) {
        try {
          const data = JSON.parse(self.responseText);
          if (data && data.body && Array.isArray(data.body)) {
            const reqId = Math.random().toString(36).slice(2);
            window.postMessage({ type: 'TRANSLATE_BILIBILI_SUBTITLES', reqId: reqId, body: data.body }, '*');
          }
        } catch (e) {}
      }
      if (originalOnReadyStateChange) {
        originalOnReadyStateChange.apply(self, arguments);
      }
    };
    return originalSend.apply(this, arguments);
  };
})();
