# Storage Refactor Notes

Current pain points in the storage layer, and candidate directions for addressing them. This is a description of the problems, not a decided plan — each direction needs its own design before implementation.

---

## Current pain points

### 1. localStorage sprawl

All keys live in one flat namespace with no grouping:

```
blockTheme
blockThemeId
customThemes
controlColors
lastLoadedSave
bootLoadGuard
autoSyncEnabled
cloudSyncMemoryByFile
birthdayModeAccess
rightControlsOpen
habitTrackerData
```

No distinction between settings, sync state, UI state, and mode data. Any call to `localStorage.clear()` (e.g. "reset app") wipes everything indiscriminately. New keys are added ad hoc with no registry.

### 2. No settings schema

Themes, colors, and feature flags are stored as raw JSON strings. There is no validation layer — a corrupted or missing key silently produces `null` or a parse error at read time. No defaults are enforced centrally.

### 3. Sync state mixed with app settings

`cloudSyncMemoryByFile` and `autoSyncEnabled` live alongside theme preferences. Sync state has a different lifecycle from settings (it changes frequently, is user-account-scoped, and should survive a settings reset) but is treated identically by localStorage.

### 4. Habit tracker bypasses storage abstraction

`HabitTrackerMode.svelte` reads and writes `habitTrackerData` directly to localStorage, with no storage service in between. This means habit data is invisible to any future storage abstraction, can't be synced, and can't be migrated without touching the component.

### 5. `block-files` key scheme has no indexing

Attachment keys are constructed as plain strings: `{saveName}/{blockId}/{field}.{ext}`. There is no secondary index on `saveName` or `blockId`, so operations like "delete all attachments for a save" require a full store scan and string prefix matching. As the number of saves and attachments grows, this becomes expensive.

### 6. No versioned migration path for IndexedDB

The database is at version 2. There is no documented or automated migration runner for schema changes. Adding a new store or changing a field structure currently requires manually bumping the version and writing an ad hoc `onupgradeneeded` handler in `storage.js`.

---

## Candidate directions

These are options, not decisions. Each one involves trade-offs worth discussing before committing.

### A. Namespace localStorage keys

Group keys with a prefix or separate them into logical buckets:

```
settings.blockTheme
settings.blockThemeId
settings.customThemes
settings.controlColors

sync.autoSyncEnabled
sync.cloudSyncMemoryByFile

ui.lastLoadedSave
ui.rightControlsOpen

feature.birthdayModeAccess
mode.habitTrackerData
```

Low-effort change; improves clarity and enables selective resets. Requires a one-time migration pass on first launch to rename existing keys.

### B. Extract a `SettingsStore` abstraction

A thin wrapper over localStorage that owns the key registry, applies defaults on read, and validates on write. Components call `settingsStore.get('blockTheme')` instead of `JSON.parse(localStorage.getItem('blockTheme'))`.

Centralizes defaults and error handling. Does not require changing the underlying storage medium.

### C. Move sync state to IndexedDB

`cloudSyncMemoryByFile` and `autoSyncEnabled` would live in a new `sync-state` object store in IndexedDB instead of localStorage. This makes sync state survive `localStorage.clear()` and puts it under the same backup/restore path as block data.

Adds a small async overhead to reads that are currently synchronous.

### D. Add a compound index to `block-files`

Replace the string-keyed `block-files` store with a structured schema and add a compound index on `[saveName, blockId]`. This would make "get all files for save X" and "delete all files for block Y" efficient queries instead of full scans.

Requires an IndexedDB schema migration (version bump + `onupgradeneeded` handler).

### E. Versioned migration runner

A small `runMigrations(db, oldVersion, newVersion)` function called inside `onupgradeneeded`. Each version step is an explicit, tested function. Makes future schema changes safe and auditable.

Low risk, high value — worth doing before any structural IndexedDB change (C or D above).

### F. Bring habit tracker data into IndexedDB

Move `habitTrackerData` out of localStorage and into a dedicated `mode-data` object store in IndexedDB (or fold it into the save file envelope under `modeSettings`). This makes it syncable, backupable, and managed by the same abstraction as everything else.

Requires deciding whether habit data is per-save or global.
