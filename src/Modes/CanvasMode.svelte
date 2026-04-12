<script>
  import { createEventDispatcher } from 'svelte';
  import { onMount, tick } from 'svelte';
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

  

  let scale = 1;
  let baseScale = 1; 
  let userZoom = 1;
  let lastDistance = null;
  let isMobile = false;
  let hasUserZoomed = false;
  let lastViewportWidth = 0;




  const dispatch = createEventDispatcher();


  function deleteBlockHandler(event) {
   dispatch ('delete', event.detail);
  }

  function updateBlockHandler(event) {
   dispatch('update', { ...event.detail });
  }

  function focusToggleHandler(event) {
    dispatch('focusToggle', event.detail);
  }


  function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(e) {
    if (!isMobile) return;
    if (e.touches.length === 2) {
      lastDistance = getDistance(e.touches);
    }
  }

  function onTouchMove(e) {
    if (!isMobile) return;
    if (e.touches.length === 2 && lastDistance) {
      const newDistance = getDistance(e.touches);
      const diff = newDistance - lastDistance;

      let newScale = scale + diff * 0.005;
      newScale = Math.max(baseScale * 0.5, Math.min(baseScale * 3, newScale)); 

      scale = newScale;
      userZoom = scale / baseScale;
      hasUserZoomed = true;
      lastDistance = newDistance;

      e.preventDefault();
    }
  }

  function onTouchEnd() {
    lastDistance = null;
  }

  function fitCanvasToScreen({ resetUserZoom = false } = {}) {
    if (!canvasRef) return;
    const inner = canvasRef.querySelector(".canvas-inner");
    if (!inner) return;

    const controlsHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--controls-height")) || 56;
    const availableWidth = window.innerWidth;
    const availableHeight = window.innerHeight - controlsHeight;

    const scaleX = availableWidth / 1920;
    const scaleY = availableHeight / 1080;
    const previousScale = scale;
    baseScale = Math.min(scaleX, scaleY);

    if (resetUserZoom) {
      userZoom = 1;
      hasUserZoomed = false;
      scale = baseScale;
    } else if (hasUserZoomed) {
      const nextUserZoom = previousScale / baseScale;
      userZoom = Math.max(0.5, Math.min(3, nextUserZoom));
      scale = baseScale * userZoom;
    } else {
      userZoom = 1;
      scale = baseScale;
    }

    inner.style.transformOrigin = "top left";
  }

  export function refitCanvas() {
    tick().then(() => {
      fitCanvasToScreen({ resetUserZoom: true });
    });
  }

  function checkIsMobile() {
    const viewportWidth = window.innerWidth;
    const wasMobile = isMobile;
    const hasTouchInput = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
    const nextIsMobile = viewportWidth <= 1024 || (wasMobile && hasTouchInput);
    const widthChanged = Math.abs(viewportWidth - lastViewportWidth) > 2;

    isMobile = nextIsMobile;

    if (isMobile && (!wasMobile || widthChanged)) {
      fitCanvasToScreen({ resetUserZoom: !hasUserZoomed || !wasMobile });
    } else if (!isMobile) {
      scale = 1; // reset scale on desktop
      userZoom = 1;
      hasUserZoomed = false;
    }

    lastViewportWidth = viewportWidth;
  }

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};`;
  $: innerScale = isMobile ? scale : 1;

  onMount(() => {
    lastViewportWidth = window.innerWidth;
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => {
      window.removeEventListener("resize", checkIsMobile);
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
}



.canvas-inner {
  width: 1800px;
  height: 900px;
  transform-origin: top left;
  transition: transform 0.05s linear;
  background: var(--canvas-inner-bg, #000000);
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
      class="canvas-inner"
      style:transform={`scale(${innerScale})`}
      style:background={canvasTheme.innerBg || defaultCanvasColors.innerBg}
    >
      {#each blocks as block (block.id + (block.type !== 'text' && block.type !== 'cleantext' ? '-' + (block._version || 0) : ''))}
        {#if block.type === 'text'}
          <TexteBlock
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialContent={block.content}
            focused={block.id === focusedBlockId}
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
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}
          />
        {/if}
      {/each}
    </div>
</div>
