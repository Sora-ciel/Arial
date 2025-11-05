import { KNOWN_MODES } from './blockDefaults.js';

/**
 * Ensure every mode has a full list of block ids in the desired order. When a
 * block is deleted or added we quietly sync the order arrays so consumers never
 * have to worry about missing ids.
 */
export function ensureModeOrders(allBlocks, incomingOrders = {}) {
  const idsInBlockOrder = allBlocks.map(block => block.id);
  const validIds = new Set(idsInBlockOrder);
  const modeNames = new Set([
    ...KNOWN_MODES,
    ...Object.keys(incomingOrders || {})
  ]);

  const normalized = {};
  for (const name of modeNames) {
    const existing = Array.isArray(incomingOrders?.[name])
      ? incomingOrders[name].filter(id => validIds.has(id))
      : [];
    const missing = idsInBlockOrder.filter(id => !existing.includes(id));
    normalized[name] = [...existing, ...missing];
  }

  return normalized;
}

/**
 * Create a deep-ish copy of the mode order object so calling code can mutate
 * the result without affecting the original reference.
 */
export function cloneModeOrders(orders = {}) {
  const clone = {};
  for (const [modeName, order] of Object.entries(orders)) {
    clone[modeName] = [...order];
  }
  return clone;
}
