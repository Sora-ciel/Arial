export const KNOWN_MODES = ['default', 'simple'];

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

export function cloneModeOrders(orders = {}) {
  const clone = {};
  for (const [modeName, order] of Object.entries(orders || {})) {
    clone[modeName] = Array.isArray(order) ? [...order] : [];
  }
  return clone;
}
