const FILE_EXPLORER_PATH = 'content/File_explorer.json';

export async function readFileExplorer(driver) {
  return (await driver.read(FILE_EXPLORER_PATH)) || {};
}

export async function writeFileExplorer(driver, registry) {
  await driver.write(FILE_EXPLORER_PATH, registry);
}

export async function addEntry(driver, uuid, entry) {
  const registry = await readFileExplorer(driver);
  registry[uuid] = entry;
  await writeFileExplorer(driver, registry);
}

export async function updateUsedBy(driver, uuid, saveName, add) {
  const registry = await readFileExplorer(driver);
  if (!registry[uuid]) return;
  const usedBy = new Set(registry[uuid].usedBy || []);
  if (add) {
    usedBy.add(saveName);
  } else {
    usedBy.delete(saveName);
  }
  registry[uuid].usedBy = [...usedBy];
  await writeFileExplorer(driver, registry);
}

// ---- Global block colors ----
// _colors in File_explorer.json maps blockId → { bgColor, textColor, usedBy }.
// This makes colors shared across all modes by default. `usedBy` tracks which
// saves currently contain that block id (the same dedup pattern as content
// files' `usedBy`) — without it, deleting a save that was duplicated under
// another name (same block ids, different file name) would wipe the colors
// for the duplicate too, since they'd be keyed by the same block id.

export function getBlockColors(registry) {
  return registry._colors || {};
}

export function setBlockColor(registry, blockId, bgColor, textColor, saveName) {
  if (!registry._colors) registry._colors = {};
  const existing = registry._colors[blockId];
  const usedBy = new Set(existing?.usedBy || []);
  if (saveName) usedBy.add(saveName);
  registry._colors[blockId] = { bgColor, textColor, usedBy: [...usedBy] };
}

// Removes `saveName`'s claim on this block's color, deleting the entry only
// once no save references it anymore. Legacy entries saved before `usedBy`
// existed are left alone — we can't tell whether another save still depends
// on them, and leaving an unused color mapping behind is harmless, whereas
// wiping a still-used one (the original bug) is not.
export function removeBlockColorForSave(registry, blockId, saveName) {
  const entry = registry._colors?.[blockId];
  if (!entry) return;
  if (!Array.isArray(entry.usedBy)) return;
  const usedBy = new Set(entry.usedBy);
  usedBy.delete(saveName);
  if (usedBy.size === 0) {
    delete registry._colors[blockId];
  } else {
    entry.usedBy = [...usedBy];
  }
}
