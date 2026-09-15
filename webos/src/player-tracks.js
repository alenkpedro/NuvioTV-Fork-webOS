// SPDX-License-Identifier: GPL-3.0-only
import { playbackSpeeds, readSpeed, saveSpeed, readDelay, saveDelay, setPlaybackSpeed } from './core/playback-memory.js';
import { discoverSubtitles, normalizeSubtitles, fetchSubtitles, subtitleFrame } from './core/subtitles.js';
import { subtitleFlags, stripSdhText, subtitlePolicy, subtitleScoreFor, readTrackMemory, saveTrackMemory, clearTrackMemory } from './core/subtitle-options.js';
import { readPlayback, preferredLanguages, languageScore, languageCode } from './core/playback.js';
import { languageName, mediaTracks, selectAudioTrack, selectTextTrack } from './core/media-tracks.js';

export function installTrackControls({ screen, video, context, addons, settings, memoryState = {}, persist, el, button, extraActions, onOpen, onClose }) {
  let dialog, panelKind, returnFocus, editor = false, discovery, download, downloading = '', error = '', info = '', found = false;
  let external = normalizeSubtitles(context.stream.subtitles, context.stream.addonName || 'Fonte');
  let selected = null, cues = [], delay = readDelay(memoryState,context), timer, disposed = false;
  let previousCue = null, previousStrip = null, renderedCue = '';
  const preferences = readPlayback(settings.playback);
  const device = navigator.languages?.length ? navigator.languages : [navigator.language];
  const profileKey = memoryState.profileStore?.activeKey;
  let desiredSpeed = readSpeed(memoryState,context.meta);
  const panelTitle = kind => ({audio:'Áudio',subtitles:'Legendas',speed:'Velocidade',more:'Mais opções'}[kind]);
  function persistSpeed(speed) { if (!disposed && profileKey === memoryState.profileStore?.activeKey) { saveSpeed(memoryState,context.meta,speed); persist(); } }
  function chooseSpeed(speed,manual = true) {
    try { setPlaybackSpeed(video,speed); desiredSpeed=speed; error=''; if (manual) persistSpeed(speed); }
    catch (failure) { error=failure.message; if (!manual) { desiredSpeed=video.playbackRate; } }
    draw();
  }
  function rateChanged() {
    if (disposed) return;
    if (Math.abs(video.playbackRate-desiredSpeed)>0.001) { desiredSpeed=video.playbackRate; persistSpeed(1); error='O player alterou a velocidade. Escolha novamente para esta fonte.'; }
    if (panelKind === 'speed') draw();
  }
  video.addEventListener('ratechange',rateChanged);
  let remembered = preferences.rememberTracks ? readTrackMemory(memoryState,context.meta) : {};
  let languageFilter = 'all', policyKey = '';
  const baseAudioLanguages = preferredLanguages(preferences.audio, preferences.secondaryAudio, device, context.meta.originalLanguage || context.meta.original_language);
  const subtitleLanguages = preferredLanguages(preferences.subtitles, preferences.secondarySubtitles, device);
  let audioLanguages = remembered.audio ? [remembered.audio.language,...baseAudioLanguages.filter(l=>l!==remembered.audio.language)] : baseAudioLanguages;
  let manualAudio = false, manualSubtitles = false, autoBusy = false, autoQueued = false, audioScore = Infinity, subtitleScore = Infinity, metadataReady = false, autoDirty = false, autoDiscoveryAttempted = false;
  const attemptedAudio = new Set(), attemptedText = new Set(), attemptedExternal = new Set();
  const storedStyle = settings.subtitleStyle || {};
  const style = settings.subtitleStyle = { size: [18, 24, 30].includes(storedStyle.size) ? storedStyle.size : 24, background: storedStyle.background !== false };
  const overlay = el('div', { class: 'subtitle-overlay', hidden: true, 'aria-label': 'Legenda externa' }); screen.append(overlay);
  function renderCue() {
    clearTimeout(timer);
    if (disposed) return;
    const frame = subtitleFrame(cues, (video.currentTime || 0) - delay);
    if (previousCue !== frame.text || previousStrip !== preferences.stripSdh) {
      previousCue = frame.text; previousStrip = preferences.stripSdh; renderedCue = preferences.stripSdh ? stripSdhText(frame.text) : frame.text;
    }
    const text = renderedCue;
    if (overlay.textContent !== text) overlay.textContent = text;
    overlay.hidden = !text;
    overlay.style.fontSize = `${style.size}px`; overlay.classList.toggle('subtitle-background', style.background);
    if (!video.paused && !video.seeking && Number.isFinite(frame.next)) {
      timer = setTimeout(renderCue, Math.max(20, Math.min(10000, ((frame.next + delay - video.currentTime) / (video.playbackRate || 1)) * 1000 + 12)));
    }
  }
  const videoEvents = ['timeupdate', 'seeked', 'seeking', 'playing', 'pause', 'ratechange', 'ended'];
  videoEvents.forEach(name => video.addEventListener(name, renderCue));
  function remember(kind,choice) {
    if (!preferences.rememberTracks || disposed || profileKey !== memoryState.profileStore?.activeKey) return;
    saveTrackMemory(memoryState,context.meta,kind,choice); remembered = readTrackMemory(memoryState,context.meta); persist();
  }
  function setPreference(key,value) { preferences[key] = value; settings.playback = {...readPlayback(settings.playback),[key]:value}; persist(); }
  function policy() { return subtitlePolicy({preferences,languages:subtitleLanguages,audioLanguage:mediaTracks(video,'audio').find(row=>row.selected)?.track.language,remembered:remembered.subtitles}); }
  function resetRemembered() {
    clearTrackMemory(memoryState,context.meta); remembered = {}; audioLanguages = baseAudioLanguages; persist();
    manualAudio = manualSubtitles = false; audioScore = subtitleScore = Infinity; policyKey = ''; attemptedAudio.clear(); attemptedText.clear();
    // Keep the lifetime download budget when restoring global settings.
    stopDownload();
    renderCue(); scheduleAutomatic(); draw();
  }
  function stopDownload() { download?.abort(); download = null; downloading = ''; }
  function close() {
    if (!dialog) return;
    if (panelKind === 'subtitles') { stopDownload(); discovery?.abort(); discovery = null; }
    dialog.remove(); dialog = null; panelKind = null; error = '';
    onClose(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function row(title, subtitle, action, key, selectedRow = false) {
    return button([el('span', { class: 'grow' }, el('strong', {}, title), subtitle ? el('small', {}, subtitle) : null), el('span', { class: 'track-check', 'aria-hidden': 'true' }, selectedRow ? '✓' : '')], action,
      { class: `track-row${selectedRow ? ' selected-track' : ''}`, 'data-track-key': key, 'aria-pressed': String(selectedRow) });
  }
  async function chooseExternal(item, key, manual = false, guard = ()=>true) {
    stopDownload(); const controller = download = new AbortController(); downloading = key; error = ''; draw();
    try {
      const loaded = await fetchSubtitles(item, controller.signal);
      if (disposed || controller.signal.aborted || download !== controller) return;
      if (!guard()) { downloading = ''; download = null; return; }
      selectTextTrack(video); cues = loaded; selected = item; renderCue(); downloading = ''; download = null; if (manual) remember('subtitles',{kind:'external',language:item.lang,...subtitleFlags(item)}); draw(); return true;
    } catch (failure) {
      if (disposed || controller.signal.aborted || download !== controller) return;
      error = failure.message; downloading = ''; download = null; draw();
    }
  }
  function chooseNative(track) {
    stopDownload();
    try { selectTextTrack(video, track); selected = null; cues = []; error = ''; remember('subtitles',track ? {kind:'native',language:track.language,...subtitleFlags(track)} : {kind:'off'}); renderCue(); draw(); }
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
    finally { if (discovery === controller) { discovery = null; draw(); scheduleAutomatic(); } }
  }
  function draw() {
    if (!dialog || disposed) return;
    const activeKey = dialog.contains(document.activeElement) ? document.activeElement.dataset.trackKey : null;
    const railScroll = dialog.querySelector('.subtitle-language-rail')?.scrollTop || 0;
    const oldScroll = dialog.querySelector('.track-list')?.scrollTop || 0;
    const panel = el('section', { class: `track-panel${panelKind === 'subtitles' && !editor ? ' subtitle-filter-panel' : ''}` }, el('div', { class: 'track-heading' }, el('h2', {}, panelTitle(panelKind)), button('Fechar', close, { class: 'track-close', 'data-dismiss': true, 'data-track-key': 'close' })));
    const list = el('div', { class: 'track-list' });
    let rail;
    if (panelKind === 'audio') {
      const tracks = mediaTracks(video, 'audio');
      if (!tracks.length) list.append(el('p', { class: 'track-notice' }, 'Esta fonte não expôs faixas de áudio selecionáveis ao player.'));
      for (const entry of tracks) list.append(row(entry.name, entry.language, () => {
        manualAudio = true;
        try { selectAudioTrack(video, entry.track); error = ''; remember('audio',{language:entry.track.language}); scheduleAutomatic(); } catch (failure) { error = failure.message; } draw();
      }, `audio-${entry.index}`, entry.selected));
    } else if (panelKind === 'more') {
      list.append(row('Velocidade','',()=>open('speed'),'speed-menu'));
      list.append(row('Proporção da imagem',extraActions.aspectLabel(),()=>{extraActions.cycleAspect();draw();},'aspect'));
      list.append(row('Diagnóstico','',()=>{close();extraActions.diagnostics();},'diagnostics'));
    } else if (panelKind === 'speed') {
      for (const speed of playbackSpeeds) list.append(row(`${speed}×`, speed===1 ? 'Normal' : '',()=>chooseSpeed(speed),`speed-${speed}`,Math.abs(video.playbackRate-speed)<0.001));
      list.append(el('p',{class:'track-notice'},'Velocidade lembrada para este título neste perfil. A disponibilidade depende da fonte e do player da TV.'));
    } else {
      panel.append(row('Ajustes de legenda', editor ? 'Voltar à lista' : 'Tamanho, fundo e sincronização', () => { editor = !editor; draw(); }, 'style'));
      if (editor) {
        list.append(row('Tamanho', { 18: 'Pequeno', 24: 'Médio', 30: 'Grande' }[style.size], () => { const sizes = [18, 24, 30]; style.size = sizes[(sizes.indexOf(style.size) + 1) % 3]; persist(); renderCue(); draw(); }, 'size'));
        list.append(row('Remover descrições SDH', 'Apenas legendas externas', () => { setPreference('stripSdh',!preferences.stripSdh); renderCue(); draw(); }, 'sdh-cleanup', preferences.stripSdh));
        list.append(row('Fundo da legenda', style.background ? 'Ativado' : 'Desativado', () => { style.background = !style.background; persist(); renderCue(); draw(); }, 'background', style.background));
        list.append(el('p', { class: 'track-notice' }, `Atraso: ${delay > 0 ? '+' : ''}${delay.toFixed(1)} s. Valores positivos atrasam a legenda.`));
        for (const [key, title, change] of [['earlier', 'Adiantar 0,5 s', -.5], ['later', 'Atrasar 0,5 s', .5], ['reset', 'Zerar atraso', 0]]) list.append(row(title, '', () => { delay = change ? Math.max(-10, Math.min(10, delay + change)) : 0; if (profileKey === memoryState.profileStore?.activeKey) { saveDelay(memoryState,context,delay); persist(); } renderCue(); draw(); }, key));
        list.append(el('p', { class: 'track-notice' }, 'Netflix Sans · Ajustes para legendas externas. Atraso salvo para este filme ou episódio neste perfil. Outro episódio começa sem atraso.'));
      } else {
        const native = mediaTracks(video, 'text');
        const entries = [
          ...native.map(entry=>({key:`native-${entry.index}`,name:entry.name,lang:entry.track.language,source:'Interna',...subtitleFlags(entry.track),selected:!selected && entry.selected,action:()=>{manualSubtitles=true;chooseNative(entry.track);}})),
          ...external.map((item,index)=>({key:`external-${index}`,name:item.name || languageName(item.lang),lang:item.lang,source:item.source,...subtitleFlags(item),selected:selected?.url === item.url,action:()=>{manualSubtitles=true;chooseExternal(item,`external-${index}`,true);}})),
        ];
        const visible = entries.filter(item=>!preferences.onlyPreferredSubtitles || Number.isFinite(languageScore(item.lang,subtitleLanguages)) || item.selected);
        const counts = new Map(); for (const item of visible) { const key=languageCode(item.lang) || 'und'; counts.set(key,(counts.get(key)||0)+1); }
        if (languageFilter !== 'all' && !counts.has(languageFilter)) languageFilter = 'all';
        rail = el('div',{class:'subtitle-language-rail','aria-label':'Idiomas das legendas'});
        for (const code of ['all',...[...counts.keys()].sort((a,b)=>(languageScore(a,subtitleLanguages)-languageScore(b,subtitleLanguages)) || languageName(a).localeCompare(languageName(b)))]) {
          rail.append(row(code === 'all' ? 'Todos' : languageName(code), String(code === 'all' ? visible.length : counts.get(code)),()=>{languageFilter=code;draw();},`lang-${code}`,languageFilter===code));
        }
        panel.append(row('Mostrar só idiomas preferidos', 'O idioma em uso continua acessível',()=>{setPreference('onlyPreferredSubtitles',!preferences.onlyPreferredSubtitles);languageFilter='all';draw();},'preferred-only',preferences.onlyPreferredSubtitles));
        list.append(row('Desativadas', '', () => { manualSubtitles = true; chooseNative(null); }, 'off', !selected && !native.some(r => r.selected)));
        const filtered = visible.filter(item=>languageFilter==='all' || (languageCode(item.lang)||'und')===languageFilter);
        for (const item of filtered) list.append(row(item.name,downloading===item.key ? 'Carregando…' : [languageName(item.lang),item.source,item.forced?'Forçada':'',item.sdh?'SDH / CC':''].filter(Boolean).join(' · '),item.action,item.key,item.selected));
        if (!filtered.length) list.append(el('p',{class:'track-notice'},'Nenhuma legenda neste filtro. Use Todos ou desative o filtro de preferidos.'));
        list.append(row(discovery ? 'Buscando legendas…' : 'Atualizar legendas', '', discover, 'refresh'));
        if (info) list.append(el('p', { class: 'track-notice', role: 'status' }, info));
      }
    }
    if (['audio','subtitles'].includes(panelKind) && preferences.rememberTracks && (remembered.audio || remembered.subtitles)) panel.append(row('Usar idiomas dos ajustes', 'Esquecer escolhas deste título neste perfil', resetRemembered, 'forget-tracks'));
    if (error) panel.append(el('p', { class: 'track-error', role: 'alert' }, error));
    panel.append(rail ? el('div',{class:'subtitle-browser'},rail,list) : list); dialog.replaceChildren(panel); list.scrollTop = oldScroll; if (rail) rail.scrollTop=railScroll;
    if (activeKey) ([...dialog.querySelectorAll('[data-track-key]')].find(b => b.dataset.trackKey === activeKey) || dialog.querySelector('[data-dismiss]'))?.focus({ preventScroll: true });
  }
  function open(kind) {
    if (dialog) close();
    returnFocus = document.activeElement; panelKind = kind; editor = false; error = '';
    dialog = el('div', { class: `player-track-dialog${['speed','more'].includes(kind) ? ' player-speed-dialog' : ''}`, role: 'dialog', 'aria-modal': true, 'aria-label': panelTitle(kind) });
    screen.append(dialog); onOpen(); draw();
    (dialog.querySelector('.track-list .selected-track') || dialog.querySelector('.track-list button') || dialog.querySelector('[data-dismiss]'))?.focus();
    if (kind === 'subtitles' && !found) discover();
  }
  let watchedLists = [];
  // Coalesce platform events; selection itself may emit synchronous change events.
  function scheduleAutomatic() {
    if (disposed || autoQueued || !metadataReady) return;
    autoQueued = true;
    queueMicrotask(() => { autoQueued = false; if (!disposed) automatic(); });
  }
  async function automatic() {
    if (disposed) return;
    if (autoBusy) { autoDirty = true; return; }
    autoBusy = true;
    try {
      if (!manualAudio) {
        const rows = mediaTracks(video,'audio').map(row=>({...row,score:languageScore(row.track.language,audioLanguages)})).sort((a,b)=>a.score-b.score);
        for (const row of rows) {
          if (row.score >= audioScore || attemptedAudio.has(row.track)) continue;
          attemptedAudio.add(row.track);
          try { selectAudioTrack(video,row.track); audioScore = row.score; break; } catch (failure) { error = failure.message; }
        }
      }
      if (manualSubtitles) return;
      const currentPolicy = policy();
      const revision = JSON.stringify(currentPolicy);
      if (policyKey !== revision) {
        policyKey = revision; subtitleScore = selected ? subtitleScoreFor(selected,currentPolicy,'external') : Infinity; attemptedText.clear();
        if (!Number.isFinite(subtitleScore) && (selected || mediaTracks(video,'text').some(row=>row.selected))) { try { selectTextTrack(video); selected=null; cues=[]; renderCue(); } catch (failure) { error=failure.message; } }
      }
      if (currentPolicy.defer) { info='Aguardando o idioma do áudio para selecionar legendas forçadas. Você pode escolher manualmente.'; return; }
      if (info.startsWith('Aguardando o idioma do áudio')) info = '';
      if (currentPolicy.off) { try { if (mediaTracks(video,'text').some(row=>row.selected)) selectTextTrack(video); } catch (failure) { error = failure.message; } return; }
      const rows = mediaTracks(video,'text').map(row=>({...row,score:subtitleScoreFor(row.track,currentPolicy,'native')})).sort((a,b)=>a.score-b.score);
      for (const row of rows) {
        if (row.score >= subtitleScore || attemptedText.has(row.track)) continue;
        attemptedText.add(row.track);
        try { selectTextTrack(video,row.track); selected = null; cues = []; subtitleScore = row.score; renderCue(); break; } catch (failure) { error = failure.message; }
      }
      const candidates = external.map((item,index)=>({item,index,score:subtitleScoreFor(item,currentPolicy,'external')})).sort((a,b)=>a.score-b.score);
      for (const candidate of candidates) {
        if (manualSubtitles || disposed || attemptedExternal.size >= 3) break;
        const attemptKey = revision + candidate.item.url;
        if (candidate.score >= subtitleScore || attemptedExternal.has(attemptKey)) continue;
        attemptedExternal.add(attemptKey);
        if (await chooseExternal(candidate.item,`external-${candidate.index}`,false,()=>!manualSubtitles && JSON.stringify(policy())===revision)) subtitleScore = candidate.score;
        if (JSON.stringify(policy()) !== revision) { autoDirty=true; break; }
      }
      if (!manualSubtitles && !disposed && (preferences.addonSubtitles || remembered.subtitles?.kind === 'external') && currentPolicy.languages.length && subtitleScore > 0 && !autoDiscoveryAttempted && !found && !discovery) { autoDiscoveryAttempted = true; discover(); }
    } finally { autoBusy = false; draw(); if (autoDirty) { autoDirty = false; scheduleAutomatic(); } }
  }
  function tracksChanged() { if (dialog) draw(); scheduleAutomatic(); }
  function bindTracks() {
    for (const list of watchedLists) for (const event of ['addtrack', 'removetrack', 'change']) list.removeEventListener?.(event, tracksChanged);
    watchedLists = [video.audioTracks, video.textTracks].filter(Boolean);
    for (const list of watchedLists) for (const event of ['addtrack', 'removetrack', 'change']) list.addEventListener?.(event, tracksChanged);
    tracksChanged();
  }
  const ready = () => { metadataReady = true; if (desiredSpeed !== 1) chooseSpeed(desiredSpeed,false); bindTracks(); };
  video.addEventListener('loadedmetadata', ready); bindTracks();
  return {
    openMore: () => open('more'), openSpeed: () => open('speed'), openAudio: () => open('audio'), openSubtitles: () => open('subtitles'), isOpen: () => Boolean(dialog),
    dispose() {
      disposed = true; stopDownload(); discovery?.abort(); clearTimeout(timer); dialog?.remove(); overlay.remove();
      videoEvents.forEach(name => video.removeEventListener(name, renderCue)); video.removeEventListener('loadedmetadata', ready); video.removeEventListener('ratechange',rateChanged);
      for (const list of watchedLists) for (const event of ['addtrack', 'removetrack', 'change']) list.removeEventListener?.(event, tracksChanged);
    },
  };
}
