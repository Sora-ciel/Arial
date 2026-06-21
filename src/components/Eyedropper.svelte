<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  const dispatch = createEventDispatcher();

  let snapCanvas = null;   // captured page
  let scale = 1;
  let ready = false;
  let failed = false;
  let loupeCanvas;
  let cursorX = -9999, cursorY = -9999;
  let currentHex = '#000000';

  const LOUPE_SIZE = 132;   // on-screen px
  const SAMPLE = 11;        // odd number of source pixels across the loupe

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  async function capture() {
    try {
      const html2canvas = (await import('html2canvas')).default;
      scale = window.devicePixelRatio || 1;
      snapCanvas = await html2canvas(document.body, {
        backgroundColor: null,
        scale,
        logging: false,
        useCORS: true,
        ignoreElements: (el) =>
          el.classList?.contains('eyedropper-overlay') ||
          el.classList?.contains('ctx-menu') ||
          el.classList?.contains('cp-popover')
      });
      ready = true;
    } catch (e) {
      failed = true;
    }
  }

  function sampleAt(clientX, clientY) {
    if (!snapCanvas) return;
    const ctx = snapCanvas.getContext('2d');
    const px = Math.round(clientX * scale);
    const py = Math.round(clientY * scale);
    try {
      const d = ctx.getImageData(px, py, 1, 1).data;
      currentHex = rgbToHex(d[0], d[1], d[2]);
    } catch {}
    drawLoupe(px, py);
  }

  function drawLoupe(px, py) {
    if (!loupeCanvas || !snapCanvas) return;
    const lctx = loupeCanvas.getContext('2d');
    const dim = LOUPE_SIZE;
    if (loupeCanvas.width !== dim) { loupeCanvas.width = dim; loupeCanvas.height = dim; }
    lctx.imageSmoothingEnabled = false;
    lctx.clearRect(0, 0, dim, dim);
    const half = Math.floor(SAMPLE / 2);
    lctx.drawImage(snapCanvas, px - half, py - half, SAMPLE, SAMPLE, 0, 0, dim, dim);
    // highlight the centre pixel
    const cell = dim / SAMPLE;
    lctx.strokeStyle = 'rgba(0,0,0,0.65)';
    lctx.lineWidth = 1;
    lctx.strokeRect(half * cell + 0.5, half * cell + 0.5, cell - 1, cell - 1);
    lctx.strokeStyle = 'rgba(255,255,255,0.95)';
    lctx.strokeRect(half * cell + 1.5, half * cell + 1.5, cell - 3, cell - 3);
  }

  function onMove(e) {
    cursorX = e.clientX;
    cursorY = e.clientY;
    if (ready) sampleAt(e.clientX, e.clientY);
  }

  function onPick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (ready) {
      sampleAt(e.clientX, e.clientY);
      dispatch('pick', currentHex);
    } else {
      dispatch('cancel');
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      dispatch('cancel');
    }
  }

  onMount(() => {
    capture();
    window.addEventListener('keydown', onKey, true);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', onKey, true);
  });

  // keep the loupe inside the viewport
  $: loupeLeft = Math.min(Math.max(cursorX, LOUPE_SIZE / 2 + 4), (typeof window !== 'undefined' ? window.innerWidth : 9999) - LOUPE_SIZE / 2 - 4);
  $: loupeTop = cursorY - LOUPE_SIZE / 2 - 28;
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="eyedropper-overlay"
  on:pointermove={onMove}
  on:pointerdown={onPick}
  on:contextmenu|preventDefault={() => dispatch('cancel')}
>
  {#if !ready && !failed}
    <div class="eyedropper-hint">Preparing color picker…</div>
  {:else if failed}
    <div class="eyedropper-hint">Couldn't read screen colors here.</div>
  {:else}
    <div class="loupe" style="left:{loupeLeft}px; top:{loupeTop}px;">
      <canvas bind:this={loupeCanvas} class="loupe-canvas" style="width:{LOUPE_SIZE}px; height:{LOUPE_SIZE}px;"></canvas>
      <div class="loupe-crosshair"></div>
      <div class="loupe-info">
        <span class="loupe-swatch" style="background:{currentHex}"></span>
        <span class="loupe-hex">{currentHex.toUpperCase()}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .eyedropper-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    cursor: crosshair;
    background: transparent;
    touch-action: none;
  }

  .eyedropper-hint {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 0.85rem;
    pointer-events: none;
  }

  .loupe {
    position: fixed;
    transform: translate(-50%, 0);
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .loupe-canvas {
    border-radius: 50%;
    border: 3px solid #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 6px 18px rgba(0, 0, 0, 0.5);
    background: #222;
    display: block;
  }

  .loupe-crosshair {
    position: absolute;
    top: calc((132px / 2));
    left: 50%;
    width: 12px;
    height: 12px;
    transform: translate(-50%, -50%);
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    border-radius: 2px;
    pointer-events: none;
  }

  .loupe-info {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-family: monospace;
  }
  .loupe-swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.5);
  }
</style>
