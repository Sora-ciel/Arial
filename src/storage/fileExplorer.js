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
// _colors in File_explorer.json maps blockId → { bgColor, textColor }
// This makes colors shared across all modes by default.

export function getBlockColors(registry) {
  return registry._colors || {};
}

export function setBlockColor(registry, blockId, bgColor, textColor) {
  if (!registry._colors) registry._colors = {};
  registry._colors[blockId] = { bgColor, textColor };
}

export function removeBlockColor(registry, blockId) {
  if (registry._colors) delete registry._colors[blockId];
}
