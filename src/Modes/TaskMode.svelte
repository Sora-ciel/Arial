<script>
  import { createEventDispatcher } from 'svelte';
  import { getReadableTextColor } from '../utils/readableColor.js';
  import ColorField from '../components/ColorField.svelte';
  import BlockContextMenu from '../components/BlockContextMenu.svelte';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  export let addDirection = 'above';

  const dispatch = createEventDispatcher();

  const defaultCanvasColors = { outerBg: '#000000', innerBg: '#000000' };
  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: modeTextColor = getReadableTextColor(canvasTheme.innerBg);
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor};`;

  $: taskBlocks = blocks.filter(b => b.type === 'task');
  let selectedTaskId = null;
  $: if (!selectedTaskId && taskBlocks.length) selectedTaskId = taskBlocks[0].id;
  $: if (!taskBlocks.length) selectedTaskId = null;
  $: if (selectedTaskId && !taskBlocks.some(b => b.id === selectedTaskId))
    selectedTaskId = taskBlocks[0]?.id ?? null;

  $: taskBlock = taskBlocks.find(b => b.id === selectedTaskId) || null;
  $: tasks = Array.isArray(taskBlock?.tasks) ? taskBlock.tasks : [];
  $: todoTasks = tasks.filter(t => !t.done);
  $: doneTasks = tasks.filter(t => t.done);

  // The selected list's own colors (same bgColor/textColor every other
  // block type carries) — layered in as --bg/--text so the section/item
  // backgrounds and text pick them up wherever the CSS below opts in,
  // falling back to the mode's usual theme when nothing's been set.
  $: taskColorVars = taskBlock
    ? `--bg: ${taskBlock.bgColor || '#000000'}; --text: ${taskBlock.textColor || '#ffffff'};`
    : '';

  function setTaskColor(field, value) {
    if (!selectedTaskId) return;
    updateBlock(selectedTaskId, { [field]: value }, { changedKeys: [field], pushToHistory: false });
  }

  function commitTaskColor(field, value) {
    if (!selectedTaskId) return;
    updateBlock(selectedTaskId, { [field]: value }, { changedKeys: [field], pushToHistory: true });
  }

  let newTaskText = '';
  let doneExpanded = true;

  function updateBlock(id, updates, opts = {}) {
    if (!id) return;
    const detail = { id, ...updates };
    const keys = Array.isArray(opts.changedKeys) && opts.changedKeys.length
      ? opts.changedKeys : Object.keys(updates || {});
    if (keys.length) detail.changedKeys = keys;
    if (opts.pushToHistory !== undefined) detail.pushToHistory = opts.pushToHistory;
    dispatch('update', detail);
  }

  function updateTasks(next, opts = {}) {
    if (!selectedTaskId) return;
    updateBlock(selectedTaskId, { tasks: next }, { pushToHistory: true, changedKeys: ['tasks'], ...opts });
  }

  function addTask() {
    if (!selectedTaskId) return;
    const trimmed = newTaskText.trim();
    if (!trimmed) return;
    const item = { id: crypto.randomUUID(), text: trimmed, done: false };
    newTaskText = '';
    const next = addDirection === 'above' ? [item, ...tasks] : [...tasks, item];
    updateTasks(next);
  }

  function toggleDirection() {
    dispatch('modeSettingChange', { taskAddDirection: addDirection === 'above' ? 'below' : 'above' });
  }

  function toggleTask(taskId) {
    updateTasks(tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t));
  }

  function deleteTask(taskId) {
    updateTasks(tasks.filter(t => t.id !== taskId));
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addTask(); }
  }

  function updateTitle(value, opts = {}) {
    if (!selectedTaskId) return;
    updateBlock(selectedTaskId, { title: value }, { changedKeys: ['title'], ...opts });
  }

  function selectTaskList(id) {
    selectedTaskId = id;
    if (focusedBlockId !== id) dispatch('focusToggle', { id });
  }

  function deleteTaskList() {
    if (!selectedTaskId) return;
    dispatch('delete', { id: selectedTaskId });
  }

  function getTabLabel(block, i) {
    const t = (block?.title || '').trim();
    if (t) return t.length > 20 ? `${t.slice(0, 20)}…` : t;
    return `List ${i + 1}`;
  }

  // ── Reordering ────────────────────────────────────────────────────
  let draggingTaskId = null;
  let dragOverTaskId = null;
  let dragOverPos = null;

  function startDrag(e, taskId) {
    e.preventDefault();
    draggingTaskId = taskId;
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  }

  function onDragMove(e) {
    if (!draggingTaskId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const itemEl = el?.closest('.task-item');
    if (!itemEl) { dragOverTaskId = null; dragOverPos = null; return; }
    const overId = itemEl.dataset.taskId;
    if (!overId || overId === draggingTaskId) return;
    const dragged = tasks.find(t => t.id === draggingTaskId);
    const over = tasks.find(t => t.id === overId);
    if (!dragged || !over || dragged.done !== over.done) { dragOverTaskId = null; dragOverPos = null; return; }
    const rect = itemEl.getBoundingClientRect();
    dragOverPos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
    dragOverTaskId = overId;
  }

  function onDragEnd() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    if (draggingTaskId && dragOverTaskId && draggingTaskId !== dragOverTaskId)
      reorderTask(draggingTaskId, dragOverTaskId, dragOverPos);
    draggingTaskId = null; dragOverTaskId = null; dragOverPos = null;
  }

  function reorderTask(draggedId, targetId, pos) {
    const list = [...tasks];
    const fromIdx = list.findIndex(t => t.id === draggedId);
    if (fromIdx === -1) return;
    const [moved] = list.splice(fromIdx, 1);
    let toIdx = list.findIndex(t => t.id === targetId);
    if (toIdx === -1) { list.push(moved); }
    else { if (pos === 'after') toIdx++; list.splice(toIdx, 0, moved); }
    updateTasks(list);
  }

  // ── Inline edit ──────────────────────────────────────────────────
  let editingTaskId = null;
  let editText = '';

  function startEditTask(task) { editingTaskId = task.id; editText = task.text; }

  function commitEditTask() {
    if (!editingTaskId) return;
    const trimmed = editText.trim();
    if (trimmed) updateTasks(tasks.map(t => t.id === editingTaskId ? { ...t, text: trimmed } : t));
    editingTaskId = null; editText = '';
  }

  function cancelEditTask() { editingTaskId = null; editText = ''; }

  function handleEditKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitEditTask(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEditTask(); }
  }

  function autoFocusInput(node) { node.focus(); node.select(); }

  // ── Right-click context menu (color edit + copy as markdown) ──────────
  let ctxMenu = { open: false, x: 0, y: 0 };

  function handleContextMenu(e) {
    if (!taskBlock) return;
    e.preventDefault();
    ctxMenu = { open: true, x: e.clientX, y: e.clientY };
  }

  function closeCtxMenu() { ctxMenu = { open: false, x: 0, y: 0 }; }

  function handleCtxColor(detail) {
    if (detail.bgColor !== undefined) {
      if (detail.commit) commitTaskColor('bgColor', detail.bgColor);
      else setTaskColor('bgColor', detail.bgColor);
    }
    if (detail.textColor !== undefined) {
      if (detail.commit) commitTaskColor('textColor', detail.textColor);
      else setTaskColor('textColor', detail.textColor);
    }
  }

  // Serialize the list to plain markdown — unchecked and checked tasks as
  // GitHub-style task items so it drops straight into any markdown editor.
  function tasksToMarkdown(block) {
    const title = (block?.title || 'Task List').trim();
    const list = Array.isArray(block?.tasks) ? block.tasks : [];
    const lines = [`# ${title}`, ''];
    for (const t of list) lines.push(`- [${t.done ? 'x' : ' '}] ${t.text}`);
    return lines.join('\n');
  }

  async function handleCtxAction(id) {
    if (id === 'copyMd' && taskBlock) {
      const md = tasksToMarkdown(taskBlock);
      try { await navigator.clipboard.writeText(md); } catch {}
    }
  }
