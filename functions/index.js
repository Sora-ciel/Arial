const { onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onObjectFinalized, onObjectDeleted } = require('firebase-functions/v2/storage');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { LATEST_SCHEMA_VERSION, MIN_SUPPORTED_SCHEMA_VERSION, migrateFilePayload } = require('./migrations');
const { DAILY_BYTE_LIMIT } = require('./limits');
const { SYNC_NAMESPACE } = require('./syncNamespace');
const { recordStorageDelta, reconcileStorageUsage } = require('./storageAccounting');
const { recordActivity, rollUpStats } = require('./activityTracking');

initializeApp();

// Ceiling on concurrent instances. Without one, a burst of saves — whether a
// genuine crowd or someone hammering the endpoint — scales this function out
// without limit, and the bill with it. The quota guard fires on every index
// write, so it is the one most exposed to that; 10 is comfortably above normal
// load while keeping a runaway bounded. Raise it once real usage justifies it.
const MAX_INSTANCES = 10;
// The scheduled jobs run once a day and never need more than one.
const SCHEDULED_MAX_INSTANCES = 1;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

function byteSizeOf(value) {
  if (value === null || value === undefined) return 0;
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

// Tallies bytes written per user per day and flips `blocked` once a user
// crosses DAILY_BYTE_LIMIT. Enforcement itself lives in database.rules.json,
// which denies writes while `blocked` is true — this function only decides
// when to set/clear that flag.
//
// Triggers on index/{fileId} (always tiny, fixed-shape) rather than
// files/{fileId} (the full note, rewritten whole on every edit) — a trigger
// on files/{fileId} previously broke live saving with TRIGGER_PAYLOAD_TOO_LARGE
// once a note grew past RTDB's payload ceiling for watched paths. The real
// byte count still comes from files/{fileId}, just via a plain Admin SDK read
// inside the handler, which isn't subject to that same trigger-delivery limit.
exports.enforceSyncQuota = onValueWritten(
  {
    ref: 'sync/{ns}/users/{uid}/index/{fileId}',
    region: 'us-central1',
    maxInstances: MAX_INSTANCES
  },
  async event => {
    const { ns, uid, fileId } = event.params;
    logger.info('enforceSyncQuota-start', { ns, uid, fileId, afterExists: event.data.after.exists() });
    if (!event.data.after.exists()) return; // file deleted, nothing to charge

    // Stamped here rather than from its own trigger: this one already fires on
    // every sync write, and a save is the definition of active worth having.
    // Coarsened to once an hour inside, so typing does not multiply writes.
    // Deliberately not awaited alongside the quota work below — a failure to
    // record a statistic must never interfere with enforcing a limit.
    recordActivity(uid).catch(error =>
      logger.warn('activity-stamp-failed', { uid, message: error.message })
    );

    const db = getDatabase();
    const fileSnap = await db.ref(`sync/${ns}/users/${uid}/files/${fileId}`).get();
    const writtenBytes = byteSizeOf(fileSnap.exists() ? fileSnap.val() : null);
    logger.info('enforceSyncQuota-read', { fileExists: fileSnap.exists(), writtenBytes });
    if (writtenBytes === 0) return;

    await chargeBandwidth(db, ns, uid, writtenBytes);
  }
);

// Charges bytes against today's tally and blocks the account if that puts it
// over. Shared, because every path a client can write through has to be
// metered by the same counter — an unmetered one is not a smaller hole than
// no counter at all, it is the same hole with fewer people looking at it.
async function chargeBandwidth(db, ns, uid, writtenBytes) {
  if (!writtenBytes || writtenBytes <= 0) return;

  const usageResult = await db
    .ref(`usage/${uid}/${todayKey()}`)
    .transaction(current => (current || 0) + writtenBytes);
  const totalToday = usageResult.snapshot.val() || 0;
  logger.info('bandwidth-charged', { uid, writtenBytes, totalToday, limit: DAILY_BYTE_LIMIT });

  if (totalToday <= DAILY_BYTE_LIMIT) return;

  const blockedRef = db.ref(`sync/${ns}/users/${uid}/blocked`);
  const wasAlreadyBlocked = (await blockedRef.get()).val() === true;
  if (wasAlreadyBlocked) return;

  await blockedRef.set(true);
  logger.error('sync-quota-exceeded', {
    uid,
    ns,
    totalBytesToday: totalToday,
    limit: DAILY_BYTE_LIMIT
  });
}

// Themes are the second thing a client may write, so they are metered too.
//
// This one triggers directly on the node rather than on a small companion the
// way enforceSyncQuota does, and that is safe here for the reason it was not
// there: a theme is a name and a few dozen colour strings, capped field by
// field in database.rules.json, so it cannot approach the payload ceiling that
// a full note blew past.
exports.meterThemeWrite = onValueWritten(
  {
    ref: 'sync/{ns}/users/{uid}/themes/{themeId}',
    region: 'us-central1',
    maxInstances: MAX_INSTANCES
  },
  async event => {
    const { ns, uid } = event.params;
    if (!event.data.after.exists()) return; // deleted, nothing to charge

    recordActivity(uid).catch(error =>
      logger.warn('activity-stamp-failed', { uid, message: error.message })
    );

    await chargeBandwidth(getDatabase(), ns, uid, byteSizeOf(event.data.after.val()));
  }
);

// Daily counters are naturally scoped by date key, so nothing needs to
// actively "reset" usage - a new day just starts a fresh counter. But the
// quota function only ever sets `blocked`, never clears it, so this sweeps
// stale blocks once a day.
exports.resetDailyBlocks = onSchedule(
  {
    schedule: 'every day 00:05',
    region: 'us-central1',
    maxInstances: SCHEDULED_MAX_INSTANCES
  },
  async () => {
    const db = getDatabase();
    const usersSnap = await db.ref(`sync/${SYNC_NAMESPACE}/users`).get();
    if (!usersSnap.exists()) return;

    const updates = {};
    usersSnap.forEach(userSnap => {
      if (userSnap.child('blocked').val() === true) {
        updates[`sync/${SYNC_NAMESPACE}/users/${userSnap.key}/blocked`] = null;
      }
    });

    const unblockedCount = Object.keys(updates).length;
    if (unblockedCount === 0) return;

    await db.ref().update(updates);
    logger.info('sync-quota-reset', { unblockedCount });
  }
);

// --- Stored bytes ------------------------------------------------------
//
// enforceSyncQuota above counts what a note weighs in the database, which
// stopped being most of the data the day attachments moved to Cloud Storage: a
// 40 MB upload writes a few hundred bytes of ref into RTDB and the rest is
// invisible to a database trigger. These keep a running balance per account
// instead — up on upload, down on delete, never reset, which is why it lives
// in its own node and resetDailyBlocks must not touch it.
//
// An overwrite fires both triggers: the replaced generation is deleted and the
// new one finalized, so the arithmetic balances without special-casing.
//
// The work itself is in storageAccounting.js, so it can be tested without a
// functions runtime. Everything here is wiring.

exports.trackStorageUpload = onObjectFinalized(
  { region: 'us-central1', maxInstances: MAX_INSTANCES },
  async event => {
    await recordStorageDelta(event.data.name, Number(event.data.size) || 0);
  }
);

exports.trackStorageDelete = onObjectDeleted(
  { region: 'us-central1', maxInstances: MAX_INSTANCES },
  async event => {
    await recordStorageDelta(event.data.name, -(Number(event.data.size) || 0));
  }
);

// Weekly rather than nightly: a full bucket listing is the most expensive
// thing here, drift accumulates slowly, and every upload and delete in between
// is already keeping the balance current on its own.
//
// To run it now — the initial backfill, or after suspecting drift — use Force
// run on its Cloud Scheduler job in the Google Cloud console. It is safe to
// run at any time and safe to run twice; it computes an absolute total rather
// than applying a change.
exports.reconcileStorageUsage = onSchedule(
  {
    schedule: 'every sunday 03:00',
    region: 'us-central1',
    maxInstances: SCHEDULED_MAX_INSTANCES,
    timeoutSeconds: 540,
    memory: '512MiB'
  },
  async () => {
    await reconcileStorageUsage();
  }
);

// One row a day of how many accounts there are, how many came back, and what
// they are keeping. Runs late enough that the day it summarises is over in
// UTC, and after resetDailyBlocks so a swept block is not counted as a live
// one.
//
// The numbers are cheap to recompute; the history is not. Nothing can
// reconstruct what a month looked like after the fact, which is why this is
// worth running from the day there is nothing to see.
exports.rollUpStats = onSchedule(
  {
    schedule: 'every day 00:15',
    region: 'us-central1',
    maxInstances: SCHEDULED_MAX_INSTANCES
  },
  async () => {
    await rollUpStats();
  }
);

// DISABLED 2026-08-08: same TRIGGER_PAYLOAD_TOO_LARGE issue as enforceSyncQuota
// above (also watched files/{fileId}). See that comment for details. If
// revived, avoid triggering directly on files/{fileId}.
//
// exports.normalizeSyncedFileSchema = onValueWritten(
//   { ref: 'sync/{ns}/users/{uid}/files/{fileId}', region: 'us-central1' },
//   async event => {
//     if (!event.data.after.exists()) return; // deleted
//
//     const after = event.data.after.val();
//     const currentVersion = Number(after.schemaVersion || 0);
//     if (currentVersion >= LATEST_SCHEMA_VERSION) return;
//
//     const migrated = migrateFilePayload(after, currentVersion);
//     await event.data.after.ref.set({ ...migrated, schemaVersion: LATEST_SCHEMA_VERSION });
//   }
// );

// Bandwidth monitoring. Kept in its own folder with its own config, its own
// mailer and its own thresholds: it only reads what the quota guard above
// writes, so removing these three lines disables every alert without touching
// enforcement.
const monitoring = require('./monitoring');
exports.bandwidthWatch = monitoring.bandwidthWatch;
exports.projectBandwidthWatch = monitoring.projectBandwidthWatch;
exports.bandwidthDigest = monitoring.bandwidthDigest;
exports.sendMonitoringTestMail = monitoring.sendMonitoringTestMail;

// Keeps sync/{ns}/meta/schemaVersion in sync with the constants above so
// clients (checkSyncCompatibility in firebaseClient.js) always read a
// current value, even if that node is ever manually cleared.
exports.publishSchemaVersionMeta = onSchedule(
  {
    schedule: 'every day 00:00',
    region: 'us-central1',
    maxInstances: SCHEDULED_MAX_INSTANCES
  },
  async () => {
    const db = getDatabase();
    await db.ref(`sync/${SYNC_NAMESPACE}/meta/schemaVersion`).set({
      latest: LATEST_SCHEMA_VERSION,
      minSupported: MIN_SUPPORTED_SCHEMA_VERSION
    });
  }
);
