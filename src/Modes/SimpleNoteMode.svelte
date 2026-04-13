<script>
  import { afterUpdate, createEventDispatcher, onMount, tick } from 'svelte';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  export let columnCount = 2;
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

  function resizeAllTextareas() {
    const textareas = canvasRef?.querySelectorAll?.('textarea') ?? [];
    textareas.forEach(autoResize);
  }




  function focusScroll(el) {
    if (!el) return;
      if (window.innerWidth <= 1024)
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function blockKey(block) {
    return block.id + (block.type !== 'text' && block.type !== 'cleantext' ? '-' + (block._version || 0) : '');
  }

  let imageInputRefs = {};
  let imageTapTracker = {};

  function setImageInputRef(blockId, node) {
    if (node) {
      imageInputRefs[blockId] = node;
      return;
    }
    delete imageInputRefs[blockId];
  }

  function imageInputRef(node, blockId) {
    setImageInputRef(blockId, node);
    return {
      update(nextBlockId) {
        if (nextBlockId === blockId) return;
        setImageInputRef(blockId, null);
        blockId = nextBlockId;
        setImageInputRef(blockId, node);
      },
      destroy() {
        setImageInputRef(blockId, null);
      }
    };
  }

  function getImageSource(block) {
    if (!block) return '';
    if (typeof block.src === 'string') return block.src;
    if (block.src && typeof block.src === 'object') return block.resolvedSrc || '';
    return '';
  }

  function hasImageSource(block) {
    return Boolean(getImageSource(block));
  }

  function openImagePicker(blockId) {
    const input = imageInputRefs[blockId];
    if (!input) return;
    ensureFocus(blockId);
    input.click();
  }

  function handleImageChange(event, block) {
    ensureFocus(block.id);
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      updateBlock(
        block.id,
        {
          src: reader.result,
          resolvedSrc: null,
          attachmentRequiresAuth: false,
          _version: (block._version || 0) + 1
        },
        {
          changedKeys: ['src', 'resolvedSrc', 'attachmentRequiresAuth', '_version']
        }
      );
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function handleImageTouchEnd(event, block) {
    if (!hasImageSource(block)) return;
    const currentTap = Date.now();
    const previousTap = imageTapTracker[block.id] || 0;
    imageTapTracker[block.id] = currentTap;

    if (currentTap - previousTap <= 300) {
      event.preventDefault();
      openImagePicker(block.id);
    }
  }

  $: normalizedColumnCount = Math.max(1, Number.parseInt(columnCount, 10) || 2);
  $: renderColumns = Array.from({ length: normalizedColumnCount }, (_, columnIndex) =>
    blocks.filter((_, blockIndex) => blockIndex % normalizedColumnCount === columnIndex)
  );

  function handleColumnGaugeInput(event) {
    const next = Math.max(1, Number.parseInt(event.currentTarget.value, 10) || 1);
    dispatch('columnCountChange', { columnCount: next });
  }
  



  // Resize all textareas when component mounts
  onMount(() => {
    let rafId;
    
    const initializeLayout = async () => {
      await tick();
      resizeAllTextareas();
      rafId = requestAnimationFrame(() => {
        resizeAllTextareas();
      });
    };
    initializeLayout();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  });

  afterUpdate(() => {
    resizeAllTextareas();
  });
</script>






<style>
/* ========== MOBILE (default) ========== */
.simple-wrapper {
  display: grid;
  grid-template-columns: repeat(var(--simple-note-columns, 2), minmax(0, 1fr));
  gap: 0.55rem;
  align-items: flex-start;
  background: var(--canvas-inner-bg, #000000);
  padding: clamp(6px, 1.1vw, 12px);
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  max-width: none;
  margin: 0;
  min-width: 0;
  box-sizing: border-box;
}

.simple-toolbar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0 0.25rem;
}

.simple-toolbar label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #ffffff;
  font-weight: 700;
  background: color-mix(in srgb, var(--canvas-outer-bg, #000000) 60%, transparent);
  border: 1px solid color-mix(in srgb, #ffffff 25%, transparent);
  border-radius: 999px;
  padding: 0.4rem 0.75rem;
}

.simple-toolbar input[type="range"] {
  width: min(220px, 36vw);
}

.simple-toolbar-value {
  min-width: 1.25rem;
  text-align: center;
}

.simple-column {
  flex: 1 1 0;
  min-width: 0;
}

.canvas {
  background: var(--canvas-outer-bg, #00000041);
  border-radius: 8px;
  padding: 5px;
  margin: 0 0 0.45rem;
  display: block;
  width: auto;
  break-inside: avoid-column;
  page-break-inside: avoid;
  -webkit-column-break-inside: avoid;
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

.image-empty-state {
  width: 100%;
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed color-mix(in srgb, var(--text-color) 45%, transparent);
  border-radius: 14px;
  margin-bottom: 8px;
}

.image-select-button {
  border: 2px solid var(--text-color);
  background: transparent;
  color: var(--text-color);
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}

.task-list {
  width: 100%;
  margin: 6px 0;
  padding: 0 8px 8px;
  box-sizing: border-box;
}

.task-list-title {
  font-weight: 700;
  padding: 6px 8px 2px;
}

.task-item {
  padding: 4px 8px;
  border-radius: 8px;
  margin-top: 4px;
  background: color-mix(in srgb, var(--text-color) 10%, transparent);
  font-size: 0.95rem;
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

@media (max-width: 1023px) {
  .simple-toolbar {
    display: none;
  }
}

</style>









<div class="simple-wrapper" bind:this={canvasRef} style={`${canvasCssVars} --simple-note-columns: ${normalizedColumnCount};`}>
  <div class="simple-toolbar">
    <label>
      Columns
      <input
        type="range"
        min="1"
        max="6"
        step="1"
        value={normalizedColumnCount}
        on:input={handleColumnGaugeInput}
      />
      <span class="simple-toolbar-value">{normalizedColumnCount}</span>
    </label>
  </div>
  {#each renderColumns as column}
    <div class="simple-column">
      {#each column as block (blockKey(block))}
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
            {#if hasImageSource(block)}
              <img
                src={getImageSource(block)}
                alt=""
                data-focus-guard
                on:dblclick|stopPropagation={() => openImagePicker(block.id)}
                on:touchend|stopPropagation={(event) => handleImageTouchEnd(event, block)}
              />
            {:else}
              <div class="image-empty-state" data-focus-guard>
                <button
                  class="image-select-button"
                  on:click|stopPropagation={() => openImagePicker(block.id)}
                  data-focus-guard
                >
                  Add image
                </button>
              </div>
            {/if}
            <li>
              <input
                type="file"
                accept="image/*"
                style="display:none;"
                use:imageInputRef={block.id}
                on:change={(event) => handleImageChange(event, block)}
                data-focus-guard
              />
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
          {:else if block.type === 'task'}
            <div class="task-list-title">{block.title || 'Task List'}</div>
            <div class="task-list">
              {#if Array.isArray(block.tasks) && block.tasks.length}
                {#each block.tasks as task (task.id)}
                  <div class="task-item">
                    {task.done ? '✅' : '⬜'} {task.text}
                  </div>
                {/each}
              {:else}
                <div class="task-item">No tasks yet</div>
              {/if}
            </div>
            <button class="delete-button" on:click|stopPropagation={() => deleteBlock(block.id)} data-focus-guard>
            ×
            </button>
          {/if}


        </div>
      </div>
      {/each}
    </div>
  {/each}
</div>
