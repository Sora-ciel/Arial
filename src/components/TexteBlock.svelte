<script>
  import { createEventDispatcher } from 'svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 300, height: 200 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let initialContent = '';

  const dispatch = createEventDispatcher();

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor;
  let content = initialContent;

  let dragging = false;
  let resizing = false;
  let offset = { x: 0, y: 0 };
  let resizeStart = { x: 0, y: 0, width: 0, height: 0 };

  function sendUpdate() {
    dispatch('update', { id, position, size, bgColor, textColor, content });
  }

  // Drag start
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

  // Drag move
  function onMouseMove(e) {
    if (!dragging) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    position.x = clientX - offset.x;
    position.y = clientY - offset.y;

    if (e.cancelable) e.preventDefault();
    sendUpdate();
  }

  // Drag end
  function onMouseUp() {
    dragging = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('touchmove', onMouseMove);
    window.removeEventListener('touchend', onMouseUp);
  }

  // Resize start
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

  // Resizing
  function onResizing(e) {
    if (!resizing) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - resizeStart.x;
    const deltaY = clientY - resizeStart.y;

    size.width = Math.max(50, resizeStart.width + deltaX);
    size.height = Math.max(50, resizeStart.height + deltaY);

    if (e.cancelable) e.preventDefault();
    sendUpdate();
  }

  // Resize end
  function onResizeEnd() {
    resizing = false;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onResizing);
    window.removeEventListener('mouseup', onResizeEnd);
    window.removeEventListener('touchmove', onResizing);
    window.removeEventListener('touchend', onResizeEnd);
  }

  // Delete block
  function deleteBlock() {
    dispatch('delete', { id });
  }
</script>

<style>
  .wrapper {
    position: absolute;
    border: 1px solid #ccc;
    background: white;
    box-shadow: 0 0 2px 1px var(--text),
                0 0 6px 2px var(--text);

    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .header {
    background: #000;
    padding: 4px;
    cursor: move;
    user-select: none;
    font-size: 0.8rem;
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
  button.delete-btn {
    background: red;
    color: white;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
    font-weight: bold;
    border-radius: 3px;
  }
  .text-container {
    flex: 1;
    background-color: var(--bg);
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
  style="left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px; --bg: {bgColor}; --text: {textColor};"
>
  <div
    class="header"
    on:mousedown={onDragStart}
    on:touchstart={onDragStart}
  >
    <div>text</div>
    <div class="header-controls" on:mousedown|stopPropagation>
      <label title="Background Color">
        <input type="color" bind:value={bgColor} on:change={sendUpdate}/>
      </label>
      <label title="Text Color">
        <input type="color" bind:value={textColor} on:change={sendUpdate}/>
      </label>
      <button class="delete-btn" on:click={deleteBlock}>×</button>
    </div>
  </div>

  <div class="text-container">
    <textarea
      spellcheck="false"
      bind:value={content}
      on:input={sendUpdate}
    ></textarea>
  </div>

  <div
    class="resize-handle"
    on:mousedown={onResizeStart}
    on:touchstart={onResizeStart}
  ></div>
</div>
