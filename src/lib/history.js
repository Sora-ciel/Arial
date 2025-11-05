import { applyHistoryTriggers } from './blockDefaults.js';
import { ensureModeOrders, cloneModeOrders } from './modeOrders.js';

/**
 * Duplicate the block array while keeping nested objects (like position and
 * size) separate. We optionally bump the `_version` field to force Svelte to
 * re-render components that rely on it.
 */
function cloneBlocks(blockList, { bumpVersion }) {
  return blockList.map(block => ({
    ...block,
    _version: bumpVersion ? (block._version || 0) + 1 : block._version ?? 0,
    position: { ...block.position },
    size: { ...block.size }
  }));
}

/**
 * Clone the entire editor state (blocks and mode orders). This is mainly used
 * for snapshotting undo history and for exporting/importing saves.
 */
export function cloneState(blockList, orders, { bumpVersion = true } = {}) {
  const normalizedOrders = ensureModeOrders(blockList, orders);
  const blocksClone = cloneBlocks(blockList, { bumpVersion });

  return {
    blocks: blocksClone,
    modeOrders: cloneModeOrders(normalizedOrders)
  };
}

/**
 * Turn the current state into a JSON string. Consumers can opt-out of bumping
 * versions when they just want to compare snapshots.
 */
export function serializeState(blockList, orders, { bumpVersion = false } = {}) {
  const snapshot = cloneState(blockList, orders, { bumpVersion });
  return JSON.stringify(snapshot);
}

/**
 * When blocks are loaded from disk we run them through this helper to ensure
 * every block is ready for the live editor (history triggers, version number,
 * etc.).
 */
export function hydrateImportedBlocks(blocks = []) {
  return blocks.map(block => ({
    ...applyHistoryTriggers(block),
    _version: 0
  }));
}

/**
 * Convert a stored history snapshot back into live state. We clone everything
 * so undo/redo never mutates the snapshot arrays in-place.
 */
export function parseHistorySnapshot(serializedSnapshot) {
  if (!serializedSnapshot) {
    return { blocks: [], modeOrders: {} };
  }

  const snapshotState = JSON.parse(serializedSnapshot) || {};
  const snapshotBlocks = cloneBlocks(snapshotState.blocks || [], {
    bumpVersion: true
  });
  const snapshotOrders = ensureModeOrders(
    snapshotBlocks,
    snapshotState.modeOrders
  );

  return {
    blocks: [...snapshotBlocks],
    modeOrders: cloneModeOrders(snapshotOrders)
  };
}
