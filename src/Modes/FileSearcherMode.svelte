<script context="module">
  // Survives mode switches — avoids full reload each time the explorer is opened
  let _cache = null; // { entries, thumbUrls, savedAt, viewMode, thumbSize }
</script>

<script>
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { getFileExplorer, renameContentFile, loadBlobByPath, deleteContentFile } from '../storage.js';
  import { readSetting, writeSetting } from '../storage/settings.js';
  import Lightbox from '../components/Lightbox.svelte';

  export let canvasColors = {};
  export let currentSaveName = '';

  const dispatch = createEventDispatcher();

  // ── Theme ──────────────────────────────────────────────────────────
  const defaultColors = { outerBg: '#000', innerBg: '#101010' };
  $: theme = { ...defaultColors, ...(canvasColors || {}) };
  $: bg = theme.innerBg;
  $: text = getReadableColor(bg);

  function getReadableColor(c = '') {
    const h = c.replace('#', '');
    if (h.length !== 6) return '#f5f5f5';
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.6 ? '#111' : '#f5f5f5';
  }

  // ── Data ───────────────────────────────────────────────────────────
  let destroyed = false;
  let entries = _cache ? [..._cache.entries] : [];
  let loading = !_cache; // skip spinner if we have cached data
  let search = '';
  // Init from cache so the component renders with the correct view immediately.
  // Without this, the component would mount as 'list' then async-switch to 'grid'
  // (or vice versa), causing Svelte to destroy and recreate every row.
  let viewMode = _cache?.viewMode ?? 'list'; // 'list' | 'grid'
  let sortCol = 'name';
  let sortAsc = true;
  let thumbSize = _cache?.thumbSize ?? 192; // grid card min-width in px
  let settingsLoaded = false;
  let thumbSaveTimer = null;

  // Derived sizes for list view thumbnails
  $: listThumbPx = Math.round(Math.max(24, thumbSize * 42 / 192));
  $: iconColPx   = listThumbPx + 14;
  $: rowHeightPx = Math.max(38, listThumbPx + 14);

  // Persist view mode whenever it changes (after load)
  $: if (settingsLoaded) writeSetting('fileExplorerViewMode', viewMode);

  // Debounced persist of thumb size
  $: if (settingsLoaded) {
    clearTimeout(thumbSaveTimer);
    thumbSaveTimer = setTimeout(() => writeSetting('fileExplorerThumbSize', thumbSize), 300);
  }

  // ── Thumbnails ─────────────────────────────────────────────────────
  let thumbUrls = _cache ? { ..._cache.thumbUrls } : {};

  // ── Lightbox ───────────────────────────────────────────────────────
  let lbOpen = false;
  let lbImages = [];
  let lbStart = 0;

  function openFileLightbox(entry) {
    const url = thumbUrls[entry.uuid];
    if (!url) return;
    const visible = filtered.filter(e => thumbUrls[e.uuid]);
    const idx = visible.findIndex(e => e.uuid === entry.uuid);
    lbImages = visible.map(e => thumbUrls[e.uuid]);
    lbStart = idx >= 0 ? idx : 0;
    lbOpen = true;
  }

  async function loadThumbnails(list) {
    const toLoad = list.filter(e =>
      (e.type === 'image' || e.type === 'video') && !thumbUrls[e.uuid] && e.file
    );
    if (!toLoad.length) return;

    const BATCH = 8;
    for (let i = 0; i < toLoad.length; i += BATCH) {
      if (destroyed) return;
      const batch = toLoad.slice(i, i + BATCH);
      const blobs = await Promise.all(batch.map(e => loadBlobByPath(e.file)));
      if (destroyed) return;
      const newUrls = {};
      blobs.forEach((blob, idx) => {
        if (blob instanceof Blob) newUrls[batch[idx].uuid] = URL.createObjectURL(blob);
      });
      if (Object.keys(newUrls).length) thumbUrls = { ...thumbUrls, ...newUrls };
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // ── Selection & interaction ────────────────────────────────────────
  let selectedId = null;
  let renamingId = null;
  let renameValue = '';
  let renameInput;
  let clipboard = null;
  let ctxMenu = null;
  let addingId = null;

  const TYPE_ICONS = { image:'🖼', video:'🎬', text:'📄', json:'📋' };
  const SHAREABLE = new Set(['image','video','text','json']);
  const CONTENT_TYPE_TO_BLOCK = {
    image: { type:'image',    field:'src' },
    video: { type:'image',    field:'src' },
    text:  { type:'cleantext', field:'content' },
    json:  { type:'task',     field:'tasks' },
  };

  function fileExt(e) { return e.file?.split('.').pop() ?? ''; }
  function displayFilename(e) { return `${e.displayName}.${fileExt(e)}`; }
  function formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  }

  // ── Search helpers ─────────────────────────────────────────────────
  function nameMatches(e, q) {
    return displayFilename(e).toLowerCase().includes(q) ||
      e.usedBy?.some(f => f.toLowerCase().includes(q));
  }
  function contentMatches(e, q) {
    return !!(e.preview?.toLowerCase().includes(q));
  }
  function matchSnippet(e, q) {
    if (!e.preview) return null;
    const idx = e.preview.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return null;
    const start = Math.max(0, idx - 20);
    const end = Math.min(e.preview.length, idx + q.length + 30);
    const snip = (start > 0 ? '…' : '') + e.preview.slice(start, end) + (end < e.preview.length ? '…' : '');
    return snip;
  }

  $: filtered = (() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      return [...entries].sort(compareFn);
    }
    const nameHits = entries.filter(e => nameMatches(e, q));
    const contentOnly = entries.filter(e => !nameMatches(e, q) && contentMatches(e, q));
    return [...nameHits.sort(compareFn), ...contentOnly.sort(compareFn)];
  })();

  function compareFn(a, b) {
    let va, vb;
    if (sortCol === 'name')  { va = displayFilename(a).toLowerCase(); vb = displayFilename(b).toLowerCase(); }
    else if (sortCol === 'type') { va = a.type ?? ''; vb = b.type ?? ''; }
    else { va = a.createdAt ?? 0; vb = b.createdAt ?? 0; }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  }

  // ── Load ──────────────────────────────────────────────────────────
  let _initTimer = null;

  onMount(() => {
    destroyed = false;
    document.addEventListener('keydown', onKeyDown);

    // Defer ALL I/O until the browser is idle so the mode controls stay
    // responsive. requestIdleCallback tells the browser to prioritise user
    // interactions before we start any async work.
    const doInit = async () => {
      if (_cache) {
        // viewMode and thumbSize already set from cache — skip DB reads.
        // Just enable persistence for user-driven changes.
        settingsLoaded = true;
        await refresh();
      } else {
        // First open — load settings from DB before showing anything.
        const [storedView, storedThumb] = await Promise.all([
          readSetting('fileExplorerViewMode'),
          readSetting('fileExplorerThumbSize'),
        ]);
        if (destroyed) return;
        if (storedView) viewMode = storedView;
        if (storedThumb) thumbSize = storedThumb;
        settingsLoaded = true;
        await reload();
      }
    };
    if (typeof requestIdleCallback !== 'undefined') {
      _initTimer = requestIdleCallback(doInit, { timeout: 1500 });
    } else {
      _initTimer = setTimeout(doInit, 0);
    }
  });

  onDestroy(() => {
    destroyed = true;
    if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(_initTimer);
    clearTimeout(_initTimer); // safe to call even if it was an rIC id
    clearTimeout(thumbSaveTimer);
    document.removeEventListener('keydown', onKeyDown);
    // Persist current state to module cache — keeps URLs and settings alive for next mount
    _cache = { entries: [...entries], thumbUrls: { ...thumbUrls }, savedAt: Date.now(), viewMode, thumbSize };
  });

  async function reload() {
    if (!_cache) loading = true;
    const reg = await getFileExplorer();
    if (destroyed) return;
    entries = Object.entries(reg).map(([uuid, e]) => ({ uuid, ...e }));
    loading = false;
    await tick();
    if (!destroyed) await loadThumbnails(entries);
  }

  // Silent background refresh — updates entries without showing a loading state
  async function refresh() {
    // If the cache was saved very recently, trust it and skip the registry read.
    // This covers the common "quick mode-switch and back" case and keeps the
    // controls responsive by avoiding unnecessary async work.
    const FRESH_MS = 20_000;
    if (_cache && Date.now() - (_cache.savedAt ?? 0) < FRESH_MS) {
      if (!destroyed) await loadThumbnails(entries);
      return;
    }

    const reg = await getFileExplorer();
    if (destroyed) return;
    const newEntries = Object.entries(reg).map(([uuid, e]) => ({ uuid, ...e }));

    // O(n) change detection using Maps — avoids the previous O(n²) entries.find loop
    const oldMap = new Map(entries.map(e => [e.uuid, e.displayName]));
    const newSet = new Set(newEntries.map(e => e.uuid));
    const removed = entries.filter(e => !newSet.has(e.uuid));
    const hasChanges = newEntries.length !== entries.length ||
      newEntries.some(e => {
        const oldName = oldMap.get(e.uuid);
        return oldName === undefined || oldName !== e.displayName;
      });

    // Revoke URLs only for deleted files
    for (const e of removed) {
      if (thumbUrls[e.uuid]) URL.revokeObjectURL(thumbUrls[e.uuid]);
    }
    if (removed.length) {
      const cleaned = { ...thumbUrls };
      removed.forEach(e => delete cleaned[e.uuid]);
      thumbUrls = cleaned;
    }

    if (hasChanges) {
      entries = newEntries;
      await tick();
    }
    if (!destroyed) await loadThumbnails(newEntries);
  }

  function sortBy(col) {
    if (sortCol === col) sortAsc = !sortAsc; else { sortCol = col; sortAsc = true; }
  }

  // ── Selection ─────────────────────────────────────────────────────
  function select(uuid) { selectedId = uuid; closeCtx(); }

  // ── Rename ────────────────────────────────────────────────────────
  async function startRename(uuid) {
    const e = entries.find(x => x.uuid === uuid);
    if (!e) return;
    renamingId = uuid; renameValue = e.displayName;
    await tick(); renameInput?.focus(); renameInput?.select();
  }
  async function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      await renameContentFile(renamingId, trimmed);
      entries = entries.map(e => e.uuid === renamingId ? { ...e, displayName: trimmed } : e);
    }
    renamingId = null;
  }
  function cancelRename() { renamingId = null; }

  // ── Context menu ──────────────────────────────────────────────────
  function openCtx(event, uuid) {
    event.preventDefault();
    selectedId = uuid;
    ctxMenu = { x: event.clientX, y: event.clientY, uuid };
    tick().then(() => {
      const el = document.querySelector('.ctx-menu');
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth) ctxMenu = { ...ctxMenu, x: ctxMenu.x - r.width };
      if (r.bottom > window.innerHeight) ctxMenu = { ...ctxMenu, y: ctxMenu.y - r.height };
    });
  }
  function closeCtx() { ctxMenu = null; }

  // ── Clipboard ─────────────────────────────────────────────────────
  function copyFile(uuid) { clipboard = { uuid, mode:'copy' }; closeCtx(); }
  function cutFile(uuid) { clipboard = { uuid, mode:'cut' }; closeCtx(); }
  async function pasteFile() {
    if (!clipboard || !currentSaveName) return;
    const entry = entries.find(e => e.uuid === clipboard.uuid);
    if (!entry) return;
    closeCtx();
    await addToFolder(clipboard.uuid, entry);
    if (clipboard.mode === 'cut') clipboard = null;
  }

  // ── Add to folder ─────────────────────────────────────────────────
  async function addToFolder(uuid, entry) {
    if (!currentSaveName || addingId === uuid) return;
    addingId = uuid; closeCtx();
    const { type: blockType, field } = CONTENT_TYPE_TO_BLOCK[entry.type] ?? { type:'text', field:'content' };
    dispatch('shareContent', { uuid, entry: { ...entry, blockType, field } });
    entries = entries.map(e =>
      e.uuid === uuid ? { ...e, usedBy: [...new Set([...(e.usedBy||[]), currentSaveName])] } : e
    );
    setTimeout(() => { addingId = null; }, 800);
  }

  // ── Delete ────────────────────────────────────────────────────────
  async function deleteFile(uuid) {
    const e = entries.find(x => x.uuid === uuid);
    if (!e) return;
    if (!window.confirm(`Delete "${displayFilename(e)}"?\nThis removes it from all folders that use it.`)) return;
    closeCtx();
    if (thumbUrls[uuid]) {
      URL.revokeObjectURL(thumbUrls[uuid]);
      const t = { ...thumbUrls }; delete t[uuid]; thumbUrls = t;
      if (_cache) delete _cache.thumbUrls[uuid];
    }
    await deleteContentFile(uuid);
    entries = entries.filter(x => x.uuid !== uuid);
    if (_cache) _cache.entries = [...entries];
    if (selectedId === uuid) selectedId = null;
    if (clipboard?.uuid === uuid) clipboard = null;
  }

  // ── Keyboard ──────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (renamingId) { if (e.key === 'Escape') { e.preventDefault(); cancelRename(); } return; }
    if (e.key === 'F2' && selectedId) { e.preventDefault(); startRename(selectedId); }
    if (e.key === 'Delete' && selectedId) { e.preventDefault(); deleteFile(selectedId); }
    if (e.key === 'Escape') { selectedId = null; closeCtx(); }
    if ((e.ctrlKey||e.metaKey) && e.key==='c' && selectedId) { e.preventDefault(); copyFile(selectedId); }
    if ((e.ctrlKey||e.metaKey) && e.key==='x' && selectedId) { e.preventDefault(); cutFile(selectedId); }
    if ((e.ctrlKey||e.metaKey) && e.key==='v') { e.preventDefault(); pasteFile(); }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="explorer"
  style="--bg:{bg};--text:{text};--gmin:{thumbSize}px;--lt:{listThumbPx}px;--lc:{iconColPx}px;--rh:{rowHeightPx}px"
  on:click={() => { selectedId = null; closeCtx(); }}
