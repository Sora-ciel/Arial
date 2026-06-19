<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { listSavedBlocks, loadBlocks } from '../storage.js';
  import TipTapEditor from '../components/TipTapEditor.svelte';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  export let currentSaveName = '';

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
  let selectedNoteId = null;
  $: if (!selectedNoteId && noteBlocks.length) {
    selectedNoteId = noteBlocks[0].id;
  }
  $: if (!noteBlocks.length) {
    selectedNoteId = null;
  }
  $: if (
    selectedNoteId &&
    !noteBlocks.some(block => block.id === selectedNoteId)
  ) {
    selectedNoteId = noteBlocks[0]?.id ?? null;
  }
  $: noteBlock =
    noteBlocks.find(block => block.id === selectedNoteId) || null;
  $: noteContent = noteBlock?.content ?? '';
  $: wordCount = countWords(noteContent);
  $: characterCount = noteContent.length;
  $: hasHiddenBlocks = blocks.some(
    block => block.type !== 'text' && block.type !== 'cleantext'
  );
  $: noteCount = noteBlocks.length;

  // ── Sidebar state ────────────────────────────────────────────────
  let sidebarOpen = false;
  let sidebarSearch = '';
  let sidebarTagFilter = '';
  let otherFolderNotes = []; // [{saveName, blockId, title, preview, tags}]
  let loadingAll = false;
  let allLoaded = false;
  let editingTagsForId = null;
  let tagInputValue = '';

  async function openSidebar() {
    sidebarOpen = true;
    if (!allLoaded && !loadingAll) await loadAllFolderNotes();
  }

  async function loadAllFolderNotes() {
    loadingAll = true;
    try {
      const saves = await listSavedBlocks();
      const results = [];
      for (const saveName of saves) {
        if (saveName === currentSaveName) continue;
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
      allLoaded = true;
    } finally {
      loadingAll = false;
    }
  }

  function getNoteFirstLine(block) {
    const content = (block?.content || '').trim();
    const line = content.split('\n')[0]?.trim() || '';
    return line.length > 40 ? `${line.slice(0, 40)}…` : (line || 'Untitled');
  }

  function getNotePreview(block) {
    const content = (block?.content || '').trim();
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return '';
    const preview = lines[1].trim();
    return preview.length > 50 ? `${preview.slice(0, 50)}…` : preview;
  }

  $: currentFolderItems = noteBlocks.map(b => ({
    saveName: currentSaveName,
    blockId: b.id,
    title: getNoteFirstLine(b),
    preview: getNotePreview(b),
    tags: Array.isArray(b.tags) ? b.tags : [],
    isCurrent: true
  }));

  $: otherFolderItems = otherFolderNotes.map(n => ({ ...n, isCurrent: false }));

  $: allSidebarItems = [...currentFolderItems, ...otherFolderItems];

  $: filteredItems = allSidebarItems.filter(item => {
    const q = sidebarSearch.toLowerCase();
    const tq = sidebarTagFilter.toLowerCase();
    const matchesText = !q || item.title.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q);
    const matchesTags = !tq || item.tags.some(t => t.toLowerCase().includes(tq));
    return matchesText && matchesTags;
  });

  function clickSidebarItem(item) {
    if (item.isCurrent) {
      selectedNoteId = item.blockId;
    } else {
      dispatch('switchSave', { saveName: item.saveName });
    }
  }

  function startEditingTags(blockId) {
    const block = noteBlocks.find(b => b.id === blockId);
    tagInputValue = Array.isArray(block?.tags) ? block.tags.join(', ') : '';
    editingTagsForId = blockId;
  }

  function commitTags(blockId) {
    const tags = tagInputValue.split(',').map(t => t.trim()).filter(Boolean);
    dispatch('update', { id: blockId, tags, changedKeys: ['tags'], pushToHistory: true });
    editingTagsForId = null;
    tagInputValue = '';
  }

  function addNote() {
    dispatch('addBlock', { type: 'text', content: '' });
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

  function getReadableTextColor(color) {
    if (!color) return '#f5f5f5';
    const parsed = parseColor(color);
    if (!parsed) return '#f5f5f5';
    const [r, g, b] = parsed;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#121212' : '#f5f5f5';
  }

  function parseColor(color) {
    const trimmed = color.trim();
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16)
        ];
      }
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
    }
    const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return [
        Number(rgbMatch[1]),
        Number(rgbMatch[2]),
        Number(rgbMatch[3])
      ];
    }
    return null;
  }

  function getNoteLabel(block, index) {
    const content = (block?.content || '').trim();
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

  .note-sidebar {
    width: 280px;
    flex-shrink: 0;
    background: var(--canvas-inner-bg, #0c0c0c);
    border-right: 1px solid rgba(255,255,255,0.07);
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
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
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-width: 0;
    height: 100%;
    background: var(--canvas-inner-bg, #000000);
    color: var(--mode-text-color, #ffffff);
    box-sizing: border-box;
  }

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
      <button class="sidebar-add-btn" on:click={addNote}>+ New note</button>
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
        {#each filteredItems as item (item.isCurrent ? item.blockId : item.saveName + '/' + item.blockId)}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <div
            class="sidebar-item"
            class:sidebar-item-current-folder={item.isCurrent}
            class:sidebar-item-active={item.isCurrent && item.blockId === selectedNoteId}
            on:click={() => clickSidebarItem(item)}
          >
            <div class="sidebar-item-title">{item.title}</div>
            {#if !item.isCurrent}
              <div class="sidebar-item-folder">{item.saveName}</div>
            {/if}
            {#if item.preview}
              <div class="sidebar-item-preview">{item.preview}</div>
            {/if}
            {#if item.isCurrent}
              <div class="sidebar-tags-row">
                {#each item.tags as tag}
                  <span class="sidebar-tag">{tag}</span>
                {/each}
                {#if editingTagsForId === item.blockId}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <input
                    class="sidebar-tag-input"
                    bind:value={tagInputValue}
                    placeholder="tag1, tag2…"
                    on:click|stopPropagation
                    on:keydown|stopPropagation={(e) => {
                      if (e.key === 'Enter') commitTags(item.blockId);
                      if (e.key === 'Escape') editingTagsForId = null;
                    }}
                    on:blur={() => commitTags(item.blockId)}
                    use:autoFocusInput
                  />
                {:else}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <button
                    class="sidebar-tag-edit-btn"
                    on:click|stopPropagation={() => startEditingTags(item.blockId)}
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

  <div class="single-note" bind:this={canvasRef}>
    <div class="note-top-bar">
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <button
        class="sidebar-toggle"
        on:click={() => { if (sidebarOpen) { sidebarOpen = false; } else { openSidebar(); } }}
        title={sidebarOpen ? 'Close note list' : 'Browse notes'}
      >
        {sidebarOpen ? '‹' : '☰'}
      </button>
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
    </div>

    {#if noteBlock}
      <div class="note-meta">
        <div class="note-stats">
          <span>Words: {wordCount}</span>
          <span>Characters: {characterCount}</span>
        </div>
      </div>
      <TipTapEditor
        content={noteContent}
        placeholder="Write your note here..."
        on:change={(e) => {
          updateBlock(noteBlock.id, { content: e.detail }, { pushToHistory: false, changedKeys: ['content'] });
        }}
        on:focus={() => ensureFocus(noteBlock.id)}
      />

      <div class="note-footer">
        <button on:click={() => deleteBlock(noteBlock.id)} aria-label="Delete note">
          ×
        </button>
      </div>

    {:else}
      <div class="empty-state">
        No text note found yet.
        <button class="empty-add-btn" on:click={addNote}>+ Add text note</button>
      </div>
    {/if}
  </div>
</div>
