// SPDX-License-Identifier: GPL-3.0-only
// Local media transport, page side. The browser element cannot open the sockets
// ParallelRangeDataSource.kt opens, so when the user turns this on the page asks the
// packaged service for a local URL: the service pulls the file with its own parallel
// range requests (custom headers included) and serves it back from 127.0.0.1.
// Every failure path is explicit and the caller keeps the original URL, so a source the
// service cannot handle plays exactly as before.
const serviceBase = 'luna://org.nuviofork.webos.segments';
export const mediaTransportDefaults = Object.freeze({ connections: 2, chunkMb: 1, windowMb: 24 });
export const mediaTransportLimits = Object.freeze({ connections: [1, 8], chunkMb: [1, 8], windowMb: [8, 128] });
const clamp = (value, [min, max], fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};
// MemoryBudget.overheadMb: the blocks in flight must fit the reserved window, otherwise the
// service would evict chunks it is still downloading.
export function readMediaTransport(prefs = {}) {
  const settings = {
    connections: clamp(prefs.mediaConnections, mediaTransportLimits.connections, mediaTransportDefaults.connections),
    chunkMb: clamp(prefs.mediaChunkMb, mediaTransportLimits.chunkMb, mediaTransportDefaults.chunkMb),
    windowMb: clamp(prefs.mediaWindowMb, mediaTransportLimits.windowMb, mediaTransportDefaults.windowMb)
  };
  settings.cellMb = settings.connections * settings.chunkMb;
  settings.fitsWindow = settings.cellMb <= settings.windowMb;
  return settings;
}
export const localTransportEnabled = prefs => prefs?.localMediaService === true;
export function transportLabel(settings) {
  return `${settings.connections}× ${settings.chunkMb} MB · janela ${settings.windowMb} MB`;
}
// HLS and DASH are playlists: the service moves byte ranges of one file, so a playlist is
// played directly, like today.
export function directFileURL(url) {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!/^https?:\/\//i.test(value)) return false;
  return !/\.(m3u8|mpd)([?#]|$)/i.test(value);
}
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : bytes >= 1024 ** 2 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${Math.round(bytes / 1024)} KB`;
}
function bridgeAvailable(Bridge) { return typeof Bridge === 'function'; }
// One command through the packaged service; rejects with the service's own reason.
export function callService(command, payload, signal, Bridge = globalThis.PalmServiceBridge, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (!bridgeAvailable(Bridge)) { reject(Error('O serviço local não está disponível nesta TV.')); return; }
    let done = false, timer;
    const bridge = new Bridge();
    const finish = (error, data) => {
      if (done) return;
      done = true; clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      bridge.onservicecallback = () => {};
      try { bridge.cancel(); } catch {}
      error ? reject(error) : resolve(data);
    };
    const abort = () => finish(new DOMException('Cancelado', 'AbortError'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(Error('O serviço local não respondeu.')), Number(timeoutMs) + 5000);
    bridge.onservicecallback = raw => {
      try {
        const response = JSON.parse(raw);
        finish(response.returnValue === true ? null : Error(response.errorText || 'O serviço local recusou o pedido.'), response.data);
      } catch { finish(Error('Resposta inválida do serviço local.')); }
    };
    try { bridge.call(`${serviceBase}/${command}`, JSON.stringify(payload || {})); } catch { finish(Error('O serviço local não está disponível nesta TV.')); }
  });
}
export async function startLocalMedia({ stream, prefs, signal, Bridge } = {}) {
  const settings = readMediaTransport(prefs);
  if (!settings.fitsWindow) return { ok: false, reason: `a janela de ${settings.windowMb} MB é menor que os blocos em paralelo (${settings.cellMb} MB)` };
  if (!directFileURL(stream?.url)) return { ok: false, reason: 'esta fonte não é um arquivo HTTP(S) direto' };
  try {
    const started = await callService('mediastart', {
      url: stream.url,
      headers: stream.behaviorHints?.proxyHeaders?.request || stream.headers || {},
      connections: settings.connections, chunkMb: settings.chunkMb, windowMb: settings.windowMb
    }, signal, Bridge, 25000);
    if (!started?.ok || !started.url) return { ok: false, reason: 'o serviço não conseguiu abrir a fonte' };
    return { ok: true, url: started.url, token: started.token, settings, size: started.size, contentType: started.contentType };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, aborted: true, reason: 'cancelado' };
    return { ok: false, reason: error?.message || 'falha do serviço local' };
  }
}
export function measureTransport({ stream, connections, chunkMb, windowMb, signal, Bridge } = {}) {
  return callService('measure', {
    url: stream?.url,
    headers: stream?.behaviorHints?.proxyHeaders?.request || stream?.headers || {},
    connections, chunkMb, windowMb
  }, signal, Bridge, 30000)
    .then(result => result || { ok: false, failure: 'o serviço não respondeu' })
    .catch(error => ({ ok: false, failure: error?.name === 'AbortError' ? 'cancelado' : (error?.message || 'falha do serviço local') }));
}
export function stopLocalMedia(token, Bridge) {
  if (!token) return Promise.resolve(null);
  return callService('mediastop', { token }, undefined, Bridge, 5000).catch(() => null);
}
export function readLocalMediaStats(token, Bridge) {
  if (!token) return Promise.resolve(null);
  return callService('mediastats', { token }, undefined, Bridge, 5000).catch(() => null);
}
