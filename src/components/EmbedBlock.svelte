<script>
  import { createEventDispatcher } from 'svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 560, height: 315 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#000000';
  export let initialContent = '';
  export let focused = false;

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
    const detail = {
      id,
      position,
      size,
      bgColor,
      textColor,
      content,
      title
    };

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
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
    sendUpdate(['position']);
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
    sendUpdate(['size']);
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
    outline: 2px solid transparent;
    transition: outline 0.15s ease, box-shadow 0.15s ease;
  }
  .player.focused {
    outline: 2px solid rgba(77, 171, 247, 0.9);
    box-shadow: 0 0 8px 2px rgba(77, 171, 247, 0.65),
                0 0 18px 6px rgba(77, 171, 247, 0.35);
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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="player"
  class:focused={focused}
  on:click={handleFocusRequest}
  style="left:{position.x}px; top:{position.y}px; width:{size.width}px; height:{size.height}px; --bg: {bgColor}; --text: {textColor};"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="header"
    on:mousedown={onDragStart}
    on:touchstart={onDragStart}
  >
    <span>{title}</span>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="header-controls"
      data-focus-ignore
      on:mousedown|stopPropagation
      on:click|stopPropagation
    >
      <button on:click={() => showSettings = !showSettings} class="gear-btn">⚙︎</button>
      <input type="color" bind:value={bgColor} on:change={() => sendUpdate(['bgColor'])} />
      <input type="color" bind:value={textColor} on:change={() => sendUpdate(['textColor'])} />
      <button class="delete-btn" on:click|stopPropagation={deleteBlock}>×</button>
    </div>
  </div>

  <div class="content" data-focus-content>
    {#if content}
      <div class="embed-wrapper">
        {@html content}

      </div>
    {:else}
      <p style="opacity: 0.6; padding: 8px;">No embed URL set</p>
    {/if}

    <label style="padding: 6px;">
      Embed URL:
      <input type="text" bind:value={content} on:input={() => sendUpdate(['content'])} placeholder="https://example.com/embed" />
    </label>
  </div>



  {#if showSettings}
    <div class="settings-area" data-focus-content>
        <p>Settings area (put options here)</p>
    </div>
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="resize-handle"
    on:mousedown={onResizeStart}
    on:touchstart={onResizeStart}
    data-focus-ignore
  ></div>
</div>
