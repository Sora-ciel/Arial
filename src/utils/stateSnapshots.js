import { ensureModeOrders, cloneModeOrders } from './modeOrders';

export function cloneState(blockList, orders, { bumpVersion = true } = {}) {
  const normalizedOrders = ensureModeOrders(blockList, orders);
  const blocksClone = blockList.map(block => ({
    ...block,
    _version: bumpVersion ? (block._version || 0) + 1 : block._version ?? 0,
    position: { ...block.position },
    size: { ...block.size }
  }));

  return {
    blocks: blocksClone,
    modeOrders: cloneModeOrders(normalizedOrders)
  };
}

export function serializeState(blockList, orders, { bumpVersion = false } = {}) {
  const snapshot = cloneState(blockList, orders, { bumpVersion });
  return JSON.stringify(snapshot);
}
