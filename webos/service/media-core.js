// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// Pure rules of the local media transport. The Android fork reads the file through
// ui/screens/player/ParallelRangeDataSource.kt (chunked parallel range reads, chunk
// retention, seams) and gates every configuration against
// ui/screens/settings/MemoryBudget.kt. A web app cannot open those sockets for its media
// element, so the port runs the same idea in the packaged Node service: the chunks, the
// ranges and the memory ceiling are decided here, and service/media.js moves the bytes.
// Kept in CommonJS and ES5 because the service runtime is old Node; unit tests load this
// file with createRequire, exactly like service/net.js.
var DEFAULTS = { connections: 2, chunkMb: 1, windowMb: 24 };
// PlayerPlaybackNetworking caps the fork at 8 connections; the chunk ladder there is
// 8/16/32/64/128 MB, which is a phone-box budget. A TV service that shares RAM with the
// app keeps the ladder small and says so in the settings note.
var LIMITS = { connections: [1, 8], chunkMb: [1, 8], windowMb: [8, 128] };
var MB = 1024 * 1024;
function readInt(value, range, fallback) {
  var number = Number(value);
  if (!isFinite(number)) return fallback;
  number = Math.round(number);
  return Math.min(range[1], Math.max(range[0], number));
}
function readMediaSettings(payload) {
  var p = payload && typeof payload === 'object' ? payload : {};
  return {
    connections: readInt(p.connections, LIMITS.connections, DEFAULTS.connections),
    chunkMb: readInt(p.chunkMb, LIMITS.chunkMb, DEFAULTS.chunkMb),
    windowMb: readInt(p.windowMb, LIMITS.windowMb, DEFAULTS.windowMb)
  };
}
function mediaConfig(settings) {
  var config = {
    connections: settings.connections,
    chunkMb: settings.chunkMb,
    windowMb: settings.windowMb,
    chunkBytes: settings.chunkMb * MB,
    windowBytes: settings.windowMb * MB
  };
  // MemoryBudget.overheadMb: connections * chunk. Above the window the service would
  // evict chunks it is still downloading, which is the fork's discard-and-re-download bug.
  config.cellBytes = config.connections * config.chunkBytes;
  config.fitsWindow = config.cellBytes <= config.windowBytes;
  return config;
}
function mediaSettingsFromPlayback(prefs) {
  var p = prefs && typeof prefs === 'object' ? prefs : {};
  return readMediaSettings({ connections: p.mediaConnections, chunkMb: p.mediaChunkMb, windowMb: p.mediaWindowMb });
}
// "bytes=0-1023", "bytes=1024-", "bytes=-512". Anything else is invalid, and an absent
// header means the whole body.
function parseRange(header, size) {
  if (header === undefined || header === null || header === '') return null;
  var match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match) return { invalid: true };
  var start = match[1] === '' ? -1 : Number(match[1]);
  var end = match[2] === '' ? -1 : Number(match[2]);
  if (start < 0 && end < 0) return { invalid: true };
  if (!(size > 0)) return { invalid: true };
  if (start < 0) { start = Math.max(0, size - end); end = size - 1; }
  else if (end < 0 || end >= size) end = size - 1;
  if (start > end || start >= size) return { invalid: true };
  return { start: start, end: end, length: end - start + 1, partial: true };
}
function alignChunk(offset, chunkBytes) {
  if (!(chunkBytes > 0) || !(offset > 0)) return 0;
  return Math.floor(offset / chunkBytes) * chunkBytes;
}


