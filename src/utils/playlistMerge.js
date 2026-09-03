// What the track list should show while an import or a tag scan is still
// running.
//
// Showing a track and saving the library used to be the same act: the only way
// to put one on screen was to update the library, which rewrites the whole
// folder and pushes a sync. So an import committed once, at the very end —
// right for the saving, wrong for the looking. Nothing was visible or playable
// until the last file was copied, though the first was ready in a second. Tags
// had the same shape, appearing only every fiftieth track.
//
// The commits are unchanged. This is what lets the list run ahead of them.

/**
 * The committed library, with work that has not been saved yet folded in.
 *
 * Merged by id rather than appended, because the overlay and the library
 * overlap the moment a commit lands: everything just saved is in both. Anything
 * else would show duplicates for as long as it took to clear the overlay, and
 * would make that clearing something correctness depended on.
 */
export function tracksWithPendingWork(committed = [], added = [], scanned = null) {
  const base = Array.isArray(committed) ? committed : [];

  const withScanned = scanned && scanned.size
    ? base.map(track => (track && scanned.get(track.id)) || track)
    : base;

  const extras = Array.isArray(added) ? added : [];
  if (!extras.length) return withScanned;

  const known = new Set(withScanned.map(track => track && track.id));

  // A scan only ever revises a track that is already committed, so it is not
  // applied to the extras — they have not been scanned yet by definition.
  return [...withScanned, ...extras.filter(track => track && !known.has(track.id))];
}
