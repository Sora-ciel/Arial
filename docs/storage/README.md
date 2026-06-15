# Storage Overview

Codex uses three distinct storage layers, each with a different scope and lifetime.

```
┌─────────────────────────────────────────────────────────────┐
│                        APPLICATION                          │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  IndexedDB   │   │ localStorage │   │    Firebase    │  │
│  │  (primary)   │   │  (settings)  │   │  (cloud sync)  │  │
│  └──────┬───────┘   └──────┬───────┘   └───────┬────────┘  │
│         │                  │                   │           │
│   Block data &       App settings,       Remote copies     │
│   file attachments   sync state, UI      of saves +        │
│   (per save file)    preferences         attachments       │
└─────────────────────────────────────────────────────────────┘
```

## Layers at a glance

| Layer | What it owns | Persists across | Optional |
|-------|-------------|-----------------|----------|
| IndexedDB | Save files (blocks, layouts, attachments) | Sessions, browser restarts | No |
| localStorage | Settings, sync state, UI state | Sessions, browser restarts | No |
| Firebase | Cloud copies of saves + binary attachments | Devices, accounts | Yes (requires login) |

## Layer responsibilities

### IndexedDB — `codex-db` (v2)
The source of truth for all user content. Stores structured block data and large binary attachments separately for performance. Everything the user creates or edits lands here first.

### localStorage
Flat key-value store for lightweight state that doesn't belong in a save file: theme preferences, feature flags, crash recovery guards, and cloud sync bookkeeping. No schema enforcement — raw JSON strings.

### Firebase (optional)
Provides cross-device sync when the user is logged in. Realtime Database holds save file metadata and block payloads (with file references instead of raw binaries). Cloud Storage holds the actual attachment blobs. Firebase is additive — the app works fully offline without it.

## Further reading

- [data-types.md](data-types.md) — full catalog of every stored key/schema, grouped by layer
- [pipeline.md](pipeline.md) — read/write flow diagrams, auto-sync tick logic, conflict resolution
- [refactor-notes.md](refactor-notes.md) — current pain points and candidate directions for the storage refactor
