// SPDX-License-Identifier: GPL-3.0-only
import { mediaTracks, selectTextTrack } from './media-tracks.js';
import { plainCue } from './subtitles.js';

// A hidden TextTrack still produces activeCues/cuechange, without native painting.
// Do not hide opaque/bitmap tracks, or a platform that rejects hidden mode.
export function nativeSubtitles(video, changed) {
  let track = null, custom = false, blocked = false, fontReady = false;
  function detach() { track?.removeEventListener?.('cuechange', changed); track = null; custom = blocked = false; }
  function selected() {
    const rows = mediaTracks(video,'text');
    if (track && (!rows.some(r=>r.track===track) || track.mode === 'disabled')) detach();
    // The platform may enable a default track before our language policy runs.
    if (!track) { track = rows.find(r=>r.selected)?.track || null; track?.addEventListener?.('cuechange', changed); }
    return track;
  }
  function fallback() {
    if (custom && track?.mode === 'hidden') {
      try { track.mode = 'showing'; } catch {}
    }
    custom = false;
    return '';
  }
  return {
    select(next = null) {
      // Selection is transactional: a rejected switch preserves the old renderer.
      selectTextTrack(video,next);
      detach(); track = next;
      track?.addEventListener?.('cuechange', changed);
    },
    selected,
    setFontReady(value) { fontReady = value; },
    get custom() { return custom; },
    text() {
      if (!selected() || !fontReady || blocked) return fallback();
      try {
        const active = track.activeCues;
        if (!active || active.length > 8) return fallback();
        if (!active.length) return '';
        const texts = [];
        for (let i=0; i<active.length; i++) {
          if (typeof active[i]?.text !== 'string') return fallback();
          texts.push(plainCue(active[i].text));
        }
        try { if (track.mode !== 'hidden') track.mode = 'hidden'; }
        catch { blocked = true; return fallback(); }
        if (track.mode !== 'hidden') { blocked = true; return fallback(); }
        custom = true;
        return texts.join('\n');
      } catch { return fallback(); }
    },
    dispose() { fallback(); detach(); },
  };
}
