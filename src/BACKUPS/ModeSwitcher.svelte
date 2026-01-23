<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import DefaultCanvasMode from './CanvasMode.svelte';
  import SimpleNoteMode from './SimpleNoteMode.svelte';
  import SingleNoteMode from './SingleNoteMode.svelte';
  import HabitTrackerMode from './HabitTrackerMode.svelte';

  export let mode; // 'default' or 'simple'
  export let blocks;
  export let canvasRef;
  export let onTouchStart;
  export let onTouchMove;
  export let onTouchEnd;
  export let focusedBlockId;
  export let canvasColors = {};
  export let modeLabels = {};

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
      bind:canvasRef
      {canvasColors}
      on:touchstart={onTouchStart}
      on:touchmove={onTouchMove}
      on:touchend={onTouchEnd}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
      on:focusToggle={focusToggleHandler}
    />

{:else}
  {#if mode === 'habit'}
    <HabitTrackerMode {modeLabels} activeMode={mode} />
  {:else}
    <SingleNoteMode
      {blocks}
      {focusedBlockId}
      bind:canvasRef
      {canvasColors}
      on:touchstart={onTouchStart}
      on:touchmove={onTouchMove}
      on:touchend={onTouchEnd}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
      on:focusToggle={focusToggleHandler}
    />
  {/if}
{/if}
