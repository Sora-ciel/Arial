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

// How typing is grouped into undo steps.
//
// A rolling pause alone is not enough: while someone keeps typing the window
// keeps being pushed back, so an unbroken paragraph collapses into a single
// step and one Ctrl+Z erases the lot. Editors people are used to step back by
// roughly a word, so a step is closed by whichever of these comes first.
const COALESCE_MS = 400;        // a pause in typing
const MAX_STEP_CHARS = 24;      // an uninterrupted run this long
const WORD_END = /[\s.,;:!?)\]}"'’”]$/; // finishing a word or clause

// Tags carry no meaning for step size — only the words the person typed do.
function plainLength(html) {
  return String(html ?? '').replace(/<[^>]*>/g, '').length;
}

// Enough to step back through a long session without holding a whole
// document's history for every block that has ever been open.
const MAX_STEPS = 200;

function historyFor(key) {
  let entry = histories.get(key);
  if (!entry) {
    entry = {
      past: [],
      future: [],
      current: null,
      // Where the caret sat in the current state, so undo can put it back
      // instead of dropping it at the end of the block.
      currentCaret: null,
      lastRecordedAt: 0,
      // Length at the start of the current step, so its size can be measured.
      stepStartLength: 0,
      // Switching between typing and deleting starts a new step.
      lastDirection: null
    };
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

function pushPast(entry) {
  entry.past.push({ content: entry.current, caret: entry.currentCaret });
  if (entry.past.length > MAX_STEPS) entry.past.shift();
}

/** Records a new state, coalescing a burst of typing into one step. */
export function recordText(key, content, caret = null) {
  if (!key) return;
  const entry = historyFor(key);
  if (content === entry.current) return;

  const now = Date.now();
  const length = plainLength(content);
  const previousLength = plainLength(entry.current);
  const direction = length >= previousLength ? 'insert' : 'delete';

  const startsNewStep =
    entry.current !== null &&
    (now - entry.lastRecordedAt >= COALESCE_MS ||
      // Deleting after typing, or typing after deleting, is a change of intent.
      (entry.lastDirection !== null && direction !== entry.lastDirection) ||
      Math.abs(length - entry.stepStartLength) >= MAX_STEP_CHARS);

  // Only the state *before* a step is kept: recording every intermediate value
  // would make undo crawl back letter by letter.
  if (startsNewStep) {
    pushPast(entry);
    entry.stepStartLength = previousLength;
  } else if (entry.current === null) {
    entry.stepStartLength = length;
  }

  entry.current = content;
  entry.currentCaret = caret;
  entry.lastDirection = direction;
  entry.lastRecordedAt = now;
  // Reaching the end of a word closes the step, so the next character begins a
  // new one. This is what keeps undo at roughly word granularity while typing
  // continuously, rather than swallowing whole paragraphs.
  if (direction === 'insert' && WORD_END.test(String(content ?? '').replace(/<[^>]*>/g, ''))) {
    entry.lastRecordedAt = 0;
  }
  // A fresh edit is a new branch, so anything undone past this point is gone.
  entry.future = [];
}

/** Steps back. Returns the content to show, or null when there is no past. */
export function undoText(key) {
  const entry = histories.get(key);
  if (!entry || !entry.past.length) return null;
  const previous = entry.past.pop();
  entry.future.push({ content: entry.current, caret: entry.currentCaret });
  entry.current = previous.content;
  entry.currentCaret = previous.caret;
  // Closes the current step so the next keystroke starts a new one.
  entry.lastRecordedAt = 0;
  entry.lastDirection = null;
  entry.stepStartLength = plainLength(previous.content);
  return previous;
}

/** Steps forward again. Returns the content to show, or null. */
export function redoText(key) {
  const entry = histories.get(key);
  if (!entry || !entry.future.length) return null;
  const next = entry.future.pop();
  pushPast(entry);
  entry.current = next.content;
  entry.currentCaret = next.caret;
  entry.lastRecordedAt = 0;
  entry.lastDirection = null;
  entry.stepStartLength = plainLength(next.content);
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
  if (entry.current !== null) pushPast(entry);
  entry.current = content;
  entry.currentCaret = null;
  entry.future = [];
  entry.lastRecordedAt = 0;
  entry.lastDirection = null;
  entry.stepStartLength = plainLength(content);
}

/** Drops a block's history once the block itself is gone. */
export function forgetTextHistory(key) {
  histories.delete(key);
}
