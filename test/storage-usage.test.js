import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// functions/ is CommonJS and this suite is ESM, so the module comes in as a
// default export rather than named ones.
import storageUsage from '../functions/storageUsage.js';
import limits from '../functions/limits.js';

const {
  uidFromObjectName,
  nextClaims,
  claimsChanged,
  tallyByUid,
  withZeroedMissing,
  isStaleScan
} = storageUsage;
const { storageLimitFor, isOverStorageLimit, STORAGE_BYTE_LIMITS, storableLimit } = limits;

describe('uidFromObjectName', () => {
  // Storage triggers fire for the whole bucket, not for a path pattern, so
  // the uid an upload is charged to comes entirely from the object's name.
  it('reads the uid out of a real attachment path', () => {
    assert.equal(
      uidFromObjectName('users/abc123/attachments/file1/block1/src/photo.png'),
      'abc123'
    );
  });

  it('reads it from any depth under the user prefix', () => {
    assert.equal(uidFromObjectName('users/abc123/anything.bin'), 'abc123');
  });

  // Everything below must return null rather than a guess. Charging the wrong
  // account for someone else's bytes is worse than not counting them: it can
  // push an innocent account over its limit and stop its uploads.
  it('refuses a path outside the users prefix', () => {
    assert.equal(uidFromObjectName('public/photo.png'), null);
    assert.equal(uidFromObjectName('attachments/users/abc/photo.png'), null);
  });

  it('refuses the user prefix itself, which is a folder and not an object', () => {
    assert.equal(uidFromObjectName('users/abc123'), null);
    assert.equal(uidFromObjectName('users'), null);
  });

  it('refuses an empty uid segment', () => {
    assert.equal(uidFromObjectName('users//attachments/photo.png'), null);
  });

  it('refuses anything that is not a string', () => {
    assert.equal(uidFromObjectName(undefined), null);
    assert.equal(uidFromObjectName(null), null);
    assert.equal(uidFromObjectName(42), null);
  });
});

describe('storage limits', () => {
  it('gives an account with no plan the free limit', () => {
    assert.equal(storageLimitFor(undefined), STORAGE_BYTE_LIMITS.free);
    assert.equal(storageLimitFor(null), STORAGE_BYTE_LIMITS.free);
  });

  // A plan name this build does not know must not fail open. That happens on
  // a rollback: a deploy that predates a new tier still has to hold the line
  // rather than hand everyone unlimited storage.
  it('gives an unknown plan the free limit', () => {
    assert.equal(storageLimitFor('enterprise-mega'), STORAGE_BYTE_LIMITS.free);
  });

  it('gives a paid plan its own limit', () => {
    assert.equal(storageLimitFor('pro'), STORAGE_BYTE_LIMITS.pro);
    assert.ok(STORAGE_BYTE_LIMITS.pro > STORAGE_BYTE_LIMITS.free);
  });

  it('is over only past the limit, not at it', () => {
    assert.equal(isOverStorageLimit(STORAGE_BYTE_LIMITS.free, 'free'), false);
    assert.equal(isOverStorageLimit(STORAGE_BYTE_LIMITS.free + 1, 'free'), true);
  });

  it('treats a missing or zero balance as under', () => {
    assert.equal(isOverStorageLimit(undefined, 'free'), false);
    assert.equal(isOverStorageLimit(0, 'free'), false);
  });

  it('holds a free account to the free limit even when it is well under pro', () => {
    const halfwayToPro = STORAGE_BYTE_LIMITS.pro / 2;
    assert.equal(isOverStorageLimit(halfwayToPro, 'free'), true);
    assert.equal(isOverStorageLimit(halfwayToPro, 'pro'), false);
  });

  // A limit introduced after people are already using something is a limit
  // taken away from them. Grandfathered accounts get room to spare rather than
  // waking up over a line that did not exist when they filled it.
  it('gives a grandfathered account more room than a new one', () => {
    assert.ok(STORAGE_BYTE_LIMITS.legacy > STORAGE_BYTE_LIMITS.free);

    const overFreeUnderLegacy = STORAGE_BYTE_LIMITS.free + 1;
    assert.equal(isOverStorageLimit(overFreeUnderLegacy, 'free'), true);
    assert.equal(isOverStorageLimit(overFreeUnderLegacy, 'legacy'), false);
  });

  it('never puts the owner account over', () => {
    assert.equal(storageLimitFor('owner'), Number.POSITIVE_INFINITY);
    assert.equal(isOverStorageLimit(STORAGE_BYTE_LIMITS.pro * 1000, 'owner'), false);
    assert.equal(isOverStorageLimit(Number.MAX_SAFE_INTEGER, 'owner'), false);
  });
});

describe('storableLimit', () => {
  // Infinity is not JSON and the database will not hold it. Writing some
  // enormous number instead would store a lie that reads as a real limit to
  // whoever looks at it next.
  it('turns an unlimited plan into a null the database can hold', () => {
    assert.equal(storableLimit(storageLimitFor('owner')), null);
  });

  it('leaves a real limit alone', () => {
    assert.equal(storableLimit(STORAGE_BYTE_LIMITS.free), STORAGE_BYTE_LIMITS.free);
    assert.equal(storableLimit(0), 0);
  });

  it('refuses NaN as well, rather than writing it', () => {
    assert.equal(storableLimit(Number.NaN), null);
  });
});

