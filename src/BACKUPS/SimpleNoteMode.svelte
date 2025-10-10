<script>
  import { createEventDispatcher } from 'svelte';
  import TexteBlock from '../components/TexteBlock.svelte';
  import ImgBlock from '../components/ImgBlock.svelte';
  import Texteclean from '../components/TexteClean.svelte';
  import Music from '../components/MusicBlock.svelte';
  import Embed from '../components/EmbedBlock.svelte';

  export let blocks = [];
  export let canvasRef;
  export let focusedBlockId = null;

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
</script>

<style>
  .simple-canvas {
    position: fixed;
    top: var(--controls-height, 56px);
    left: 0;
    right: 0;
    bottom: 0;
    overflow: auto;
    background: #0f0f0f;
  }

  .simple-inner {
    position: relative;
    width: 1920px;
    max-width: 100%;
    min-height: 100%;
    margin: 0 auto;
  }

  @media (max-width: 1024px) {
    .simple-inner {
      width: 100%;
      min-height: calc(100vh - var(--controls-height, 75px));
    }
  }
</style>

<div class="simple-canvas" bind:this={canvasRef}>
  <div class="simple-inner">
    {#each blocks as block (block.id + (block.type !== 'text' && block.type !== 'cleantext' ? '-' + (block._version || 0) : ''))}
      {#if block.type === 'text'}
        <TexteBlock
          id={block.id}
          initialPosition={block.position}
          initialSize={block.size}
          initialBgColor={block.bgColor}
          initialTextColor={block.textColor}
          initialContent={block.content}
          on:delete={deleteBlockHandler}
          on:update={updateBlockHandler}
          on:focusToggle={focusToggleHandler}
          focused={block.id === focusedBlockId}
        />
      {:else if block.type === 'image'}
        <ImgBlock
          id={block.id}
          initialPosition={block.position}
          initialSize={block.size}
          initialBgColor={block.bgColor}
          initialTextColor={block.textColor}
          initialSrc={block.src}
          on:delete={deleteBlockHandler}
          on:update={updateBlockHandler}
          on:focusToggle={focusToggleHandler}
          focused={block.id === focusedBlockId}
        />
      {:else if block.type === 'cleantext'}
        <Texteclean
          id={block.id}
          initialPosition={block.position}
          initialSize={block.size}
          initialBgColor={block.bgColor}
          initialTextColor={block.textColor}
          initialContent={block.content}
          on:delete={deleteBlockHandler}
          on:update={updateBlockHandler}
          on:focusToggle={focusToggleHandler}
          focused={block.id === focusedBlockId}
        />
      {:else if block.type === 'music'}
        <Music
          id={block.id}
          initialPosition={block.position}
          initialSize={block.size}
          initialBgColor={block.bgColor}
          initialTextColor={block.textColor}
          initialContent={block.content}
          on:delete={deleteBlockHandler}
          on:update={updateBlockHandler}
          on:focusToggle={focusToggleHandler}
          focused={block.id === focusedBlockId}
        />
      {:else if block.type === 'embed'}
        <Embed
          id={block.id}
          initialPosition={block.position}
          initialSize={block.size}
          initialBgColor={block.bgColor}
          initialTextColor={block.textColor}
          initialContent={block.content}
          on:delete={deleteBlockHandler}
          on:update={updateBlockHandler}
          on:focusToggle={focusToggleHandler}
          focused={block.id === focusedBlockId}
        />
      {/if}
    {/each}
  </div>
</div>
