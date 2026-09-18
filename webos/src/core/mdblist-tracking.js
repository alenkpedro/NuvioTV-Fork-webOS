// SPDX-License-Identifier: GPL-3.0-only
// MDBListScrobbleService.kt and MDBListTrackingProvider.kt at the fork's 45e0984, ported with
// their own rules intact: the integration is gated on enabled + tracking + a non-blank API
// key, progress is truncated to two decimals (MDBList answers a bare 400 above that), the
// dedup window is 8 s and 1.5 percentage points, 404 means "not in MDBList's database" and is
// never retried, 429 is the daily limit and is never retried inside a play, and 5xx retries
// twice — 5 s for 502/503/504 and 1.5 s × attempt otherwise. A stop at 80% or more is what
// marks the item watched server-side, so pause events are routed through stop, exactly as the
// fork's adapter does (MDBList has no pause endpoint).
export const mdblistTrackingStorageKey = 'nuvio-fork.webos.mdblist-tracking.v1';
export const scrobblePolicy = Object.freeze({
  minSendIntervalMs: 8000,
  progressWindow: 1.5,
  maxAttempts: 2,
  retryDelayMs: 1500,
  serverOverloadedRetryDelayMs: 5000,
  watchedThreshold: 80
});
export function readTrackingSettings(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(mdblistTrackingStorageKey));
    return { tracking: parsed?.tracking === true };
  } catch { return { tracking: false }; }
}
export function saveTrackingSettings(storage, value) {
  storage.setItem(mdblistTrackingStorageKey, JSON.stringify({ tracking: value?.tracking === true }));
}
// Truncated, not rounded: truncation can never push a sub-80% stop across the server's watched
// threshold nor a sub-1% value across its ignore floor (the fork measured this on 2026-07-30).
export function wireProgress(percent) {
  const clamped = Number.isFinite(Number(percent)) ? Math.min(100, Math.max(0, Number(percent))) : 0;
  return Math.trunc(clamped * 100) / 100;
}
const numeric = value => /^\d+$/.test(String(value ?? '')) && Number(value) > 0 ? Number(value) : null;
// The fork keys MDBList by ids only (title and year are not sent) and skips items without one.
export function scrobbleIds(meta) {
  const imdb = [meta?.id, meta?.imdb_id, meta?.imdbId].find(value => typeof value === 'string' && /^tt\d+$/.test(value)) || null;
  const tmdb = numeric(meta?.tmdbId) || numeric(String(meta?.id || '').replace(/^tmdb:/, ''));
  if (!imdb && !tmdb) return null;
  return { imdb, tmdb };
}
export function scrobbleItem(context) {
  const ids = scrobbleIds(context?.meta || context);
  if (!ids) return null;
  if ((context?.type || context?.meta?.type) === 'movie') return { kind: 'movie', ids, itemKey: `movie:${ids.imdb || ids.tmdb}` };
  const season = Number(context?.episode?.season), episode = Number(context?.episode?.episode);
  if (!Number.isInteger(season) || !Number.isInteger(episode) || season < 0 || episode <= 0) return null;
  return { kind: 'episode', ids, season, episode, itemKey: `episode:${ids.imdb || ids.tmdb}:${season}:${episode}` };
}
// MDBListScrobbleRequestDto: the episode is nested inside show.season.episode.
export function scrobbleBody(item, percent, appVersion = null) {
  if (!item) return null;
  const progress = wireProgress(percent);
  // Moshi omits null fields, so only the ids that exist go on the wire.
  const ids = Object.fromEntries(Object.entries(item.ids).filter(([, value]) => value !== null && value !== undefined));
  if (item.kind === 'movie') return { movie: { ids }, progress, ...(appVersion ? { app_version: appVersion } : {}) };
  return { show: { ids, season: { number: item.season, episode: { number: item.episode } } }, progress, ...(appVersion ? { app_version: appVersion } : {}) };
}
export function classifyStatus(status) {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404) return 'missing';
  if (status === 429) return 'rateLimited';
  if (status >= 500 && status < 600) return 'retry';
  return 'rejected';
}
export function retryDelay(status, attempt) {
  if (status >= 502 && status <= 504) return scrobblePolicy.serverOverloadedRetryDelayMs;
  return scrobblePolicy.retryDelayMs * attempt;
}
// shouldSkip(): the dedup stamp is written before dispatch, not on success, so a stop evaluated
// inside a start's round trip can still see the start.
export function shouldSkip(stamp, { profileId, action, itemKey, progress, now, policy = scrobblePolicy }) {
  if (!stamp) return false;
  if (stamp.profileId !== profileId) return false;
  if (stamp.action !== action || stamp.itemKey !== itemKey) return false;
  if (now - stamp.timestampMs >= policy.minSendIntervalMs) return false;
  return Math.abs(stamp.progress - progress) <= policy.progressWindow;
}
export const scrobbleEndpoint = 'https://api.mdblist.com/scrobble';

