<script>
  import { createEventDispatcher, onMount } from 'svelte';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  export let gridSettings = { desktopColumns: 3, mobileColumns: 2 };

  const dispatch = createEventDispatcher();
  const GRID_ROW_PX = 28;
  const MAX_ROWS = 24;

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  let isMobile = false;
  let gridCanvasRef;
  let gridCanvasWidth = 0;
  let gridResizeObserver;

  let dragResize = {
    id: null,
    axis: null,
    startX: 0,
    startY: 0,
    startCols: 1,
    startRows: 1
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};`;
  $: activeDevice = isMobile ? 'mobile' : 'desktop';
  $: columns = clampColumns(isMobile ? gridSettings?.mobileColumns : gridSettings?.desktopColumns);
  $: columnWidth = columns > 0 ? Math.max(1, gridCanvasWidth / columns) : 1;

  function clampColumns(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(8, Math.round(parsed)));
  }

  function clampRows(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(MAX_ROWS, Math.round(parsed)));
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

  function getImageRatioValue(block) {
    const width = Number(block?.size?.width) || 4;
    const height = Number(block?.size?.height) || 3;
    return Math.max(0.15, width / Math.max(1, height));
  }

  function getSpan(block) {
    const fromBlock = block?.gridSpan?.[activeDevice] || {};
    const cols = Math.max(1, Math.min(columns, Number(fromBlock.cols) || 1));

    if (block.type === 'image') {
      const ratio = getImageRatioValue(block);
      const imageWidthPx = columnWidth * cols;
      const imageHeightPx = imageWidthPx / ratio;
      const rowsFromRatio = clampRows(Math.ceil(imageHeightPx / GRID_ROW_PX));
      return { cols, rows: rowsFromRatio };
    }

    const rows = clampRows(Number(fromBlock.rows) || 5);
    return { cols, rows };
  }

  function pushSpanUpdate(block, nextSpan) {
    dispatch('update', {
      id: block.id,
      gridSpan: {
        ...(block.gridSpan || {}),
        [activeDevice]: {
          cols: Math.max(1, Math.min(columns, Number(nextSpan.cols) || 1)),
          rows: block.type === 'image' ? undefined : clampRows(nextSpan.rows)
        }
      },
      changedKeys: ['gridSpan'],
      pushToHistory: true
    });
  }

  function beginResize(event, block, axis) {
    event.preventDefault();
    event.stopPropagation();
    focusBlock(block.id);

    const point = event.touches?.[0] || event;
    const current = getSpan(block);
    dragResize = {
      id: block.id,
      axis,
      startX: point.clientX,
      startY: point.clientY,
      startCols: current.cols,
      startRows: current.rows
    };

    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchmove', onResizeMove, { passive: false });
    window.addEventListener('touchend', stopResize);
  }

  function onResizeMove(event) {
    if (!dragResize.id) return;
    const block = blocks.find(item => item.id === dragResize.id);
    if (!block) return;

    const point = event.touches?.[0] || event;
    const deltaX = point.clientX - dragResize.startX;
    const deltaY = point.clientY - dragResize.startY;

    const deltaCols = Math.round(deltaX / Math.max(1, columnWidth));
    const deltaRows = Math.round(deltaY / GRID_ROW_PX);

    const next = {
      cols: dragResize.startCols,
      rows: dragResize.startRows
    };

    if (dragResize.axis === 'x' || dragResize.axis === 'both') {
      next.cols = Math.max(1, Math.min(columns, dragResize.startCols + deltaCols));
    }

    if ((dragResize.axis === 'y' || dragResize.axis === 'both') && block.type !== 'image') {
      next.rows = clampRows(dragResize.startRows + deltaRows);
    }

    pushSpanUpdate(block, next);

    if (event.cancelable) event.preventDefault();
  }

  function stopResize() {
    dragResize = {
      id: null,
      axis: null,
      startX: 0,
      startY: 0,
      startCols: 1,
      startRows: 1
    };

    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', stopResize);
    window.removeEventListener('touchmove', onResizeMove);
    window.removeEventListener('touchend', stopResize);
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

  onMount(() => {
    updateViewport();
    window.addEventListener('resize', updateViewport);

    if (typeof ResizeObserver !== 'undefined') {
      gridResizeObserver = new ResizeObserver(entries => {
        const width = entries?.[0]?.contentRect?.width;
        if (Number.isFinite(width) && width > 0) {
          gridCanvasWidth = width;
        }
      });
      if (gridCanvasRef) gridResizeObserver.observe(gridCanvasRef);
    }

    gridCanvasWidth = gridCanvasRef?.clientWidth || window.innerWidth;

    return () => {
      window.removeEventListener('resize', updateViewport);
      stopResize();
      gridResizeObserver?.disconnect();
    };
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
    border-bottom: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.15));
    background: var(--canvas-outer-bg, #111);
  }

  .grid-toolbar input[type='range'] {
    width: 140px;
  }

  .grid-canvas {
    display: grid;
    grid-template-columns: repeat(var(--columns, 3), minmax(0, 1fr));
    grid-auto-rows: var(--row-size, 28px);
    grid-auto-flow: dense;
    gap: 0;
    flex: 1 1 auto;
    overflow: auto;
  }

  .cell {
    position: relative;
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.14));
    border-right-width: 0;
    border-bottom-width: 0;
    padding: 8px;
    background: color-mix(in srgb, var(--block-surface, rgba(0, 0, 0, 0.25)) 85%, black 15%);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .cell.focused {
    outline: 2px solid var(--block-focus-outline, rgba(110, 168, 255, 0.85));
    outline-offset: -2px;
    z-index: 2;
  }

  .cell-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 0.76rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .delete-btn {
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 95, 95, 0.15);
    color: inherit;
    border-radius: 6px;
    cursor: pointer;
    padding: 2px 8px;
    font-size: 0.72rem;
  }

  textarea,
  input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.2);
    color: inherit;
    border-radius: 8px;
    padding: 8px;
    font-family: inherit;
  }

  textarea {
    flex: 1;
    min-height: 0;
    resize: none;
  }

  .image-wrap {
    width: 100%;
    margin-top: 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.2);
  }

  .image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .handle {
    position: absolute;
    z-index: 3;
    background: transparent;
  }

  .handle-right {
    top: 12px;
    right: 0;
    width: 10px;
    height: calc(100% - 24px);
    cursor: ew-resize;
  }

  .handle-bottom {
    left: 12px;
    bottom: 0;
    width: calc(100% - 24px);
    height: 10px;
    cursor: ns-resize;
  }

  .handle-corner {
    right: 0;
    bottom: 0;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
  }
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

  <div
    class="grid-canvas"
    bind:this={gridCanvasRef}
    style={`--columns: ${columns}; --row-size: ${GRID_ROW_PX}px;`}
  >
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
        <div class="cell-header">
          <span>{block.type}</span>
          <button class="delete-btn" on:click|stopPropagation={() => deleteBlock(block.id)}>Delete</button>
        </div>

        {#if block.type === 'text' || block.type === 'cleantext' || block.type === 'embed'}
          <textarea
            value={block.content || ''}
            on:input={(event) =>
              updateBlock(block.id, { content: event.target.value }, { pushToHistory: false, changedKeys: ['content'] })}
            on:blur={(event) =>
              updateBlock(block.id, { content: event.target.value }, { pushToHistory: true, changedKeys: ['content'] })}
          ></textarea>
        {:else if block.type === 'image'}
          <input
            type="text"
            placeholder="Image URL"
            value={block.src || ''}
            on:input={(event) =>
              updateBlock(block.id, { src: event.target.value }, { pushToHistory: false, changedKeys: ['src'] })}
            on:blur={(event) =>
              updateBlock(block.id, { src: event.target.value }, { pushToHistory: true, changedKeys: ['src'] })}
          />
          <div class="image-wrap" style={`aspect-ratio: ${getImageRatioValue(block)};`}>
            {#if block.src}
              <img src={block.src} alt="block" draggable="false" />
            {/if}
          </div>
        {:else if block.type === 'music'}
          <input
            type="text"
            placeholder="Track URL"
            value={block.trackUrl || ''}
            on:blur={(event) =>
              updateBlock(block.id, { trackUrl: event.target.value }, { pushToHistory: true, changedKeys: ['trackUrl'] })}
          />
          <textarea
            value={block.content || ''}
            on:blur={(event) =>
              updateBlock(block.id, { content: event.target.value }, { pushToHistory: true, changedKeys: ['content'] })}
          ></textarea>
        {:else if block.type === 'task'}
          <input
            type="text"
            placeholder="Task title"
            value={block.title || ''}
            on:blur={(event) =>
              updateBlock(block.id, { title: event.target.value }, { pushToHistory: true, changedKeys: ['title'] })}
          />
          <small>{Array.isArray(block.tasks) ? block.tasks.length : 0} tasks</small>
        {:else}
          <textarea
            value={block.content || ''}
            on:blur={(event) =>
              updateBlock(block.id, { content: event.target.value }, { pushToHistory: true, changedKeys: ['content'] })}
          ></textarea>
        {/if}

        <div
          class="handle handle-right"
          role="presentation"
          on:mousedown={(event) => beginResize(event, block, 'x')}
          on:touchstart={(event) => beginResize(event, block, 'x')}
        ></div>

        {#if block.type !== 'image'}
          <div
            class="handle handle-bottom"
            role="presentation"
            on:mousedown={(event) => beginResize(event, block, 'y')}
            on:touchstart={(event) => beginResize(event, block, 'y')}
          ></div>
        {/if}

        <div
          class="handle handle-corner"
          role="presentation"
          on:mousedown={(event) => beginResize(event, block, block.type === 'image' ? 'x' : 'both')}
          on:touchstart={(event) => beginResize(event, block, block.type === 'image' ? 'x' : 'both')}
        ></div>
      </div>
    {/each}
  </div>
</section>
