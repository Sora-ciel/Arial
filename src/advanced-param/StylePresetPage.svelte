<script>
  import { createEventDispatcher } from 'svelte';

  export let themes = [];
  export let selectedThemeId = 'default-dark';

  const dispatch = createEventDispatcher();

  function toCssVarName(key) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();
  }

  function buildPreviewStyle(theme) {
    const entries = Object.entries(theme?.blockTheme || {});
    const blockVars = entries
      .map(([key, value]) => `--block-${toCssVarName(key)}: ${value}`)
      .join('; ');
    const previewBg = theme?.previewBg ?? 'rgba(20, 20, 24, 0.8)';
    const previewText = theme?.blockTheme?.headerText ?? '#ffffff';
    return `${blockVars}; --bg: ${previewBg}; --text: ${previewText};`;
  }

  function applyTheme(theme) {
    if (!theme?.id) return;
    dispatch('selectTheme', { id: theme.id });
  }
</script>

<style>
  .preset-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .preset-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid var(--right-border-color, #444444);
    background: rgba(255, 255, 255, 0.04);
    text-align: left;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .preset-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.32);
  }

  .preset-card.active {
    border-color: var(--right-button-text, #ffffff);
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.4);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .header-meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--right-button-text, #ffffff);
    color: var(--right-panel-bg, #222222);
    font-size: 0.7rem;
    text-transform: uppercase;
  }

  .tag {
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    color: var(--right-button-text, #ffffff);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .card-preview {
    border-radius: var(--block-border-radius, 12px);
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.22));
    box-shadow: var(--block-shadow, 0 12px 32px rgba(0, 0, 0, 0.4));
    overflow: hidden;
    background: var(--bg, rgba(10, 10, 10, 0.55));
  }

  .card-preview .preview-header {
    background: var(--block-header-bg, rgba(28, 28, 28, 0.85));
    color: var(--block-header-text, #ffffff);
    font-family: var(--block-header-font, 'Inter', sans-serif);
    letter-spacing: var(--block-header-letter-spacing, 0.08em);
    text-transform: var(--block-header-transform, uppercase);
    font-size: 0.65rem;
    padding: 6px 10px;
  }

  .card-preview .preview-body {
    font-family: var(--block-body-font, 'Inter', sans-serif);
    color: var(--block-header-text, #ffffff);
    padding: 12px 10px 16px;
    font-size: 0.78rem;
    opacity: 0.9;
  }

  .card-swatches {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .swatch {
    width: 26px;
    height: 18px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .card-description {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.3;
    opacity: 0.75;
  }

  .custom-note {
    margin-top: 10px;
    font-size: 0.75rem;
    opacity: 0.7;
    text-align: center;
  }
</style>

<div class="preset-grid">
  {#each themes as theme (theme.id)}
    <button
      type="button"
      class="preset-card"
      class:active={selectedThemeId === theme.id}
      style={buildPreviewStyle(theme)}
      on:click={() => applyTheme(theme)}
    >
      <div class="card-header">
        <span>{theme.name}</span>
        <div class="header-meta">
          {#if theme.isCustom}
            <span class="tag">Custom</span>
          {/if}
          {#if selectedThemeId === theme.id}
            <span class="badge">Active</span>
          {/if}
        </div>
      </div>

      <div class="card-preview">
        <div class="preview-header">Sample Header</div>
        <div class="preview-body">Aa · 123 · Lorem</div>
      </div>

      <div class="card-swatches">
        <div
          class="swatch"
          title="Left controls"
          style={`background:${theme?.controlColors?.left?.panelBg ?? '#222222'};`}
        ></div>
        <div
          class="swatch"
          title="Right controls"
          style={`background:${theme?.controlColors?.right?.panelBg ?? '#222222'};`}
        ></div>
        <div
          class="swatch"
          title="Canvas"
          style={`background:${theme?.controlColors?.canvas?.innerBg ?? '#000000'};`}
        ></div>
      </div>

      <p class="card-description">{theme.description}</p>
    </button>
  {/each}
</div>

{#if selectedThemeId === 'custom'}
  <p class="custom-note">
    Using a custom style — choose a preset above to replace it.
  </p>
{/if}
