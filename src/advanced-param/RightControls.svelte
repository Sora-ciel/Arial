<script> 
  export let savedList = [];
  export let load;
  export let deleteSave;
  export let controlColors = {};

  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import AdvancedParameters1 from "./AdvancedParameters1.svelte";

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
</script>



<style>

  /* Remove list bullets and extra padding/margin */
.dropdown-content ul,
.dropdown-content li {
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
    width: 200px;
    background: var(--right-panel-bg, #222222);
    border-left: 1px solid var(--right-border-color, #444444);
    padding: 16px;
    overflow-y: auto;
    z-index: 999;
    box-shadow: -2px 0 10px rgba(0,0,0,0.4);
    color: var(--right-text-color, #ffffff);
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
    width: 200px;
    background: var(--right-panel-bg, #222222);
    border-left: 1px solid var(--right-border-color, #444444);
    padding: 10px;
    overflow-y: auto;
    z-index: 999;
    box-shadow: -2px 0 10px rgba(0,0,0,0.4);
  }

}

  .dropdown-content h4 {
    margin: 0 0 10px;
  }

  .dropdown-content ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dropdown-content li {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .dropdown-content button {
    flex: 1 1 auto;
    padding: 6px 10px;
    background: var(--right-button-bg, #333333);
    color: var(--right-button-text, #ffffff);
    border: 1px solid var(--right-border-color, #444444);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }

  .dropdown-content li button:last-child {
    flex: 0 0 auto;
    padding: 6px 8px;
  }

  .dropdown-content hr {
    border: none;
    border-top: 1px solid var(--right-border-color, #444444);
    margin: 14px 0;
  }
</style>

<div class="right-controls" style={rightCssVars}>
  <details bind:this={detailsEl}>
    <summary>⚙️ Parameters</summary>

    <div class="dropdown-content">
      <h4>📂 Saved Files</h4>
      <ul>
        {#each savedList as name}
          <li>
            <button on:click={() => handleSelect(name)}>{name}</button>
            <button on:click={() => deleteSave(name)}>🗑</button>
          </li>
        {/each}
      </ul>
      <hr />
      <AdvancedParameters1 {controlColors} on:change={handleColorChange} />
    </div>
  </details>
</div>
