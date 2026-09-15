// SPDX-License-Identifier: GPL-3.0-only
// PlayerSettingsDataStore / PlayerNextEpisodeRules at Android fork 45e0984.
import { episodeList } from './presentation.js';
const aliases = { por:'pt', pob:'pt-br', eng:'en', spa:'es', fre:'fr', fra:'fr', ger:'de', deu:'de', ita:'it', jpn:'ja', kor:'ko', zho:'zh', chi:'zh', rus:'ru', ara:'ar', hin:'hi', dut:'nl', nld:'nl' };
export function languageCode(value) {
  const code = String(value || '').trim().toLowerCase().replaceAll('_','-');
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) || ['und','unk'].includes(code)) return '';
  const [base,...rest] = code.split('-'); return [aliases[base] || base,...rest].join('-');
}
export const playbackDefaults = Object.freeze({ audio:'device', secondaryAudio:'', subtitles:'device', secondarySubtitles:'', addonSubtitles:false, forcedSubtitles:false, stripSdh:false, onlyPreferredSubtitles:false, rememberTracks:true, autoNext:false, stillWatching:false, stillWatchingThreshold:3, preferBingeGroup:true, nextFallback:true, thresholdMode:'percentage', thresholdPercent:99, thresholdMinutes:2 });
export function readPlayback(value = {}) {
  const result = {...playbackDefaults};
  for (const key of ['audio','secondaryAudio','subtitles','secondarySubtitles']) {
    const allowed = key === 'audio' ? ['device','default','original'] : key === 'subtitles' ? ['device','off'] : [''];
    if (typeof value?.[key] === 'string' && (allowed.includes(value[key]) || languageCode(value[key]))) result[key] = value[key];
  }
  for (const key of ['forcedSubtitles','stripSdh','onlyPreferredSubtitles','rememberTracks','addonSubtitles','autoNext','stillWatching','preferBingeGroup','nextFallback']) if (typeof value?.[key] === 'boolean') result[key] = value[key];
  if (value?.thresholdMode === 'minutes') result.thresholdMode = 'minutes';
  for (const [key,min,max] of [['thresholdPercent',97,100],['thresholdMinutes',0,3.5]]) if (Number.isFinite(value?.[key])) result[key] = Math.max(min,Math.min(max,value[key]));
  if (Number.isInteger(value?.stillWatchingThreshold)) result.stillWatchingThreshold = Math.max(2,Math.min(6,value.stillWatchingThreshold));
  return result;
}
export function preferredLanguages(primary, secondary, device = [], original = '') {
  if (primary === 'off') return [];
  const first = primary === 'device' || (primary === 'original' && !languageCode(original)) ? device : primary === 'original' ? [original] : primary === 'default' ? [] : [primary];
  return [...new Set([...first,secondary].map(languageCode).filter(Boolean))];
}
export function languageScore(code, preferred) {
  const normalized = languageCode(code); if (!normalized) return Infinity;
  return preferred.reduce((best, item, index) => Math.min(best, normalized === item ? index*2 : normalized.split('-')[0] === item.split('-')[0] ? index*2+1 : Infinity), Infinity);
}
export function followingEpisode(meta, id, now = Date.now()) {
  if (meta.type !== 'series') return null;
  const episodes = episodeList(meta), index = episodes.findIndex(v => v.id === id);
  if (index < 0 || index === episodes.length-1) return null;
  const video = episodes[index+1], released = Date.parse(video.released);
  return {...video, hasAired: !Number.isFinite(released) || released <= now};
}
export function nextThreshold(time, duration, settings) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0 || time < 0) return false;
  const prefs = readPlayback(settings);
  return prefs.thresholdMode === 'minutes' ? duration-time <= prefs.thresholdMinutes*60 : time/duration >= prefs.thresholdPercent/100;
}
// Input is already ranked and restricted to playable HTTP(S) sources.
export function nextSource(ranked, bingeGroup, settings) {
  const prefs = readPlayback(settings);
  if (prefs.preferBingeGroup && bingeGroup) {
    const match = ranked.find(s => s.behaviorHints?.bingeGroup === bingeGroup);
    if (match || !prefs.nextFallback) return match || null;
  }
  return ranked[0] || null;
}
