// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// Local media transport: the page asks the service to open the source, the service pulls it
// with its own connection pool (custom headers included) and serves the bytes back on
// 127.0.0.1, where the TV's media element reads them like a local file.
//
// Port of the behaviour the fork gets from ui/screens/player/ParallelRangeDataSource.kt:
//   - the file is read in fixed chunks, several of them in flight at once (connections);
//   - chunks are retained up to a byte ceiling, so a seek inside the window costs nothing;
//   - chunks that were never served are counted as discards, which is the fork's "bytes we
//     paid for and threw away" counter;
//   - a source that does not answer Range requests is refused, and the app plays the
//     original URL instead (fail closed, never a black screen).
// Fixed target: http(s), no playlists here — HLS/DASH need segment rewriting, which is a
// different job from what ParallelRangeDataSource does.
var http = require('http'), https = require('https'), url = require('url');
var core = require('./media-core');
var MB = core.MB;
var MAX_SESSIONS = 1, CHUNK_TIMEOUT_MS = 20000, MAX_REDIRECTS = 5, IDLE_STOP_MS = 180000;
var sessions = {};
var server = null, serverPort = 0, idleTimer = null;
var blockedHeaders = ['host', 'content-length', 'connection', 'transfer-encoding', 'upgrade', 'range'];
function parseTarget(value) {
  var parsed = url.parse(String(value || ''));
  if (!parsed || !parsed.protocol || !parsed.hostname) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed;
}
function cleanHeaders(headers) {
  var out = {};
  Object.keys(headers || {}).forEach(function (key) {
    var name = String(key).trim(), value = String(headers[key] == null ? '' : headers[key]);
    if (!name || !value || !/^[A-Za-z0-9-]+$/.test(name)) return;
    if (blockedHeaders.indexOf(name.toLowerCase()) >= 0) return;
    out[name] = value.slice(0, 2000);
  });
  if (!out['User-Agent']) out['User-Agent'] = 'NuvioFork-webOS';
  return out;
}
function valid(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!parseTarget(payload.url)) return false;
  if (payload.headers !== undefined && (typeof payload.headers !== 'object' || payload.headers === null || Array.isArray(payload.headers))) return false;
  return true;
}
// One ranged transfer. Redirects are followed because debrid links hand out 302s, and the
// range is always re-sent: a redirect must never silently drop the offset.
function openRange(target, headers, start, end, options) {
  var opts = options || {};
  var transports = opts.transports, timeoutMs = opts.timeoutMs || CHUNK_TIMEOUT_MS, redirects = opts.redirects === undefined ? MAX_REDIRECTS : opts.redirects;
  var transport = transportFor(target, transports);
  if (!transport) return Promise.reject(new Error('Protocolo não suportado'));
  var requestHeaders = {};
  Object.keys(headers).forEach(function (key) { requestHeaders[key] = headers[key]; });
  requestHeaders.Range = 'bytes=' + start + '-' + end;
  if (!requestHeaders.Accept) requestHeaders.Accept = '*/*';
  return new Promise(function (resolve, reject) {
    var finished = false, bytes = 0, chunks = [], req, timer;
    function finish(error, data) { if (finished) return; finished = true; clearTimeout(timer); if (error && req) req.destroy(); error ? reject(error) : resolve(data); }
    timer = setTimeout(function () { finish(new Error('Timeout')); }, timeoutMs);
    req = transport.request({ method: 'GET', headers: requestHeaders, hostname: target.hostname, port: target.port || undefined, path: target.path || '/' }, function (res) {
      var status = res.statusCode;
      if ([301, 302, 303, 307, 308].indexOf(status) >= 0 && res.headers.location && redirects > 0) {
        var next = parseTarget(url.resolve(url.format(target), res.headers.location));
        res.resume();
        if (!next) { finish(new Error('Redirecionamento inválido')); return; }
        finish(null, { redirect: { target: next, redirects: redirects - 1 } });
        return;
      }
      res.on('data', function (chunk) { bytes += chunk.length; chunks.push(chunk); });
      res.on('end', function () {
        finish(null, { status: status, headers: res.headers, buffer: Buffer.concat(chunks), bytes: bytes });
      });
      res.on('error', finish);
      res.on('aborted', function () { finish(new Error('Conexão interrompida')); });
    });
    req.on('error', finish);
    req.end();
  });
}
function fetchRange(target, headers, start, end, options) {
  var opts = options || {};
  return openRange(target, headers, start, end, opts).then(function (result) {
    if (result.redirect) return fetchRange(result.redirect.target, headers, start, end, { transports: opts.transports, timeoutMs: opts.timeoutMs, redirects: result.redirect.redirects });
    if (result.status === 206 || result.status === 200) return result;
    throw new Error('HTTP ' + result.status);
  });
}
// The source must answer 206 with a Content-Range, otherwise there is nothing to plan:
// the app keeps playing the URL directly.
function probe(target, headers, options) {
  return fetchRange(target, headers, 0, 0, options).then(function (result) {
    if (result.status !== 206) throw new Error('A fonte não responde a pedidos parciais (Range).');
    var range = String(result.headers['content-range'] || '');
    var size = Number((/bytes\s+0-0\/(\d+)/.exec(range) || [])[1]);
    if (!(size > 0)) throw new Error('A fonte não informou o tamanho do arquivo.');
    return {
      size: size,
      contentType: String(result.headers['content-type'] || 'application/octet-stream').split(';')[0].trim(),
      acceptsRanges: true,
      headers: result.headers
    };
  });
}
function transportFor(target, transports) {
  var table = transports || { 'http:': http, 'https:': https };
  return table[target.protocol] || null;
}


