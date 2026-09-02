// Do the triggers actually fire?
//
// Everything else stops short of this. storage-accounting.test.js calls
// recordStorageDelta directly, which proves the accounting is right and proves
// nothing at all about whether an upload ever reaches it. The wiring in
// index.js — the event type, which field of the event carries the object name,
// whether the size arrives as a string, whether a delete fires anything — is
// exactly the part no unit test touches, and all of it fails silently: uploads
// keep working, the balance just stays at zero for ever and the ceiling never
// fires.
//
// So this runs the real functions in the functions emulator, uploads a real
// object, and waits for the balance to move on its own.
//
// Its own suite rather than part of test:rules, because the functions emulator
// would otherwise be running these triggers *during* the rules tests, writing
// to the same nodes those tests assert on.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));

const PROJECT_ID = 'demo-arial';
const BUCKET = `${PROJECT_ID}.appspot.com`;

const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');

const ALICE = 'trigger-alice';

let app;
let db;
let bucket;

// Trigger delivery is asynchronous and has no completion signal, so the only
// honest way to assert on it is to wait for the state to change and give up
// after a while.
//
// The timeout is deliberately far larger than the few seconds this takes once
// warm. The first event of a run pays for the functions emulator loading the
// module and starting a runtime, and at twenty seconds that lost a coin toss —
// a test that fails on a cold machine and passes on a warm one teaches nobody
// anything except to stop believing it.
async function waitFor(read, predicate, { timeoutMs = 90000, everyMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;

  while (Date.now() < deadline) {
    last = await read();
    if (predicate(last)) return last;
    await new Promise(resolve => setTimeout(resolve, everyMs));
  }

  throw new Error(`timed out waiting for the trigger; last value was ${JSON.stringify(last)}`);
}

before(async () => {
  app = initializeApp({
    projectId: PROJECT_ID,
    storageBucket: BUCKET,
    databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}`
  });

  db = getDatabase();
  bucket = getStorage().bucket();

  await getAuth().createUser({ uid: ALICE }).catch(() => {});
  await db.ref(`storage/${ALICE}`).remove();
  await bucket.deleteFiles({ prefix: `users/${ALICE}/` }).catch(() => {});
});

after(async () => {
  if (app) await deleteApp(app).catch(() => {});
});

const balance = async () => (await db.ref(`storage/${ALICE}`).get()).val();

describe('storage triggers', () => {
  it('charges an upload to the account that made it', async () => {
    await bucket
      .file(`users/${ALICE}/attachments/f1/b1/src/photo.bin`)
      .save(Buffer.alloc(4096, 1));

    const row = await waitFor(balance, value => value && value.bytes > 0);

    assert.equal(row.bytes, 4096);
    assert.equal(row.full, false);
    assert.ok(row.limit > 0, 'the plan limit should be recorded alongside');
  });

  it('credits it back when the object is deleted', async () => {
    await bucket.file(`users/${ALICE}/attachments/f1/b1/src/photo.bin`).delete();

    const row = await waitFor(balance, value => value && value.bytes === 0);

    assert.equal(row.bytes, 0);
  });
});
