<script>
  import { createEventDispatcher } from 'svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 300, height: 200 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#ffffff';
  export let initialSrc = '';
  export let initialResolvedSrc = null;
  export let initialAttachmentRequiresAuth = false;
  export let focused = false;

  const dispatch = createEventDispatcher();
  const HEADER_HEIGHT = 30;
  const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
  

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor || '#000000';
  let src = initialSrc;
  let resolvedSrc = initialResolvedSrc;
  let attachmentRequiresAuth = initialAttachmentRequiresAuth;
  let aspectRatio = size.width / (size.height - HEADER_HEIGHT);


  let dragging = false;
  let resizing = false;
  let offset = { x: 0, y: 0 };
  let resizeStart = { x: 0, y: 0, width: 0, height: 0 };

  $: mediaSrc = typeof src === 'string' ? src : resolvedSrc || '';
  $: hasStorageAttachment = src && typeof src === 'object' && src.type === 'storage';
  let suppressClick = false;
  let hasDragged = false;
  let hasResized = false;


  function sendUpdate(changedKeys, { pushToHistory } = {}) {
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length ? changedKeys : [];
    const detail = { id, position, size, bgColor, textColor, src };

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }


  function onMediaChange(e) {
    ensureFocus();
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/') && file.size > MAX_VIDEO_BYTES) {
      alert('Video files must be 100MB or smaller to render.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      src = reader.result;
      resolvedSrc = null;
      attachmentRequiresAuth = false;

      const isVideo = file.type.startsWith('video/');

      const maxWidth = 400;
      const maxHeight = 300;

      if (!isVideo) {
        const img = new Image();
        img.src = src;
        img.onload = () => {
          const naturalRatio = img.width / img.height;

          let targetWidth = maxWidth;
          let targetHeight = targetWidth / naturalRatio;

          if (targetHeight > maxHeight) {
            targetHeight = maxHeight;
            targetWidth = targetHeight * naturalRatio;
          }

          size.width = targetWidth;
          size.height = targetHeight + HEADER_HEIGHT;  // add header height
          aspectRatio = targetWidth / targetHeight;   // media content ratio only


          sendUpdate(['src', 'size']);
        };
      } else {
        const videoEl = document.createElement('video');
        videoEl.src = src;
        videoEl.onloadedmetadata = () => {
          const naturalRatio = videoEl.videoWidth / videoEl.videoHeight;

          let targetWidth = maxWidth;
          let targetHeight = targetWidth / naturalRatio;

          if (targetHeight > maxHeight) {
            targetHeight = maxHeight;
            targetWidth = targetHeight * naturalRatio;
          }

          aspectRatio = naturalRatio;
          size.width = targetWidth;
          size.height = targetHeight + HEADER_HEIGHT;

          sendUpdate(['src', 'size']);
        };
      }
    };

    reader.readAsDataURL(file);
    e.target.value = '';
  }



function onDragStart(e) {
  ensureFocus();
  dragging = true;
  hasDragged = false;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  offset = { x: clientX - position.x, y: clientY - position.y };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('touchmove', onMouseMove, { passive: false });
  window.addEventListener('touchend', onMouseUp);
}

function onMouseMove(e) {
  if (!dragging) return;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  position.x = clientX - offset.x;
  position.y = clientY - offset.y;
  hasDragged = true;

  // Prevent scrolling when dragging on mobile
  if (e.cancelable) e.preventDefault();
}

function onMouseUp() {
  dragging = false;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('touchmove', onMouseMove);
  window.removeEventListener('touchend', onMouseUp);
  sendUpdate(['position']);
  if (hasDragged) {
    suppressClick = true;
    hasDragged = false;
    requestAnimationFrame(() => (suppressClick = false));
  }
}


function onResizeStart(e) {
  e.stopPropagation();
  ensureFocus();
  resizing = true;
  hasResized = false;
  document.body.style.userSelect = 'none';

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  resizeStart = {
    x: clientX,
    y: clientY,
    width: size.width,
    height: size.height
  };

  window.addEventListener('mousemove', onResizing);
  window.addEventListener('mouseup', onResizeEnd);
  window.addEventListener('touchmove', onResizing, { passive: false });
  window.addEventListener('touchend', onResizeEnd);
}

function onResizing(e) {
  if (!resizing) return;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const deltaX = clientX - resizeStart.x;

  const newWidth = Math.max(50, resizeStart.width + deltaX);
  const contentHeight = newWidth / aspectRatio;
  const totalHeight = contentHeight + HEADER_HEIGHT;

  if (contentHeight < 20) return;

  size.width = newWidth;
  size.height = totalHeight;
  hasResized = true;

  if (e.cancelable) e.preventDefault(); // stop scrolling on mobile
}

function onResizeEnd() {
  resizing = false;
  document.body.style.userSelect = '';
  window.removeEventListener('mousemove', onResizing);
  window.removeEventListener('mouseup', onResizeEnd);
  window.removeEventListener('touchmove', onResizing);
  window.removeEventListener('touchend', onResizeEnd);
  sendUpdate(['size']);
  if (hasResized) {
    suppressClick = true;
    hasResized = false;
    requestAnimationFrame(() => (suppressClick = false));
  }
}


  // Delete
  function deleteBlock() {
    dispatch('delete', { id });
  }

  function ensureFocus() {
    if (!focused) {
      dispatch('focusToggle', { id });
    }
  }

  function handleWrapperClick(event) {
    if (suppressClick) return;
    if (event.defaultPrevented) return;
    if (event.target.closest('[data-focus-guard]')) {
      ensureFocus();
      return;
    }
    dispatch('focusToggle', { id });
  }

  function handleWrapperKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    handleWrapperClick(event);
  }

