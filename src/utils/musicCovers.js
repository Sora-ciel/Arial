import { loadMusicCover, loadMusicTrack, saveMusicCover } from '../storage.js';
import { readAudioTags } from './audioTags.js';

// Returns a track's cover art, recovering it from the audio file when it isn't
// in the cover store yet.
//
// Tracks added before artwork was being extracted have no stored cover, and so
// would show the placeholder note forever even though the picture is sitting
// right there in the file. This reads it back out once and keeps it, so the
// next lookup is a plain store hit.
//
// Lives here rather than in Playlist mode because the player needs it too —
// when it only existed in the mode, playing a track never recovered its art.

// Tracks whose file we've already searched and found nothing in, so a track
// that genuinely has no embedded picture isn't parsed again.
//
// Persisted, not just held in memory: a library of files without artwork was
// being re-parsed from scratch on every single refresh, which is slow and
// achieves nothing. Device-local on purpose — it's a fact about the file on
// this machine, not something worth syncing.
const COVERLESS_KEY = 'musicCoverless';

function loadCoverless() {
  try {
    const raw = localStorage.getItem(COVERLESS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

const knownCoverless = typeof localStorage === 'undefined' ? new Set() : loadCoverless();

function persistCoverless() {
  try {
    localStorage.setItem(COVERLESS_KEY, JSON.stringify([...knownCoverless]));
  } catch { /* ignore */ }
}

/**
 * A track's cover.
 *
 * `deepScan` decides whether a miss is allowed to open the audio file and hunt
 * for artwork inside it. That costs a full read and parse — on the order of
 * 100ms for a normal music file — which is fine for one track but catastrophic
 * across a library: 1500 of them is several minutes of solid work. So browsing
 * asks for the cheap store lookup only, and the deep read is reserved for the
 * track being played and the explicit re-read.
 */
export async function ensureMusicCover(trackId, { deepScan = true } = {}) {
  if (!trackId) return null;

  const stored = await loadMusicCover(trackId);
  if (stored) return stored;
  if (!deepScan || knownCoverless.has(trackId)) return null;

  try {
    const audio = await loadMusicTrack(trackId);
    if (!audio) return null; // not on this device — nothing to read
    const { cover, parsed } = await readAudioTags(audio);
    if (!cover) {
      // Only remember it as coverless when the file was actually read. A parse
      // that failed says nothing about whether artwork is in there, and
      // caching that would make one bad read permanent for the session.
      if (parsed) {
        knownCoverless.add(trackId);
        persistCoverless();
      }
      return null;
    }
    await saveMusicCover(trackId, cover);
    return cover;
  } catch (error) {
    console.warn('Could not recover artwork for a track:', error);
    return null;
  }
}

// Called when a track's audio is replaced or re-imported, so a file that now
// has artwork isn't skipped because an earlier copy didn't.
export function forgetCoverlessTrack(trackId) {
  if (!knownCoverless.delete(trackId)) return;
  persistCoverless();
}
