<script>
  import { createEventDispatcher } from 'svelte';
  import {
    CONTROL_COLOR_DEFAULTS,
    BLOCK_THEME_DEFAULTS,
    DEFAULT_PREVIEW_BG,
    normalizeControlColors,
    normalizeBlockTheme
  } from '../utils/themeDefaults.js';

  const dispatch = createEventDispatcher();

  export let controlColors = CONTROL_COLOR_DEFAULTS;
  export let blockTheme = BLOCK_THEME_DEFAULTS;
  export let previewBg = DEFAULT_PREVIEW_BG;

  let workingControlColors = normalizeControlColors(controlColors);
  let workingBlockTheme = normalizeBlockTheme(blockTheme);
  let localPreviewBg = previewBg || DEFAULT_PREVIEW_BG;
  let themeName = '';
  let themeDescription = '';
  let error = '';

  let lastControlColorsRef = controlColors;
  let lastBlockThemeRef = blockTheme;
  let lastPreviewBg = previewBg;

  $: if (controlColors && controlColors !== lastControlColorsRef) {
    workingControlColors = normalizeControlColors(controlColors);
    lastControlColorsRef = controlColors;
  }

  $: if (blockTheme && blockTheme !== lastBlockThemeRef) {
    workingBlockTheme = normalizeBlockTheme(blockTheme);
    lastBlockThemeRef = blockTheme;
  }

  $: if (previewBg !== lastPreviewBg && typeof previewBg === 'string') {
    localPreviewBg = previewBg || DEFAULT_PREVIEW_BG;
    lastPreviewBg = previewBg;
  }

  const controlFieldMap = [
    { key: 'panelBg', label: 'Panel background' },
    { key: 'textColor', label: 'Text color' },
    { key: 'buttonBg', label: 'Button background' },
    { key: 'buttonText', label: 'Button text' },
    { key: 'borderColor', label: 'Border color' }
  ];

  const canvasFields = [
    { key: 'outerBg', label: 'Canvas background' },
    { key: 'innerBg', label: 'Canvas inner area' }
  ];

  const controlSections = [
    {
      key: 'left',
      label: 'Left controls',
      description: 'Customize the toolbar shown on the left side of the canvas.',
      fields: controlFieldMap
    },
    {
      key: 'right',
      label: 'Right controls',
      description: 'Adjust the dropdown that appears on the right.',
      fields: controlFieldMap
    },
    {
      key: 'canvas',
      label: 'Canvas',
      description: 'Tune the canvas background layers.',
      fields: canvasFields
    }
  ];

  const blockFieldGroups = [
    {
      title: 'Block frame',
      description: 'Border, radius and shadows for your blocks.',
      fields: [
        { key: 'borderColor', label: 'Border color' },
        { key: 'borderWidth', label: 'Border width' },
        { key: 'borderRadius', label: 'Corner radius' },
        { key: 'shadow', label: 'Drop shadow', type: 'textarea' }
      ]
    },
    {
      title: 'Focus state',
      description: 'Highlighting when a block is focused.',
      fields: [
        { key: 'focusOutline', label: 'Focus outline' },
        { key: 'focusShadow', label: 'Focus shadow', type: 'textarea' }
      ]
    },
    {
      title: 'Header styling',
      description: 'Typography and background for block headers.',
      fields: [
        { key: 'headerBg', label: 'Header background' },
        { key: 'headerText', label: 'Header text color' },
        { key: 'headerFont', label: 'Header font family' },
        { key: 'headerLetterSpacing', label: 'Letter spacing' },
        { key: 'headerTransform', label: 'Text transform' }
      ]
    },
    {
      title: 'Body & accent',
      description: 'Body font and accent colors for buttons.',
      fields: [
        { key: 'bodyFont', label: 'Body font family' },
        { key: 'accentColor', label: 'Accent color' },
        { key: 'accentText', label: 'Accent text color' }
      ]
    },
    {
      title: 'Media controls',
      description: 'Fine tune the inline media controls.',
      fields: [
        { key: 'controlRadius', label: 'Control corner radius' },
        { key: 'mediaButtonBg', label: 'Media button background' },
        { key: 'mediaButtonText', label: 'Media button text' }
      ]
    }
  ];

  function toCssVarName(key) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();
  }

  $: previewStyle = Object.entries(workingBlockTheme || {})
    .map(([key, value]) => `--block-${toCssVarName(key)}: ${value}`)
    .join('; ');

  function updateControlColor(section, key, value) {
    workingControlColors = {
      ...workingControlColors,
      [section]: {
        ...workingControlColors[section],
        [key]: value
      }
    };
    dispatch('updateControlColor', { section, side: section, key, value });
  }

  function updateBlockField(key, value) {
    workingBlockTheme = {
      ...workingBlockTheme,
      [key]: value
    };
    dispatch('updateBlockTheme', { key, value });
  }

  function handlePreviewChange(value) {
    localPreviewBg = value || DEFAULT_PREVIEW_BG;
    dispatch('updatePreviewBg', { value: localPreviewBg });
  }

  function handleSaveTheme() {
    const trimmedName = themeName.trim();
    if (!trimmedName) {
      error = 'Give your theme a name before saving it.';
      return;
    }

    error = '';
    dispatch('saveTheme', {
      name: trimmedName,
      description: themeDescription.trim(),
      controlColors: workingControlColors,
      blockTheme: workingBlockTheme,
      previewBg: localPreviewBg
    });
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(4, 6, 12, 0.86);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: min(6vh, 64px) 24px 24px;
    z-index: 1200;
    overflow-y: auto;
  }

  .panel {
    width: min(1100px, 100%);
    background: rgba(18, 20, 28, 0.96);
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 32px 120px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 28px;
    color: #f5f7ff;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.4rem;
    letter-spacing: 0.04em;
  }

  .panel-header p {
    margin: 4px 0 0;
    opacity: 0.75;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    color: inherit;
    padding: 6px 14px;
    cursor: pointer;
  }

  .content-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 0.9fr;
    gap: 24px;
  }

  .section-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-card h3 {
    margin: 0;
    font-size: 1rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .section-card p {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.4;
    opacity: 0.7;
  }

  .field-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field-list h4 {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.85rem;
    letter-spacing: 0.03em;
  }

  label span {
    opacity: 0.75;
  }

  input[type="color"],
  input[type="text"],
  textarea {
    background: rgba(10, 12, 18, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: inherit;
    padding: 10px;
    font-family: inherit;
    font-size: 0.85rem;
  }

  input[type="color"] {
    width: 52px;
    height: 36px;
    padding: 0;
  }

  textarea {
    min-height: 70px;
    resize: vertical;
  }

  .preview-card {
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 18px;
    background: rgba(255, 255, 255, 0.02);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .preview-box {
    border-radius: var(--block-border-radius, 16px);
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.15));
    box-shadow: var(--block-shadow, 0 18px 45px rgba(0, 0, 0, 0.45));
    background: var(--preview-bg, rgba(12, 14, 18, 0.86));
    overflow: hidden;
  }

  .preview-header {
    background: var(--block-header-bg, rgba(18, 18, 24, 0.88));
    color: var(--block-header-text, #ffffff);
    font-family: var(--block-header-font, 'Inter', sans-serif);
    letter-spacing: var(--block-header-letter-spacing, 0.08em);
    text-transform: var(--block-header-transform, uppercase);
    padding: 10px 16px;
    font-size: 0.85rem;
  }

  .preview-body {
    padding: 16px;
    color: var(--block-header-text, #ffffff);
    font-family: var(--block-body-font, 'Inter', sans-serif);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .preview-actions {
    display: flex;
    gap: 10px;
  }

  .preview-button {
    border-radius: var(--block-control-radius, 10px);
    background: var(--block-media-button-bg, rgba(255, 255, 255, 0.08));
    color: var(--block-media-button-text, #ffffff);
    padding: 10px 14px;
    font-size: 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .preview-accent {
    background: var(--block-accent-color, #ff5f5f);
    color: var(--block-accent-text, #ffffff);
    padding: 12px 16px;
    border-radius: var(--block-control-radius, 10px);
    text-align: center;
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .preview-input {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .theme-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .meta-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 8px;
    grid-column: 1 / -1;
  }

  .primary-btn {
    background: #5b8bff;
    color: #0b101a;
    border: none;
    border-radius: 999px;
    padding: 10px 22px;
    font-weight: 600;
    letter-spacing: 0.06em;
    cursor: pointer;
  }

  .ghost-btn {
    background: transparent;
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    padding: 10px 22px;
    cursor: pointer;
  }

  .error {
    margin-top: 4px;
    font-size: 0.8rem;
    color: #ff9b9b;
  }

  @media (max-width: 980px) {
    .content-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .panel {
      padding: 20px 16px;
    }
  }
</style>

<div class="overlay">
  <div class="panel">
    <div class="panel-header">
      <div>
        <h2>Advanced CSS theme builder</h2>
        <p>Create bespoke control palettes and block styling, then save them as reusable themes.</p>
      </div>
      <button class="close-btn" type="button" on:click={handleClose}>Close</button>
    </div>

    <div class="content-grid">
      <div class="section-card">
        <h3>Control colors</h3>
        <p>Pick colors for each surface of the UI. The changes apply live so you can preview immediately.</p>

        {#each controlSections as section}
          <div class="field-list">
            <h4>{section.label}</h4>
            <p>{section.description}</p>
            {#each section.fields as field}
              <label>
                <span>{field.label}</span>
                <input
                  type="color"
                  value={workingControlColors[section.key]?.[field.key] || CONTROL_COLOR_DEFAULTS[section.key]?.[field.key]}
                  on:input={(event) =>
                    updateControlColor(section.key, field.key, event.target.value)}
                />
              </label>
            {/each}
          </div>
        {/each}
      </div>

      <div class="section-card">
        <h3>Block styling</h3>
        <p>Fine tune typography, shadows and accents for the blocks rendered on the canvas.</p>

        {#each blockFieldGroups as group}
          <div class="field-list">
            <h4>{group.title}</h4>
            <p>{group.description}</p>
            {#each group.fields as field}
              <label>
                <span>{field.label}</span>
                {#if field.type === 'textarea'}
                  <textarea
                    on:input={(event) => updateBlockField(field.key, event.target.value)}
                  >{workingBlockTheme[field.key] ?? BLOCK_THEME_DEFAULTS[field.key] ?? ''}</textarea>
                {:else}
                  <input
                    type="text"
                    value={workingBlockTheme[field.key] ?? BLOCK_THEME_DEFAULTS[field.key] ?? ''}
                    on:input={(event) => updateBlockField(field.key, event.target.value)}
                  />
                {/if}
              </label>
            {/each}
          </div>
        {/each}
      </div>

      <div class="section-card preview-card">
        <div
          class="preview-box"
          style={`--preview-bg: ${localPreviewBg}; ${previewStyle}`}
        >
          <div class="preview-header">Preview header</div>
          <div class="preview-body">
            <div>Lorem ipsum dolor sit amet, consectetur.</div>
            <div class="preview-actions">
              <span class="preview-button">Play</span>
              <span class="preview-button">Pause</span>
            </div>
            <div class="preview-accent">Accent action</div>
          </div>
        </div>

        <div class="preview-input">
          <span>Preview background</span>
          <input
            type="color"
            value={localPreviewBg}
            on:input={(event) => handlePreviewChange(event.target.value)}
          />
          <input
            type="text"
            value={localPreviewBg}
            on:input={(event) => handlePreviewChange(event.target.value)}
          />
        </div>
      </div>
    </div>

    <form class="theme-meta" on:submit|preventDefault={handleSaveTheme}>
      <label>
        <span>Theme name</span>
        <input
          type="text"
          placeholder="e.g. Midnight Neon"
          bind:value={themeName}
        />
        {#if error}
          <span class="error">{error}</span>
        {/if}
      </label>

      <label>
        <span>Description (optional)</span>
        <input
          type="text"
          placeholder="Short description of the vibe"
          bind:value={themeDescription}
        />
      </label>

      <div class="meta-actions">
        <button class="ghost-btn" type="button" on:click={handleClose}>Cancel</button>
        <button class="primary-btn" type="submit">Save theme</button>
      </div>
    </form>
  </div>
</div>
