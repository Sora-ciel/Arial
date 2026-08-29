// What may be synced, and what counts as a change.
//
// Every case here is a bug that reached a release. The comment above each group
// says which one, so that a failure tells you what broke rather than only that
// something did.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSyncableFileId,
  findEmbeddedDataUrls,
  payloadCarriesDataUrl,
  withoutEmptyValues
} from '../src/utils/syncRules.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// A folder with no name was uploaded on every change and the account answered
// PERMISSION_DENIED. The rejection was the lucky outcome: `files/${fileId}`
// with a blank id becomes `files/`, the trailing slash is stripped, and the
// write lands on the node holding every folder and replaces the lot.
test('a folder name the database cannot hold is never sent', async t => {
  await t.test('ordinary names are allowed', () => {
    for (const name of ['MyNotes', 'default', 'a folder with spaces', 'accentué', '2026 notes']) {
      assert.equal(isSyncableFileId(name), true, name);
    }
  });

  await t.test('a blank name is refused — it would overwrite every folder', () => {
    assert.equal(isSyncableFileId(''), false);
  });

  await t.test('every character a database key forbids is refused', () => {
    for (const name of ['notes.txt', 'a/b', 'x#1', '$cash', '[bracket]', 'a]b']) {
      assert.equal(isSyncableFileId(name), false, name);
    }
  });

  await t.test('a name that is not a string at all is refused', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      assert.equal(isSyncableFileId(value), false, String(value));
    }
  });
});

// A picture pasted into a text block was never recognised as an attachment,
// because only a value that was *nothing but* a data: URL ever was. Its base64
// went into the database inline, the write failed, and the upload loop
// abandoned every folder queued behind it.
test('a picture embedded in written text is found', async t => {
  await t.test('in a note, both quote styles', () => {
    assert.equal(findEmbeddedDataUrls(`<p>hi <img src="${PNG}"></p>`).length, 1);
    assert.equal(findEmbeddedDataUrls(`<p><img src='${PNG}'></p>`).length, 1);
  });

  await t.test('in a task, as markdown and as HTML', () => {
    // Tasks held markdown once and hold HTML now. Both shapes must be found:
    // when the editor changed, the markdown-only test silently stopped matching.
    assert.equal(findEmbeddedDataUrls(`do this ![](${PNG})`).length, 1);
    assert.equal(findEmbeddedDataUrls(`<p>do this <img src="${PNG}"></p>`).length, 1);
  });

  await t.test('with other attributes alongside it', () => {
    assert.equal(findEmbeddedDataUrls(`<img src="${PNG}" width="200" alt="x">`).length, 1);
  });

  await t.test('the URL comes back whole', () => {
    assert.equal(findEmbeddedDataUrls(`<img src="${PNG}">`)[0], PNG);
  });

  await t.test('the same picture twice is one upload', () => {
    assert.equal(findEmbeddedDataUrls(`<img src="${PNG}"><img src="${PNG}">`).length, 1);
  });

  await t.test('two different pictures are two', () => {
    const other = PNG.replace('iVBOR', 'AVBOR');
    assert.equal(findEmbeddedDataUrls(`<img src="${PNG}"><img src="${other}">`).length, 2);
  });

  await t.test('a link href counts too', () => {
    assert.equal(findEmbeddedDataUrls(`<a href="${PNG}">x</a>`).length, 1);
  });

  await t.test('a Storage link is left alone', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media';
    assert.equal(findEmbeddedDataUrls(`<img src="${url}">`).length, 0);
  });

  await t.test('ordinary writing is left alone', () => {
    assert.equal(findEmbeddedDataUrls('<p>just words, nothing pasted</p>').length, 0);
    assert.equal(findEmbeddedDataUrls(null).length, 0);
  });
});

// The last line of defence: whatever the caller believes about attachments, a
// payload still holding base64 must never be written to the database.
test('inline base64 anywhere in a payload is detected', async t => {
  await t.test('found however deeply it is buried', () => {
    assert.equal(payloadCarriesDataUrl({ blocks: [{ content: `<img src="${PNG}">` }] }), true);
    assert.equal(payloadCarriesDataUrl({ a: { b: { c: [{ d: PNG }] } } }), true);
    assert.equal(payloadCarriesDataUrl({ modeSettings: { single: { backgroundImage: PNG } } }), true);
  });

  await t.test('a payload holding only Storage links passes', () => {
    assert.equal(payloadCarriesDataUrl({ blocks: [{ content: '<img src="https://storage/x">' }] }), false);
  });

  await t.test('odd input never throws', () => {
    assert.equal(payloadCarriesDataUrl(null), false);
    assert.equal(payloadCarriesDataUrl(undefined), false);
    const cyclic = {}; cyclic.self = cyclic;
    assert.equal(payloadCarriesDataUrl(cyclic), false);
  });
});

// Two instances open on one account handed the folder back and forth every few
// seconds, remounting each time, with nobody editing. The database stores no
// empty list, so a folder uploaded with `tasks: []` came back without the
// field; loading put it back, the copy on disk then differed, and the save that
// followed stamped a new modifiedAt that the other instance read as an edit.
test('a cloud round trip does not look like an edit', async t => {
  const fingerprint = value => JSON.stringify(withoutEmptyValues(value) ?? {});

  await t.test('empty and absent are the same', () => {
    assert.equal(fingerprint({ id: 'b1', tasks: [] }), fingerprint({ id: 'b1' }));
    assert.equal(fingerprint({ id: 'b1', meta: {} }), fingerprint({ id: 'b1' }));
    assert.equal(fingerprint({ id: 'b1', note: null }), fingerprint({ id: 'b1' }));
  });

  await t.test('the same nesting the database drops', () => {
    assert.equal(fingerprint({ a: { b: [], c: {} } }), fingerprint({}));
    assert.equal(fingerprint({ blocks: [{ tasks: [] }] }), fingerprint({ blocks: [{}] }));
  });

  // The danger in folding empty together with absent is a real change being
  // skipped, so this is the half that matters most.
  await t.test('emptying a list is still a change', () => {
    assert.notEqual(
      fingerprint({ id: 'b1', tasks: [{ id: 't1' }] }),
      fingerprint({ id: 'b1', tasks: [] })
    );
  });

  await t.test('ordinary edits are still changes', () => {
    assert.notEqual(fingerprint({ content: 'one' }), fingerprint({ content: 'one two' }));
    assert.notEqual(fingerprint({ content: '' }), fingerprint({ content: 'x' }));
  });

  await t.test('values that merely look empty are kept', () => {
    // 0 and false are values the database stores, so they must survive.
    assert.equal(withoutEmptyValues({ n: 0 }).n, 0);
    assert.equal(withoutEmptyValues({ b: false }).b, false);
    assert.equal(withoutEmptyValues({ s: '' }).s, '');
  });
});
