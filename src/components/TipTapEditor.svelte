<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { Markdown } from 'tiptap-markdown';

  export let content = '';
  export let placeholder = 'Write here…';
  export let initialScrollTop = 0;

  const dispatch = createEventDispatcher();

  let wrapEl;
  let element;
  let editor;
  // Track the last content we pushed into the editor so we don't re-set on our own updates
  let lastPushedContent = null;

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit,
        Markdown.configure({
          html: false,
          transformCopiedText: true,
          transformPastedText: true,
        }),
      ],
      content: content || '',
      editorProps: {
        attributes: { class: 'tiptap-inner', spellcheck: 'false' },
      },
      onUpdate({ editor: e }) {
        const md = e.storage.markdown.serializer.serialize(e.state.doc);
        lastPushedContent = md;
        dispatch('change', md);
      },
      onFocus() {
        dispatch('focus');
      },
      onBlur() {
        dispatch('blur');
      },
    });
    lastPushedContent = content;
    // Restore scroll after editor settles
    if (initialScrollTop && wrapEl) {
      requestAnimationFrame(() => { wrapEl.scrollTop = initialScrollTop; });
    }
  });

  // Sync external content changes (e.g. switching notes)
  $: if (editor && content !== lastPushedContent) {
    editor.commands.setContent(content || '', false);
    lastPushedContent = content;
  }

  onDestroy(() => {
    editor?.destroy();
  });

  function onScroll() {
    dispatch('scroll', wrapEl?.scrollTop ?? 0);
  }
</script>

<style>
  .tiptap-wrap {
    flex: 1 1 auto;
    overflow-y: auto;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000));
    color: var(--active-note-text, var(--mode-text-color, #fff));
    padding: 12px;
    box-sizing: border-box;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 1.05rem;
    line-height: 1.6;
  }

  :global(.tiptap-inner) {
    outline: none;
    min-height: 100%;
    white-space: pre-wrap;
    word-break: break-word;
  }

  :global(.tiptap-inner p) { margin: 0 0 0.5em; }
  :global(.tiptap-inner p:last-child) { margin-bottom: 0; }

  :global(.tiptap-inner h1) { font-size: 1.7em; font-weight: 700; margin: 0.6em 0 0.3em; }
  :global(.tiptap-inner h2) { font-size: 1.35em; font-weight: 700; margin: 0.5em 0 0.25em; }
  :global(.tiptap-inner h3) { font-size: 1.15em; font-weight: 600; margin: 0.4em 0 0.2em; }

  :global(.tiptap-inner strong) { font-weight: 700; }
  :global(.tiptap-inner em) { font-style: italic; }
  :global(.tiptap-inner s) { text-decoration: line-through; }
  :global(.tiptap-inner code) {
    font-family: monospace;
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 0.9em;
  }
  :global(.tiptap-inner pre) {
    background: rgba(255,255,255,0.07);
    border-radius: 6px;
    padding: 10px 12px;
    overflow-x: auto;
    margin: 0.5em 0;
  }
  :global(.tiptap-inner pre code) { background: none; padding: 0; }

  :global(.tiptap-inner ul, .tiptap-inner ol) { padding-left: 1.4em; margin: 0.3em 0; }
  :global(.tiptap-inner li) { margin: 0.15em 0; }

  :global(.tiptap-inner blockquote) {
    border-left: 3px solid rgba(255,255,255,0.25);
    margin: 0.4em 0;
    padding-left: 10px;
    color: rgba(255,255,255,0.6);
  }

  :global(.tiptap-inner hr) {
    border: none;
    border-top: 1px solid rgba(255,255,255,0.15);
    margin: 0.8em 0;
  }

  /* Empty placeholder */
  :global(.tiptap-inner p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    color: rgba(255,255,255,0.25);
    pointer-events: none;
    float: left;
    height: 0;
  }
</style>

<div class="tiptap-wrap" bind:this={wrapEl} on:scroll={onScroll}>
  <div bind:this={element}></div>
</div>
