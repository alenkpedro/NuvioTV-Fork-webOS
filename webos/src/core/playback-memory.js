// SPDX-License-Identifier: GPL-3.0-only
// TrackPreferenceDataStore: speed belongs to a title, delay to a video ID.
import { trackMemoryKey } from './subtitle-options.js';
export const playbackSpeeds = Object.freeze([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
function videoKey(context) {
  return ['movie','series'].includes(context.type) && typeof context.id === 'string' && context.id.length > 0 && context.id.length <= 512 ? JSON.stringify([context.type,context.id]) : null;
}
function remember(state,field,key,value,defaultValue) {
  if (!key) return;
  const entries = Object.entries(state[field] || {}).filter(([id])=>id!==key);
  if (value !== defaultValue) entries.push([key,value]);
  state[field] = Object.fromEntries(entries.slice(-100));
}
export function readSpeed(state,meta) { const speed = state.playbackSpeeds?.[trackMemoryKey(meta)]; return playbackSpeeds.includes(speed) ? speed : 1; }
export function saveSpeed(state,meta,speed) { if (playbackSpeeds.includes(speed)) remember(state,'playbackSpeeds',trackMemoryKey(meta),speed,1); }
export function readDelay(state,context) { const delay = state.subtitleDelays?.[videoKey(context)]; return Number.isFinite(delay) && Math.abs(delay)<=10 ? delay : 0; }
export function saveDelay(state,context,delay) { if (Number.isFinite(delay) && Math.abs(delay)<=10) remember(state,'subtitleDelays',videoKey(context),delay,0); }
export function setPlaybackSpeed(video,speed) {
  if (!playbackSpeeds.includes(speed)) throw Error('Velocidade inválida.');
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw Error('Aguarde o vídeo carregar. Velocidade disponível para vídeos com duração definida.');
  const previous = video.playbackRate;
  try {
    video.playbackRate = speed;
    if (!Number.isFinite(video.playbackRate) || Math.abs(video.playbackRate-speed)>0.001) throw Error();
  } catch {
    try { video.playbackRate = previous; } catch {}
    throw Error('Esta fonte ou o player da TV não aceitou essa velocidade. A velocidade anterior foi mantida.');
  }
}
