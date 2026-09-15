// SPDX-License-Identifier: GPL-3.0-only
// ParentalGuideOverlay.kt: accent line that grows top to bottom, rows that fade in
// one by one, a five-second hold and a reverse exit. Visual only, never focused.
import { fetchParentalGuide } from './core/parental-guide.js';
import { readPlayback } from './core/playback.js';
const holdMs = 5000;
export function installParentalGuide({ screen, video, context, settings, el, blocked, request, signal }) {
  const line = el('span', { class: 'parental-line', 'aria-hidden': true });
  const list = el('div', { class: 'parental-list' });
  const overlay = el('div', { class: 'parental-guide', hidden: true, role: 'status', 'aria-label': 'Avisos de conteúdo' }, line, list);
  screen.append(overlay);
  let warnings = [], shown = false, disposed = false, playing = false, sequence = 0;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms); timers.add(id); return id; };
  function draw() {
    list.replaceChildren(...warnings.map((warning, index) => el('div', { class: 'parental-row', style: `--i:${index}` },
      el('strong', {}, warning.label), el('span', { class: 'parental-separator', 'aria-hidden': true }, '·'), el('span', {}, warning.severityLabel))));
    overlay.style.setProperty('--rows', String(warnings.length));
  }
  function show() {
    if (disposed || shown || !warnings.length) return;
    shown = true; sequence += 1;
    draw(); overlay.hidden = false;
    for (const row of list.children) row.style.transitionDelay = '';
    requestAnimationFrame(() => { if (!disposed && sequence) overlay.classList.add('visible'); });
    later(hide, holdMs);
  }
  // Exit in reverse order, like the fork: rows bottom to top, then the line, then the box.
  function hide() {
    if (disposed || overlay.hidden) return;
    sequence += 1;
    const current = sequence;
    warnings.forEach((_, index) => { if (list.children[index]) list.children[index].style.transitionDelay = `${(warnings.length - 1 - index) * 60}ms`; });
    overlay.classList.remove('visible');
    later(() => {
      if (disposed || current !== sequence) return;
      overlay.hidden = true; overlay.classList.remove('visible');
      for (const row of list.children) row.style.transitionDelay = '';
    }, warnings.length * 60 + 400);
  }
  // The overlay never takes focus, but it steps aside for panels and seeks.
  function update() {
    if (disposed) return;
    if (!overlay.hidden && blocked()) { sequence += 1; overlay.hidden = true; overlay.classList.remove('visible'); }
  }
  async function load() {
    if (disposed || readPlayback(settings.playback).parentalGuide !== true) return;
    try {
      const guide = await fetchParentalGuide(context.id, { request, signal });
      if (disposed || signal?.aborted) return;
      warnings = guide;
      if (playing && !shown) show();
    } catch { /* offline or rate limited: the port stays silent */ }
  }
  const onPlaying = () => { playing = true; if (warnings.length && !shown) show(); };
  const onSeek = () => update();
  video.addEventListener('playing', onPlaying);
  video.addEventListener('seeked', onSeek);
  video.addEventListener('pause', onSeek);
  load();
  return {
    isOpen: () => !overlay.hidden,
    dismiss: () => { if (!overlay.hidden) hide(); },
    dispose() {
      disposed = true; sequence += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('seeked', onSeek);
      video.removeEventListener('pause', onSeek);
      overlay.remove();
    }
  };
}