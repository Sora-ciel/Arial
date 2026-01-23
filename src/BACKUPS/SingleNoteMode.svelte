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
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};`;

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
</script>

<style>
  .single-note {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    max-width: 1080px;
    margin: 0 auto;
    padding: clamp(12px, 2vw, 24px);
    box-sizing: border-box;
    background: var(--canvas-outer-bg, #000000);
    color: #ffffff;
    min-height: 100%;
  }

  .note-shell {
    background: var(--bg-color);
    color: var(--text-color);
    border-radius: 24px;
    border: 2px solid var(--text-color);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 18px 30px rgba(0, 0, 0, 0.35);
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
  }

  .note-stats span {
    background: rgba(0, 0, 0, 0.25);
    padding: 6px 10px;
    border-radius: 999px;
  }

  .note-colors {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .note-colors label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
  }

  .note-colors input[type='color'] {
    width: 40px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
  }

  textarea {
    width: 100%;
    min-height: 240px;
    border: none;
    border-radius: 18px;
    resize: vertical;
    padding: 16px;
    background: transparent;
    color: var(--text-color);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 1.05rem;
    line-height: 1.6;
    box-sizing: border-box;
  }

  textarea:focus {
    outline: none;
    color: var(--bg-color);
    background: var(--text-color);
  }

  .note-footer {
    display: flex;
    justify-content: flex-end;
  }

  .note-footer button {
    background: transparent;
    border: none;
    color: var(--text-color);
    font-size: 1.1rem;
    cursor: pointer;
  }

  .note-warning {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(0, 0, 0, 0.35);
    padding: 10px 12px;
    border-radius: 12px;
  }

  .empty-state {
    border: 1px dashed rgba(255, 255, 255, 0.4);
    border-radius: 16px;
    padding: 24px;
    text-align: center;
    color: rgba(255, 255, 255, 0.8);
  }
</style>

<div class="single-note" bind:this={canvasRef} style={canvasCssVars}>
  {#if noteBlock}
    <div
      class="note-shell"
      style="--bg-color: {noteBlock.bgColor}; --text-color: {noteBlock.textColor};"
    >
      <div class="note-meta">
        <div class="note-stats">
          <span>Words: {wordCount}</span>
          <span>Characters: {characterCount}</span>
        </div>
        <div class="note-colors">
          <label>
            Background
            <input
              type="color"
              value={noteBlock.bgColor}
              on:input={(event) =>
                updateBlock(noteBlock.id, { bgColor: event.target.value })}
            />
          </label>
          <label>
            Text
            <input
              type="color"
              value={noteBlock.textColor}
              on:input={(event) =>
                updateBlock(noteBlock.id, { textColor: event.target.value })}
            />
          </label>
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
