// SPDX-License-Identifier: GPL-3.0-only
// core/network/StreamSpeedTester.kt at 45e0984, measured through the same transport the
// port plays with: a ranged fetch on the real source. The fork's warm-up, byte budget
// and sub-window stability idea are kept; the connection-count sweep of
// StreamSweepEngine does not exist here, because a web app cannot open parallel
// sockets for the media element.
export const speedBudget = Object.freeze({
  warmupBytes: 256 * 1024,
  measureBytes: 2 * 1024 * 1024,
  minMs: 800,
  maxMs: 4000,
  subWindowMs: 400,
  timeoutMs: 8000,
  maxSources: 4,
  maxConcurrent: 2
});
export const speedRequestHeaders = budget => ({ Range: `bytes=0-${Math.max(1, budget.warmupBytes + budget.measureBytes) - 1}`, 'Cache-Control': 'no-store' });
export const formatMbps = mbps => Number.isFinite(mbps) && mbps > 0 ? `${mbps.toFixed(mbps >= 10 ? 0 : 1).replace('.', ',')} Mbps` : 'sem medição';
export const formatLatency = ms => Number.isFinite(ms) && ms >= 0 ? `${Math.round(ms)} ms` : 'sem medição';
export const formatSpeed = result => !result ? '' : result.mbps > 0 ? `${result.approximate ? '~' : ''}${formatMbps(result.mbps)} · ${formatLatency(result.latencyMs)}` : result.failure || 'sem medição';
// StreamSpeedTester's clock starts after the warm-up bytes (TCP slow-start is not the
// link's speed) and stops at the byte budget or the window, whichever comes first.
export function mbpsFrom(bytes, ms) {
  if (!Number.isFinite(bytes) || !Number.isFinite(ms) || bytes <= 0 || ms <= 0) return 0;
  return (bytes * 8) / ms / 1000;
}
// Per-sub-window rates behind the headline, from the chunk samples: a burst that only
// lasts a moment should not look like a stable link.
export function subWindowRates(samples, windowMs) {
  if (!Array.isArray(samples) || samples.length < 2 || !(windowMs > 0)) return [];
  const first = samples[0].at;
  const buckets = [];
  for (const sample of samples) {
    const index = Math.floor((sample.at - first) / windowMs);
    if (index < 0) continue;
    buckets[index] ||= { at: first + index * windowMs, bytes: 0 };
    buckets[index].bytes = Math.max(buckets[index].bytes, sample.bytes);
  }
  const rates = [];
  for (let index = 1; index < buckets.length; index++) {
    const previous = buckets[index - 1], current = buckets[index];
    if (!previous || !current) continue;
    const rate = mbpsFrom(Math.max(0, current.bytes - previous.bytes), current.at - previous.at);
    if (rate > 0) rates.push(rate);
  }
  return rates;
}
// Never throws: a failed source is a measurement with a reason, like the fork records
// a failed cell and keeps the sweep going.
export async function measureSource(url, { request = fetch, signal, budget = speedBudget, now = () => performance.now() } = {}) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false, failure: 'a fonte não é um link HTTP(S) direto', bytes: 0, ms: 0, mbps: 0, latencyMs: null, subWindows: [] };
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const stop = setTimeout(() => controller.abort(), budget.timeoutMs);
  const started = now();
  try {
    const response = await request(url, { headers: speedRequestHeaders(budget), signal: controller.signal, cache: 'no-store' });
    const latencyMs = now() - started;
    if (!response || typeof response !== 'object') return { ok: false, failure: failureText(0, 'network'), bytes: 0, ms: 0, mbps: 0, latencyMs, subWindows: [] };
    if (response.status && (response.status < 200 || response.status >= 300)) return { ok: false, failure: failureText(response.status), bytes: 0, ms: 0, mbps: 0, latencyMs, subWindows: [] };
    const reader = response.body?.getReader?.();
    if (!reader) return { ok: false, failure: failureText(0, 'body'), bytes: 0, ms: 0, mbps: 0, latencyMs, subWindows: [] };
    const samples = [];
    let read = 0, measured = 0, measureStart = 0, measuredWindow = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value?.byteLength ?? value?.length ?? 0;
      if (read <= budget.warmupBytes) continue;
      if (!measureStart) { measureStart = now(); samples.push({ at: measureStart, bytes: 0 }); }
      measured = read - budget.warmupBytes;
      measuredWindow = now() - measureStart;
      samples.push({ at: now(), bytes: measured });
      if (measured >= budget.measureBytes) break;
      if (measuredWindow >= budget.maxMs && measuredWindow >= budget.minMs) break;
    }
    try { await reader.cancel(); } catch { /* the element owns the socket, not us */ }
    if (!measured) return { ok: false, failure: failureText(0, 'empty'), bytes: 0, ms: 0, mbps: 0, latencyMs, subWindows: [] };
    // A body that arrives in one block leaves no measured window of its own, so the rate
    // is taken over the whole request (latency included) and flagged as approximate.
    const window = Math.max(0, now() - measureStart);
    const approximate = !(window > 0);
    const ms = approximate ? Math.max(1, now() - started) : window;
    return { ok: true, failure: null, bytes: measured, ms, mbps: mbpsFrom(measured, ms), latencyMs, subWindows: subWindowRates(samples, budget.subWindowMs), approximate };
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    return { ok: false, failure: error?.name === 'AbortError' ? failureText(0, 'timeout') : failureText(0, 'network'), bytes: 0, ms: 0, mbps: 0, latencyMs: null, subWindows: [] };
  } finally {
    clearTimeout(stop);
    signal?.removeEventListener('abort', onAbort);
  }
}
// Measures the given sources with a small bounded pool; each result carries its own
// outcome, so one dead link never hides the others.
export async function measureSources(entries, { request = fetch, signal, budget = speedBudget, concurrency = budget.maxConcurrent, onResult } = {}) {
  const list = (Array.isArray(entries) ? entries : []).slice(0, budget.maxSources);
  const results = new Map();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, async () => {
    while (cursor < list.length && !signal?.aborted) {
      const entry = list[cursor++];
      const result = await measureSource(entry.url, { request, signal, budget });
      results.set(entry.key, result);
      onResult?.(entry.key, result);
    }
  }));
  return results;
}

const failureText = (status, reason) => status ? `HTTP ${status}` : reason === 'body' ? 'sem corpo na resposta' : reason === 'empty' ? 'nenhum byte recebido' : reason === 'timeout' ? 'tempo esgotado' : 'falha de rede';
