<script>
  import { createEventDispatcher, onMount } from 'svelte';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  const dispatch = createEventDispatcher();

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};`;

  function deleteBlock(id) {
    dispatch('delete', { id });
  }

  function updateBlock(id, updates, { pushToHistory, changedKeys } = {}) {
    const detail = { id, ...updates };
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length
      ? changedKeys
      : Object.keys(updates || {});

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }

  function toggleFocus(id) {
    dispatch('focusToggle', { id });
  }

  function ensureFocus(id) {
    if (focusedBlockId !== id) {
      dispatch('focusToggle', { id });
    }
  }

  function handleBlockClick(event, id) {
    if (event.defaultPrevented) return;
    if (event.target.closest('[data-focus-guard]')) {
      ensureFocus(id);
      return;
    }
    toggleFocus(id);
  }

  function handleBlockKeydown(event, id) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    handleBlockClick(event, id);
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
  grid-template-columns: 1fr;
  gap: 1rem;
  justify-content: center;
  padding: clamp(12px, 2vw, 24px);
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  flex: 1 1 100%;
  min-width: 0;
  box-sizing: border-box;
}

.canvas {
  background: var(--canvas-outer-bg, #00000041);
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
  outline: 2px solid transparent;
  transition: box-shadow 0.15s ease, outline 0.15s ease;
}

.container.focused {
  outline: 2px solid rgba(110, 168, 255, 0.85);
  box-shadow: 0 0 0 2px rgba(110, 168, 255, 0.35),
              0 0 12px rgba(110, 168, 255, 0.5);
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
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    justify-content: stretch;
    max-width: 1400px;
  }

  .canvas {
    margin-bottom: 0;
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









<div class="simple-wrapper" bind:this={canvasRef} style={canvasCssVars}>
  {#each blocks as block (block.id + (block.type !== 'text' && block.type !== 'cleantext' ? '-' + (block._version || 0) : ''))}
    <div class="canvas">
      <div
        class="container"
        class:focused={block.id === focusedBlockId}
        style="--bg-color: {block.bgColor}; --text-color: {block.textColor};"
        on:click={(event) => handleBlockClick(event, block.id)}
        role="button"
        tabindex="0"
        aria-pressed={block.id === focusedBlockId}
        on:keydown={(event) => handleBlockKeydown(event, block.id)}
      >
        {#if block.type === 'text' || block.type === 'cleantext'}
          <textarea
            bind:value={block.content}
            spellcheck="false"
            rows="1"
            style="overflow:hidden;"
            on:input={(e) => {
              autoResize(e.target);
              updateBlock(block.id, { content: e.target.value }, { pushToHistory: false, changedKeys: ['content'] });
            }}
            on:focus={(e) => {
              focusScroll(e.target);
              ensureFocus(block.id);
            }}
            data-focus-guard
            placeholder="Type your note here..."
          ></textarea>
          <button class="delete-button" on:click|stopPropagation={() => deleteBlock(block.id)} data-focus-guard>
           ×
          </button>
        {:else if block.type === 'image'}
          <img src={block.src} alt="" />
          <li>
            <button
              class="edit-button"
              data-focus-guard
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
                on:focus={() => ensureFocus(block.id)}
                data-focus-guard
              />
            {/if}
            <button class="delete-button" on:click|stopPropagation={() => deleteBlock(block.id)} data-focus-guard>
              ×
            </button>
          </li>

        {:else if block.type === 'music'}
          <p>🎵 {block.content}</p>
          <button class="delete-button" on:click|stopPropagation={() => deleteBlock(block.id)} data-focus-guard>
           ×
          </button>
        {:else if block.type === 'embed'}
          <p>[Embed: {block.content}]</p>
          <button class="delete-button" on:click|stopPropagation={() => deleteBlock(block.id)} data-focus-guard>
           ×
          </button>
        {/if}


      </div>
    </div>
  {/each}
  <div class="footer"></div>
</div>
