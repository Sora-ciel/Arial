<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { getFileExplorer, loadContentBlob } from '../storage.js';
  import { TYPE_ICONS, SHAREABLE, CONTENT_TYPE_TO_BLOCK, fileExt, displayFilename } from '../utils/fileEntry.js';

  export let currentSaveName = '';
  export let controlColors = {};

  const dispatch = createEventDispatcher();

  $: bg     = controlColors?.left?.panelBg  || '#181818';
  $: text   = controlColors?.left?.textColor || '#f5f5f5';
  $: border = controlColors?.left?.borderColor || '#333';

  let entries = [];
  let loading = true;
  let search = '';
  let addingId = null;
  let sortAsc = true;
  let thumbUrls = {};

  function nameMatches(e, q) {
    return displayFilename(e).toLowerCase().includes(q) || e.usedBy?.some(f => f.toLowerCase().includes(q));
  }
  function contentMatches(e, q) { return !!(e.preview?.toLowerCase().includes(q)); }

  $: filtered = (() => {
    const q = search.toLowerCase().trim();
    const sort = (a, b) => {
      const va = displayFilename(a).toLowerCase(), vb = displayFilename(b).toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    };
    if (!q) return [...entries].sort(sort);
    const nameHits = entries.filter(e => nameMatches(e, q));
    const contentOnly = entries.filter(e => !nameMatches(e, q) && contentMatches(e, q));
    return [...nameHits.sort(sort), ...contentOnly.sort(sort)];
  })();

  onMount(async () => {
    const reg = await getFileExplorer();
    entries = Object.entries(reg).map(([uuid, e]) => ({ uuid, ...e }));
    loading = false;
    // Load thumbnails
    for (const e of entries) {
      if (e.type === 'image' || e.type === 'video') {
        loadContentBlob(e.uuid).then(blob => {
          if (blob instanceof Blob) {
            thumbUrls[e.uuid] = URL.createObjectURL(blob);
            thumbUrls = { ...thumbUrls };
          }
        });
      }
    }
  });

  onDestroy(() => {
    for (const url of Object.values(thumbUrls)) URL.revokeObjectURL(url);
  });

  async function addToFolder(entry) {
    if (!currentSaveName || addingId === entry.uuid) return;
    addingId = entry.uuid;
    const { type: blockType, field } = CONTENT_TYPE_TO_BLOCK[entry.type] ?? { type:'text', field:'content' };
    dispatch('shareContent', { uuid: entry.uuid, entry: { ...entry, blockType, field } });
    entries = entries.map(e =>
      e.uuid === entry.uuid
        ? { ...e, usedBy: [...new Set([...(e.usedBy||[]), currentSaveName])] }
        : e
    );
    setTimeout(() => { addingId = null; }, 900);
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="overlay" role="dialog" aria-modal="true" tabindex="-1" on:click|self={() => dispatch('close')}>
  <div
    class="popup"
    style="--bg:{bg};--text:{text};--border:{border}"
    on:click|stopPropagation
  >
    <div class="popup-header">
      <span class="popup-title">📂 File Library</span>
      <input class="pop-search" type="text" placeholder="Search…" bind:value={search} />
      <button class="close-btn" on:click={() => dispatch('close')}>✕</button>
    </div>

    {#if loading}
      <div class="pop-empty">Loading…</div>
    {:else if filtered.length === 0}
      <div class="pop-empty">{entries.length === 0 ? 'No files yet.' : 'No matches.'}</div>
    {:else}
      <div class="pop-header-row">
        <span class="ph-icon"></span>
        <button class="ph-name ph-sort" on:click={() => { sortAsc = !sortAsc; }}>
          Name {sortAsc ? '↑' : '↓'}
        </button>
        <span class="ph-folders">Used in</span>
        <span class="ph-action"></span>
      </div>

      <div class="pop-list">
        {#each filtered as entry (entry.uuid)}
          <div class="pop-row" class:already={entry.usedBy?.includes(currentSaveName)}>
            <span class="ph-icon">
            {#if thumbUrls[entry.uuid]}
              <img class="pop-thumb" src={thumbUrls[entry.uuid]} alt="" />
            {:else}
              {TYPE_ICONS[entry.type] ?? '📎'}
            {/if}
          </span>
            <span class="ph-name">
              <span class="pop-filename">{displayFilename(entry)}</span>
              {#if search && !nameMatches(entry, search.toLowerCase()) && contentMatches(entry, search.toLowerCase())}
                <span class="pop-content-match">↳ "{entry.preview}"</span>
              {:else if entry.preview}
                <span class="pop-preview">— {entry.preview}</span>
              {/if}
            </span>
            <span class="ph-folders">
              {#each (entry.usedBy || []) as f}
                <span class="pop-chip" class:current={f === currentSaveName}>{f}</span>
              {/each}
            </span>
            <span class="ph-action">
              {#if SHAREABLE.has(entry.type) && currentSaveName}
                {#if entry.usedBy?.includes(currentSaveName)}
                  <span class="in-use">✓ In use</span>
                {:else}
                  <button
                    class="add-btn"
                    disabled={addingId === entry.uuid}
                    on:click={() => addToFolder(entry)}
                  >
                    {addingId === entry.uuid ? 'Added!' : 'Add'}
                  </button>
                {/if}
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2500;
  }

  .popup {
    background: var(--bg, #181818);
    color: var(--text, #f5f5f5);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    width: min(560px, 94vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: 0.88rem;
  }

  .popup-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
    flex-shrink: 0;
  }

  .popup-title {
    font-weight: 600;
    font-size: 0.92rem;
    flex-shrink: 0;
  }

  .pop-search {
    flex: 1;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text);
    border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.85rem;
    outline: none;
  }

  .pop-search::placeholder { color: color-mix(in srgb, var(--text) 40%, transparent); }

  .close-btn {
    background: none;
    border: none;
    color: color-mix(in srgb, var(--text) 50%, transparent);
    cursor: pointer;
    font-size: 1rem;
    padding: 2px 6px;
    border-radius: 5px;
  }
  .close-btn:hover { color: var(--text); }

  .pop-header-row {
    display: grid;
    grid-template-columns: 44px 1fr 130px 68px;
    align-items: center;
    padding: 3px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
    flex-shrink: 0;
    color: color-mix(in srgb, var(--text) 55%, transparent);
    font-size: 0.76rem;
  }

  .ph-sort {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font-size: inherit;
    padding: 0;
  }
  .ph-sort:hover { color: var(--text); }

  .pop-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }

  .pop-row {
    display: grid;
    grid-template-columns: 44px 1fr 130px 68px;
    align-items: center;
    padding: 0 14px;
    height: 34px;
    border-radius: 4px;
    margin: 1px 6px;
    transition: background 0.08s;
  }

  .pop-row:hover { background: color-mix(in srgb, var(--text) 7%, transparent); }

  .pop-row.already { opacity: 0.6; }

  .ph-icon {
    font-size: 0.95rem;
    display: flex; align-items: center; justify-content: center;
    width: 38px; height: 34px;
  }
  .pop-thumb {
    width: 38px; height: 34px;
    object-fit: cover; border-radius: 4px; display: block;
  }

  .ph-name {
    display: flex;
    align-items: center;
    gap: 7px;
    overflow: hidden;
    min-width: 0;
  }

  .pop-filename {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .pop-preview {
    font-size: 0.74rem;
    opacity: 0.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pop-content-match {
    font-size: 0.74rem;
    color: color-mix(in srgb, var(--text) 55%, #6ea4ff 45%);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-style: italic;
  }

  .ph-folders {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    overflow: hidden;
  }

  .pop-chip {
    font-size: 0.70rem;
    padding: 1px 5px;
    background: color-mix(in srgb, var(--text) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--text) 16%, transparent);
    border-radius: 7px;
    white-space: nowrap;
    opacity: 0.65;
  }

  .pop-chip.current { opacity: 1; }

  .ph-action { display: flex; justify-content: flex-end; }

  .add-btn {
    background: color-mix(in srgb, var(--text) 12%, transparent);
    color: var(--text);
    border: 1px solid color-mix(in srgb, var(--text) 22%, transparent);
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 0.78rem;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.1s;
  }

  .add-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 20%, transparent);
  }

  .add-btn:disabled { opacity: 0.55; cursor: default; }

  .in-use {
    font-size: 0.76rem;
    opacity: 0.55;
  }

  .pop-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.4;
    padding: 24px;
  }
</style>
