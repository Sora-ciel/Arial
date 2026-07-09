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

  const LOUPE_SIZE = 100;   // on-screen px
  const LOUPE_GAP = 28;     // vertical clear space between the aim point and the loupe's nearest edge
  const LOUPE_GAP_X = 16;   // horizontal clear space (smaller — sits closer/more left than the vertical gap)
  const SAMPLE = 11;        // odd number of source pixels across the loupe

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  async function capture() {
    try {
      const html2canvas = (await import('html2canvas')).default;
      // Color sampling doesn't need retina-level fidelity, and every extra
      // scale factor multiplies the pixel count html2canvas has to render —
      // devicePixelRatio (2-3x on most laptops/phones) was the single
      // biggest cost here for no visible benefit. Capturing only the
      // viewport (not the full, possibly much taller document.body) and
      // skipping img/video entirely (compositeMedia draws those itself,
      // instantly, from the already-loaded live elements — no reason to
      // make html2canvas redundantly decode them too) cut the rest.
      scale = 1;
      snapCanvas = await html2canvas(document.body, {
        backgroundColor: null,
        scale,
        logging: false,
        useCORS: true,
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        ignoreElements: (el) =>
          el.classList?.contains('eyedropper-overlay') ||
          el.classList?.contains('ctx-menu') ||
          el.classList?.contains('cp-popover') ||
          el.tagName === 'IMG' ||
          el.tagName === 'VIDEO'
      });
      compositeMedia();
      ready = true;
    } catch (e) {
      failed = true;
    }
  }

  function getObjectFitRect(rect, naturalW, naturalH, fit) {
    if (!naturalW || !naturalH) return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
    const boxRatio = rect.width / rect.height;
    const natRatio = naturalW / naturalH;
    let w, h;
    if (fit === 'cover') {
      if (natRatio > boxRatio) { h = rect.height; w = h * natRatio; } else { w = rect.width; h = w / natRatio; }
    } else if (fit === 'fill') {
      w = rect.width; h = rect.height;
    } else if (fit === 'none') {
      w = naturalW; h = naturalH;
    } else {
      // 'contain' (the default used across all our blocks)
      if (natRatio > boxRatio) { w = rect.width; h = w / natRatio; } else { h = rect.height; w = h * natRatio; }
    }
    return { x: rect.left + (rect.width - w) / 2, y: rect.top + (rect.height - h) / 2, w, h };
  }

  // Draw each on-screen <img>/<video> onto the snapshot at its real,
  // object-fit-aware position — html2canvas doesn't understand object-fit
  // (every media block uses it), so its own render of these comes out
  // blank. Every image is a local data:/blob: URL by the time it's
  // rendered — freshly picked files always were, and synced-in images get
  // downloaded and cached locally the first time they're saved (see
  // storage.js) — so drawing the live element directly is safe and instant:
  // no fetch, no CORS handling, nothing to wait on.
  function compositeMedia() {
    const ctx = snapCanvas.getContext('2d');
    const elements = [...document.querySelectorAll('img, video')].filter((el) => {
      if (el.closest('.eyedropper-overlay, .ctx-menu, .cp-popover')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 &&
        r.right > 0 && r.bottom > 0 &&
        r.left < window.innerWidth && r.top < window.innerHeight;
    });

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const isVideo = el.tagName === 'VIDEO';
      const naturalW = isVideo ? el.videoWidth : el.naturalWidth;
      const naturalH = isVideo ? el.videoHeight : el.naturalHeight;
      if (!naturalW || !naturalH) continue;

      const fit = getComputedStyle(el).objectFit || 'fill';
      const content = getObjectFitRect(rect, naturalW, naturalH, fit);

      try {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.left * scale, rect.top * scale, rect.width * scale, rect.height * scale);
        ctx.clip();
        ctx.drawImage(el, content.x * scale, content.y * scale, content.w * scale, content.h * scale);
        ctx.restore();
      } catch {
        // A straggling remote-URL image that hasn't been locally cached yet
        // (rare, and self-heals on its next save) can still taint a draw
        // here — skip it rather than let it break sampling for everything
        // else on screen.
      }
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
    // The centre pixel is marked by the .loupe-crosshair overlay — drawing a
    // second highlight square here would double it up.
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

  // Mouse: click immediately picks (the cursor already previews as it
  // hovers). Touch has no hover — committing on touchstart would pick
  // whatever's under the finger before the loupe has even shown, so touch
  // instead drags to aim and picks on release, same as the iOS text-selection
  // magnifier pattern.
  function onDown(e) {
    if (e.pointerType === 'touch') {
      onMove(e);
      return;
    }
    onPick(e);
  }

  function onUp(e) {
    if (e.pointerType !== 'touch') return;
    onPick(e);
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

  // The loupe floats diagonally up-and-right of the aim point by default —
  // a clear LOUPE_GAP away, never touching it — flipping to whichever side
  // has room if the cursor is near a screen edge.
  $: loupeLeft = (() => {
    const half = LOUPE_SIZE / 2;
    const margin = 8;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 9999;
    const minCenter = half + margin;
    const maxCenter = viewportW - half - margin;
    const rightCenter = cursorX + LOUPE_GAP_X + half;
    const leftCenter = cursorX - LOUPE_GAP_X - half;
    if (rightCenter <= maxCenter) return rightCenter;
    if (leftCenter >= minCenter) return leftCenter;
    return Math.max(minCenter, Math.min(rightCenter, maxCenter));
  })();
  const LOUPE_VERTICAL_NUDGE = 2; // sit a touch lower relative to the aim point
  $: loupeTop = (() => {
    const margin = 8;
    const above = cursorY - LOUPE_GAP - LOUPE_SIZE + LOUPE_VERTICAL_NUDGE;
    return above >= margin ? above : cursorY + LOUPE_GAP + LOUPE_VERTICAL_NUDGE;
  })();
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="eyedropper-overlay"
  on:pointermove={onMove}
  on:pointerdown={onDown}
  on:pointerup={onUp}
  on:contextmenu|preventDefault={() => dispatch('cancel')}
>
  {#if !ready && !failed}
    <div class="eyedropper-hint">Preparing color picker…</div>
  {:else if failed}
    <div class="eyedropper-hint">Couldn't read screen colors here.</div>
  {:else}
    <div class="loupe" style="left:{loupeLeft}px; top:{loupeTop}px;">
      <canvas bind:this={loupeCanvas} class="loupe-canvas" style="width:{LOUPE_SIZE}px; height:{LOUPE_SIZE}px;"></canvas>
      <div class="loupe-crosshair" style="top:{LOUPE_SIZE / 2}px;"></div>
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
