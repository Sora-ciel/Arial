# Data Flow & Sync Pipeline

How data moves through the storage layers — from user interaction to persistence, and back.

---

## Local write path

Every block edit goes through the same pipeline:

```
User edit
  └─ updateBlockHandler()         [App.svelte]
       └─ snapshot to history[]   (in-memory undo stack)
       └─ persistAutosave()
            └─ saveBlocks()       [storage.js]
                 └─ preparePersistedPayload()
                      ├─ extract large fields (src, content, trackUrl, tasks)
                      │    └─ write each to `block-files` store
                      │         key: {saveName}/{blockId}/{field}.{ext}
                      └─ write envelope (with __fileRefs) to `blocks` store
```

`preparePersistedPayload()` separates large binary/text fields from the block record before writing to IndexedDB. The main record gets `__fileRefs` pointers; the actual data goes into `block-files`. This keeps the `blocks` store lean and avoids re-serializing large payloads on every change.

---

## Local read path

```
loadBlocks(name)                  [storage.js]
  └─ read envelope from `blocks` store
  └─ hydratePayload()
       └─ for each block with __fileRefs:
            └─ fetch each referenced file from `block-files` store
            └─ reconstruct full block with all fields populated
  └─ return complete Block[]
```

---

## Cloud upload path

Triggered manually or by the auto-sync upload tick (every 10 seconds when auto-sync is on).

```
uploadAllLocalToCloud()           [firebaseClient.js]
  └─ loadBlocks() from IndexedDB  (get current local state)
  └─ uploadBlockAttachments()
       └─ for each block with binary src/files:
            └─ upload Blob to Firebase Storage
                 path: users/{uid}/attachments/{fileId}/{blockId}/{field}/{ts}.{ext}
            └─ replace field with Storage URL, add __fileRefs entry
  └─ saveRemoteFile()
       └─ write payload to Realtime DB
            path: /sync/{namespace}/users/{uid}/{filename}
  └─ rememberCloudSyncForFile()
       └─ update cloudSyncMemoryByFile in localStorage
            { [filename]: { lastSyncedAt: now } }
```

Before uploading, `buildLocalSyncFingerprint()` compares `updatedAt` timestamps against `cloudSyncMemoryByFile`. If the fingerprint matches (no local changes since last sync), the upload is skipped.

---

## Cloud download path

Auto-sync download tick runs every **1 second** when auto-sync is on.

```
autoSyncDownloadTick (1s interval)
  └─ pullRemoteUpdatesIfNeeded()  [firebaseClient.js]
       └─ loadRemoteIndex()
            └─ fetch file list from Realtime DB
       └─ for each remote file:
            └─ compare remote modifiedAt vs local modifiedAt
            └─ if remote is newer:
                 └─ loadRemoteFile()
                 └─ saveBlocks() locally (writes to IndexedDB)
                 └─ remountCurrentSaveIfLoaded()
                      └─ if this file is currently open → reload it in the UI
```

**Conflict resolution: last-write-wins on `modifiedAt`.**  
There is no three-way merge. The side with the higher `modifiedAt` timestamp wins. This means concurrent edits on two devices will silently discard the older write.

---

## Bootstrap policy (first login)

Runs once via `bootstrapCloudSync()` after the user authenticates:

```
if cloud has no files:
  → upload all local save files to Firebase

if cloud has files:
  → cloud is source of truth
  → download all remote files, overwrite local copies
```

---

## Undo / redo

Undo state lives entirely in memory — it is not persisted separately.

```
history: string[]   (array of JSON-serialized block snapshots, in App.svelte)

On edit:
  └─ clone current blocks state
  └─ compare to last snapshot (by historyTriggers fields)
  └─ if changed → push snapshot to history[]
  └─ bump _version on affected blocks
  └─ call persistAutosave() → write latest state to IndexedDB

On undo:
  └─ pop snapshot from history[]
  └─ restore blocks state from snapshot
  └─ call persistAutosave() → overwrite IndexedDB with restored state
```

The `_version` counter on each block is used to detect stale state when restoring snapshots, preventing partial or out-of-order restores.

---

## Crash recovery

```
On every load attempt:
  └─ set bootLoadGuard = { file, timestamp } in localStorage

On successful load:
  └─ clear bootLoadGuard

On next boot:
  └─ if bootLoadGuard is present → crash was detected for that file
       └─ defer auto-load, show warning to user
       └─ Shift+key at startup → safe mode (skips auto-load entirely)
```

This prevents a corrupted save from crashing the app on every launch.

---

## Settings writes

Settings are written directly to localStorage from wherever they are changed — there is no central settings store or write pipeline.

| Setting | Written from |
|---------|-------------|
| `blockTheme`, `blockThemeId`, `customThemes`, `controlColors` | `RightControls.svelte` |
| `lastLoadedSave` | `App.svelte` |
| `bootLoadGuard` | `App.svelte` |
| `autoSyncEnabled` | `App.svelte` |
| `cloudSyncMemoryByFile` | `firebaseClient.js` |
| `rightControlsOpen` | `RightControls.svelte` |
| `habitTrackerData` | `HabitTrackerMode.svelte` |
