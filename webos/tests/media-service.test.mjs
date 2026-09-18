import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import {
  callService, directFileURL, formatBytes, localTransportEnabled, mediaTransportDefaults, mediaTransportLimits,
  readMediaTransport, startLocalMedia, stopLocalMedia, transportLabel
} from '../src/core/media-service.js';
import { readPlayback } from '../src/core/playback.js';
const require = createRequire(import.meta.url);
const core = require('../service/media-core.js');
const media = require('../service/media.js');
const MB = 1024 * 1024;

test('the transport settings clamp like the fork sliders and gate on the memory window', () => {
  assert.deepEqual(mediaTransportDefaults, { connections: 2, chunkMb: 1, windowMb: 24 });
  assert.deepEqual(readMediaTransport({}), { connections: 2, chunkMb: 1, windowMb: 24, cellMb: 2, fitsWindow: true });
  assert.deepEqual(readMediaTransport({ mediaConnections: 99, mediaChunkMb: 0, mediaWindowMb: 4 }), { connections: 8, chunkMb: 1, windowMb: 8, cellMb: 8, fitsWindow: true });
  assert.equal(readMediaTransport({ mediaConnections: 8, mediaChunkMb: 8, mediaWindowMb: 8 }).fitsWindow, false);
  assert.equal(readMediaTransport({ mediaConnections: 'x' }).connections, 2);
  assert.equal(transportLabel(readMediaTransport({ mediaConnections: 4, mediaChunkMb: 2, mediaWindowMb: 32 })), '4× 2 MB · janela 32 MB');
  assert.equal(formatBytes(0), '—'); assert.equal(formatBytes(1536), '2 KB');
  assert.equal(formatBytes(5 * MB), '5 MB'); assert.equal(formatBytes(3 * 1024 ** 3), '3.00 GB');
});
test('only direct HTTP(S) files go through the service; playlists stay with the player', () => {
  assert.equal(directFileURL('https://cdn.test/movie.mp4'), true);
  assert.equal(directFileURL('https://cdn.test/movie.mkv?token=1'), true);
  assert.equal(directFileURL('https://cdn.test/live.m3u8?t=2'), false);
  assert.equal(directFileURL('https://cdn.test/manifest.mpd'), false);
  assert.equal(directFileURL('ftp://cdn.test/movie.mp4'), false);
  assert.equal(directFileURL(null), false);
  assert.equal(localTransportEnabled({ localMediaService: true }), true);
  assert.equal(localTransportEnabled({}), false);
});
test('the fork playback defaults carry the transport off with the fork numbers', () => {
  const prefs = readPlayback({});
  assert.equal(prefs.localMediaService, false);
  assert.equal(prefs.mediaConnections, 2); assert.equal(prefs.mediaChunkMb, 1); assert.equal(prefs.mediaWindowMb, 24);
  const patched = readPlayback({ localMediaService: true, mediaConnections: 4, mediaChunkMb: 3, mediaWindowMb: 12 });
  assert.equal(patched.localMediaService, true);
  assert.equal(patched.mediaConnections, 4); assert.equal(patched.mediaChunkMb, 3); assert.equal(patched.mediaWindowMb, 12);
  // A window that cannot hold the blocks in flight is raised instead of evicting them.
  const grown = readPlayback({ mediaConnections: 8, mediaChunkMb: 8, mediaWindowMb: 8 });
  assert.equal(grown.mediaWindowMb >= grown.mediaConnections * grown.mediaChunkMb, true);
});
test('the service only accepts bounded http(s) media requests', () => {
  assert.equal(media.valid({ url: 'https://cdn.test/movie.mp4' }), true);
  assert.equal(media.valid({ url: 'https://cdn.test/movie.mp4', headers: { Referer: 'https://site.test' } }), true);
  assert.equal(media.valid({ url: 'ftp://cdn.test/movie.mp4' }), false);
  assert.equal(media.valid({ url: 'file:///etc/passwd' }), false);
  assert.equal(media.valid({ url: '' }), false);
  assert.equal(media.valid({ url: 'https://cdn.test/movie.mp4', headers: 'nope' }), false);
  assert.deepEqual(media.cleanHeaders({ Referer: 'https://site.test', Range: 'bytes=0-1', Host: 'evil.test', 'User-Agent': 'x' }), { Referer: 'https://site.test', 'User-Agent': 'x' });
  assert.equal(media.cleanHeaders({})['User-Agent'], 'NuvioFork-webOS');
});
function fakeTransport(handler) {
  const calls = [];
  let inFlight = 0, peak = 0;
  return {
    calls,
    get peak() { return peak; },
    request(options, callback) {
      calls.push(options);
      inFlight++; peak = Math.max(peak, inFlight);
      const req = new EventEmitter();
      req.write = () => {}; req.destroy = () => {}; req.end = () => queueMicrotask(() => {
        const result = handler(options);
        const res = new EventEmitter();
        if (result.error) { inFlight--; req.emit('error', new Error(result.error)); return; }
        res.statusCode = result.status;
        res.headers = result.headers || {};
        res.resume = () => {};
        callback(res);
        if (result.body) res.emit('data', result.body);
        res.emit('end');
        inFlight--;
      });
      return req;
    }
  };
}
const rangeHeaders = (size, start, end) => ({ 'content-range': `bytes ${start}-${end}/${size}`, 'content-type': 'video/mp4' });


