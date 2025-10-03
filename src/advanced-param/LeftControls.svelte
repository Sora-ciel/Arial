<script>
  import { tick, createEventDispatcher, onMount } from "svelte";

  export let mode;
  export let currentSaveName;


  const dispatch = createEventDispatcher();
  let fileInputRef;
  let compactUI = false; // now for <= 1024px
  let showMobileMenu = false;
  let menuRef;
  let toggleRef;


  function addBlock(type) {
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

  function toggleMode() {
    dispatch("toggleMode");
    if (compactUI) showMobileMenu = false;
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
.left-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-grow: 1;
}

.compact-toggle-btn {
  display: none;
}

@media (max-width: 1024px) {
  .left-controls {
    display: none;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    background: #111111b0;
    padding: 10px;
    border-radius: 0 0 8px 0;
    position: absolute;
    top: 71px;
    left: 0px;
    z-index: 999;
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
    background: #222;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 12px;
    font-weight: bold;
    cursor: pointer;
  }
}
</style>

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
<div class="left-controls {showMobileMenu ? 'show' : ''}"bind:this={menuRef}>
  <button on:click={toggleMode}>
    📝 {mode === "default" ? "Simple Note Mode" : "Canvas Mode"}
  </button>
  <button on:click={() => addBlock("text")}>+ Text</button>
  <button on:click={() => addBlock("cleantext")}>+ Clean Text</button>
  <button on:click={() => addBlock("image")}>+ Image</button>
  <button on:click={() => addBlock("music")}>+ Music</button>
  <button on:click={() => addBlock("embed")}>+ Embed</button>
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