// The scrobbler itself. `request` is injected (the packaged service in the TV, fetch in tests);
// `wait` is injected so the retry ladder is deterministic under test.
export function createMdbListTracker({ settings, network, request = null, now = () => Date.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)), version = null, onResult = () => {} } = {}) {
  let lastStamp = null, lastIssued = null, inFlight = false;
  function configured() {
    const value = settings?.() || {};
    return { enabled: value.enabled !== false && value.tracking === true, key: String(value.key || '').trim() };
  }
  function send(action, context, percent) {
    const config = configured();
    if (!config.enabled) return Promise.resolve({ ok: false, skipped: 'gating' });
    if (!config.key) return Promise.resolve({ ok: false, skipped: 'no_key' });
    const item = scrobbleItem(context);
    // Items without an id are skipped silently: MDBList cannot match them (fork rule).
    if (!item) return Promise.resolve({ ok: false, skipped: 'no_ids' });
    const progress = wireProgress(percent);
    const profileId = context?.profileId ?? null;
    const stamp = { profileId, action, itemKey: item.itemKey, progress, timestampMs: now() };
    if (shouldSkip(lastIssued, stamp) || shouldSkip(lastStamp, stamp)) return Promise.resolve({ ok: false, skipped: 'dedup' });
    const body = scrobbleBody(item, progress, version);
    const url = `${scrobbleEndpoint}/${action}?apikey=${encodeURIComponent(config.key)}`;
    const call = payload => request
      ? request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), timeoutMs: 8000 })
      : network.json(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), timeoutMs: 8000 });
    lastIssued = stamp;
    inFlight = true;
    return (async () => {
      let attempt = 0;
      for (;;) {
        attempt++;
        let status = 0, error = null;
        try {
          const response = await call(body);
          status = Number(response?.status ?? 200);
        } catch (thrown) { error = thrown?.message || 'falha de rede'; }
        const outcome = error ? { outcome: 'retry', status: 0 } : { outcome: classifyStatus(status), status };
        if (outcome.outcome === 'ok') {
          lastStamp = stamp;
          onResult({ action, item: item.itemKey, status, at: now() });
          inFlight = false;
          return { ok: true, status, action, item: item.itemKey };
        }
        if (outcome.outcome === 'retry' && attempt < scrobblePolicy.maxAttempts) {
          await wait(retryDelay(status, attempt));
          continue;
        }
        // A missing item, the daily limit and a rejected payload are all terminal for this play.
        onResult({ action, item: item.itemKey, status, outcome: outcome.outcome, at: now(), error });
        inFlight = false;
        return { ok: false, status, outcome: error ? 'network' : outcome.outcome, error };
      }
    })();
  }
  return {
    configured,
    busy: () => inFlight,
    last: () => lastStamp,
    start: (context, percent) => send('start', context, percent),
    // MDBList has no pause endpoint: the fork routes pause through stop, and the server treats a
    // stop at 80% or more as watched and below that as a paused session.
    stop: (context, percent) => send('stop', context, percent),
    pause: (context, percent) => send('stop', context, percent),
    summary: () => configured().enabled ? (configured().key ? (lastStamp ? `Último envio: ${lastStamp.action} em ${new Date(lastStamp.timestampMs).toLocaleString('pt-BR')}` : 'Conectado: nenhum envio ainda nesta TV.') : 'Informe a chave do MDBList em Integrações → Avaliações MDBList.') : 'Desligado.'
  };
}
