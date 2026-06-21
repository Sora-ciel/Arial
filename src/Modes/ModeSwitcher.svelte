<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import DefaultCanvasMode from './CanvasMode.svelte';
  import SimpleNoteMode from './SimpleNoteMode.svelte';
  import SingleNoteMode from './SingleNoteMode.svelte';
  import HabitTrackerMode from './HabitTrackerMode.svelte';
  import TaskMode from './TaskMode.svelte';
  import BirthdayMode from './BirthdayMode.svelte';
  import FileSearcherMode from './FileSearcherMode.svelte';

  export let mode; // 'default' or 'simple'
  export let blocks;
  export let canvasRef;
  export let onTouchStart;
  export let onTouchMove;
  export let onTouchEnd;
  export let focusedBlockId;
  export let canvasColors = {};
  export let leftControlColors = {};
  export let modeLabels = {};
  export let simpleNoteColumnCount = 2;
  export let taskAddDirection = 'above';
  export let canvasRotation = 0;
  export let singleNoteSettings = {};
  export let currentSaveName = '';

  let width = 0;

  const dispatch = createEventDispatcher();

  function deleteBlockHandler(event) {
    dispatch('delete', event.detail);
  }

  function updateBlockHandler(event) {
    dispatch('update', event.detail);
  }

  function focusToggleHandler(event) {
    dispatch('focusToggle', event.detail);
  }

  function updateWidth() {
    width = window.innerWidth;
  }

  onMount(() => {
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  });


</script>

{#if mode === 'default'}
  <DefaultCanvasMode
    {mode}
    {blocks}
    {focusedBlockId}
    rotation={canvasRotation}
    bind:canvasRef
    {canvasColors}
    on:touchstart={onTouchStart}
    on:touchmove={onTouchMove}
    on:touchend={onTouchEnd}
    on:update={updateBlockHandler}
    on:delete={deleteBlockHandler}
    on:focusToggle={focusToggleHandler}
  />
{:else if mode === 'simple'}
    <SimpleNoteMode
      {blocks}
      {focusedBlockId}
      columnCount={simpleNoteColumnCount}
      bind:canvasRef
      {canvasColors}
      {leftControlColors}
      on:touchstart={onTouchStart}
      on:touchmove={onTouchMove}
      on:touchend={onTouchEnd}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
      on:focusToggle={focusToggleHandler}
      on:addBlock
    />

  {:else if mode === 'habit'}
    <HabitTrackerMode {modeLabels} activeMode={mode} {canvasColors} />
  {:else if mode === 'task'}
    <TaskMode
      {blocks}
      {focusedBlockId}
      bind:canvasRef
      {canvasColors}
      addDirection={taskAddDirection}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
      on:focusToggle={focusToggleHandler}
      on:modeSettingChange
    />
  {:else if mode === 'birthday'}
    <BirthdayMode />
  {:else if mode === 'files'}
    <FileSearcherMode
      {canvasColors}
      {currentSaveName}
      on:shareContent={(e) => dispatch('shareContent', e.detail)}
    />
  {:else}
    <SingleNoteMode
      {blocks}
      {focusedBlockId}
      bind:canvasRef
      {canvasColors}
      {currentSaveName}
      {singleNoteSettings}
      on:touchstart={onTouchStart}
      on:touchmove={onTouchMove}
      on:touchend={onTouchEnd}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
      on:focusToggle={focusToggleHandler}
      on:addBlock
      on:switchSave
      on:modeSettingChange
    />
{/if}
