import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { fileNameForMedia } from '../src/utils/downloadNaming.js';

const FIREBASE_URL =
  'https://firebasestorage.googleapis.com/v0/b/arial-473c1.firebasestorage.app/o/'
  + 'users%2Fabc%2Fattachments%2Ff1%2Fb1%2Fsrc%2Fholiday.jpg?alt=media&token=xyz';

describe('fileNameForMedia', () => {
  // The old code passed `download = "image"`, so a saved picture arrived with
  // no extension at all and the operating system had to guess what it was.
  it('always ends in an extension', () => {
    assert.match(fileNameForMedia({ url: FIREBASE_URL }), /\.[a-z0-9]+$/);
  });

  it('believes the content type over the URL', () => {
    const name = fileNameForMedia({ url: FIREBASE_URL, contentType: 'image/png' });
    assert.ok(name.endsWith('.png'), name);
  });

  it('copes with a content type carrying a charset', () => {
    const name = fileNameForMedia({ url: FIREBASE_URL, contentType: 'image/webp; charset=binary' });
    assert.ok(name.endsWith('.webp'), name);
  });

  // A Firebase download URL percent-encodes the object path, so the extension
  // is still in there once it is decoded.
  it('reads the extension out of a Firebase download URL', () => {
    const name = fileNameForMedia({ url: FIREBASE_URL });
    assert.ok(name.endsWith('.jpg'), name);
  });

  it('ignores the query string when looking for one', () => {
    const name = fileNameForMedia({ url: 'https://example.com/a/b.webp?x=.zip' });
    assert.ok(name.endsWith('.webp'), name);
  });

  it('falls back by media kind when nothing says otherwise', () => {
    assert.ok(fileNameForMedia({ url: 'https://example.com/signed/abc123' }).endsWith('.png'));
    assert.ok(
      fileNameForMedia({ url: 'https://example.com/signed/abc123', isVideo: true }).endsWith('.mp4')
    );
  });

  // The folder name goes in the filename, and folder names are user-typed.
  it('strips anything a file system would object to', () => {
    const name = fileNameForMedia({ url: FIREBASE_URL, fallbackBase: 'My Notes / 2026 *?' });
    assert.doesNotMatch(name, /[/\\?*:"<>|]/);
    assert.ok(name.startsWith('My-Notes-2026'), name);
  });

  it('never produces a name that is only an extension', () => {
    const name = fileNameForMedia({ url: FIREBASE_URL, fallbackBase: '///' });
    assert.ok(name.startsWith('arial-'), name);
  });

  it('keeps the name a sensible length', () => {
    const name = fileNameForMedia({ url: FIREBASE_URL, fallbackBase: 'x'.repeat(300) });
    assert.ok(name.length < 100, `too long: ${name.length}`);
  });

  it('copes with a malformed URL rather than throwing', () => {
    assert.doesNotThrow(() => fileNameForMedia({ url: 'https://example.com/%E0%A4%A' }));
    assert.doesNotThrow(() => fileNameForMedia({}));
    assert.doesNotThrow(() => fileNameForMedia());
  });
});
