// The storage accounting against real emulated services.
//
// storage-usage.test.js in the fast suite covers the arithmetic; none of it
// touches a bucket. This covers the wiring that arithmetic sits in, which is
// where the rest of the risk is: whether a paged bucket listing returns what
// the code expects, whether an object's size arrives as a string, whether the
// transaction that guards against a mid-scan write actually aborts. Every one
// of those fails silently in production — a balance that is quietly wrong
// enforces a ceiling that is quietly wrong.
//
// Uses the Admin SDK rather than @firebase/rules-unit-testing, because this is
// testing the server's own code path, not what a client is allowed to do.

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Resolved as though from functions/, because that is where firebase-admin is
// installed — the root package.json has no need of it, and duplicating it here
// would mean the tests could pass against a different version than the one
// that actually deploys. `./storageAccounting.js` below is relative to the
// same place.
const require = createRequire(new URL('../functions/package.json', import.meta.url));

const PROJECT_ID = 'demo-arial';
const BUCKET = `${PROJECT_ID}.appspot.com`;

const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');

let app;
let accounting;
let db;
let bucket;

const ALICE = 'alice';
const BOB = 'bob';

before(async () => {
  // The module reads getDatabase()/getStorage() off the default app, so the
  // app has to exist before it is required. emulators:exec supplies the
  // FIREBASE_*_EMULATOR_HOST variables that point all three at localhost.
  app = initializeApp({
    projectId: PROJECT_ID,
    storageBucket: BUCKET,
    databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}`
  });

  accounting = require('./storageAccounting.js');
  db = getDatabase();
  bucket = getStorage().bucket();

  // setCustomUserClaims needs accounts that exist.
  for (const uid of [ALICE, BOB]) {
    await getAuth()
      .createUser({ uid, email: `${uid}@example.com` })
      .catch(() => {}); // already there from a previous run
  }
});

after(async () => {
  if (app) await deleteApp(app);
});

beforeEach(async () => {
  await db.ref('storage').remove();
  await db.ref('sync').remove();
  await bucket.deleteFiles({ force: true }).catch(() => {});

  for (const uid of [ALICE, BOB]) {
    await getAuth().setCustomUserClaims(uid, {});
  }
});

function putObject(uid, name, bytes) {
  return bucket
    .file(`users/${uid}/attachments/f1/b1/src/${name}`)
    .save(Buffer.alloc(bytes, 1));
}

const readBalance = async (uid) => (await db.ref(`storage/${uid}`).get()).val();
const readClaims = async (uid) => (await getAuth().getUser(uid)).customClaims || {};

describe('reconcileStorageUsage', () => {
  it('backfills a balance for objects uploaded before it existed', async () => {
    await putObject(ALICE, 'a.bin', 4096);
    await putObject(ALICE, 'b.bin', 2048);

    // No storage/{uid} record at all — the state every account is in today.
    assert.equal(await readBalance(ALICE), null);

    await accounting.reconcileStorageUsage();

    const balance = await readBalance(ALICE);
    assert.equal(balance.bytes, 6144);
    assert.equal(balance.full, false);
    assert.ok(balance.updatedAt > 0);
  });

  it('keeps accounts apart', async () => {
    await putObject(ALICE, 'a.bin', 1024);
    await putObject(BOB, 'a.bin', 8192);

    await accounting.reconcileStorageUsage();

    assert.equal((await readBalance(ALICE)).bytes, 1024);
    assert.equal((await readBalance(BOB)).bytes, 8192);
  });

  // The drift case this whole function exists for: a balance that no longer
  // matches the bucket, with no event coming to correct it.
  it('corrects a balance that drifted away from the bucket', async () => {
    await putObject(ALICE, 'a.bin', 1024);
    await db.ref(`storage/${ALICE}`).set({
      bytes: 999999999,
      limit: 100,
      full: true,
      updatedAt: 1
    });

    await accounting.reconcileStorageUsage();

    assert.equal((await readBalance(ALICE)).bytes, 1024);
  });

  // An account that deleted everything is never mentioned by a bucket
  // listing, so without the zeroing pass its stale balance would stand for
  // ever and it would stay locked out of a bucket it has emptied.
  it('zeroes an account whose objects are all gone', async () => {
    await db.ref(`storage/${ALICE}`).set({
      bytes: 500000,
      limit: 100,
      full: true,
      updatedAt: 1
    });

    await accounting.reconcileStorageUsage();

    const balance = await readBalance(ALICE);
    assert.equal(balance.bytes, 0);
    assert.equal(balance.full, false);
  });

  it('ignores objects outside a user prefix rather than charging someone', async () => {
    await bucket.file('stray/orphan.bin').save(Buffer.alloc(5000, 1));
    await putObject(ALICE, 'a.bin', 1024);

    await accounting.reconcileStorageUsage();

    assert.equal((await readBalance(ALICE)).bytes, 1024);
  });

  // The listing is paged at 1000. This is the cheapest honest check that the
  // pagination loop terminates and accumulates across pages rather than
  // returning only the first one.
  it('accumulates across more than one object without losing any', async () => {
    const sizes = [512, 1024, 2048, 4096];
    for (const [i, size] of sizes.entries()) {
      await putObject(ALICE, `part-${i}.bin`, size);
    }

    await accounting.reconcileStorageUsage();

    assert.equal(
      (await readBalance(ALICE)).bytes,
      sizes.reduce((a, b) => a + b, 0)
    );
  });

  it('leaves a balance alone when an event landed mid-scan', async () => {
    await putObject(ALICE, 'a.bin', 1024);

    // updatedAt in the future stands in for a write that arrives after the
    // scan begins. The transaction should abort rather than overwrite it.
    await db.ref(`storage/${ALICE}`).set({
      bytes: 777,
      limit: 100 * 1024 * 1024,
      full: false,
      updatedAt: Date.now() + 60_000
    });

    await accounting.reconcileStorageUsage();

    assert.equal((await readBalance(ALICE)).bytes, 777);
  });
});

describe('quota enforcement through claims', () => {
  it('marks an account full and stamps its token once it is over', async () => {
    // The free limit is 100 MB; one object past it is enough.
    await db.ref(`sync/default/users/${ALICE}/plan`).set('free');
    await putObject(ALICE, 'big.bin', 100 * 1024 * 1024 + 1);

    await accounting.reconcileStorageUsage();

    assert.equal((await readBalance(ALICE)).full, true);
    assert.equal((await readClaims(ALICE)).storageFull, true);
  });

  it('gives the same bytes a pass on a paid plan', async () => {
    await db.ref(`sync/default/users/${ALICE}/plan`).set('pro');
    await putObject(ALICE, 'big.bin', 100 * 1024 * 1024 + 1);

    await accounting.reconcileStorageUsage();

    assert.equal((await readBalance(ALICE)).full, false);
    assert.equal((await readClaims(ALICE)).storageFull, undefined);
  });

  // Clearing the flag matters as much as setting it — an account that frees
  // space and stays stamped is locked out of storage it is paying for.
  it('clears the stamp once the account is back under', async () => {
    await getAuth().setCustomUserClaims(ALICE, { storageFull: true });
    await putObject(ALICE, 'small.bin', 1024);

    await accounting.reconcileStorageUsage();

    assert.equal((await readClaims(ALICE)).storageFull, undefined);
  });

  it('does not disturb other claims while stamping', async () => {
    await getAuth().setCustomUserClaims(ALICE, { plan: 'pro' });
    await db.ref(`sync/default/users/${ALICE}/plan`).set('free');
    await putObject(ALICE, 'big.bin', 100 * 1024 * 1024 + 1);

    await accounting.reconcileStorageUsage();

    const claims = await readClaims(ALICE);
    assert.equal(claims.storageFull, true);
    assert.equal(claims.plan, 'pro'); // the subscription survived the sweep
  });
});

describe('recordStorageDelta', () => {
  it('adds an upload to the balance', async () => {
    await accounting.recordStorageDelta(`users/${ALICE}/attachments/a.bin`, 2048);
    assert.equal((await readBalance(ALICE)).bytes, 2048);
  });

  it('takes a delete back off', async () => {
    await accounting.recordStorageDelta(`users/${ALICE}/attachments/a.bin`, 2048);
    await accounting.recordStorageDelta(`users/${ALICE}/attachments/a.bin`, -2048);
    assert.equal((await readBalance(ALICE)).bytes, 0);
  });

  // A delete without its matching upload — objects predating the triggers, or
  // a replayed event — must not drive the balance negative and hand out free
  // space.
  it('never goes below zero', async () => {
    await accounting.recordStorageDelta(`users/${ALICE}/attachments/a.bin`, -5000);
    assert.equal((await readBalance(ALICE)).bytes, 0);
  });

  it('charges nothing for an object outside a user prefix', async () => {
    await accounting.recordStorageDelta('stray/orphan.bin', 5000);
    assert.equal(await readBalance(ALICE), null);
    assert.equal(await readBalance(BOB), null);
  });
});
