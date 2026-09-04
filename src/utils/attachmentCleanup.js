// Which of an account's stored attachments no longer belong to anything.
//
// Deleting an image block never removed its upload. Attachments were only
// cleaned up when a whole folder was deleted, so a picture taken out of a note
// stayed in the bucket for good — invisible, and charged for ever. That was
// tolerable while storage was free. It is not tolerable when storage is the
// thing being sold: people would pay for pictures they deleted, and since
// deleting is the only way out of a full account, the way out did not work.
//
// Pure, like syncRules.js: what counts as an orphan is decided here, and the
// walking and removing happens at the call site.

// Single Note's background images are uploaded under a block id that no block
// has, because they live in modeSettings rather than on a block. Nothing in
// `blocks` will ever mention it, so without this it looks like an orphan on
// every single save and the user's background quietly disappears.
export const MODE_SETTINGS_BLOCK_ID = 'mode-settings';

/**
 * Whether a value is safe to put in a storage path as one segment.
 *
 * Empty is the dangerous one, again. `attachments/${fileId}/${blockId}` with a
 * blank blockId addresses every attachment in the folder, and with a blank
 * fileId every attachment the account owns — and the caller here is a delete.
 * The relative segments are refused for the same reason: `..` would climb out
 * of the prefix the path was supposed to confine it to.
 */
export function isSafeStorageSegment(segment) {
  return typeof segment === 'string'
    && segment.length > 0
    && !segment.includes('/')
    && segment !== '.'
    && segment !== '..';
}

/**
 * The block folders in storage that no live block accounts for.
 *
 * Deliberately compared against what storage actually holds rather than
 * against a list of deletions remembered as they happened. Remembering is
 * wrong in both directions: an undo puts a block back and the memory still
 * says to delete it, and a redo takes it away again without the memory
 * noticing. Storage is the thing being corrected, so storage is what gets
 * asked.
 */
export function orphanedAttachmentIds(storedBlockIds = [], keepBlockIds = []) {
  const keep = new Set([MODE_SETTINGS_BLOCK_ID]);
  for (const id of keepBlockIds) {
    if (id) keep.add(String(id));
  }

  return storedBlockIds.filter(
    id => isSafeStorageSegment(id) && !keep.has(id)
  );
}
