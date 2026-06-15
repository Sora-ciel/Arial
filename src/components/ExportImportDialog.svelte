<script>
  import { createEventDispatcher } from 'svelte';
  import { exportBundle, importBundle, listSavedBlocks } from '../storage.js';

  export let savedList = [];
  export let currentSaveName = '';
  export let controlColors = {};

  const dispatch = createEventDispatcher();

  // ---- Theming ----
  $: panelBg = controlColors?.left?.panelBg || '#181818';
  $: textColor = controlColors?.left?.textColor || '#f5f5f5';
  $: buttonBg = controlColors?.left?.buttonBg || '#222';
  $: borderColor = controlColors?.left?.borderColor || '#333';

  // ---- State ----
  let tab = 'export'; // 'export' | 'import'

  // Export state
  let exportSave = currentSaveName || savedList[0] || '';
  let exportSections = { layout: true, content: true, settings: false };
  let exporting = false;
  let exportError = '';

  // Import state
  let importFile = null;
  let importBundle_ = null;
  let importSave = currentSaveName || savedList[0] || '';
  let importSections = { layout: true, content: true, settings: false };
  let importing = false;
  let importError = '';
  let importSuccess = false;

  $: if (currentSaveName) {
    exportSave = currentSaveName;
    importSave = currentSaveName;
  }

  // ---- Export ----
  async function doExport() {
    const sections = Object.entries(exportSections)
      .filter(([, v]) => v).map(([k]) => k);
    if (!sections.length) { exportError = 'Select at least one section.'; return; }
    if (!exportSave) { exportError = 'Select a save to export.'; return; }
    exporting = true;
    exportError = '';
    try {
      const bundle = await exportBundle(exportSave, sections);
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportSave}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      exportError = String(e);
    } finally {
      exporting = false;
    }
  }

  // ---- Import ----
  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    importFile = file;
    importBundle_ = null;
    importError = '';
    importSuccess = false;

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed?._codex_bundle) {
          // Legacy plain JSON — wrap it so we can still import
          importBundle_ = {
            _codex_bundle: true,
            version: 0,
            saveName: file.name.replace(/\.(json|codex)$/, ''),
            sections: ['layout'],
            layout: parsed
          };
        } else {
          importBundle_ = parsed;
        }
        importSave = importSave || importBundle_.saveName || '';
        importSections = {
          layout: importBundle_.sections?.includes('layout') ?? false,
          content: importBundle_.sections?.includes('content') ?? false,
          settings: importBundle_.sections?.includes('settings') ?? false
        };
      } catch {
        importError = 'Could not parse file.';
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function doImport() {
    const sections = Object.entries(importSections)
      .filter(([, v]) => v).map(([k]) => k);
    if (!sections.length) { importError = 'Select at least one section.'; return; }
    if (!importSave) { importError = 'Choose a save to import into.'; return; }
    if (!importBundle_) { importError = 'Load a file first.'; return; }

    importing = true;
    importError = '';
    importSuccess = false;
    try {
      await importBundle(importBundle_, { saveName: importSave, sections });
      importSuccess = true;
      dispatch('imported', { saveName: importSave, sections });
    } catch (e) {
      importError = String(e);
    } finally {
      importing = false;
    }
  }

  function bundleInfo(b) {
    if (!b) return null;
    const date = b.exportedAt ? new Date(b.exportedAt).toLocaleString() : null;
    const blockCount = b.layout?.blocks?.length ?? null;
    const fileCount = b.content ? Object.keys(b.content.files || {}).length : null;
    return { date, blockCount, fileCount, from: b.saveName, legacy: b.version === 0 };
  }
  $: info = bundleInfo(importBundle_);
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  on:click|self={() => dispatch('close')}
>
  <div
    class="dialog"
    style="
      --bg: {panelBg};
      --text: {textColor};
      --btn: {buttonBg};
      --border: {borderColor};
    "
  >
    <div class="header">
      <div class="tabs">
        <button class="tab" class:active={tab === 'export'} on:click={() => tab = 'export'}>Export</button>
        <button class="tab" class:active={tab === 'import'} on:click={() => tab = 'import'}>Import</button>
      </div>
      <button class="close-btn" on:click={() => dispatch('close')}>✕</button>
    </div>

    <!-- EXPORT -->
    {#if tab === 'export'}
      <div class="body">
        <p class="field-label">Save to export</p>
        <select class="select" bind:value={exportSave}>
          {#each savedList as name}
            <option value={name}>{name}</option>
          {/each}
        </select>

        <p class="field-label" style="margin-top:14px">What to include</p>
        <div class="checks">
          <label class="check-row">
            <input type="checkbox" bind:checked={exportSections.layout} />
            <span>
              <strong>Layout</strong>
              <small>Block positions, colors, mode order</small>
            </span>
          </label>
          <label class="check-row">
            <input type="checkbox" bind:checked={exportSections.content} />
            <span>
              <strong>Content files</strong>
              <small>Text, images, videos</small>
            </span>
          </label>
          <label class="check-row">
            <input type="checkbox" bind:checked={exportSections.settings} />
            <span>
              <strong>App settings</strong>
              <small>Theme, colors, preferences</small>
            </span>
          </label>
        </div>

        {#if exportError}
          <p class="error">{exportError}</p>
        {/if}

        <button class="action-btn" on:click={doExport} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Download .json file'}
        </button>
      </div>
    {/if}

    <!-- IMPORT -->
    {#if tab === 'import'}
      <div class="body">
        <p class="field-label">Select a .codex or .json file</p>
        <label class="file-picker">
          <input type="file" accept=".json" on:change={onFileChange} />
          {importFile ? importFile.name : 'Choose file…'}
        </label>

        {#if info}
          <div class="bundle-info">
            {#if info.legacy}
              <span class="badge legacy">Legacy JSON</span>
            {:else}
              <span class="badge">Codex bundle</span>
            {/if}
            {#if info.from}<span>From: <strong>{info.from}</strong></span>{/if}
            {#if info.date}<span>Exported: {info.date}</span>{/if}
            {#if info.blockCount !== null}<span>{info.blockCount} blocks</span>{/if}
            {#if info.fileCount !== null}<span>{info.fileCount} content files</span>{/if}
          </div>

          <p class="field-label" style="margin-top:14px">Import into</p>
          <div class="save-row">
            <select class="select" bind:value={importSave} style="flex:1">
              {#each savedList as name}
                <option value={name}>{name}</option>
              {/each}
            </select>
          </div>

          <p class="field-label" style="margin-top:14px">What to apply</p>
          <div class="checks">
            <label class="check-row" class:disabled={!importBundle_?.layout}>
              <input type="checkbox" bind:checked={importSections.layout}
                disabled={!importBundle_?.layout} />
              <span>
                <strong>Layout</strong>
                <small>{importBundle_?.layout ? `${importBundle_.layout.blocks?.length ?? 0} blocks` : 'not in this file'}</small>
              </span>
            </label>
            <label class="check-row" class:disabled={!importBundle_?.content}>
              <input type="checkbox" bind:checked={importSections.content}
                disabled={!importBundle_?.content} />
              <span>
                <strong>Content files</strong>
                <small>{importBundle_?.content ? `${Object.keys(importBundle_.content.files || {}).length} files` : 'not in this file'}</small>
              </span>
            </label>
            <label class="check-row" class:disabled={!importBundle_?.settings}>
              <input type="checkbox" bind:checked={importSections.settings}
                disabled={!importBundle_?.settings} />
              <span>
                <strong>App settings</strong>
                <small>{importBundle_?.settings ? 'included' : 'not in this file'}</small>
              </span>
            </label>
          </div>

          {#if importError}
            <p class="error">{importError}</p>
          {/if}
          {#if importSuccess}
            <p class="success">Imported successfully! Reload the save to see changes.</p>
          {/if}

          <button class="action-btn" on:click={doImport} disabled={importing}>
            {importing ? 'Importing…' : 'Import'}
          </button>
        {:else if importError}
          <p class="error">{importError}</p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .dialog {
    background: var(--bg, #181818);
    color: var(--text, #f5f5f5);
    border: 1px solid var(--border, #333);
    border-radius: 14px;
    width: min(480px, 94vw);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .header {
    display: flex;
    align-items: center;
    padding: 14px 16px 0;
    gap: 8px;
  }

  .tabs {
    display: flex;
    gap: 4px;
    flex: 1;
  }

  .tab {
    background: none;
    border: none;
    color: color-mix(in srgb, var(--text) 55%, transparent);
    font-size: 0.95rem;
    font-weight: 600;
    padding: 6px 14px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    border-radius: 6px 6px 0 0;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab.active {
    color: var(--text);
    border-bottom-color: var(--text);
  }

  .close-btn {
    background: none;
    border: none;
    color: color-mix(in srgb, var(--text) 50%, transparent);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
  }

  .close-btn:hover { color: var(--text); }

  .body {
    padding: 18px 18px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    font-size: 0.78rem;
    opacity: 0.6;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .select {
    background: color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 0.9rem;
    width: 100%;
    outline: none;
  }

  .save-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .checks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .check-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.12s;
  }

  .check-row:hover:not(.disabled) {
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }

  .check-row.disabled {
    opacity: 0.4;
    cursor: default;
  }

  .check-row input[type="checkbox"] {
    margin-top: 2px;
    flex-shrink: 0;
  }

  .check-row span {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .check-row strong {
    font-size: 0.88rem;
  }

  .check-row small {
    font-size: 0.77rem;
    opacity: 0.55;
  }

  .file-picker {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    background: color-mix(in srgb, var(--text) 6%, transparent);
    border: 1px dashed color-mix(in srgb, var(--text) 25%, transparent);
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.88rem;
    opacity: 0.8;
    transition: opacity 0.15s;
  }

  .file-picker:hover { opacity: 1; }

  .file-picker input { display: none; }

  .bundle-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--text) 5%, transparent);
    border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
    border-radius: 8px;
    font-size: 0.82rem;
    opacity: 0.85;
  }

  .badge {
    font-size: 0.72rem;
    background: color-mix(in srgb, var(--text) 18%, transparent);
    border-radius: 10px;
    padding: 2px 8px;
    font-weight: 600;
  }

  .badge.legacy {
    background: color-mix(in srgb, orange 35%, transparent);
  }

  .action-btn {
    margin-top: 6px;
    background: color-mix(in srgb, var(--text) 15%, transparent);
    color: var(--text);
    border: 1px solid color-mix(in srgb, var(--text) 28%, transparent);
    border-radius: 8px;
    padding: 10px 18px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .action-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 22%, transparent);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error {
    margin: 4px 0 0;
    font-size: 0.82rem;
    color: #f87171;
  }

  .success {
    margin: 4px 0 0;
    font-size: 0.82rem;
    color: #4ade80;
  }
</style>
