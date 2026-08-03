// interceptor-injector.js
// Firefox MV2 content scripts run in an isolated world, not the main world.
// This injector dynamically injects interceptor.js as a <script> tag so it
// runs in the page's main world where it can intercept window.fetch and
// window.XMLHttpRequest. Messages posted via window.postMessage from the
// main-world interceptor are received by content.js in the isolated world.

(function() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('interceptor.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
})();
