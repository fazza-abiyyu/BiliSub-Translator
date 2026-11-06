// BiliSub content script module: DOM helpers (parseHTML, replaceChildren)
// Content scripts share one isolated scope, so files are loaded in
// manifest order (see manifest.json content_scripts).

function parseHTML(html) {
  const doc = new DOMParser().parseFromString(
    `<bili-root>${html}</bili-root>`,
    'text/html'
  );
  const root = doc.querySelector('bili-root');
  const frag = document.createDocumentFragment();
  while (root.firstChild) frag.appendChild(root.firstChild);
  return frag;
}

function replaceChildren(el, newChildren) {
  while (el.firstChild) el.removeChild(el.firstChild);
  if (newChildren) el.appendChild(newChildren);
}

