import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MODE_SETTINGS_BLOCK_ID,
  isSafeStorageSegment,
  orphanedAttachmentIds
} from '../src/utils/attachmentCleanup.js';

describe('isSafeStorageSegment', () => {
  it('accepts an ordinary block id', () => {
    assert.equal(isSafeStorageSegment('block-42'), true);
  });

  // The caller is a delete, and `attachments/${fileId}/${blockId}` with a
  // blank blockId addresses every attachment in the folder.
  it('refuses an empty segment', () => {
    assert.equal(isSafeStorageSegment(''), false);
  });

  it('refuses a segment that would climb out of its prefix', () => {
    assert.equal(isSafeStorageSegment('..'), false);
    assert.equal(isSafeStorageSegment('.'), false);
    assert.equal(isSafeStorageSegment('a/b'), false);
  });

  it('refuses anything that is not a string', () => {
    assert.equal(isSafeStorageSegment(undefined), false);
    assert.equal(isSafeStorageSegment(null), false);
    assert.equal(isSafeStorageSegment(7), false);
  });
});

describe('orphanedAttachmentIds', () => {
  it('finds a folder no live block accounts for', () => {
    assert.deepEqual(
      orphanedAttachmentIds(['b1', 'b2', 'b3'], ['b1', 'b3']),
      ['b2']
    );
  });

  it('finds nothing when every folder is still in use', () => {
    assert.deepEqual(orphanedAttachmentIds(['b1', 'b2'], ['b1', 'b2']), []);
  });

  it('finds nothing in an empty account', () => {
    assert.deepEqual(orphanedAttachmentIds([], []), []);
    assert.deepEqual(orphanedAttachmentIds(undefined, undefined), []);
  });

  // Single Note backgrounds live in modeSettings, not on a block, so nothing
  // in `blocks` ever mentions them. Without the exemption they look orphaned
  // on every save and the background quietly disappears.
  it('never treats the mode-settings folder as an orphan', () => {
    assert.deepEqual(
      orphanedAttachmentIds([MODE_SETTINGS_BLOCK_ID, 'b1'], []),
      ['b1']
    );
  });

  it('keeps every block that is still present, even with none deleted', () => {
    const ids = ['b1', 'b2', 'b3'];
    assert.deepEqual(orphanedAttachmentIds(ids, ids), []);
  });

  // A stray folder with an unusable name is left alone rather than guessed at:
  // it cannot be addressed safely, and the alternative to skipping it is a
  // delete aimed at the wrong path.
  it('leaves a folder it could not address safely alone', () => {
    assert.deepEqual(orphanedAttachmentIds(['', '..', 'b9'], []), ['b9']);
  });

  it('copes with block ids that are numbers', () => {
    assert.deepEqual(orphanedAttachmentIds(['1', '2'], [1]), ['2']);
  });

  // The case that matters most: everything is gone from the note, so
  // everything but the background should go from storage.
  it('clears out a note whose blocks were all deleted', () => {
    assert.deepEqual(
      orphanedAttachmentIds(['b1', 'b2', MODE_SETTINGS_BLOCK_ID], []),
      ['b1', 'b2']
    );
  });
});
