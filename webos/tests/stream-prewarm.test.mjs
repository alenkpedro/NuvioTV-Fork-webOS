import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamPrewarmer, prewarmDefaults, prewarmKey } from '../src/core/stream-prewarm.js';
import { readPlayback } from '../src/core/playback.js';
const rows = [{ sourceKey: 'a', url: 'https://cdn.test/a.mp4', name: 'A' }, { sourceKey: 'b', url: 'https://cdn.test/b.mp4', name: 'B' }];
const context = { type: 'movie', id: 'tt1' };
function loader(result = rows) {
  const calls = [];
  return { calls, loadStreams: async (ctx, options) => { calls.push({ ctx, aborted: Boolean(options?.signal?.aborted) }); return { rows: result, failed: 1 }; } };
}
test('the browse-time search runs once per title and is consumed by the sources screen', async () => {
  const { calls, loadStreams } = loader();
  const prewarm = createStreamPrewarmer({ loadStreams, rank: list => ({ best: list[1] }) });
  const entry = prewarm.prepare(context);
  const joined = prewarm.prepare(context);
  assert.equal(entry, joined); // a second call joins the request in flight
  await entry.promise;
  assert.equal(calls.length, 1);
  assert.equal(entry.rows.length, 2);
  assert.equal(entry.failed, 1);
  assert.equal(entry.best.sourceKey, 'b');
  const taken = prewarm.take(context);
  assert.equal(taken.rows.length, 2);
  // A consumed entry is not served twice, so Back to the list asks the add-ons again.
  assert.equal(prewarm.take(context), null);
});
test('episodes and titles are kept apart, and a stale entry is not served', async () => {
  let clock = 1000;
  const { calls, loadStreams } = loader();
  const prewarm = createStreamPrewarmer({ loadStreams, now: () => clock, ttlMs: 5000 });
  await prewarm.prepare(context).promise;
  await prewarm.prepare({ type: 'series', id: 'tt2', episode: { season: 1, episode: 3 } }).promise;
  await prewarm.prepare({ type: 'series', id: 'tt2', episode: { season: 1, episode: 4 } }).promise;
  assert.equal(calls.length, 3);
  assert.equal(prewarmKey('series', 'tt2', { season: 1, episode: 3 }), 'series:tt2:1-3');
  assert.equal(prewarmKey('movie', 'tt1'), 'movie:tt1:main');
  clock += 6000;
  assert.equal(prewarm.take(context), null); // expired
  assert.equal(prewarm.size(), 2); // the stale entry was dropped by that access
});
test('the prewarm cache is bounded so browsing cannot grow it without end', async () => {
  const { loadStreams } = loader();
  const prewarm = createStreamPrewarmer({ loadStreams, maxEntries: 2 });
  for (const id of ['a', 'b', 'c']) await prewarm.prepare({ type: 'movie', id }).promise;
  assert.equal(prewarm.size(), 2);
  assert.equal(prewarm.take({ type: 'movie', id: 'a' }), null);
  assert.equal(Boolean(prewarm.take({ type: 'movie', id: 'c' })), true);
});
test('a failing search is kept as an entry instead of throwing at the browser', async () => {
  const prewarm = createStreamPrewarmer({ loadStreams: async () => { throw Error('addon fora do ar'); } });
  const entry = await prewarm.prepare(context).promise;
  assert.equal(entry.error, 'addon fora do ar');
  assert.deepEqual(entry.rows, []);
  assert.equal(prewarm.take(context), null); // no rows: the screen keeps its skeleton and asks again
});
test('the connection is warmed with one ranged byte, once at a time', async () => {
  const calls = [];
  const request = async (url, options) => { calls.push({ url, options }); return { status: 206, ok: true }; };
  const prewarm = createStreamPrewarmer({ loadStreams: async () => ({ rows: [] }), request });
  assert.equal(await prewarm.warm('https://cdn.test/a.mp4'), true);
  assert.deepEqual(calls[0].options.headers.Range, `bytes=0-${prewarmDefaults.warmBytes - 1}`);
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(await prewarm.warm('ftp://cdn.test/a.mp4'), false);
  assert.equal(calls.length, 1);
  const failing = createStreamPrewarmer({ loadStreams: async () => ({ rows: [] }), request: async () => { throw Error('offline'); } });
  assert.equal(await failing.warm('https://cdn.test/a.mp4'), false);
});
test('the fork playback defaults keep the start fast, and it can be turned off', () => {
  assert.equal(readPlayback({}).prewarmStreams, true);
  assert.equal(readPlayback({ prewarmStreams: false }).prewarmStreams, false);
  assert.equal(readPlayback({ prewarmStreams: 'yes' }).prewarmStreams, true);
});
