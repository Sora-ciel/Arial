// Undo history for written text, kept per block and outside the editors.
//
// The editors are destroyed and rebuilt more often than it looks: moving a
// block on the canvas remounts it, and every mode switch tears the whole tree
// down. An editor's own history goes with it, so after either of those Ctrl+Z
// did nothing at all — the text looked the same but its past was gone.
//
// Holding the history here instead means it belongs to the block rather than
// to whichever editor happens to be showing it, so writing stays undoable
// after a move, after switching modes and back, and for as long as the app is
// open.
//
// This is deliberately the *only* history for text. The workspace has its own,
// for adding, moving and deleting blocks; letting both answer the same
// keystroke is what previously made one Ctrl+Z undo two different things and
// cost a page of writing.

const histories = new Map();

// Typing is recorded in bursts rather than per keystroke: a pause this long
// closes the current step, so undo walks back through phrases instead of
// letters.
const COALESCE_MS = 600;

// Enough to step back through a long session without holding a whole
// document's history for every block that has ever been open.
const MAX_STEPS = 200;

function historyFor(key) {
  let entry = histories.get(key);
  if (!entry) {
    entry = { past: [], future: [], current: null, lastRecordedAt: 0 };
    histories.set(key, entry);
  }
  return entry;
}

/**
 * Seeds a block's history the first time its editor mounts. Does nothing if
 * the block already has a past, which is what makes a remount pick up where
 * the previous editor left off.
 */
export function initTextHistory(key, content) {
  if (!key) return;
  const entry = historyFor(key);
  if (entry.current === null) entry.current = content ?? '';
}

/** Records a new state, coalescing a burst of typing into one step. */
export function recordText(key, content) {
  if (!key) return;
  const entry = historyFor(key);
  if (content === entry.current) return;

  const now = Date.now();
  const continuesBurst = now - entry.lastRecordedAt < COALESCE_MS;

  // Only the state *before* an edit is worth keeping, and only once per burst:
  // pushing every intermediate value would make undo crawl letter by letter.
  if (!continuesBurst && entry.current !== null) {
    entry.past.push(entry.current);
    if (entry.past.length > MAX_STEPS) entry.past.shift();
  }

  entry.current = content;
  entry.lastRecordedAt = now;
  // A fresh edit is a new branch, so anything undone past this point is gone.
  entry.future = [];
}

/** Steps back. Returns the content to show, or null when there is no past. */
export function undoText(key) {
  const entry = histories.get(key);
  if (!entry || !entry.past.length) return null;
  const previous = entry.past.pop();
  entry.future.push(entry.current);
  entry.current = previous;
  // Closes the current burst so the next keystroke starts a new step.
  entry.lastRecordedAt = 0;
  return previous;
}

/** Steps forward again. Returns the content to show, or null. */
export function redoText(key) {
  const entry = histories.get(key);
  if (!entry || !entry.future.length) return null;
  const next = entry.future.pop();
  entry.past.push(entry.current);
  entry.current = next;
  entry.lastRecordedAt = 0;
  return next;
}

export function canUndoText(key) {
  return Boolean(histories.get(key)?.past.length);
}

export function canRedoText(key) {
  return Boolean(histories.get(key)?.future.length);
}

/**
 * Keeps the recorded state in step when content changes from somewhere other
 * than typing — a cloud download, or the workspace undo restoring a snapshot.
 * Without this the next Ctrl+Z would jump back to a version the block no
 * longer has.
 */
export function syncTextHistory(key, content) {
  if (!key) return;
  const entry = historyFor(key);
  if (entry.current === content) return;
  if (entry.current !== null) {
    entry.past.push(entry.current);
    if (entry.past.length > MAX_STEPS) entry.past.shift();
  }
  entry.current = content;
  entry.future = [];
  entry.lastRecordedAt = 0;
}

/** Drops a block's history once the block itself is gone. */
export function forgetTextHistory(key) {
  histories.delete(key);
}
