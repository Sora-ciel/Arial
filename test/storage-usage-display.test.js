import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatBytes,
  describeStorageUsage,
  storageMessageFor
} from '../src/utils/storageUsage.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe('formatBytes', () => {
  it('reads as a person would write it', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.equal(formatBytes(1.44 * MB), '1.4 MB');
    assert.equal(formatBytes(5 * GB), '5 GB');
  });

  it('does not show a fraction of a byte', () => {
    assert.equal(formatBytes(1500), '1.5 KB');
    assert.equal(formatBytes(999), '999 B');
  });

  it('treats nonsense as nothing rather than showing NaN', () => {
    assert.equal(formatBytes(undefined), '0 B');
    assert.equal(formatBytes(null), '0 B');
    assert.equal(formatBytes(-5), '0 B');
    assert.equal(formatBytes('banana'), '0 B');
  });
});

describe('describeStorageUsage', () => {
  it('describes an ordinary account', () => {
    const out = describeStorageUsage({ bytes: 10 * MB, limit: 100 * MB, full: false });

    assert.equal(out.state, 'ok');
    assert.equal(out.percent, 10);
    assert.equal(out.label, '10 MB of 100 MB');
  });

  // The warning has to arrive before the wall does, or the first anyone hears
  // about a limit is an upload that failed.
  it('warns before the ceiling rather than at it', () => {
    assert.equal(describeStorageUsage({ bytes: 79 * MB, limit: 100 * MB }).state, 'ok');
    assert.equal(describeStorageUsage({ bytes: 85 * MB, limit: 100 * MB }).state, 'nearly');
  });

  // Trusts the server's flag: bytes and verdict are written together, and the
  // flag is what the token and the rules agree on. A UI deciding for itself
  // could say "fine" while uploads were being refused.
  it('believes the server when it says full', () => {
    const out = describeStorageUsage({ bytes: 1, limit: 100 * MB, full: true });
    assert.equal(out.state, 'full');
  });

  it('is full at the limit even without the flag', () => {
    assert.equal(describeStorageUsage({ bytes: 100 * MB, limit: 100 * MB }).state, 'full');
  });

  // A null limit is how the database stores "no ceiling", since Infinity is
  // not JSON. Read as a number it would be zero, and every unlimited account
  // would show as permanently full.
  it('reads a null ceiling as unlimited, not as zero', () => {
    const out = describeStorageUsage({ bytes: 900 * GB, limit: null, full: false });

    assert.equal(out.state, 'unlimited');
    assert.equal(out.limit, null);
    assert.equal(out.label, '900 GB used');
  });

  it('copes with no record at all, which is every account before its first upload', () => {
    const out = describeStorageUsage(undefined);
    assert.equal(out.used, '0 B');
    assert.notEqual(out.state, 'full');
  });

  it('never reports more than a full bar', () => {
    assert.equal(describeStorageUsage({ bytes: 500 * MB, limit: 100 * MB }).percent, 100);
  });
});

describe('storageMessageFor', () => {
  it('says nothing when there is nothing to say', () => {
    assert.equal(storageMessageFor({ bytes: 1 * MB, limit: 100 * MB }), '');
  });

  it('warns as the limit approaches', () => {
    assert.match(storageMessageFor({ bytes: 90 * MB, limit: 100 * MB }), /nearly full/i);
  });

  // Says what to do, and says what still works — the notes themselves keep
  // syncing, and someone who thinks everything has stopped panics.
  it('explains the way out when full', () => {
    const message = storageMessageFor({ bytes: 100 * MB, limit: 100 * MB, full: true });

    assert.match(message, /delete/i);
    assert.match(message, /keeps syncing/i);
  });

  it('never nags an unlimited account', () => {
    assert.equal(storageMessageFor({ bytes: 900 * GB, limit: null }), '');
  });
});
