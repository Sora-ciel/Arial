<script>
  import { createEventDispatcher } from 'svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 300, height: 200 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let initialContent = '';
  export let focused = false;

  const dispatch = createEventDispatcher();

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor;
  let content = initialContent;

  let dragging = false;
  let resizing = false;
  let suppressClick = false;
  let hasDragged = false;
  let hasResized = false;
  let offset = { x: 0, y: 0 };
  let resizeStart = { x: 0, y: 0, width: 0, height: 0 };

  function sendUpdate(changedKeys, { pushToHistory } = {}) {
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

    position.x = clientX - offset.x;
    position.y = clientY - offset.y;
    hasDragged = true;

    if (e.cancelable) e.preventDefault();
  }

  // Drag end
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

  // Resize start
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

  // Resizing
  function onResizing(e) {
    if (!resizing) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - resizeStart.x;
    const deltaY = clientY - resizeStart.y;

    size.width = Math.max(50, resizeStart.width + deltaX);
    size.height = Math.max(50, resizeStart.height + deltaY);
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

  // Delete block
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
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.2));
    border-radius: var(--block-border-radius, 12px);
    background: var(--block-surface, var(--bg));
    box-shadow: var(--block-shadow, 0 0 2px 1px var(--text), 0 0 6px 2px var(--text));
    outline: 2px solid transparent;
    transition: box-shadow 0.15s ease, outline 0.15s ease, transform 0.2s ease;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-family: var(--block-body-font, inherit);
  }
  .wrapper.focused {
    outline: 2px solid var(--block-focus-outline, rgba(110, 168, 255, 0.85));
    box-shadow: var(--block-focus-shadow, 0 0 0 2px rgba(110, 168, 255, 0.35), 0 0 12px rgba(110, 168, 255, 0.5));
  }
  .header {
    background: var(--block-header-bg, var(--bg));
    padding: 4px 8px;
    cursor: move;
    user-select: none;
    font-size: 0.8rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    color: var(--block-header-text, var(--text));
    font-family: var(--block-header-font, var(--block-body-font, inherit));
    letter-spacing: var(--block-header-letter-spacing, 0.04em);
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
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 0;
    cursor: pointer;
    border-radius: var(--block-control-radius, 6px);
    background: transparent;
  }
  button.delete-btn {
    background: var(--block-accent-color, #ff5f5f);
    color: var(--block-accent-text, #ffffff);
    border: none;
    cursor: pointer;
    padding: 2px 8px;
    font-weight: 600;
    border-radius: var(--block-control-radius, 6px);
    transition: transform 0.15s ease, filter 0.2s ease;
  }
  button.delete-btn:hover {
    transform: scale(1.05);
    filter: brightness(1.1);
  }
  .text-container {
    flex: 1;
    background-color: var(--block-surface, var(--bg));
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  textarea {
    width: 100%;
    height: 100%;
    background-color: transparent;
    border: none;
    color: var(--text);
    font-size: 1.08rem;
    font-weight: 300;
    font-family: var(--block-body-font, inherit);
    resize: none;
    outline: none;
    padding: 8px;
    box-sizing: border-box;
    overflow-y: auto;
  }
  .resize-handle {
    position: absolute;
    width: 30px;
    height: 30px;
    background: rgba(253, 253, 253, 0);
    right: 0;
    bottom: 0;
    cursor: se-resize;
  }
</style>

<div
  class="wrapper"
  class:focused={focused}
  style="left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px; --bg: {bgColor}; --text: {textColor};"
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
    <div>text</div>
    <div class="header-controls" on:mousedown|stopPropagation role="presentation">
      <label title="Background Color">
        <input
          type="color"
          bind:value={bgColor}
          on:change={() => sendUpdate(['bgColor'])}
          data-focus-guard
        />
      </label>
      <label title="Text Color">
        <input
          type="color"
          bind:value={textColor}
          on:change={() => sendUpdate(['textColor'])}
          data-focus-guard
        />
      </label>
      <button class="delete-btn" on:click|stopPropagation={deleteBlock}>×</button>
    </div>
  </div>

  <div class="text-container">
    <textarea
      spellcheck="false"
      bind:value={content}
      on:input={() => sendUpdate(['content'], { pushToHistory: false })}
      on:focus={ensureFocus}
      data-focus-guard
    ></textarea>
  </div>

  <div
    class="resize-handle"
    role="presentation"
    on:mousedown={onResizeStart}
    on:touchstart={onResizeStart}
  ></div>
</div>