</script>



<style>
  .wrapper {
    position: absolute;
    border: var(--block-border-width, 1px) solid var(--block-border-color, var(--text));
    border-radius: var(--block-border-radius, 12px);
    background: var(--block-surface, var(--bg));
    box-shadow: var(--block-shadow, 0 0 2px 1px var(--text), 0 0 6px 2px var(--text));
    overflow: hidden;
    display: flex;
    flex-direction: column;
    outline: 2px solid transparent;
    transition: box-shadow 0.15s ease, outline 0.15s ease;
    font-family: var(--block-body-font, inherit);
  }

  .wrapper.focused {
    outline: 2px solid var(--block-focus-outline, rgba(110, 168, 255, 0.85));
    box-shadow: var(--block-focus-shadow, 0 0 0 2px rgba(110, 168, 255, 0.35), 0 0 12px rgba(110, 168, 255, 0.5));
  }

  .header {
    background: var(--block-header-bg, var(--bg));
    height: 30px;
    padding: 4px 8px;
    cursor: move;
    user-select: none;
    font-size: 0.8rem;
    color: var(--block-header-text, var(--text));
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-family: var(--block-header-font, var(--block-body-font, inherit));
    letter-spacing: var(--block-header-letter-spacing, 0.08em);
    text-transform: var(--block-header-transform, uppercase);
  }

  .header-controls {

    display: flex;
    gap: 8px;
    align-items: center;
  }

  input[type="color"] {
    width: 28px;
    height: 22px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    padding: 0;
    cursor: pointer;
    border-radius: var(--block-control-radius, 6px);
    background: transparent;
  }

  input[type="file"] {
    display: none;
  }

  
/* Style the emoji container */
  .media-btn .emoji {
    display: inline-block;
    color: var(--block-media-button-text, var(--block-header-text, var(--text)));
    background: var(--block-media-button-bg, transparent);
    padding: 4px 6px;
    border-radius: var(--block-control-radius, 6px);
    cursor: pointer;
    font-size: 1.25rem;
  }

  button.delete-btn {
    background: var(--block-accent-color, var(--text));
    border-color: transparent;
    font-size: 1.1rem;
    color: var(--block-accent-text, var(--bg));
    cursor: pointer;
    padding: 0px 8px;
    border-radius: var(--block-control-radius, 6px);
    transition: transform 0.15s ease, filter 0.2s ease;
  }

  button.delete-btn:hover {
    transform: scale(1.05);
    filter: brightness(1.08);
  }

  img {
    background-color: var(--bg);
    flex-grow: 1;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: transparent;
  }

  .resize-handle {
    position: absolute;
    width: 50px;
    height: 50px;
    background: rgba(253, 253, 253, 0);
    right: 0;
    bottom: 0;
    cursor: se-resize;
    z-index: 10;
  }
  
</style>

<div
  class="wrapper"
  class:focused={focused}
  style="left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px; --bg: {bgColor}; --text: {textColor}"
  role="button"
  tabindex="0"
  aria-pressed={focused}
  on:click={handleWrapperClick}
  on:keydown={handleWrapperKeydown}
>
  <div class="header" role="presentation" on:mousedown={onDragStart} on:touchstart={onDragStart}>
    <div>image</div>
    <div class="header-controls" on:mousedown|stopPropagation role="presentation">

        <input
          type="color"
          bind:value={bgColor}
          on:change={() => sendUpdate(['bgColor'])}
          data-focus-guard
        />
        <input
          type="color"
          bind:value={textColor}
          on:change={() => sendUpdate(['textColor'])}
          data-focus-guard
        />

      <label title="Change Image" class="media-btn" data-focus-guard>
        <input type="file" accept="image/*,video/mp4" on:change={onMediaChange} data-focus-guard />
        <span class="emoji" data-focus-guard>⏏</span>
      </label>

      <button class="delete-btn" on:click|stopPropagation={deleteBlock}>×</button>
    </div>
  </div>

  <div class="media-container" style="flex-grow:1;">
    {#if mediaSrc}
      {#if mediaSrc.startsWith('data:video')}
        <video src={mediaSrc} autoplay loop muted playsinline style="width:100%; height:100%; object-fit:contain;"></video>
      {:else}
        <img src={mediaSrc} alt="" style="width:100%; height:100%; object-fit:contain;" />
      {/if}
    {:else if hasStorageAttachment}
      <div style="flex-grow:1; display:flex; align-items:center; justify-content:center; color:#777; text-align:center; padding: 8px;">
        {#if attachmentRequiresAuth}
          Sign in to view this attachment
        {:else}
          Attachment unavailable
        {/if}
      </div>
    {:else}
      <div style="flex-grow:1; display:flex; align-items:center; justify-content:center; color:#777;">
        No image loaded
      </div>
    {/if}
  </div>
  <div class="resize-handle" role="presentation" on:mousedown={onResizeStart} on:touchstart={onResizeStart}></div>
</div>