test('the range planner keeps the fork rules: aligned chunks, window ahead, tail length', () => {
  assert.equal(core.alignChunk(0, MB), 0); assert.equal(core.alignChunk(MB + 5, MB), MB);
  assert.deepEqual(core.chunkOffsets(MB + 10, 2 * MB + 5, MB), [MB, 2 * MB]);
  assert.deepEqual(core.chunkOffsets(0, 10, 0), []);
  // windowMb has a floor of 8 MB: a window smaller than the blocks in flight is refused.
  assert.equal(core.readMediaSettings({ windowMb: 3 }).windowMb, 8);
  const config = core.mediaConfig(core.readMediaSettings({ connections: 2, chunkMb: 2, windowMb: 8 }));
  assert.deepEqual(core.readAheadOffsets(0, 100 * MB, config), [0, 2 * MB, 4 * MB, 6 * MB]);
  assert.deepEqual(core.readAheadOffsets(10, 100 * MB, config), [0, 2 * MB, 4 * MB, 6 * MB]);
  assert.equal(core.chunkLength(3 * MB, MB, 3 * MB + 10), 10);
  assert.equal(core.chunkLength(4 * MB, MB, 3 * MB + 10), 0);
});
test('the retained window never grows past its ceiling and counts what it had to drop', () => {
  const store = core.createChunkStore(2 * MB, MB);
  assert.equal(store.put(0, Buffer.alloc(MB)), true);
  assert.equal(store.put(MB, Buffer.alloc(MB)), true);
  assert.equal(store.put(2 * MB, Buffer.alloc(MB)), true);
  assert.equal(store.stats().storedBytes, 2 * MB);
  assert.equal(store.stats().counters.discarded, 1);
  assert.equal(store.stats().counters.discardedBytes, MB);
  assert.equal(store.get(0), null);
  assert.equal(store.get(MB).length, MB);
  // A truncated chunk would serve a corrupt seam, so it is refused outright.
  assert.equal(store.put(3 * MB, Buffer.alloc(MB - 1), MB), false);
  assert.equal(store.stats().counters.hits, 1);
  assert.equal(store.stats().counters.misses, 1);
  // StreamSweepEngine's economy rule: 10% over the current cell, or nothing.
  assert.equal(core.betterCell(12, 10), true); assert.equal(core.betterCell(11, 10), false); assert.equal(core.betterCell(10.5, 10), false);
  assert.equal(core.betterCell(5, 0), true); assert.equal(core.betterCell(0, 10), false);
  assert.equal(core.mbpsFromBytes(MB, 1000), 8.388608);
});
test('the probe refuses sources that do not answer partial requests', async () => {
  const target = media.parseTarget('https://cdn.test/movie.mp4');
  const whole = fakeTransport(() => ({ status: 200, headers: { 'content-type': 'video/mp4' }, body: Buffer.alloc(10) }));
  await assert.rejects(() => media.probe(target, {}, { transports: { 'https:': whole } }), /pedidos parciais/);
  const noSize = fakeTransport(() => ({ status: 206, headers: { 'content-range': 'bytes 0-0/*' }, body: Buffer.alloc(1) }));
  await assert.rejects(() => media.probe(target, {}, { transports: { 'https:': noSize } }), /tamanho/);
  const fine = fakeTransport(() => ({ status: 206, headers: rangeHeaders(4 * MB, 0, 0), body: Buffer.alloc(1) }));
  const info = await media.probe(target, {}, { transports: { 'https:': fine } });
  assert.equal(info.size, 4 * MB); assert.equal(info.contentType, 'video/mp4');
});
function sessionFor(transport, { size = 4 * MB, connections = 2, chunkMb = 1, windowMb = 4 } = {}) {
  return media.createSession({
    target: media.parseTarget('https://cdn.test/movie.mp4'), headers: { Referer: 'https://site.test' },
    settings: { connections, chunkMb, windowMb }, size, transports: { 'https:': transport }
  });
}
function rangedTransport(size, fill = 7) {
  return fakeTransport(options => {
    const match = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
    const start = Number(match[1]), end = Number(match[2]);
    return { status: 206, headers: rangeHeaders(size, start, end), body: Buffer.alloc(end - start + 1, fill) };
  });
}
test('a session serves a range from parallel chunks, fills the window ahead and caches it', async () => {
  const size = 4 * MB, transport = rangedTransport(size), session = sessionFor(transport);
  const pieces = [];
  await session.readRange(0, MB - 1, slice => pieces.push(slice));
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].length, MB);
  assert.equal(pieces[0][0], 7);
  assert.equal(transport.calls[0].headers.Range, 'bytes=0-1048575');
  assert.equal(transport.calls[0].headers.Referer, 'https://site.test');
  assert.equal(transport.peak <= 2, true);
  const opened = transport.calls.length;
  assert.equal(opened >= 2, true); // the read-ahead kept the pipeline fed
  const again = [];
  await session.readRange(0, MB - 1, slice => again.push(slice));
  assert.equal(again[0].length, MB);
  // The repeat read was answered from the retained window: chunk 0 was fetched exactly once.
  assert.equal(transport.calls.filter(call => call.headers.Range === 'bytes=0-1048575').length, 1);
  const stats = session.stats();
  assert.equal(stats.bytesServed, 2 * MB);
  assert.equal(stats.retainedBytes <= 4 * MB, true);
  assert.equal(stats.bytesFetched >= stats.bytesServed, true);
  assert.equal(stats.config.chunkMb, 1);
  session.dispose();
  await assert.rejects(() => session.readRange(0, 10, () => {}), /Sessão encerrada/);
});
test('one connection means one transfer at a time, like the labelled cell', async () => {
  const size = 3 * MB, transport = rangedTransport(size), session = sessionFor(transport, { connections: 1, windowMb: 1 });
  await session.readRange(0, MB - 1, slice => assert.equal(slice.length, MB));
  assert.equal(transport.peak, 1);
});
test('a failed or truncated chunk fails the read instead of serving a hole', async () => {
  const size = 4 * MB;
  const broken = fakeTransport(options => {
    const match = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
    const start = Number(match[1]), end = Number(match[2]);
    if (start > 0) return { error: 'reset' };
    return { status: 206, headers: rangeHeaders(size, start, end), body: Buffer.alloc(end - start + 1) };
  });
  const session = sessionFor(broken);
  await assert.rejects(() => session.readRange(2 * MB, 2 * MB + 10, () => {}), /reset/);
  assert.equal(session.stats().failed >= 1, true);
  const truncated = fakeTransport(options => {
    const match = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
    const start = Number(match[1]), end = Number(match[2]);

function fakeBridge(handlers) {
  const calls = [];
  function Bridge() {
    this.call = (uri, payload) => {
      const command = uri.split('/').pop();
      const parsed = JSON.parse(payload);
      calls.push({ command, payload: parsed });
      queueMicrotask(() => this.onservicecallback(JSON.stringify(handlers[command] ? handlers[command](parsed) : { returnValue: false, errorText: 'comando desconhecido' })));
    };
    this.cancel = () => {};
  }
  return { Bridge, calls };
}
test('the page asks the service for a local URL and reports every refusal as a reason', async () => {
  const handlers = {
    mediastart: () => ({ returnValue: true, data: { ok: true, token: 'tok', url: 'http://127.0.0.1:1234/m/tok', size: 4 * MB, contentType: 'video/mp4' } }),
    mediastop: () => ({ returnValue: true, data: { stopped: true } }),
    mediastats: () => ({ returnValue: true, data: { bytesFetched: 2048, bytesServed: 1024, mbps: 9.5, failed: 0, discardedBytes: 0 } })
  };
  const { Bridge, calls } = fakeBridge(handlers);
  const stream = { url: 'https://cdn.test/movie.mp4', behaviorHints: { proxyHeaders: { request: { Referer: 'https://site.test' } } } };
  const started = await startLocalMedia({ stream, prefs: { localMediaService: true, mediaConnections: 3, mediaChunkMb: 1, mediaWindowMb: 12 }, Bridge });
  assert.equal(started.ok, true);
  assert.equal(started.url, 'http://127.0.0.1:1234/m/tok');
  assert.equal(started.token, 'tok');
  assert.equal(transportLabel(started.settings), '3× 1 MB · janela 12 MB');
  assert.deepEqual(calls[0], { command: 'mediastart', payload: { url: stream.url, headers: { Referer: 'https://site.test' }, connections: 3, chunkMb: 1, windowMb: 12 } });
  await stopLocalMedia('tok', Bridge);
  assert.equal(calls[1].command, 'mediastop');
  const playlist = await startLocalMedia({ stream: { url: 'https://cdn.test/live.m3u8' }, prefs: { localMediaService: true }, Bridge });
  assert.equal(playlist.ok, false); assert.match(playlist.reason, /não é um arquivo HTTP\(S\) direto/);
  const tight = await startLocalMedia({ stream, prefs: { localMediaService: true, mediaConnections: 8, mediaChunkMb: 8, mediaWindowMb: 8 }, Bridge });
  assert.equal(tight.ok, false); assert.match(tight.reason, /janela/);
  const refused = fakeBridge({ mediastart: () => ({ returnValue: false, errorText: 'A fonte não responde a pedidos parciais (Range).' }) });
  const failed = await startLocalMedia({ stream, prefs: { localMediaService: true }, Bridge: refused.Bridge });
  assert.equal(failed.ok, false); assert.match(failed.reason, /pedidos parciais/);
  assert.equal(await stopLocalMedia(null, Bridge), null);
});
test('cancelling the screen aborts the service call instead of leaving it running', async () => {
  const { Bridge } = fakeBridge({});
  const controller = new AbortController();
  const pending = callService('mediastart', { url: 'https://cdn.test/movie.mp4' }, controller.signal, Bridge);
  controller.abort();
  await assert.rejects(() => pending, /Cancelado/);
  const slow = fakeBridge({ mediastart: () => ({ returnValue: true, data: { ok: true, token: 'x', url: 'http://127.0.0.1:1/m/x' } }) });
  const already = new AbortController();
  already.abort();
  const cancelled = await startLocalMedia({ stream: { url: 'https://cdn.test/movie.mp4' }, prefs: { localMediaService: true }, Bridge: slow.Bridge, signal: already.signal });
  assert.deepEqual(cancelled, { ok: false, aborted: true, reason: 'cancelado' });
});

    return { status: 206, headers: rangeHeaders(size, start, end), body: Buffer.alloc(Math.floor((end - start + 1) / 2)) };
  });
  const shortSession = sessionFor(truncated);
  await assert.rejects(() => shortSession.readRange(0, MB - 1, () => {}), /Bloco incompleto/);
});
