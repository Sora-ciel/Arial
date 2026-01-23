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
  $: modeTextColor = getReadableTextColor(canvasTheme.innerBg);
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor};`;

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

  function getReadableTextColor(color) {
    if (!color) return '#f5f5f5';
    const parsed = parseColor(color);
    if (!parsed) return '#f5f5f5';
    const [r, g, b] = parsed;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#121212' : '#f5f5f5';
  }

  function parseColor(color) {
    const trimmed = color.trim();
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16)
        ];
      }
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
    }
    const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return [
        Number(rgbMatch[1]),
        Number(rgbMatch[2]),
        Number(rgbMatch[3])
      ];
    }
    return null;
  }
</script>






<style>
/* ========== MOBILE (default) ========== */
.simple-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: clamp(12px, 2vw, 24px);
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  flex: 1 1 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 100%;
  background: var(--canvas-outer-bg, #000000);
}

.canvas {
  background: transparent;
  padding: 0;
  margin-bottom: 0;
  width: min(720px, 100%);
  box-sizing: border-box;
}

.container {
  background: var(--canvas-inner-bg, #000000);
  color: var(--mode-text-color, #ffffff);
  padding: 12px 16px;
  width: 100%;
  box-sizing: border-box;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  outline: none;
  transition: none;
}

textarea {
  width: 100%;
  min-height: 50px;
  border: none;
  border-radius: 12px;
  resize: none;
  margin: 0;
  padding: 10px 6px;
  background: transparent;
  color: var(--mode-text-color, #ffffff);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 1rem;
  font-weight: 500;
  box-sizing: border-box;
  text-align: center;
}

textarea:focus {
  outline: none;
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
  color: var(--mode-text-color, #ffffff);
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
    justify-content: center;
    max-width: 1400px;
  }

  .canvas {
    margin-bottom: 0;
  }

  .container img {
    width: auto;
    height: 100%;
    max-height: 500px;
    object-fit: contain;
    border-radius: 14px;
  }
}






</style>









<div class="simple-wrapper" bind:this={canvasRef} style={canvasCssVars}>
  {#each blocks as block (block.id + (block.type !== 'text' && block.type !== 'cleantext' ? '-' + (block._version || 0) : ''))}
    <div class="canvas">
      <div
        class="container"
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
