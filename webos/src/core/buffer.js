// SPDX-License-Identifier: GPL-3.0-only
// PlayerSettingsDataStore.BufferSettings at 45e0984: the two durations the TV's media
// element can honour — how much media to load before starting, and how much to hold
// before resuming after a stall. The Android byte budgets, media3 min/max windows and
// the disk cache have no equivalent here and stay documented as pending.
export const bufferRanges = Object.freeze({ initial: [0, 20], afterRebuffer: [0, 20] });
// Same defaults the fork ships for bufferForPlaybackMs and bufferForPlaybackAfterRebufferMs.
export const bufferDefaults = Object.freeze({ custom: false, initial: 5, afterRebuffer: 3, waitTimeout: 20 });
export const readBufferSeconds = (value, key) => {
  const [min, max] = bufferRanges[key];
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) return bufferDefaults[key];
  return Math.max(min, Math.min(max, seconds));
};
export const readWaitTimeout = value => {
  const seconds = Math.round(Number(value));
  return Number.isFinite(seconds) ? Math.max(5, Math.min(60, seconds)) : bufferDefaults.waitTimeout;
};
// With the custom buffer off the port keeps the player's own behaviour, exactly like
// the fork falls back to the media3 defaults when the switch is off.
export const initialTarget = playback => playback?.customBuffer ? readBufferSeconds(playback.bufferInitial, 'initial') : 0;
export const rebufferTarget = playback => playback?.customBuffer ? readBufferSeconds(playback.bufferAfterRebuffer, 'afterRebuffer') : 0;
// TimeRanges from the media element, or plain [start, end] pairs in tests.
export function toRanges(ranges) {
  const list = [];
  const length = Number.isFinite(ranges?.length) ? ranges.length : 0;
  const methods = typeof ranges?.start === 'function' && typeof ranges?.end === 'function';
  for (let index = 0; index < length; index++) {
    const pair = ranges[index];
    const paired = Boolean(pair) && typeof pair.length === 'number';
    const start = Number(paired ? pair[0] : methods ? ranges.start(index) : NaN);
    const end = Number(paired ? pair[1] : methods ? ranges.end(index) : NaN);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) list.push({ start, end });
  }
  return list;
}
// Seconds of contiguous media already loaded from the current position. Gaps stop the
// count, which is what "buffer" means for the viewer.
export function bufferedAhead(ranges, position) {
  if (!Number.isFinite(position)) return 0;
  const covering = toRanges(ranges).find(range => range.start <= position + 0.05 && range.end > position);
  return covering ? Math.max(0, covering.end - position) : 0;
}
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelado', 'AbortError')); };
  if (signal?.aborted) { abort(); return; }
  signal?.addEventListener('abort', abort, { once: true });
});
// Waits for the target, with the fork's own guard: playback never waits forever, so a
// slow source still starts (and can rebuffer) instead of sitting on a black screen.
export async function waitForBuffer({ target, read, timeout, delay = 200, signal, now = () => Date.now(), wait = sleep }) {
  if (!(target > 0)) return 'ready';
  const deadline = now() + Math.max(0, timeout);
  for (;;) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    if (read() >= target) return 'ready';
    if (now() >= deadline) return 'timeout';
    await wait(delay, signal);
  }
}
export function bufferStatusText(target) { return `Aguardando buffer (${target}s)…`; }
