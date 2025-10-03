<script> 
  export let savedList = [];
  export let load;
  export let deleteSave;

  let pc = true; // default until detected
  let detailsEl; // reference to <details>

  // Detect PC vs mobile
  import { onMount } from "svelte";
  onMount(() => {
    pc = window.innerWidth > 1024;
    window.addEventListener("resize", () => {
      pc = window.innerWidth > 1024;
    });
  });

  function handleSelect(name) {
    load(name);
    // Auto-close dropdown only on mobile
    if (!pc && detailsEl) {
      detailsEl.open = false;
    }
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
    background: #222;
    color: #fff;
    border-radius: 4px;
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
    background: #222;
    border-left: 1px solid #444;
    padding: 16px;
    overflow-y: auto;
    z-index: 999;
    box-shadow: -2px 0 10px rgba(0,0,0,0.4);
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
    background: #222;
    border-left: 1px solid #444;
    padding: 10px;
    overflow-y: auto;
    z-index: 999;
    box-shadow: -2px 0 10px rgba(0,0,0,0.4);
  }

}
</style>

<div class="right-controls">
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
    </div>
  </details>
</div>
