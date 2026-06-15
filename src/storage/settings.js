import { IndexedDBDriver } from './driver.js';

const driver = new IndexedDBDriver();

// Default values and localStorage parse rules (used only during migration)
const KNOWN_KEYS = {
  blockTheme:            { parse: 'json',   default: null },
  blockThemeId:          { parse: 'string', default: null },
  customThemes:          { parse: 'json',   default: [] },
  controlColors:         { parse: 'json',   default: null },
  lastLoadedSave:        { parse: 'string', default: null },
  bootLoadGuard:         { parse: 'json',   default: null },
  cloudSyncMemoryByFile: { parse: 'json',   default: {} },
  autoSyncEnabled:       { parse: 'bool',   default: true },
  birthdayModeAccess:    { parse: 'number', default: 0 },
  rightControlsOpen:     { parse: 'json',   default: null },
  habitTrackerData:      { parse: 'json',   default: [] },
  fileExplorerViewMode:  { parse: 'string', default: 'list' },
  fileExplorerThumbSize: { parse: 'number', default: 192 }
};

let migrationPromise = null;

async function ensureMigrated() {
  if (!migrationPromise) {
    migrationPromise = _migrate();
  }
  return migrationPromise;
}

async function _migrate() {
  const already = await driver.read('settings/migrated');
  if (already) return;

  if (typeof localStorage !== 'undefined') {
    for (const [key, config] of Object.entries(KNOWN_KEYS)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) continue;

        let value;
        if (config.parse === 'json') {
          value = JSON.parse(raw);
        } else if (config.parse === 'bool') {
          value = raw === 'true';
        } else if (config.parse === 'number') {
          const n = Number(raw);
          value = Number.isFinite(n) ? n : config.default;
        } else {
          value = raw;
        }

        if (value !== null && value !== undefined) {
          await driver.write(`settings/${key}`, value);
        }
      } catch {
        // skip malformed values
      }
    }
  }

  await driver.write('settings/migrated', { timestamp: Date.now() });
}

export async function readSetting(key) {
  await ensureMigrated();
  const value = await driver.read(`settings/${key}`);
  return value ?? (KNOWN_KEYS[key]?.default ?? null);
}

export async function writeSetting(key, value) {
  await ensureMigrated();
  if (value === null || value === undefined) {
    await driver.delete(`settings/${key}`);
  } else {
    await driver.write(`settings/${key}`, value);
  }
}

export async function deleteSetting(key) {
  await ensureMigrated();
  await driver.delete(`settings/${key}`);
}

export async function readAllSettings() {
  await ensureMigrated();
  const keys = Object.keys(KNOWN_KEYS);
  const values = await Promise.all(keys.map(k => driver.read(`settings/${k}`)));
  const result = {};
  for (let i = 0; i < keys.length; i++) {
    if (values[i] !== null && values[i] !== undefined) {
      result[keys[i]] = values[i];
    }
  }
  return result;
}

export async function writeAllSettings(settings) {
  await ensureMigrated();
  for (const [key, value] of Object.entries(settings || {})) {
    if (!KNOWN_KEYS[key] || value === null || value === undefined) continue;
    await driver.write(`settings/${key}`, value);
  }
}
