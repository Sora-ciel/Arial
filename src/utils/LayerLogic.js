// src/utils/LayerLogic.js

/**
 * Reorder blocks to control layer order
 * @param {Array} blocks - the array of blocks
 * @param {string} blockId - the id of the block to move
 * @param {"up"|"down"|"top"|"bottom"} direction - move direction
 * @returns {Array} new reordered array
 */
export function moveBlock(blocks, blockId, direction) {
  const index = blocks.findIndex(b => b.id === blockId);
  if (index === -1) return blocks;

  const updated = [...blocks];
  const [moved] = updated.splice(index, 1);

  if (direction === "up" && index < updated.length) {
    updated.splice(index + 1, 0, moved);
  } else if (direction === "down" && index > 0) {
    updated.splice(index - 1, 0, moved);
  } else if (direction === "top") {
    updated.push(moved);
  } else if (direction === "bottom") {
    updated.unshift(moved);
  }

  return updated;
}
