// SPDX-License-Identifier: GPL-3.0-only
import { discoverSubtitles, normalizeSubtitles, fetchSubtitles, subtitleFrame } from './core/subtitles.js';
import { languageName, mediaTracks, selectAudioTrack, selectTextTrack } from './core/media-tracks.js';

export function installTrackControls({ screen, video, context, addons, settings, persist, el, button, onOpen, onClose }) {
  let dialog, panelKind, returnFocus, editor = false, discovery, download, downloading = '', error = '', info = '', found = false;
  let external = normalizeSubtitles(context.stream.subtitles, context.stream.addonName || 'Fonte');
  let selected = null, cues = [], delay = 0, timer, disposed = false;
  const storedStyle = settings.subtitleStyle || {};
  const style = settings.subtitleStyle = { size: [18, 24, 30].includes(storedStyle.size) ? storedStyle.size : 24, background: storedStyle.background !== false };
  const overlay = el('div', { class: 'subtitle-overlay', hidden: true, 'aria-label': 'Legenda externa' }); screen.append(overlay);
  function renderCue() {
    clearTimeout(timer);
    if (disposed) return;
    const frame = subtitleFrame(cues, (video.currentTime || 0) - delay);
    if (overlay.textContent !== frame.text) overlay.textContent = frame.text;
    overlay.hidden = !frame.text;
    overlay.style.fontSize = `${style.size}px`; overlay.classList.toggle('subtitle-background', style.background);
    if (!video.paused && !video.seeking && Number.isFinite(frame.next)) {
      timer = setTimeout(renderCue, Math.max(20, Math.min(10000, ((frame.next + delay - video.currentTime) / (video.playbackRate || 1)) * 1000 + 12)));
    }
  }
  const videoEvents = ['timeupdate', 'seeked', 'seeking', 'playing', 'pause', 'ratechange', 'ended'];
  videoEvents.forEach(name => video.addEventListener(name, renderCue));
  function stopDownload() { download?.abort(); download = null; downloading = ''; }
  function close() {
    if (!dialog) return;
    stopDownload(); discovery?.abort(); discovery = null;
    dialog.remove(); dialog = null; panelKind = null; error = '';
    onClose(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function row(title, subtitle, action, key, selectedRow = false) {
    return button([el('span', { class: 'grow' }, el('strong', {}, title), subtitle ? el('small', {}, subtitle) : null), el('span', { class: 'track-check', 'aria-hidden': 'true' }, selectedRow ? '✓' : '')], action,
      { class: `track-row${selectedRow ? ' selected-track' : ''}`, 'data-track-key': key, 'aria-pressed': String(selectedRow) });
  }
  async function chooseExternal(item, key) {
    stopDownload(); const controller = download = new AbortController(); downloading = key; error = ''; draw();
    try {
      const loaded = await fetchSubtitles(item, controller.signal);
      if (disposed || controller.signal.aborted || download !== controller) return;
      selectTextTrack(video); cues = loaded; selected = item; renderCue(); downloading = ''; download = null; draw();
    } catch (failure) {
      if (disposed || controller.signal.aborted || download !== controller) return;
      error = failure.message; downloading = ''; download = null; draw();
    }
  }
  function chooseNative(track) {
    stopDownload();
    try { selectTextTrack(video, track); selected = null; cues = []; error = ''; renderCue(); draw(); }
    catch (failure) { error = failure.message; draw(); }
  }
  async function discover() {
    if (discovery) return;
    const controller = discovery = new AbortController(); info = 'Buscando legendas nos addons…'; draw();
    try {
      const result = await discoverSubtitles(addons, context, controller.signal);
      if (disposed || controller.signal.aborted || discovery !== controller) return;
      const seen = new Set();
      external = [...normalizeSubtitles(context.stream.subtitles, context.stream.addonName || 'Fonte'), ...result.subtitles]
        .filter(item => { if (seen.has(item.url)) return false; seen.add(item.url); return true; }).slice(0, 300);
      found = true;
      info = result.failed ? `${result.failed} addon(s) não responderam. Você pode tentar novamente.` : external.length ? `${external.length} legenda(s) externa(s) disponível(is).` : 'Nenhuma legenda externa encontrada para este título.';
    } catch (failure) { if (!controller.signal.aborted) info = failure.message; }
    finally { if (discovery === controller) { discovery = null; draw(); } }
  }
  function draw() {
    if (!dialog || disposed) return;
    const activeKey = dialog.contains(document.activeElement) ? document.activeElement.dataset.trackKey : null;
    const oldScroll = dialog.querySelector('.track-list')?.scrollTop || 0;
    const panel = el('section', { class: 'track-panel' }, el('div', { class: 'track-heading' }, el('h2', {}, panelKind === 'audio' ? 'Áudio' : 'Legendas'), button('Fechar', close, { class: 'track-close', 'data-dismiss': true, 'data-track-key': 'close' })));
    const list = el('div', { class: 'track-list' });
    if (panelKind === 'audio') {
      const tracks = mediaTracks(video, 'audio');
      if (!tracks.length) list.append(el('p', { class: 'track-notice' }, 'Esta fonte não expôs faixas de áudio selecionáveis ao player.'));
      for (const entry of tracks) list.append(row(entry.name, entry.language, () => {
        try { selectAudioTrack(video, entry.track); error = ''; } catch (failure) { error = failure.message; } draw();
      }, `audio-${entry.index}`, entry.selected));
    } else {
      panel.append(row('Ajustes de legenda', editor ? 'Voltar à lista' : 'Tamanho, fundo e sincronização', () => { editor = !editor; draw(); }, 'style'));
      if (editor) {
        list.append(row('Tamanho', { 18: 'Pequeno', 24: 'Médio', 30: 'Grande' }[style.size], () => { const sizes = [18, 24, 30]; style.size = sizes[(sizes.indexOf(style.size) + 1) % 3]; persist(); renderCue(); draw(); }, 'size'));
        list.append(row('Fundo da legenda', style.background ? 'Ativado' : 'Desativado', () => { style.background = !style.background; persist(); renderCue(); draw(); }, 'background', style.background));
        list.append(el('p', { class: 'track-notice' }, `Atraso: ${delay > 0 ? '+' : ''}${delay.toFixed(1)} s. Valores positivos atrasam a legenda.`));
        for (const [key, title, change] of [['earlier', 'Adiantar 0,5 s', -.5], ['later', 'Atrasar 0,5 s', .5], ['reset', 'Zerar atraso', 0]]) list.append(row(title, '', () => { delay = change ? Math.max(-10, Math.min(10, delay + change)) : 0; renderCue(); draw(); }, key));
        list.append(el('p', { class: 'track-notice' }, 'Estes ajustes se aplicam às legendas externas. O atraso vale somente para esta reprodução.'));
      } else {
        const native = mediaTracks(video, 'text');
        list.append(row('Desativadas', '', () => chooseNative(null), 'off', !selected && !native.some(r => r.selected)));
        for (const entry of native) list.append(row(entry.name, `${entry.language} · Interna`, () => chooseNative(entry.track), `native-${entry.index}`, !selected && entry.selected));
        external.forEach((item, index) => {
          const key = `external-${index}`;
          list.append(row(item.name || languageName(item.lang), downloading === key ? 'Carregando…' : `${languageName(item.lang)} · ${item.source}`, () => chooseExternal(item, key), key, selected?.url === item.url));
        });
        list.append(row(discovery ? 'Buscando legendas…' : 'Atualizar legendas', '', discover, 'refresh'));
        if (info) list.append(el('p', { class: 'track-notice', role: 'status' }, info));
      }
    }
    if (error) panel.append(el('p', { class: 'track-error', role: 'alert' }, error));
    panel.append(list); dialog.replaceChildren(panel); list.scrollTop = oldScroll;
    if (activeKey) ([...dialog.querySelectorAll('[data-track-key]')].find(b => b.dataset.trackKey === activeKey) || dialog.querySelector('[data-dismiss]'))?.focus({ preventScroll: true });
  }
  function open(kind) {
    if (dialog) close();
    returnFocus = document.activeElement; panelKind = kind; editor = false; error = '';
    dialog = el('div', { class: 'player-track-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': kind === 'audio' ? 'Áudio' : 'Legendas' });
    screen.append(dialog); onOpen(); draw();
    (dialog.querySelector('.selected-track') || dialog.querySelector('.track-list button') || dialog.querySelector('[data-dismiss]'))?.focus();
    if (kind === 'subtitles' && !found) discover();
  }
  let watchedLists = [];
  function tracksChanged() { if (dialog) draw(); }
  function bindTracks() {
    for (const list of watchedLists) for (const event of ['addtrack', 'removetrack', 'change']) list.removeEventListener?.(event, tracksChanged);
    watchedLists = [video.audioTracks, video.textTracks].filter(Boolean);
    for (const list of watchedLists) for (const event of ['addtrack', 'removetrack', 'change']) list.addEventListener?.(event, tracksChanged);
    tracksChanged();
  }
  video.addEventListener('loadedmetadata', bindTracks); bindTracks();
  return {
    openAudio: () => open('audio'), openSubtitles: () => open('subtitles'), isOpen: () => Boolean(dialog),
    dispose() {
      disposed = true; stopDownload(); discovery?.abort(); clearTimeout(timer); dialog?.remove(); overlay.remove();
      videoEvents.forEach(name => video.removeEventListener(name, renderCue)); video.removeEventListener('loadedmetadata', bindTracks);
      for (const list of watchedLists) for (const event of ['addtrack', 'removetrack', 'change']) list.removeEventListener?.(event, tracksChanged);
    },
  };
}
