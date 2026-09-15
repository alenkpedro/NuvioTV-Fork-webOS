// SPDX-License-Identifier: GPL-3.0-only
// SubtitleSdhFilter / PlayerRuntimeControllerTracks / TrackPreferenceDataStore @ 45e0984.
import { languageCode, languageScore } from './playback.js';
export function subtitleFlags(item = {}) {
  let path = ''; try { path = decodeURIComponent(new URL(item.url).pathname); } catch {}
  const hint = [item.name,item.label,item.id,path].map(x=>String(x || '').slice(0,2048)).join(' ');
  const forced = typeof item.forced === 'boolean' ? item.forced : typeof item.isForced === 'boolean' ? item.isForced : /(?:^|[^a-z])(?:forced|forçad[ao]s?)(?:$|[^a-z])/i.test(hint);
  const sdh = typeof item.sdh === 'boolean' ? item.sdh : typeof item.hearingImpaired === 'boolean' ? item.hearingImpaired : item.kind === 'captions' || /(?:^|[^a-z])(?:sdh|cc|hearing[ _-]impaired)(?:$|[^a-z])/i.test(hint);
  return {forced,sdh};
}
export function stripSdhText(text) {
  return String(text)
    .replace(/[<>]{2,}[ \t]*/g,'')
    .replace(/^([ \t]*-[ \t]*)?(?:[A-Za-z0-9 ()'#.,]+|\[[^\]\r\n]*\]):(?=\s|$)[ \t]*/gm,(_,dash)=>dash || '')
    .replace(/\[[^\]]*\][ \t]*/g,'')
    .replace(/(?:\((?=[A-Za-z0-9 '#.,"\\\-\r\n]*\))(?![0-9]*\))[^)]*\)|（(?=[A-Za-z0-9 '#.,"\\\-\r\n]*）)(?![0-9]*）)[^）]*）)[ \t]*/g,'')
    .split('\n').filter(line=>/[^\s-]/.test(line)).join('\n');
}
export function subtitlePolicy({preferences,languages,audioLanguage,remembered}) {
  if (remembered?.kind === 'off' || (!remembered && preferences.subtitles === 'off')) return {languages:[],forced:false,off:true};
  if (remembered?.language) return {languages:[remembered.language,...languages.filter(l=>l!==remembered.language)],forced:remembered.forced,kind:remembered.kind,sdh:remembered.sdh};
  if (preferences.forcedSubtitles && !languageCode(audioLanguage)) return {languages:[],forced:false,defer:true};
  const audio = languageCode(audioLanguage), target = languageCode(languages[0]);
  const sameVariant = audio === target || (audio.split('-')[0] === target.split('-')[0] && (!audio.includes('-') || !target.includes('-')));
  const forced = preferences.forcedSubtitles && languages.length>0 && sameVariant;
  return {languages:forced ? languages.slice(0,1) : languages,forced};
}
export function subtitleScoreFor(item, policy, kind) {
  const flags = subtitleFlags(item);
  if (policy.off || policy.defer || flags.forced !== Boolean(policy.forced)) return Infinity;
  const score = languageScore(item.lang || item.language,policy.languages);
  return score + (policy.kind && policy.kind !== kind ? .25 : 0) + (typeof policy.sdh === 'boolean' && policy.sdh !== flags.sdh ? .125 : 0);
}
export const trackMemoryKey = meta => ['movie','series'].includes(meta?.type) && typeof meta.id === 'string' && meta.id && meta.id.length<=512 ? JSON.stringify([meta.type,meta.id]) : null;
function cleanChoice(value,kind) {
  if (kind === 'subtitles' && value?.kind === 'off') return {kind:'off'};
  const language=languageCode(value?.language); if (!language) return null;
  return kind === 'audio' ? {language} : ['native','external'].includes(value.kind) ? {language,kind:value.kind,forced:value.forced===true,sdh:value.sdh===true} : null;
}
export function readTrackMemory(state,meta) {
  const saved=state.trackPreferences?.[trackMemoryKey(meta)];
  return {audio:cleanChoice(saved?.audio,'audio'),subtitles:cleanChoice(saved?.subtitles,'subtitles')};
}
export function saveTrackMemory(state,meta,kind,choice) {
  const key=trackMemoryKey(meta); if (!key || !['audio','subtitles'].includes(kind)) return;
  const current=readTrackMemory(state,meta); current[kind]=cleanChoice(choice,kind);
  const items=Object.entries(state.trackPreferences || {}).filter(([k])=>k!==key).slice(-99);
  state.trackPreferences=Object.fromEntries([...items,[key,current]]);
}
export function clearTrackMemory(state,meta) { if (state.trackPreferences) delete state.trackPreferences[trackMemoryKey(meta)]; }
