<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import DefaultCanvasMode from './CanvasMode.svelte';
  import SimpleNoteMode from './SimpleNoteMode.svelte';

  export let mode; // 'default' or 'simple'
  export let blocks;
  export let canvasRef;
  export let onTouchStart;
  export let onTouchMove;
  export let onTouchEnd;

  let width = 0;

  const dispatch = createEventDispatcher();

  function deleteBlockHandler(event) {
    dispatch('delete', event.detail);
  }

  function updateBlockHandler(event) {
    dispatch('update', event.detail);
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
    {blocks}
    bind:canvasRef
    on:touchstart={onTouchStart}
    on:touchmove={onTouchMove}
    on:touchend={onTouchEnd}
    on:update={updateBlockHandler}
    on:delete={deleteBlockHandler}
  />
{:else}
    <SimpleNoteMode
      {blocks}
      bind:canvasRef
      on:touchstart={onTouchStart}
      on:touchmove={onTouchMove}
      on:touchend={onTouchEnd}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
    />

{/if}
