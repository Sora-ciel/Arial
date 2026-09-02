// What storage.rules enforces, checked against the real rules file in the
// emulator. Companion to database-rules.test.js — see the note at the top of
// that file for why these live outside test/.
//
// The group that matters is `the storage ceiling`. Storage rules cannot read
// the Realtime Database, so the running byte total that trackStorageUpload
// keeps under storage/{uid} is unreachable from here; the answer arrives as a
// custom claim on the user's own token instead. These tests are what say that
// indirection actually works, in both directions — a token without the claim
// must upload, a token carrying it must not, and either must still be able to
// delete.

import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from '@firebase/rules-unit-testing';
import { ref, uploadString, deleteObject, getBytes } from 'firebase/storage';

const PROJECT_ID = 'demo-arial';

const ALICE = 'alice';
const BOB = 'bob';

const attachment = (uid, name = 'photo.png') =>
  `users/${uid}/attachments/file1/block1/src/${name}`;

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199
    }
  });
});

after(async () => {
  await testEnv?.cleanup();
});

async function reset() {
  await testEnv.clearStorage();
}

// `claims` become custom claims on the issued token, which is how a full
// account is represented.
function storage(uid, claims) {
  return uid === null
    ? testEnv.unauthenticatedContext().storage()
    : testEnv.authenticatedContext(uid, claims).storage();
}

function seedObject(path) {
  return testEnv.withSecurityRulesDisabled((ctx) =>
    uploadString(ref(ctx.storage(), path), 'seeded')
  );
}

describe('prefix confinement', () => {
  it('lets an owner upload into their own prefix', async () => {
    await reset();
    await assertSucceeds(
      uploadString(ref(storage(ALICE), attachment(ALICE)), 'hello')
    );
  });

  it('refuses an upload into another account', async () => {
    await reset();
    await assertFails(
      uploadString(ref(storage(ALICE), attachment(BOB)), 'hello')
    );
  });

  it('refuses reading another account', async () => {
    await reset();
    await seedObject(attachment(BOB));
    await assertFails(getBytes(ref(storage(ALICE), attachment(BOB))));
  });

  it('refuses an upload outside the users prefix entirely', async () => {
    await reset();
    await assertFails(uploadString(ref(storage(ALICE), 'public/free.bin'), 'hello'));
  });

  it('refuses a signed-out client', async () => {
    await reset();
    await seedObject(attachment(ALICE));
    await assertFails(uploadString(ref(storage(null), attachment(ALICE)), 'hello'));
    await assertFails(getBytes(ref(storage(null), attachment(ALICE))));
  });
});

describe('the storage ceiling', () => {
  // The claim is absent, not false, while an account is under its limit — so
  // this is the case that proves `request.auth.token.storageFull != true`
  // reads correctly on a token that has never carried the claim.
  it('allows an upload when the token carries no quota claim', async () => {
    await reset();
    await assertSucceeds(
      uploadString(ref(storage(ALICE, {}), attachment(ALICE)), 'hello')
    );
  });

  it('allows an upload when the claim says the account is under', async () => {
    await reset();
    await assertSucceeds(
      uploadString(
        ref(storage(ALICE, { storageFull: false }), attachment(ALICE)),
        'hello'
      )
    );
  });

  it('refuses an upload once the account is full', async () => {
    await reset();
    await assertFails(
      uploadString(
        ref(storage(ALICE, { storageFull: true }), attachment(ALICE)),
        'hello'
      )
    );
  });

  it('refuses overwriting an existing object once full', async () => {
    await reset();
    await seedObject(attachment(ALICE));
    await assertFails(
      uploadString(
        ref(storage(ALICE, { storageFull: true }), attachment(ALICE)),
        'replacement'
      )
    );
  });

  // Deleting is the only way out of a full account. If the ceiling covered
  // deletes too, filling your storage would be permanent.
  it('still allows deleting when full', async () => {
    await reset();
    await seedObject(attachment(ALICE));
    await assertSucceeds(
      deleteObject(ref(storage(ALICE, { storageFull: true }), attachment(ALICE)))
    );
  });

  it('still allows reading when full', async () => {
    await reset();
    await seedObject(attachment(ALICE));
    await assertSucceeds(
      getBytes(ref(storage(ALICE, { storageFull: true }), attachment(ALICE)))
    );
  });

  // Being full is not a way into someone else's account.
  it('does not let a full account write into another one', async () => {
    await reset();
    await assertFails(
      uploadString(
        ref(storage(ALICE, { storageFull: true }), attachment(BOB)),
        'hello'
      )
    );
  });
});
