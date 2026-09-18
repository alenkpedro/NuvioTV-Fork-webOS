import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStatus, createMdbListTracker, mdblistTrackingStorageKey, readTrackingSettings, retryDelay, saveTrackingSettings,
  scrobbleBody, scrobbleIds, scrobbleItem, scrobblePolicy, shouldSkip, wireProgress
} from '../src/core/mdblist-tracking.js';
const movie = { type: 'movie', meta: { id: 'tt1234567', tmdbId: 55 }, profileId: 1 };
const episode = { type: 'series', meta: { id: 'tt7654321' }, episode: { season: 2, episode: 5 }, profileId: 1 };
function fakeStorage() {
  const map = new Map();
  return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, value) };
}
function fakeNetwork(script) {
  const calls = [];
  return {
    calls,
    json: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), method: options.method });
      const next = script.shift();
      if (next instanceof Error) throw next;
      return next ?? { status: 200 };
    }
  };
}
test('MDBList ids come from IMDb or TMDB, and items without one are skipped', () => {
  assert.deepEqual(scrobbleIds({ id: 'tt1234567', tmdbId: 9 }), { imdb: 'tt1234567', tmdb: 9 });
  assert.deepEqual(scrobbleIds({ id: 'tmdb:42' }), { imdb: null, tmdb: 42 });
  assert.equal(scrobbleIds({ id: 'trakt:7' }), null);
  assert.equal(scrobbleItem({ type: 'movie', meta: { id: 'kitsu:1' } }), null);
  assert.equal(scrobbleItem({ type: 'series', meta: { id: 'tt1' }, episode: { season: 1 } }), null);
  assert.equal(scrobbleItem(episode).itemKey, 'episode:tt7654321:2:5');
  assert.equal(scrobbleItem(movie).itemKey, 'movie:tt1234567');
});
test('progress is truncated to two decimals and the body nests the episode like the fork', () => {
  assert.equal(wireProgress(3.0654762), 3.06);
  assert.equal(wireProgress(79.999), 79.99);
  assert.equal(wireProgress(-4), 0);
  assert.equal(wireProgress(140), 100);
  assert.deepEqual(scrobbleBody(scrobbleItem(movie), 42.3456, '0.35.0'), { movie: { ids: { imdb: 'tt1234567', tmdb: 55 } }, progress: 42.34, app_version: '0.35.0' });
  assert.deepEqual(scrobbleBody(scrobbleItem(episode), 80), { show: { ids: { imdb: 'tt7654321' }, season: { number: 2, episode: { number: 5 } } }, progress: 80 });
  assert.deepEqual(scrobbleBody(scrobbleItem({ type: 'movie', meta: { id: 'tmdb:9' } }), 1), { movie: { ids: { tmdb: 9 } }, progress: 1 });
  assert.equal(scrobbleBody(null, 10), null);
});
test('the retry ladder follows the fork: 404 and 429 never repeat, 5xx does', () => {
  assert.equal(classifyStatus(200), 'ok'); assert.equal(classifyStatus(404), 'missing');
  assert.equal(classifyStatus(429), 'rateLimited'); assert.equal(classifyStatus(503), 'retry');
  assert.equal(classifyStatus(400), 'rejected');
  assert.equal(retryDelay(503, 1), scrobblePolicy.serverOverloadedRetryDelayMs);
  assert.equal(retryDelay(500, 1), scrobblePolicy.retryDelayMs);
  assert.equal(retryDelay(500, 2), scrobblePolicy.retryDelayMs * 2);
  assert.equal(scrobblePolicy.watchedThreshold, 80);
  assert.equal(scrobblePolicy.minSendIntervalMs, 8000);
  assert.equal(scrobblePolicy.progressWindow, 1.5);
});
test('the dedup window is per profile, action, item and 1.5 points of progress', () => {
  const stamp = { profileId: 1, action: 'start', itemKey: 'movie:tt1', progress: 20, timestampMs: 1000 };
  assert.equal(shouldSkip(stamp, { profileId: 1, action: 'start', itemKey: 'movie:tt1', progress: 20.5, now: 3000 }), true);
test('the tracker is gated on the tracking switch, the key and the ids', async () => {
  const network = fakeNetwork([{ status: 200 }]);
  const tracker = createMdbListTracker({ network, settings: () => ({ tracking: false, key: 'k', enabled: true }) });
  assert.deepEqual(await tracker.start(movie, 10), { ok: false, skipped: 'gating' });
  const keyless = createMdbListTracker({ network, settings: () => ({ tracking: true, key: '  ' }) });
  assert.deepEqual(await keyless.start(movie, 10), { ok: false, skipped: 'no_key' });
  const ready = createMdbListTracker({ network, settings: () => ({ tracking: true, key: 'k' }) });
  assert.deepEqual(await ready.start({ type: 'movie', meta: { id: 'kitsu:1' } }, 10), { ok: false, skipped: 'no_ids' });
  assert.equal(network.calls.length, 0);
});
test('a start goes out once, is deduped, and a stop at 80% is the watched signal', async () => {
  const network = fakeNetwork([{ status: 200 }, { status: 200 }]);
  let clock = 1000;
  const results = [];
  const tracker = createMdbListTracker({ network, now: () => clock, settings: () => ({ tracking: true, key: 'k' }), version: '0.35.0', onResult: r => results.push(r) });
  await tracker.start(movie, 15);
  clock += 1000;
  assert.deepEqual(await tracker.start(movie, 15.5), { ok: false, skipped: 'dedup' });
  clock += 9000;
  const stopped = await tracker.stop(movie, 82.5);
  assert.equal(stopped.ok, true);
  assert.equal(network.calls.length, 2);
  assert.match(network.calls[0].url, /^https:\/\/api\.mdblist\.com\/scrobble\/start\?apikey=k$/);
  assert.match(network.calls[1].url, /scrobble\/stop/);
  assert.deepEqual(network.calls[1].body, { movie: { ids: { imdb: 'tt1234567', tmdb: 55 } }, progress: 82.5, app_version: '0.35.0' });
  assert.equal(results.length, 2);
  assert.equal(tracker.summary().startsWith('Último envio: stop'), true);
});
test('a 5xx is retried with the fork delays and a persistent one gives up', async () => {
  const waits = [];
  const network = fakeNetwork([{ status: 503 }, { status: 200 }]);
  const tracker = createMdbListTracker({ network, settings: () => ({ tracking: true, key: 'k' }), wait: async ms => waits.push(ms) });
  assert.equal((await tracker.start(episode, 12)).ok, true);
  assert.deepEqual(waits, [scrobblePolicy.serverOverloadedRetryDelayMs]);
  assert.equal(network.calls.length, 2);
  const failing = fakeNetwork([{ status: 500 }, { status: 500 }]);
  const waiver = [];
  const tracker2 = createMdbListTracker({ network: failing, settings: () => ({ tracking: true, key: 'k' }), wait: async ms => waiver.push(ms) });
  const result = await tracker2.start(episode, 12);
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'retry');
  assert.deepEqual(waiver, [scrobblePolicy.retryDelayMs]);
  assert.equal(failing.calls.length, scrobblePolicy.maxAttempts);
});
test('404 and 429 are terminal for the play, and a network error is reported', async () => {
  const missing = createMdbListTracker({ network: fakeNetwork([{ status: 404 }]), settings: () => ({ tracking: true, key: 'k' }) });
  assert.equal((await missing.start(movie, 5)).outcome, 'missing');
  const limited = createMdbListTracker({ network: fakeNetwork([{ status: 429 }]), settings: () => ({ tracking: true, key: 'k' }) });
  assert.equal((await limited.start(movie, 5)).outcome, 'rateLimited');
  const offline = createMdbListTracker({ network: { json: async () => { throw Error('offline'); } }, settings: () => ({ tracking: true, key: 'k' }), wait: async () => {} });
  const result = await offline.start(movie, 5);
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'network');
});
test('the tracking switch is stored apart from the ratings key', () => {
  const storage = fakeStorage();
  assert.deepEqual(readTrackingSettings(storage), { tracking: false });
  saveTrackingSettings(storage, { tracking: true });
  assert.deepEqual(readTrackingSettings(storage), { tracking: true });
  assert.equal(storage.getItem(mdblistTrackingStorageKey).includes('true'), true);
});

  assert.equal(shouldSkip(stamp, { profileId: 1, action: 'start', itemKey: 'movie:tt1', progress: 23, now: 3000 }), false);
  assert.equal(shouldSkip(stamp, { profileId: 1, action: 'start', itemKey: 'movie:tt1', progress: 20, now: 9001 }), false);
  assert.equal(shouldSkip(stamp, { profileId: 2, action: 'start', itemKey: 'movie:tt1', progress: 20, now: 3000 }), false);
  assert.equal(shouldSkip(stamp, { profileId: 1, action: 'stop', itemKey: 'movie:tt1', progress: 20, now: 3000 }), false);
});
