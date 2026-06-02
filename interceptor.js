(function() {
  // Intercept Fetch API
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    const isSubUrl = typeof url === 'string' && (url.includes('subtitle') || url.includes('hdslb.com') || url.includes('bilivideo.com'));
    if (isSubUrl) {
      try {
        const response = await originalFetch.apply(this, args);
        const data = await response.clone().json();
        if (data && data.body) {
          const translatedBody = await new Promise((resolve) => {
            const reqId = Math.random().toString(36).slice(2);
            const handler = (event) => {
              if (event.data && event.data.type === 'BILIBILI_SUBTITLES_TRANSLATED' && event.data.reqId === reqId) {
                window.removeEventListener('message', handler);
                resolve(event.data.subtitles);
              }
            };
            window.addEventListener('message', handler);
            window.postMessage({ type: 'TRANSLATE_BILIBILI_SUBTITLES', reqId: reqId, body: data.body }, '*');
            
            // Safety timeout of 4 seconds
            setTimeout(() => {
              window.removeEventListener('message', handler);
              resolve(null);
            }, 4000);
          });
          
          if (translatedBody) {
            data.body = translatedBody;
            return new Response(JSON.stringify(data), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }
        }
        return response;
      } catch (e) {
        return originalFetch.apply(this, args);
      }
    }
    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequests
  const originalXHR = window.XMLHttpRequest.prototype.open;
  const originalSend = window.XMLHttpRequest.prototype.send;

  window.XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return originalXHR.apply(this, arguments);
  };

  window.XMLHttpRequest.prototype.send = function() {
    const url = this._url;
    const isSubUrl = typeof url === 'string' && (url.includes('subtitle') || url.includes('hdslb.com') || url.includes('bilivideo.com'));
    
    if (isSubUrl) {
      const self = this;
      const originalOnReadyStateChange = this.onreadystatechange;

      this.onreadystatechange = function() {
        if (self.readyState === 4 && self.status === 200) {
          try {
            const data = JSON.parse(self.responseText);
            if (data && data.body) {
              const reqId = Math.random().toString(36).slice(2);
              const handler = (event) => {
                if (event.data && event.data.type === 'BILIBILI_SUBTITLES_TRANSLATED' && event.data.reqId === reqId) {
                  window.removeEventListener('message', handler);
                  const translatedBody = event.data.subtitles;
                  if (translatedBody) {
                    data.body = translatedBody;
                    const modifiedText = JSON.stringify(data);
                    
                    Object.defineProperty(self, 'responseText', { value: modifiedText, writable: true });
                    Object.defineProperty(self, 'response', { value: modifiedText, writable: true });
                  }
                  if (originalOnReadyStateChange) {
                    originalOnReadyStateChange.apply(self, arguments);
                  }
                }
              };
              window.addEventListener('message', handler);
              window.postMessage({ type: 'TRANSLATE_BILIBILI_SUBTITLES', reqId: reqId, body: data.body }, '*');
              
              setTimeout(() => {
                window.removeEventListener('message', handler);
                if (originalOnReadyStateChange) {
                  originalOnReadyStateChange.apply(self, arguments);
                }
              }, 4000);
              
              return;
            }
          } catch (e) {}
        }
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(self, arguments);
        }
      };
    }
    return originalSend.apply(this, arguments);
  };
})();
