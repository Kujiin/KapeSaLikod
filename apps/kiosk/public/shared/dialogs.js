// Dialogs stay inside their kiosk frame rather than entering the viewport top layer.
const controllers = new WeakMap();
export function dialogController(frame) {
  if (controllers.has(frame)) return controllers.get(frame);
  const layer = frame.querySelector('.dialog-layer');
  let active = null;
  let returnFocus = null;
  const previousInert = new Map();
  const focusable = dialog => [...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
    .filter(node => !node.disabled && node.tabIndex >= 0 && !node.closest('[hidden]'));
  function finish(dialog) {
    if (active !== dialog) return;
    active = null;
    layer.hidden = true;
    for (const [node, wasInert] of previousInert) {
      node.inert = wasInert;
      node.toggleAttribute('inert', wasInert);
    }
    previousInert.clear();
    if (returnFocus?.isConnected && !returnFocus.disabled && !returnFocus.closest('[hidden]')) returnFocus.focus();
    else focusable(frame)[0]?.focus();
  }
  function close(dialog) {
    dialog.close();
    finish(dialog);
  }
  function open(dialog) {
    if (active === dialog) return;
    if (active) close(active);
    returnFocus = document.activeElement;
    for (const child of frame.children) {
      if (child === layer) continue;
      previousInert.set(child, child.hasAttribute('inert'));
      child.inert = true;
      child.setAttribute('inert', '');
    }
    active = dialog;
    layer.hidden = false;
    dialog.setAttribute('aria-modal', 'true');
    dialog.show();
    (focusable(dialog).find(node => !node.closest('form[method="dialog"]')) || dialog).focus();
  }
  for (const dialog of layer.querySelectorAll('dialog')) {
    dialog.tabIndex = -1;
    dialog.addEventListener('close', () => { if (!dialog.open) finish(dialog); });
  }
  frame.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (active.dataset.dismissable !== 'false') close(active);
    } else if (event.key === 'Tab') {
      const nodes = focusable(active);
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); active.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
  });
  const controller = {open, close};
  controllers.set(frame, controller);
  return controller;
}
