// SPDX-License-Identifier: GPL-3.0-only
// PostPlayRecommendationTiming.kt and the PlayerSettings post-play keys.
import { readPlayback, nextThreshold } from './playback.js';
// MAX_POST_PLAY_RECOMMENDATIONS
export const postPlayMax = 4;
// MOVIE_RECOMMENDATION_PREFETCH_LEAD_PERCENT
export const postPlayPrefetchLead = 5;
export function postPlayReason(name) {
  const title = String(name ?? '').trim();
  return title ? `Porque você assistiu a ${title}` : 'Recomendado para você';
}
// Movies follow the movie threshold; episodes follow the Next Episode Threshold,
// which the port already implements for the Up Next card (PlayerNextEpisodeRules).
export function shouldShowPostPlay(settings, { type, position, duration, skipIntervals } = {}) {
  const prefs = readPlayback(settings);
  if (!prefs.postPlayRecommendations) return false;
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0) return false;
  if (type === 'movie') return position / duration >= prefs.postPlayMovieThreshold / 100;
  if (type === 'series') return skipIntervals?.some(interval => interval?.type === 'outro' && interval.end <= duration + 1 && position >= interval.start) || nextThreshold(position, duration, prefs);
  return false;
}
// The fork starts resolving candidates five percentage points before the threshold.
export function postPlayPrefetch(settings, { type, position, duration } = {}) {
  const prefs = readPlayback(settings);
  if (!prefs.postPlayRecommendations || type !== 'movie') return false;
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return false;
  const lead = Math.max(0, prefs.postPlayMovieThreshold - postPlayPrefetchLead);
  return position / duration >= lead / 100;
}
export function boundedRecommendations(list) {
  return (Array.isArray(list) ? list : []).slice(0, postPlayMax);
}
// The recommendation carousel wraps around, like the fork's previous/next controls.
export function stepRecommendation(index, offset, length) {
  if (!Number.isInteger(length) || length <= 0) return -1;
  const current = Number.isInteger(index) ? index : 0;
  return ((current + offset) % length + length) % length;
}