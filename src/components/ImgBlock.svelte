<script>
  import { createEventDispatcher } from 'svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 300, height: 200 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#ffffff';
  export let initialSrc = '';
  export let focused = false;

  const dispatch = createEventDispatcher();
  const HEADER_HEIGHT = 30;
  

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor || '#000000';
  let src = initialSrc;
  let aspectRatio = size.width / (size.height - HEADER_HEIGHT);


  let dragging = false;
  let resizing = false;
  let offset = { x: 0, y: 0 };
  let resizeStart = { x: 0, y: 0, width: 0, height: 0 };

  function handleFocusRequest(event) {
    if (dragging || resizing) return;

    const target = event?.target;
    if (target?.closest('[data-focus-ignore]')) return;

    const isContent = !!target?.closest('[data-focus-content]');
    if (focused && isContent) return;

    if (focused && !isContent) {
      dispatch('focusToggle', { id: null });
      return;
    }

    dispatch('focusToggle', { id });
  }


  function sendUpdate(changedKeys, { pushToHistory } = {}) {
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length ? changedKeys : [];
    const detail = { id, position, size, bgColor, textColor, src };

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }


  function onMediaChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      src = reader.result;

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
  dragging = true;

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
}


function onResizeStart(e) {
  e.stopPropagation();
  resizing = true;
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
}


  // Delete
  function deleteBlock() {
    dispatch('delete', { id });
  }

</script>



<style>
  .wrapper {
    position: absolute;
    border: 1px solid var(--text)  ;
    border-radius: 8px;
    background: var(--bg) ;
    box-shadow: 0 0 2px 1px var(--text),
                0 0 6px 2px var(--text);

    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    outline: 2px solid transparent;
    transition: outline 0.15s ease, box-shadow 0.15s ease;
  }

  .wrapper.focused {
    outline: 2px solid rgba(77, 171, 247, 0.9);
    box-shadow: 0 0 8px 2px rgba(77, 171, 247, 0.65),
                0 0 18px 6px rgba(77, 171, 247, 0.35);
  }

  .header {
    background: var(--bg);
    height: 30px;
    padding: 4px;
    cursor: move;
    user-select: none;
    font-size: 0.8rem;
    color: var(--text);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .header-controls {

    display: flex;
    gap: 8px;
    align-items: center;
  }

  input[type="color"] {
    width: 28px;
    height: 22px;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  input[type="file"] {
    display: none;
  }

  
/* Style the emoji container */
  .media-btn .emoji {
    display: inline-block;
    color: var(--text);
    padding: 3px;

    border-radius: 0px;     /* rounded corners */
    cursor: pointer;
    font-size: 1.4rem;
  }

  button.delete-btn {
    background: var(--text);
    border-color: var(--bg);
    font-size: 1.1rem;
    color: var(--bg);
    cursor: pointer;
    padding: 0px 6px;
    border-radius: 3px;
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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="wrapper"
  class:focused={focused}
  on:click={handleFocusRequest}
  style="left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px; --bg: {bgColor}; --text: {textColor}"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="header" on:mousedown={onDragStart} on:touchstart={onDragStart}>
    <div>image</div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="header-controls"
      data-focus-ignore
      on:mousedown|stopPropagation
      on:click|stopPropagation
    >

        <input type="color" bind:value={bgColor} on:change={() => sendUpdate(['bgColor'])}/>
        <input type="color" bind:value={textColor} on:change={() => sendUpdate(['textColor'])}/>

      <label title="Change Image" class="media-btn">
        <input type="file" accept="image/*,video/mp4" on:change={onMediaChange} />
        <span class="emoji">⏏</span>
      </label>

      <button class="delete-btn" on:click|stopPropagation={deleteBlock}>×</button>
    </div>
  </div>

  <div class="media-container" style="flex-grow:1;" data-focus-content>
    {#if src}
      {#if src.startsWith('data:video')}
        <video src={src} autoplay loop muted playsinline style="width:100%; height:100%; object-fit:contain;"></video>
      {:else}
        <img src={src} alt="Block content preview" style="width:100%; height:100%; object-fit:contain;" />
      {/if}
    {:else}
      <div style="flex-grow:1; display:flex; align-items:center; justify-content:center; color:#777;">
        No image loaded
      </div>
    {/if}
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="resize-handle"
    on:mousedown={onResizeStart}
    on:touchstart={onResizeStart}
    data-focus-ignore
  ></div>
</div>
