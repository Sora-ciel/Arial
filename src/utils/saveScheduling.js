// When a typing save should actually be written.
//
// The old rule was a 300ms throttle wearing a debounce's name: the first
// keystroke armed a timer and every keystroke after it returned early without
// restarting one, so continuous typing wrote the entire note to disk every
// 300ms for as long as it went on. A sync log of someone writing a paragraph
// is hundreds of full-folder saves, each one restamping modifiedAt and each one
// counted against the daily bandwidth ceiling.
//
// What is wanted instead is a save shortly after someone stops, and a
// guarantee that a long unbroken burst still gets written now and then.

// Long enough that a normal pause between words does not trigger a write, short
// enough that stopping to think feels like it saved instantly.
export const SAVE_QUIET_MS = 1000;

// The ceiling on how long typing can hold a save off. Without it, someone who
// types without pausing for two minutes has two minutes of work held in memory
// and nothing on disk — the debounce would keep politely deferring to the next
// keystroke. This is the answer to "how much could a crash cost", and it is why
// the deadline is measured from the first queued change and never moves.
export const SAVE_MAX_WAIT_MS = 5000;

/**
 * Milliseconds to wait before writing, given when this burst of changes began.
 *
 * Each keystroke pushes the quiet window forward, but never past the deadline
 * the first change set. Returns 0 when the deadline has already passed, which
 * means write now.
 */
export function nextSaveDelay({
  now,
  firstQueuedAt,
  quietMs = SAVE_QUIET_MS,
  maxWaitMs = SAVE_MAX_WAIT_MS
}) {
  // No burst recorded yet: treat this change as the start of one.
  const startedAt = Number(firstQueuedAt) || now;

  const quietTarget = now + quietMs;
  const deadline = startedAt + maxWaitMs;

  return Math.max(0, Math.min(quietTarget, deadline) - now);
}
