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

  const CANVAS_BASE_HEIGHT = 900;
  const CANVAS_ASPECT_RATIO = 16 / 9;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 4;

  let scale = 1;
  let lastDistance = null;
  let lastMidpoint = null;
  let canvasWidth = CANVAS_BASE_HEIGHT * CANVAS_ASPECT_RATIO;
  let canvasHeight = CANVAS_BASE_HEIGHT;

  const dispatch = createEventDispatcher();

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeBlockForCanvas(detail) {
    if (!detail || typeof detail !== 'object') return detail;

    const nextSize = { ...(detail.size || {}) };
    const nextPosition = { ...(detail.position || {}) };

    const width = clamp(Number(nextSize.width || 0), 1, canvasWidth);
    const height = clamp(Number(nextSize.height || 0), 1, canvasHeight);

    nextSize.width = width;
    nextSize.height = height;

    nextPosition.x = clamp(Number(nextPosition.x || 0), 0, Math.max(0, canvasWidth - width));
    nextPosition.y = clamp(Number(nextPosition.y || 0), 0, Math.max(0, canvasHeight - height));

    return {
      ...detail,
      size: nextSize,
      position: nextPosition
    };
  }

  function deleteBlockHandler(event) {
    dispatch('delete', event.detail);
  }

  function updateBlockHandler(event) {
    const normalizedDetail = normalizeBlockForCanvas(event.detail);
    dispatch('update', { ...normalizedDetail });
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

  function fitToViewport() {
    if (!canvasRef) return;
    const controlsHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--controls-height')) || 56;
    const availableWidth = Math.max(window.innerWidth, 1);
    const availableHeight = Math.max(window.innerHeight - controlsHeight, 1);
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    scale = isMobile
      ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, availableHeight / canvasHeight))
      : Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight)));

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
    canvasWidth = CANVAS_BASE_HEIGHT * CANVAS_ASPECT_RATIO;
    canvasHeight = CANVAS_BASE_HEIGHT;
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
    window.addEventListener('resize', fitToViewport);

    return () => {
      window.removeEventListener('resize', fitToViewport);
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
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.canvas-inner {
  position: absolute;
  inset: 0 auto auto 0;
  transform-origin: top left;
  background: var(--canvas-inner-bg, #000000);
  overflow: hidden;
}

.canvas-zoom-shell {
  position: relative;
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
