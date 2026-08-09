const { onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { LATEST_SCHEMA_VERSION, MIN_SUPPORTED_SCHEMA_VERSION, migrateFilePayload } = require('./migrations');

initializeApp();

// Must match firebaseSyncNamespace in firebase.ts.
const SYNC_NAMESPACE = 'default';
const DAILY_BYTE_LIMIT = 250 * 1024 * 1024; // tune after watching real usage for a bit

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
  { ref: 'sync/{ns}/users/{uid}/index/{fileId}', region: 'us-central1' },
  async event => {
    const { ns, uid, fileId } = event.params;
    logger.info('enforceSyncQuota-start', { ns, uid, fileId, afterExists: event.data.after.exists() });
    if (!event.data.after.exists()) return; // file deleted, nothing to charge

    const db = getDatabase();
    const fileSnap = await db.ref(`sync/${ns}/users/${uid}/files/${fileId}`).get();
    const writtenBytes = byteSizeOf(fileSnap.exists() ? fileSnap.val() : null);
    logger.info('enforceSyncQuota-read', { fileExists: fileSnap.exists(), writtenBytes });
    if (writtenBytes === 0) return;

    const usageRef = db.ref(`usage/${uid}/${todayKey()}`);
    const usageResult = await usageRef.transaction(current => (current || 0) + writtenBytes);
    const totalToday = usageResult.snapshot.val() || 0;
    logger.info('enforceSyncQuota-tallied', { totalToday, limit: DAILY_BYTE_LIMIT });

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
);

// Daily counters are naturally scoped by date key, so nothing needs to
// actively "reset" usage - a new day just starts a fresh counter. But the
// quota function only ever sets `blocked`, never clears it, so this sweeps
// stale blocks once a day.
exports.resetDailyBlocks = onSchedule(
  { schedule: 'every day 00:05', region: 'us-central1' },
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

// Keeps sync/{ns}/meta/schemaVersion in sync with the constants above so
// clients (checkSyncCompatibility in firebaseClient.js) always read a
// current value, even if that node is ever manually cleared.
exports.publishSchemaVersionMeta = onSchedule(
  { schedule: 'every day 00:00', region: 'us-central1' },
  async () => {
    const db = getDatabase();
    await db.ref(`sync/${SYNC_NAMESPACE}/meta/schemaVersion`).set({
      latest: LATEST_SCHEMA_VERSION,
      minSupported: MIN_SUPPORTED_SCHEMA_VERSION
    });
  }
);
