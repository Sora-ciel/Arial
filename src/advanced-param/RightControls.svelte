<script>
  export let savedList = [];
  export let load;
  export let deleteSave;
  export let controlColors = {};
  export let themes = [];
  export let selectedThemeId = 'default-dark';
  export let firebaseReady = false;
  export let authUser = null;
  export let uploadInProgress = false;
  export let downloadInProgress = false;

  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import AdvancedParameters1 from "./AdvancedParameters1.svelte";
  import StylePresetPage from "./StylePresetPage.svelte";

  const dispatch = createEventDispatcher();

  let pc = true; // default until detected
  let isOpen = true;
  let hasMounted = false;
  let resizeHandler;
  let outsideClickHandler;
  let rightControlsRef;
  const RIGHT_CONTROLS_OPEN_KEY = "rightControlsOpen";

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

  function loadStoredOpenState() {
    if (typeof localStorage === "undefined") return null;
    try {
      const stored = localStorage.getItem(RIGHT_CONTROLS_OPEN_KEY);
      if (stored === null) return null;
      return JSON.parse(stored);
    } catch (error) {
      return null;
    }
  }

  function persistOpenState(open) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(RIGHT_CONTROLS_OPEN_KEY, JSON.stringify(open));
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  $: if (hasMounted) {
    persistOpenState(isOpen);
  }

  // Detect PC vs mobile
  onMount(() => {
    const storedOpenState = loadStoredOpenState();
    if (typeof storedOpenState === "boolean") {
      isOpen = storedOpenState;
    }
    const evaluate = () => {
      pc = window.innerWidth > 1024;
    };
    evaluate();
    resizeHandler = () => evaluate();
    outsideClickHandler = (event) => {
      if (!isOpen) return;
      if (!rightControlsRef?.contains(event.target)) {
        isOpen = false;
      }
    };
    window.addEventListener("resize", resizeHandler);
    window.addEventListener("click", outsideClickHandler);
    hasMounted = true;
  });

  onDestroy(() => {
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
    }
    if (outsideClickHandler) {
      window.removeEventListener("click", outsideClickHandler);
    }
  });

  function handleSelect(name) {
    load(name);
    // Auto-close dropdown only on mobile
    if (!pc) {
      isOpen = false;
    }
  }

  function signIn() {
    dispatch("googleSignIn");
  }

  function signOut() {
    dispatch("googleSignOut");
  }

  function uploadNow() {
    dispatch("uploadNow");
  }

  function downloadNow() {
    dispatch("downloadNow");
  }

  function handleColorChange(event) {
    dispatch("updateColors", event.detail);
  }

  function handleThemeSelect(event) {
    dispatch("selectTheme", event.detail);
    if (!pc) {
      isOpen = false;
    }
  }

  function openAdvancedCssPage() {
    dispatch("openAdvancedCss");
    if (!pc) {
      isOpen = false;
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
    width: 260px;
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
    box-sizing: border-box;
    padding-bottom: 32px;
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
    width: min(320px, 85vw);
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

  .create-theme-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--right-button-bg, #333333);
    color: var(--right-button-text, #ffffff);
    border: 1px solid var(--right-border-color, #444444);
    cursor: pointer;
    font-size: 0.82rem;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    margin-bottom: 10px;
  }

  .create-theme-btn:hover {
    background: var(--right-button-text, #ffffff);
    color: var(--right-panel-bg, #222222);
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

<div class="right-controls" style={rightCssVars} bind:this={rightControlsRef}>
  <details bind:open={isOpen}>
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

        {#if firebaseReady}
          <div class="tab-section">
            <h4>☁️ Cloud</h4>
            {#if authUser}
              <button class="create-theme-btn" type="button" on:click={uploadNow} disabled={uploadInProgress}>
                {uploadInProgress ? "⏳ Uploading..." : "⤴ Upload to Cloud"}
              </button>
              <button class="create-theme-btn" type="button" on:click={downloadNow} disabled={downloadInProgress}>
                {downloadInProgress ? "⏳ Downloading..." : "⤵ Download from Cloud"}
              </button>
              <button class="create-theme-btn" type="button" on:click={signOut}>🚪 Sign Out</button>
              <p class="empty-state">Signed in as {authUser.displayName || authUser.email || authUser.uid}</p>
            {:else}
              <button class="create-theme-btn" type="button" on:click={signIn}>🔐 Sign in Google</button>
            {/if}
          </div>
        {/if}

        <div class="tab-section">
          <h4>🧩 Style Presets</h4>
          <button class="create-theme-btn" type="button" on:click={openAdvancedCssPage}>
            ✨ Create custom theme
          </button>
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
