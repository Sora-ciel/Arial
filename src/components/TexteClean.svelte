<script>
  import { createEventDispatcher, onMount } from 'svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 300, height: 200 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#000000';
  export let initialContent = '';
  export let focused = false;

  const dispatch = createEventDispatcher();

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor;
  let content = initialContent;

  let dragging = false, resizing = false;
  let offset = { x: 0, y: 0 }, resizeStart = {};
  let suppressClick = false;
  let hasDragged = false;
  let hasResized = false;
  let showSettings = false;

  let editableDiv;

  onMount(() => {
    if (editableDiv) editableDiv.innerText = content;
  });

  function sendUpdate(changedKeys, { pushToHistory } = {}) {
    content = editableDiv?.innerText ?? content;

    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length ? changedKeys : [];
    const detail = { id, position, size, bgColor, textColor, content };

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
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

  // Drag move
  function onMouseMove(e) {
    if (!dragging) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    position = { x: clientX - offset.x, y: clientY - offset.y };
    hasDragged = true;

    if (e.cancelable) e.preventDefault(); // stop scrolling on mobile
  }

  // Drag end
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

  // Resizing
  function onResizing(e) {
    if (!resizing) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    size.width = Math.max(100, resizeStart.width + (clientX - resizeStart.x));
    size.height = Math.max(50, resizeStart.height + (clientY - resizeStart.y));
    hasResized = true;

    if (e.cancelable) e.preventDefault();
  }

  // Resize end
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
  .note {
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
  .note.focused {
    outline: 2px solid rgba(110, 168, 255, 0.85);
    box-shadow: 0 0 0 2px rgba(110, 168, 255, 0.35),
                0 0 12px rgba(110, 168, 255, 0.5);
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
  .editable {
    flex: 1;
    padding: 8px;
    outline: none;
    background: transparent;
    color: inherit;
    font-size: 1.1rem;
    font-weight: 500;
    overflow-y: auto;
    user-select: text;
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
    outline: none;
    color: var(--text);
  }
  .settings-area {
    position: absolute;
    bottom: 0;
    right: 0;
    padding: 0.75em;
    border-radius: 0 0 0.5em 0.5em;
    color: var(--text);
    font-size: 0.9em;
    z-index: 5;
    width: 100%;
    box-sizing: border-box;
  }
</style>

<div
  class="note"
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
    <span>Note</span>
    <div class="header-controls" on:mousedown|stopPropagation role="presentation">
      <button
        on:click={() => { ensureFocus(); showSettings = !showSettings; }}
        class="gear-btn"
        aria-label="Settings"
        data-focus-guard
      >
        ⚙︎
      </button>
      <input
        type="color"
        bind:value={bgColor}
        title="BG"
        on:change={() => sendUpdate(['bgColor'])}
        data-focus-guard
      />
      <input
        type="color"
        bind:value={textColor}
        title="Text"
        on:change={() => sendUpdate(['textColor'])}
        data-focus-guard
      />
      <button class="delete-btn" on:click|stopPropagation={deleteBlock}>×</button>
    </div>
  </div>

  <div
    contenteditable="true"
    bind:this={editableDiv}
    class="editable"
    spellcheck="false"
    on:input={() => sendUpdate(['content'], { pushToHistory: false })}
    on:focus={ensureFocus}
    data-focus-guard
  ></div>

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
