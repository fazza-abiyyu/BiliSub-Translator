// BiliSub content script module: Draggable element helper (subtitle overlay)
// Content scripts share one isolated scope, so files are loaded in
// manifest order (see manifest.json content_scripts).

function makeElementDraggable(el) {
  if (!el || el.dataset.draggableInitialized) {
    if (globalDraggedOffset) {
      applyDraggedPosition(el);
    }
    return;
  }
  el.dataset.draggableInitialized = 'true';

  let posX = 0, posY = 0, mouseX = 0, mouseY = 0;
  let isDragging = false;
  let currentLeft = 0;
  let currentTop = 0;

  el.style.setProperty('cursor', 'grab', 'important');
  el.style.setProperty('user-select', 'none', 'important');

  if (globalDraggedOffset) {
    applyDraggedPosition(el);
  }

  el.addEventListener('mousedown', dragMouseDown);

  // Reset position to default on double-click
  el.addEventListener('dblclick', () => {
    globalDraggedOffset = null;
    el.removeAttribute('data-has-been-manual-dragged');
    el.style.removeProperty('position');
    el.style.removeProperty('left');
    el.style.removeProperty('top');
    el.style.removeProperty('bottom');
    el.style.removeProperty('right');
    el.style.removeProperty('transform');
    chrome.storage.sync.set({
      draggedLeftPercent: null,
      draggedTopPercent: null,
      hasBeenManualDragged: false
    });
  });

  function dragMouseDown(e) {
    if (e.button !== 0) return; // Left click only
    if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || e.target.closest('a') || e.target.closest('button')) {
      return;
    }
    e.preventDefault();
    el.style.setProperty('cursor', 'grabbing', 'important');
    isDragging = true;

    mouseX = e.clientX;
    mouseY = e.clientY;

    const rect = el.getBoundingClientRect();
    const parent = el.offsetParent || document.body;
    const parentRect = parent.getBoundingClientRect();
    currentLeft = rect.left - parentRect.left;
    currentTop = rect.top - parentRect.top;

    document.addEventListener('mousemove', elementDrag);
    document.addEventListener('mouseup', closeDragElement);
  }

  function elementDrag(e) {
    if (!isDragging) return;
    e.preventDefault();

    const deltaX = e.clientX - mouseX;
    const deltaY = e.clientY - mouseY;
    mouseX = e.clientX;
    mouseY = e.clientY;

    currentLeft += deltaX;
    currentTop += deltaY;

    const rect = el.getBoundingClientRect();
    const parent = el.offsetParent || document.body;
    const parentRect = parent.getBoundingClientRect();
    
    // Convert to percentage of parent dimensions
    const parentWidth = parentRect.width || 1;
    const parentHeight = parentRect.height || 1;
    let leftPercent = (currentLeft / parentWidth) * 100;
    let topPercent = (currentTop / parentHeight) * 100;

    // Constrain inside bounds so it doesn't get dragged off-screen
    leftPercent = Math.max(0, Math.min(100 - (rect.width / parentWidth) * 100, leftPercent));
    topPercent = Math.max(0, Math.min(100 - (rect.height / parentHeight) * 100, topPercent));

    // Update currentLeft/currentTop in case they got constrained
    currentLeft = (leftPercent / 100) * parentWidth;
    currentTop = (topPercent / 100) * parentHeight;

    globalDraggedOffset = { left: leftPercent, top: topPercent, isPercent: true };
    applyDraggedPosition(el);
  }

  function closeDragElement() {
    isDragging = false;
    el.style.setProperty('cursor', 'grab', 'important');
    document.removeEventListener('mousemove', elementDrag);
    document.removeEventListener('mouseup', closeDragElement);
    
    // Simpan status bahwa elemen ini sudah pernah di-drag secara manual
    el.dataset.hasBeenManualDragged = 'true';

    // Simpan posisi ke storage secara persistent
    if (globalDraggedOffset) {
      chrome.storage.sync.set({
        draggedLeftPercent: globalDraggedOffset.left,
        draggedTopPercent: globalDraggedOffset.top,
        hasBeenManualDragged: true
      });
    }
  }

  function applyDraggedPosition(target) {
    if (!globalDraggedOffset) return;
    target.style.setProperty('position', 'absolute', 'important');
    if (globalDraggedOffset.isPercent) {
      target.style.setProperty('left', globalDraggedOffset.left + '%', 'important');
      target.style.setProperty('top', globalDraggedOffset.top + '%', 'important');
    } else {
      target.style.setProperty('left', globalDraggedOffset.left + 'px', 'important');
      target.style.setProperty('top', globalDraggedOffset.top + 'px', 'important');
    }
    target.style.setProperty('bottom', 'auto', 'important');
    target.style.setProperty('right', 'auto', 'important');
    target.style.setProperty('transform', 'none', 'important');
  }

  const styleObserver = new MutationObserver(() => {
    if (isDragging) return;
    if (globalDraggedOffset) {
      styleObserver.disconnect();
      applyDraggedPosition(el);
      styleObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
    }
  });

  styleObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
}

