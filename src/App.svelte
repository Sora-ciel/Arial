<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import RightControls from './advanced-param/RightControls.svelte';
  import LeftControls from './advanced-param/LeftControls.svelte';
  import ModeArea from './BACKUPS/ModeSwitcher.svelte';
  import { saveBlocks, loadBlocks, deleteBlocks, listSavedBlocks } from './storage.js';

  const CONTROL_COLOR_DEFAULTS = {
    left: {
      panelBg: '#111111b0',
      textColor: '#ffffff',
      buttonBg: '#333333',
      buttonText: '#ffffff',
      borderColor: '#444444',
      inputBg: '#1d1d1d'
    },
    right: {
      panelBg: '#222222',
      textColor: '#ffffff',
      buttonBg: '#222222',
      buttonText: '#ffffff',
      borderColor: '#444444'
    }
  };

  const CONTROL_COLOR_STORAGE_KEY = 'controlColors';

  function normalizeControlColors(raw = {}) {
    const left = {
      ...CONTROL_COLOR_DEFAULTS.left,
      ...(raw.left || {})
    };

    const right = {
      ...CONTROL_COLOR_DEFAULTS.right,
      ...(raw.right || {})
    };

    return { left, right };
  }

  function loadStoredControlColors() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const serialized = localStorage.getItem(CONTROL_COLOR_STORAGE_KEY);
      if (!serialized) return null;
      const parsed = JSON.parse(serialized);
      return normalizeControlColors(parsed);
    } catch (error) {
      return null;
    }
  }

  function persistControlColors(colors) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        CONTROL_COLOR_STORAGE_KEY,
        JSON.stringify(colors)
      );
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  let controlColors = normalizeControlColors();

  function handleControlColorChange(event) {
    const { side, key, value } = event.detail || {};
    if (!side || !key) return;

    const nextSideTheme = {
      ...controlColors[side],
      [key]: value
    };

    if (side === 'left' && key === 'panelBg') {
      nextSideTheme.inputBg = value;
    }

    controlColors = {
      ...controlColors,
      [side]: nextSideTheme
    };

    persistControlColors(controlColors);
  }

  onMount(() => {
    const stored = loadStoredControlColors();
    if (stored) {
      controlColors = stored;
    }
  });

  const DEFAULT_HISTORY_TRIGGERS = {
    text: ['position', 'size', 'bgColor', 'textColor'],
    cleantext: ['position', 'size', 'bgColor', 'textColor'],
    image: ['position', 'size', 'bgColor', 'textColor', 'src'],
    music: ['position', 'size', 'bgColor', 'textColor', 'trackUrl', 'title', 'content'],
    embed: ['position', 'size', 'bgColor', 'textColor', 'content'],
    __default: ['position', 'size', 'bgColor', 'textColor', 'content', 'src', 'trackUrl', 'title']
  };

  const KNOWN_MODES = ["default", "simple"];

  function applyHistoryTriggers(block) {
    const triggers =
      block.historyTriggers ??
      DEFAULT_HISTORY_TRIGGERS[block.type] ??
      DEFAULT_HISTORY_TRIGGERS.__default;
    return { ...block, historyTriggers: triggers };
  }

  function ensureModeOrders(allBlocks, incomingOrders = {}) {
    const idsInBlockOrder = allBlocks.map(block => block.id);
    const validIds = new Set(idsInBlockOrder);
    const modeNames = new Set([
      ...KNOWN_MODES,
      ...Object.keys(incomingOrders || {})
    ]);

    const normalized = {};
    for (const name of modeNames) {
      const existing = Array.isArray(incomingOrders?.[name])
        ? incomingOrders[name].filter(id => validIds.has(id))
        : [];
      const missing = idsInBlockOrder.filter(id => !existing.includes(id));
      normalized[name] = [...existing, ...missing];
    }

    return normalized;
  }

  function cloneModeOrders(orders) {
    const clone = {};
    for (const [modeName, order] of Object.entries(orders || {})) {
      clone[modeName] = [...order];
    }
    return clone;
  }

  function cloneState(blockList, orders, { bumpVersion = true } = {}) {
    const normalizedOrders = ensureModeOrders(blockList, orders);
    const blocksClone = blockList.map(block => ({
      ...block,
      _version: bumpVersion ? (block._version || 0) + 1 : block._version ?? 0,
      position: { ...block.position },
      size: { ...block.size }
    }));

    return {
      blocks: blocksClone,
      modeOrders: cloneModeOrders(normalizedOrders)
    };
  }

  function serializeState(blockList, orders, { bumpVersion = false } = {}) {
    const snapshot = cloneState(blockList, orders, { bumpVersion });
    return JSON.stringify(snapshot);
  }

  let controlsRef;
  let canvasRef;
  let controlsResizeObserver;
  let observedControlsEl;

  let mode = "default";
  let blocks = [];
  let modeOrders = {};
  let normalizedModeOrders = ensureModeOrders(blocks, modeOrders);
  let modeOrderedBlocks = [];
  let focusedBlockId = null;
  let blocksRenderNonce = 0;
  $: normalizedModeOrders = ensureModeOrders(blocks, modeOrders);
  $: blocksKey = `${blocksRenderNonce}:${(normalizedModeOrders[mode] || [])
    .join('|')}:${blocks
    .map(b => `${b.id}:${b._version ?? 0}`)
    .join('|')}`;
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
  let currentSaveName = "default";
  let savedList = [];
  let fileInputRef;
  $: leftTheme = controlColors.left || CONTROL_COLOR_DEFAULTS.left;
  $: controlsStyle = `--controls-bg: ${leftTheme.panelBg}; --controls-border: ${leftTheme.borderColor};`;
  $: canvasTheme = controlColors.canvas || CONTROL_COLOR_DEFAULTS.canvas;
  let Pc = window.innerWidth > 1024;

  // --- Undo/Redo history ---
  let history = [];
  let historyIndex = -1;
  let hasUnsnapshottedChanges = false;

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

  async function undo() {
    await ensureCurrentHistorySnapshot();

    if (historyIndex > 0) {
      historyIndex--;
      const snapshotState = JSON.parse(history[historyIndex]) || {};
      const snapshotBlocks = (snapshotState.blocks || []).map(b => ({
        ...b,
        _version: (b._version || 0) + 1,
        position: { ...b.position },
        size: { ...b.size }
      }));
      const snapshotOrders = ensureModeOrders(
        snapshotBlocks,
        snapshotState.modeOrders
      );
      blocks = [...snapshotBlocks];
      modeOrders = cloneModeOrders(snapshotOrders);
      blocksRenderNonce += 1;
      await persistAutosave(snapshotBlocks, snapshotOrders);
    }
  }

  async function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      const snapshotState = JSON.parse(history[historyIndex]) || {};
      const snapshotBlocks = (snapshotState.blocks || []).map(b => ({
        ...b,
        _version: (b._version || 0) + 1,
        position: { ...b.position },
        size: { ...b.size }
      }));
      const snapshotOrders = ensureModeOrders(
        snapshotBlocks,
        snapshotState.modeOrders
      );
      blocks = [...snapshotBlocks];
      modeOrders = cloneModeOrders(snapshotOrders);
      blocksRenderNonce += 1;
      await persistAutosave(snapshotBlocks, snapshotOrders);
    }
  }

  // --- Block operations ---
  function addBlock(type = "text") {
    const newBlock = applyHistoryTriggers({
      id: crypto.randomUUID(),
      type,
      content: "",
      src: "",
      position: { x: 100, y: 100 },
      size: { width: 300, height: 200 },
      bgColor: "#000000",
      textColor: "#ffffff",
      _version: 0
    });
    blocks = [...blocks, newBlock];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    pushHistory(blocks, modeOrders);
  }

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
    if (typeof pushToHistory === "boolean") {
      shouldSnapshot = pushToHistory;
    } else if (normalizedChangedKeys.length) {
      shouldSnapshot = normalizedChangedKeys.some(key =>
        historyTriggers.includes(key)
      );
    } else {
      shouldSnapshot = true;
    }

    // ✅ always clone position & size so reactivity triggers
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
      await persistAutosave(blocks, modeOrders);
      hasUnsnapshottedChanges = true;
    }
  }

  async function clear() {
    blocks = [];
    focusedBlockId = null;
    modeOrders = ensureModeOrders(blocks, modeOrders);
    await pushHistory(blocks, modeOrders);
  }

  async function load(name) {
    blocks = [];
    currentSaveName = "";
    focusedBlockId = null;
    await tick();
    currentSaveName = name;
    persistLastSaveName(name);
    const loaded = await loadBlocks(name);
    const loadedBlocks = Array.isArray(loaded)
      ? loaded
      : Array.isArray(loaded?.blocks)
      ? loaded.blocks
      : [];
    const loadedOrders = !Array.isArray(loaded)
      ? loaded?.modeOrders
      : {};
    blocks = loadedBlocks.map(b => ({
      ...applyHistoryTriggers(b),
      _version: 0
    }));
    modeOrders = ensureModeOrders(blocks, loadedOrders);

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
  }

  async function deleteSave(name) {
    await deleteBlocks(name);
    if (currentSaveName === name) blocks = [];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    if (focusedBlockId && !blocks.some(b => b.id === focusedBlockId)) {
      focusedBlockId = null;
    }
    savedList = await listSavedBlocks();

    if (loadStoredLastSaveName() === name) {
      persistLastSaveName(currentSaveName === name ? "" : currentSaveName);
    }

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
  }

  function exportJSON() {
    const dataStr = JSON.stringify(
      {
        blocks,
        modeOrders: ensureModeOrders(blocks, modeOrders)
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentSaveName || "codex-blocks"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported) || (imported && typeof imported === "object")) {
          const importedBlocks = Array.isArray(imported)
            ? imported
            : Array.isArray(imported.blocks)
            ? imported.blocks
            : [];
          const importedOrders = Array.isArray(imported)
            ? {}
            : imported.modeOrders;
          blocks = importedBlocks.map(b => ({
            ...applyHistoryTriggers(b),
            _version: 0
          }));
          modeOrders = ensureModeOrders(blocks, importedOrders);
          focusedBlockId = null;
          history = [];
          historyIndex = -1;
          await pushHistory(blocks, modeOrders);
          alert("Imported successfully!");
        } else alert("Invalid file structure!");
      } catch {
        alert("Invalid JSON file!");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function setControlsHeight(value) {
    const px = `${value}px`;
    if (canvasRef) {
      canvasRef.style.setProperty("--controls-height", px);
    }
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--controls-height", px);
    }
  }

  function adjustCanvasPadding() {
    if (typeof window === "undefined") return;

    if (window.innerWidth <= 1024) {
      setControlsHeight(75);
      return;
    }

    const height = controlsRef?.offsetHeight || 56;
    setControlsHeight(height);
  }

  function setupControlsObserver() {
    if (typeof ResizeObserver === "undefined" || !controlsRef) {
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

  const handleWindowResize = () => {
    adjustCanvasPadding();
    Pc = window.innerWidth > 1024;
  };

  function handleFocusToggle(event) {
    const { id } = event.detail || {};
    if (!id) {
      focusedBlockId = null;
      return;
    }

    focusedBlockId = focusedBlockId === id ? null : id;
  }

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

  $: if (
    focusedBlockId &&
    !blocks.some(block => block.id === focusedBlockId)
  ) {
    focusedBlockId = null;
  }

  onMount(async () => {
    Pc = window.innerWidth > 1024;
    window.addEventListener("resize", handleWindowResize);
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
    blocks = initialBlocks.map(b => ({
      ...applyHistoryTriggers(b),
      _version: 0
    }));
    modeOrders = ensureModeOrders(blocks, initialOrders);

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
    persistLastSaveName(currentSaveName);
  });

  onDestroy(() => {
    window.removeEventListener("resize", handleWindowResize);
    controlsResizeObserver?.disconnect();
    observedControlsEl = null;
  });

  $: if (controlsRef) {
    setupControlsObserver();
    adjustCanvasPadding();
  }

  $: if (canvasRef) {
    adjustCanvasPadding();
  }

  $: groupedBlocks = (() => {
    const groups = [];
    for (let i = 0; i < modeOrderedBlocks.length; i++) {
      const block = modeOrderedBlocks[i];
      const next = modeOrderedBlocks[i + 1];
      if (
        block.type === "image" &&
        next &&
        (next.type === "text" || next.type === "cleantext")
      ) {
        groups.push({ type: "pair", image: block, text: next });
        i++;
      } else {
        groups.push(block);
      }
    }
    return groups;
  })();
</script>








<style>

  .app {
  display: flex;
  flex-direction: column;
  height: 100vh; /* full app height */
}
.controls {
  flex: 0 0 auto;  /* only as tall as needed */
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
  flex: 1 1 auto;  /* take the rest of the height */
  display: flex;
  width: 100%;
  overflow: hidden; /* so canvas doesn’t spill */
}


/* Optional: make it more mobile-friendly */
/* Mobile adjustments */
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
      on:toggleMode={() => mode = mode === "default" ? "simple" : "default"}
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

