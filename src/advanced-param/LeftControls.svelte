<script>
  import { createEventDispatcher, onMount } from "svelte";

  export let mode;
  export let modeLabels = {};
  export let currentSaveName;
  export let focusedBlockId = null;
  export let colors = {};


  const dispatch = createEventDispatcher();
  let fileInputRef;
  let compactUI = false; // now for <= 1024px
  let showMobileMenu = false;
  let menuRef;
  let toggleRef;
  let modeMenuRef;
  let modeButtonRef;
  let showModeLadder = false;
  const modeOptions = [
    { id: "default", label: "Canvas Mode" },
    { id: "simple", label: "Simple Note Mode" },
    { id: "single", label: "Single Note Mode" },
    { id: "habit", label: "Habit Tracker Mode" }
  ];

  const defaultColors = {
    panelBg: "#111111b0",
    textColor: "#ffffff",
    buttonBg: "#333333",
    buttonText: "#ffffff",
    borderColor: "#444444",
    inputBg: "#1d1d1d"
  };

  $: theme = { ...defaultColors, ...(colors || {}) };
  $: leftCssVars = Object.entries({
    "--left-panel-bg": theme.panelBg,
    "--left-text-color": theme.textColor,
    "--left-button-bg": theme.buttonBg,
    "--left-button-text": theme.buttonText,
    "--left-border-color": theme.borderColor,
    "--left-input-bg": theme.inputBg
  })
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");


  $: isSingleNoteMode = mode === "single";

  function addBlock(type) {
    if (isSingleNoteMode && type !== "text" && type !== "cleantext") return;
    dispatch("addBlock", type);
    if (compactUI) showMobileMenu = true;
  }

  function clear() {
    dispatch("clear");
    if (compactUI) showMobileMenu = false;
  }

  function save() {
    dispatch("save");
    if (compactUI) showMobileMenu = true;
  }

  function exportJSON() {
    dispatch("exportJSON");
    if (compactUI) showMobileMenu = false;
  }

  function importJSON(event) {
    dispatch("importJSON", event);
    if (compactUI) showMobileMenu = false;
  }

  function triggerFileInput() {
    fileInputRef.click();
  }

  function toggleModeMenu() {
    showModeLadder = !showModeLadder;
  }

  function selectMode(nextMode) {
    dispatch("setMode", nextMode);
    showModeLadder = false;
    if (compactUI) showMobileMenu = false;
  }

  function moveUp() {
    if (!focusedBlockId) return;
    dispatch("moveUp");
    if (compactUI) showMobileMenu = true;
  }

  function moveDown() {
    if (!focusedBlockId) return;
    dispatch("moveDown");
    if (compactUI) showMobileMenu = true;
  }

  function checkWidth() {
    compactUI = window.innerWidth <= 1024;
  }

  
  // Close when clicking outside to put for after button click on mobile phones and right controls too 
  function handleClickOutside(event) {
    if (
      showMobileMenu &&
      !menuRef.contains(event.target) &&
      !toggleRef.contains(event.target)
    ) {
      showMobileMenu = false;
    }

    if (
      showModeLadder &&
      !modeMenuRef?.contains(event.target) &&
      !modeButtonRef?.contains(event.target)
    ) {
      showModeLadder = false;
    }
  }


onMount(() => {
  checkWidth();
  window.addEventListener("resize", checkWidth);
  window.addEventListener("click", handleClickOutside); // << add this

  return () => {
    window.removeEventListener("resize", checkWidth);
    window.removeEventListener("click", handleClickOutside); // << cleanup
  };
});

</script>



