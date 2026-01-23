<script>
  import { createEventDispatcher, onMount } from 'svelte';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;

  const dispatch = createEventDispatcher();

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: modeTextColor = getReadableTextColor(canvasTheme.innerBg);
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor};`;

  $: noteBlock =
    blocks.find(block => block.type === 'text' || block.type === 'cleantext') ||
    null;
  $: noteContent = noteBlock?.content ?? '';
  $: wordCount = countWords(noteContent);
  $: characterCount = noteContent.length;
  $: hasHiddenBlocks = blocks.length > 1;

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

  function autoResize(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function focusScroll(el) {
    if (!el) return;
    if (window.innerWidth <= 1024) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  onMount(() => {
    const textarea = document.querySelector('.single-note textarea');
    autoResize(textarea);
  });

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
</script>

<style>
  .single-note {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: clamp(20px, 4vw, 40px);
    box-sizing: border-box;
    background: var(--canvas-outer-bg, #000000);
    color: var(--mode-text-color, #ffffff);
    min-height: 100%;
    justify-content: center;
    align-items: center;
  }

  .note-shell {
    background: var(--canvas-inner-bg, #000000);
    color: var(--mode-text-color, #ffffff);
    border-radius: 20px;
    border: 1px solid transparent;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(720px, 100%);
    box-shadow: none;
  }

  .note-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
  }

  .note-stats {
    display: flex;
    gap: 12px;
    font-size: 0.9rem;
    letter-spacing: 0.02em;
    color: inherit;
  }

  .note-stats span {
    background: transparent;
    padding: 0;
    border-radius: 0;
  }


  textarea {
    width: 100%;
    min-height: 240px;
    border: none;
    border-radius: 16px;
    resize: vertical;
    padding: 16px;
    background: transparent;
    color: var(--mode-text-color, #ffffff);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 1.05rem;
    line-height: 1.6;
    box-sizing: border-box;
    text-align: center;
  }

  textarea:focus {
    outline: none;
  }

  .note-footer {
    display: flex;
    justify-content: flex-end;
  }

  .note-footer button {
    background: transparent;
    border: none;
    color: var(--mode-text-color, #ffffff);
    font-size: 1.1rem;
    cursor: pointer;
  }

  .note-warning {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
    background: transparent;
    padding: 0;
    border-radius: 0;
    max-width: 720px;
    text-align: center;
  }

  .empty-state {
    border: 1px dashed rgba(255, 255, 255, 0.4);
    border-radius: 16px;
    padding: 24px;
    text-align: center;
    color: rgba(255, 255, 255, 0.8);
    max-width: 720px;
  }
</style>

<div class="single-note" bind:this={canvasRef} style={canvasCssVars}>
  {#if noteBlock}
    <div
      class="note-shell"
    >
      <div class="note-meta">
        <div class="note-stats">
          <span>Words: {wordCount}</span>
          <span>Characters: {characterCount}</span>
        </div>
      </div>

      <textarea
        class="note-textarea"
        spellcheck="false"
        rows="1"
        value={noteContent}
        on:input={(event) => {
          autoResize(event.target);
          updateBlock(noteBlock.id, { content: event.target.value }, { pushToHistory: false, changedKeys: ['content'] });
        }}
        on:focus={(event) => {
          focusScroll(event.target);
          ensureFocus(noteBlock.id);
        }}
        placeholder="Write your note here..."
      ></textarea>

      <div class="note-footer">
        <button on:click={() => deleteBlock(noteBlock.id)} aria-label="Delete note">
          ×
        </button>
      </div>
    </div>

    {#if hasHiddenBlocks}
      <div class="note-warning">
        This mode shows a single note. Other blocks are hidden until you return
        to Canvas or Simple Note mode.
      </div>
    {/if}
  {:else}
    <div class="empty-state">
      No text note found yet. Add a text or clean text block to start a note
      file.
    </div>
  {/if}
</div>
