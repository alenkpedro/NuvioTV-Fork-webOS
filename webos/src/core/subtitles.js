// SPDX-License-Identifier: GPL-3.0-only
// Addon contract: SubtitleRepositoryImpl. SRT/VTT rendering is local to webOS.
import { getJSON, mapLimit, resourceURL, supports } from './addons.js';
export const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;
const MAX_CUES = 20000;
export function subtitleURL(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function normalizeSubtitles(items, source = 'Fonte') {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).slice(0, 200).flatMap((item, index) => {
    const url = subtitleURL(item?.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ url, id: String(item.id || index), lang: String(item.lang || item.language || 'und').slice(0, 40),
      name: String(item.name || item.label || '').slice(0, 200), source, format: String(item.format || '').toLowerCase() }];
  });
}
export function subtitleExtras(stream) {
  const hints = stream?.behaviorHints || {}, extras = {};
  if (typeof hints.videoHash === 'string' && /^[a-f0-9]{16}$/i.test(hints.videoHash)) extras.videoHash = hints.videoHash;
  if (Number.isSafeInteger(hints.videoSize) && hints.videoSize > 0) extras.videoSize = hints.videoSize;
  if (typeof hints.filename === 'string' && hints.filename.length <= 1024) extras.filename = hints.filename;
  return extras;
}
export async function discoverSubtitles(addons, { type, id, stream }, signal) {
  const providers = addons.filter(a => supports(a, 'subtitles', type, id)).slice(0, 30);
  const results = await mapLimit(providers, async addon => {
    const data = await getJSON(resourceURL(addon, 'subtitles', type, id, subtitleExtras(stream)), { signal });
    if (!Array.isArray(data?.subtitles)) throw Error('Resposta de legendas inválida.');
    return normalizeSubtitles(data.subtitles, addon.manifest.name);
  }, signal);
  return { subtitles: results.flatMap(r => r.value || []).slice(0, 300), failed: results.filter(r => r.error).length, providers: providers.length };
}
function timestamp(value) {
  const m = value.match(/^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/);
  if (!m || Number(m[2]) > 59 || Number(m[3]) > 59) return NaN;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}
export function plainCue(value) {
  // Never insert subtitle markup as HTML. Remove cue formatting before decoding entities.
  return String(value).replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|nbsp|quot|apos);/gi, (_, entity) => {
    if (entity[0] !== '#') return { amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', apos: "'" }[entity.toLowerCase()] || '';
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
  }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 4096);
}
export function parseSubtitles(value) {
  const text = String(value).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (text.length > MAX_SUBTITLE_BYTES) throw Error('Legenda muito grande para esta TV.');
  if (/^\s*(?:<!doctype|<html|\[Script Info\]|PK\x03\x04)/i.test(text)) throw Error('Esta legenda não está em SRT ou WebVTT. Arquivos ZIP e ASS ainda não são suportados.');
  const cues = [];
  for (const block of text.split(/\n[ \t]*\n/)) {
    if (/^(?:WEBVTT|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block.trimStart())) continue;
    const lines = block.trim().split('\n');
    const index = lines[0]?.includes('-->') ? 0 : 1;
    const timing = lines[index]?.trim().match(/^(\S+)\s+-->\s+(\S+)(?:\s.*)?$/);
    if (!timing) continue;
    const start = timestamp(timing[1]), end = timestamp(timing[2]);
    const cue = plainCue(lines.slice(index + 1).join('\n'));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !cue) continue;
    if (cues.length >= MAX_CUES) throw Error('Legenda com trechos demais para esta TV.');
    cues.push({ start, end, text: cue });
  }
  if (!cues.length) throw Error('Nenhum trecho SRT/WebVTT válido foi encontrado nesta legenda.');
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  let maxEnd = 0;
  for (const cue of cues) { maxEnd = Math.max(maxEnd, cue.end); cue.maxEnd = maxEnd; }
  return cues;
}
export function subtitleFrame(cues, time) {
  let lo = 0, hi = cues.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (cues[mid].start <= time) lo = mid + 1; else hi = mid; }
  let next = cues[lo]?.start ?? Infinity; const active = [];
  for (let i = lo - 1; i >= 0 && cues[i].maxEnd > time; i--) {
    if (cues[i].end > time) { active.unshift(cues[i].text); next = Math.min(next, cues[i].end); if (active.length >= 8) break; }
  }
  return { text: active.join('\n'), next };
}
export async function fetchSubtitles(item, signal, fetchImpl = fetch) {
  const url = subtitleURL(item.url); if (!url) throw Error('Endereço de legenda inválido.');
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw Error(`Não foi possível carregar a legenda (HTTP ${response.status}).`);
    if (Number(response.headers.get('content-length')) > MAX_SUBTITLE_BYTES) throw Error('Legenda muito grande para esta TV.');
    const reader = response.body?.getReader(); let bytes;
    if (reader) {
      const chunks = []; let size = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_SUBTITLE_BYTES) { await reader.cancel(); throw Error('Legenda muito grande para esta TV.'); }
        chunks.push(value);
      }
      bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    } else { bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > MAX_SUBTITLE_BYTES) throw Error('Legenda muito grande para esta TV.'); }
    if (controller.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    let decoded;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) decoded = new TextDecoder('utf-16le').decode(bytes);
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) decoded = new TextDecoder('utf-16be').decode(bytes);
    else { try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { decoded = new TextDecoder('windows-1252').decode(bytes); } }
    return parseSubtitles(decoded);
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    if (controller.signal.aborted) throw Error('A legenda demorou demais. Tente outra opção.');
    if (error instanceof TypeError) throw Error('Não foi possível baixar a legenda. Verifique a rede ou tente outro addon.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
