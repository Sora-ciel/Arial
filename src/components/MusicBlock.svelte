<script>
  import { createEventDispatcher, onMount } from 'svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 320, height: 180 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#000000';
  export let initialTrackUrl = '';
  export let initialTitle = 'Music Player';
  export let focused = false;

  const dispatch = createEventDispatcher();

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor;
  let trackUrl = initialTrackUrl;
  let title = initialTitle;

  let dragging = false, resizing = false;
  let offset = { x: 0, y: 0 }, resizeStart = {};
  let suppressClick = false;
  let hasDragged = false;
  let hasResized = false;
  let showSettings = false;

  function sendUpdate(changedKeys, { pushToHistory } = {}) {
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length ? changedKeys : [];
    const detail = {
      id,
      position,
      size,
      bgColor,
      textColor,
      trackUrl,
      title
    };

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }

  // Handle local audio file upload
  function handleFileChange(event) {
    ensureFocus();
    const file = event.target.files?.[0];
    if (file) {
      trackUrl = URL.createObjectURL(file);
      sendUpdate(['trackUrl']);
    }
  }

  // Drag start
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
    position = { x: clientX - offset.x, y: clientY - offset.y };
    hasDragged = true;
    if (e.cancelable) e.preventDefault();
  }

  function onMouseUp() {
    dragging = false;
    resizing = false;
    document.body.style.userSelect = '';
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

  // Resize start
  function onResizeStart(e) {
    e.stopPropagation();
    ensureFocus();
    resizing = true;
    hasResized = false;
    document.body.style.userSelect = 'none';
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    resizeStart = { x: clientX, y: clientY, ...size };

    window.addEventListener('mousemove', onResizing);
    window.addEventListener('mouseup', onResizeEnd);
    window.addEventListener('touchmove', onResizing, { passive: false });
    window.addEventListener('touchend', onResizeEnd);
  }

  function onResizing(e) {
    if (!resizing) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    size.width = Math.max(200, resizeStart.width + (clientX - resizeStart.x));
    size.height = Math.max(100, resizeStart.height + (clientY - resizeStart.y));
    hasResized = true;
    if (e.cancelable) e.preventDefault();
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
  .player {
    position: absolute;
    border: 1px solid var(--text);
    border-radius: 8px;
    box-shadow: 0 0 2px 1px var(--text),
                0 0 6px 2px var(--text);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: var(--bg);
    color: var(--text);
    outline: 2px solid transparent;
    transition: box-shadow 0.15s ease, outline 0.15s ease;
  }
  .player.focused {
    outline: 2px solid var(--bg);
    box-shadow: 0 0 0 2px var(--bg);
  }
  .header {
    padding: 6px;
    background: var(--bg);
    color: var(--text);
    font-size: 0.85rem;
    cursor: move;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .header-controls {
    display: flex;
    gap: 4px;
  }
  .header input[type="color"] {
    border: none;
    cursor: pointer;
  }
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 8px;
    box-sizing: border-box;
  }
  audio {
    width: 100%;
    outline: none;
  }
  .resize-handle {
    position: absolute;
    bottom: 0px;
    right: 0px;
    width: 30px;
    height: 30px;
    cursor: se-resize;
    z-index: 10;
  }
  .delete-btn {
    background: var(--text);
    border-color: var(--bg);
    font-size: 1.1rem;
    color: var(--bg);
    cursor: pointer;
    padding: 0px 6px;
    border-radius: 3px;
  }
  .gear-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--text);
  }
  .settings-area {
    padding: 0.75em;
    border-top: 1px solid var(--text);
    font-size: 0.9em;
  }
</style>

<div
  class="player"
  class:focused={focused}
  style="left:{position.x}px; top:{position.y}px; width:{size.width}px; height:{size.height}px; --bg: {bgColor}; --text: {textColor};"
  role="button"
  tabindex="0"
  aria-pressed={focused}
  on:click={handleWrapperClick}
  on:keydown={handleWrapperKeydown}
>
  <div
    class="header"
    on:mousedown={onDragStart}
    on:touchstart={onDragStart}
    role="presentation"
  >
    <span>{title}</span>
    <div class="header-controls" on:mousedown|stopPropagation role="presentation">
      <button
        on:click={() => { ensureFocus(); showSettings = !showSettings; }}
        class="gear-btn"
        data-focus-guard
      >⚙︎</button>
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
      <button class="delete-btn" on:click|stopPropagation={deleteBlock}>×</button>
    </div>
  </div>

  <div class="content">
      {#if trackUrl}
        <div></div>
      {:else}
            <p style="opacity: 0.6;">No track loaded</p>
      {/if}
      <audio controls src={trackUrl} data-focus-guard></audio>
      <label>
        Title:
        <input
          type="text"
          bind:value={title}
          on:input={() => sendUpdate(['title'])}
          on:focus={ensureFocus}
          data-focus-guard
        />
      </label>
      <br />
      <label>
        Track URL:
        <input
          type="text"
          bind:value={trackUrl}
          on:input={() => sendUpdate(['trackUrl'])}
          on:focus={ensureFocus}
          placeholder="https://example.com/song.mp3"
          data-focus-guard
        />
      </label>
      <br />
      <label>
        Or upload file:
        <input type="file" accept="audio/*" on:change={handleFileChange} data-focus-guard />
      </label>

  </div>

  <div
    class="resize-handle"
    role="presentation"
    on:mousedown={onResizeStart}
    on:touchstart={onResizeStart}
  ></div>

  {#if showSettings}
    <div class="settings-area">
        <p>Settings area (put options here)</p>
    </div>
  {/if}
</div>
