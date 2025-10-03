<script>
  import { onMount, tick } from 'svelte';
  import RightControls from './advanced-param/RightControls.svelte';
  import LeftControls from './advanced-param/LeftControls.svelte';
  import ModeArea from './BACKUPS/ModeSwitcher.svelte';
  import { saveBlocks, loadBlocks, deleteBlocks, listSavedBlocks } from './storage.js';

  const DEFAULT_HISTORY_TRIGGERS = {
    text: ['position', 'size', 'bgColor', 'textColor'],
    cleantext: ['position', 'size', 'bgColor', 'textColor'],
    image: ['position', 'size', 'bgColor', 'textColor', 'src'],
    music: ['position', 'size', 'bgColor', 'textColor', 'trackUrl', 'title', 'content'],
    embed: ['position', 'size', 'bgColor', 'textColor', 'content'],
    __default: ['position', 'size', 'bgColor', 'textColor', 'content', 'src', 'trackUrl', 'title']
  };

  function applyHistoryTriggers(block) {
    const triggers =
      block.historyTriggers ??
      DEFAULT_HISTORY_TRIGGERS[block.type] ??
      DEFAULT_HISTORY_TRIGGERS.__default;
    return { ...block, historyTriggers: triggers };
  }

  let controlsRef;
  let canvasRef;

  let mode = "default";
  let blocks = [];
  let currentSaveName = "default";
  let savedList = [];
  let fileInputRef;
  let Pc = window.innerWidth > 1024;

  // --- Undo/Redo history ---
  let history = [];
  let historyIndex = -1;

  async function persistAutosave(blocksToPersist) {
    if (!currentSaveName) return;
    await saveBlocks(currentSaveName, blocksToPersist);
    savedList = await listSavedBlocks();
  }

  async function pushHistory(newBlocks) {
    const blocksWithVersion = newBlocks.map(b => ({
      ...b,
      _version: (b._version || 0) + 1,
      // ✅ deep-clone position & size so snapshots always have fresh refs
      position: { ...b.position },
      size: { ...b.size }
    }));

    const snapshot = JSON.stringify(blocksWithVersion);

    if (historyIndex >= 0 && history[historyIndex] === snapshot) {
      blocks = blocksWithVersion;
      await persistAutosave(blocksWithVersion);
      return;
    }

    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }

    history.push(snapshot);
    historyIndex++;

    blocks = blocksWithVersion;

    await persistAutosave(blocksWithVersion);
  }

  async function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      const snapshotBlocks = JSON.parse(history[historyIndex]).map(b => ({
        ...b,
        _version: (b._version || 0) + 1,
        position: { ...b.position },
        size: { ...b.size }
      }));
      blocks = snapshotBlocks;
      await persistAutosave(snapshotBlocks);
    }
  }

  async function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      const snapshotBlocks = JSON.parse(history[historyIndex]).map(b => ({
        ...b,
        _version: (b._version || 0) + 1,
        position: { ...b.position },
        size: { ...b.size }
      }));
      blocks = snapshotBlocks;
      await persistAutosave(snapshotBlocks);
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
    pushHistory(blocks);
  }

  function deleteBlockHandler(event) {
    blocks = blocks.filter(b => b.id !== event.detail.id);
    pushHistory(blocks);
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
      await pushHistory(blocks);
    } else {
      blocks = [...newBlocks];
      await persistAutosave(blocks);
    }
  }

  async function clear() {
    blocks = [];
    await pushHistory(blocks);
  }

  async function load(name) {
    blocks = [];
    currentSaveName = "";
    await tick();
    currentSaveName = name;
    blocks = (await loadBlocks(name)).map(b => ({
      ...applyHistoryTriggers(b),
      _version: 0
    }));

    history = [];
    historyIndex = -1;
    await pushHistory(blocks);
  }

  async function deleteSave(name) {
    await deleteBlocks(name);
    if (currentSaveName === name) blocks = [];
    savedList = await listSavedBlocks();

    history = [];
    historyIndex = -1;
    await pushHistory(blocks);
  }

  function exportJSON() {
    const dataStr = JSON.stringify(blocks, null, 2);
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
        if (Array.isArray(imported)) {
          blocks = imported.map(b => ({
            ...applyHistoryTriggers(b),
            _version: 0
          }));
          history = [];
          historyIndex = -1;
          await pushHistory(blocks);
          alert("Imported successfully!");
        } else alert("Invalid file structure!");
      } catch {
        alert("Invalid JSON file!");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function adjustCanvasPadding() {
    if (!canvasRef) return;
    if (window.innerWidth <= 1024) {
      canvasRef.style.setProperty("--controls-height", "75px");
    } else if (controlsRef) {
      canvasRef.style.setProperty(
        "--controls-height",
        `${controlsRef.offsetHeight}px`
      );
    }
  }

  onMount(async () => {
    window.addEventListener("resize", () => {
      adjustCanvasPadding();
      Pc = window.innerWidth > 1024;
    });
    adjustCanvasPadding();

    savedList = await listSavedBlocks();
    blocks = (await loadBlocks(currentSaveName)).map(b => ({
      ...applyHistoryTriggers(b),
      _version: 0
    }));

    history = [];
    historyIndex = -1;
    await pushHistory(blocks);
  });

  $: groupedBlocks = (() => {
    const groups = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const next = blocks[i + 1];
      if (
        block.type === "image" &&
        next &&
        (next.type === "text" || next.type === "cleantext")
      ) {
        groups.push({ type: "pair", image: block, text: next });
        i++;
      } else groups.push(block);
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
  background: #111;
  border-bottom: 1px solid #333;
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
  <div class="controls" bind:this={controlsRef}>
    <LeftControls
      bind:currentSaveName
      {mode}
      {blocks}
      {savedList}
      on:addBlock={(e) => addBlock(e.detail)}
      on:clear={clear}
      on:save={save}
      on:exportJSON={exportJSON}
      on:importJSON={(e) => importJSON(e.detail)}
      on:toggleMode={() => mode = mode === "default" ? "simple" : "default"}
      on:undo={undo}
      on:redo={redo}
    />
    <div class="right-controls">
      <RightControls {savedList} {load} {deleteSave}/>
    </div>
  </div>

  <div class="modes">
  <ModeArea
    {mode}
    {blocks}
    {groupedBlocks}
    bind:canvasRef
    on:update={updateBlockHandler}
    on:delete={deleteBlockHandler}
  />
  </div>
</div>

