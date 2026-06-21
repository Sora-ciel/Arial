<script>
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import Lightbox from '../components/Lightbox.svelte';
  import BlockContextMenu from '../components/BlockContextMenu.svelte';
  import TipTapEditor from '../components/TipTapEditor.svelte';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let leftControlColors = {};
  export let canvasRef;
  export let columnCount = 2;
  const dispatch = createEventDispatcher();

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };
  const defaultLeftControlColors = {
    textColor: '#f5f5f5',
    buttonBg: '#121212'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: leftTheme = { ...defaultLeftControlColors, ...(leftControlColors || {}) };
  $: modeTextColor = getReadableTextColor(canvasTheme.innerBg);
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor}; --left-text-color: ${leftTheme.textColor}; --left-button-bg: ${leftTheme.buttonBg};`;

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

  function deleteBlock(id) {
    dispatch('delete', { id });
  }

  let blockMenu = {
    blockId: null,
    x: 0,
    y: 0
  };
  let blockMenuMode = 'menu'; // 'menu' | 'editUrl'
  let blockMenuUrlDraft = '';
  let touchHoldTimer;
  let touchHoldTriggered = false;

  function openBlockMenu(blockId, x, y) {
    blockMenu = { blockId, x, y };
    blockMenuMode = 'menu';
  }

  function closeBlockMenu() {
    blockMenu = { blockId: null, x: 0, y: 0 };
    blockMenuMode = 'menu';
    blockMenuUrlDraft = '';
  }

  function handleContextMenu(event, blockId) {
    event.preventDefault();
    ensureFocus(blockId);
    openBlockMenu(blockId, event.clientX, event.clientY);
  }

  function startTouchHold(event, blockId) {
    if (event.touches?.length !== 1) return;
    touchHoldTriggered = false;
    clearTimeout(touchHoldTimer);
    const touch = event.touches[0];
    touchHoldTimer = setTimeout(() => {
      touchHoldTriggered = true;
      ensureFocus(blockId);
      openBlockMenu(blockId, touch.clientX, touch.clientY);
    }, 550);
  }

  function cancelTouchHold() {
    clearTimeout(touchHoldTimer);
  }

  function handleTouchEndForMenu(event) {
    cancelTouchHold();
    if (!touchHoldTriggered) return;
    event.preventDefault();
  }

  function deleteFromMenu(blockId) {
    deleteBlock(blockId);
    closeBlockMenu();
  }

  function downloadSrc(src, name = 'media') {
    const a = document.createElement('a');
    a.href = src;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function copyImageSrc(src) {
    try {
      let blob;
      if (src.startsWith('data:image/')) {
        // Convert base64 data URL directly — avoids fetch issues with large data URIs
        const [header, b64] = src.split(',');
        const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], { type: mime });
      } else {
        const res = await fetch(src);
        blob = await res.blob();
      }
      if (blob && blob.type.startsWith('image/')) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        return;
      }
    } catch {}
    try { await navigator.clipboard.writeText(src); } catch {}
  }

  function buildMenuItems(block) {
    if (!block) return [];
    const items = [];
    if (block.type === 'image') {
      items.push({ id: 'edit', label: 'Edit image URL' });
      const src = getImageSource(block);
      if (src) {
        items.push({ id: 'saveMedia', label: 'Save image' });
        items.push({ id: 'copyMedia', label: 'Copy to clipboard' });
      }
    }
    if (block.type === 'text' || block.type === 'cleantext') {
      if (block.content) items.push({ id: 'copyText', label: 'Copy text' });
    }
    items.push({ id: 'delete', label: 'Delete block', variant: 'danger' });
    return items;
  }

  async function handleMenuAction(actionId, block) {
    if (!block) { closeBlockMenu(); return; }
    if (actionId === 'edit') {
      blockMenuUrlDraft = getImageSource(block);
      blockMenuMode = 'editUrl';
      return;
    } else if (actionId === 'saveMedia') {
      const src = getImageSource(block);
      if (src) downloadSrc(src, 'image');
    } else if (actionId === 'copyMedia') {
      const src = getImageSource(block);
      if (src) await copyImageSrc(src);
    } else if (actionId === 'copyText') {
      const text = htmlToPlainText(block.content);
      if (text) await navigator.clipboard.writeText(text).catch(() => {});
    } else if (actionId === 'delete') {
      deleteFromMenu(block.id);
      return;
    }
    closeBlockMenu();
  }

  function htmlToPlainText(html) {
    return String(html || '')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function handleSimpleColorChange(detail, block) {
    if (!block) return;
    const changed = {};
    if (detail.bgColor !== undefined) changed.bgColor = detail.bgColor;
    if (detail.textColor !== undefined) changed.textColor = detail.textColor;
    const keys = Object.keys(changed);
    if (!keys.length) return;
    updateBlock(block.id, changed, { pushToHistory: !!detail.commit, changedKeys: keys });
  }

  function autoFocusInput(node) {
    requestAnimationFrame(() => { node.focus(); node.select(); });
  }

  function confirmUrlEdit() {
    const menuBlock = blocks.find(b => b.id === blockMenu.blockId);
    if (menuBlock && blockMenuUrlDraft.trim()) {
      updateBlock(menuBlock.id, { src: blockMenuUrlDraft.trim(), resolvedSrc: null }, { pushToHistory: true, changedKeys: ['src', 'resolvedSrc'] });
    }
    closeBlockMenu();
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





  function blockKey(block) {
    return `${block.id}-${block._version || 0}`;
  }

  let imageInputRefs = {};
  let imageTapTracker = {};

  // ── Lightbox ──────────────────────────────────────────────────────
  let lbOpen = false;
  let lbImages = [];
  let lbStart = 0;

  function openLightbox(block) {
    const src = getImageSource(block);
    if (!src) return;
    const imageSrcs = blocks
      .filter(b => b.type === 'image' && hasImageSource(b))
      .map(getImageSource);
    lbStart = imageSrcs.indexOf(src);
    if (lbStart < 0) lbStart = 0;
    lbImages = imageSrcs;
    lbOpen = true;
  }

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
      openLightbox(block);
    } else {
      ensureFocus(block.id);
    }
  }

  $: normalizedColumnCount = Math.max(1, Number.parseInt(columnCount, 10) || 2);
  $: renderColumns = Array.from({ length: normalizedColumnCount }, (_, columnIndex) =>
    blocks.filter((_, blockIndex) => blockIndex % normalizedColumnCount === columnIndex)
  );

  // Resize all textareas when component mounts
  onMount(() => {
    let rafId;
    const handleGlobalPointerDown = (event) => {
      if (!blockMenu.blockId) return;
      if (event.target?.closest?.('.url-edit-popup') || event.target?.closest?.('.ctx-menu')) return;
      closeBlockMenu();
    };
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        if (lbOpen) return; // Lightbox component handles this via stopImmediatePropagation
        if (blockMenu.blockId) closeBlockMenu();
      }
    };
    
    const initializeLayout = async () => {
      await tick();
      rafId = requestAnimationFrame(() => {});
    };
    initializeLayout();
    window.addEventListener('pointerdown', handleGlobalPointerDown);
    window.addEventListener('keydown', handleEsc);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      cancelTouchHold();
      window.removeEventListener('pointerdown', handleGlobalPointerDown);
      window.removeEventListener('keydown', handleEsc);
    };
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
  padding: clamp(3px, 0.55vw, 6px);
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  max-width: none;
  margin: 0;
  min-width: 0;
  box-sizing: border-box;
  --sb-track: var(--canvas-inner-bg);
  --sb-thumb: var(--mode-text-color);
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
  position: relative;
}

.container {
  background: var(--bg-color);
  color: var(--text-color);
  padding: 4px;
  width: 100%;
  box-sizing: border-box;
  border-radius: 20px;
  overflow: hidden;
  border: 2px solid var(--simple-note-border-color, var(--text-color));
  box-shadow: var(--simple-note-block-shadow, 0 0 2px 1px var(--text-color),
              0 0 6px 2px var(--text-color));
  display: flex;
  flex-direction: column;
  align-items: center;
  outline: 2px solid transparent;
  transition: box-shadow 0.15s ease, outline 0.15s ease;
}

.container.focused {
  outline: 4px solid transparent;

}

/* TipTap overrides for grid cards */
:global(.container .tiptap-wrap) {
  background: transparent;
  color: var(--text-color);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 1em;
  font-weight: bold;
  padding: 10px;
  min-height: 50px;
  /* don't lock height in grid cards — grow with content */
  flex: unset;
  overflow-y: visible;
}
:global(.container .tiptap-inner) {
  color: var(--text-color);
  min-height: 40px;
  flex: unset;
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

.edit-button {
  display: none;
}

.url-edit-popup {
  position: fixed;
  z-index: 9100;
  background: #111111;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 240px;
}

.url-edit-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #f0f0f0;
  padding: 8px 10px;
  font-size: 0.85rem;
  outline: none;
}

.url-edit-input:focus {
  border-color: rgba(255, 255, 255, 0.35);
}

.url-edit-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.url-edit-cancel,
.url-edit-confirm {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.85rem;
  cursor: pointer;
}

.url-edit-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: #aaa;
}

.url-edit-confirm {
  background: rgba(255, 255, 255, 0.15);
  color: #f0f0f0;
}



@media (max-width: 1023px) {
  .simple-wrapper {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.35rem;
    padding: 2px;
  }

  .canvas {
    margin-bottom: 0.3rem;
    padding: 3px;
    border-radius: 6px;
  }

  .container {
    padding: 3px;
    border-radius: 14px;
  }

  textarea {
    padding: 8px;
  }

}

</style>









<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="simple-wrapper" bind:this={canvasRef} style={`${canvasCssVars} --simple-note-columns: ${normalizedColumnCount};`}>
  {#each renderColumns as column}
    <div class="simple-column">
      {#each column as block (blockKey(block))}
      <div class="canvas">
        <div
          class="container"
          class:focused={block.id === focusedBlockId}
          data-simplenote-block={block.id}
          style="--bg-color: {block.bgColor}; --text-color: {block.textColor};"
          on:click={(event) => handleBlockClick(event, block.id)}
          on:contextmenu={(event) => handleContextMenu(event, block.id)}
          on:touchstart={(event) => startTouchHold(event, block.id)}
          on:touchend={(event) => handleTouchEndForMenu(event)}
          on:touchmove={() => cancelTouchHold()}
          on:touchcancel={() => cancelTouchHold()}
          role="button"
          tabindex="0"
          aria-pressed={block.id === focusedBlockId}
          on:keydown={(event) => handleBlockKeydown(event, block.id)}
        >
          {#if block.type === 'text' || block.type === 'cleantext'}
            <TipTapEditor
              content={block.content}
              placeholder="Type your note here..."
              on:change={(e) => {
                updateBlock(block.id, { content: e.detail }, { pushToHistory: false, changedKeys: ['content'] });
              }}
              on:focus={() => ensureFocus(block.id)}
            />
          {:else if block.type === 'image'}
            {#if hasImageSource(block)}
              <img
                src={getImageSource(block)}
                alt=""
                data-focus-guard
                on:click|stopPropagation={() => ensureFocus(block.id)}
                on:dblclick|stopPropagation={() => openLightbox(block)}
                on:touchend|stopPropagation={(event) => handleImageTouchEnd(event, block)}
                style="cursor:pointer"
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
            </li>

          {:else if block.type === 'music'}
            <p>🎵 {block.content}</p>
          {:else if block.type === 'embed'}
            <p>[Embed: {block.content}]</p>
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
          {/if}


        </div>
      </div>
      {/each}
    </div>
  {/each}
</div><!-- /simple-wrapper -->

{#if blockMenu.blockId}
  {#if blockMenuMode === 'editUrl'}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="url-edit-popup" style="left:{blockMenu.x}px; top:{blockMenu.y}px;">
      <input
        class="url-edit-input"
        type="text"
        bind:value={blockMenuUrlDraft}
        placeholder="Paste image URL…"
        on:keydown={(e) => { if (e.key === 'Enter') confirmUrlEdit(); if (e.key === 'Escape') closeBlockMenu(); }}
        use:autoFocusInput
      />
      <div class="url-edit-actions">
        <button class="url-edit-cancel" on:click={closeBlockMenu}>Cancel</button>
        <button class="url-edit-confirm" on:click={confirmUrlEdit}>Done</button>
      </div>
    </div>
  {:else}
    {@const menuBlock = blocks.find(b => b.id === blockMenu.blockId)}
    <BlockContextMenu
      x={blockMenu.x}
      y={blockMenu.y}
      items={buildMenuItems(menuBlock)}
      colorEdit={true}
      bgColor={menuBlock?.bgColor || '#000000'}
      textColor={menuBlock?.textColor || '#ffffff'}
      on:action={(e) => handleMenuAction(e.detail, menuBlock)}
      on:colorChange={(e) => handleSimpleColorChange(e.detail, menuBlock)}
      on:close={() => { if (blockMenuMode !== 'editUrl') closeBlockMenu(); }}
    />
  {/if}
{/if}

{#if lbOpen}
  <Lightbox images={lbImages} startIndex={lbStart} on:close={() => lbOpen = false} />
{/if}