<style>
  .left-controls-wrapper {
    display: contents;
  }

  .left-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    flex-grow: 1;
    color: var(--left-text-color, inherit);
  }

  .left-controls button,
  .left-controls input {
    border-radius: 6px;
    border: 1px solid var(--left-border-color, #444444);
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }

  .mode-switcher {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .mode-ladder {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 200px;
    background: var(--left-panel-bg, #111111);
    border: 1px solid var(--left-border-color, #333333);
    border-radius: 10px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 1002;
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.35);
  }

  .mode-ladder button {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
  }

  .mode-ladder button.active {
    background: rgba(127, 211, 255, 0.2);
    border-color: rgba(127, 211, 255, 0.5);
  }

  .left-controls button {
    background: var(--left-button-bg, #333333);
    color: var(--left-button-text, #ffffff);
    padding: 8px 12px;
    cursor: pointer;
  }

  .left-controls button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .left-controls input {
    background: var(--left-input-bg, #1d1d1d);
    color: var(--left-text-color, #ffffff);
    padding: 6px 8px;
  }

  .compact-toggle-btn {
    display: none;
    background: var(--left-button-bg, #222222);
    color: var(--left-button-text, #ffffff);
    border: 1px solid var(--left-border-color, #444444);
    border-radius: 6px;
    padding: 8px 12px;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }

  @media (max-width: 1024px) {
    .left-controls {
      display: none;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      background: var(--left-panel-bg, #111111b0);
      padding: 10px;
      border-radius: 0 0 8px 0;
      position: absolute;
      top: 71px;
      left: 0px;
      z-index: 999;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
    }
    .left-controls.show {
      display: flex;
    }
    .compact-toggle-btn {
      display: inline-block;
      position: fixed;
      top: 29px;
      left: 10px;
      z-index: 1000;
    }
  }
</style>

<div class="left-controls-wrapper" style={leftCssVars}>
  <!-- Toggle button for <= 1024px -->
  {#if compactUI}
    <button
      class="compact-toggle-btn"
      bind:this={toggleRef}
      on:click={() => (showMobileMenu = !showMobileMenu)}
    >
      {showMobileMenu ? "✖ Close" : "☰ Menu"}
    </button>
  {/if}

  <!-- Controls -->
  <div
    class="left-controls {showMobileMenu ? 'show' : ''}"
    bind:this={menuRef}
  >
    <div class="mode-switcher">
      <button
        bind:this={modeButtonRef}
        on:click={toggleModeMenu}
        aria-haspopup="listbox"
        aria-expanded={showModeLadder}
      >
        📝 {modeLabels?.[mode] ?? mode}
      </button>
      {#if showModeLadder}
        <div class="mode-ladder" bind:this={modeMenuRef} role="listbox">
          {#each modeOptions as option}
            <button
              class:active={option.id === mode}
              on:click={() => selectMode(option.id)}
              role="option"
              aria-selected={option.id === mode}
            >
              {option.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <button on:click={() => addBlock("text")}>+ Text</button>
    <button on:click={() => addBlock("cleantext")}>+ Clean Text</button>
    <button on:click={() => addBlock("image")} disabled={isSingleNoteMode}>+ Image</button>
    <button on:click={() => addBlock("music")} disabled={isSingleNoteMode}>+ Music</button>
    <button on:click={() => addBlock("embed")} disabled={isSingleNoteMode}>+ Embed</button>
    <button
      on:click={moveUp}
      disabled={!focusedBlockId}
      aria-label="Move block down"
      title="Move block down"
    >
      ⬇
    </button>
    <button
      on:click={moveDown}
      disabled={!focusedBlockId}
      aria-label="Move block up"
      title="Move block up"
    >
      ⬆
    </button>
    <button on:click={clear}>🗑️ Clear</button>
    <button on:click={exportJSON}>⬇ Export</button>
    <button on:click={triggerFileInput}>📁 Import JSON</button>
    <button on:click={() => dispatch('undo')}>↩ Undo</button>
    <button on:click={() => dispatch('redo')}>↪ Redo</button>

    <input
      type="file"
      accept="application/json"
      on:change={importJSON}
      bind:this={fileInputRef}
      style="display: none"
    />
    <input bind:value={currentSaveName} placeholder="File name" />
    <button on:click={save}>💾 Save</button>
  </div>
</div>