</script>

<style>
  .task-mode {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: calc(100vh - var(--controls-height, 56px));
    background: var(--bg, var(--canvas-inner-bg, #000));
    color: var(--text, var(--mode-text-color, #fff));
    box-sizing: border-box;
    font-family: var(--block-body-font, inherit);
  }

  /* ── Header ─────────────────────────────────────────────────────── */
  .task-header {
    flex-shrink: 0;
    padding: 10px 12px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .task-tabs-row {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .task-tabs-row::-webkit-scrollbar { display: none; }

  .task-tab {
    flex-shrink: 0;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--tab-text, #fff) 30%, transparent);
    background: var(--tab-bg, transparent);
    color: var(--tab-text, inherit);
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 0.82rem;
    cursor: pointer;
    white-space: nowrap;
    font-family: var(--block-header-font, inherit);
    letter-spacing: var(--block-header-letter-spacing, 0.04em);
    text-transform: var(--block-header-transform, uppercase);
    opacity: 0.55;
    transition: opacity 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .task-tab:hover { opacity: 0.8; }
  .task-tab[aria-selected='true'] {
    opacity: 1;
    border-color: color-mix(in srgb, var(--tab-text, #fff) 80%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--tab-text, #fff) 35%, transparent);
  }

  .new-list-btn {
    flex-shrink: 0;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, #fff) 25%, transparent);
    background: transparent;
    color: var(--text, inherit);
    padding: 7px 12px;
    border-radius: 999px;
    font-size: 0.82rem;
    cursor: pointer;
    opacity: 0.65;
    transition: opacity 0.15s;
  }
  .new-list-btn:hover { opacity: 1; }

  .task-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .task-title-row input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 7px 11px;
    border-radius: 10px;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, #fff) 30%, transparent);
    background: color-mix(in srgb, var(--text, #fff) 8%, var(--bg, #000));
    color: var(--text, inherit);
    font-size: 0.95rem;
    font-family: var(--block-body-font, inherit);
    box-sizing: border-box;
  }

  .delete-list-btn {
    flex-shrink: 0;
    border: var(--block-border-width, 1px) solid rgba(255,80,80,.45);
    background: transparent;
    color: rgba(255,110,110,.85);
    padding: 7px 11px;
    border-radius: 10px;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .delete-list-btn:hover { background: rgba(255,80,80,.12); }

  /* ── Body (scrollable) ──────────────────────────────────────────── */
  .task-body {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 10px 12px 4px;
    color: var(--text, inherit);
    --sb-track: transparent;
    --sb-thumb: var(--text, rgba(255,255,255,.18));
    scrollbar-width: thin;
    scrollbar-color: var(--sb-thumb, rgba(255,255,255,.18)) transparent;
  }
  .task-body::-webkit-scrollbar { width: 5px; }
  .task-body::-webkit-scrollbar-thumb {
    background: var(--sb-thumb, rgba(255,255,255,.18));
    border-radius: 99px;
  }

  .task-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .task-section {
    border-radius: 14px;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, #fff) 13%, transparent);
    background: var(--bg, rgba(255,255,255,.04));
    padding: 12px 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: none;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 2px;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-family: var(--block-header-font, inherit);
    color: var(--text, inherit);
    opacity: 0.7;
  }

  .section-count {
    font-size: 0.72rem;
    padding: 2px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text, #fff) 12%, transparent);
    color: var(--text, inherit);
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }

  .section-toggle {
    border: none;
    background: none;
    color: var(--text, inherit);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 2px 5px;
    opacity: 0.5;
    border-radius: 4px;
    line-height: 1;
  }
  .section-toggle:hover { opacity: 0.9; }

  /* ── Task list ──────────────────────────────────────────────────── */
  .task-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .task-item {
    display: flex;
    align-items: flex-start;
    gap: 2px;
    padding: 4px 6px 4px 2px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--text, #fff) 6%, transparent);
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, #fff) 10%, transparent);
    min-height: 44px;
    box-sizing: border-box;
    transition: box-shadow 0.1s, opacity 0.1s;
  }
  .task-item.dragging { opacity: 0.35; }
  .task-item.drag-over-before { box-shadow: inset 0 2px 0 0 var(--text, #f5f5f5); }
  .task-item.drag-over-after  { box-shadow: inset 0 -2px 0 0 var(--text, #f5f5f5); }

  .drag-handle {
    flex-shrink: 0;
    width: 24px;
    min-height: 44px;
    padding: 0;
    border: none;
    background: none;
    cursor: grab;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text, inherit);
    opacity: 0.3;
    align-self: flex-start;
    padding-top: 13px;
  }
  .drag-handle:active { cursor: grabbing; opacity: 0.7; }

  .task-row {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    flex: 1 1 auto;
    min-width: 0;
    padding-top: 4px;
  }

  .circle-check {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .task-text {
    flex: 1 1 auto;
    min-width: 0;
    cursor: text;
    word-break: break-word;
    white-space: normal;
    line-height: 1.45;
    padding: 8px 2px 4px;
    font-size: 0.9rem;
  }

  .task-text.done-text {
    opacity: 0.5;
    text-decoration: line-through;
  }

  .task-text-input {
    flex: 1 1 auto;
    min-width: 0;
    background: color-mix(in srgb, var(--text, #fff) 8%, var(--bg, #000));
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, #fff) 30%, transparent);
    border-radius: 6px;
    color: var(--text, inherit);
    font: inherit;
    font-size: 0.9rem;
    padding: 6px 8px;
    box-sizing: border-box;
    width: 100%;
    margin-top: 4px;
  }

  .delete-task-btn {
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--text, inherit);
    cursor: pointer;
    font-size: 1rem;
    width: 32px;
    min-height: 44px;
    opacity: 0.45;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .delete-task-btn:hover { opacity: 0.9; }

  .task-empty {
    padding: 18px 4px;
    opacity: 0.45;
    font-size: 0.85rem;
    font-style: italic;
  }

  /* ── Add bar (always visible at bottom) ─────────────────────────── */
  .task-add-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px 10px;
    border-top: 1px solid color-mix(in srgb, var(--text, #fff) 10%, transparent);
    background: var(--bg, var(--canvas-inner-bg, #000));
  }

  .add-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 9px 12px;
    border-radius: 10px;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, #fff) 25%, transparent);
    background: color-mix(in srgb, var(--text, #fff) 8%, var(--bg, #000));
    color: var(--text, inherit);
    font-family: var(--block-body-font, inherit);
    font-size: 0.95rem;
  }
  .add-input::placeholder { color: var(--text, inherit); opacity: 0.45; }

  .add-dir-btn {
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, #fff) 25%, transparent);
    background: color-mix(in srgb, var(--text, #fff) 8%, transparent);
    color: var(--text, inherit);
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.75;
  }
  .add-dir-btn:hover { opacity: 1; }

  .add-btn {
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, #fff) 30%, transparent);
    background: color-mix(in srgb, var(--text, #fff) 14%, transparent);
    color: var(--text, inherit);
    cursor: pointer;
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .add-btn:hover { background: color-mix(in srgb, var(--text, #fff) 24%, transparent); }

  .no-list-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    opacity: 0.6;
    font-size: 0.95rem;
    padding: 32px;
    text-align: center;
  }

  /* ── Responsive ─────────────────────────────────────────────────── */
  @media (max-width: 600px) {
    .task-columns { grid-template-columns: 1fr; }
    .task-header { padding: 8px 10px 0; }
    .task-body { padding: 8px 10px 4px; }
    .task-add-bar { padding: 7px 10px 9px; }
    .task-tab { padding: 8px 14px; font-size: 0.85rem; }
    .task-text { font-size: 0.9rem; }
    .drag-handle { display: none; }
  }
</style>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="task-mode" bind:this={canvasRef} style={`${canvasCssVars} ${taskColorVars}`} on:contextmenu={handleContextMenu}>
  {#if taskBlocks.length}
    <div class="task-header">
      <div class="task-tabs-row" role="tablist">
        {#each taskBlocks as block, i}
          <button
            class="task-tab"
            role="tab"
            aria-selected={block.id === selectedTaskId}
            style="--tab-bg: {block.bgColor || '#000000'}; --tab-text: {block.textColor || '#ffffff'};"
            on:click={() => selectTaskList(block.id)}
          >{getTabLabel(block, i)}</button>
        {/each}
      </div>

      {#if taskBlock}
        <div class="task-title-row">
          <input
            type="text"
            value={taskBlock.title || ''}
            on:input={e => updateBlock(selectedTaskId, { title: e.target.value }, { changedKeys: ['title'], pushToHistory: false })}
            on:blur={e => updateBlock(selectedTaskId, { title: e.target.value }, { changedKeys: ['title'], pushToHistory: true })}
            placeholder="Task list title…"
          />
          <ColorField
            value={taskBlock.bgColor || '#000000'}
            title="Background Color"
            on:input={e => setTaskColor('bgColor', e.detail)}
            on:change={e => commitTaskColor('bgColor', e.detail)}
          />
          <ColorField
            value={taskBlock.textColor || '#ffffff'}
            title="Text Color"
            on:input={e => setTaskColor('textColor', e.detail)}
            on:change={e => commitTaskColor('textColor', e.detail)}
          />
          <button class="delete-list-btn" on:click={deleteTaskList}>Delete</button>
        </div>
      {/if}
    </div>

    <div class="task-body">
      <div class="task-columns">
        <!-- To Do column -->
        <section class="task-section">
          <div class="section-header">
            <span class="section-title">To Do</span>
            <span class="section-count">{todoTasks.length}</span>
          </div>
          {#if todoTasks.length}
            <ul class="task-list">
              {#each todoTasks as task}
                <li
                  class="task-item"
                  class:dragging={draggingTaskId === task.id}
                  class:drag-over-before={dragOverTaskId === task.id && dragOverPos === 'before'}
                  class:drag-over-after={dragOverTaskId === task.id && dragOverPos === 'after'}
                  data-task-id={task.id}
                >
                  <button
                    class="drag-handle"
                    aria-label="Drag to reorder"
                    on:pointerdown={e => startDrag(e, task.id)}
                  >
                    <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
                      <circle cx="2" cy="2" r="1.4"/><circle cx="8" cy="2" r="1.4"/>
                      <circle cx="2" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/>
                      <circle cx="2" cy="14" r="1.4"/><circle cx="8" cy="14" r="1.4"/>
                    </svg>
                  </button>
                  <div class="task-row">
                    <button
                      class="circle-check"
                      on:click={() => toggleTask(task.id)}
                      aria-label="Mark complete"
                    >
                      <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                        <circle cx="10" cy="10" r="8.5" fill="transparent"
                          stroke="var(--text,#f5f5f5)" stroke-width="1.5" stroke-opacity="0.55"/>
                      </svg>
                    </button>
                    {#if editingTaskId === task.id}
                      <input
                        class="task-text-input"
                        type="text"
                        bind:value={editText}
                        on:click|stopPropagation
                        on:keydown|stopPropagation={handleEditKeydown}
                        on:blur={commitEditTask}
                        use:autoFocusInput
                      />
                    {:else}
                      <span
                        class="task-text"
                        title="Double-click to edit"
                        on:dblclick|stopPropagation={() => startEditTask(task)}
                        on:click|stopPropagation
                      >{task.text}</span>
                    {/if}
                  </div>
                  <button class="delete-task-btn" aria-label="Delete task" on:click={() => deleteTask(task.id)}>×</button>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="task-empty">No pending tasks.</div>
          {/if}
        </section>

        <!-- Done column -->
        <section class="task-section">
          <div class="section-header">
            <span class="section-title">Done</span>
            <span class="section-count">{doneTasks.length}</span>
            <button class="section-toggle" on:click={() => doneExpanded = !doneExpanded}
              title={doneExpanded ? 'Collapse' : 'Expand'}
            >{doneExpanded ? '▲' : '▼'}</button>
          </div>
          {#if doneExpanded}
            {#if doneTasks.length}
              <ul class="task-list">
                {#each doneTasks as task}
                  <li
                    class="task-item"
                    class:dragging={draggingTaskId === task.id}
                    class:drag-over-before={dragOverTaskId === task.id && dragOverPos === 'before'}
                    class:drag-over-after={dragOverTaskId === task.id && dragOverPos === 'after'}
                    data-task-id={task.id}
                  >
                    <button
                      class="drag-handle"
                      aria-label="Drag to reorder"
                      on:pointerdown={e => startDrag(e, task.id)}
                    >
                      <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
                        <circle cx="2" cy="2" r="1.4"/><circle cx="8" cy="2" r="1.4"/>
                        <circle cx="2" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/>
                        <circle cx="2" cy="14" r="1.4"/><circle cx="8" cy="14" r="1.4"/>
                      </svg>
                    </button>
                    <div class="task-row">
                      <button
                        class="circle-check"
                        on:click={() => toggleTask(task.id)}
                        aria-label="Mark incomplete"
                      >
                        <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                          <circle cx="10" cy="10" r="9"
                            fill="var(--text,#f5f5f5)"
                            stroke="var(--text,#f5f5f5)" stroke-width="1"/>
                          <path d="M5.5 10.5 L8.5 13.5 L14.5 7"
                            stroke="var(--bg,#000)" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>
                      {#if editingTaskId === task.id}
                        <input
                          class="task-text-input"
                          type="text"
                          bind:value={editText}
                          on:click|stopPropagation
                          on:keydown|stopPropagation={handleEditKeydown}
                          on:blur={commitEditTask}
                          use:autoFocusInput
                        />
                      {:else}
                        <span
                          class="task-text done-text"
                          title="Double-click to edit"
                          on:dblclick|stopPropagation={() => startEditTask(task)}
                          on:click|stopPropagation
                        >{task.text}</span>
                      {/if}
                    </div>
                    <button class="delete-task-btn" aria-label="Delete task" on:click={() => deleteTask(task.id)}>×</button>
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="task-empty">No completed tasks yet.</div>
            {/if}
          {/if}
        </section>
      </div>
    </div>

    <!-- Sticky add bar -->
    <div class="task-add-bar">
      <button
        class="add-dir-btn"
        on:click={toggleDirection}
        title={addDirection === 'above' ? 'Adding at top' : 'Adding at bottom'}
      >{addDirection === 'above' ? '↑' : '↓'}</button>
      <input
        class="add-input"
        type="text"
        bind:value={newTaskText}
        on:keydown={handleKeydown}
        placeholder="Add a task…"
      />
      <button class="add-btn" on:click={addTask} aria-label="Add task">＋</button>
    </div>
  {:else}
    <div class="no-list-placeholder">
      No task lists yet.<br/>Use <strong>+ Task List</strong> from the menu to create one.
    </div>
  {/if}
</div>

{#if ctxMenu.open && taskBlock}
  <BlockContextMenu
    x={ctxMenu.x}
    y={ctxMenu.y}
    items={[{ id: 'copyMd', label: 'Copy as Markdown' }]}
    colorEdit={true}
    bgColor={taskBlock.bgColor || '#000000'}
    textColor={taskBlock.textColor || '#ffffff'}
    on:action={(e) => handleCtxAction(e.detail)}
    on:colorChange={(e) => handleCtxColor(e.detail)}
    on:close={closeCtxMenu}
  />
{/if}
