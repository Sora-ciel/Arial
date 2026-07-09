<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import {
    listSavedBlocks, loadBlocks,
    createStandaloneNote, listStandaloneNotes,
    getNoteContent, setNoteContent, updateFileMeta, deleteContentFile
  } from '../storage.js';
  import TipTapEditor from '../components/TipTapEditor.svelte';
  import BlockContextMenu from '../components/BlockContextMenu.svelte';
  import { htmlToText } from '../utils/htmlToText.js';
  import { getReadableTextColor } from '../utils/readableColor.js';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  export let currentSaveName = '';
  export let singleNoteSettings = {};
  export let syncRevision = 0;

  // Per-file background image settings
  $: bgImage = singleNoteSettings?.backgroundImage || '';
  $: bgOpacity = singleNoteSettings?.bgOpacity ?? 0.35;
  $: bgBlur = singleNoteSettings?.bgBlur ?? 0;
  $: bgSize = singleNoteSettings?.bgSize || 'cover';
  let bgPanelOpen = false;

  function setBgSetting(patch) {
    dispatch('modeSettingChange', { single: patch });
  }
  function onBgFileChange(event) {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBgSetting({ backgroundImage: String(reader.result || '') });
    reader.readAsDataURL(file);
    event.target.value = '';
  }
  function clearBgImage() {
    setBgSetting({ backgroundImage: '' });
  }

  const dispatch = createEventDispatcher();

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: modeTextColor = getReadableTextColor(canvasTheme.innerBg);
  $: activeNoteBg = noteBlock?.bgColor || canvasTheme.innerBg;
  $: activeNoteText = noteBlock?.textColor || getReadableTextColor(activeNoteBg);
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor}; --active-note-bg: ${activeNoteBg}; --active-note-text: ${activeNoteText};`;

  $: noteBlocks = blocks.filter(
    block => block.type === 'text' || block.type === 'cleantext'
  );

  // Which kind of note is open in the editor: a block in the current folder,
  // or a standalone (unfiled) file from the global pool.
  let editingKind = 'block'; // 'block' | 'note'
  let selectedNoteId = null;       // current-folder block id
  let activeFileUuid = null;       // standalone note uuid
  let activeFileContent = '';      // standalone note content (loaded async)
  let noteSaveTimer = null;

  // Auto-select a freshly added note by tracking which IDs we've already seen.
  // Using a Set of IDs (vs a count) means a soft-reload that replaces blocks
  // in-place won't falsely trigger the auto-jump.
  let _knownNoteIds = new Set();
  $: {
    if (editingKind === 'block' && noteBlocks.length > 0) {
      const newIds = noteBlocks.filter(b => !_knownNoteIds.has(b.id));
      if (newIds.length === 1 && _knownNoteIds.size > 0) {
        // Exactly one genuinely new note arrived while the folder was already
        // loaded — this is the user adding a note on THIS instance.
        selectedNoteId = newIds[0].id;
      }
      _knownNoteIds = new Set(noteBlocks.map(b => b.id));
    } else if (noteBlocks.length === 0) {
      _knownNoteIds = new Set();
    }
  }
  $: if (editingKind === 'block' && !selectedNoteId && noteBlocks.length) {
    selectedNoteId = noteBlocks[0].id;
  }
  $: if (
    editingKind === 'block' &&
    selectedNoteId &&
    !noteBlocks.some(block => block.id === selectedNoteId)
  ) {
    selectedNoteId = noteBlocks[0]?.id ?? null;
  }
  $: noteBlock =
    editingKind === 'block'
      ? (noteBlocks.find(block => block.id === selectedNoteId) || null)
      : null;

  // When the folder changes, reset known-IDs so the first note in the new
  // folder is auto-selected cleanly without the "new note" jump logic firing.
  let _loadedSaveForIds = '';
  $: if (currentSaveName !== _loadedSaveForIds) {
    _knownNoteIds = new Set();
    _loadedSaveForIds = currentSaveName;
  }

  // The content shown in the editor (block content or standalone file content)
  $: editorContent = editingKind === 'note' ? activeFileContent : (noteBlock?.content ?? '');
  $: editorKey = editingKind === 'note' ? `note:${activeFileUuid}` : `block:${selectedNoteId}`;
  $: editorPlainText = htmlToText(editorContent);
  $: wordCount = countWords(editorPlainText);
  $: characterCount = editorPlainText.length;
  $: noteCount = noteBlocks.length;
  $: hasActiveNote = editingKind === 'note' ? !!activeFileUuid : !!noteBlock;

  // ── Sidebar state ────────────────────────────────────────────────
  let sidebarOpen = false;
  let sidebarSearch = '';
  let sidebarTagFilter = '';
  let otherFolderNotes = []; // [{saveName, blockId, title, preview, tags}]
  let standaloneNotes = []; // [{uuid, displayName, preview, tags, ...}]
  let loadingAll = false;
  let _loadedForSave = null;  // which currentSaveName otherFolderNotes was built for
  let editingTagsForId = null; // block id OR `file:<uuid>`
  let tagInputValue = '';

  function openSidebar() {
    sidebarOpen = true;
    refreshStandaloneNotes();
  }

  async function refreshStandaloneNotes() {
    try { standaloneNotes = await listStandaloneNotes(); } catch { standaloneNotes = []; }
  }

  // (Re)load the cross-folder note list whenever the sidebar is open and the
  // current folder changes — otherwise the old current folder lingers (showing
  // duplicates) and the new one never appears.
  $: if (sidebarOpen && currentSaveName !== _loadedForSave && !loadingAll) {
    loadAllFolderNotes();
  }

  // When a cloud sync pulls new data, refresh sidebar lists so new notes
  // from other devices appear without requiring the user to close+reopen.
  $: if (syncRevision && sidebarOpen) {
    refreshStandaloneNotes();
    _loadedForSave = null; // force other-folder list to reload too
  }

  async function loadAllFolderNotes() {
    loadingAll = true;
    const targetSave = currentSaveName;
    _loadedForSave = targetSave;
    try {
      const saves = await listSavedBlocks();
      const results = [];
      for (const saveName of saves) {
        if (saveName === targetSave) continue;
        try {
          const data = await loadBlocks(saveName);
          const bList = Array.isArray(data) ? data : (Array.isArray(data?.blocks) ? data.blocks : []);
          for (const b of bList) {
            if (b.type !== 'text' && b.type !== 'cleantext') continue;
            results.push({ saveName, blockId: b.id, title: getNoteFirstLine(b), preview: getNotePreview(b), tags: Array.isArray(b.tags) ? b.tags : [] });
          }
        } catch (_) {}
      }
      otherFolderNotes = results;
    } finally {
      loadingAll = false;
    }
  }

  function getNoteFirstLine(block) {
    const content = htmlToText(block?.content || '');
    const line = content.split('\n')[0]?.trim() || '';
    return line.length > 40 ? `${line.slice(0, 40)}…` : (line || 'Untitled');
  }

  function getNotePreview(block) {
    const content = htmlToText(block?.content || '');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return '';
    const preview = lines[1].trim();
    return preview.length > 50 ? `${preview.slice(0, 50)}…` : preview;
  }

  $: currentFolderItems = noteBlocks.map(b => ({
    kind: 'current',
    key: `block:${b.id}`,
    blockId: b.id,
    saveName: currentSaveName,
    title: getNoteFirstLine(b),
    preview: getNotePreview(b),
    tags: Array.isArray(b.tags) ? b.tags : []
  }));

  $: unfiledItems = standaloneNotes.map(n => ({
    kind: 'unfiled',
    key: `file:${n.uuid}`,
    uuid: n.uuid,
    title: n.displayName || 'Untitled note',
    preview: n.preview || '',
    tags: Array.isArray(n.tags) ? n.tags : []
  }));

  $: otherFolderItems = otherFolderNotes
    .filter(n => n.saveName !== currentSaveName)
    .map(n => ({
      kind: 'other',
      key: `other:${n.saveName}/${n.blockId}`,
      saveName: n.saveName,
      blockId: n.blockId,
      title: n.title,
      preview: n.preview,
      tags: Array.isArray(n.tags) ? n.tags : []
    }));

  // Current folder first, then unfiled notes, then everything else.
  $: allSidebarItems = [...currentFolderItems, ...unfiledItems, ...otherFolderItems];

  $: filteredItems = allSidebarItems.filter(item => {
    const q = sidebarSearch.toLowerCase();
    const tq = sidebarTagFilter.toLowerCase();
    const matchesText = !q || item.title.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q);
    const matchesTags = !tq || item.tags.some(t => t.toLowerCase().includes(tq));
    return matchesText && matchesTags;
  });

  function clickSidebarItem(item) {
    if (item.kind === 'current') {
      editingKind = 'block';
      selectedNoteId = item.blockId;
    } else if (item.kind === 'unfiled') {
      openStandaloneNote(item.uuid);
    } else {
      dispatch('switchSave', { saveName: item.saveName });
    }
  }

  async function openStandaloneNote(uuid) {
    editingKind = 'note';
    activeFileUuid = uuid;
    activeFileContent = '';
    activeFileContent = await getNoteContent(uuid);
  }

  function scheduleNoteSave() {
    if (!activeFileUuid) return;
    const uuid = activeFileUuid;
    const content = activeFileContent;
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(async () => {
      await setNoteContent(uuid, content);
      // keep the sidebar list (title/preview) fresh
      refreshStandaloneNotes();
    }, 400);
  }

  function startEditingTags(item) {
    tagInputValue = Array.isArray(item.tags) ? item.tags.join(', ') : '';
    editingTagsForId = item.key;
  }

  async function commitTags(item) {
    const tags = tagInputValue.split(',').map(t => t.trim()).filter(Boolean);
    if (item.kind === 'unfiled') {
      await updateFileMeta(item.uuid, { tags });
      await refreshStandaloneNotes();
    } else if (item.kind === 'current') {
      dispatch('update', { id: item.blockId, tags, changedKeys: ['tags'], pushToHistory: true });
    }
    editingTagsForId = null;
    tagInputValue = '';
  }

  function addNote() {
    editingKind = 'block';
    dispatch('addBlock', 'text');
  }

  // Sidebar "New note" creates a real standalone file (no folder) and opens it.
  async function addUnfiledNote() {
    const uuid = await createStandaloneNote('');
    await refreshStandaloneNotes();
    await openStandaloneNote(uuid);
  }

  async function deleteStandaloneNote(uuid) {
    await deleteContentFile(uuid);
    if (activeFileUuid === uuid) {
      activeFileUuid = null;
      activeFileContent = '';
      editingKind = 'block';
    }
    await refreshStandaloneNotes();
  }

  // Make sure a pending standalone-note edit is flushed if we leave the mode.
  onDestroy(() => {
    if (noteSaveTimer && activeFileUuid) {
      clearTimeout(noteSaveTimer);
      setNoteContent(activeFileUuid, activeFileContent);
    }
  });

  // ── Note context menu (right-click / long-press) ─────────────────
  let noteCtxMenu = { open: false, x: 0, y: 0 };
  let noteLongPressTimer;

  function openNoteCtxMenu(x, y) {
    if (!hasActiveNote) return;
    noteCtxMenu = { open: true, x, y };
  }
  function closeNoteCtxMenu() {
    noteCtxMenu = { open: false, x: 0, y: 0 };
  }
  function onNoteContextMenu(event) {
    if (!hasActiveNote) return;
    event.preventDefault();
    openNoteCtxMenu(event.clientX, event.clientY);
  }
  function onNoteTouchStart(event) {
    if (event.touches?.length !== 1 || !hasActiveNote) return;
    const touch = event.touches[0];
    clearTimeout(noteLongPressTimer);
    noteLongPressTimer = setTimeout(() => openNoteCtxMenu(touch.clientX, touch.clientY), 550);
  }
  function cancelNoteLongPress() {
    clearTimeout(noteLongPressTimer);
  }

  function buildNoteMenuItems() {
    const items = [];
    if (editorContent) items.push({ id: 'copyText', label: 'Copy text' });
    items.push({ id: 'delete', label: 'Delete note', variant: 'danger' });
    return items;
  }
  async function handleNoteMenuAction(actionId) {
    closeNoteCtxMenu();
    if (actionId === 'copyText') {
      const text = htmlToText(editorContent);
      if (text) await navigator.clipboard.writeText(text).catch(() => {});
    } else if (actionId === 'delete') {
      if (editingKind === 'note' && activeFileUuid) {
        deleteStandaloneNote(activeFileUuid);
      } else if (noteBlock) {
        deleteBlock(noteBlock.id);
      }
    }
  }
  function handleNoteColorChange(detail) {
    if (!noteBlock) return; // colors only apply to folder-block notes
    const changed = {};
    if (detail.bgColor !== undefined) changed.bgColor = detail.bgColor;
    if (detail.textColor !== undefined) changed.textColor = detail.textColor;
    const keys = Object.keys(changed);
    if (!keys.length) return;
    updateBlock(noteBlock.id, changed, { pushToHistory: !!detail.commit, changedKeys: keys });
  }

  function autoFocusInput(node) {
    node.focus();
    node.select?.();
  }

  // ── Utilities ────────────────────────────────────────────────────

  function countWords(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function updateBlock(id, updates, { pushToHistory, changedKeys } = {}) {
    const detail = { id, ...updates };
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length
      ? changedKeys
      : Object.keys(updates || {});

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }

  function deleteBlock(id) {
    dispatch('delete', { id });
  }

  function ensureFocus(id) {
    if (focusedBlockId !== id) {
      dispatch('focusToggle', { id });
    }
  }

  function focusScroll(el) {
    if (!el) return;
    if (window.innerWidth <= 1024) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function getNoteLabel(block, index) {
    const content = htmlToText(block?.content || '');
    const firstLine = content.split('\n')[0]?.trim();
    if (firstLine) {
      const trimmed = firstLine.length > 28 ? `${firstLine.slice(0, 28)}…` : firstLine;
      return trimmed;
    }
    return `Note ${index + 1}`;
  }

  function getTabStyle(block) {
    const bg = block?.bgColor || canvasTheme.outerBg;
    const text = block?.textColor || getReadableTextColor(bg);
    return `--tab-bg: ${bg}; --tab-text: ${text};`;
  }
</script>

<style>
  .single-shell {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* ── Sidebar ─────────────────────────────────────────────── */
  .note-top-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    flex-shrink: 0;
    background: var(--canvas-inner-bg, #000);
    min-height: 40px;
  }

  .sidebar-toggle {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.65);
    font-size: 0.9rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .sidebar-toggle:hover { background: rgba(255,255,255,0.12); }

  .add-note-btn {
    height: 30px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.65);
    font-size: 0.82rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .add-note-btn:hover { background: rgba(255,255,255,0.12); }

  .note-sidebar {
    width: 280px;
    flex-shrink: 0;
    background: var(--canvas-inner-bg, #0c0c0c);
    border-right: 1px solid rgba(255,255,255,0.07);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    --sb-track: var(--canvas-inner-bg);
    --sb-thumb: var(--mode-text-color);
  }

  .sidebar-header {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    flex-shrink: 0;
  }

  .sidebar-add-btn {
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    color: var(--mode-text-color, #e0e0e0);
    padding: 6px 10px;
    font-size: 0.82rem;
    cursor: pointer;
    text-align: center;
  }
  .sidebar-add-btn:hover { background: rgba(255,255,255,0.13); }

  .sidebar-search {
    width: 100%;
    box-sizing: border-box;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: var(--mode-text-color, #e0e0e0);
    padding: 5px 9px;
    font-size: 0.81rem;
    outline: none;
  }
  .sidebar-search:focus { border-color: rgba(255,255,255,0.25); }
  .sidebar-search::placeholder { color: rgba(255,255,255,0.3); }

  .sidebar-list {
    flex: 1 1 0;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .sidebar-section-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255,255,255,0.3);
    padding: 4px 6px 2px;
    flex-shrink: 0;
  }

  .sidebar-item {
    border-radius: 8px;
    padding: 7px 9px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.1s;
  }
  .sidebar-item:hover { background: rgba(255,255,255,0.05); }
  .sidebar-item-active { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.07); }
  .sidebar-item-current-folder { border-left: 2px solid rgba(100,160,255,0.7); padding-left: 7px; }
  .sidebar-item-unfiled { border-left: 2px solid rgba(180,140,255,0.7); padding-left: 7px; }
  .sidebar-item-unfiled .sidebar-item-title { color: rgba(196,170,255,1); }
  .sidebar-item-nofolder { color: rgba(180,140,255,0.65); font-style: italic; }

  .sidebar-item-title {
    font-size: 0.83rem;
    color: var(--mode-text-color, #e8e8e8);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sidebar-item-current-folder .sidebar-item-title { color: rgba(140,185,255,1); }

  .sidebar-item-folder {
    font-size: 0.7rem;
    color: rgba(255,255,255,0.3);
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-item-preview {
    font-size: 0.75rem;
    color: rgba(255,255,255,0.38);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 4px;
    align-items: center;
  }

  .sidebar-tag {
    font-size: 0.68rem;
    background: rgba(100,160,255,0.15);
    color: rgba(140,185,255,0.9);
    border-radius: 4px;
    padding: 1px 5px;
  }

  .sidebar-tag-edit-btn {
    font-size: 0.68rem;
    background: transparent;
    border: 1px dashed rgba(255,255,255,0.18);
    border-radius: 4px;
    color: rgba(255,255,255,0.28);
    padding: 1px 5px;
    cursor: pointer;
  }
  .sidebar-tag-edit-btn:hover { border-color: rgba(255,255,255,0.4); color: rgba(255,255,255,0.55); }

  .sidebar-tag-input {
    flex: 1;
    min-width: 80px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 4px;
    color: var(--mode-text-color, #e0e0e0);
    padding: 2px 6px;
    font-size: 0.73rem;
    outline: none;
  }

  .sidebar-empty {
    font-size: 0.81rem;
    color: rgba(255,255,255,0.28);
    text-align: center;
    padding: 14px;
  }

  .sidebar-loading {
    font-size: 0.78rem;
    color: rgba(255,255,255,0.3);
    text-align: center;
    padding: 10px;
  }

  /* ── Main note area ──────────────────────────────────────── */
  .single-note {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-width: 0;
    height: 100%;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
    color: var(--mode-text-color, #ffffff);
    box-sizing: border-box;
    --sb-track: var(--active-note-bg);
    --sb-thumb: var(--active-note-text);
  }

  /* Per-file background image sitting behind the text */
  .note-bg-layer {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-position: center;
    background-repeat: no-repeat;
    pointer-events: none;
  }
  /* When a bg image is set, let it show through the note surfaces */
  .single-note.has-bg-image .note-meta,
  .single-note.has-bg-image .note-footer { background: transparent; }
  .single-note.has-bg-image :global(.tiptap-wrap) { background: transparent; }
  .single-note > .note-top-bar,
  .single-note > .note-meta,
  .single-note > .note-editor-area,
  .single-note > .note-footer { position: relative; z-index: 1; }
  /* The bg-settings popover drops down from the top bar over the note; give
     the top bar a higher stacking layer so the popover sits above the
     editor/meta surfaces below it instead of behind them. */
  .single-note > .note-top-bar { z-index: 20; }

  .note-editor-area {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  /* ── Background settings ─────────────────────────────── */
  .bg-settings-wrap { position: relative; margin-left: auto; flex-shrink: 0; }
  .bg-settings-btn {
    width: 30px; height: 30px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.65);
    cursor: pointer;
    font-size: 0.9rem;
  }
  .bg-settings-btn:hover, .bg-settings-btn.active { background: rgba(255,255,255,0.14); }
  .bg-panel {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    width: 230px;
    background: #161616;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 9px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.55);
  }
  .bg-panel-row { display: flex; gap: 6px; }
  .bg-file-btn {
    flex: 1;
    text-align: center;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 7px;
    color: #e8e8e8;
    padding: 6px 8px;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .bg-file-btn:hover { background: rgba(255,255,255,0.14); }
  .bg-clear-btn {
    background: rgba(255,90,90,0.15);
    border: 1px solid rgba(255,90,90,0.4);
    border-radius: 7px;
    color: #ff9b9b;
    padding: 6px 8px;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .bg-slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78rem;
    color: rgba(255,255,255,0.7);
  }
  .bg-slider-row > span:first-child { width: 50px; flex-shrink: 0; }
  .bg-slider-row input[type="range"] { flex: 1; min-width: 0; accent-color: #8bb7ff; }
  .bg-val { width: 38px; text-align: right; flex-shrink: 0; }
  .bg-size-toggle { display: flex; gap: 4px; flex: 1; }
  .bg-size-toggle button {
    flex: 1;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    color: rgba(255,255,255,0.7);
    padding: 4px;
    font-size: 0.76rem;
    cursor: pointer;
  }
  .bg-size-toggle button.active { background: rgba(139,183,255,0.25); border-color: rgba(139,183,255,0.5); color: #fff; }

  .note-tabs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    flex: 1 1 0;
    min-width: 0;
  }

  .note-tab {
    border: 1px solid color-mix(in srgb, var(--tab-text, #ffffff) 50%, transparent);
    background: color-mix(in srgb, var(--tab-bg, #000000) 88%, #000000 12%);
    color: var(--tab-text, inherit);
    padding: 6px 12px;
    border-radius: 9px;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .note-tab[aria-selected='true'] {
    border-color: var(--tab-text);
    background: var(--tab-bg, rgba(255, 255, 255, 0.12));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--tab-text, #ffffff) 55%, transparent);
  }

  .note-tab:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.7);
    outline-offset: 2px;
  }

  .note-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    box-sizing: border-box;
    background: var(--active-note-bg);
    color: var(--active-note-text, inherit);
  }

  .note-stats {
    display: flex;
    gap: 12px;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
    color: inherit;
  }

  .note-nofolder-badge {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(180,140,255,0.18);
    color: rgba(196,170,255,1);
    border: 1px solid rgba(180,140,255,0.4);
  }

  .note-folder-badge {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(100,160,255,0.18);
    color: rgba(150,190,255,1);
    border: 1px solid rgba(100,160,255,0.4);
    white-space: nowrap;
    max-width: 50%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .note-stats span {
    background: transparent;
    padding: 0;
    border-radius: 0;
  }

  textarea {
    width: 100%;
    flex: 1 1 auto;
    border: none;
    resize: none;
    padding: 12px;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    font-family: Arial, Helvetica, sans-serif;
    font-size: 1.05rem;
    line-height: 1.6;
    box-sizing: border-box;
    text-align: left;
    overflow-y: auto;
  }

  textarea:focus {
    outline: none;
  }

  .note-footer {
    display: flex;
    justify-content: flex-end;
    padding: 6px 12px 10px;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
  }

  .note-footer button {
    background: transparent;
    border: none;
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    font-size: 1.1rem;
    cursor: pointer;
  }

  .empty-state {
    border: 1px dashed rgba(255, 255, 255, 0.4);
    border-radius: 12px;
    padding: 16px;
    margin: 12px;
    text-align: left;
    color: rgba(255, 255, 255, 0.8);
  }

  .empty-add-btn {
    margin-top: 10px;
    display: block;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    color: rgba(255,255,255,0.8);
    padding: 7px 14px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .empty-add-btn:hover { background: rgba(255,255,255,0.14); }
</style>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="single-shell" style={canvasCssVars}>

  {#if sidebarOpen}
  <div class="note-sidebar">
    <div class="sidebar-header">
      <button class="sidebar-add-btn" on:click={addUnfiledNote}>+ New note (no folder)</button>
      <input class="sidebar-search" bind:value={sidebarSearch} placeholder="Search…" />
      <input class="sidebar-search" bind:value={sidebarTagFilter} placeholder="Filter by tag…" />
    </div>
    <div class="sidebar-list">
      {#if filteredItems.length === 0}
        {#if loadingAll}
          <div class="sidebar-loading">Loading…</div>
        {:else}
          <div class="sidebar-empty">No notes found</div>
        {/if}
      {:else}
        {#each filteredItems as item (item.key)}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <div
            class="sidebar-item"
            class:sidebar-item-current-folder={item.kind === 'current'}
            class:sidebar-item-unfiled={item.kind === 'unfiled'}
            class:sidebar-item-active={(item.kind === 'current' && editingKind === 'block' && item.blockId === selectedNoteId)
              || (item.kind === 'unfiled' && editingKind === 'note' && item.uuid === activeFileUuid)}
            on:click={() => clickSidebarItem(item)}
          >
            <div class="sidebar-item-title">{item.title}</div>
            {#if item.kind === 'other'}
              <div class="sidebar-item-folder">{item.saveName}</div>
            {:else if item.kind === 'unfiled'}
              <div class="sidebar-item-folder sidebar-item-nofolder">No folder</div>
            {/if}
            {#if item.preview}
              <div class="sidebar-item-preview">{item.preview}</div>
            {/if}
            {#if item.kind === 'current' || item.kind === 'unfiled'}
              <div class="sidebar-tags-row">
                {#each item.tags as tag}
                  <span class="sidebar-tag">{tag}</span>
                {/each}
                {#if editingTagsForId === item.key}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <input
                    class="sidebar-tag-input"
                    bind:value={tagInputValue}
                    placeholder="tag1, tag2…"
                    on:click|stopPropagation
                    on:keydown|stopPropagation={(e) => {
                      if (e.key === 'Enter') commitTags(item);
                      if (e.key === 'Escape') editingTagsForId = null;
                    }}
                    on:blur={() => commitTags(item)}
                    use:autoFocusInput
                  />
                {:else}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <button
                    class="sidebar-tag-edit-btn"
                    on:click|stopPropagation={() => startEditingTags(item)}
                    title="Edit tags"
                  >#</button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
        {#if loadingAll}
          <div class="sidebar-loading">Loading other folders…</div>
        {/if}
      {/if}
    </div>
  </div>
  {/if}

  <div class="single-note" class:has-bg-image={bgImage} bind:this={canvasRef}>
    {#if bgImage}
      <div
        class="note-bg-layer"
        style="background-image:url('{bgImage}'); opacity:{bgOpacity}; filter:blur({bgBlur}px); background-size:{bgSize};"
      ></div>
    {/if}
    <div class="note-top-bar">
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <button
        class="sidebar-toggle"
        on:click={() => { if (sidebarOpen) { sidebarOpen = false; } else { openSidebar(); } }}
        title={sidebarOpen ? 'Close note list' : 'Browse notes'}
      >
        {sidebarOpen ? '‹' : '☰'}
      </button>
      <button class="add-note-btn" on:click={addNote} title="Add text note">+ Note</button>
      {#if noteCount > 1}
        <div class="note-tabs" role="tablist" aria-label="Notes">
          {#each noteBlocks as block, index (block.id)}
            <button
              class="note-tab"
              role="tab"
              aria-selected={block.id === selectedNoteId}
              style={getTabStyle(block)}
              on:click={() => { selectedNoteId = block.id; }}
            >
              {getNoteLabel(block, index)}
            </button>
          {/each}
        </div>
      {/if}
      <div class="bg-settings-wrap">
        <button
          class="bg-settings-btn"
          class:active={bgPanelOpen}
          on:click={() => (bgPanelOpen = !bgPanelOpen)}
          title="Background image"
          aria-label="Background image settings"
        >🖼</button>
        {#if bgPanelOpen}
          <div class="bg-panel">
            <div class="bg-panel-row">
              <label class="bg-file-btn">
                {bgImage ? 'Change image' : 'Choose image'}
                <input type="file" accept="image/*" on:change={onBgFileChange} hidden />
              </label>
              {#if bgImage}
                <button class="bg-clear-btn" on:click={clearBgImage}>Remove</button>
              {/if}
            </div>
            {#if bgImage}
              <label class="bg-slider-row">
                <span>Opacity</span>
                <input type="range" min="0" max="1" step="0.01" value={bgOpacity}
                  on:input={(e) => setBgSetting({ bgOpacity: Number(e.target.value) })} />
                <span class="bg-val">{Math.round(bgOpacity * 100)}%</span>
              </label>
              <label class="bg-slider-row">
                <span>Blur</span>
                <input type="range" min="0" max="20" step="1" value={bgBlur}
                  on:input={(e) => setBgSetting({ bgBlur: Number(e.target.value) })} />
                <span class="bg-val">{bgBlur}px</span>
              </label>
              <div class="bg-slider-row">
                <span>Fit</span>
                <div class="bg-size-toggle">
                  <button class:active={bgSize === 'cover'} on:click={() => setBgSetting({ bgSize: 'cover' })}>Cover</button>
                  <button class:active={bgSize === 'contain'} on:click={() => setBgSetting({ bgSize: 'contain' })}>Contain</button>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    {#if hasActiveNote}
      <div class="note-meta">
        <div class="note-stats">
          <span>Words: {wordCount}</span>
          <span>Characters: {characterCount}</span>
        </div>
        {#if editingKind === 'note'}
          <span class="note-nofolder-badge">No folder</span>
        {:else if currentSaveName}
          <span class="note-folder-badge">📁 {currentSaveName}</span>
        {/if}
      </div>
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="note-editor-area"
        on:contextmenu={onNoteContextMenu}
        on:touchstart={onNoteTouchStart}
        on:touchmove={cancelNoteLongPress}
        on:touchend={cancelNoteLongPress}
        on:touchcancel={cancelNoteLongPress}
      >
        {#key editorKey}
          <TipTapEditor
            content={editorContent}
            placeholder="Write your note here..."
            on:change={(e) => {
              if (editingKind === 'note') {
                activeFileContent = e.detail;
                scheduleNoteSave();
              } else if (noteBlock) {
                updateBlock(noteBlock.id, { content: e.detail }, { pushToHistory: false, changedKeys: ['content'] });
              }
            }}
            on:focus={() => { if (noteBlock) ensureFocus(noteBlock.id); }}
          />
        {/key}
      </div>

      <div class="note-footer">
        <button
          on:click={() => {
            if (editingKind === 'note' && activeFileUuid) deleteStandaloneNote(activeFileUuid);
            else if (noteBlock) deleteBlock(noteBlock.id);
          }}
          aria-label="Delete note"
        >×</button>
      </div>

    {:else}
      <div class="empty-state">
        No note open. Add one to this folder, or create a folder-less note from the sidebar.
        <button class="empty-add-btn" on:click={addNote}>+ Add text note</button>
      </div>
    {/if}
  </div>
</div>

{#if noteCtxMenu.open && hasActiveNote}
  <BlockContextMenu
    x={noteCtxMenu.x}
    y={noteCtxMenu.y}
    items={buildNoteMenuItems()}
    colorEdit={editingKind === 'block'}
    bgColor={noteBlock?.bgColor || '#000000'}
    textColor={noteBlock?.textColor || '#ffffff'}
    on:action={(e) => handleNoteMenuAction(e.detail)}
    on:colorChange={(e) => handleNoteColorChange(e.detail)}
    on:close={closeNoteCtxMenu}
  />
{/if}
