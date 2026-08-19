<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import BlockContextMenu from './BlockContextMenu.svelte';

  // Array of image/video URLs to display
  export let images = [];
  // Which image to show first
  export let startIndex = 0;

  const dispatch = createEventDispatcher();

  let index = startIndex;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let panning = false;
  let wasDrag = false;
  let panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;
  let mouseRatio = 0.5; // 0–1 across viewport width

  $: src = images[index] ?? '';
  $: isVideo = src.startsWith('data:video') || src.endsWith('.mp4') || src.endsWith('.webm');
  $: showLeft  = images.length > 1 && mouseRatio < 0.22;
  $: showRight = images.length > 1 && mouseRatio > 0.78;

  function resetMotion() { scale = 1; panX = 0; panY = 0; }

  function prev() {
    index = index > 0 ? index - 1 : images.length - 1;
    resetMotion();
  }

  function next() {
    index = index < images.length - 1 ? index + 1 : 0;
    resetMotion();
  }

  function close() { dispatch('close'); }

  function onWheel(event) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    scale = Math.max(0.5, Math.min(8, scale * factor));
  }

  function trackMouse(event) {
    mouseRatio = event.clientX / window.innerWidth;
    if (panning) onPanMove(event);
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    panning = true;
    wasDrag = false;
    panStartX = event.clientX; panStartY = event.clientY;
    panOriginX = panX; panOriginY = panY;
    document.addEventListener('mousemove', onPanMove);
    document.addEventListener('mouseup', stopPan);
  }

  function onPanMove(event) {
    if (!panning) return;
    clearTimeout(lbLongPressTimer);
    const dx = event.clientX - panStartX;
    const dy = event.clientY - panStartY;
    if (!wasDrag && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) wasDrag = true;
    if (wasDrag) { panX = panOriginX + dx; panY = panOriginY + dy; }
  }

  function stopPan() {
    panning = false;
    document.removeEventListener('mousemove', onPanMove);
    document.removeEventListener('mouseup', stopPan);
  }

  function onOverlayClick() {
    if (suppressNextClick) { suppressNextClick = false; return; }
    if (ctxMenu.open) return;
    if (wasDrag) { wasDrag = false; return; }
    close();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      // Stop other handlers (e.g. parent's block-menu handler) from also firing
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (event.key === 'ArrowLeft')  prev();
    if (event.key === 'ArrowRight') next();
  }

  // Context menu
  let ctxMenu = { open: false, x: 0, y: 0 };
  let lbLongPressTimer;
  let suppressNextClick = false;

  function openCtxMenu(x, y) {
    ctxMenu = { open: true, x, y };
  }

  function handleLbContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    openCtxMenu(event.clientX, event.clientY);
  }

  // Touch swipe (prev/next) — tracked alongside the long-press-to-menu
  // timer so a swipe cancels the long-press, and a completed swipe
  // suppresses the tap-to-close click that follows it.
  const SWIPE_THRESHOLD = 40;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let isSwipeGesture = false;

  // The media swallows clicks on desktop so panning never closes the viewer.
  // On touch there is no pan, and with the sides given over to navigation the
  // centre has to stay an easy way out — so let the tap through there.
  let lastPointerWasTouch = false;
  function onMediaClick(event) {
    if (!lastPointerWasTouch) event.stopPropagation();
  }

  function handleLbPointerDown(event) {
    lastPointerWasTouch = event.pointerType === 'touch';
    if (event.pointerType === 'touch') {
      swipeStartX = event.clientX;
      swipeStartY = event.clientY;
      isSwipeGesture = false;
    } else if (event.button !== 0) {
      return;
    }
    clearTimeout(lbLongPressTimer);
    const cx = event.clientX, cy = event.clientY;
    lbLongPressTimer = setTimeout(() => {
      suppressNextClick = true;
      openCtxMenu(cx, cy);
    }, 550);
  }

  function handleLbPointerMove(event) {
    clearTimeout(lbLongPressTimer);
    if (event.pointerType !== 'touch' || images.length < 2) return;
    const dx = event.clientX - swipeStartX;
    const dy = event.clientY - swipeStartY;
    if (!isSwipeGesture && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      isSwipeGesture = true;
    }
  }

  function handleLbPointerUp(event) {
    clearTimeout(lbLongPressTimer);
    if (event.pointerType === 'touch' && isSwipeGesture) {
      const dx = event.clientX - swipeStartX;
      if (Math.abs(dx) >= SWIPE_THRESHOLD) {
        suppressNextClick = true;
        if (dx < 0) next(); else prev();
      }
    }
    isSwipeGesture = false;
  }

  function handleLbPointerCancel() {
    clearTimeout(lbLongPressTimer);
    isSwipeGesture = false;
  }

  $: ctxItems = [
    { id: 'saveMedia', label: isVideo ? 'Save video' : 'Save image' },
    { id: 'copyMedia', label: isVideo ? 'Copy URL' : 'Copy to clipboard' }
  ];

  async function handleCtxAction(actionId) {
    if (actionId === 'saveMedia') {
      const a = document.createElement('a');
      a.href = src;
      a.download = isVideo ? 'video' : 'image';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (actionId === 'copyMedia') {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          return;
        }
      } catch {}
      try { await navigator.clipboard.writeText(src); } catch {}
    }
  }

  onMount(() => document.addEventListener('keydown', onKeyDown));
  onDestroy(() => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('mousemove', onPanMove);
    document.removeEventListener('mouseup', stopPan);
    clearTimeout(lbLongPressTimer);
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="lb-overlay"
  class:lb-panning={panning}
  on:click={onOverlayClick}
  on:mousemove={trackMouse}
  on:mousedown={onMouseDown}
  on:wheel|preventDefault={onWheel}
  on:contextmenu={handleLbContextMenu}
  on:pointerdown={handleLbPointerDown}
  on:pointermove={handleLbPointerMove}
  on:pointerup={handleLbPointerUp}
  on:pointercancel={handleLbPointerCancel}
>
  {#if isVideo}
    <!-- svelte-ignore a11y-media-has-caption -->
    <video
      class="lb-media"
      src={src}
      controls
      style="transform: translate({panX}px, {panY}px) scale({scale})"
      on:click={onMediaClick}
    ></video>
  {:else}
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <img
      class="lb-media"
      src={src}
      alt=""
      style="transform: translate({panX}px, {panY}px) scale({scale})"
      on:click={onMediaClick}
    />
  {/if}

  {#if images.length > 1}
    <button class="lb-arrow lb-left"  class:lb-arrow-visible={showLeft}  on:click|stopPropagation={prev}>‹</button>
    <button class="lb-arrow lb-right" class:lb-arrow-visible={showRight} on:click|stopPropagation={next}>›</button>
    <div class="lb-counter">{index + 1} / {images.length}</div>
  {/if}

  <button class="lb-close" on:click|stopPropagation={close}>✕</button>

  {#if ctxMenu.open}
    <BlockContextMenu
      x={ctxMenu.x}
      y={ctxMenu.y}
      items={ctxItems}
      on:action={(e) => handleCtxAction(e.detail)}
      on:close={() => { ctxMenu = { open: false, x: 0, y: 0 }; }}
    />
  {/if}
</div>

<style>
  .lb-overlay {
    position: fixed;
    inset: 0;
    z-index: 9000;
    background: rgba(0, 0, 0, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
    /* Without this the browser claims the touch gesture as a scroll/zoom and
       answers with pointercancel, so the swipe never reaches pointerup. */
    touch-action: none;
  }
  .lb-overlay.lb-panning { cursor: grabbing; }

  .lb-media {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 6px;
    transform-origin: center center;
    transition: transform 0.1s ease;
    cursor: default;
    user-select: none;
    pointer-events: none;
  }
  .lb-panning .lb-media { transition: none; }

  .lb-close {
    position: fixed;
    top: 16px;
    right: 18px;
    background: rgba(255,255,255,0.12);
    border: none;
    color: #fff;
    font-size: 1.3rem;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  .lb-close:hover { opacity: 1; }

  .lb-arrow {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255,255,255,0.12);
    border: none;
    color: #fff;
    font-size: 2.4rem;
    width: 54px;
    height: 80px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
    line-height: 1;
  }
  .lb-arrow.lb-left  { left: 12px; }
  .lb-arrow.lb-right { right: 12px; }

  /* On touch there is no hover, so the arrows above could never be tapped.
     Replace them with two invisible columns running the full height of the
     screen and reaching its very edges — wide enough to hit without aiming,
     while the ~30% left in the middle still closes the lightbox on tap. */
  @media (max-width: 1024px) {
    .lb-arrow {
      top: 0;
      bottom: 0;
      height: auto;
      width: 35%;
      transform: none;
      border-radius: 0;
      background: transparent;
      /* stays invisible in every state — the view has to remain clean */
      opacity: 0;
      color: transparent;
      font-size: 0;
      pointer-events: auto;
      z-index: 1;
    }
    .lb-arrow.lb-arrow-visible,
    .lb-arrow:hover { opacity: 0; }
    .lb-arrow.lb-left  { left: 0; }
    .lb-arrow.lb-right { right: 0; }

    /* keep the close button reachable above the right-hand column */
    .lb-close { z-index: 2; }
  }
  .lb-arrow.lb-arrow-visible { opacity: 0.8; pointer-events: auto; }
  .lb-arrow:hover { opacity: 1 !important; }

  .lb-counter {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255,255,255,0.6);
    font-size: 0.88rem;
    pointer-events: none;
  }
</style>
