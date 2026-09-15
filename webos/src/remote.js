// SPDX-License-Identifier: GPL-3.0-only
export function installRemote({ root, back, playerKey, boundaryLeft, onLeftColumn }) {
  const mapping = { 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 13: 'Enter', 461: 'Escape', 415: 'MediaPlay', 19: 'MediaPause', 413: 'MediaStop', 412: 'MediaRewind', 417: 'MediaFastForward' };
  // Long press: the Android fork declares the gesture but never wires it, so the port
  // adds it where it helps — holding OK on an element marked [data-longpress] opens the
  // short-press action on release and the extra action from the 'longpress' event.
  const longPressMs = 600;
  let hold = null, swallowEnter = false;
  const longPressTarget = () => document.activeElement?.closest?.('[data-longpress]') || null;
  document.addEventListener('keydown', e => {
    const key = mapping[e.keyCode] ?? e.key;
    // A TV remote keeps sending keydown while the button is held, and the browser would
    // activate whatever got focus when the gesture fired. Enter is swallowed until release.
    if (key === 'Enter' && swallowEnter) { e.preventDefault(); return; }
    if (key === 'Enter' && !e.repeat) {
      const target = longPressTarget();
      if (target) {
        e.preventDefault();
        const timer = setTimeout(() => { const node = hold?.target; swallowEnter = true; hold = null; node?.dispatchEvent(new CustomEvent('longpress', { bubbles: true })); }, longPressMs);
        hold = { target, timer };
        return;
      }
    }
    if (key === 'Escape' || (key === 'Backspace' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName))) { e.preventDefault(); back(); return; }
    if (playerKey(key, e)) return;
    if (!key.startsWith('Arrow') && key !== 'Tab') return;
    const active = document.activeElement;
    if (/INPUT|TEXTAREA|SELECT/.test(active?.tagName) && (active.tagName === 'SELECT' || ['ArrowLeft', 'ArrowRight'].includes(key))) return;
    e.preventDefault();
    const all = [...(root.querySelector('[role=dialog]') || root).querySelectorAll('button:not(:disabled), input, select, textarea, a[href], [data-focusable]')].filter(x => x.getClientRects().length && !x.closest('[hidden], [inert]') && x.tabIndex >= 0);
    if (!all.length) return;
    if (key === 'Tab') {
      const index = all.indexOf(active); all[(index + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus(); return;
    }
    if (!all.includes(active)) { all[0].focus(); return; }
    // A screen with its own left column (the Settings rail) receives the focus itself
    // instead of letting the geometry pick a random neighbour.
    if (key === 'ArrowLeft') {
      const column = onLeftColumn?.(active);
      if (column) { e.preventDefault(); column.focus({ preventScroll: true }); column.scrollIntoView({ block: 'nearest', behavior: 'auto' }); return; }
    }
    const a = active.getBoundingClientRect(), cx = a.x + a.width / 2, cy = a.y + a.height / 2;
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight', sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
    let best = null, score = Infinity;
    for (const el of all) {
      if (el === active) continue;
      const b = el.getBoundingClientRect(), dx = b.x + b.width / 2 - cx, dy = b.y + b.height / 2 - cy;
      const forward = (horizontal ? dx : dy) * sign, cross = Math.abs(horizontal ? dy : dx);
      if (forward <= 2) continue;
      const overlap = horizontal ? b.bottom > a.top && b.top < a.bottom : b.right > a.left && b.left < a.right;
      // Aligned neighbours win over far ones: with the same weight for both axes a narrow
      // control directly below (the bold toggle of the subtitle editor) used to be skipped
      // in favour of a wide row much further down.
      const value = forward + cross * (overlap ? 0.75 : 3) + (overlap ? 0 : 3000);
      if (value < score) { best = el; score = value; }
    }
    if (!best && key === 'ArrowLeft') boundaryLeft?.();
    if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); }
  });
  document.addEventListener('keyup', e => {
    const key = mapping[e.keyCode] ?? e.key;
    if (key !== 'Enter') return;
    swallowEnter = false;
    if (!hold) return;
    clearTimeout(hold.timer);
    const node = hold.target; hold = null;
    if (node?.isConnected && document.activeElement === node) node.click();
  });
  document.addEventListener('blur', () => { swallowEnter = false; if (hold) { clearTimeout(hold.timer); hold = null; } });
}
