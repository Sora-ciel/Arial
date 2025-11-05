<script>
  export let savedList = [];
  export let load;
  export let deleteSave;
  export let controlColors = {};
  export let themes = [];
  export let selectedThemeId = 'default-dark';

  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import AdvancedParameters1 from "./AdvancedParameters1.svelte";
  import StylePresetPage from "./StylePresetPage.svelte";

  const dispatch = createEventDispatcher();

  let pc = true; // default until detected
  let detailsEl; // reference to <details>
  let resizeHandler;

  const defaultColors = {
    panelBg: "#222222",
    textColor: "#ffffff",
    buttonBg: "#222222",
    buttonText: "#ffffff",
    borderColor: "#444444"
  };

  $: rightTheme = {
    ...defaultColors,
    ...((controlColors && controlColors.right) || {})
  };

  $: rightCssVars = Object.entries({
    "--right-panel-bg": rightTheme.panelBg,
    "--right-text-color": rightTheme.textColor,
    "--right-button-bg": rightTheme.buttonBg,
    "--right-button-text": rightTheme.buttonText,
    "--right-border-color": rightTheme.borderColor
  })
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");

  // Detect PC vs mobile
  onMount(() => {
    const evaluate = () => {
      pc = window.innerWidth > 1024;
    };
    evaluate();
    resizeHandler = () => evaluate();
    window.addEventListener("resize", resizeHandler);
  });

  onDestroy(() => {
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
    }
  });

  function handleSelect(name) {
    load(name);
    // Auto-close dropdown only on mobile
    if (!pc && detailsEl) {
      detailsEl.open = false;
    }
  }

  function handleColorChange(event) {
    dispatch("updateColors", event.detail);
  }

  function handleThemeSelect(event) {
    dispatch("selectTheme", event.detail);
    if (!pc && detailsEl) {
      detailsEl.open = false;
    }
  }
</script>



<style>

  /* Remove list bullets and extra padding/margin */
.controls-scroll ul,
.controls-scroll li {
  list-style: none;
  margin: 0;
  padding: 0;
}


  .right-controls summary {
    all: unset; /* remove browser default styles */
    display: block;
    cursor: pointer;
    padding: 6px 12px;
    background: var(--right-button-bg, #222222);
    color: var(--right-button-text, #ffffff);
    border-radius: 6px;
    border: 1px solid var(--right-border-color, #444444);
    font-weight: bold;
    transition: background 0.2s ease;
  }

  .right-controls details[open] .dropdown-content {
    display: block;
  }

  .right-controls details {
    position: relative;
    cursor: pointer;
  }

  .dropdown-content {
    display: none;
    position: fixed;
    top: 56px; /* same as controls height */
    right: 0;
    bottom: 0;
    width: 220px;
    background: var(--right-panel-bg, #222222);
    border-left: 1px solid var(--right-border-color, #444444);
    z-index: 999;
    box-shadow: -2px 0 10px rgba(0,0,0,0.4);
    color: var(--right-text-color, #ffffff);
  }

  .controls-scroll {
    height: 100%;
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  /* Optional: make it more mobile-friendly */
  @media (max-width: 1024px) {
  .right-controls {
    position: fixed;
    top: 29px;
    right: 10px;
    z-index: 1000; /* make sure it stays above the canvas */
  }

    .dropdown-content {
    display: none;
    position: fixed;
    top: 71px;
    right: 0;
    bottom: 0;
    width: min(280px, 80vw);
    background: var(--right-panel-bg, #222222);
    border-left: 1px solid var(--right-border-color, #444444);
    padding: 0;
    overflow-y: auto;
    z-index: 999;
    box-shadow: -2px 0 10px rgba(0,0,0,0.4);
  }

    .controls-scroll {
      padding: 12px;
    }

}

  .controls-scroll ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .controls-scroll li {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .controls-scroll li button {
    flex: 1 1 auto;
    padding: 6px 10px;
    background: var(--right-button-bg, #333333);
    color: var(--right-button-text, #ffffff);
    border: 1px solid var(--right-border-color, #444444);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }

  .controls-scroll li button:last-child {
    flex: 0 0 auto;
    padding: 6px 8px;
  }

  .tab-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tab-section h4 {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.85;
  }

  .empty-state {
    font-size: 0.8rem;
    opacity: 0.65;
  }
</style>

<div class="right-controls" style={rightCssVars}>
  <details bind:this={detailsEl} open>
    <summary>⚙️ Parameters</summary>

    <div class="dropdown-content">
      <div class="controls-scroll">
        <div class="tab-section">
          <h4>📂 Saved Files</h4>
          {#if savedList.length}
            <ul>
              {#each savedList as name}
                <li>
                  <button on:click={() => handleSelect(name)}>{name}</button>
                  <button on:click={() => deleteSave(name)}>🗑</button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="empty-state">No saved scenes yet.</p>
          {/if}
        </div>

        <div class="tab-section">
          <h4>🧩 Style Presets</h4>
          <StylePresetPage
            {themes}
            {selectedThemeId}
            on:selectTheme={handleThemeSelect}
          />
        </div>

        <div class="tab-section">
          <h4>🎨 Fine-tune colors</h4>
          <AdvancedParameters1 {controlColors} on:change={handleColorChange} />
        </div>
      </div>
    </div>
  </details>
</div>
