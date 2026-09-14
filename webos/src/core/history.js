// SPDX-License-Identifier: GPL-3.0-only
// WatchProgressSyncService / WatchedItemsSyncService: milliseconds, explicit profile.
const keyFor = (type, id) => JSON.stringify([type, id]);
export const watchedKey = (type, id, season = null, episode = null) => JSON.stringify([type, id, season, episode]);
const validNumber = value => Number.isSafeInteger(value) && value >= 0;
const newest = (object, limit) => Object.fromEntries(Object.entries(object).sort((a,b) => (b[1].updated || 0) - (a[1].updated || 0)).slice(0, limit));
export function historySource(rows, profileId) {
  if (!Array.isArray(rows) || rows.length > 1 || rows.some(r => r.profile_id !== undefined && r.profile_id !== profileId)) throw Error('Preferências de histórico inválidas.');
  const encoded = rows[0]?.settings_json?.features?.trakt_settings?.watch_progress_source;
  if (encoded !== undefined && (encoded?.type !== 'string' || !['TRAKT','SIMKL','MDBLIST','NUVIO_SYNC'].includes(encoded.value))) throw Error('Fonte de histórico não reconhecida.');
  return encoded?.value || 'TRAKT'; // WatchProgressSource.fromStorage default in the fork.
}
export function parseHistory(progressRows, watchedRows, profileId) {
  const validRow = row => row && typeof row.content_id === 'string' && row.content_id.length > 0 && row.content_id.length <= 512 && ['movie','series'].includes(row.content_type) && (row.profile_id === undefined || row.profile_id === profileId);
  if (!Array.isArray(progressRows) || !Array.isArray(watchedRows)) throw Error('Histórico inválido.');
  const progress = {}, watched = {}, candidates = [];
  for (const row of progressRows) {
    if (!validRow(row) || !validNumber(row.position) || !validNumber(row.duration) || !validNumber(row.last_watched)) throw Error('O histórico retornou dados inválidos ou de outro perfil.');
    if (!row.duration || !row.position) continue;
    const episode = row.content_type === 'series' && validNumber(row.season) && validNumber(row.episode) ? { season: row.season, episode: row.episode } : null;
    if (row.content_type === 'series' && !episode) continue; // A title mirror without an episode cannot be resumed safely.
    if (typeof row.video_id !== 'string' || row.video_id.length > 512) throw Error('Identificador de vídeo inválido no histórico.');
    candidates.push({row, episode});
  }
  const groups = new Map();
  for (const item of candidates.sort((a,b) => b.row.last_watched - a.row.last_watched)) {
    const r = item.row, identity = watchedKey(r.content_type, r.content_id, item.episode?.season ?? null, item.episode?.episode ?? null);
    if (!groups.has(identity)) groups.set(identity, item);
  }
  for (const {row:r, episode} of groups.values()) {
    const explicit = episode && candidates.find(c => c.row.content_id === r.content_id && c.episode?.season === episode.season && c.episode?.episode === episode.episode && c.row.video_id && c.row.video_id !== r.content_id);
    const id = episode ? explicit?.row.video_id || (r.video_id && r.video_id !== r.content_id ? r.video_id : `${r.content_id}:${episode.season}:${episode.episode}`) : r.content_id;
    progress[keyFor(r.content_type,id)] = { type:r.content_type, id, meta:{id:r.content_id,type:r.content_type,name:r.content_id}, episode, time:Math.min(r.position,r.duration)/1000, duration:r.duration/1000, updated:r.last_watched, complete:r.position/r.duration >= .9, origin:'nuvio' };
  }
  for (const row of watchedRows) {
    if (!validRow(row) || !validNumber(row.watched_at)) throw Error('Os assistidos retornaram dados inválidos ou de outro perfil.');
    const season = row.season ?? null, episode = row.episode ?? null;
    if ((season === null) !== (episode === null) || (season !== null && (!validNumber(season) || !validNumber(episode)))) throw Error('Episódio inválido nos assistidos.');
    const key = watchedKey(row.content_type,row.content_id,season,episode);
    const value = {type:row.content_type,id:row.content_id,name:String(row.title || row.content_id).slice(0,300),season,episode,updated:row.watched_at,value:true,origin:'nuvio'};
    if (!watched[key] || watched[key].updated < value.updated) watched[key] = value;
  }
  return {progress,watched};
}
export function initializeHistory(state) {
  state.watchedOverrides ||= {};
  if (state.historyInitialized) return;
  for (const [key,value] of Object.entries(state.watched || {})) {
    try { const [type,id] = JSON.parse(key); const k = watchedKey(type,id); state.watchedOverrides[k] ||= {type,id,name:state.library[key]?.name || id,season:null,episode:null,value:value === true,updated:0,origin:'local'}; } catch {}
  }
  state.watchedRecords = {...(state.watchedRecords || {}), ...state.watchedOverrides};
  state.historyInitialized = true;
}
export function rebuildWatched(state) {
  state.watched = {};
  for (const record of Object.values(state.watchedRecords || {})) if (record.season === null) state.watched[keyFor(record.type,record.id)] = record.value;
}
const signature = row => JSON.stringify([row?.updated,row?.time,row?.duration,row?.value]);
function conflictKey(kind,key) { return `${kind}:${key}`; }
export function mergeHistory(state, snapshot, {sourcePreference = 'NUVIO_SYNC', profileId} = {}) {
  initializeHistory(state);
  const progress = {}, conflicts = {}, localProgress = Object.fromEntries(Object.entries(state.progress).filter(([,p]) => p.origin !== 'nuvio'));
  for (const [key,remote] of Object.entries(snapshot.progress)) {
    const old = state.progress[key];
    progress[key] = {...remote, meta:{...remote.meta,...(old?.meta?.id === remote.meta.id ? old.meta : {}),...(state.library[keyFor(remote.type,remote.meta.id)] || {})}};
    const local = localProgress[key], ck = conflictKey('progress',key);
    if (local && (Math.abs(local.time-remote.time) > 1 || Math.abs(local.duration-remote.duration) > 1) && remote.updated > local.updated && state.historyChoices?.[ck] !== signature(remote)) conflicts[ck] = {kind:'progress',key,local,remote:progress[key]};
  }
  // Every local record is unsent in this read-only milestone; preserve it, even if older.
  Object.assign(progress,localProgress);
  const watched = {...snapshot.watched};
  for (const [key,local] of Object.entries(state.watchedOverrides)) {
    const remote = watched[key], ck = conflictKey('watched',key);
    if (remote && local.value !== remote.value && remote.updated > local.updated && state.historyChoices?.[ck] !== signature(remote)) conflicts[ck] = {kind:'watched',key,local,remote};
    watched[key] = local;
  }
  state.progress = newest(progress,100); state.watchedRecords = newest(watched,2000); state.historyConflicts = Object.fromEntries(Object.entries(conflicts).filter(([,c]) => c.kind !== 'progress' || state.progress[c.key]).slice(0,100));
  rebuildWatched(state);
  state.historySync = {at:Date.now(),profileId,sourcePreference,progressCount:Object.keys(snapshot.progress).length,watchedCount:Object.keys(snapshot.watched).length};
}
export function resolveHistoryConflict(state, id, useRemote) {
  const c = state.historyConflicts?.[id]; if (!c) return;
  const current = c.kind === 'progress' ? state.progress[c.key] : state.watchedOverrides[c.key];
  if (signature(current) !== signature(c.local)) throw Error('O histórico local mudou. Atualize antes de resolver este conflito.');
  if (useRemote) {
    if (c.kind === 'progress') state.progress[c.key] = c.remote;
    else { delete state.watchedOverrides[c.key]; state.watchedRecords[c.key] = c.remote; rebuildWatched(state); }
  } else {
    state.historyChoices ||= {}; state.historyChoices[id] = signature(c.remote);
    const keys=Object.keys(state.historyChoices); if(keys.length>100) delete state.historyChoices[keys[0]];
  }
  delete state.historyConflicts[id];
}
export function markWatched(state, record, value) {
  initializeHistory(state); state.watchedRecords ||= {};
  const k = watchedKey(record.type,record.id,record.season ?? null,record.episode ?? null);
  if (!state.watchedOverrides[k] && Object.keys(state.watchedOverrides).length >= 2000) throw Error('Limite de 2.000 marcações locais atingido neste perfil.');
  const item = {type:record.type,id:record.id,name:record.name || record.id,season:record.season ?? null,episode:record.episode ?? null,value,updated:Date.now(),origin:'local'};
  state.watchedOverrides[k] = item; state.watchedRecords[k] = item; rebuildWatched(state);
  delete state.historyConflicts?.[conflictKey('watched',k)];
}
export function isWatched(state, progress) {
  const records = state.watchedRecords || {};
  const exact = records[watchedKey(progress.type,progress.meta.id,progress.episode?.season ?? null,progress.episode?.episode ?? null)] || records[watchedKey(progress.type,progress.meta.id)];
  return exact ? exact.value && (!progress.updated || exact.updated >= progress.updated || progress.complete || (exact.origin === 'local' && !exact.updated)) : state.watched[keyFor(progress.type,progress.meta.id)] === true;
}
export function progressWithWatched(state, meta) {
  const result = {...state.progress};
  for(const video of meta.videos || []) {
    const record=state.watchedRecords?.[watchedKey(meta.type,meta.id,video.season,video.episode)];
    const existing = result[keyFor(meta.type,video.id)];
    if(record?.value && (!existing || existing.complete || record.updated >= existing.updated)) result[keyFor(meta.type,video.id)] = {...result[keyFor(meta.type,video.id)],complete:true,updated:record.updated};
  }
  return result;
}
export function historySummary(state) {
  const s=state.historySync;
  if(!s) return 'Histórico da conta ainda não carregado.';
  const extra=['TRAKT','SIMKL'].includes(s.sourcePreference) ? ` ${s.sourcePreference === 'TRAKT' ? 'Trakt' : 'Simkl'} está selecionado no Android, mas ainda não está conectado nesta TV; usando Nuvio Sync.` : s.sourcePreference === 'MDBLIST' ? ' Apenas o histórico Nuvio foi importado; a parte MDBList ainda está pendente.' : '';
  return `${s.progressCount} registro(s) de progresso e ${s.watchedCount} assistido(s) da conta.${extra} Alterações desta TV ainda são locais.`;
}

export function continueHistory(state) {
  const seen=new Set();
  return Object.values(state.progress).sort((a,b)=>b.updated-a.updated).filter(p=>{
    const key=keyFor(p.type,p.meta.id);if(seen.has(key))return false;seen.add(key);
    return !p.complete && p.time/p.duration >= .02 && !isWatched(state,p);
  }).slice(0,12);
}
