// SPDX-License-Identifier: GPL-3.0-only
// TrailerPlayer: the fork plays the trailer inside its own player. The TV page cannot embed the
// YouTube watch page, so the port plays it through the packaged proxy page (same origin, iframe +
// postMessage) and keeps the TV's YouTube app, the TV browser and the QR dialog as fallbacks for
// the cases the proxy cannot present a frame.
import { proxyURL, readProxyMessage, youtubeId } from './core/youtube-trailer.js';
export function installTrailerPlayer({ root, el, button, signal, external = {}, more = {} }) {
  let dialog = null, frame = null, stage = null, status = null, poll = null, watchdog = null, state = null, onEnded = null, current = '', opener = null;
  const controls = {};
  const send = (command, payload) => { try { frame?.contentWindow?.postMessage({ type: 'command', command, payload }, location.origin); } catch {} };
  function label(name, text) { if (controls[name]) controls[name].textContent = text; }
  function setStatus(text, tone = '') { if (!status) return; status.textContent = text; status.hidden = !text; status.dataset.tone = tone; }
  function fallbackActions(visible) { controls.fallback.hidden = !visible; }
  function close({ silent = false } = {}) {
    clearInterval(poll); clearTimeout(watchdog);
    window.removeEventListener('message', onMessage);
    signal.removeEventListener('abort', close);
    frame = null;
    if (dialog) { const node = dialog; dialog = null; node.remove(); }
    const ended = onEnded; onEnded = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    if (ended && !silent) ended();
  }
  function onMessage(event) {
    const message = readProxyMessage(event, frame?.contentWindow || null);
    if (!message) return;
    if (message.type === 'ready') { clearTimeout(watchdog); setStatus(''); return; }
    if (message.type === 'firstFrame') { clearTimeout(watchdog); setStatus(''); return; }
    if (message.type === 'fallback') {
      clearTimeout(watchdog); setStatus('Reproduzindo no player da TV: o controle remoto não navega dentro do trailer.', 'warn'); fallbackActions(true);
      for (const key of ['pause', 'mute', 'captions']) controls[key].disabled = true;
      return;
    }
    if (message.type === 'error') { setStatus('Não foi possível abrir o trailer aqui. Use uma das opções abaixo.', 'warn'); fallbackActions(true); return; }
    if (message.state) {
      clearTimeout(watchdog); state = message.state;
      if (state.ended) { close(); return; }
      label('pause', state.paused ? 'Reproduzir' : 'Pausar');
      label('mute', state.muted ? 'Com som' : 'Mudo');
      controls.captions.setAttribute('aria-pressed', String(state.captionsEnabled));
      if (!state.loading) setStatus('');
    }
  }
  function open(trailer = {}, { end } = {}) {
    const id = youtubeId(trailer.ytId || trailer.id || trailer);
    if (!id) return false;
    opener = document.activeElement;
    close();
    current = id; onEnded = typeof end === 'function' ? end : null;
    controls.pause = button('Pausar', () => send('pause'));
    controls.mute = button('Com som', () => send('unmute'));
    controls.captions = button('Legendas', () => send('captions', { enabled: !(state?.captionsEnabled) }), { 'aria-pressed': 'false' });
    const play = button('Reproduzir', () => send('play'));
    const options = button('Mais opções', () => { close({ silent: true }); more.open?.(trailer); });
    const closeButton = button('Fechar', close, { 'data-dismiss': true });
    stage = el('div', { class: 'trailer-stage' });
    frame = el('iframe', { class: 'trailer-frame', src: proxyURL(id, { muted: true }), title: trailer.name || 'Trailer', allow: 'autoplay; encrypted-media; picture-in-picture', frameborder: '0' });
    stage.append(frame);
    status = el('p', { class: 'trailer-status', role: 'status' }, 'Abrindo trailer…');
    controls.fallback = el('div', { class: 'trailer-fallbacks', hidden: true },
      button('Abrir no YouTube da TV', () => external.launch?.(id, { browser: false })),
      button('Abrir no navegador da TV', () => external.launch?.(id, { browser: true })),
      button('Ver QR code', () => more.open?.(trailer)));
    dialog = el('div', { class: 'app-dialog trailer-player', role: 'dialog', 'aria-modal': 'true', 'aria-label': trailer.name || 'Trailer' },
      el('section', { class: 'trailer-panel' }, stage, status,
        el('div', { class: 'toolbar trailer-controls' }, play, controls.pause, controls.mute, controls.captions, options, closeButton), controls.fallback));
    root.append(dialog);
    window.addEventListener('message', onMessage);
    signal.addEventListener('abort', close, { once: true });
    closeButton.focus({ preventScroll: true });
    poll = setInterval(() => send('state'), 1000);
    watchdog = setTimeout(() => { if (!state) { setStatus('O trailer demora a responder. Use uma das opções abaixo.', 'warn'); fallbackActions(true); } }, 12000);
    return true;
  }
  return { open, close, isOpen: () => Boolean(dialog), id: () => current };
}
