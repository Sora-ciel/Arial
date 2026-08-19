<script>
  export let savedList = [];
  export let load;
  export let deleteSave;
  export let createNewFile;
  export let controlColors = {};
  export let themes = [];
  export let selectedThemeId = 'default-dark';
  export let firebaseReady = false;
  export let authUser = null;
  export let uploadInProgress = false;
  export let downloadInProgress = false;
  export let autoSyncEnabled = false;

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

  function handleCreateNewFile() {
    createNewFile?.();
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

  function toggleAutoSync() {
    dispatch("toggleAutoSync");
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
    min-height: 42px;
    box-sizing: border-box;
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
    top: var(--controls-height, 56px);
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
    position: static;
    z-index: 1003;
  }

    /* Header button only — the controls inside the drawer keep their own size. */
    .right-controls summary {
      min-height: 36px;
      padding: 5px 11px;
      font-size: 0.98rem;
      display: flex;
      align-items: center;
    }

    .dropdown-content {
    display: none;
    position: fixed;
    top: calc(var(--controls-height, 56px) + 8px);
    right: 8px;
    bottom: auto;
    width: min(56vw, 240px);
    max-width: 92vw;
    max-height: calc(100dvh - var(--controls-height, 56px) - 16px);
    background: var(--right-panel-bg, #222222);
    border: 1px solid var(--right-border-color, #444444);
    border-radius: 12px;
    padding: 0;
    overflow-y: auto;
    z-index: 1002;
    box-shadow: -2px 0 10px rgba(0,0,0,0.4);
  }

    .controls-scroll {
      padding: 10px;
      gap: 10px;
    }

    .tab-section { gap: 7px; }

    /* The narrow drawer would otherwise wrap these headings onto two lines. */
    .tab-section h4 {
      font-size: 0.72rem;
      letter-spacing: 0.04em;
    }

    .collapsible-section > .section-summary { padding: 2px 0; }
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

  /* Folded-away section: the summary row is the only thing showing when shut. */
  .collapsible-section > .section-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    list-style: none;
    padding: 4px 0;
  }
  .collapsible-section > .section-summary::-webkit-details-marker { display: none; }
  .collapsible-section > .section-summary::after {
    content: '▾';
    margin-left: auto;
    font-size: 0.7rem;
    opacity: 0.7;
    transition: transform 0.15s ease;
  }
  .collapsible-section[open] > .section-summary::after { transform: rotate(180deg); }

  .empty-state {
    font-size: 0.8rem;
    opacity: 0.65;
  }


</style>

<div class="right-controls" style={rightCssVars} bind:this={rightControlsRef}>
  <details bind:open={isOpen}>
    <summary>⚙️ Settings</summary>

    <div class="dropdown-content">
      <div class="controls-scroll">
        <div class="tab-section">
          <h4>📂 Saved Files</h4>
          <button class="create-theme-btn" type="button" on:click={handleCreateNewFile}>
            ➕ New File
          </button>
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
              <button class="create-theme-btn" type="button" on:click={toggleAutoSync}>
                {autoSyncEnabled ? "🟢 Auto Sync: ON" : "⚪ Auto Sync: OFF"}
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

        <!-- Much the longest section in the drawer, and rarely the reason it
             was opened — keep it folded away until it's actually wanted. -->
        <details class="tab-section collapsible-section">
          <summary class="section-summary"><h4>🎨 Fine-tune colors</h4></summary>
          <AdvancedParameters1 {controlColors} on:change={handleColorChange} />
        </details>
      </div>
    </div>
  </details>
</div>
