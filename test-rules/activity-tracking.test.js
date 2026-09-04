// The activity stamp and the daily roll-up against an emulated database.
//
// activity.test.js in the fast suite covers the arithmetic. What is left, and
// what is here, is the database behaviour around it: that the hourly coarsening
// is enforced by an actual transaction rather than only by a pure predicate,
// that firstSeenAt survives being rewritten by a real concurrent-safe write,
// and that a roll-up reads the two top-level nodes and lands a row that can be
// read back a day later. A roll-up that silently records nothing looks exactly
// like a project with no users.

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Resolved as though from functions/, where firebase-admin is installed.
const require = createRequire(new URL('../functions/package.json', import.meta.url));

const PROJECT_ID = 'demo-arial';

const { initializeApp, deleteApp, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

let app;
let tracking;
let db;

const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

before(async () => {
  app =
    getApps()[0] ||
    initializeApp({
      projectId: PROJECT_ID,
      databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}`
    });

  tracking = require('./activityTracking.js');
  db = getDatabase();
});

after(async () => {
  if (app) await deleteApp(app).catch(() => {});
});

beforeEach(async () => {
  await db.ref('activity').remove();
  await db.ref('storage').remove();
  await db.ref('monitoring/stats').remove();
});

const readActivity = async (uid) => (await db.ref(`activity/${uid}`).get()).val();

describe('recordActivity', () => {
  it('creates a record the first time an account saves', async () => {
    const now = Date.now();
    await tracking.recordActivity('alice', now);

    const row = await readActivity('alice');
    assert.equal(row.firstSeenAt, now);
    assert.equal(row.lastSeenAt, now);
  });

  // The write-cost guard, enforced by the transaction rather than only by the
  // predicate. A save happens every few seconds while someone types.
  it('does not rewrite a stamp that is still fresh', async () => {
    const now = Date.now();
    await tracking.recordActivity('alice', now);

    const committed = await tracking.recordActivity('alice', now + 60 * 1000);
    assert.equal(committed, false, 'a fresh stamp should abort the transaction');

    assert.equal((await readActivity('alice')).lastSeenAt, now);
  });

  it('moves the stamp once an hour has passed', async () => {
    const now = Date.now();
    await tracking.recordActivity('alice', now);
    await tracking.recordActivity('alice', now + 2 * 60 * 60 * 1000);

    assert.equal((await readActivity('alice')).lastSeenAt, now + 2 * 60 * 60 * 1000);
  });

  // The one field that can distinguish "nobody comes back" from "nobody has
  // arrived yet", so it must survive every later write.
  it('never moves firstSeenAt', async () => {
    const now = Date.now();
    await tracking.recordActivity('alice', now);
    await tracking.recordActivity('alice', now + 5 * DAY_MS);

    assert.equal((await readActivity('alice')).firstSeenAt, now);
  });

  it('keeps accounts apart', async () => {
    const now = Date.now();
    await tracking.recordActivity('alice', now);
    await tracking.recordActivity('bob', now + 1000);

    assert.equal((await readActivity('bob')).firstSeenAt, now + 1000);
    assert.equal((await readActivity('alice')).firstSeenAt, now);
  });

  it('ignores a call with no account', async () => {
    await tracking.recordActivity(undefined, Date.now());
    assert.equal((await db.ref('activity').get()).val(), null);
  });
});

describe('rollUpStats', () => {
  it('writes a row for the day and a readable latest', async () => {
    const now = Date.now();

    await db.ref('activity').set({
      alice: { firstSeenAt: now - 10 * DAY_MS, lastSeenAt: now },
      bob: { firstSeenAt: now - 40 * DAY_MS, lastSeenAt: now - 20 * DAY_MS }
    });
    await db.ref('storage').set({
      alice: { bytes: 5 * MB },
      bob: { bytes: 250 * MB }
    });

    const summary = await tracking.rollUpStats(now);

    assert.equal(summary.accounts, 2);
    assert.equal(summary.activeToday, 1);
    assert.equal(summary.active30d, 2);
    assert.equal(summary.storedBytesTotal, 255 * MB);
    assert.equal(summary.overFreeLimit, 1); // bob is past the 100 MB free tier

    const date = tracking.todayKey(now);
    const stored = (await db.ref(`monitoring/stats/${date}`).get()).val();
    assert.equal(stored.accounts, 2);
    assert.ok(stored.recordedAt > 0);

    const latest = (await db.ref('monitoring/stats/latest').get()).val();
    assert.equal(latest.date, date);
    assert.equal(latest.accounts, 2);
  });

  // The state the project is in right now. A roll-up that throws on an empty
  // database would mean the history never starts.
  it('records a row of zeroes on an empty project', async () => {
    const now = Date.now();
    const summary = await tracking.rollUpStats(now);

    assert.equal(summary.accounts, 0);
    assert.equal(summary.storedBytesTotal, 0);

    const latest = (await db.ref('monitoring/stats/latest').get()).val();
    assert.equal(latest.accounts, 0);
  });

  // The history is the point: the numbers recompute, a past day does not.
  it('keeps yesterday when today is written', async () => {
    const now = Date.now();
    const yesterday = now - DAY_MS;

    await db.ref('activity').set({
      alice: { firstSeenAt: yesterday, lastSeenAt: yesterday }
    });
    await tracking.rollUpStats(yesterday);

    await db.ref('activity').set({
      alice: { firstSeenAt: yesterday, lastSeenAt: now },
      bob: { firstSeenAt: now, lastSeenAt: now }
    });
    await tracking.rollUpStats(now);

    const rows = (await db.ref('monitoring/stats').get()).val();
    assert.equal(rows[tracking.todayKey(yesterday)].accounts, 1);
    assert.equal(rows[tracking.todayKey(now)].accounts, 2);
  });

  it('counts an account with no storage record as an account with no storage', async () => {
    const now = Date.now();
    await db.ref('activity').set({
      alice: { firstSeenAt: now, lastSeenAt: now }
    });

    const summary = await tracking.rollUpStats(now);

    assert.equal(summary.accounts, 1);
    assert.equal(summary.accountsWithStorage, 0);
    assert.equal(summary.storedBytesMedian, 0);
  });
});
