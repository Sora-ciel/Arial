<script>
  import { createEventDispatcher } from 'svelte';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;

  const dispatch = createEventDispatcher();

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: modeTextColor = getReadableTextColor(canvasTheme.innerBg);
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor};`;

  $: taskBlocks = blocks.filter(block => block.type === 'task');
  let selectedTaskId = null;

  $: if (!selectedTaskId && taskBlocks.length) {
    selectedTaskId = taskBlocks[0].id;
  }
  $: if (!taskBlocks.length) {
    selectedTaskId = null;
  }
  $: if (
    selectedTaskId &&
    !taskBlocks.some(block => block.id === selectedTaskId)
  ) {
    selectedTaskId = taskBlocks[0]?.id ?? null;
  }

  $: taskBlock = taskBlocks.find(block => block.id === selectedTaskId) || null;
  $: tasks = Array.isArray(taskBlock?.tasks) ? taskBlock.tasks : [];
  $: todoTasks = tasks.filter(task => !task.done);
  $: doneTasks = tasks.filter(task => task.done);

  let newTaskText = "";

  function updateBlock(id, updates, { pushToHistory, changedKeys } = {}) {
    if (!id) return;
    const detail = { id, ...updates };
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length
      ? changedKeys
      : Object.keys(updates || {});

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }

  function updateTasks(nextTasks, { pushToHistory = true } = {}) {
    if (!selectedTaskId) return;
    updateBlock(selectedTaskId, { tasks: nextTasks }, { pushToHistory, changedKeys: ['tasks'] });
  }

  function addTask() {
    if (!selectedTaskId) return;
    const trimmed = newTaskText.trim();
    if (!trimmed) return;
    const nextTasks = [
      ...tasks,
      { id: crypto.randomUUID(), text: trimmed, done: false }
    ];
    newTaskText = "";
    updateTasks(nextTasks, { pushToHistory: true });
  }

  function toggleTask(taskId) {
    const nextTasks = tasks.map(task =>
      task.id === taskId ? { ...task, done: !task.done } : task
    );
    updateTasks(nextTasks, { pushToHistory: true });
  }

  function deleteTask(taskId) {
    const nextTasks = tasks.filter(task => task.id !== taskId);
    updateTasks(nextTasks, { pushToHistory: true });
  }

  function handleAddTaskKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      addTask();
    }
  }

  function updateTitle(value, { pushToHistory = false } = {}) {
    if (!selectedTaskId) return;
    updateBlock(selectedTaskId, { title: value }, { pushToHistory, changedKeys: ['title'] });
  }

  function handleTitleInput(event) {
    updateTitle(event.target.value, { pushToHistory: false });
  }

  function handleTitleBlur(event) {
    updateTitle(event.target.value, { pushToHistory: true });
  }

  function selectTaskList(id) {
    selectedTaskId = id;
    if (focusedBlockId !== id) {
      dispatch('focusToggle', { id });
    }
  }

  function deleteTaskList() {
    if (!selectedTaskId) return;
    dispatch('delete', { id: selectedTaskId });
  }

  function getTaskLabel(block, index) {
    const title = (block?.title || '').trim();
    if (title) {
      return title.length > 24 ? `${title.slice(0, 24)}…` : title;
    }
    return `Task List ${index + 1}`;
  }

  function getReadableTextColor(color) {
    if (!color) return '#f5f5f5';
    const parsed = parseColor(color);
    if (!parsed) return '#f5f5f5';
    const [r, g, b] = parsed;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#121212' : '#f5f5f5';
  }

  function parseColor(color) {
    const trimmed = color.trim();
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16)
        ];
      }
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
    }
    const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return [
        Number(rgbMatch[1]),
        Number(rgbMatch[2]),
        Number(rgbMatch[3])
      ];
    }
    return null;
  }
</script>

<style>
  .task-mode {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: calc(100vh - var(--controls-height, 56px));
    background: var(--canvas-inner-bg, #000000);
    color: var(--mode-text-color, #ffffff);
    box-sizing: border-box;
    font-family: var(--block-body-font, inherit);
  }

  .task-tabs {
    display: flex;
    gap: 8px;
    padding: 12px 12px 4px;
    overflow-x: auto;
  }

  .task-tab {
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.25));
    background: var(--block-surface, transparent);
    color: var(--block-header-text, inherit);
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
    font-family: var(--block-header-font, var(--block-body-font, inherit));
    letter-spacing: var(--block-header-letter-spacing, 0.04em);
    text-transform: var(--block-header-transform, uppercase);
  }

  .task-tab[aria-selected='true'] {
    border-color: var(--block-border-color, rgba(255, 255, 255, 0.8));
    background: var(--block-header-bg, rgba(255, 255, 255, 0.12));
  }

  .task-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 0 12px 8px;
  }

  .task-toolbar button {
    border-radius: 8px;
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.25));
    background: var(--block-media-button-bg, rgba(255, 255, 255, 0.08));
    color: var(--block-media-button-text, inherit);
    padding: 6px 12px;
    cursor: pointer;
  }

  .task-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 0 12px 16px;
    flex: 1 1 auto;
    overflow-y: auto;
  }

  .task-title input {
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.25));
    background: var(--block-header-bg, rgba(0, 0, 0, 0.25));
    color: var(--block-header-text, inherit);
    font-size: 1rem;
    box-sizing: border-box;
    font-family: var(--block-body-font, inherit);
  }

  .task-columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .task-section {
    border-radius: 16px;
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.16));
    background: var(--block-surface, rgba(0, 0, 0, 0.3));
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 200px;
    box-shadow: var(--block-shadow, none);
  }

  .task-section h3 {
    margin: 0;
    font-size: 1rem;
    letter-spacing: 0.02em;
    font-family: var(--block-header-font, var(--block-body-font, inherit));
    color: var(--block-header-text, inherit);
    text-transform: var(--block-header-transform, uppercase);
  }

  .task-input {
    display: flex;
    gap: 8px;
  }

  .task-input input {
    flex: 1 1 auto;
    padding: 8px 10px;
    border-radius: 10px;
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.2));
    background: var(--block-header-bg, rgba(0, 0, 0, 0.2));
    color: var(--block-header-text, inherit);
    font-family: var(--block-body-font, inherit);
  }

  .task-input button {
    padding: 8px 12px;
    border-radius: 10px;
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.2));
    background: var(--block-media-button-bg, rgba(255, 255, 255, 0.12));
    color: var(--block-media-button-text, inherit);
    cursor: pointer;
  }

  .task-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .task-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 10px;
    background: var(--block-surface, rgba(255, 255, 255, 0.06));
    border: var(--block-border-width, 1px) solid var(--block-border-color, transparent);
  }

  .task-item label {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
  }

  .task-item input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--block-accent-color, #8bd3ff);
  }

  .task-item button {
    border: none;
    background: transparent;
    color: var(--block-header-text, inherit);
    cursor: pointer;
    font-size: 1rem;
  }

  .task-empty {
    padding: 24px;
    opacity: 0.7;
  }
</style>

<div class="task-mode" bind:this={canvasRef} style={canvasCssVars}>
  {#if taskBlocks.length}
    <div class="task-tabs" role="tablist">
      {#each taskBlocks as block, index}
        <button
          class="task-tab"
          role="tab"
          aria-selected={block.id === selectedTaskId}
          on:click={() => selectTaskList(block.id)}
        >
          {getTaskLabel(block, index)}
        </button>
      {/each}
    </div>
    <div class="task-toolbar">
      <button on:click={deleteTaskList}>Delete list</button>
    </div>
  {/if}

  {#if taskBlock}
    <div class="task-body">
      <div class="task-title">
        <input
          type="text"
          value={taskBlock.title || ""}
          on:input={handleTitleInput}
          on:blur={handleTitleBlur}
          placeholder="Task list title"
        />
      </div>
      <div class="task-columns">
        <section class="task-section">
          <h3>To Do</h3>
          <div class="task-input">
            <input
              type="text"
              bind:value={newTaskText}
              on:keydown={handleAddTaskKeydown}
              placeholder="Add a task"
            />
            <button on:click={addTask}>Add</button>
          </div>
          {#if todoTasks.length}
            <ul class="task-list">
              {#each todoTasks as task}
                <li class="task-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={task.done}
                      on:change={() => toggleTask(task.id)}
                    />
                    <span>{task.text}</span>
                  </label>
                  <button
                    aria-label="Delete task"
                    on:click={() => deleteTask(task.id)}
                  >
                    ×
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="task-empty">No pending tasks yet.</div>
          {/if}
        </section>
        <section class="task-section">
          <h3>Done</h3>
          {#if doneTasks.length}
            <ul class="task-list">
              {#each doneTasks as task}
                <li class="task-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={task.done}
                      on:change={() => toggleTask(task.id)}
                    />
                    <span>{task.text}</span>
                  </label>
                  <button
                    aria-label="Delete task"
                    on:click={() => deleteTask(task.id)}
                  >
                    ×
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="task-empty">No completed tasks yet.</div>
          {/if}
        </section>
      </div>
    </div>
  {:else}
    <div class="task-empty">
      No task lists yet. Use “+ Task List” to create your first one.
    </div>
  {/if}
</div>
