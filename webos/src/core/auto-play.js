// SPDX-License-Identifier: GPL-3.0-only
// StreamAutoPlaySelector.kt and StreamAutoPlayPolicy.kt at the fork's 45e0984,
// with the pt-BR wording of PlaybackAutoPlaySettings.kt. The four modes, the
// ignored punctuation and the exclusion words extracted from negative lookaheads
// are the fork's rules. Source order is the order the add-ons answered in, which is
// the order the fork's orderAddonStreams keeps after the installed add-on list.
import { playbackIssue, rankStreams } from './ranking.js';
export const autoPlayModes = Object.freeze([
  Object.freeze({ id: 'manual', label: 'Manual (escolher fonte)', description: 'Escolha sempre a fonte na lista exibida.' }),
  Object.freeze({ id: 'first', label: 'Primeira fonte', description: 'Reproduza a primeira fonte disponível.' }),
  Object.freeze({ id: 'rank', label: 'Seleção inteligente', description: 'Reproduza automaticamente a fonte melhor classificada.' }),
  Object.freeze({ id: 'regex', label: 'Palavra-chave (Regex)', description: 'Reproduza a fonte que coincidir com as palavras-chave (Regex).' })
]);
export const autoPlayModeIds = Object.freeze(autoPlayModes.map(mode => mode.id));
export const autoPlayModeLabel = value => (autoPlayModes.find(mode => mode.id === value) || autoPlayModes[0]).label;
export const readAutoPlayMode = value => autoPlayModeIds.includes(value) ? value : 'manual';
// Regex matching in the fork is case-insensitive and unbounded in length.
export const autoPlayRegexMax = 200;
export function readAutoPlayRegex(value) {
  return typeof value === 'string' ? value.trim().slice(0, autoPlayRegexMax) : '';
}
// StreamAutoPlayPolicy.isRegexSelectionConfigured: letters or digits are required,
// so punctuation alone never turns the mode on, and the pattern must compile.
export function regexConfigured(pattern) {
  const value = readAutoPlayRegex(pattern);
  if (!value || !/[a-z0-9]/i.test(value)) return false;
  return compileRegex(value) !== null;
}
// The fork extracts "word1|word2" out of a negative lookahead such as (?!(cam|ts)).
export function exclusionWords(pattern) {
  const words = [];
  for (const match of readAutoPlayRegex(pattern).matchAll(/\(\?![^)]*?\(([^)]+)\)/g)) {
    for (const word of match[1].split('|')) {
      const value = word.trim();
      if (value) words.push(value);
    }
  }
  return words;
}
export function compileRegex(pattern) {
  const value = readAutoPlayRegex(pattern);
  if (!value) return null;
  try {
    const exclude = exclusionWords(value);
    return { include: new RegExp(value, 'i'), exclude: exclude.length ? new RegExp(`\\b(${exclude.join('|')})\\b`, 'i') : null };
  } catch { return null; }
}
// StreamAutoPlaySelector.searchableText: add-on, name, title, description and url.
export function searchableText(stream) {
  const parts = [stream?.addonName, stream?.name, stream?.title, stream?.description, typeof stream?.url === 'string' ? stream.url : ''];
  if (stream?.infoHash) parts.push(stream.infoHash);
  return parts.filter(value => typeof value === 'string' && value).join(' ');
}
export function matches(regex, stream) {
  if (!regex) return false;
  const text = searchableText(stream);
  if (!regex.include.test(text)) return false;
  return !(regex.exclude && regex.exclude.test(text));
}
// StreamAutoPlaySelectedAddons: an empty list means every add-on is allowed.
export function allowedAddonsFilter(allowed) {
  const names = new Set((Array.isArray(allowed) ? allowed : []).filter(name => typeof name === 'string' && name));
  return stream => !names.size || names.has(stream?.addonName);
}
// StreamAutoPlayPolicy.isEffectivelyEnabled, without the Android plugin branch.
// Takes the same shape readPlayback returns (autoPlayMode / autoPlayRegex).
export function autoPlayConfigured({ autoPlayMode = 'manual', autoPlayRegex = '', reuseLastLink = false } = {}) {
  if (reuseLastLink) return true;
  if (autoPlayMode === 'manual') return false;
  if (autoPlayMode === 'regex') return regexConfigured(autoPlayRegex);
  return true;
}
// Returns null when nothing is eligible, which is the fork's signal to show the list.
export function selectAutoPlayStream(streams, { mode = 'manual', regex = '', preferences = {}, avoidDvOnly = true, allowedAddons = [] } = {}) {
  const chosen = readAutoPlayMode(mode);
  if (chosen === 'manual') return null;
  const eligible = (Array.isArray(streams) ? streams : []).filter(stream => stream && !playbackIssue(stream, avoidDvOnly)).filter(allowedAddonsFilter(allowedAddons));
  if (!eligible.length) return null;
  if (chosen === 'first') return eligible[0];
  if (chosen === 'rank') return rankStreams(eligible, preferences)[0] || null;
  const compiled = compileRegex(regex);
  if (!compiled) return null;
  return eligible.find(stream => matches(compiled, stream)) || null;
}
// The port shipped a single "play the best source" switch before the four modes
// existed; an existing install keeps its behaviour as "Seleção inteligente".
export function migrateAutoPlay(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  if (settings.autoPlay !== true) return settings;
  if (settings.playback && typeof settings.playback.autoPlayMode === 'string') return settings;
  settings.playback = { ...(settings.playback || {}), autoPlayMode: 'rank' };
  delete settings.autoPlay;
  return settings;
}
