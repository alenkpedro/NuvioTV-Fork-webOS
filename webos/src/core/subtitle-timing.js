// SPDX-License-Identifier: GPL-3.0-only
// SubtitleTimingDialog / SubtitleDelayConfig / PlayerRuntimeControllerSubtitleTiming.
// Seconds at the HTML media boundary; round to milliseconds before storing.
export const SUBTITLE_DELAY_LIMIT = 180;
export const SUBTITLE_DELAY_STEP = 0.1;
export function clampSubtitleDelay(seconds) {
  if (!Number.isFinite(seconds)) throw Error('Atraso de legenda inválido.');
  return Math.max(-SUBTITLE_DELAY_LIMIT, Math.min(SUBTITLE_DELAY_LIMIT, Math.round(seconds * 1000) / 1000));
}
export function syncSubtitleDelay(captured, cueStart) {
  if (!Number.isFinite(captured) || captured < 0 || !Number.isFinite(cueStart) || cueStart < 0) throw Error('Posição de sincronização inválida.');
  return clampSubtitleDelay(captured - cueStart - 0.3);
}
export function formatSubtitleDelay(seconds) {
  const ms = Math.round(clampSubtitleDelay(seconds) * 1000);
  return `${ms > 0 ? '+' : ''}${ms} ms`;
}
export function cueTimestamp(seconds) {
  const total = Math.max(0, Math.floor(seconds)), s = String(total % 60).padStart(2, '0'), m = String(Math.floor(total / 60) % 60).padStart(2, '0');
  return total >= 3600 ? `${Math.floor(total / 3600)}:${m}:${s}` : `${m}:${s}`;
}
export function nearestCueIndex(cues, anchor) {
  let nearest = 0;
  for (let i = 1; i < cues.length; i++) if (Math.abs(cues[i].start - anchor) < Math.abs(cues[nearest].start - anchor)) nearest = i;
  return nearest;
}
export function selectSyncCues(cues, anchor) {
  if (!Number.isFinite(anchor) || anchor < 0) return [];
  const sorted = cues.filter(cue => Number.isFinite(cue.start) && cue.start >= 0 && typeof cue.text === 'string' && cue.text.trim()).slice().sort((a, b) => a.start - b.start);
  const window = sorted.filter(cue => cue.start >= Math.max(0, anchor - 180) && cue.start <= anchor + 180);
  const items = window.length ? window : sorted;
  const start = Math.max(0, Math.min(items.length - 90, nearestCueIndex(items, anchor) - 45));
  return items.slice(start, start + 90);
}
