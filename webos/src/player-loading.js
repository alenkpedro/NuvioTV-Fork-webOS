// SPDX-License-Identifier: GPL-3.0-only
// LoadingOverlay.kt: the screen the fork shows while a stream opens — the title backdrop, the
// logo in a centred 180 dp box (fade and a slow pulse) and the loading message with the source
// line underneath. PlayerBufferingIndicator: once playback started, a stall only shows the ring.
const link = value => { try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
export function installLoadingOverlay({ el, context }) {
  const meta = context.meta || {}, stream = context.stream || {};
  const artwork = el('div', { class: 'player-loading-art' });
  const title = () => el('h2', { class: 'player-loading-title' }, meta.name || '');
  const logo = link(meta.logo);
  artwork.append(logo ? el('img', { class: 'player-loading-logo', src: logo, alt: '', onerror: () => artwork.replaceChildren(title()) }) : title());
  const backdrop = link(meta.background || meta.fanart || meta.poster);
  const message = el('p', { class: 'player-loading-message', role: 'status' }, 'Abrindo vídeo…');
  const source = el('p', { class: 'player-loading-source' }, [stream.addonName, stream.name || stream.title].filter(Boolean).join(' · '));
  const element = el('div', { class: 'player-loading', role: 'status', 'aria-label': 'Carregando a reprodução' },
    backdrop ? el('img', { class: 'player-loading-backdrop', src: backdrop, alt: '', decoding: 'async', onerror: event => event.target.remove() }) : null,
    el('div', { class: 'player-loading-scrim', 'aria-hidden': true }),
    el('div', { class: 'player-loading-center' }, artwork, message, source, el('div', { class: 'ring-spinner', 'aria-hidden': true })));
  let started = false;
  const apply = () => { element.hidden = started ? element.dataset.buffering !== 'true' : false; };
  return {
    element,
    // Still opening the source: the full screen, with the message the caller is showing.
    show(text) { if (typeof text === 'string') message.textContent = text; element.dataset.buffering = 'false'; apply(); },
    // Playback started: the overlay leaves for good, like LoadingOverlay.kt.
    ready() { started = true; element.dataset.buffering = 'false'; apply(); },
    // A stall after the start is the buffering indicator: the ring over the video, nothing else.
    buffer(active, text) { if (typeof text === 'string') message.textContent = text; element.dataset.buffering = String(Boolean(active)); apply(); },
    dispose() { element.remove(); }
  };
}
