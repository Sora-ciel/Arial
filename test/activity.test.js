import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import activity from '../functions/activity.js';

const {
  percentile,
  summariseAccounts,
  shouldStampActivity,
  stampedActivity,
  ACTIVITY_STAMP_INTERVAL_MS,
  DAY_MS
} = activity;

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);
const MB = 1024 * 1024;
const FREE_LIMIT = 100 * MB;

const seen = (daysAgo, firstSeenDaysAgo = daysAgo) => ({
  firstSeenAt: NOW - firstSeenDaysAgo * DAY_MS,
  lastSeenAt: NOW - daysAgo * DAY_MS
});

describe('percentile', () => {
  // Nearest-rank, so every answer is a value some account really has. With a
  // handful of users an interpolated median is a number nobody holds.
  it('picks a real value rather than interpolating', () => {
    assert.equal(percentile([10, 20, 30, 40], 0.5), 20);
    assert.equal(percentile([10, 20, 30, 40], 0.9), 40);
  });

  it('handles a single value', () => {
    assert.equal(percentile([42], 0.5), 42);
    assert.equal(percentile([42], 0.9), 42);
  });

  it('is zero for nothing at all', () => {
    assert.equal(percentile([], 0.5), 0);
  });

  it('never runs off either end', () => {
    assert.equal(percentile([1, 2, 3], 0), 1);
    assert.equal(percentile([1, 2, 3], 1), 3);
  });
});

describe('summariseAccounts', () => {
  it('counts accounts and how recently each came back', () => {
    const summary = summariseAccounts({
      activity: {
        fresh: seen(0),
        threeDays: seen(3),
        twoWeeks: seen(14),
        longGone: seen(200)
      },
      storage: {},
      now: NOW,
      freeLimit: FREE_LIMIT
    });

    assert.equal(summary.accounts, 4);
    assert.equal(summary.activeToday, 1);
    assert.equal(summary.active7d, 2);
    assert.equal(summary.active30d, 3);
  });

  // The distinction that stops "nobody comes back" being confused with
  // "nobody has arrived yet" — which is the situation Arial is actually in.
  it('separates new accounts from returning ones', () => {
    const summary = summariseAccounts({
      activity: {
        brandNew: seen(0, 0),
        oldButActive: seen(0, 90)
      },
      storage: {},
      now: NOW,
      freeLimit: FREE_LIMIT
    });

    assert.equal(summary.accounts, 2);
    assert.equal(summary.activeToday, 2);
    assert.equal(summary.newToday, 1);
  });

  it('describes what accounts are keeping', () => {
    const summary = summariseAccounts({
      activity: { a: seen(0), b: seen(0), c: seen(0), d: seen(0) },
      storage: {
        a: { bytes: 1 * MB },
        b: { bytes: 10 * MB },
        c: { bytes: 50 * MB },
        d: { bytes: 400 * MB }
      },
      now: NOW,
      freeLimit: FREE_LIMIT
    });

    assert.equal(summary.accountsWithStorage, 4);
    assert.equal(summary.storedBytesTotal, 461 * MB);
    assert.equal(summary.storedBytesMedian, 10 * MB);
    assert.equal(summary.storedBytesMax, 400 * MB);
    assert.equal(summary.overFreeLimit, 1); // only d is past 100 MB
  });

  // An empty account counted as zero would drag the median down and make the
  // free tier look roomier than it is — the exact mistake that sets a ceiling
  // nobody ever reaches.
  it('leaves empty accounts out of the storage figures', () => {
    const summary = summariseAccounts({
      activity: { a: seen(0), b: seen(0), c: seen(0) },
      storage: { a: { bytes: 0 }, b: { bytes: 20 * MB }, c: { bytes: 40 * MB } },
      now: NOW,
      freeLimit: FREE_LIMIT
    });

    assert.equal(summary.accounts, 3);
    assert.equal(summary.accountsWithStorage, 2);
    assert.equal(summary.storedBytesMedian, 20 * MB);
  });

  it('is all zeroes on an empty project rather than throwing', () => {
    const summary = summariseAccounts({
      activity: {},
      storage: {},
      now: NOW,
      freeLimit: FREE_LIMIT
    });

    assert.equal(summary.accounts, 0);
    assert.equal(summary.active7d, 0);
    assert.equal(summary.storedBytesMedian, 0);
    assert.equal(summary.overFreeLimit, 0);
  });

  it('survives records with fields missing', () => {
    const summary = summariseAccounts({
      activity: { a: {}, b: null, c: seen(0) },
      storage: { a: {}, c: { bytes: 5 * MB } },
      now: NOW,
      freeLimit: FREE_LIMIT
    });

    assert.equal(summary.accounts, 3);
    assert.equal(summary.activeToday, 1);
    assert.equal(summary.storedBytesTotal, 5 * MB);
  });

  // The number that says whether a ceiling would earn anything, as opposed to
  // how many people it would annoy.
  it('counts who a given ceiling would actually reach', () => {
    const storage = {
      a: { bytes: 5 * MB },
      b: { bytes: 150 * MB },
      c: { bytes: 900 * MB }
    };
    const activityRows = { a: seen(0), b: seen(0), c: seen(0) };

    assert.equal(
      summariseAccounts({ activity: activityRows, storage, now: NOW, freeLimit: 100 * MB })
        .overFreeLimit,
      2
    );
    assert.equal(
      summariseAccounts({ activity: activityRows, storage, now: NOW, freeLimit: 500 * MB })
        .overFreeLimit,
      1
    );
  });
});

describe('activity stamping', () => {
  // enforceSyncQuota fires on every save, and a save happens every few seconds
  // while typing. Stamping each one multiplies the write cost of editing a
  // note for a number only ever read a day later.
  it('skips a stamp that is still fresh', () => {
    const current = { lastSeenAt: NOW - 60 * 1000 };
    assert.equal(shouldStampActivity(current, NOW), false);
  });

  it('stamps once the interval has passed', () => {
    const current = { lastSeenAt: NOW - ACTIVITY_STAMP_INTERVAL_MS };
    assert.equal(shouldStampActivity(current, NOW), true);
  });

  it('always stamps an account it has never seen', () => {
    assert.equal(shouldStampActivity(null, NOW), true);
    assert.equal(shouldStampActivity({}, NOW), true);
  });

  // firstSeenAt is the only thing that can say how long an account has been
  // around, so it is set once and never moved.
  it('sets firstSeenAt once and then leaves it alone', () => {
    const first = stampedActivity(null, NOW);
    assert.equal(first.firstSeenAt, NOW);
    assert.equal(first.lastSeenAt, NOW);

    const later = stampedActivity(first, NOW + 5 * DAY_MS);
    assert.equal(later.firstSeenAt, NOW, 'firstSeenAt must not move');
    assert.equal(later.lastSeenAt, NOW + 5 * DAY_MS);
  });

  it('repairs a record whose firstSeenAt went missing', () => {
    const repaired = stampedActivity({ lastSeenAt: NOW - DAY_MS }, NOW);
    assert.equal(repaired.firstSeenAt, NOW);
  });
});