// A session owns one source: its chunk pool, its retained window and its counters.
// Transports and timers are injectable so the tests drive it without a network.
function createSession(options) {
  var target = options.target, headers = options.headers, size = options.size;
  var config = core.mediaConfig(options.settings);
  var store = core.createChunkStore(config.windowBytes, config.chunkBytes);
  var queue = [], inFlight = 0, waiters = {}, pending = {}, errors = {}, samples = [];
  var disposed = false, anchor = 0;
  var counters = { requests: 0, chunks: 0, failed: 0, pending: 0, bytesFetched: 0, bytesServed: 0, startedAt: Date.now(), lastReadAt: Date.now() };
  function enqueue(offset) {
    if (disposed || !(offset >= 0) || offset >= size) return;
    if (store.has(offset) || pending[offset] || queue.indexOf(offset) >= 0) return;
    queue.push(offset);
  }
  function enqueueWindow(position) {
    var window = core.readAheadOffsets(Math.max(0, Math.min(position, size - 1)), size, config);
    for (var index = 0; index < window.length; index++) enqueue(window[index]);
  }
  // Playback order first: the chunk closest to the reader is the one worth a connection.
  function nextOffset() {
    queue.sort(function (left, right) { return Math.abs(left - anchor) - Math.abs(right - anchor); });
    return queue.shift();
  }
  function notify(offset) {
    var list = waiters[offset];
    delete waiters[offset];
    if (!list) return;
    for (var index = 0; index < list.length; index++) {
      if (errors[offset]) list[index].reject(new Error(errors[offset]));
      else if (store.has(offset)) list[index].resolve();
      else list[index].reject(new Error('Bloco indisponível.'));
    }
  }
  function start(offset) {
    var length = core.chunkLength(offset, config.chunkBytes, size);
    pending[offset] = true;
    inFlight++;
    counters.pending = inFlight;
    fetchRange(target, headers, offset, offset + length - 1, { transports: options.transports, timeoutMs: options.timeoutMs })
      .then(function (result) {
        counters.bytesFetched += result.buffer.length;
        counters.chunks++;
        samples.push({ at: Date.now(), bytes: counters.bytesFetched });
        if (samples.length > 60) samples.shift();
        if (!store.put(offset, result.buffer, length)) { counters.failed++; errors[offset] = 'Bloco incompleto'; }
      }, function (error) {
        counters.failed++;
        errors[offset] = String(error && error.message || 'Falha de rede');
      })
      .then(function () {
        delete pending[offset];
        inFlight--;
        counters.pending = inFlight;
        notify(offset);
        pump();
      });
  }
  function pump() {
    while (!disposed && inFlight < config.connections && queue.length) {
      var offset = nextOffset();
      if (store.has(offset) || pending[offset]) continue;
      if (errors[offset]) { notify(offset); continue; }
      start(offset);
    }
  }
  function ensure(offset) {
    if (store.has(offset)) return Promise.resolve();
    if (errors[offset]) return Promise.reject(new Error(errors[offset]));
    return new Promise(function (resolve, reject) {
      waiters[offset] = waiters[offset] || [];
      waiters[offset].push({ resolve: resolve, reject: reject });
      enqueue(offset);
      pump();
    });
  }
  // The reader walks chunk by chunk; a missing chunk waits for the pool, and every served
  // chunk schedules the next window — that is what keeps the pipeline fed.
  function readRange(start, end, onData) {
    var offsets = core.chunkOffsets(start, end, config.chunkBytes), index = 0;
    counters.requests++;
    counters.lastReadAt = Date.now();
    function step() {
      if (disposed) return Promise.reject(new Error('Sessão encerrada'));
      if (index >= offsets.length) { enqueueWindow(Math.min(size - 1, end + 1)); pump(); return Promise.resolve(); }
      var offset = offsets[index++];
      var cached = store.get(offset);
      return (cached ? Promise.resolve(cached) : ensure(offset).then(function () { return store.get(offset); })).then(function (chunk) {
        if (!chunk) throw new Error('Bloco indisponível.');
        var from = Math.max(0, start - offset), to = Math.min(chunk.length, end - offset + 1);
        if (to <= from) throw new Error('Faixa indisponível nesta posição.');
        counters.bytesServed += (to - from);
        onData(chunk.slice(from, to));
        store.release(offset);
        if (offset + chunk.length > anchor) anchor = offset + chunk.length;
        return step();
      });
    }
    return step();
  }
  function recentMbps() {
    var now = Date.now(), window = samples.filter(function (sample) { return now - sample.at <= 3000; });
    if (window.length < 2) return 0;
    var first = window[0], last = window[window.length - 1];
    return core.mbpsFromBytes(last.bytes - first.bytes, last.at - first.at);
  }
  return {
    size: size,
    contentType: options.contentType || 'application/octet-stream',
    config: config,
    store: store,
    readRange: readRange,
    ensure: ensure,
    pump: pump,
    enqueueWindow: enqueueWindow,
    recentMbps: recentMbps,
    touch: function () { counters.lastReadAt = Date.now(); },
    idleFor: function () { return Date.now() - counters.lastReadAt; },
    stats: function () {
      var stored = store.stats();
      return {
        size: size,
        config: { connections: config.connections, chunkMb: config.chunkMb, windowMb: config.windowMb },
        requests: counters.requests, chunks: counters.chunks, failed: counters.failed, pending: counters.pending,
        bytesFetched: counters.bytesFetched, bytesServed: counters.bytesServed,
        discardedChunks: stored.counters.discarded, discardedBytes: stored.counters.discardedBytes,
        retainedChunks: stored.chunks, retainedBytes: stored.storedBytes,
        mbps: recentMbps(), uptimeMs: Date.now() - counters.startedAt, idleMs: Date.now() - counters.lastReadAt
      };
    },
    dispose: function () {
      disposed = true;
      queue.length = 0;
      store.clear();
      Object.keys(waiters).forEach(function (offset) {
        waiters[offset].forEach(function (waiter) { waiter.reject(new Error('Sessão encerrada')); });
        delete waiters[offset];
      });
    }
  };
}

