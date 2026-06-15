<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  export let x = 0;
  export let y = 0;
  export let items = []; // [{ id, label, variant? }]  variant: 'default' | 'danger'

  const dispatch = createEventDispatcher();

  let menuEl;
  let left = x;
  let top = y;

  function doAction(id) {
    dispatch('action', id);
    dispatch('close');
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
    requestAnimationFrame(() => {
      if (!menuEl) return;
      const rect = menuEl.getBoundingClientRect();
      left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
      top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    });
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
</style>
