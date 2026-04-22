<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import TexteBlock from '../components/TexteBlock.svelte';
  import ImgBlock from '../components/ImgBlock.svelte';
  import Texteclean from '../components/TexteClean.svelte';
  import Music from '../components/MusicBlock.svelte';
  import Embed from '../components/EmbedBlock.svelte';
  import TaskBlock from '../components/TaskBlock.svelte';


  export let mode;
  export let blocks;

  export let canvasRef;
  export let focusedBlockId;
  export let canvasColors = {};

  

  const MIN_CANVAS_WIDTH = 1080;
  const MIN_CANVAS_HEIGHT = 320;
  const BLOCK_MARGIN_LEFT = 5;
  const BLOCK_MARGIN_RIGHT = 5;
  const BLOCK_MARGIN_BOTTOM = 20;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 4;

  let scale = 1;
  let lastDistance = null;
  let lastMidpoint = null;
  let canvasWidth = MIN_CANVAS_WIDTH;
  let canvasHeight = MIN_CANVAS_HEIGHT;
  let contentOffsetX = 0;

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

    return {
      width: Math.max(MIN_CANVAS_WIDTH, contentWidth + BLOCK_MARGIN_LEFT + BLOCK_MARGIN_RIGHT),
      height: Math.max(MIN_CANVAS_HEIGHT, maxY + BLOCK_MARGIN_BOTTOM),
      offsetX: BLOCK_MARGIN_LEFT - safeMinX
    };
  }

  function fitToViewport() {
    if (!canvasRef) return;
    const controlsHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--controls-height')) || 56;
    const availableWidth = Math.max(window.innerWidth, 1);
    const availableHeight = Math.max(window.innerHeight - controlsHeight, 1);
    const fittedScale = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);
    scale = Math.min(1, fittedScale);
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
    const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldScale * (newDistance / lastDistance)));
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

  onMount(() => {
    refitCanvas();
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
}



.canvas-inner {
  position: absolute;
  inset: 0 auto auto 0;
  transform-origin: top left;
  background: var(--canvas-inner-bg, #000000);
}

 .canvas-zoom-shell {
  position: relative;
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
}

</style>




<div
  class="canvas"
  class:simple-note={mode === 'simple'}
  bind:this={canvasRef}
  style={canvasCssVars}
  on:touchstart={onTouchStart}
  on:touchmove={onTouchMove}
  on:touchend={onTouchEnd}
>
    <div
      class="canvas-zoom-shell"
      style:width={`${canvasWidth * scale}px`}
      style:height={`${canvasHeight * scale}px`}
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
          />
        {:else if block.type === 'cleantext'}
          <Texteclean
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