describe('custom claims', () => {
  // setCustomUserClaims replaces rather than merges. Writing { storageFull }
  // as a bare object would drop every other claim — and once a paid `plan`
  // claim exists, a storage counter would be silently cancelling
  // subscriptions.
  it('keeps claims it was not asked to change', () => {
    const before = { plan: 'pro', admin: true };
    assert.deepEqual(nextClaims(before, { storageFull: true }), {
      plan: 'pro',
      admin: true,
      storageFull: true
    });
  });

  // Absent, not false: the token has a 1000-byte ceiling, and storage.rules
  // reads `storageFull != true`, which is true either way.
  it('removes a flag rather than storing it as false', () => {
    const before = { plan: 'pro', storageFull: true };
    assert.deepEqual(nextClaims(before, { storageFull: false }), { plan: 'pro' });
  });

  it('copes with an account that has no claims at all', () => {
    assert.deepEqual(nextClaims(undefined, { storageFull: true }), { storageFull: true });
    assert.deepEqual(nextClaims(null, { storageFull: false }), {});
  });

  it('does not mutate the claims it was given', () => {
    const before = { plan: 'pro' };
    nextClaims(before, { storageFull: true });
    assert.deepEqual(before, { plan: 'pro' });
  });
});

describe('claimsChanged', () => {
  // The storage triggers fire on every upload. Writing an unchanged token
  // each time would cost an Admin SDK round trip per object and invalidate
  // the user's cached credentials for no reason.
  it('is false when nothing moved', () => {
    assert.equal(claimsChanged({ plan: 'pro' }, { plan: 'pro' }), false);
    assert.equal(claimsChanged({}, {}), false);
    assert.equal(claimsChanged(undefined, {}), false);
  });

  it('is true when a flag is added, removed or altered', () => {
    assert.equal(claimsChanged({}, { storageFull: true }), true);
    assert.equal(claimsChanged({ storageFull: true }, {}), true);
    assert.equal(claimsChanged({ plan: 'free' }, { plan: 'pro' }), true);
  });
});

describe('tallyByUid', () => {
  // GCS lists the whole bucket and reports sizes as strings, so the grouping
  // and the parsing both have to happen on the way in.
  it('groups a bucket listing into per-account totals', () => {
    const objects = [
      { name: 'users/alice/attachments/f1/b1/src/a.png', size: '100' },
      { name: 'users/alice/attachments/f1/b2/src/b.png', size: '250' },
      { name: 'users/bob/attachments/f9/b1/src/c.png', size: '40' }
    ];

    assert.deepEqual(tallyByUid(objects), { alice: 350, bob: 40 });
  });

  it('accepts numeric sizes as well as string ones', () => {
    const objects = [
      { name: 'users/alice/a.png', size: 100 },
      { name: 'users/alice/b.png', size: '100' }
    ];

    assert.deepEqual(tallyByUid(objects), { alice: 200 });
  });

  // Anything outside a user prefix is charged to nobody rather than guessed
  // at, for the same reason uidFromObjectName returns null for it.
  it('ignores objects outside a user prefix', () => {
    const objects = [
      { name: 'users/alice/a.png', size: '100' },
      { name: 'stray-object.bin', size: '9999' },
      { name: 'public/shared.png', size: '9999' }
    ];

    assert.deepEqual(tallyByUid(objects), { alice: 100 });
  });

  it('ignores zero-byte and unparseable sizes', () => {
    const objects = [
      { name: 'users/alice/a.png', size: '0' },
      { name: 'users/alice/b.png', size: 'not-a-number' },
      { name: 'users/alice/c.png' }
    ];

    assert.deepEqual(tallyByUid(objects), {});
  });

  it('copes with an empty or missing listing', () => {
    assert.deepEqual(tallyByUid([]), {});
    assert.deepEqual(tallyByUid(undefined), {});
    assert.deepEqual(tallyByUid([null, undefined]), {});
  });
});

describe('withZeroedMissing', () => {
  // An account that deleted everything has nothing left in the bucket, so a
  // listing never mentions it. Without this its old balance would stand for
  // ever and someone who cleared their storage would stay locked out.
  it('zeroes an account that has a balance but no objects', () => {
    assert.deepEqual(withZeroedMissing({ alice: 500 }, ['alice', 'bob']), {
      alice: 500,
      bob: 0
    });
  });

  it('leaves accounts that still have objects alone', () => {
    assert.deepEqual(withZeroedMissing({ alice: 500, bob: 10 }, ['alice', 'bob']), {
      alice: 500,
      bob: 10
    });
  });

  it('keeps accounts that are new to the bucket since the last run', () => {
    assert.deepEqual(withZeroedMissing({ carol: 12 }, ['alice']), {
      carol: 12,
      alice: 0
    });
  });

  it('does not mutate what it was given', () => {
    const totals = { alice: 500 };
    withZeroedMissing(totals, ['bob']);
    assert.deepEqual(totals, { alice: 500 });
  });
});

describe('isStaleScan', () => {
  const SCAN_START = 1000;

  // A listing is a snapshot and uploads do not stop while it is taken. If an
  // event landed after the scan began, its arithmetic is newer than anything
  // the scan can say, and overwriting it would drop those bytes for good.
  it('is stale when an event landed after the scan began', () => {
    assert.equal(isStaleScan({ updatedAt: SCAN_START + 1 }, SCAN_START), true);
  });

  it('is stale when an event landed at the very moment the scan began', () => {
    assert.equal(isStaleScan({ updatedAt: SCAN_START }, SCAN_START), true);
  });

  it('is not stale when the record predates the scan', () => {
    assert.equal(isStaleScan({ updatedAt: SCAN_START - 1 }, SCAN_START), false);
  });

  // An account with no record at all is the backfill case, and must be written.
  it('is not stale when there is no record yet', () => {
    assert.equal(isStaleScan(null, SCAN_START), false);
    assert.equal(isStaleScan(undefined, SCAN_START), false);
    assert.equal(isStaleScan({}, SCAN_START), false);
  });
});
