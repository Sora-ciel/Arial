import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tracksWithPendingWork } from '../src/utils/playlistMerge.js';

const track = (id, extra = {}) => ({ id, title: id, ...extra });

describe('tracksWithPendingWork', () => {
  it('shows the committed library when nothing is in flight', () => {
    const committed = [track('a'), track('b')];
    assert.deepEqual(tracksWithPendingWork(committed).map(t => t.id), ['a', 'b']);
  });

  // The point of the whole thing: a file copied a second ago is listed and
  // playable without waiting for the last one.
  it('shows tracks that have been copied but not saved yet', () => {
    const out = tracksWithPendingWork([track('a')], [track('b'), track('c')]);
    assert.deepEqual(out.map(t => t.id), ['a', 'b', 'c']);
  });

  // The overlay and the library overlap the instant a commit lands, so this is
  // the normal case rather than a rare one.
  it('never lists the same track twice when a commit has just landed', () => {
    const out = tracksWithPendingWork([track('a'), track('b')], [track('b'), track('c')]);
    assert.deepEqual(out.map(t => t.id), ['a', 'b', 'c']);
  });

  it('prefers the committed copy of a track the overlay also holds', () => {
    const out = tracksWithPendingWork(
      [track('a', { title: 'committed' })],
      [track('a', { title: 'stale overlay' })]
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 'committed');
  });

  it('shows tags as they are read, before they are saved', () => {
    const scanned = new Map([['a', track('a', { artist: 'Someone' })]]);
    const out = tracksWithPendingWork([track('a'), track('b')], [], scanned);

    assert.equal(out[0].artist, 'Someone');
    assert.equal(out[1].artist, undefined);
  });

  // A scan revises tracks that are already committed; it must not resurrect
  // one that has since been deleted from the library.
  it('does not bring back a track that was deleted while scanning', () => {
    const scanned = new Map([['gone', track('gone', { artist: 'X' })]]);
    const out = tracksWithPendingWork([track('a')], [], scanned);

    assert.deepEqual(out.map(t => t.id), ['a']);
  });

  it('keeps the committed order and appends what is new', () => {
    const out = tracksWithPendingWork(
      [track('a'), track('b'), track('c')],
      [track('d')]
    );
    assert.deepEqual(out.map(t => t.id), ['a', 'b', 'c', 'd']);
  });

  it('handles both kinds of pending work at once', () => {
    const scanned = new Map([['a', track('a', { artist: 'Read' })]]);
    const out = tracksWithPendingWork([track('a')], [track('b')], scanned);

    assert.deepEqual(out.map(t => t.id), ['a', 'b']);
    assert.equal(out[0].artist, 'Read');
  });

  it('copes with missing or malformed input rather than throwing', () => {
    assert.deepEqual(tracksWithPendingWork(), []);
    assert.deepEqual(tracksWithPendingWork(null, null, null), []);
    assert.deepEqual(tracksWithPendingWork(undefined, [track('a')]).map(t => t.id), ['a']);
    assert.deepEqual(
      tracksWithPendingWork([track('a'), null], [null]).map(t => t && t.id),
      ['a', null]
    );
  });

  it('does not mutate what it was given', () => {
    const committed = [track('a')];
    const added = [track('b')];
    tracksWithPendingWork(committed, added);

    assert.equal(committed.length, 1);
    assert.equal(added.length, 1);
  });
});
