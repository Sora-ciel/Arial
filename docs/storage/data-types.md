# Data Catalog

Every piece of data the app stores, grouped by layer. Use this as a reference before touching any persistence logic.

---

## IndexedDB — `codex-db` (v2)

Two object stores live inside a single database.

### `blocks` store — save file envelopes

Each entry is a named save file. The key is the save name (string).

```js
{
  blocks: Block[],
  modeOrders: {
    [modeName: string]: string[]  // ordered block IDs per mode
  },
  modeSettings: {
    simple: { columnCount: number }
  },
  updatedAt: number,    // timestamp of last auto-save
  modifiedAt: number    // timestamp of last user-triggered change
}
```

The `blocks` array contains the current state of all blocks. Large fields are extracted at save time and replaced with `__fileRefs` pointers (see `block-files` below).

### Block schema

```js
{
  id: string,           // UUID
  type: 'text' | 'cleantext' | 'image' | 'music' | 'embed' | 'task',
  content: string,
  src: string,          // data URL (images) or web URL (embeds)
  trackUrl: string,     // music blocks only
  title: string,
  tasks: Task[],        // task blocks only
  position: { x: number, y: number },
  size: { width: number, height: number },
  bgColor: string,      // hex
  textColor: string,    // hex
  _version: number,     // bumped on each undo snapshot
  historyTriggers: string[],

  // present when large fields were extracted to block-files:
  __fileRefs?: {
    [field: string]: {
      key: string,      // storage key in block-files store
      ext: string,
      encoding: 'binary' | 'json' | 'text',
      mime: string
    }
  }
}
```

### `block-files` store — binary/text attachments

Holds the large fields extracted from blocks. Each entry is a Blob or string.

**Key format:** `{saveName}/{blockId}/{field}.{ext}`

Examples:
- `my-save/abc123/src.png`
- `my-save/abc123/tasks.json`
- `my-save/abc123/trackUrl.txt`

Fields extracted: `src`, `content`, `trackUrl`, `title`, `tasks` (when above a size threshold).

---

## localStorage — flat key-value

No namespace or schema. All values are JSON-serialized strings.

### Theme & appearance

| Key | Type | Description |
|-----|------|-------------|
| `blockTheme` | object | CSS variables for block styling (borderColor, shadow, borderRadius, headerBg, …) |
| `blockThemeId` | string | ID of the currently selected theme |
| `customThemes` | Theme[] | Array of user-created themes |
| `controlColors` | object | Left/right panel and canvas background colors |

**Theme object shape:**
```js
{
  id: string,
  name: string,
  description: string,
  controlColors: {
    left:   { panelBg, textColor, buttonBg, buttonText, borderColor, inputBg },
    right:  { panelBg, textColor, buttonBg, buttonText, borderColor },
    canvas: { outerBg, innerBg }
  },
  blockTheme: { borderColor, shadow, borderRadius, headerBg, … },
  previewBg: string,
  createdAt?: number,
  isCustom?: boolean
}
```

### Session continuity

| Key | Type | Description |
|-----|------|-------------|
| `lastLoadedSave` | string | Filename of the last opened save, re-opened on next boot |
| `rightControlsOpen` | boolean | Whether the right panel was open when the app closed |

### Crash recovery

| Key | Type | Description |
|-----|------|-------------|
| `bootLoadGuard` | object | Set before loading a save file; cleared after successful load. If present on boot, a crash was detected. |

### Cloud sync state

| Key | Type | Description |
|-----|------|-------------|
| `autoSyncEnabled` | boolean | Whether auto-sync is active |
| `cloudSyncMemoryByFile` | `{ [filename]: { lastSyncedAt: number } }` | Per-file timestamp cache; used to skip unnecessary uploads when fingerprint matches |

### Feature flags / unlocks

| Key | Type | Description |
|-----|------|-------------|
| `birthdayModeAccess` | number | Expiry timestamp for the birthday mode unlock |

### Mode-specific data

| Key | Type | Description |
|-----|------|-------------|
| `habitTrackerData` | HabitEntry[] | Daily habit log; written directly by `HabitTrackerMode.svelte`, bypasses any storage abstraction |

---

## Firebase (optional, per-user)

Only populated when the user is logged in. Two Firebase products are used.

### Realtime Database

**Path:** `/sync/{namespace}/users/{uid}/`

Holds an index of save files and the save payloads themselves. Blocks are stored with `__fileRefs` instead of raw binary data (attachments live in Cloud Storage).

**Save file entry:**
```js
{
  blocks: Block[],       // __fileRefs in place of large binary fields
  modeOrders: { [modeName]: string[] },
  updatedAt: number,
  modifiedAt: number,
  lastSyncedAt: number   // timestamp of last successful sync
}
```

### Cloud Storage

**Path:** `users/{uid}/attachments/{fileId}/{blockId}/{field}/{timestamp}.{ext}`

Holds binary blobs referenced by `__fileRefs` in the Realtime DB payloads.

Each attachment upload creates a new timestamped path (old paths are not automatically cleaned up).