var MEASURE = { warmupBytes: 256 * 1024, minBytes: 2 * MB, maxBytes: 8 * MB, minMs: 800, maxMs: 5000, subWindowMs: 500, timeoutMs: 20000 };
// The cell under test pays for one window of blocks at least; never more than the ceiling,
// because every cell is the user's own traffic (and the debrid provider's bandwidth).
function measureBudget(config) {
  var bytes = Math.max(MEASURE.minBytes, config.cellBytes);
  return {
    warmupBytes: MEASURE.warmupBytes,
    measureBytes: Math.min(MEASURE.maxBytes, bytes),
    minMs: MEASURE.minMs, maxMs: MEASURE.maxMs, subWindowMs: MEASURE.subWindowMs, timeoutMs: MEASURE.timeoutMs
  };
}
// One sweep cell: read the transport with this configuration and report what was measured.
// StreamSpeedTester's clock starts after the warm-up bytes and stops at the byte budget or
// the window, whichever comes first; the sub-window series comes from a timer that samples
// the same tally, never from the read loop (the fork learned that the hard way).
function measure(payload) {
  return new Promise(function (resolve) {
    if (!valid(payload)) { resolve({ ok: false, failure: 'requisição inválida' }); return; }
    var target = parseTarget(payload.url), headers = cleanHeaders(payload.headers);
    var settings = core.readMediaSettings(payload), config = core.mediaConfig(settings);
    if (!config.fitsWindow) { resolve({ ok: false, failure: 'a memória reservada é menor que os blocos em paralelo' }); return; }
    probe(target, headers, { transports: payload.transports, timeoutMs: payload.timeoutMs }).then(function (info) {
      var budget = measureBudget(config);
      var session = createSession({ target: target, headers: headers, settings: settings, size: info.size, contentType: info.contentType, transports: payload.transports, timeoutMs: payload.timeoutMs });
      var samples = [], started = Date.now(), stopped = false, failure = null;
      var sampler = setInterval(function () { samples.push({ at: Date.now(), bytes: session.stats().bytesFetched }); }, budget.subWindowMs);
      var end = Math.min(info.size - 1, budget.warmupBytes + budget.measureBytes - 1);
      session.readRange(0, end, function () {
        var stats = session.stats();
        // The budget stops the cell: the transport answered, the clock is what ran out.
        if (stats.bytesFetched >= budget.warmupBytes + budget.measureBytes || (Date.now() - started >= budget.maxMs && samples.length >= 2)) {
          stopped = true;
          throw new Error('__budget__');
        }
      }).then(function () { /* leu o arquivo inteiro */ }, function (error) {
        var message = String(error && error.message || 'falha de rede');
        if (message !== '__budget__') failure = message;
      }).then(function () {
        clearInterval(sampler);
        var stats = session.stats();
        session.dispose();
        samples.push({ at: Date.now(), bytes: stats.bytesFetched });
        resolve(measureResult(samples, stats, budget, failure, info.size, stopped));
      });
    }, function (error) { resolve({ ok: false, failure: String(error && error.message || 'a sonda recusou a fonte') }); });
  });
}
function measureResult(samples, stats, budget, failure, size, stopped) {
  var first = null;
  for (var index = 0; index < samples.length; index++) {
    if (samples[index].bytes > budget.warmupBytes) { first = samples[index]; break; }
  }
  var last = samples[samples.length - 1];
  var measured = first ? Math.max(0, stats.bytesFetched - budget.warmupBytes) : 0;
  var ms = first ? Math.max(0, last.at - first.at) : 0;
  return {
    ok: !failure && measured > 0,
    failure: failure || (measured > 0 ? null : 'nenhum byte medido'),
    mbps: core.mbpsFromBytes(measured, ms),
    bytes: measured, ms: ms,
    subWindows: core.sampleRates(samples, budget.warmupBytes),
    truncated: !stopped && size > budget.warmupBytes + budget.measureBytes,
    chunks: stats.chunks, failedChunks: stats.failed
  };
}
function token() {
  var value = '';
  while (value.length < 24) value += Math.random().toString(36).slice(2);
  return value.slice(0, 24);
}
function ensureServer(callback) {
  if (server) { callback(null, serverPort); return; }
  var created = http.createServer(handleRequest);
  created.on('error', function () { server = null; callback(new Error('Servidor local indisponível.')); });
  created.listen(0, '127.0.0.1', function () {
    server = created;
    serverPort = created.address().port;
    callback(null, serverPort);
  });
}
function closeServer() {
  if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
  if (!server) return;
  var closing = server;
  server = null; serverPort = 0;
  try { closing.close(); } catch (_) { /* já fechado */ }
}
function scheduleIdle() {
  if (idleTimer) return;
  idleTimer = setInterval(function () {
    var ids = Object.keys(sessions);
    for (var index = 0; index < ids.length; index++) {
      if (sessions[ids[index]].idleFor() > IDLE_STOP_MS) stopSession(ids[index]);
    }
    if (!Object.keys(sessions).length) closeServer();
  }, 30000);
}
// The TV's media element talks to this handler exactly like it talks to a file: HEAD to
// learn the size, then ranges. Everything else is refused.
function handleRequest(req, res) {
  var match = /^\/m\/([A-Za-z0-9]+)$/.exec(String(req.url || '').split('?')[0]);
  var session = match ? sessions[match[1]] : null;
  if (!session) { res.statusCode = 404; res.end(); return; }
  session.touch();
  var range = core.parseRange(req.headers.range, session.size);
  if (range && range.invalid) { res.statusCode = 416; res.setHeader('Content-Range', 'bytes */' + session.size); res.end(); return; }
  var start = range ? range.start : 0, end = range ? range.end : session.size - 1;
  res.statusCode = range ? 206 : 200;
  res.setHeader('Content-Type', session.contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(end - start + 1));
  if (range) res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + session.size);
  if (req.method === 'HEAD') { res.end(); return; }
  session.readRange(start, end, function (slice) { res.write(slice); }).then(function () {
    res.end();
  }, function () {
    // A failed chunk ends the response instead of serving a hole; the element re-asks.
    try { res.end(); } catch (_) { /* desconectado */ }
  });
}
function stopSession(id) {
  var session = sessions[id];
  if (!session) return false;
  session.dispose();
  delete sessions[id];
  return true;
}
function stopAll() {
  Object.keys(sessions).forEach(stopSession);
  closeServer();
}
// The page asks for a playable local URL; the probe decides whether that is possible at
// all. A refusal always carries the reason, and the app plays the original URL instead.
function start(payload) {
  return new Promise(function (resolve, reject) {
    if (!valid(payload)) { reject(new Error('Requisição inválida')); return; }
    var target = parseTarget(payload.url), headers = cleanHeaders(payload.headers);
    var settings = core.readMediaSettings(payload);
    var config = core.mediaConfig(settings);
    if (!config.fitsWindow) { reject(new Error('A memória reservada é menor que os blocos em paralelo.')); return; }
    probe(target, headers, { transports: payload.transports, timeoutMs: payload.timeoutMs }).then(function (info) {
      stopAll();
      var id = token();
      var session = createSession({ target: target, headers: headers, settings: settings, size: info.size, contentType: info.contentType, transports: payload.transports, timeoutMs: payload.timeoutMs });
      sessions[id] = session;
      ensureServer(function (error, port) {
        if (error) { stopSession(id); reject(error); return; }
        scheduleIdle();
        session.enqueueWindow(0);
        session.pump();
        resolve({
          ok: true, token: id, port: port, path: '/m/' + id, url: 'http://127.0.0.1:' + port + '/m/' + id,
          size: info.size, contentType: info.contentType,
          config: { connections: config.connections, chunkMb: config.chunkMb, windowMb: config.windowMb }
        });
      });
    }, reject);
  });
}
function stats(payload) {
  var id = payload && String(payload.token || '');
  var session = sessions[id];
  return session ? session.stats() : null;
}
function stop(payload) {
  var id = payload && String(payload.token || '');
  var stopped = id ? stopSession(id) : false;
  if (!Object.keys(sessions).length) closeServer();
  return { stopped: stopped };
}
module.exports = {
  valid: valid,
  parseTarget: parseTarget,
  cleanHeaders: cleanHeaders,
  openRange: openRange,
  fetchRange: fetchRange,
  probe: probe,
  createSession: createSession,
  createHandler: handleRequest,
  measure: measure,
  measureBudget: measureBudget,
  start: start,
  stats: stats,
  stop: stop,
  stopAll: stopAll,
  sessions: sessions,
  limits: { MAX_SESSIONS: MAX_SESSIONS, IDLE_STOP_MS: IDLE_STOP_MS, CHUNK_TIMEOUT_MS: CHUNK_TIMEOUT_MS }
};

