// SPDX-License-Identifier: GPL-3.0-only
import { playbackSpeeds, readSpeed, saveSpeed, readDelay, saveDelay, setPlaybackSpeed } from './core/playback-memory.js';
import { discoverSubtitles, normalizeSubtitles, fetchSubtitles, subtitleFrame } from './core/subtitles.js';
import { subtitleFlags, stripSdhText, subtitlePolicy, subtitleScoreFor, readTrackMemory, saveTrackMemory, clearTrackMemory } from './core/subtitle-options.js';
import { readPlayback, preferredLanguages, languageScore, languageCode } from './core/playback.js';
import { languageName, mediaTracks, selectAudioTrack } from './core/media-tracks.js';
import { clampSubtitleDelay, SUBTITLE_DELAY_LIMIT, SUBTITLE_DELAY_STEP, syncSubtitleDelay, formatSubtitleDelay, cueTimestamp, nearestCueIndex, selectSyncCues } from './core/subtitle-timing.js';
import {readSubtitleStyle,applySubtitleStyle} from './core/subtitle-style.js';
import {subtitleStyleEditor} from './subtitle-style-editor.js';
import { nativeSubtitles } from './core/native-subtitles.js';

export function installTrackControls({ screen, video, context, addons, settings, memoryState = {}, persist, el, button, onOpen, onClose }) {
  let dialog, panelKind, returnFocus, editor = false, delayEditor=false, discovery, download, downloading = '', error = '', info = '', found = false;
  let external = normalizeSubtitles(context.stream.subtitles, context.stream.addonName || 'Fonte');
  let selected = null, cues = [], delay = readDelay(memoryState,context), timer, disposed = false;
  let previousCue = null, previousStrip = null, renderedCue = '';
  const preferences = readPlayback(settings.playback);
  const device = navigator.languages?.length ? navigator.languages : [navigator.language];
  const profileKey = memoryState.profileStore?.activeKey;
  let desiredSpeed = readSpeed(memoryState,context.meta);
  const panelTitle = kind => ({audio:'Áudio',subtitles:'Legendas',speed:'Velocidade'}[kind]);
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
  let policyKey = '', syncSession = null, syncNoticeTimer;
  const baseAudioLanguages = preferredLanguages(preferences.audio, preferences.secondaryAudio, device, context.meta.originalLanguage || context.meta.original_language);
  const subtitleLanguages = preferredLanguages(preferences.subtitles, preferences.secondarySubtitles, device);
  let audioLanguages = remembered.audio ? [remembered.audio.language,...baseAudioLanguages.filter(l=>l!==remembered.audio.language)] : baseAudioLanguages;
  let manualAudio = false, manualSubtitles = false, autoBusy = false, autoQueued = false, audioScore = Infinity, subtitleScore = Infinity, metadataReady = false, autoDirty = false, autoDiscoveryAttempted = false;
  const attemptedAudio = new Set(), attemptedText = new Set(), attemptedExternal = new Set();
  // Preserve the requested default; only the new explicit appearance settings apply.
  const overlay = el('div', { class: 'subtitle-overlay', hidden: true, 'aria-label': 'Legenda' }); screen.append(overlay);
  applySubtitleStyle(screen,memoryState.subtitleAppearance);
  const native = nativeSubtitles(video, renderCue);
  let fontStatus = 'loading';
  // Check the actual bundled face, not just the CSS family (which can fall back).
  Promise.resolve().then(()=>document.fonts.load('500 19.44px "Netflix Sans"')).then(faces=>{
    if (disposed) return;
    fontStatus = faces.some(face=>face.status==='loaded') ? 'loaded' : 'error';
    native.setFontReady(fontStatus === 'loaded'); renderCue();
  }).catch(()=>{ if (!disposed) { fontStatus='error'; renderCue(); } });
  function textTracks() { const active=native.selected(); return mediaTracks(video,'text').map(row=>({...row,selected:row.selected || row.track===active})); }
  function renderCue() {
    clearTimeout(timer);
    if (disposed) return;
    const frame = selected ? subtitleFrame(cues, (video.currentTime || 0) - delay) : {text:native.text(),next:Infinity};
    if (previousCue !== frame.text || previousStrip !== preferences.stripSdh) {
      previousCue = frame.text; previousStrip = preferences.stripSdh; renderedCue = preferences.stripSdh ? stripSdhText(frame.text) : frame.text;
    }
    const text = renderedCue;
    if (overlay.textContent !== text) overlay.textContent = text;
    overlay.hidden = !text;
    overlay.dataset.renderer = selected ? 'external' : native.custom ? 'native-text' : 'tv';
    overlay.dataset.fontStatus = fontStatus;
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
    if (['subtitles','timing'].includes(panelKind)) { stopDownload(); discovery?.abort(); discovery = null; }
    syncSession = null;
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
      native.select(); cues = loaded; selected = item; renderCue(); downloading = ''; download = null; if (manual) remember('subtitles',{kind:'external',language:item.lang,...subtitleFlags(item)}); draw(); return true;
    } catch (failure) {
      if (disposed || controller.signal.aborted || download !== controller) return;
      error = failure.message; downloading = ''; download = null; draw();
    }
  }
  function chooseNative(track) {
    stopDownload();
    try { native.select(track); selected = null; cues = []; error = ''; remember('subtitles',track ? {kind:'native',language:track.language,...subtitleFlags(track)} : {kind:'off'}); renderCue(); draw(); }
    catch (failure) { error = failure.message; draw(); }
  }
  async function discover() {
    if (discovery) return;
    const controller = discovery = new AbortController(); info = 'Buscando legendas nos addons…'; draw();
    try {
      const result = await discoverSubtitles(addons, context, controller.signal);
      if (disposed || controller.signal.aborted || discovery !== controller) return;
      const seen = new Set();
      external = [...normalizeSubtitles(context.stream.subtitles, context.stream.addonName || 'Fonte'), ...result.subtitles, ...(selected ? [selected] : [])]
        .filter(item => { if (seen.has(item.url)) return false; seen.add(item.url); return true; }).slice(0, 300);
      found = true;
      info = result.failed ? `${result.failed} addon(s) não responderam. Você pode tentar novamente.` : external.length ? `${external.length} legenda(s) externa(s) disponível(is).` : 'Nenhuma legenda externa encontrada para este título.';
    } catch (failure) { if (!controller.signal.aborted) info = failure.message; }
    finally { if (discovery === controller) { discovery = null; draw(); scheduleAutomatic(); } }
  }
  function setDelay(value) {
    delay = clampSubtitleDelay(value);
    if (profileKey === memoryState.profileStore?.activeKey) { saveDelay(memoryState,context,delay); persist(); }
    renderCue();
  }
  function actionRow(title, action, key) {
    return button(title, action, {class:'track-action', 'data-track-key':key});
  }
  const syncNotice = el('div', {class:'subtitle-sync-result',role:'status',hidden:true}); screen.append(syncNotice);
  function syncUnavailable() {
    return !selected || !cues.length ? 'Selecione uma legenda externa SRT ou WebVTT para sincronizar por fala.' : '';
  }
  function openTiming() {
    if (syncUnavailable()) { error=syncUnavailable(); draw(); return; }
    // Freeze the selected file for this session. Reuse the already parsed cues;
    // no extra download or background language selection can replace it mid-sync.
    manualSubtitles=true; stopDownload(); discovery?.abort(); discovery=null;
    syncSession={url:selected.url,cues,captured:null}; panelKind='timing'; error='';
    dialog.className='player-track-dialog subtitle-timing-dialog';
    dialog.setAttribute('aria-label','Sincronizar por fala'); draw();
    dialog.querySelector('[data-track-key="capture"]')?.focus();
  }
  function applySync(cue) {
    if (!syncSession || syncSession.captured===null || selected?.url!==syncSession.url || document.hidden || disposed) return;
    setDelay(syncSubtitleDelay(syncSession.captured,cue.start));
    close(); clearTimeout(syncNoticeTimer); syncNotice.textContent=`Legenda sincronizada: ${formatSubtitleDelay(delay)}`; syncNotice.hidden=false;
    syncNoticeTimer=setTimeout(()=>{syncNotice.hidden=true;},4000);
  }
  function drawTiming() {
    const session=syncSession; if (!session) return;
    const activeKey=dialog.contains(document.activeElement) ? document.activeElement.dataset.trackKey : null;
    const oldScroll=dialog.querySelector('.sync-cue-list')?.scrollTop || 0;
    const captured=session.captured!==null;
    const panel=el('section',{class:`subtitle-timing-panel${captured?' picking-line':''}`});
    // Back uses the same dialog dismissal contract as other player overlays.
    const dismiss=button('Cancelar sincronização',close,{'data-dismiss':true,hidden:true,tabindex:-1});
    if (!captured) {
      panel.append(el('h2',{},'Ao ouvir o início de uma fala, pressione Sincronizar.'),button('Sincronizar',()=>{
        if (document.hidden || video.seeking || !Number.isFinite(video.currentTime)) { error='Aguarde o vídeo estar pronto para marcar a fala.'; draw(); return; }
        session.captured=video.currentTime; error=''; draw();
        const items=selectSyncCues(session.cues,session.captured);
        const target=dialog.querySelector(`[data-track-key="cue-${nearestCueIndex(items,session.captured)}"]`);
        target?.focus({preventScroll:true}); target?.scrollIntoView({block:'nearest'});
      },{'data-track-key':'capture',class:'sync-capture'}));
      if (video.paused) panel.append(actionRow('Reproduzir vídeo',()=>{video.play().catch(()=>{error='Não foi possível retomar o vídeo.';draw();});},'sync-play'));
    } else {
      panel.append(el('div',{class:'sync-heading'},el('span',{},`Momento marcado: ${cueTimestamp(session.captured)}`),el('small',{},languageName(selected?.lang))));
      const list=el('div',{class:'sync-cue-list','aria-label':'Escolha a fala que você ouviu'});
      selectSyncCues(session.cues,session.captured).forEach((cue,index)=>list.append(button([
        el('span',{class:'sync-cue-time'},cueTimestamp(cue.start)),el('span',{class:'sync-cue-text',dir:'auto'},cue.text.replace(/\\[Nn]|\s+/g,' ').trim())
      ],()=>applySync(cue),{class:'sync-cue','data-track-key':`cue-${index}`})));
      panel.append(list,el('p',{class:'sync-hint'},'Escolha a fala que você ouviu. Pressione Voltar para cancelar.'));
    }
    if(error) panel.append(el('p',{class:'track-error',role:'alert'},error));
    dialog.replaceChildren(dismiss,panel);
    const list=dialog.querySelector('.sync-cue-list'); if(list)list.scrollTop=oldScroll;
    if(activeKey) (dialog.querySelector(`[data-track-key="${activeKey}"]`) || dialog.querySelector('[data-track-key="capture"]'))?.focus({preventScroll:true});
  }
  function draw() {
    if (!dialog || disposed) return;
    if (panelKind==='timing') { drawTiming(); return; }
    const activeKey = dialog.contains(document.activeElement) ? document.activeElement.dataset.trackKey : null;
    const oldScroll = dialog.querySelector('.track-list')?.scrollTop || 0;
    const panel = el('section', { class: 'track-panel' }, el('div', { class: 'track-heading' }, el('h2', {}, panelTitle(panelKind))));
    const dismiss=button('Fechar',close,{'data-dismiss':true,hidden:true,tabindex:-1});
    const list = el('div', { class: 'track-list' });
    if (panelKind === 'audio') {
      panel.append(actionRow(editor ? 'Voltar às faixas' : 'Ajustes de áudio',()=>{editor=!editor;draw();},'audio-adjustments'));
      if(editor) {
        list.append(el('p',{class:'track-notice'},'Atraso de áudio, amplificação e mixagem de voz ainda não estão disponíveis neste player webOS.'));
      } else {
        const tracks = mediaTracks(video, 'audio');
        if (!tracks.length) list.append(el('p', { class: 'track-notice' }, 'Esta fonte não expôs faixas de áudio selecionáveis ao player.'));
        for (const entry of tracks) list.append(row(entry.name, entry.language, () => {
          manualAudio = true;
          try { selectAudioTrack(video, entry.track); error = ''; remember('audio',{language:entry.track.language}); scheduleAutomatic(); } catch (failure) { error = failure.message; } draw();
        }, `audio-${entry.index}`, entry.selected));
      }
    } else if (panelKind === 'speed') {
      for (const speed of playbackSpeeds) list.append(row(`${speed}×`, speed===1 ? 'Normal' : '',()=>chooseSpeed(speed),`speed-${speed}`,Math.abs(video.playbackRate-speed)<0.001));
      list.append(el('p',{class:'track-notice'},'Velocidade lembrada para este título neste perfil. A disponibilidade depende da fonte e do player da TV.'));
    } else {
      panel.append(actionRow(editor ? 'Voltar às faixas' : 'Ajustes de legenda', () => { editor = !editor; delayEditor=false; draw(); }, 'style'));
      if (editor) {
        list.append(actionRow(delayEditor?'Voltar à aparência':`Atraso: ${formatSubtitleDelay(delay)}`,()=>{delayEditor=!delayEditor;draw();},'delay-editor'));
        if(delayEditor){
        const unavailable=syncUnavailable();
        const sync=actionRow('Sincronizar por fala',openTiming,'sync'); sync.disabled=Boolean(unavailable); list.append(sync);
        list.append(el('p',{class:'track-notice'},unavailable || 'Marque o início de uma fala e escolha a frase correspondente.'));
        list.append(el('p', { class: 'track-notice', 'data-delay-value':true }, `Atraso: ${formatSubtitleDelay(delay)}`));
        const stepper=el('div',{class:'subtitle-delay-stepper'});
        for (const [key,title,change] of [['earlier','Adiantar 0,1 s',-SUBTITLE_DELAY_STEP],['later','Atrasar 0,1 s',SUBTITLE_DELAY_STEP]]) {
          const control=button(change<0?'−':'+',()=>{setDelay(delay+change);draw();},{'aria-label':title,'data-track-key':key});
          control.disabled=!selected || (change<0 ? delay<=-SUBTITLE_DELAY_LIMIT : delay>=SUBTITLE_DELAY_LIMIT); stepper.append(control);
        }
        list.append(stepper,row('Zerar atraso','',()=>{setDelay(0);draw();},'reset'));
        list.append(el('p',{class:'track-notice'},'Ajuste de até ±180 s para legendas externas, salvo para este filme ou episódio. Valores positivos atrasam a legenda.'));
        }else list.append(subtitleStyleEditor({el,button,value:memoryState.subtitleAppearance,disabled:Boolean(!selected && native.selected() && !native.custom),change:value=>{if(disposed || profileKey!==memoryState.profileStore?.activeKey)return;memoryState.subtitleAppearance=readSubtitleStyle(value);persist();applySubtitleStyle(screen,value);draw();}}));
        list.append(row('Remover descrições SDH', 'Ocultar descrições de sons e identificação de falantes', () => { setPreference('stripSdh',!preferences.stripSdh); renderCue(); draw(); }, 'sdh-cleanup', preferences.stripSdh));
        list.append(row('Mostrar só idiomas preferidos', 'O idioma em uso continua acessível',()=>{setPreference('onlyPreferredSubtitles',!preferences.onlyPreferredSubtitles);draw();},'preferred-only',preferences.onlyPreferredSubtitles));
      } else {
        const native = textTracks();
        const entries = [
          ...native.map(entry=>({key:`native-${entry.index}`,name:entry.name,lang:entry.track.language,source:'Interna',...subtitleFlags(entry.track),selected:!selected && entry.selected,action:()=>{manualSubtitles=true;chooseNative(entry.track);}})),
          ...external.map((item,index)=>({key:`external-${index}`,name:item.name || languageName(item.lang),lang:item.lang,source:item.source,...subtitleFlags(item),selected:selected?.url === item.url,action:()=>{manualSubtitles=true;chooseExternal(item,`external-${index}`,true);}})),
        ];
        const visible = entries.filter(item=>!preferences.onlyPreferredSubtitles || Number.isFinite(languageScore(item.lang,subtitleLanguages)) || item.selected);
        visible.sort((a,b)=>(languageScore(a.lang,subtitleLanguages)-languageScore(b.lang,subtitleLanguages)) || languageName(a.lang).localeCompare(languageName(b.lang)));
        list.append(row('Desativadas', '', () => { manualSubtitles = true; chooseNative(null); }, 'off', !selected && !native.some(r => r.selected)));
        for (const item of visible) {
          const language=languageName(item.lang), variant=[language,languageCode(item.lang)].some(value=>value.toLowerCase()===item.name.toLowerCase()) ? '' : item.name;
          list.append(row(`${[language,variant].filter(Boolean).join(' ')} — ${item.source}`,downloading===item.key ? 'Carregando…' : [item.forced?'Forçada':'',item.sdh?'SDH / CC':''].filter(Boolean).join(' · '),item.action,item.key,item.selected));
        }
        if (!visible.length) list.append(el('p',{class:'track-notice'},'Nenhuma legenda disponível. Confira os idiomas preferidos nos ajustes ou atualize a lista.'));
        list.append(actionRow(discovery ? 'Buscando legendas…' : 'Atualizar legendas', discover, 'refresh'));
        if (info) list.append(el('p', { class: 'track-notice', role: 'status' }, info));
      }
    }
    if (['audio','subtitles'].includes(panelKind) && preferences.rememberTracks && (remembered.audio || remembered.subtitles)) list.append(row('Usar idiomas dos ajustes', 'Esquecer escolhas deste título neste perfil', resetRemembered, 'forget-tracks'));
    if (error) list.append(el('p', { class: 'track-error', role: 'alert' }, error));
    panel.append(list); dialog.replaceChildren(dismiss,panel); list.scrollTop = oldScroll;
    if (activeKey) {
      const previous=[...dialog.querySelectorAll('[data-track-key]')].find(b => b.dataset.trackKey === activeKey && !b.disabled);
      const fallback=dialog.querySelector('.subtitle-delay-stepper button:not(:disabled), .track-action, .track-list button:not(:disabled)');
      (previous || fallback)?.focus({ preventScroll: true });
    }
  }
  function open(kind) {
    if (dialog) close();
    returnFocus = document.activeElement; panelKind = kind; editor = false; delayEditor=false; error = ''; syncNotice.hidden=true; clearTimeout(syncNoticeTimer);
    dialog = el('div', { class: `player-track-dialog${kind==='speed' ? ' player-speed-dialog' : ''}`, role: 'dialog', 'aria-modal': true, 'aria-label': panelTitle(kind) });
    screen.append(dialog); onOpen(); draw();
    (dialog.querySelector('.track-list .selected-track') || dialog.querySelector('.track-list button') || dialog.querySelector('.track-action'))?.focus();
    if (kind === 'subtitles' && !found) discover();
  }
  const timingPlaybackChanged=()=>{ if(panelKind==='timing' && syncSession?.captured===null) draw(); };
  video.addEventListener('play',timingPlaybackChanged); video.addEventListener('pause',timingPlaybackChanged);
  const suspendTiming=()=>{if(document.hidden && panelKind==='timing')close();};
  document.addEventListener('visibilitychange',suspendTiming);
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
        if (!Number.isFinite(subtitleScore) && (selected || textTracks().some(row=>row.selected))) { try { native.select(); selected=null; cues=[]; renderCue(); } catch (failure) { error=failure.message; } }
      }
      if (currentPolicy.defer) { info='Aguardando o idioma do áudio para selecionar legendas forçadas. Você pode escolher manualmente.'; return; }
      if (info.startsWith('Aguardando o idioma do áudio')) info = '';
      if (currentPolicy.off) { try { if (textTracks().some(row=>row.selected)) native.select(); } catch (failure) { error = failure.message; } return; }
      const rows = textTracks().map(row=>({...row,score:subtitleScoreFor(row.track,currentPolicy,'native')})).sort((a,b)=>a.score-b.score);
      for (const row of rows) {
        if (row.score >= subtitleScore || attemptedText.has(row.track)) continue;
        attemptedText.add(row.track);
        try { native.select(row.track); selected = null; cues = []; subtitleScore = row.score; renderCue(); break; } catch (failure) { error = failure.message; }
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
  function tracksChanged() { renderCue(); if (dialog) draw(); scheduleAutomatic(); }
  function bindTracks() {
    for (const list of watchedLists) for (const event of ['addtrack', 'removetrack', 'change']) list.removeEventListener?.(event, tracksChanged);
    watchedLists = [video.audioTracks, video.textTracks].filter(Boolean);
    for (const list of watchedLists) for (const event of ['addtrack', 'removetrack', 'change']) list.addEventListener?.(event, tracksChanged);
    tracksChanged();
  }
  const ready = () => { metadataReady = true; if (desiredSpeed !== 1) chooseSpeed(desiredSpeed,false); bindTracks(); };
  // The user asked for subtitles to be ready before the first frame, so the player awaits
  // this bounded preparation (loadedmetadata + the automatic choice, including an external
  // add-on subtitle download) instead of starting playback and fixing the track later.
  async function prepareSubtitles(timeout = 3500) {
    if (disposed) return 'skipped';
    const deadline = Date.now() + timeout;
    while (!disposed && !metadataReady && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    if (disposed || !metadataReady) return 'skipped';
    await Promise.race([automatic().catch(() => {}), new Promise(resolve => setTimeout(resolve, Math.max(0, deadline - Date.now())))]);
    return disposed ? 'skipped' : 'ready';
  }
  video.addEventListener('loadedmetadata', ready); bindTracks();
  return {
    openSpeed: () => open('speed'), openAudio: () => open('audio'), openSubtitles: () => open('subtitles'), isOpen: () => Boolean(dialog),
    prepareSubtitles,
    key(key,event) {
      if (!dialog || !['MediaPlay','MediaPause','MediaStop','MediaRewind','MediaFastForward',' '].includes(key)) return false;
      event.preventDefault();
      if(panelKind==='timing' && syncSession?.captured===null) {
        if(key==='MediaPause')video.pause();
        else if(key==='MediaPlay' || key===' ') { if(key===' ' && !video.paused)video.pause(); else video.play().catch(()=>{error='Não foi possível retomar o vídeo.';draw();}); }
      }
      return true;
    },
    dispose() {
      syncSession=null; clearTimeout(syncNoticeTimer); syncNotice.remove();
      video.removeEventListener('play',timingPlaybackChanged);video.removeEventListener('pause',timingPlaybackChanged);document.removeEventListener('visibilitychange',suspendTiming);
      disposed = true; native.dispose(); stopDownload(); discovery?.abort(); clearTimeout(timer); dialog?.remove(); overlay.remove();
      videoEvents.forEach(name => video.removeEventListener(name, renderCue)); video.removeEventListener('loadedmetadata', ready); video.removeEventListener('ratechange',rateChanged);
      for (const list of watchedLists) for (const event of ['addtrack', 'removetrack', 'change']) list.removeEventListener?.(event, tracksChanged);
    },
  };
}
