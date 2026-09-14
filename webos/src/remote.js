// SPDX-License-Identifier: GPL-3.0-only
export function installRemote({ root, back, playerKey, boundaryLeft }) {
  const mapping = { 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 13: 'Enter', 461: 'Escape', 415: 'MediaPlay', 19: 'MediaPause', 413: 'MediaStop', 412: 'MediaRewind', 417: 'MediaFastForward' };
  document.addEventListener('keydown', e => {
    const key = mapping[e.keyCode] ?? e.key;
    if (key === 'Escape' || (key === 'Backspace' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName))) { e.preventDefault(); back(); return; }
    if (playerKey(key, e)) return;
    if (!key.startsWith('Arrow')) return;
    const active = document.activeElement;
    if (/INPUT|TEXTAREA|SELECT/.test(active?.tagName) && (active.tagName === 'SELECT' || ['ArrowLeft', 'ArrowRight'].includes(key))) return;
    e.preventDefault();
    const all = [...root.querySelectorAll('button:not(:disabled), input, select, textarea, a[href]')].filter(x => x.getClientRects().length && !x.closest('[hidden]') && x.tabIndex >= 0);
    if (!all.length) return;
    if (!all.includes(active)) { all[0].focus(); return; }
    const a = active.getBoundingClientRect(), cx = a.x + a.width / 2, cy = a.y + a.height / 2;
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight', sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
    let best = null, score = Infinity;
    for (const el of all) {
      if (el === active) continue;
      const b = el.getBoundingClientRect(), dx = b.x + b.width / 2 - cx, dy = b.y + b.height / 2 - cy;
      const forward = (horizontal ? dx : dy) * sign, cross = Math.abs(horizontal ? dy : dx);
      if (forward <= 2) continue;
      const overlap = horizontal ? b.bottom > a.top && b.top < a.bottom : b.right > a.left && b.left < a.right;
      const value = forward + cross * 3 + (overlap ? 0 : 3000);
      if (value < score) { best = el; score = value; }
    }
    if (!best && key === 'ArrowLeft') boundaryLeft?.();
    if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }); }
  });
}