// The offsets of the fixed-size chunks that cover [start, end].
function chunkOffsets(start, end, chunkBytes) {
  var offsets = [];
  if (!(chunkBytes > 0) || !(end >= start) || start < 0) return offsets;
  for (var offset = alignChunk(start, chunkBytes); offset <= end; offset += chunkBytes) offsets.push(offset);
  return offsets;
}
// Read-ahead: the chunks from the current position up to one window, in playback order.
// The fork keeps the pipeline fed instead of chasing the reader chunk by chunk.
function readAheadOffsets(position, size, config) {
  var offsets = chunkOffsets(position, Math.min(size - 1, position + config.windowBytes - 1), config.chunkBytes);
  return offsets.slice(0, Math.max(1, Math.ceil(config.windowBytes / config.chunkBytes)));
}
function chunkLength(offset, chunkBytes, size) {
  var remaining = size - offset;
  if (!(remaining > 0)) return 0;
  return Math.min(chunkBytes, remaining);
}
// Least-recently-used chunk store with a hard byte ceiling; a chunk that is evicted before
// it was ever served is counted as a discard, the way the fork counts the bytes it paid for
// and threw away.
function createChunkStore(windowBytes, chunkBytes) {
  var entries = new Map();
  var stored = 0;
  var counters = { fetched: 0, served: 0, hits: 0, misses: 0, discarded: 0, discardedBytes: 0 };
  function touch(entry) { entries.delete(entry.offset); entries.set(entry.offset, entry); }
  function evict() {
    while (stored > windowBytes && entries.size > 1) {
      var oldest = entries.keys().next().value;
      var entry = entries.get(oldest);
      if (entry.used) break;
      entries.delete(oldest);
      stored -= entry.buffer.length;
      counters.discarded++;
      counters.discardedBytes += entry.buffer.length;
    }
  }
  return {
    chunkBytes: chunkBytes,
    windowBytes: windowBytes,
    has: function (offset) { return entries.has(offset); },
    get: function (offset) {
      var entry = entries.get(offset);
      if (!entry) { counters.misses++; return null; }
      entry.used = true;
      counters.hits++;
      counters.served += entry.buffer.length;
      touch(entry);
      return entry.buffer;
    },
    put: function (offset, buffer, expectedLength) {
      var expected = expectedLength === undefined ? buffer.length : expectedLength;
      // A short body is a truncated chunk: keeping it would serve a corrupt seam.
      if (!buffer || buffer.length < expected) return false;
      if (entries.has(offset)) stored -= entries.get(offset).buffer.length;
      entries.set(offset, { offset: offset, buffer: buffer, used: false });
      stored += buffer.length;
      counters.fetched += buffer.length;
      evict();
      return true;
    },
    release: function (offset) {
      var entry = entries.get(offset);
      if (entry) entry.used = false;
    },
    clear: function () { entries.clear(); stored = 0; },
    stats: function () { return { chunks: entries.size, storedBytes: stored, windowBytes: windowBytes, chunkBytes: chunkBytes, counters: counters }; }
  };
}
// Sub-window rates from the tally samples: consecutive samples after the warm-up bytes. The
// caller samples the same counter the headline uses, so this costs no extra traffic.
function sampleRates(samples, warmupBytes) {
  if (!Array.isArray(samples) || samples.length < 3) return [];
  var rates = [], previous = null;
  for (var index = 0; index < samples.length; index++) {
    var sample = samples[index];
    if (!sample || sample.bytes <= warmupBytes) { previous = null; continue; }
    if (previous) {
      var rate = mbpsFromBytes(sample.bytes - previous.bytes, sample.at - previous.at);
      if (rate > 0) rates.push(rate);
    }
    previous = sample;
  }
  return rates;
}
// StreamSweepEngine's economy rule, applied to the transport the port actually owns: a
// configuration is worth adopting only when it beats the current one by the same 10% bar.
function betterCell(candidateMbps, currentMbps, tolerance) {
  var bar = currentMbps > 0 ? currentMbps * (tolerance === undefined ? 1.1 : tolerance) : 0;
  if (!(candidateMbps > 0)) return false;
  return candidateMbps > bar;
}
function mbpsFromBytes(bytes, ms) {
  if (!(bytes > 0) || !(ms > 0)) return 0;
  return (bytes * 8) / ms / 1000;
}
module.exports = {
  DEFAULTS: DEFAULTS,
  LIMITS: LIMITS,
  MB: MB,
  readMediaSettings: readMediaSettings,
  mediaSettingsFromPlayback: mediaSettingsFromPlayback,
  mediaConfig: mediaConfig,
  parseRange: parseRange,
  alignChunk: alignChunk,
  chunkOffsets: chunkOffsets,
  readAheadOffsets: readAheadOffsets,
  chunkLength: chunkLength,
  createChunkStore: createChunkStore,
  sampleRates: sampleRates,
  betterCell: betterCell,
  mbpsFromBytes: mbpsFromBytes
};
