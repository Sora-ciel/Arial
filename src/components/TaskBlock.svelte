<script>
  import { createEventDispatcher } from 'svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 320, height: 260 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let initialTasks = [];
  export let initialTitle = 'Task List';
  export let focused = false;

  const dispatch = createEventDispatcher();

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor;
  let tasks = Array.isArray(initialTasks) ? [...initialTasks] : [];
  let title = initialTitle || 'Task List';
  let newTaskText = '';

  let dragging = false;
  let resizing = false;
  let suppressClick = false;
  let hasDragged = false;
  let hasResized = false;
  let offset = { x: 0, y: 0 };
  let resizeStart = { x: 0, y: 0, width: 0, height: 0 };

  const todoTasks = () => tasks.filter(task => !task.done);

  function sendUpdate(changedKeys, { pushToHistory } = {}) {
    const detail = {
      id,
      position,
      size,
      bgColor,
      textColor,
      tasks,
      title
    };
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length ? changedKeys : [];

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
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
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - resizeStart.x;
    const deltaY = clientY - resizeStart.y;

    size.width = Math.max(220, resizeStart.width + deltaX);
    size.height = Math.max(200, resizeStart.height + deltaY);
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

  function updateTasks(nextTasks, { pushToHistory = true } = {}) {
    tasks = nextTasks;
    sendUpdate(['tasks'], { pushToHistory });
  }

  function addTask() {
    const trimmed = newTaskText.trim();
    if (!trimmed) return;
    updateTasks(
      [...tasks, { id: crypto.randomUUID(), text: trimmed, done: false }],
      { pushToHistory: true }
    );
    newTaskText = '';
  }

  function toggleTask(taskId) {
    const nextTasks = tasks.map(task =>
      task.id === taskId ? { ...task, done: !task.done } : task
    );
    updateTasks(nextTasks, { pushToHistory: true });
  }

  function deleteTask(taskId) {
    updateTasks(tasks.filter(task => task.id !== taskId), { pushToHistory: true });
  }

  function handleAddTaskKeydown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addTask();
  }

  $: title = initialTitle || 'Task List';

</script>

<style>
  .wrapper {
    position: absolute;
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.2));
    border-radius: var(--block-border-radius, 12px);
    background: var(--block-surface, var(--bg));
    box-shadow: var(--block-shadow, 0 0 2px 1px var(--text), 0 0 6px 2px var(--text));
    color: var(--text);
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
    gap: 6px;
    align-items: center;
  }

  .header-controls  input[type="color"] {
    width: 28px;
    height: 22px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    padding: 0;
    cursor: pointer;
    border-radius: var(--block-control-radius, 6px);
    background: transparent;
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

  .content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    height: 100%;
    box-sizing: border-box;
    color: var(--text);
  }

  .task-input {
    display: flex;
    gap: 6px;
  }

  .task-input input {
    flex: 1 1 auto;
    border: 1px solid var(--text);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    padding: 6px 8px;
  }

  .task-input input::placeholder{
    color: var(--text);
  }

  .task-input button {
    border: 1px solid var(--text);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    padding: 6px 10px;
    cursor: pointer;
  }

  .task-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }

  .task-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 8px;
    background: var(--bg);
    border: 1px solid var(--text);
  }

  .task-item label {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    font-size: 0.85rem;
  }

  .task-item input[type='checkbox'] {
    width: 14px;
    height: 14px;
    color: var(--text);
    accent-color: var(--block-accent-color, var(--text));
  }

  .task-item button {
    border: none;
    background: transparent;
    color: var(--text);
    cursor: pointer;
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
    <div class="header-title">{title || 'Task List'}</div>
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

  <div class="content">
    <div class="task-input">
      <input
        type="text"
        bind:value={newTaskText}
        on:keydown={handleAddTaskKeydown}
        placeholder="add task"
        data-focus-guard
      />
      <button on:click={addTask} data-focus-guard>Add</button>
    </div>
    <ul class="task-list">
      {#each todoTasks() as task}
        <li class="task-item">
          <label>
            <input
              type="checkbox"
              checked={task.done}
              on:change={() => toggleTask(task.id)}
              data-focus-guard
            />
            <span>{task.text}</span>
          </label>
          <button
            aria-label="Delete task"
            on:click={() => deleteTask(task.id)}
            data-focus-guard
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
  </div>

  <div
    class="resize-handle"
    role="presentation"
    on:mousedown={onResizeStart}
    on:touchstart={onResizeStart}
  ></div>
</div>
