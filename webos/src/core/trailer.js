// SPDX-License-Identifier: GPL-3.0-only
// TrailerSettingsDataStore.kt and PostPlayRecommendationState.kt at 45e0984: the
// autoplay flag, the 3-15 s delay slider and the five-second end countdown that
// precedes the recommendation's trailer.
export const trailerDelayRange = Object.freeze([3, 15]);
export const trailerDelayDefault = 7;
export const postPlayTrailerCountdown = 5;
export const readTrailerDelay = value => {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) return trailerDelayDefault;
  return Math.max(trailerDelayRange[0], Math.min(trailerDelayRange[1], seconds));
};
// postPlayRecommendationCountdownSeconds: the value shown in the last five seconds.
// The fork works in milliseconds; this port keeps the seconds the video element
// exposes, so the window is the same five seconds of playback.
export function postPlayCountdown(position, duration) {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return null;
  const remaining = Math.max(0, duration - position);
  if (remaining > postPlayTrailerCountdown) return null;
  return Math.max(1, Math.min(postPlayTrailerCountdown, Math.ceil(remaining)));
}
// The fork starts the countdown only while the recommendation is on screen and the
// trailer has not played yet; the flag and the current trailer decide the rest.
export function shouldCountTrailer({ enabled = false, open = false, launched = false, hasTrailer = false } = {}) {
  return Boolean(enabled && open && !launched && hasTrailer);
}
