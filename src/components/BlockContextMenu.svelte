<script>
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import ColorPicker from './ColorPicker.svelte';

  export let x = 0;
  export let y = 0;
  export let items = []; // [{ id, label, variant? }]  variant: 'default' | 'danger'
  export let colorEdit = false; // show bg/text color pickers
  export let showTextColor = true; // hide the text picker for e.g. images
  export let bgColor = '#000000';
  export let textColor = '#ffffff';

  const dispatch = createEventDispatcher();

  let openPicker = null; // 'bg' | 'text' | null

  async function togglePicker(which) {
    openPicker = openPicker === which ? null : which;
    await tick();
    clampToViewport();
  }

  let menuEl;
  let left = x;
  let top = y;

  function doAction(id) {
    dispatch('action', id);
    dispatch('close');
  }

  function clampToViewport() {
    if (!menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      dispatch('close');
    }
  }

  function onPointerDown(e) {
    if (menuEl && !menuEl.contains(e.target)) {
      dispatch('close');
    }
  }

  onMount(() => {
    requestAnimationFrame(clampToViewport);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('pointerdown', onPointerDown);
  });
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="ctx-menu" bind:this={menuEl} style="left:{left}px; top:{top}px;">
  {#if colorEdit}
    <div class="ctx-colors">
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <button
        class="ctx-color"
        class:active={openPicker === 'bg'}
        on:click|stopPropagation={() => togglePicker('bg')}
      >
        <span class="ctx-color-swatch" style="background:{bgColor}"></span>
        <span class="ctx-color-label">Background</span>
        <span class="ctx-color-hex">{bgColor}</span>
      </button>
      {#if openPicker === 'bg'}
        <ColorPicker
          value={bgColor}
          on:input={(e) => dispatch('colorChange', { bgColor: e.detail, commit: false })}
          on:change={(e) => dispatch('colorChange', { bgColor: e.detail, commit: true })}
        />
      {/if}

      {#if showTextColor}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <button
          class="ctx-color"
          class:active={openPicker === 'text'}
          on:click|stopPropagation={() => togglePicker('text')}
        >
          <span class="ctx-color-swatch" style="background:{textColor}"></span>
          <span class="ctx-color-label">Text</span>
          <span class="ctx-color-hex">{textColor}</span>
        </button>
        {#if openPicker === 'text'}
          <ColorPicker
            value={textColor}
            on:input={(e) => dispatch('colorChange', { textColor: e.detail, commit: false })}
            on:change={(e) => dispatch('colorChange', { textColor: e.detail, commit: true })}
          />
        {/if}
      {/if}
    </div>
    {#if items.length}<div class="ctx-sep"></div>{/if}
  {/if}
  {#each items as item}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
      class="ctx-item"
      class:ctx-danger={item.variant === 'danger'}
      on:click|stopPropagation={() => doAction(item.id)}
    >
      {item.label}
    </div>
  {/each}
</div>

<style>
  .ctx-menu {
    position: fixed;
    z-index: 9100;
    min-width: 148px;
    max-height: calc(100dvh - 16px);
    overflow-y: auto;
    background: #111111;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ctx-item {
    width: 100%;
    border: none;
    border-radius: 8px;
    padding: 9px 13px;
    font-size: 0.88rem;
    text-align: left;
    color: #f0f0f0;
    background: transparent;
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
  }

  .ctx-item.ctx-danger {
    color: #ff8b8b;
  }

  .ctx-item:hover {
    background: rgba(255, 255, 255, 0.09);
  }

  .ctx-colors {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 2px;
  }

  .ctx-color {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 7px 10px;
    font-size: 0.85rem;
    color: #f0f0f0;
    border: none;
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    box-sizing: border-box;
    text-align: left;
  }
  .ctx-color:hover,
  .ctx-color.active {
    background: rgba(255, 255, 255, 0.09);
  }

  .ctx-color-label {
    flex: 1;
  }

  .ctx-color-hex {
    font-family: monospace;
    font-size: 0.75rem;
    opacity: 0.6;
    text-transform: uppercase;
  }

  .ctx-color-swatch {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    flex-shrink: 0;
  }

  .ctx-sep {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 4px 2px;
  }
</style>
