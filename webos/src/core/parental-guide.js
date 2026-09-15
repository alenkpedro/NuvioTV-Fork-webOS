// SPDX-License-Identifier: GPL-3.0-only
// ParentalGuideRepository.kt: the same endpoint, dominant-severity rule, category
// order and pt-BR labels. The API answers with `access-control-allow-origin: *`,
// so the TV can call it directly instead of going through the Luna service.
import { getJSON } from './addons.js';
// category ids in the order the fork builds its entries
export const parentalCategories = Object.freeze([
  Object.freeze({ key: 'nudity', api: 'SEXUAL_CONTENT', label: 'Nudez' }),
  Object.freeze({ key: 'violence', api: 'VIOLENCE', label: 'Violência' }),
  Object.freeze({ key: 'profanity', api: 'PROFANITY', label: 'Linguagem Imprópria' }),
  Object.freeze({ key: 'alcohol', api: 'ALCOHOL_DRUGS', label: 'Drogas/Álcool' }),
  Object.freeze({ key: 'frightening', api: 'FRIGHTENING_INTENSE_SCENES', label: 'Conteúdo Assustador' })
]);
export const parentalSeverities = Object.freeze({ severe: 'Intenso', moderate: 'Moderado', mild: 'Leve' });
export const parentalMaxWarnings = 5;
export const parentalTimeout = 10000;
// ParentalGuideRepository caches per imdb id for the process lifetime; the TV keeps a
// bounded map so a long session cannot grow it without limit.
export const parentalCacheLimit = 30;
const cache = new Map();
export function clearParentalCache() { cache.clear(); }
export function parentalCacheSize() { return cache.size; }
export const parentalEndpoint = id => `https://api.tiffara.com/titles/${id}/parentsGuide`;
// `tt123:1:2` and similar add-on ids resolve to the show, as in the fork.
export function imdbId(value) {
  const id = String(value ?? '').split(':')[0].trim();
  return /^tt\d{4,}$/.test(id) ? id : '';
}
const severityLevel = entry => String(entry?.severityLevel ?? '').trim().toLowerCase();
const voteCount = entry => Number.isFinite(entry?.voteCount) ? entry.voteCount : 0;
// Highest-voted severity, excluding "none"; ties keep the first entry, like maxByOrNull.
export function resolveSeverity(breakdowns) {
  if (!Array.isArray(breakdowns)) return '';
  const ranked = breakdowns.filter(entry => severityLevel(entry) && severityLevel(entry) !== 'none');
  const dominant = ranked.reduce((best, entry) => (best && voteCount(best) >= voteCount(entry) ? best : entry), null);
  if (!dominant) return '';
  const none = breakdowns.find(entry => severityLevel(entry) === 'none');
  return voteCount(dominant) > (none ? voteCount(none) : 0) ? severityLevel(dominant) : '';
}
export function parentalWarnings(payload) {
  const byCategory = new Map((Array.isArray(payload?.parentsGuide) ? payload.parentsGuide : [])
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => [String(entry.category ?? '').trim().toUpperCase(), entry]));
  const order = { severe: 0, moderate: 1, mild: 2 };
  return parentalCategories
    .map(category => {
      const severity = resolveSeverity(byCategory.get(category.api)?.severityBreakdowns);
      return severity ? { key: category.key, label: category.label, severity, severityLabel: parentalSeverities[severity] || severity } : null;
    })
    .filter(Boolean)
    .map((warning, index) => ({ warning, index }))
    .sort((a, b) => (order[a.warning.severity] ?? 3) - (order[b.warning.severity] ?? 3) || a.index - b.index)
    .map(entry => entry.warning)
    .slice(0, parentalMaxWarnings);
}
// Returns an empty list when the title has no usable guide; a failure is not fatal.
export async function fetchParentalGuide(value, { request = getJSON, signal } = {}) {
  const id = imdbId(value);
  if (!id) return [];
  if (cache.has(id)) return cache.get(id);
  const payload = await request(parentalEndpoint(id), { signal, timeout: parentalTimeout });
  if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
  const warnings = parentalWarnings(payload);
  cache.set(id, warnings);
  while (cache.size > parentalCacheLimit) cache.delete(cache.keys().next().value);
  return warnings;
}