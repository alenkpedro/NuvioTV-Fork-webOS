// SPDX-License-Identifier: GPL-3.0-only
// "Faster stream start" and "pressing play reaches the player faster" from the fork, in the
// part that a web app can own: the fork searches, ranks and pre-resolves the stream while the
// user is still browsing, opens the network connection at the press, and stops over-fetching
// the file's tail index on non-faststart MP4s.
//
// The port can do the first two: the stream list is fetched and ranked in the background from
// the detail screen, and a one-byte ranged request warms DNS/TCP/TLS right before the player
// opens the URL. The trailing-index fetch belongs to the media element's own parser, so it is
// not claimed here; the local media service (MEDIA_SERVICE.md) is what keeps bytes bounded.
export const prewarmDefaults = Object.freeze({ enabled: true, ttlMs: 120000, maxEntries: 3, warmBytes: 1 });
export const prewarmKey = (type, id, episode = null) => `${type}:${id}:${episode ? `${episode.season}-${episode.episode}` : 'main'}`;
export function createStreamPrewarmer({ loadStreams, rank, now = () => Date.now(), ttlMs = prewarmDefaults.ttlMs, maxEntries = prewarmDefaults.maxEntries, warm = null, request = globalThis.fetch } = {}) {
  const entries = new Map();
  let warming = null;
  const trim = () => {
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  };
  function entryFor(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (now() - entry.at > ttlMs) { entries.delete(key); return null; }
    return entry;
  }
  // prepare(): starts the background work once per key. A second call while it is in flight
  // joins the same promise instead of asking the add-ons again.
  function prepare(context, { signal, force = false } = {}) {
    const key = prewarmKey(context.type, context.id, context.episode || null);
    const existing = entryFor(key);
    if (existing && !force) return existing;
    const entry = { key, at: now(), taken: false, rows: null, failed: 0, error: null, best: null, promise: null };
    entry.promise = Promise.resolve()
      .then(() => loadStreams(context, { signal }))
      .then(result => {
        entry.rows = result.rows;
        entry.failed = result.failed;
        entry.best = rank ? rank(result.rows).best : result.rows[0] || null;
        entry.at = now();
        return entry;
      })
      .catch(error => {
        entry.error = error?.message || String(error);
        entry.rows = entry.rows || [];
        return entry;
      });
    entries.set(key, entry);
    trim();
    return entry;
  }
  // take(): the player screen consumes what the browse screen already paid for. A consumed
  // entry is not served twice, so Back from a link that expired on the server still reaches a
  // fresh list.
  function take(context) {
    const entry = entryFor(prewarmKey(context.type, context.id, context.episode || null));
    if (!entry || entry.taken || !entry.rows?.length) return null;
    entry.taken = true;
    return entry;
  }
  // warm(): one bounded request to the same URL the player is about to open. It is the fork's
  // "opens the network connection at the press"; a single byte is enough and it never throws.
  function warmConnection(url) {
    const value = typeof url === 'string' ? url.trim() : '';
    if (!/^https?:\/\//i.test(value) || typeof request !== 'function') return Promise.resolve(false);
    if (warming) return warming;
    warming = Promise.resolve()
      .then(() => request(value, { headers: { Range: `bytes=0-${Math.max(1, prewarmDefaults.warmBytes) - 1}`, 'Cache-Control': 'no-store' }, cache: 'no-store' }))
      .then(response => Boolean(response && (response.ok || response.status === 206)))
      .catch(() => false)
      .then(result => { warming = null; return result; });
    return warming;
  }
  return {
    prepare,
    take,
    warm: warmConnection,
    size: () => entries.size,
    clear() { entries.clear(); warming = null; }
  };
}
