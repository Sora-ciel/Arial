// A record of what sync decided, and why.
//
// Two instances open on one account have twice been caught handing a folder
// back and forth with nobody editing, and both times the cause had to be
// guessed at from the outside, because the only way to watch it happen was to
// have the app running signed in on two machines — where there is no console to
// read and nothing keeps a history.
//
// So the decisions write themselves down here instead. The question that
// matters is never "did it save?" but "what did it think had changed?", and
// that is what describeDifference answers: the exact field, and both values.
// One line of that ends an argument the last two rounds of guessing could not.
//
// Nothing here touches the network or the DOM. It is a ring buffer and a diff,
// both plain functions, so test/sync-log.test.js runs the real thing.

// Enough to cover several minutes of ticks — long enough to catch a loop in the
// act — without holding a session's whole history in memory.
const MAX_ENTRIES = 300;

// Values are printed into the log, and a note can carry megabytes of base64, so
// anything long is cut down before it is kept.
const MAX_VALUE_CHARS = 80;

let entries = [];
let listeners = new Set();

function notify() {
  for (const listener of listeners) {
    try { listener(entries); } catch { /* a bad listener must not break logging */ }
  }
}

/**
 * Writes one line. `kind` is a short tag ('save', 'skip', 'upload', 'download',
 * 'remount', 'error'); `detail` is anything worth keeping alongside it.
 */
export function logSync(kind, folder, message, detail = null) {
  entries = [
    ...entries.slice(-(MAX_ENTRIES - 1)),
    { at: Date.now(), kind, folder: folder ?? '', message, detail }
  ];
  notify();
}

export function getSyncLog() {
  return entries;
}

export function clearSyncLog() {
  entries = [];
  notify();
}

export function subscribeSyncLog(listener) {
  listeners.add(listener);
  // Guarded like every other call into a listener. Logging exists to survive a
  // situation that is already going wrong, so it must never be the thing that
  // throws — least of all at subscription, before anything has been recorded.
  try { listener(entries); } catch { /* a bad listener must not break logging */ }
  return () => listeners.delete(listener);
}

function shorten(value) {
  if (typeof value === 'string') {
    return value.length > MAX_VALUE_CHARS
      ? `${value.slice(0, MAX_VALUE_CHARS)}… (${value.length} chars)`
      : value;
  }
  if (value === undefined) return '(absent)';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return `{${Object.keys(value).join(', ')}}`;
  return String(value);
}

/**
 * Where two versions of a folder differ, as a list of field paths with both
 * values — `blocks.0.tasks: (absent) -> [0 items]` and the like.
 *
 * Stops at `limit` findings: when something is looping, the first one or two
 * name the culprit, and walking a whole note's worth of differences would bury
 * it. Order is stable so the same difference reads the same way each tick.
 */
export function describeDifference(before, after, limit = 5) {
  const found = [];

  function walk(a, b, path) {
    if (found.length >= limit) return;
    if (a === b) return;

    const aIsObject = a !== null && typeof a === 'object';
    const bIsObject = b !== null && typeof b === 'object';

    if (!aIsObject || !bIsObject || Array.isArray(a) !== Array.isArray(b)) {
      found.push({ path: path || '(root)', before: shorten(a), after: shorten(b) });
      return;
    }

    if (Array.isArray(a)) {
      if (a.length !== b.length) {
        found.push({ path: `${path}.length`, before: a.length, after: b.length });
        return;
      }
      for (let i = 0; i < a.length && found.length < limit; i += 1) {
        walk(a[i], b[i], `${path}.${i}`);
      }
      return;
    }

    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      if (found.length >= limit) return;
      walk(a[key], b[key], path ? `${path}.${key}` : key);
    }
  }

  walk(before, after, '');
  return found;
}

/** The log as text, for copying somewhere it can be read or sent. */
export function formatSyncLog(list = entries) {
  if (!list.length) return 'Nothing logged yet.';
  return list
    .map(entry => {
      const time = new Date(entry.at).toISOString().slice(11, 23);
      const folder = entry.folder ? ` [${entry.folder}]` : '';
      const detail = entry.detail ? `\n    ${formatDetail(entry.detail)}` : '';
      return `${time} ${entry.kind.padEnd(8)}${folder} ${entry.message}${detail}`;
    })
    .join('\n');
}

function formatDetail(detail) {
  if (Array.isArray(detail)) {
    return detail
      .map(item =>
        item && typeof item === 'object' && 'path' in item
          ? `${item.path}: ${item.before} -> ${item.after}`
          : String(item)
      )
      .join('\n    ');
  }
  if (detail && typeof detail === 'object') {
    return Object.entries(detail).map(([k, v]) => `${k}: ${shorten(v)}`).join(', ');
  }
  return String(detail);
}
