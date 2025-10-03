<script>
  import { createEventDispatcher } from 'svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 560, height: 315 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#000000';
  export let initialContent = '';

  export let initialTitle = 'Embed Block';

  const dispatch = createEventDispatcher();

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor;
  let content = initialContent;
  let title = initialTitle;

  let dragging = false, resizing = false;
  let offset = { x: 0, y: 0 }, resizeStart = {};
  let showSettings = false;

  function sendUpdate() {
    dispatch('update', {
      id,
      position,
      size,
      bgColor,
      textColor,
      content,
      title
    });
  }

  // Dragging
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
    position = { x: clientX - offset.x, y: clientY - offset.y };
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
    sendUpdate();
  }

  // Resizing
  function onResizeStart(e) {
    e.stopPropagation();
    resizing = true;
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
    if (e.cancelable) e.preventDefault();
  }

  function onResizeEnd() {
    resizing = false;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onResizing);
    window.removeEventListener('mouseup', onResizeEnd);
    window.removeEventListener('touchmove', onResizing);
    window.removeEventListener('touchend', onResizeEnd);
    sendUpdate();
  }

  function deleteBlock() {
    dispatch('delete', { id });
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
    align-items: stretch;
    padding: 0;
    box-sizing: border-box;
  }
  iframe {
    flex: 1;
    border: none;
    width: 100%;
    height: 100%;
  }
  .resize-handle {
    position: absolute;
    bottom: 0px;
    right: 0px;
    width: 30px;
    height: 30px;
    cursor: se-resize;
    z-index: 30;
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
  style="left:{position.x}px; top:{position.y}px; width:{size.width}px; height:{size.height}px; --bg: {bgColor}; --text: {textColor};"
>
  <div
    class="header"
    on:mousedown={onDragStart}
    on:touchstart={onDragStart}
  >
    <span>{title}</span>
    <div class="header-controls" on:mousedown|stopPropagation>
      <button on:click={() => showSettings = !showSettings} class="gear-btn">⚙︎</button>
      <input type="color" bind:value={bgColor} on:change={sendUpdate} />
      <input type="color" bind:value={textColor} on:change={sendUpdate} />
      <button class="delete-btn" on:click={deleteBlock}>×</button>
    </div>
  </div>

  <div class="content">
    {#if content}
      <div class="embed-wrapper">
        {@html content}

      </div>
    {:else}
      <p style="opacity: 0.6; padding: 8px;">No embed URL set</p>
    {/if}

    <label style="padding: 6px;">
      Embed URL:
      <input type="text" bind:value={content} on:input={sendUpdate} placeholder="https://example.com/embed" />
    </label>
  </div>



  {#if showSettings}
    <div class="settings-area">
        <p>Settings area (put options here)</p>
    </div>
  {/if}
  <div
    class="resize-handle"
    on:mousedown={onResizeStart}
    on:touchstart={onResizeStart}
  ></div>
</div>
