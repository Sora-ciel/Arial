<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { setCanvasScale, setCanvasRef } from '../canvasState.js';
  import { MIN_CANVAS_WIDTH, MIN_ZOOM, MAX_ZOOM, getInitialCanvasScale } from '../utils/canvasFit.js';
  import { htmlToText as htmlToPlainText } from '../utils/htmlToText.js';
  import TexteBlock from '../components/TexteBlock.svelte';
  import ImgBlock from '../components/ImgBlock.svelte';
  import Texteclean from '../components/TexteClean.svelte';
  import Music from '../components/MusicBlock.svelte';
  import Embed from '../components/EmbedBlock.svelte';
  import TaskBlock from '../components/TaskBlock.svelte';
  import Lightbox from '../components/Lightbox.svelte';
  import BlockContextMenu from '../components/BlockContextMenu.svelte';


  export let mode;
  export let blocks;

  export let canvasRef;
  export let focusedBlockId;
  export let canvasColors = {};
  export let refitViewTrigger = 0;

  // Keep shared state module in sync so App can read viewport without bind:this
  $: setCanvasScale(scale);
  $: setCanvasRef(canvasRef);
  // Refit when parent increments the trigger
  $: if (refitViewTrigger > 0) refitCanvas();

  $: shellWidth = canvasWidth * scale;
  $: shellHeight = canvasHeight * scale;



  const MIN_CANVAS_HEIGHT = 320;
  const BLOCK_MARGIN_LEFT = 5;
  const BLOCK_MARGIN_RIGHT = 5;
  const MOBILE_BREAKPOINT = 1024;
  const BLOCK_MARGIN_BOTTOM = 20;
  const WHEEL_ZOOM_SENSITIVITY = 0.00105;

  let scale = 1;
  let lastDistance = null;
  let lastMidpoint = null;
  let canvasWidth = MIN_CANVAS_WIDTH;
  let canvasHeight = MIN_CANVAS_HEIGHT;
  let contentOffsetX = 0;

  // ── Lightbox ─────────────────────────────────────────────────────
  let lbOpen = false;
  let lbImages = [];
  let lbStart = 0;

  function openCanvasLightbox(event) {
    const clickedSrc = event.detail.src;
    // Build gallery from all image blocks in their visual order
    const allSrcs = blocks
      .filter(b => b.type === 'image')
      .map(b => {
        if (typeof b.src === 'string') return b.src;
        if (b.resolvedSrc) return b.resolvedSrc;
        return null;
      })
      .filter(Boolean);
    lbImages = allSrcs.length ? allSrcs : [clickedSrc];
    lbStart = lbImages.indexOf(clickedSrc);
    if (lbStart < 0) lbStart = 0;
    lbOpen = true;
  }

  // Right-click grab pan
  let isPanning = false;
  let panHasMoved = false;
  let panStartX = 0;
  let panStartY = 0;
  let panScrollLeft = 0;
  let panScrollTop = 0;

  const dispatch = createEventDispatcher();


  function deleteBlockHandler(event) {
   dispatch ('delete', event.detail);
  }

  function updateBlockHandler(event) {
    const detail = { ...event.detail };
    const nextPosition = detail?.position;

    if (nextPosition) {
      const x = Number(nextPosition.x);
      const y = Number(nextPosition.y);

      detail.position = {
        ...nextPosition,
        ...(Number.isFinite(x) ? { x: Math.max(0, x) } : {}),
        ...(Number.isFinite(y) ? { y: Math.max(0, y) } : {})
      };
    }

    dispatch('update', detail);
  }

  function focusToggleHandler(event) {
    dispatch('focusToggle', event.detail);
  }


  function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getMidpoint(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  function getHorizontalMargins() {
    if (typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT) {
      return { left: 0, right: 0 };
    }

    return { left: BLOCK_MARGIN_LEFT, right: BLOCK_MARGIN_RIGHT };
  }

  function measureCanvasFromBlocks() {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return { width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT, offsetX: 0 };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = 0;

    for (const block of blocks) {
      const x = Number(block?.position?.x ?? 0);
      const y = Number(block?.position?.y ?? 0);
      const width = Number(block?.size?.width ?? 220);
      const height = Number(block?.size?.height ?? 140);

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }

    const safeMinX = Number.isFinite(minX) ? minX : 0;
    const safeMaxX = Number.isFinite(maxX) ? maxX : 0;
    const contentWidth = Math.max(0, safeMaxX - safeMinX);
    const horizontalMargins = getHorizontalMargins();

    return {
      width: Math.max(MIN_CANVAS_WIDTH, contentWidth + horizontalMargins.left + horizontalMargins.right),
      height: Math.max(MIN_CANVAS_HEIGHT, maxY + BLOCK_MARGIN_BOTTOM),
      offsetX: horizontalMargins.left - safeMinX
    };
  }

  function getViewportScaleFloor() {
    const controlsHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--controls-height')) || 56;
    const availableWidth = Math.max(window.innerWidth, 1);
    const availableHeight = Math.max(window.innerHeight - controlsHeight, 1);
    const fittedScale = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);
    return Math.min(1, fittedScale);
  }

  // Deterministic "home" zoom based purely on screen size (not content),
  // so first mount and the Ctrl+middle-click reset always land on the same
  // zoom. Shared with App.svelte's media-fit/placement math (canvasFit.js)
  // so both pieces always agree on what "the screen at opening zoom" means.
  function getInitialScale() {
    return getInitialCanvasScale();
  }

  function getMinAllowedScale() {
    return Math.min(MIN_ZOOM, getViewportScaleFloor());
  }

  function fitToViewport() {
    if (!canvasRef) return;
    scale = getInitialScale();
    canvasRef.scrollLeft = 0;
    canvasRef.scrollTop = 0;
  }

  function onTouchStart(event) {
    if (event.touches.length !== 2) return;
    lastDistance = getDistance(event.touches);
    lastMidpoint = getMidpoint(event.touches);
  }

  function onTouchMove(event) {
    if (event.touches.length !== 2 || !lastDistance || !canvasRef) return;
    if (event.cancelable) event.preventDefault();

    const newDistance = getDistance(event.touches);
    const newMidpoint = getMidpoint(event.touches);
    const oldScale = scale;
    const nextScale = Math.max(getMinAllowedScale(), Math.min(MAX_ZOOM, oldScale * (newDistance / lastDistance)));
    if (nextScale === oldScale) return;

    const rect = canvasRef.getBoundingClientRect();
    const anchorX = (lastMidpoint?.x ?? newMidpoint.x) - rect.left;
    const anchorY = (lastMidpoint?.y ?? newMidpoint.y) - rect.top;
    const contentX = (canvasRef.scrollLeft + anchorX) / oldScale;
    const contentY = (canvasRef.scrollTop + anchorY) / oldScale;

    scale = nextScale;
    canvasRef.scrollLeft = Math.max(0, contentX * scale - anchorX);
    canvasRef.scrollTop = Math.max(0, contentY * scale - anchorY);

    lastDistance = newDistance;
    lastMidpoint = newMidpoint;
  }


  function shouldLetNestedScrollerHandleWheel(event) {
    if (!canvasRef || !(event.target instanceof Element)) return false;

    const focusedBlock = event.target.closest('[aria-pressed="true"]');
    if (!focusedBlock || !canvasRef.contains(focusedBlock)) return false;

    let current = event.target;
    while (current && current !== focusedBlock) {
      const style = getComputedStyle(current);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight;
      const canScrollX = (overflowX === 'auto' || overflowX === 'scroll') && current.scrollWidth > current.clientWidth;

      if (canScrollY || canScrollX) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function onWheel(event) {
    if (!canvasRef) return;

    if (!event.ctrlKey) {
      if (shouldLetNestedScrollerHandleWheel(event)) return;

      const canScrollHorizontally = canvasRef.scrollWidth > canvasRef.clientWidth;
      const canScrollVertically = canvasRef.scrollHeight > canvasRef.clientHeight;
      const hasSingleScrollableAxis = canScrollHorizontally !== canScrollVertically;

      if (!hasSingleScrollableAxis) return;

      if (event.cancelable) event.preventDefault();
      const scrollDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;

      if (canScrollVertically) {
        canvasRef.scrollTop += scrollDelta;
      } else if (canScrollHorizontally) {
        canvasRef.scrollLeft += scrollDelta;
      }

      return;
    }

    if (event.cancelable) event.preventDefault();

    const oldScale = scale;
    const zoomFactor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
    const nextScale = Math.max(getMinAllowedScale(), Math.min(MAX_ZOOM, oldScale * zoomFactor));

    if (nextScale === oldScale) return;

    const rect = canvasRef.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const contentX = (canvasRef.scrollLeft + anchorX) / oldScale;
    const contentY = (canvasRef.scrollTop + anchorY) / oldScale;

    scale = nextScale;
    canvasRef.scrollLeft = Math.max(0, contentX * scale - anchorX);
    canvasRef.scrollTop = Math.max(0, contentY * scale - anchorY);
  }


  function startRightClickPan(event) {
    if (!canvasRef) return;
    isPanning = true;
    panHasMoved = false;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panScrollLeft = canvasRef.scrollLeft;
    panScrollTop = canvasRef.scrollTop;
    document.addEventListener('mousemove', onPanMove);
    document.addEventListener('mouseup', stopRightClickPan);
  }

  function onPanMove(event) {
    if (!isPanning || !canvasRef) return;
    // event.buttons reflects the OS's live button state, unlike mouseup —
    // which never fires if the button was released outside the browser
    // window. Catches "drag out of bounds, release, come back" leaving a
    // stuck pan.
    if (!(event.buttons & 2)) {
      stopRightClickPan();
      return;
    }
    const dx = event.clientX - panStartX;
    const dy = event.clientY - panStartY;
    if (!panHasMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) panHasMoved = true;
    canvasRef.scrollLeft = panScrollLeft - dx;
    canvasRef.scrollTop  = panScrollTop  - dy;
  }

  function stopRightClickPan() {
    if (!isPanning) return;
    isPanning = false;
    document.removeEventListener('mousemove', onPanMove);
    document.removeEventListener('mouseup', stopRightClickPan);
  }

  function onMouseDown(event) {
    if (event.ctrlKey && event.button === 1) {
      if (event.cancelable) event.preventDefault();
      // Reset to the deterministic screen-based home zoom (same as first mount)
      if (canvasRef) {
        scale = getInitialScale();
        canvasRef.scrollLeft = 0;
        canvasRef.scrollTop = 0;
      }
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      startRightClickPan(event);
    }
  }

  // Canvas block context menu
  let canvasCtxMenu = { open: false, x: 0, y: 0 };
  let canvasCtxBlock = null;
  let canvasLongPressTimer;
  let canvasLongPressBlockId = null;

  function closeCanvasCtxMenu() {
    canvasCtxMenu = { open: false, x: 0, y: 0 };
    canvasCtxBlock = null;
  }

  function openCanvasCtxMenuForBlock(blockId, x, y) {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    canvasCtxBlock = block;
    canvasCtxMenu = { open: true, x, y };
  }

  function onContextMenu(event) {
    event.preventDefault();
    const wasPan = panHasMoved;
    stopRightClickPan();
    if (wasPan) return;
    const blockEl = event.target?.closest?.('[data-block-id]');
    if (!blockEl) return;
    openCanvasCtxMenuForBlock(blockEl.dataset.blockId, event.clientX, event.clientY);
  }

  function onCanvasTouchStart(event) {
    if (event.touches?.length !== 1) return;
    const blockEl = event.target?.closest?.('[data-block-id]');
    if (!blockEl) return;
    const blockId = blockEl.dataset.blockId;
    const touch = event.touches[0];
    canvasLongPressBlockId = blockId;
    clearTimeout(canvasLongPressTimer);
    canvasLongPressTimer = setTimeout(() => {
      openCanvasCtxMenuForBlock(canvasLongPressBlockId, touch.clientX, touch.clientY);
    }, 550);
  }

  function onCanvasTouchMove() {
    clearTimeout(canvasLongPressTimer);
  }

  function onCanvasTouchEnd() {
    clearTimeout(canvasLongPressTimer);
  }

  function extensionFromMime(mime = '') {
    const m = mime.toLowerCase();
    if (m.includes('jpeg')) return 'jpg';
    if (m.includes('png')) return 'png';
    if (m.includes('gif')) return 'gif';
    if (m.includes('webp')) return 'webp';
    if (m.includes('svg')) return 'svg';
    if (m.includes('mp4')) return 'mp4';
    if (m.includes('webm')) return 'webm';
    return 'bin';
  }

  function buildCanvasMenuItems(block) {
    if (!block) return [];
    const items = [];
    if (block.type === 'image') {
      const src = typeof block.src === 'string' ? block.src : (block.resolvedSrc || '');
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

  function handleCanvasColorChange(detail) {
    if (!canvasCtxBlock) return;
    const changed = {};
    if (detail.bgColor !== undefined) changed.bgColor = detail.bgColor;
    if (detail.textColor !== undefined) changed.textColor = detail.textColor;
    const keys = Object.keys(changed);
    if (!keys.length) return;
    // Live drag = no history; release (commit) = snapshot. Bump either way so
    // the canvas block (which caches its colors) re-renders for live preview.
    updateBlockHandler({ detail: { id: canvasCtxBlock.id, ...changed, changedKeys: keys, pushToHistory: !!detail.commit, bumpVersion: true } });
    // keep the open menu's swatches in sync
    canvasCtxBlock = { ...canvasCtxBlock, ...changed };
  }

  async function handleCanvasMenuAction(actionId) {
    const block = canvasCtxBlock;
    closeCanvasCtxMenu();
    if (!block) return;

    if (actionId === 'delete') {
      deleteBlockHandler({ detail: { id: block.id } });
    } else if (actionId === 'saveMedia') {
      const src = typeof block.src === 'string' ? block.src : (block.resolvedSrc || '');
      if (src) {
        try {
          // A cross-origin href (any remote Firebase Storage URL) makes the
          // browser ignore the download attribute entirely and just
          // navigate to it instead — which also surfaces that URL (a bearer
          // token good for permanent access to the file) in the address bar
          // and browsing history. Fetching the real bytes and downloading a
          // same-origin blob: URL sidesteps both problems: it always forces
          // an instant local download, and the raw storage URL never
          // becomes visible anywhere in the browser UI.
          const blob = await (await fetch(src)).blob();
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = `image.${extensionFromMime(blob.type)}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(objectUrl);
        } catch (error) {
          console.error('Failed to save image:', error);
        }
      }
    } else if (actionId === 'copyMedia') {
      const src = typeof block.src === 'string' ? block.src : (block.resolvedSrc || '');
      if (src) {
        try {
          let blob;
          if (src.startsWith('data:image/')) {
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
    } else if (actionId === 'copyText') {
      const text = htmlToPlainText(block.content);
      if (text) await navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  function onTouchEnd(event) {
    if (event.touches.length < 2) {
      lastDistance = null;
      lastMidpoint = null;
    }
  }

  export function refitCanvas() {
    const measured = measureCanvasFromBlocks();
    canvasWidth = measured.width;
    canvasHeight = measured.height;
    contentOffsetX = measured.offsetX ?? 0;
    fitToViewport();
  }


  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};`;

  // Cancel an in-progress right-click pan if the window loses focus mid-drag
  // (the document mouseup may never arrive in that case).
  function handleWindowBlur() {
    stopRightClickPan();
  }

  onMount(() => {
    refitCanvas();

    window.addEventListener('blur', handleWindowBlur);

    return () => {
      stopRightClickPan();
      window.removeEventListener('blur', handleWindowBlur);
    };
  });
</script>


<style>
.canvas {
  position: fixed;
  top: var(--controls-height, 56px);
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--canvas-outer-bg, rgb(0, 0, 0));
  overflow: auto;
  touch-action: pan-x pan-y;
  --sb-track: var(--canvas-outer-bg, #000000);
  --sb-thumb: var(--canvas-inner-bg, #1a1a1a);
}

.canvas.panning {
  cursor: grabbing;
}
.canvas.panning * {
  pointer-events: none;
  user-select: none;
}



.canvas-inner {
  position: absolute;
  inset: 0 auto auto 0;
  transform-origin: top left;
  background: var(--canvas-inner-bg, #000000);
}

 .canvas-zoom-shell {
  position: relative;
  background: var(--canvas-inner-bg, #000000);
}

.canvas-content {
  width: 100%;
  height: 100%;
}



@media (max-width: 1024px) {
  .canvas {
  position: fixed;
  top: var(--controls-height, 56px);
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--canvas-outer-bg, #141414);
  overflow: auto;
  }

  .canvas-zoom-shell {
    min-width: 100%;
  }
}

</style>




<div
  class="canvas"
  class:simple-note={mode === 'simple'}
  class:panning={isPanning}
  role="region"
  aria-label="Canvas viewport"
  bind:this={canvasRef}
  style={canvasCssVars}
  on:touchstart={(e) => { onTouchStart(e); onCanvasTouchStart(e); }}
  on:touchmove={(e) => { onTouchMove(e); onCanvasTouchMove(); }}
  on:touchend={(e) => { onTouchEnd(e); onCanvasTouchEnd(); }}
  on:wheel|nonpassive={onWheel}
  on:mousedown={onMouseDown}
  on:contextmenu={onContextMenu}
>
    <div
      class="canvas-zoom-shell"
      style:width={`${shellWidth}px`}
      style:height={`${shellHeight}px`}
      >
      <div
        class="canvas-inner"
        style:width={`${canvasWidth}px`}
        style:height={`${canvasHeight}px`}
        style:transform={`scale(${scale})`}
        style:background={canvasTheme.innerBg || defaultCanvasColors.innerBg}
      >
      <div class="canvas-content" style:transform={`translateX(${contentOffsetX}px)`}>
      {#each blocks as block (`${block.id}-${block._version || 0}`)}
        {#if block.type === 'text'}
          <TexteBlock
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialContent={block.content}
            initialScrollTop={block.scrollTop}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}

          />
        {:else if block.type === 'image'}
          <ImgBlock
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialSrc={block.src}
            initialResolvedSrc={block.resolvedSrc}
            initialAttachmentRequiresAuth={block.attachmentRequiresAuth}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}
            on:lightbox={openCanvasLightbox}
          />
        {:else if block.type === 'cleantext'}
          <Texteclean
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialContent={block.content}
            initialScrollTop={block.scrollTop}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}

          />
        {:else if block.type === 'music'}
          <Music
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialContent={block.content}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}
          />
        {:else if block.type === 'embed'}
          <Embed
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialContent={block.content}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}
          />
        {:else if block.type === 'task'}
          <TaskBlock
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialTasks={block.tasks}
            initialTitle={block.title}
            initialAddDirection={block.addDirection}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}
          />
        {/if}
      {/each}
      </div>
      </div>
    </div>
</div>

{#if lbOpen}
  <Lightbox images={lbImages} startIndex={lbStart} on:close={() => lbOpen = false} />
{/if}

{#if canvasCtxMenu.open}
  <BlockContextMenu
    x={canvasCtxMenu.x}
    y={canvasCtxMenu.y}
    items={buildCanvasMenuItems(canvasCtxBlock)}
    colorEdit={true}
    bgColor={canvasCtxBlock?.bgColor || '#000000'}
    textColor={canvasCtxBlock?.textColor || '#ffffff'}
    on:action={(e) => handleCanvasMenuAction(e.detail)}
    on:colorChange={(e) => handleCanvasColorChange(e.detail)}
    on:close={closeCanvasCtxMenu}
  />
{/if}
