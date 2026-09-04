// Turning raw per-account records into the handful of numbers that actually
// decide a price. Pure: no database, no clock, no network — the caller passes
// everything in, so Node can run all of it in the fast suite.
//
// What these answer, and why each one is here rather than being a number that
// looks impressive:
//
//   accounts / active7d   how many people there are and how many come back.
//                         Conversion is a fraction of the ones who come back,
//                         never of the ones who signed up once.
//   storedBytesMedian     where the free tier goes. Set it below the median
//                         and ordinary use hits a wall; set it above the p90
//                         and nobody ever reaches it, which is the same as
//                         having no paid tier at all.
//   overFreeLimit         how many accounts a given ceiling would actually
//                         convert, as opposed to how many it annoys.

const DAY_MS = 24 * 60 * 60 * 1000;

// Nearest-rank, so the answer is always a value someone really has rather than
// an interpolation between two accounts. With a handful of users that matters:
// an average is dragged around by one person with a big music folder, and the
// question being asked is "what does a normal account hold".
function percentile(sortedValues, fraction) {
  if (!sortedValues.length) return 0;

  const rank = Math.ceil(fraction * sortedValues.length);
  const index = Math.min(Math.max(rank - 1, 0), sortedValues.length - 1);

  return sortedValues[index];
}

function activeSince(activity, cutoff) {
  return Object.values(activity || {}).filter(
    row => Number((row && row.lastSeenAt) || 0) >= cutoff
  ).length;
}

function summariseAccounts({ activity = {}, storage = {}, now, freeLimit }) {
  const uids = Object.keys(activity);

  // Only accounts that hold something. Counting the empty ones would drag the
  // median toward zero and make the free tier look roomier than it is.
  const storedBytes = Object.values(storage)
    .map(row => Number((row && row.bytes) || 0))
    .filter(bytes => bytes > 0)
    .sort((a, b) => a - b);

  return {
    accounts: uids.length,
    // Guarded the same way activeSince is: a half-written record, or a key
    // whose value went missing, must not take the whole roll-up down with it.
    // These numbers are never worth failing a scheduled job over.
    newToday: uids.filter(uid => {
      const row = activity[uid];
      return Number((row && row.firstSeenAt) || 0) >= now - DAY_MS;
    }).length,

    activeToday: activeSince(activity, now - DAY_MS),
    active7d: activeSince(activity, now - 7 * DAY_MS),
    active30d: activeSince(activity, now - 30 * DAY_MS),

    accountsWithStorage: storedBytes.length,
    storedBytesTotal: storedBytes.reduce((sum, bytes) => sum + bytes, 0),
    storedBytesMedian: percentile(storedBytes, 0.5),
    storedBytesP90: percentile(storedBytes, 0.9),
    storedBytesMax: storedBytes.length ? storedBytes[storedBytes.length - 1] : 0,

    // The one that answers "would this ceiling earn anything".
    overFreeLimit: storedBytes.filter(bytes => bytes > freeLimit).length
  };
}

// How often an account's stamp is allowed to be rewritten.
//
// enforceSyncQuota fires on every save, and a save happens every few seconds
// while someone is typing. Stamping each one would multiply the write cost of
// editing a note for a number that is only ever read a day later, so the stamp
// is coarsened to once an hour. Nothing downstream asks a finer question than
// "was this account active today".
const ACTIVITY_STAMP_INTERVAL_MS = 60 * 60 * 1000;

function shouldStampActivity(current, now, intervalMs = ACTIVITY_STAMP_INTERVAL_MS) {
  return now - Number((current && current.lastSeenAt) || 0) >= intervalMs;
}

// firstSeenAt is set once and never moved: it is the only thing that can say
// how long an account has been around, which is what separates "nobody comes
// back" from "nobody has arrived yet".
function stampedActivity(current, now) {
  return {
    firstSeenAt: Number((current && current.firstSeenAt) || 0) || now,
    lastSeenAt: now
  };
}

module.exports = {
  percentile,
  summariseAccounts,
  shouldStampActivity,
  stampedActivity,
  ACTIVITY_STAMP_INTERVAL_MS,
  DAY_MS
};
