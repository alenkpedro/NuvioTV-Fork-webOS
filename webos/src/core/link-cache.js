// SPDX-License-Identifier: GPL-3.0-only
// StreamLinkCacheDataStore.kt at the fork's 45e0984: one entry per content key,
// a configured age and a bounded store. The port keeps only direct HTTP(S) links:
// torrents have no playback path on this target, so an infoHash entry could never
// be reused. Nothing else about the chosen source is kept.
export const linkCacheLimit = 50;
// StreamReuseLastLinkCacheDurationDialog options, in hours.
export const linkCacheHours = Object.freeze([1, 2, 3, 6, 12, 24, 48, 72, 168]);
export const linkCacheDefaultHours = 24;
const maxUrl = 4096;
const maxName = 300;
export const readLinkCacheHours = value =>
  linkCacheHours.includes(value) ? value : linkCacheDefaultHours;
// cache_duration strings: 1 hora / 3 horas / 1 dia / 7 dias / 1d 6h.
export function cacheDurationLabel(hours) {
  const value = Math.max(0, Math.round(Number(hours) || 0));
  if (value < 24) return `${value} ${value === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(value / 24), rest = value % 24;
  if (!rest) return `${days} ${days === 1 ? 'dia' : 'dias'}`;
  return `${days}d ${rest}h`;
}
// StreamScreenViewModel: contentKey = "${contentType.lowercase()}|$videoId".
export function linkKey(type, id) {
  const kind = typeof type === 'string' ? type.trim().toLowerCase() : '';
  const video = typeof id === 'string' ? id.trim() : '';
  return kind && video ? `${kind}|${video}` : '';
}
const playableUrl = value => typeof value === 'string' && value.length > 0 && value.length <= maxUrl && /^https?:\/\//i.test(value);
const text = (value, max = maxName) => typeof value === 'string' ? value.slice(0, max) : '';
function readEntry(value) {
  if (!value || typeof value !== 'object') return null;
  if (!playableUrl(value.url)) return null;
  if (!Number.isFinite(value.cachedAt) || value.cachedAt <= 0) return null;
  const entry = { url: value.url, streamName: text(value.streamName) || 'Fonte anterior', cachedAt: value.cachedAt };
  if (typeof value.addonName === 'string' && value.addonName) entry.addonName = text(value.addonName);
  return entry;
}
export function readLinkCache(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    const parsed = readEntry(entry);
    if (parsed && typeof key === 'string' && key) out[key] = parsed;
  }
  return out;
}
export function linkCacheSize(cache) { return Object.keys(readLinkCache(cache)).length; }
// Oldest entries leave first once the bound is reached, like a bounded store.
export function writeLink(cache, key, entry, { now = Date.now(), limit = linkCacheLimit } = {}) {
  const next = readLinkCache(cache);
  const parsed = readEntry(entry ? { ...entry, cachedAt: now } : entry);
  if (!parsed || !key) return next;
  next[key] = parsed;
  const entries = Object.entries(next).sort((a, b) => a[1].cachedAt - b[1].cachedAt);
  while (entries.length > Math.max(1, limit)) delete next[entries.shift()[0]];
  return next;
}
// A cache duration of zero never serves an entry, exactly like the fork's guard.
export function readLink(cache, key, hours, now = Date.now()) {
  const next = readLinkCache(cache);
  const entry = key ? next[key] : undefined;
  if (!entry) return { link: null, cache: next };
  // StreamLinkCacheDataStore.getValid: a duration of zero never serves an entry.
  const configured = Number(hours);
  if (!Number.isFinite(configured) || configured <= 0) return { link: null, cache: next };
  const maxAge = readLinkCacheHours(configured) * 3600000;
  if (now - entry.cachedAt > maxAge) {
    delete next[key];
    return { link: null, cache: next };
  }
  return { link: { ...entry, age: now - entry.cachedAt }, cache: next };
}
export const clearLinkCache = () => ({});
