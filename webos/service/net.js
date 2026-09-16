// SPDX-License-Identifier: GPL-3.0-only
'use strict';
// Local helper network transport: the TV page cannot set request headers or read a response the
// server does not allow through CORS, so API calls that need a key (Trakt, Simkl, debrid) and any
// fetch that needs Referer/User-Agent go through this service. It is not an open proxy: http(s)
// only, bounded headers/body/response, bounded redirects and the caller's own timeout.
// The service runtime is old Node, so this file stays in conservative ES5 (no URL class, no
// spread, no for..of), like the segments transport beside it.
var http = require('http'), https = require('https'), zlib = require('zlib'), url = require('url');
var maxBodyBytes = 1024 * 1024, maxResponseBytes = 8 * 1024 * 1024, maxRedirects = 5, headerLimit = 2000;
var allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
var blockedHeaders = ['host', 'content-length', 'connection', 'transfer-encoding', 'upgrade'];
function parse(target) {
  var parsed = url.parse(String(target || ''));
  if (!parsed || !parsed.protocol || !parsed.hostname) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed;
}
function valid(p) {
  if (!p || typeof p !== 'object') return false;
  if (!parse(p.url)) return false;
  if (p.method !== undefined && allowedMethods.indexOf(String(p.method).toUpperCase()) < 0) return false;
  if (p.headers !== undefined && (typeof p.headers !== 'object' || p.headers === null || Array.isArray(p.headers))) return false;
  if (p.body !== undefined && typeof p.body !== 'string') return false;
  if (p.body !== undefined && Buffer.byteLength(p.body, 'utf8') > maxBodyBytes) return false;
  return true;
}
function cleanHeaders(headers) {
  var out = {};
  Object.keys(headers || {}).forEach(function (key) {
    var name = String(key).trim(), value = String(headers[key] == null ? '' : headers[key]);
    if (!name || !value || !/^[A-Za-z0-9-]+$/.test(name)) return;
    if (blockedHeaders.indexOf(name.toLowerCase()) >= 0) return;
    out[name] = value.slice(0, headerLimit);
  });
  return out;
}
function decodeBody(buffer, encoding) {
  var type = String(encoding || '').toLowerCase();
  try {
    if (type.indexOf('gzip') >= 0) return zlib.gunzipSync(buffer);
    if (type.indexOf('deflate') >= 0) return zlib.inflateSync(buffer);
    if (type.indexOf('br') >= 0 && typeof zlib.brotliDecompressSync === 'function') return zlib.brotliDecompressSync(buffer);
  } catch (_) { /* keep the raw bytes when the encoding lies */ }
  return buffer;
}
var textTypes = /^(?:text\/|application\/(?:json|xml|x-www-form-urlencoded|javascript|manifest\+json)|image\/svg)/i;
function fetchOnce(options, transport) {
  return new Promise(function (resolve, reject) {
    var finished = false, bytes = 0, chunks = [], req, timer;
    function finish(error, data) { if (finished) return; finished = true; clearTimeout(timer); if (error && req) req.destroy(); error ? reject(error) : resolve(data); }
    timer = setTimeout(function () { finish(new Error('Timeout')); }, options.timeoutMs);
    req = transport.request({
      method: options.method, headers: options.headers,
      hostname: options.target.hostname, port: options.target.port || undefined,
      path: options.target.path || '/'
    }, function (res) {
      var status = res.statusCode, location = res.headers.location;
      if ([301, 302, 303, 307, 308].indexOf(status) >= 0 && location && options.redirects > 0) {
        var next = parse(url.resolve(options.target.href, location));
        if (!next) { res.resume(); finish(new Error('Redirect inválido')); return; }
        res.resume();
        var moved = { target: next, method: status === 303 ? 'GET' : options.method, headers: options.headers, timeoutMs: options.timeoutMs, redirects: options.redirects - 1 };
        moved.body = status === 303 ? undefined : options.body;
        fetchOnce(moved, transport).then(function (data) { finish(null, data); }, finish);
        return;
      }
      res.on('data', function (chunk) {
        bytes += chunk.length;
        if (bytes > maxResponseBytes) { res.destroy(); finish(new Error('Response too large')); return; }
        chunks.push(chunk);
      });
      res.on('end', function () {
        if (finished) return;
        resolve({ status: status, headers: res.headers, body: decodeBody(Buffer.concat(chunks), res.headers['content-encoding']) });
      });
      res.on('error', finish);
      res.on('aborted', function () { finish(new Error('Aborted')); });
    });
    req.on('error', finish);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}
function request(payload, transports) {
  if (!valid(payload)) return Promise.reject(new Error('Requisição inválida'));
  var target = parse(payload.url);
  var headers = cleanHeaders(payload.headers);
  if (!headers['User-Agent']) headers['User-Agent'] = 'NuvioFork-webOS';
  if (!headers.Accept) headers.Accept = '*/*';
  var table = transports || { 'http:': http, 'https:': https };
  var transport = table[target.protocol];
  if (!transport) return Promise.reject(new Error('Protocolo não suportado'));
  var options = {
    target: target, method: String(payload.method || 'GET').toUpperCase(), headers: headers,
    body: payload.body, redirects: maxRedirects,
    timeoutMs: Math.max(1000, Math.min(60000, Number(payload.timeoutMs) || 20000))
  };
  return fetchOnce(options, transport).then(function (res) {
    var type = String(res.headers['content-type'] || '').split(';')[0].trim();
    var text = textTypes.test(type) || (!type && res.body.length < 4096) ? res.body.toString('utf8') : null;
    return {
      status: res.status, ok: res.status >= 200 && res.status < 300, url: String(target.href),
      contentType: type, bytes: res.body.length, text: text === null ? undefined : text,
      bodyBase64: text === null ? res.body.toString('base64') : undefined,
      headers: { 'content-range': res.headers['content-range'], 'accept-ranges': res.headers['accept-ranges'], location: res.headers.location }
    };
  });
}
module.exports = { valid: valid, request: request, maxResponseBytes: maxResponseBytes };

