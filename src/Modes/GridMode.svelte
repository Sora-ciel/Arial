<script>
  import { createEventDispatcher, onMount } from 'svelte';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  export let gridSettings = { desktopColumns: 3, mobileColumns: 2 };

  const dispatch = createEventDispatcher();

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  let isMobile = false;

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};`;
  $: activeDevice = isMobile ? 'mobile' : 'desktop';
  $: columns = clampColumns(isMobile ? gridSettings?.mobileColumns : gridSettings?.desktopColumns);

  function clampColumns(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(8, Math.round(parsed)));
  }

  function updateViewport() {
    isMobile = window.innerWidth <= 1024;
  }

  function updateColumns(nextColumns) {
    const clamped = clampColumns(nextColumns);
    const next = {
      desktopColumns: clampColumns(gridSettings?.desktopColumns ?? 3),
      mobileColumns: clampColumns(gridSettings?.mobileColumns ?? 2)
    };
    if (isMobile) next.mobileColumns = clamped;
    else next.desktopColumns = clamped;

    dispatch('gridSettingsChange', next);
  }

  function getSpan(block) {
    const fallback = { cols: 1, rows: block.type === 'image' ? 2 : 1 };
    const fromBlock = block?.gridSpan?.[activeDevice] || {};
    const cols = Math.max(1, Math.min(columns, Number(fromBlock.cols) || fallback.cols));
    const rows = Math.max(1, Math.min(6, Number(fromBlock.rows) || fallback.rows));
    return { cols, rows };
  }

  function updateSpan(block, axis, delta) {
    if (!block?.id) return;
    const current = getSpan(block);
    const next = { ...current };
    if (axis === 'cols') {
      next.cols = Math.max(1, Math.min(columns, current.cols + delta));
    }
    if (axis === 'rows') {
      next.rows = Math.max(1, Math.min(6, current.rows + delta));
    }

    dispatch('update', {
      id: block.id,
      gridSpan: {
        ...(block.gridSpan || {}),
        [activeDevice]: next
      },
      changedKeys: ['gridSpan'],
      pushToHistory: true
    });
  }

  function updateBlock(id, updates, { pushToHistory = false, changedKeys } = {}) {
    dispatch('update', {
      id,
      ...updates,
      changedKeys: changedKeys || Object.keys(updates || {}),
      pushToHistory
    });
  }

  function deleteBlock(id) {
    dispatch('delete', { id });
  }

  function focusBlock(id) {
    dispatch('focusToggle', { id });
  }

  function getAspectRatio(block) {
    const width = Number(block?.size?.width) || 4;
    const height = Number(block?.size?.height) || 3;
    return `${Math.max(1, width)} / ${Math.max(1, height)}`;
  }

  onMount(() => {
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  });
</script>

<style>
  .grid-mode {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: calc(100vh - var(--controls-height, 56px));
    background: var(--canvas-inner-bg, #000000);
    color: var(--block-header-text, #ffffff);
  }

  .grid-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255,255,255,0.15));
    background: var(--canvas-outer-bg, #111);
  }

  .grid-toolbar input[type='range'] {
    width: 140px;
  }

  .grid-canvas {
    display: grid;
    grid-template-columns: repeat(var(--columns, 3), minmax(0, 1fr));
    grid-auto-rows: minmax(130px, auto);
    gap: 0;
    flex: 1 1 auto;
    overflow: auto;
  }

  .cell {
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255,255,255,0.12));
    border-right-width: 0;
    border-bottom-width: 0;
    padding: 8px;
    background: var(--block-surface, rgba(0,0,0,0.2));
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .cell.focused { outline: 2px solid var(--block-focus-outline, rgba(110,168,255,0.85)); outline-offset: -2px; }

  .header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    align-items: center;
    font-size: .8rem;
  }

  .span-controls { display: flex; gap: 4px; }
  .span-controls button, .delete-btn {
    border: 1px solid rgba(255,255,255,.25);
    background: rgba(255,255,255,.08);
    color: inherit;
    border-radius: 6px;
    cursor: pointer;
    padding: 2px 6px;
  }

  textarea, input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(255,255,255,.2);
    background: rgba(0,0,0,.2);
    color: inherit;
    border-radius: 8px;
    padding: 6px 8px;
  }

  textarea { flex: 1; min-height: 90px; resize: vertical; }

  .image-wrap {
    flex: 1;
    min-height: 0;
    border: 1px solid rgba(255,255,255,.15);
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0,0,0,.15);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .image-wrap img { width: 100%; height: 100%; object-fit: contain; }
</style>

<section class="grid-mode" bind:this={canvasRef} style={canvasCssVars}>
  <div class="grid-toolbar">
    <strong>Grid Mode ({activeDevice})</strong>
    <label>
      Columns: {columns}
      <input
        type="range"
        min="1"
        max="8"
        value={columns}
        on:input={(event) => updateColumns(event.target.value)}
      />
    </label>
  </div>

  <div class="grid-canvas" style={`--columns: ${columns};`}>
    {#each blocks as block (block.id)}
      {@const span = getSpan(block)}
      <div
        class="cell"
        class:focused={focusedBlockId === block.id}
        style={`grid-column: span ${span.cols}; grid-row: span ${span.rows};`}
        role="button"
        tabindex="0"
        on:click={() => focusBlock(block.id)}
        on:keydown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            focusBlock(block.id);
          }
        }}
      >
        <div class="header">
          <span>{block.type}</span>
          <div class="span-controls">
            <button on:click|stopPropagation={() => updateSpan(block, 'cols', -1)}>−W</button>
            <button on:click|stopPropagation={() => updateSpan(block, 'cols', 1)}>+W</button>
            {#if block.type !== 'image'}
              <button on:click|stopPropagation={() => updateSpan(block, 'rows', -1)}>−H</button>
              <button on:click|stopPropagation={() => updateSpan(block, 'rows', 1)}>+H</button>
            {/if}
            <button class="delete-btn" on:click|stopPropagation={() => deleteBlock(block.id)}>✕</button>
          </div>
        </div>

        {#if block.type === 'text' || block.type === 'cleantext' || block.type === 'embed'}
          <textarea
            value={block.content || ''}
            on:input={(event) => updateBlock(block.id, { content: event.target.value }, { pushToHistory: false, changedKeys: ['content'] })}
            on:blur={(event) => updateBlock(block.id, { content: event.target.value }, { pushToHistory: true, changedKeys: ['content'] })}
          ></textarea>
        {:else if block.type === 'image'}
          <input
            type="text"
            placeholder="Image URL"
            value={block.src || ''}
            on:input={(event) => updateBlock(block.id, { src: event.target.value }, { pushToHistory: false, changedKeys: ['src'] })}
            on:blur={(event) => updateBlock(block.id, { src: event.target.value }, { pushToHistory: true, changedKeys: ['src'] })}
          />
          <div class="image-wrap" style={`aspect-ratio: ${getAspectRatio(block)};`}>
            {#if block.src}
              <img src={block.src} alt="block" draggable="false" />
            {/if}
          </div>
        {:else if block.type === 'music'}
          <input
            type="text"
            placeholder="Track URL"
            value={block.trackUrl || ''}
            on:blur={(event) => updateBlock(block.id, { trackUrl: event.target.value }, { pushToHistory: true, changedKeys: ['trackUrl'] })}
          />
          <textarea
            value={block.content || ''}
            on:blur={(event) => updateBlock(block.id, { content: event.target.value }, { pushToHistory: true, changedKeys: ['content'] })}
          ></textarea>
        {:else if block.type === 'task'}
          <input
            type="text"
            placeholder="Task title"
            value={block.title || ''}
            on:blur={(event) => updateBlock(block.id, { title: event.target.value }, { pushToHistory: true, changedKeys: ['title'] })}
          />
          <small>{Array.isArray(block.tasks) ? block.tasks.length : 0} tasks</small>
        {:else}
          <textarea
            value={block.content || ''}
            on:blur={(event) => updateBlock(block.id, { content: event.target.value }, { pushToHistory: true, changedKeys: ['content'] })}
          ></textarea>
        {/if}
      </div>
    {/each}
  </div>
</section>
