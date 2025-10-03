<script>
  import { createEventDispatcher, onMount } from 'svelte';

  export let blocks = [];
  const dispatch = createEventDispatcher();

  function deleteBlock(id) {
    dispatch('delete', { id });
  }

  function updateBlock(id, updates, { pushToHistory = true } = {}) {
    dispatch('update', { id, ...updates, pushToHistory });
  }

  function autoResize(textarea) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }




  function focusScroll(el) {
    if (!el) return;
      if (window.innerWidth <= 1024)
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  



  // Resize all textareas when component mounts
  onMount(() => {
    const textareas = document.querySelectorAll("textarea");
    textareas.forEach(autoResize);
  });
</script>






<style>
/* ========== MOBILE (default) ========== */
.simple-wrapper {
  display: grid;
  grid-template-columns: 1fr;   /* single column */
  gap: 1rem;
  justify-content: center;
  padding: 0;
  overflow-y: auto;
  width: 100%;
  max-width: 1920px;
  margin: 0 auto;
}

.canvas {
  background: #00000041;
  border-radius: 8px;
  padding: 5px;
  margin-bottom: 0;
  width: 100%;
  box-sizing: border-box;
}

.container {
  background: var(--bg-color);
  color: var(--text-color);
  padding: 4px;
  width: 100%;
  box-sizing: border-box;
  border-radius: 20px;
  overflow: hidden;
  border: 2px solid var(--text-color);
  box-shadow: 0 0 2px 1px var(--text-color),
              0 0 6px 2px var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
}

textarea {
  width: 100%;
  min-height: 50px;
  border: none;
  border-radius: 20px;
  resize: none;
  margin: 0;
  padding: 10px;
  background: transparent;
  color: var(--text-color);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 1em;
  font-weight: bold;
  box-sizing: border-box;
}

textarea:focus {
  color: var(--bg-color);
  outline: none;
  background: var(--text-color);
}

.container img {
  width: 100%;
  height: auto;
  max-height: 1080px;
  object-fit: contain;
  border-radius: 14px;
}

input[type="text"] {
  width: 100%;
  border-radius: 6px;
  border: none;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 1rem;
  margin-top: 8px;
}

li {
  list-style: none;
  margin: 0;
  padding: 0;
}

.edit-button,
.delete-button {
  background: transparent;
  color: var(--text-color);
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
}

.edit-button {
  align-self: flex-start;
}

.delete-button {
  align-self: flex-end;
  margin-right: 10px;
}

.footer {
  height: 600px;
  width: 100%;
  background: #000;
}


/* ========== PC (desktop) ========== */
@media (min-width: 1024px) {
  .simple-wrapper {
    display: flex;          /* horizontal layout per row */
    flex-wrap: wrap;        /* allow multiple rows */
    gap: 0rem;
    justify-content: flex-start;
    max-width: 1920px;
    margin: 0 auto;
  }

  .canvas {
    display: flex;
    flex: 1 1 48%;          /* roughly half width per block */
    min-width: 300px;       /* optional for responsiveness */
    margin-bottom: 0rem;
    background: #00000041;
    border-radius: 8px;
    padding: 5px;
    box-sizing: border-box;
  }


}

.container img {
  width: auto;
  height: 100%;
  max-height: 500px;
  object-fit: contain;
  border-radius: 14px;
}






</style>









<div class="simple-wrapper">
  {#each blocks as block (block.id + (block.type !== 'text' && block.type !== 'cleantext' ? '-' + (block._version || 0) : ''))}
    <div class="canvas">
      <div
        class="container"
        style="--bg-color: {block.bgColor}; --text-color: {block.textColor};"
      >
        {#if block.type === 'text' || block.type === 'cleantext'}
          <textarea
            bind:value={block.content}
            spellcheck="false"
            rows="1"
            style="overflow:hidden;"
            on:input={(e) => {
              autoResize(e.target);
              updateBlock(block.id, { content: e.target.value }, { pushToHistory: false });
            }}
            on:focus={(e) => focusScroll(e.target)}
            placeholder="Type your note here..."
          ></textarea>
          <button class="delete-button" on:click={() => deleteBlock(block.id)}>
           ×
          </button>
        {:else if block.type === 'image'}
          <img src={block.src} alt="Image block" />
          <li>
            <button
              class="edit-button"
              on:click={() =>
                updateBlock(block.id, { editing: !block.editing })
              }
            >
              {block.editing ? 'Done' : 'Edit'}
            </button>
            {#if block.editing}
              <input
                type="text"
                placeholder="Image URL"
                value={block.src}
                on:input={(e) => updateBlock(block.id, { src: e.target.value })}
              />
            {/if}
            <button class="delete-button" on:click={() => deleteBlock(block.id)}>
              ×
            </button>
          </li>

        {:else if block.type === 'music'}
          <p>🎵 {block.content}</p>
          <button class="delete-button" on:click={() => deleteBlock(block.id)}>
           ×
          </button>
        {:else if block.type === 'embed'}
          <p>[Embed: {block.content}]</p>
          <button class="delete-button" on:click={() => deleteBlock(block.id)}>
           ×
          </button>
        {/if}


      </div>
    </div>
  {/each}
  <div class="footer"></div>
</div>