>
  <!-- Toolbar -->
  <div class="toolbar" on:click|stopPropagation>
    <span class="title">File Library</span>

    <input class="search" type="text" placeholder="Search files or content…" bind:value={search} />

    <!-- View toggle -->
    <div class="view-btns">
      <button class="vbtn" class:active={viewMode==='list'} title="List view" on:click={() => viewMode='list'}>
        ≡
      </button>
      <button class="vbtn" class:active={viewMode==='grid'} title="Grid view" on:click={() => viewMode='grid'}>
        ⊞
      </button>
    </div>

    <!-- Thumbnail size slider -->
    <label class="thumb-slider" title="Thumbnail size">
      🔲
      <input type="range" min="60" max="400" step="10" bind:value={thumbSize} on:click|stopPropagation />
    </label>

    {#if clipboard}
      <span class="clipboard-badge">
        {clipboard.mode==='cut'?'✂':'📋'} {entries.find(e=>e.uuid===clipboard.uuid)?.displayName ?? ''}
        {#if currentSaveName}
          <button class="paste-btn" on:click={pasteFile}>Paste here</button>
        {/if}
        <button class="paste-btn" on:click={() => clipboard=null}>✕</button>
      </span>
    {/if}
  </div>

  {#if loading}
    <div class="empty">Loading…</div>
  {:else if filtered.length === 0}
    <div class="empty">{entries.length===0 ? 'No files yet. Create some blocks first.' : 'No matches.'}</div>
  {:else if viewMode === 'list'}
    <!-- ── List view ── -->
    <div class="header-row" on:click|stopPropagation>
      <span class="col-icon"></span>
      <button class="col-name col-sortable" class:active={sortCol==='name'} on:click={() => sortBy('name')}>
        Name {sortCol==='name'?(sortAsc?'↑':'↓'):''}
      </button>
      <span class="col-folders">Used in</span>
      <button class="col-type col-sortable" class:active={sortCol==='type'} on:click={() => sortBy('type')}>
        Type {sortCol==='type'?(sortAsc?'↑':'↓'):''}
      </button>
      <button class="col-date col-sortable" class:active={sortCol==='date'} on:click={() => sortBy('date')}>
        Modified {sortCol==='date'?(sortAsc?'↑':'↓'):''}
      </button>
    </div>

    <div class="file-list">
      {#each filtered as entry (entry.uuid)}
        {@const isContentOnly = search && !nameMatches(entry, search.toLowerCase()) && contentMatches(entry, search.toLowerCase())}
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <div
          class="file-row"
          class:selected={selectedId===entry.uuid}
          class:cut={clipboard?.uuid===entry.uuid && clipboard.mode==='cut'}
          role="row" tabindex="0"
          on:click|stopPropagation={() => select(entry.uuid)}
          on:dblclick|stopPropagation={() => startRename(entry.uuid)}
          on:contextmenu|stopPropagation={(e) => openCtx(e, entry.uuid)}
          on:keydown={(e) => { if (e.key==='Enter') startRename(entry.uuid); }}
        >
          <!-- Thumbnail or icon -->
          <span class="col-icon">
            {#if thumbUrls[entry.uuid]}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <img class="thumb-sm" src={thumbUrls[entry.uuid]} alt="" style="cursor:zoom-in" on:click|stopPropagation={() => openFileLightbox(entry)} />
            {:else}
              {TYPE_ICONS[entry.type]??'📎'}
            {/if}
          </span>

          <span class="col-name">
            {#if renamingId===entry.uuid}
              <input bind:this={renameInput} class="rename-input" bind:value={renameValue}
                on:blur={commitRename}
                on:keydown={(e)=>{if(e.key==='Enter')commitRename();if(e.key==='Escape')cancelRename();}}
                on:click|stopPropagation />
            {:else}
              <span class="col-name-inner">
                <span class="filename">{displayFilename(entry)}</span>
                {#if isContentOnly && matchSnippet(entry, search)}
                  <span class="content-match-hint">↳ "{matchSnippet(entry, search)}"</span>
                {:else if entry.preview && !isContentOnly}
                  <span class="preview-hint">— {entry.preview}</span>
                {/if}
              </span>
            {/if}
          </span>

          <span class="col-folders">
            {#each (entry.usedBy||[]) as folder}
              <span class="folder-chip" class:current={folder===currentSaveName}>{folder}</span>
            {/each}
          </span>

          <span class="col-type">{entry.type??'—'}</span>
          <span class="col-date">{formatDate(entry.createdAt)}</span>
        </div>
      {/each}
    </div>

  {:else}
    <!-- ── Grid / icon view ── -->
    <div class="icon-grid">
      {#each filtered as entry (entry.uuid)}
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <div
          class="icon-card"
          class:selected={selectedId===entry.uuid}
          class:cut={clipboard?.uuid===entry.uuid && clipboard.mode==='cut'}
          role="gridcell" tabindex="0"
          on:click|stopPropagation={() => select(entry.uuid)}
          on:dblclick|stopPropagation={() => startRename(entry.uuid)}
          on:contextmenu|stopPropagation={(e) => openCtx(e, entry.uuid)}
          on:keydown={(e)=>{ if(e.key==='Enter') startRename(entry.uuid); }}
        >
          <div class="icon-thumb-area">
            {#if thumbUrls[entry.uuid]}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <img class="thumb-lg" src={thumbUrls[entry.uuid]} alt={entry.displayName} style="cursor:zoom-in" on:click|stopPropagation={() => openFileLightbox(entry)} />
            {:else}
              <span class="thumb-emoji">{TYPE_ICONS[entry.type]??'📎'}</span>
            {/if}
          </div>

          <div class="icon-label">
            {#if renamingId===entry.uuid}
              <input bind:this={renameInput} class="rename-input rename-input-grid"
                bind:value={renameValue}
                on:blur={commitRename}
                on:keydown={(e)=>{if(e.key==='Enter')commitRename();if(e.key==='Escape')cancelRename();}}
                on:click|stopPropagation />
            {:else}
              <span class="icon-name">{displayFilename(entry)}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Context menu -->
  {#if ctxMenu}
    {@const ctxEntry = entries.find(e => e.uuid===ctxMenu.uuid)}
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="ctx-menu" style="left:{ctxMenu.x}px;top:{ctxMenu.y}px" on:click|stopPropagation>
      {#if currentSaveName && ctxEntry && SHAREABLE.has(ctxEntry.type)}
        <button class="ctx-item ctx-add" on:click={() => addToFolder(ctxEntry.uuid, ctxEntry)}>
          {addingId===ctxEntry.uuid ? '✓ Added' : `+ Add to "${currentSaveName}"`}
        </button>
        <div class="ctx-sep"></div>
      {/if}
      <button class="ctx-item" on:click={() => { closeCtx(); startRename(ctxMenu.uuid); }}>
        Rename <kbd>F2</kbd>
      </button>
      <div class="ctx-sep"></div>
      <button class="ctx-item" on:click={() => copyFile(ctxMenu.uuid)}>Copy <kbd>Ctrl+C</kbd></button>
      <button class="ctx-item" on:click={() => cutFile(ctxMenu.uuid)}>Cut <kbd>Ctrl+X</kbd></button>
      {#if clipboard && currentSaveName}
        <button class="ctx-item" on:click={pasteFile}>Paste here <kbd>Ctrl+V</kbd></button>
      {/if}
      <div class="ctx-sep"></div>
      <button class="ctx-item ctx-delete" on:click={() => deleteFile(ctxMenu.uuid)}>
        Delete <kbd>Del</kbd>
      </button>
    </div>
  {/if}
</div>

{#if lbOpen}
  <Lightbox images={lbImages} startIndex={lbStart} on:close={() => lbOpen = false} />
{/if}

<style>
  .explorer {
    position: fixed;
    inset: var(--controls-height, 56px) 0 0 0;
    background: var(--bg, #101010);
    color: var(--text, #f5f5f5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: 0.88rem;
    user-select: none;
  }

  /* ── Toolbar ─────────────────────────────────────────────────── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .title { font-weight: 600; font-size: 0.95rem; flex-shrink: 0; }
  .search {
    flex: 1; min-width: 160px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text);
    border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 0.85rem;
    outline: none;
  }
  .search::placeholder { color: color-mix(in srgb, var(--text) 40%, transparent); }

  .view-btns { display: flex; gap: 2px; flex-shrink: 0; }
  .vbtn {
    background: none;
    border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
    color: color-mix(in srgb, var(--text) 55%, transparent);
    border-radius: 5px;
    width: 28px; height: 26px;
    font-size: 1rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .vbtn:hover { color: var(--text); }
  .vbtn.active {
    background: color-mix(in srgb, var(--text) 14%, transparent);
    color: var(--text);
    border-color: color-mix(in srgb, var(--text) 35%, transparent);
  }

  .thumb-slider {
    display: flex; align-items: center; gap: 5px;
    flex-shrink: 0; cursor: pointer;
    font-size: 0.9rem;
    color: color-mix(in srgb, var(--text) 65%, transparent);
  }
  .thumb-slider input[type="range"] {
    width: min(90px, 13vw);
    accent-color: var(--text, #f5f5f5);
    cursor: pointer;
    vertical-align: middle;
  }

  .clipboard-badge {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.78rem;
    padding: 3px 8px;
    background: color-mix(in srgb, var(--text) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--text) 20%, transparent);
    border-radius: 6px;
    opacity: 0.85;
  }
  .paste-btn {
    background: none; border: none; color: var(--text);
    cursor: pointer; padding: 0 3px; font-size: 0.78rem; opacity: 0.7;
  }
  .paste-btn:hover { opacity: 1; }

  /* ── List view ───────────────────────────────────────────────── */
  .header-row {
    display: grid;
    grid-template-columns: var(--lc, 54px) 1fr 180px 80px 110px;
    align-items: center;
    padding: 4px 16px 4px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
    flex-shrink: 0;
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--text) 60%, transparent);
  }
  .col-sortable {
    background: none; border: none; color: inherit;
    cursor: pointer; text-align: left; padding: 0; font-size: inherit;
  }
  .col-sortable:hover, .col-sortable.active { color: var(--text); }

  .file-list { flex: 1; overflow-y: auto; padding: 2px 0; }

  .file-row {
    display: grid;
    grid-template-columns: var(--lc, 54px) 1fr 180px 80px 110px;
    align-items: center;
    padding: 0 16px 0 12px;
    height: var(--rh, 54px);
    cursor: default;
    border-radius: 4px;
    margin: 1px 8px;
    transition: background 0.08s;
  }
  .file-row:hover  { background: color-mix(in srgb, var(--text) 7%, transparent); }
  .file-row.selected { background: color-mix(in srgb, var(--text) 13%, transparent); }
  .file-row.cut { opacity: 0.4; }

  .col-icon {
    display: flex; align-items: center; justify-content: center;
    font-size: 1.3rem; width: var(--lc, 54px); height: var(--rh, 54px);
  }
  .thumb-sm {
    width: var(--lt, 42px); height: var(--lt, 42px);
    object-fit: cover; border-radius: 4px;
    display: block;
  }

  .col-name {
    overflow: hidden; min-width: 0;
    display: flex; align-items: center;
  }
  .col-name-inner {
    display: flex; flex-direction: column;
    gap: 1px; overflow: hidden; min-width: 0;
  }
  .filename {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-weight: 500;
  }
  .preview-hint {
    font-size: 0.73rem; opacity: 0.4;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .content-match-hint {
    font-size: 0.73rem;
    color: color-mix(in srgb, var(--text) 55%, #6ea4ff 45%);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-style: italic;
  }

  .col-folders {
    display: flex; flex-wrap: wrap; gap: 3px; overflow: hidden;
  }
  .folder-chip {
    font-size: 0.71rem; padding: 1px 6px;
    background: color-mix(in srgb, var(--text) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
    border-radius: 8px; white-space: nowrap; opacity: 0.65;
  }
  .folder-chip.current { opacity: 1; border-color: color-mix(in srgb, var(--text) 40%, transparent); }
  .col-type { color: color-mix(in srgb, var(--text) 55%, transparent); font-size: 0.80rem; text-transform: capitalize; }
  .col-date { color: color-mix(in srgb, var(--text) 55%, transparent); font-size: 0.80rem; }

  .rename-input {
    background: color-mix(in srgb, var(--text) 10%, transparent);
    color: var(--text);
    border: 1px solid color-mix(in srgb, var(--text) 40%, transparent);
    border-radius: 4px; padding: 1px 6px;
    font-size: 0.88rem; font-weight: 500;
    width: 100%; outline: none; box-sizing: border-box;
  }

  /* ── Grid / icon view ────────────────────────────────────────── */
  .icon-grid {
    flex: 1; overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--gmin, 192px), 1fr));
    gap: 6px;
    padding: 12px;
    align-content: start;
  }

  .icon-card {
    display: flex; flex-direction: column;
    border-radius: 8px;
    padding: 6px;
    cursor: default;
    transition: background 0.08s;
  }
  .icon-card:hover { background: color-mix(in srgb, var(--text) 7%, transparent); }
  .icon-card.selected { background: color-mix(in srgb, var(--text) 14%, transparent); }
  .icon-card.cut { opacity: 0.4; }

  .icon-thumb-area {
    width: 100%; aspect-ratio: 4/3;
    background: color-mix(in srgb, var(--text) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .thumb-lg {
    width: 100%; height: 100%;
    object-fit: cover;
  }
  .thumb-emoji { font-size: 2rem; opacity: 0.45; }

  .icon-label { margin-top: 5px; padding: 0 2px; }
  .icon-name {
    font-size: 0.78rem; font-weight: 500;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }
  .rename-input-grid { font-size: 0.78rem; }

  /* ── Context menu ────────────────────────────────────────────── */
  .ctx-menu {
    position: fixed; z-index: 3000;
    min-width: 210px;
    background: color-mix(in srgb, var(--bg) 95%, white 5%);
    border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
    border-radius: 8px; padding: 4px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .ctx-item {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; background: none; border: none; color: var(--text);
    padding: 7px 12px; font-size: 0.86rem; text-align: left;
    cursor: pointer; border-radius: 5px; gap: 16px;
  }
  .ctx-item:hover { background: color-mix(in srgb, var(--text) 10%, transparent); }
  .ctx-item.ctx-add { font-weight: 600; }
  .ctx-item.ctx-delete { color: #f87171; }
  .ctx-item.ctx-delete:hover { background: color-mix(in srgb, #f87171 12%, transparent); }
  .ctx-sep { height: 1px; background: color-mix(in srgb, var(--text) 12%, transparent); margin: 3px 8px; }
  kbd { font-size: 0.72rem; opacity: 0.45; font-family: monospace; margin-left: auto; }

  .empty {
    flex: 1; display: flex; align-items: center; justify-content: center;
    opacity: 0.4; font-size: 0.9rem;
  }

  @media (max-width: 640px) {
    .header-row, .file-row { grid-template-columns: var(--lc, 54px) 1fr 70px 80px; }
    .col-folders { display: none; }
    .icon-grid { grid-template-columns: repeat(auto-fill, minmax(max(80px, calc(var(--gmin, 192px) * 0.75)), 1fr)); }
  }
</style>
