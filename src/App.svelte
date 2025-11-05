<script>
  import { onMount, onDestroy } from 'svelte';
  import RightControls from './advanced-param/RightControls.svelte';
  import LeftControls from './advanced-param/LeftControls.svelte';
  import ModeArea from './BACKUPS/ModeSwitcher.svelte';
  import { saveBlocks, loadBlocks, deleteBlocks, listSavedBlocks } from './storage.js';
  import {
    CONTROL_COLOR_DEFAULTS,
    normalizeControlColors,
    loadStoredControlColors,
    persistControlColors,
    loadStoredLastSaveName,
    persistLastSaveName
  } from './lib/controlColors.js';
  import {
    DEFAULT_HISTORY_TRIGGERS,
    createDefaultBlock
  } from './lib/blockDefaults.js';
  import { ensureModeOrders, cloneModeOrders } from './lib/modeOrders.js';
  import {
    cloneState,
    serializeState,
    hydrateImportedBlocks,
    parseHistorySnapshot
  } from './lib/history.js';

  // ---------------------------------------------------------------------------
  // Theme handling
  // ---------------------------------------------------------------------------
  // The control panels allow the user to change their colours. We keep the
  // current palette in `controlColors` and mirror it into `localStorage` so the
  // interface looks the same next time the project opens.
  let controlColors = normalizeControlColors();

  /**
   * Receive updates from the RightControls component. The event tells us which
   * section (left controls, right controls, or the canvas preview) changed and
   * which colour key within that section should be updated.
   */
  function handleControlColorChange(event) {
    const { section, side, key, value } = event.detail || {};
    const target = section || side;
    if (!target || !key) return;

    const nextSectionTheme = {
      ...controlColors[target],
      [key]: value
    };

    if (target === 'left' && key === 'panelBg') {
      nextSectionTheme.inputBg = value;
    }

    controlColors = {
      ...controlColors,
      [target]: nextSectionTheme
    };

    persistControlColors(controlColors);
  }

  // When the component mounts we read any saved colour choices. If stored
  // colours exist we replace the defaults; otherwise we keep the standard theme.
  onMount(() => {
    const stored = loadStoredControlColors();
    if (stored) {
      controlColors = stored;
    }
  });

  // ---------------------------------------------------------------------------
  // Canvas & control layout
  // ---------------------------------------------------------------------------
  // The editor has a fixed control bar above a scrollable canvas. The helpers
  // below make sure we leave enough padding so the top-most blocks never hide
  // behind the controls.
  let controlsRef;
  let canvasRef;
  let controlsResizeObserver;
  let observedControlsEl;

  /**
   * Write the measured control height into CSS variables. Both the canvas and
   * the global document need the value so the layout stays consistent in all
   * media queries.
   */
  function setControlsHeight(value) {
    const px = `${value}px`;
    if (canvasRef) {
      canvasRef.style.setProperty('--controls-height', px);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--controls-height', px);
    }
  }

  /**
   * Decide how much padding the canvas needs. On small screens we use a fixed
   * value; on desktops we measure the actual control height so the blocks sit
   * right beneath the toolbar.
   */
  function adjustCanvasPadding() {
    if (typeof window === 'undefined') return;

    if (window.innerWidth <= 1024) {
      setControlsHeight(75);
      return;
    }

    const height = controlsRef?.offsetHeight || 56;
    setControlsHeight(height);
  }

  /**
   * Attach a ResizeObserver so whenever the controls grow or shrink (for
   * example when a new button appears) we update the canvas padding.
   */
  function setupControlsObserver() {
    if (typeof ResizeObserver === 'undefined' || !controlsRef) {
      return;
    }

    if (observedControlsEl === controlsRef) {
      return;
    }

    controlsResizeObserver?.disconnect();
    controlsResizeObserver = new ResizeObserver(() => adjustCanvasPadding());
    controlsResizeObserver.observe(controlsRef);
    observedControlsEl = controlsRef;
  }

  // A small helper that lets us register and unregister the same resize handler
  // function during the component's lifecycle.
  const handleWindowResize = () => {
    adjustCanvasPadding();
  };

  // ---------------------------------------------------------------------------
  // Block state & mode ordering
  // ---------------------------------------------------------------------------
  // `mode` describes how blocks should be displayed inside ModeArea. The other
  // variables track the block data itself as well as assorted helper state that
  // drives keyboard shortcuts and rendering.
  let mode = 'default';
  let blocks = [];
  let modeOrders = {};
  let normalizedModeOrders = ensureModeOrders(blocks, modeOrders);
  let modeOrderedBlocks = [];
  let groupedBlocks = [];
  let focusedBlockId = null;
  let blocksRenderNonce = 0;

  // Reactive statement: whenever `blocks` or `modeOrders` change we rebuild the
  // normalized order map. Using `ensureModeOrders` means we never have to worry
  // about missing ids when blocks are added or removed.
  $: normalizedModeOrders = ensureModeOrders(blocks, modeOrders);

  // We use a `key` block in the markup to force ModeArea to rerender when the
  // block structure changes significantly. Concatenating the block ids (and
  // their versions) gives us an easy-to-compare string.
  $: blocksKey = `${blocksRenderNonce}:${(normalizedModeOrders[mode] || [])
    .join('|')}:${blocks
    .map(b => `${b.id}:${b._version ?? 0}`)
    .join('|')}`;

  // Convert the unordered block array into the order expected by the current
  // mode. If a block is missing from the stored order (perhaps a new block was
  // added) we append it to the end so nothing disappears.
  $: modeOrderedBlocks = (() => {
    const order = normalizedModeOrders[mode] || [];
    const blockMap = new Map(blocks.map(block => [block.id, block]));
    const ordered = [];
    for (const id of order) {
      const block = blockMap.get(id);
      if (block) ordered.push(block);
    }
    if (ordered.length < blocks.length) {
      const seen = new Set(order);
      for (const block of blocks) {
        if (!seen.has(block.id)) {
          ordered.push(block);
        }
      }
    }
    return ordered;
  })();
  // Some UI controls expect image + text blocks to be paired together. This
  // computed array walks through the ordered block list and merges consecutive
  // pairs into a single object the template can render more easily.
  $: groupedBlocks = (() => {
    const groups = [];
    for (let i = 0; i < modeOrderedBlocks.length; i++) {
      const block = modeOrderedBlocks[i];
      const next = modeOrderedBlocks[i + 1];
      if (
        block.type === 'image' &&
        next &&
        (next.type === 'text' || next.type === 'cleantext')
      ) {
        groups.push({ type: 'pair', image: block, text: next });
        i++;
      } else {
        groups.push(block);
      }
    }
    return groups;
  })();

  $: leftTheme = controlColors.left || CONTROL_COLOR_DEFAULTS.left;
  $: controlsStyle = `--controls-bg: ${leftTheme.panelBg}; --controls-border: ${leftTheme.borderColor};`;
  $: canvasTheme = controlColors.canvas || CONTROL_COLOR_DEFAULTS.canvas;

  // If the currently-focused block gets deleted we reset the focus so keyboard
  // shortcuts do not reference an id that no longer exists.
  $: if (focusedBlockId && !blocks.some(block => block.id === focusedBlockId)) {
    focusedBlockId = null;
  }

  // ---------------------------------------------------------------------------
  // History management
  // ---------------------------------------------------------------------------
  // The arrays below implement an undo/redo stack. Every time the user performs
  // a significant action we push a snapshot of the editor state so we can
  // recover it later.
  let history = [];
  let historyIndex = -1;
  let hasUnsnapshottedChanges = false;

  /**
   * Persist the current project to disk. Autosaves happen after every history
   * snapshot so manual saves simply reuse this helper.
   */
  async function persistAutosave(blocksToPersist, ordersToPersist = modeOrders) {
    if (!currentSaveName) return;
    persistLastSaveName(currentSaveName);
    const normalizedOrders = ensureModeOrders(blocksToPersist, ordersToPersist);
    await saveBlocks(currentSaveName, {
      blocks: blocksToPersist,
      modeOrders: normalizedOrders
    });
    savedList = await listSavedBlocks();
  }

  /**
   * Store a new snapshot in the undo history. We clone the incoming state so
   * future edits cannot accidentally mutate older snapshots.
   */
  async function pushHistory(newBlocks, newOrders = modeOrders) {
    const stateSnapshot = cloneState(newBlocks, newOrders, { bumpVersion: true });
    const snapshot = JSON.stringify(stateSnapshot);

    if (historyIndex >= 0 && history[historyIndex] === snapshot) {
      blocks = stateSnapshot.blocks;
      modeOrders = stateSnapshot.modeOrders;
      blocksRenderNonce += 1;
      await persistAutosave(stateSnapshot.blocks, stateSnapshot.modeOrders);
      hasUnsnapshottedChanges = false;
      return;
    }

    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }

    history.push(snapshot);
    historyIndex++;

    blocks = stateSnapshot.blocks;
    modeOrders = stateSnapshot.modeOrders;
    blocksRenderNonce += 1;

    await persistAutosave(stateSnapshot.blocks, stateSnapshot.modeOrders);
    hasUnsnapshottedChanges = false;
  }

  /**
   * If we have unsaved changes we call `pushHistory` so the most recent state is
   * recorded. This makes sure undo always steps back to the change the user
   * expects.
   */
  async function ensureCurrentHistorySnapshot() {
    if (!blocks.length && history.length) return;
    if (!hasUnsnapshottedChanges) return;

    if (!history.length) {
      await pushHistory(blocks, modeOrders);
      return;
    }

    const isAtLatestSnapshot = historyIndex === history.length - 1;
    if (!isAtLatestSnapshot) return;

    const currentSnapshot = serializeState(blocks, modeOrders, {
      bumpVersion: false
    });
    const latestHistorySnapshot = history[historyIndex];

    if (latestHistorySnapshot !== currentSnapshot) {
      await pushHistory(blocks, modeOrders);
    } else {
      hasUnsnapshottedChanges = false;
    }
  }

  /**
   * Step backwards through the history stack. We only move if a previous entry
   * exists.
   */
  async function undo() {
    await ensureCurrentHistorySnapshot();

    if (historyIndex > 0) {
      historyIndex--;
      const snapshot = parseHistorySnapshot(history[historyIndex]);
      blocks = snapshot.blocks;
      modeOrders = snapshot.modeOrders;
      blocksRenderNonce += 1;
      await persistAutosave(snapshot.blocks, snapshot.modeOrders);
    }
  }

  /**
   * Step forward through the history stack when possible.
   */
  async function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      const snapshot = parseHistorySnapshot(history[historyIndex]);
      blocks = snapshot.blocks;
      modeOrders = snapshot.modeOrders;
      blocksRenderNonce += 1;
      await persistAutosave(snapshot.blocks, snapshot.modeOrders);
    }
  }

  // ---------------------------------------------------------------------------
  // Block operations
  // ---------------------------------------------------------------------------
  /**
   * Create a fresh block and append it to the canvas. The helper takes care of
   * keeping the mode order arrays in sync and recording the change in history.
   */
  function addBlock(type = 'text') {
    const newBlock = createDefaultBlock(type);
    blocks = [...blocks, newBlock];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    pushHistory(blocks, modeOrders);
  }

  /**
   * Remove a block after the user confirms deletion. We scrub the block id from
   * every mode order so future renders stay consistent.
   */
  function deleteBlockHandler(event) {
    const id = event.detail?.id;
    blocks = blocks.filter(b => b.id !== id);
    modeOrders = ensureModeOrders(
      blocks,
      Object.fromEntries(
        Object.entries(modeOrders).map(([modeName, order]) => [
          modeName,
          order.filter(existingId => existingId !== id)
        ])
      )
    );
    if (focusedBlockId === id) {
      focusedBlockId = null;
    }
    pushHistory(blocks, modeOrders);
  }

  /**
   * Handle updates coming from ModeArea. Depending on the fields that changed we
   * either snapshot immediately or mark the state as "dirty" so the next major
   * edit records a snapshot.
   */
  async function updateBlockHandler(event) {
    const detail = event.detail || {};
    const {
      pushToHistory,
      changedKeys,
      id,
      historyTriggers: incomingHistoryTriggers,
      ...updates
    } = detail;

    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return;

    const existing = blocks[idx];
    const historyTriggers =
      incomingHistoryTriggers ??
      existing.historyTriggers ??
      DEFAULT_HISTORY_TRIGGERS[existing.type] ??
      DEFAULT_HISTORY_TRIGGERS.__default;

    const normalizedChangedKeys =
      Array.isArray(changedKeys) && changedKeys.length
        ? changedKeys
        : Object.keys(updates);

    let shouldSnapshot;
    if (typeof pushToHistory === 'boolean') {
      shouldSnapshot = pushToHistory;
    } else if (normalizedChangedKeys.length) {
      shouldSnapshot = normalizedChangedKeys.some(key =>
        historyTriggers.includes(key)
      );
    } else {
      shouldSnapshot = true;
    }

    const updatedBlock = {
      ...existing,
      ...updates,
      position: { ...existing.position, ...(updates.position || {}) },
      size: { ...existing.size, ...(updates.size || {}) },
      historyTriggers
    };

    const newBlocks = blocks.map((block, index) =>
      index === idx ? updatedBlock : block
    );

    if (shouldSnapshot) {
      blocks = [...newBlocks];
      modeOrders = ensureModeOrders(blocks, modeOrders);
      await pushHistory(blocks, modeOrders);
    } else {
      blocks = [...newBlocks];
      modeOrders = ensureModeOrders(blocks, modeOrders);
      hasUnsnapshottedChanges = true;
    }
  }

  /**
   * Track which block the user clicked on so the keyboard shortcuts (move up /
   * move down) know which id to operate on.
   */
  function handleFocusToggle(event) {
    const { id } = event.detail || {};
    if (!id) {
      focusedBlockId = null;
      return;
    }

    focusedBlockId = focusedBlockId === id ? null : id;
  }

  /**
   * Reorder the currently-focused block inside the active mode. The `offset`
   * argument specifies whether the block should move up (-1) or down (+1).
   */
  async function moveFocusedBlock(offset) {
    if (!focusedBlockId) return;

    const ordersForMode = normalizedModeOrders[mode] || [];
    const index = ordersForMode.indexOf(focusedBlockId);
    if (index === -1) {
      focusedBlockId = null;
      return;
    }

    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= ordersForMode.length) {
      return;
    }

    const updatedOrder = [...ordersForMode];
    updatedOrder.splice(index, 1);
    updatedOrder.splice(targetIndex, 0, focusedBlockId);

    modeOrders = {
      ...modeOrders,
      [mode]: updatedOrder
    };
    await pushHistory(blocks, modeOrders);
  }

  const moveFocusedBlockUp = () => moveFocusedBlock(-1);
  const moveFocusedBlockDown = () => moveFocusedBlock(1);

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------
  let currentSaveName = 'default';
  let savedList = [];

  /**
   * Load a saved project from disk. Once the data arrives we hydrate it into the
   * live format, reset the undo stack, and push an initial snapshot.
   */
  async function load(name) {
    await ensureCurrentHistorySnapshot();

    const payload = await loadBlocks(name);
    const loadedBlocks = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.blocks)
      ? payload.blocks
      : [];
    const loadedOrders = !Array.isArray(payload) ? payload?.modeOrders : {};

    blocks = hydrateImportedBlocks(loadedBlocks);
    modeOrders = ensureModeOrders(blocks, loadedOrders);
    focusedBlockId = null;

    history = [];
    historyIndex = -1;
    currentSaveName = name;

    await pushHistory(blocks, modeOrders);
    persistLastSaveName(currentSaveName);
  }

  /**
   * Save the current project under the provided name. We keep prompting until a
   * non-empty value is provided so the user never ends up with an unnamed save.
   */
  async function save(name) {
    await ensureCurrentHistorySnapshot();

    if (!name) {
      alert('Please provide a save name.');
      return;
    }

    const sanitizedName = name.trim();
    if (!sanitizedName) {
      alert('Please provide a save name.');
      return;
    }

    currentSaveName = sanitizedName;
    await persistAutosave(blocks, modeOrders);
    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
  }

  /**
   * Remove all blocks from the canvas after the user confirms the action.
   */
  async function clear() {
    const confirmed = confirm('Are you sure you want to clear all blocks?');
    if (!confirmed) return;

    blocks = [];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    focusedBlockId = null;

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
  }

  /**
   * Delete a saved project from disk. If the removed save was currently loaded
   * we pick another entry (if available) or start with a blank slate.
   */
  async function deleteSave(name) {
    if (!name) return;
    const confirmed = confirm(`Delete save "${name}"?`);
    if (!confirmed) return;

    await deleteBlocks(name);
    savedList = await listSavedBlocks();

    if (currentSaveName === name) {
      currentSaveName = savedList[0] || '';
      if (currentSaveName) {
        await load(currentSaveName);
      } else {
        blocks = [];
        modeOrders = ensureModeOrders(blocks, modeOrders);
        history = [];
        historyIndex = -1;
        await pushHistory(blocks, modeOrders);
      }
    }

    const deletingCurrent = currentSaveName === name;
    if (!deletingCurrent && loadStoredLastSaveName() === name) {
      persistLastSaveName(currentSaveName);
    }

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
  }

  /**
   * Download the current project as a JSON file. The pretty-printed format makes
   * it easier for beginners to inspect the file contents manually if they want.
   */
  function exportJSON() {
    const dataStr = JSON.stringify(
      {
        blocks,
        modeOrders: ensureModeOrders(blocks, modeOrders)
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSaveName || 'codex-blocks'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import a JSON file from disk. We validate the structure lightly before
   * applying it so an invalid file cannot break the editor state.
   */
  async function importJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported) || (imported && typeof imported === 'object')) {
          const importedBlocks = Array.isArray(imported)
            ? imported
            : Array.isArray(imported.blocks)
            ? imported.blocks
            : [];
          const importedOrders = Array.isArray(imported)
            ? {}
            : imported.modeOrders;
          blocks = hydrateImportedBlocks(importedBlocks);
          modeOrders = ensureModeOrders(blocks, importedOrders);
          focusedBlockId = null;
          history = [];
          historyIndex = -1;
          await pushHistory(blocks, modeOrders);
          alert('Imported successfully!');
        } else alert('Invalid file structure!');
      } catch {
        alert('Invalid JSON file!');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  // ---------------------------------------------------------------------------
  // Lifecycle & setup
  // ---------------------------------------------------------------------------
  // When the component first mounts we hydrate the initial state. The steps are
  // deliberately written out in a linear order to make the flow easy to follow:
  // 1) hook up resize behaviour
  // 2) load the available saves
  // 3) pick a starting save name
  // 4) load its data
  // 5) push an initial history snapshot
  onMount(async () => {
    window.addEventListener('resize', handleWindowResize);
    adjustCanvasPadding();

    savedList = await listSavedBlocks();
    const storedLastSave = loadStoredLastSaveName();
    if (storedLastSave && savedList.includes(storedLastSave)) {
      currentSaveName = storedLastSave;
    } else if (!currentSaveName && savedList.length) {
      currentSaveName = savedList[0];
    }

    const initialData = await loadBlocks(currentSaveName);
    const initialBlocks = Array.isArray(initialData)
      ? initialData
      : Array.isArray(initialData?.blocks)
      ? initialData.blocks
      : [];
    const initialOrders = !Array.isArray(initialData)
      ? initialData?.modeOrders
      : {};
    blocks = hydrateImportedBlocks(initialBlocks);
    modeOrders = ensureModeOrders(blocks, initialOrders);

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
    persistLastSaveName(currentSaveName);
  });

  // Clean up any browser listeners or observers we registered earlier.
  onDestroy(() => {
    window.removeEventListener('resize', handleWindowResize);
    controlsResizeObserver?.disconnect();
    observedControlsEl = null;
  });

  // Anytime Svelte binds the controls element we set up observers and padding.
  $: if (controlsRef) {
    setupControlsObserver();
    adjustCanvasPadding();
  }

  // Likewise we re-run the padding calculation when the canvas node appears.
  $: if (canvasRef) {
    adjustCanvasPadding();
  }
</script>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .controls {
    flex: 0 0 auto;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--controls-bg, #111);
    border-bottom: 1px solid var(--controls-border, #333);
  }

  .modes {
    flex: 1 1 auto;
    display: flex;
    width: 100%;
    overflow: hidden;
  }

  @media (max-width: 1024px) {
    .controls {
      min-height: 55px;
      flex-wrap: wrap;
      top: 0;
      left: 0;
      right: 0;
      padding: 8px 10px;
      justify-content: space-between;
    }
  }
</style>

<div class="app">
  <div class="controls" bind:this={controlsRef} style={controlsStyle}>
    <LeftControls
      bind:currentSaveName
      {mode}
      {blocks}
      {savedList}
      {focusedBlockId}
      colors={controlColors.left}
      on:addBlock={(e) => addBlock(e.detail)}
      on:clear={clear}
      on:save={save}
      on:exportJSON={exportJSON}
      on:importJSON={(e) => importJSON(e.detail)}
      on:toggleMode={() => mode = mode === 'default' ? 'simple' : 'default'}
      on:undo={undo}
      on:redo={redo}
      on:moveUp={moveFocusedBlockUp}
      on:moveDown={moveFocusedBlockDown}
    />
    <div class="right-controls">
      <RightControls
        {savedList}
        {load}
        {deleteSave}
        {controlColors}
        on:updateColors={handleControlColorChange}
      />
    </div>
  </div>

  <div class="modes">
    {#key blocksKey}
      <ModeArea
        {mode}
        blocks={modeOrderedBlocks}
        {groupedBlocks}
        {focusedBlockId}
        bind:canvasRef
        canvasColors={canvasTheme}
        on:update={updateBlockHandler}
        on:delete={deleteBlockHandler}
        on:focusToggle={handleFocusToggle}
      />
    {/key}
  </div>
</div>
