// The database side of knowing how many people use Ostava and how much they
// keep in it. The arithmetic is in activity.js; this is what reads and writes.
//
// Everything here lives in top-level nodes rather than under
// sync/{ns}/users/{uid}, and that is not tidiness. The daily roll-up has to
// read every account's record at once, and a read of sync/{ns}/users pulls
// down every note every user owns along with it — the metadata is a leaf on
// the same branch as the entire file store. `usage/` was split out for the
// same reason, and `storage/` after it.

const { logger } = require('firebase-functions');
const { getDatabase } = require('firebase-admin/database');
const { STORAGE_BYTE_LIMITS } = require('./limits');
const { summariseAccounts, shouldStampActivity, stampedActivity } = require('./activity');

function todayKey(now) {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

// Called from enforceSyncQuota, which already fires on every sync write — no
// second trigger, and nothing new on the client. It means "active" is defined
// as "saved something", which is the definition worth having: a person who
// opened the app and did nothing is not who a subscription is sold to.
async function recordActivity(uid, now = Date.now()) {
  if (!uid) return;

  const result = await getDatabase()
    .ref(`activity/${uid}`)
    .transaction(current => {
      if (!shouldStampActivity(current, now)) return undefined; // abort, still fresh
      return stampedActivity(current, now);
    });

  return result.committed;
}

// One row a day, kept for ever. The numbers themselves are cheap to recompute,
// but the history is not: a retention curve can only be read backwards, and
// nothing can reconstruct what last month looked like after the fact. That is
// the whole reason this runs now rather than once there is traffic worth
// measuring.
async function rollUpStats(now = Date.now()) {
  const db = getDatabase();

  const [activitySnap, storageSnap] = await Promise.all([
    db.ref('activity').get(),
    db.ref('storage').get()
  ]);

  const summary = summariseAccounts({
    activity: activitySnap.val() || {},
    storage: storageSnap.val() || {},
    now,
    freeLimit: STORAGE_BYTE_LIMITS.free
  });

  const date = todayKey(now);
  await db.ref(`monitoring/stats/${date}`).set({ ...summary, recordedAt: now });

  // Also kept unkeyed so the dashboard has something to read without knowing
  // today's date, and so a quiet day still shows the latest figures.
  await db.ref('monitoring/stats/latest').set({ ...summary, date, recordedAt: now });

  logger.info('stats-rolled-up', { date, ...summary });

  return summary;
}

module.exports = { recordActivity, rollUpStats, todayKey };
