// Arial bandwidth monitoring.
//
// The quota guard in ../index.js already tallies bytes per user per day at
// usage/{uid}/{date} and flips `blocked` at the ceiling. That tally is silent:
// the first you hear of a heavy day is a user telling you saving stopped
// working. These functions put a mail in front of that moment.
//
// Three watchers, deliberately different in shape:
//
//   bandwidthWatch         per-user, live, fires the instant a percentage step
//                          of the daily limit is crossed.
//   projectBandwidthWatch  hourly, whole-project total - catches a crowd of
//                          users who are each individually unremarkable.
//   bandwidthDigest        end of day, what actually happened.
//
// Deduping is a transaction on alerts/{uid}/{date}/... so two concurrent
// invocations racing on the same crossing can only mail once. Everything here
// writes under alerts/, never under usage/, so nothing it does can retrigger
// the usage watcher.
//
// SCOPE: this counts bytes *written through sync*. It is not the same thing as
// billed egress, which also covers reads, hosting and storage. The Cloud
// Monitoring alert policy and budget alert (see README.md) cover that side;
// these functions cover the side the app itself can see.

const { onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { getDatabase } = require('firebase-admin/database');
const { sendAlert, formatBytes, smtpPassword } = require('./mailer');
const { loadSettings } = require('./settings');
const { DAILY_BYTE_LIMIT, REGION } = require('./config');

// Matches todayKey() in ../index.js: usage keys are UTC dates.
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// A uid in a subject line is noise and, mailed around, more identifying than
// it needs to be. The prefix is enough to tell two users apart in a digest.
function shortUid(uid) {
  return String(uid || '').slice(0, 8);
}

/**
 * Claim an alert exactly once. Returns true only for the caller that won.
 *
 * Aborting the transaction (returning undefined) when a value already exists
 * is what makes this safe under concurrency - two invocations crossing the
 * same step at the same moment cannot both commit.
 */
async function claimAlert(path) {
  const result = await getDatabase()
    .ref(path)
    .transaction(current => (current === null ? Date.now() : undefined));
  return result.committed && result.snapshot.exists();
}

// ---------------- per-user, live ----------------

exports.bandwidthWatch = onValueWritten(
  {
    ref: 'usage/{uid}/{date}',
    region: REGION,
    maxInstances: 3, // one mail per crossing; this never needs to scale out
    secrets: [smtpPassword]
  },
  async event => {
    const { uid, date } = event.params;
    if (!event.data.after.exists()) return; // counter cleared

    const totalBytes = Number(event.data.after.val()) || 0;
    if (totalBytes <= 0) return;

    const settings = await loadSettings();
    if (!settings.ALERTS_ENABLED) return;

    const percent = (totalBytes / DAILY_BYTE_LIMIT) * 100;
    const crossed = settings.ALERT_STEPS.filter(step => percent >= step);
    if (crossed.length === 0) return;

    // Claim every crossed step, but mail only the highest new one: a single
    // large write can jump 0 -> 90% and three mails about the same instant
    // would be three times the noise for one event.
    const claimed = [];
    for (const step of crossed) {
      if (await claimAlert(`alerts/${uid}/${date}/bandwidth/${step}`)) claimed.push(step);
    }
    if (claimed.length === 0) return; // already reported today

    const step = Math.max(...claimed);
    const atLimit = step >= 100;
    const subject = atLimit
      ? `Arial - user ${shortUid(uid)} hit the daily sync limit`
      : `Arial - user ${shortUid(uid)} at ${step}% of the daily sync limit`;

    const lines = [
      `User ${shortUid(uid)} has written ${formatBytes(totalBytes)} today (${date}, UTC).`,
      '',
      `  limit        ${formatBytes(DAILY_BYTE_LIMIT)} per user per day`,
      `  used         ${formatBytes(totalBytes)}  (${percent.toFixed(1)}%)`,
      `  step crossed ${step}%`,
      ''
    ];
    if (atLimit) {
      lines.push(
        'Sync writes for this user are now blocked by database.rules.json.',
        'resetDailyBlocks clears the block at 00:05 UTC.',
        ''
      );
    }
    lines.push(
      'This counts bytes written through sync only - it does not include',
      'reads, hosting or storage egress. Check the Firebase console usage tab',
      'if the bill is what you are worried about.'
    );

    await sendAlert(subject, lines.join('\n'), settings.RECIPIENT);
    logger.info('bandwidth-alert', { uid, date, step, totalBytes });
  }
);

// ---------------- project-wide, hourly ----------------

async function usageForDate(date) {
  const snap = await getDatabase().ref('usage').get();
  const rows = [];
  if (!snap.exists()) return rows;
  snap.forEach(userSnap => {
    const bytes = Number(userSnap.child(date).val()) || 0;
    if (bytes > 0) rows.push({ uid: userSnap.key, bytes });
  });
  rows.sort((a, b) => b.bytes - a.bytes);
  return rows;
}

exports.projectBandwidthWatch = onSchedule(
  {
    schedule: 'every 1 hours',
    region: REGION,
    maxInstances: 1,
    secrets: [smtpPassword]
  },
  async () => {
    // Publish the enforced ceiling so the dashboard shows the number that is
    // actually applied rather than one hardcoded into the page and free to
    // drift away from limits.js. Written before the early returns below, so it
    // stays fresh on quiet days too.
    await getDatabase().ref('monitoring/status/dailyByteLimit').set(DAILY_BYTE_LIMIT);

    const settings = await loadSettings();
    if (!settings.ALERTS_ENABLED) return;

    const date = todayKey();
    const rows = await usageForDate(date);
    const total = rows.reduce((sum, row) => sum + row.bytes, 0);
    if (total < settings.PROJECT_DAILY_BYTE_ALERT) return;

    if (!(await claimAlert(`alerts/_project/${date}/bandwidth`))) return; // already sent today

    const top = rows.slice(0, settings.DIGEST_TOP_USERS)
      .map(row => `  ${shortUid(row.uid)}   ${formatBytes(row.bytes)}`);

    await sendAlert(
      `Arial - project sync traffic over ${formatBytes(settings.PROJECT_DAILY_BYTE_ALERT)} today`,
      [
        `All users combined have written ${formatBytes(total)} on ${date} (UTC),`,
        `past the ${formatBytes(settings.PROJECT_DAILY_BYTE_ALERT)} project threshold.`,
        '',
        `  active users  ${rows.length}`,
        `  total         ${formatBytes(total)}`,
        '',
        'Heaviest users:',
        ...top,
        '',
        'Sent once per day. The end-of-day digest follows at 23:55 UTC.'
      ].join('\n'),
      settings.RECIPIENT
    );
    logger.info('project-bandwidth-alert', { date, total, activeUsers: rows.length });
  }
);

// ---------------- end of day ----------------

exports.bandwidthDigest = onSchedule(
  {
    schedule: 'every day 23:55',
    region: REGION,
    maxInstances: 1,
    secrets: [smtpPassword]
  },
  async () => {
    const settings = await loadSettings();
    if (!settings.ALERTS_ENABLED) return;

    const date = todayKey();
    const rows = await usageForDate(date);
    const total = rows.reduce((sum, row) => sum + row.bytes, 0);

    if (rows.length === 0 && !settings.DIGEST_ON_QUIET_DAYS) return;

    const blockedSnap = await getDatabase().ref('sync/default/users').get();
    const blocked = [];
    if (blockedSnap.exists()) {
      blockedSnap.forEach(userSnap => {
        if (userSnap.child('blocked').val() === true) blocked.push(shortUid(userSnap.key));
      });
    }

    const top = rows.slice(0, settings.DIGEST_TOP_USERS).map(row => {
      const pct = ((row.bytes / DAILY_BYTE_LIMIT) * 100).toFixed(1);
      return `  ${shortUid(row.uid)}   ${formatBytes(row.bytes)}  (${pct}% of limit)`;
    });

    await sendAlert(
      `Arial - daily sync usage ${formatBytes(total)} (${date})`,
      [
        `Sync write volume for ${date} (UTC).`,
        '',
        `  total         ${formatBytes(total)}`,
        `  active users  ${rows.length}`,
        `  per-user limit ${formatBytes(DAILY_BYTE_LIMIT)}`,
        '',
        rows.length ? 'Heaviest users:' : 'No sync writes today.',
        ...top,
        '',
        blocked.length
          ? `Currently blocked: ${blocked.join(', ')} (cleared at 00:05 UTC).`
          : 'No users are blocked.'
      ].join('\n'),
      settings.RECIPIENT
    );
    logger.info('bandwidth-digest', { date, total, activeUsers: rows.length });
  }
);

// ---------------- dashboard support ----------------

/**
 * "Send test mail" from the dashboard.
 *
 * This is the only way to prove the secret is right without waiting for real
 * traffic to cross a threshold. Admin-only: it costs a function invocation and
 * sends mail, so it is not something any signed-in user should be able to fire.
 */
exports.sendMonitoringTestMail = onCall(
  { region: REGION, maxInstances: 1, secrets: [smtpPassword] },
  async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

    const isAdmin = (await getDatabase().ref(`admins/${uid}`).get()).val() === true;
    if (!isAdmin) throw new HttpsError('permission-denied', 'Admins only.');

    const settings = await loadSettings();
    const sent = await sendAlert(
      'Arial - monitoring test',
      [
        'This is a test mail from the Arial monitoring dashboard.',
        '',
        `  sent at   ${new Date().toISOString()}`,
        `  recipient ${settings.RECIPIENT}`,
        `  alerts    ${settings.ALERTS_ENABLED ? 'enabled' : 'DISABLED'}`,
        '',
        'If this arrived, the SMTP secret is correct and alerts can reach you.'
      ].join('\n'),
      settings.RECIPIENT
    );

    if (!sent) {
      throw new HttpsError(
        'failed-precondition',
        'The mail was not sent. Check that ARIAL_SMTP_PASS is set in Secret Manager ' +
        'and that the functions were redeployed after setting it.'
      );
    }
    return { ok: true, recipient: settings.RECIPIENT };
  }
);
