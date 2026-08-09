<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import TipTapEditor from '../components/TipTapEditor.svelte';
  import { htmlToText } from '../utils/htmlToText.js';

  const MOBILE_BREAKPOINT = 1024;

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  export let singleNoteSettings = {};

  const dispatch = createEventDispatcher();

  // Per-file background image settings — desktop and phone can each have
  // their own image, picked by the same breakpoint the toolbar uses.
  let isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;
  function updateViewport() {
    isMobileViewport = window.innerWidth <= MOBILE_BREAKPOINT;
  }
  onMount(() => {
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  });

  $: bgImage = (isMobileViewport ? singleNoteSettings?.backgroundImageMobile : singleNoteSettings?.backgroundImage) || '';
  $: bgOpacity = singleNoteSettings?.bgOpacity ?? 0.35;
  $: bgBlur = singleNoteSettings?.bgBlur ?? 0;
  $: bgSize = singleNoteSettings?.bgSize || 'cover';

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: modeTextColor = getReadableTextColor(canvasTheme.innerBg);
  $: activeNoteBg = noteBlock?.bgColor || canvasTheme.innerBg;
  $: activeNoteText = noteBlock?.textColor || getReadableTextColor(activeNoteBg);
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor}; --active-note-bg: ${activeNoteBg}; --active-note-text: ${activeNoteText};`;

  $: noteBlocks = blocks.filter(
    block => block.type === 'text' || block.type === 'cleantext'
  );
  let selectedNoteId = null;
  $: if (!selectedNoteId && noteBlocks.length) {
    selectedNoteId = noteBlocks[0].id;
  }
  $: if (!noteBlocks.length) {
    selectedNoteId = null;
  }
  $: if (
    selectedNoteId &&
    !noteBlocks.some(block => block.id === selectedNoteId)
  ) {
    selectedNoteId = noteBlocks[0]?.id ?? null;
  }
  $: noteBlock =
    noteBlocks.find(block => block.id === selectedNoteId) || null;
  $: noteContent = noteBlock?.content ?? '';
  $: notePlainText = htmlToText(noteContent);
  $: wordCount = countWords(notePlainText);
  $: characterCount = notePlainText.length;
  $: hasHiddenBlocks = blocks.some(
    block => block.type !== 'text' && block.type !== 'cleantext'
  );
  $: noteCount = noteBlocks.length;

  function countWords(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function updateBlock(id, updates, { pushToHistory, changedKeys } = {}) {
    const detail = { id, ...updates };
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length
      ? changedKeys
      : Object.keys(updates || {});

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }

  function deleteBlock(id) {
    dispatch('delete', { id });
  }

  function ensureFocus(id) {
    if (focusedBlockId !== id) {
      dispatch('focusToggle', { id });
    }
  }

  function focusScroll(el) {
    if (!el) return;
    if (window.innerWidth <= 1024) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }


  function getReadableTextColor(color) {
    if (!color) return '#f5f5f5';
    const parsed = parseColor(color);
    if (!parsed) return '#f5f5f5';
    const [r, g, b] = parsed;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#121212' : '#f5f5f5';
  }

  function parseColor(color) {
    const trimmed = color.trim();
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16)
        ];
      }
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
    }
    const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return [
        Number(rgbMatch[1]),
        Number(rgbMatch[2]),
        Number(rgbMatch[3])
      ];
    }
    return null;
  }

  function getNoteLabel(block, index) {
    const content = htmlToText(block?.content || '');
    const firstLine = content.split('\n')[0]?.trim();
    if (firstLine) {
      const trimmed = firstLine.length > 28 ? `${firstLine.slice(0, 28)}…` : firstLine;
      return trimmed;
    }
    return `Note ${index + 1}`;
  }

  function getTabStyle(block) {
    const bg = block?.bgColor || canvasTheme.outerBg;
    const text = block?.textColor || getReadableTextColor(bg);
    return `--tab-bg: ${bg}; --tab-text: ${text};`;
  }
</script>

<style>
  .single-note {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
    color: var(--mode-text-color, #ffffff);
    box-sizing: border-box;
    position: relative;
  }

  .note-tabs {
    display: flex;
    gap: 8px;
    padding: 4px 6px 4px;
    overflow-x: auto;
  }

  .note-tab {
    border: 1px solid color-mix(in srgb, var(--tab-text, #ffffff) 50%, transparent);
    background: color-mix(in srgb, var(--tab-bg, #000000) 88%, #000000 12%);
    color: var(--tab-text, inherit);
    padding: 6px 12px;
    border-radius: 9px;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .note-tab[aria-selected='true'] {
    border-color: var(--tab-text);
    background: var(--tab-bg, rgba(255, 255, 255, 0.12));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--tab-text, #ffffff) 55%, transparent);
  }

  .note-tab:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.7);
    outline-offset: 2px;
  }

  /* Per-file background image sitting behind the text */
  .note-bg-layer {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-position: center;
    background-repeat: no-repeat;
    pointer-events: none;
  }
  /* When a bg image is set, let it show through the note surfaces */
  .single-note.has-bg-image .note-meta,
  .single-note.has-bg-image .note-footer { background: transparent; }
  .single-note.has-bg-image :global(.tiptap-wrap) { background: transparent; }
  .single-note > .note-tabs,
  .single-note > .note-meta,
  .single-note > :global(.tiptap-wrap),
  .single-note > .note-footer { position: relative; z-index: 1; }

  .note-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    box-sizing: border-box;
    background: var(--active-note-bg);
    color: var(--active-note-text, inherit);
  }

  .note-stats {
    display: flex;
    gap: 12px;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
    color: inherit;
  }

  .note-stats span {
    background: transparent;
    padding: 0;
    border-radius: 0;
  }

  :global(.single-note .tiptap-wrap) {
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    font-family: Arial, Helvetica, sans-serif;
    font-size: 1.05rem;
    line-height: 1.6;
  }
  :global(.single-note .tiptap-inner) {
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    padding: 12px;
  }

  .note-footer {
    display: flex;
    justify-content: flex-end;
    padding: 6px 12px 10px;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
  }

  .note-footer button {
    background: transparent;
    border: none;
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    font-size: 1.1rem;
    cursor: pointer;
  }

  .note-warning {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
    background: transparent;
    padding: 8px 12px 16px;
    border-radius: 0;
    text-align: left;
  }

  .empty-state {
    border: 1px dashed rgba(255, 255, 255, 0.4);
    border-radius: 12px;
    padding: 16px;
    margin: 12px;
    text-align: left;
    color: rgba(255, 255, 255, 0.8);
  }
</style>

<div class="single-note" class:has-bg-image={bgImage} bind:this={canvasRef} style={canvasCssVars}>
  {#if bgImage}
    <div
      class="note-bg-layer"
      style="background-image:url('{bgImage}'); opacity:{bgOpacity}; filter:blur({bgBlur}px); background-size:{bgSize};"
    ></div>
  {/if}
  {#if noteBlock}
    {#if noteCount > 1}
      <div class="note-tabs" role="tablist" aria-label="Notes">
        {#each noteBlocks as block, index (block.id)}
          <button
            class="note-tab"
            role="tab"
            aria-selected={block.id === selectedNoteId}
            style={getTabStyle(block)}
            on:click={() => {
              selectedNoteId = block.id;
            }}
          >
            {getNoteLabel(block, index)}
          </button>
        {/each}
      </div>
    {/if}
    <div class="note-meta">
      <div class="note-stats">
        <span>Words: {wordCount}</span>
        <span>Characters: {characterCount}</span>
      </div>
    </div>
    {#key noteBlock.id}
      <TipTapEditor
        content={noteContent}
        placeholder="Write your note here..."
        on:change={(e) => {
          updateBlock(noteBlock.id, { content: e.detail }, { pushToHistory: false, changedKeys: ['content'] });
        }}
        on:focus={(e) => {
          focusScroll(e.detail?.target);
          ensureFocus(noteBlock.id);
        }}
      />
    {/key}

    <div class="note-footer">
      <button on:click={() => deleteBlock(noteBlock.id)} aria-label="Delete note">
        ×
      </button>
    </div>


  {:else}
    <div class="empty-state">
      No text note found yet. Add a text or clean text block to start a note
      file.
    </div>
  {/if}
</div>
