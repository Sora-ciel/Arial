<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Placeholder from '@tiptap/extension-placeholder';
  import Image from '@tiptap/extension-image';
  import { Markdown } from 'tiptap-markdown';

  export let content = '';
  export let placeholder = 'Write here…';
  export let initialScrollTop = 0;
  // Tasks are stored as markdown, notes as HTML. Emitting markdown keeps task
  // text in the format the rest of the app already reads, so nothing else has
  // to change to gain a real editor.
  export let emit = 'html'; // 'html' | 'markdown'
  // 'inline' drops the note-sized padding and min-height so the editor can sit
  // inside a single task row.
  export let variant = 'block'; // 'block' | 'inline'

  const dispatch = createEventDispatcher();

  let wrapEl;
  let element;
  let editor;

  // StarterKit ships no image node, so markdown like ![alt](url) had nothing
  // to become and silently did nothing. Add the node, and give it a width that
  // survives save/reload plus a corner handle to drag it to any size.
  const ResizableImage = Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        width: {
          default: null,
          parseHTML: element => element.getAttribute('width') || element.style.width || null,
          renderHTML: attributes => {
            if (!attributes.width) return {};
            return { width: attributes.width, style: `width: ${attributes.width}` };
          }
        },
        // inline flows with the sentence; left/right float so text wraps
        // alongside; center puts it on its own centred line.
        align: {
          default: 'inline',
          parseHTML: element => element.getAttribute('data-align') || 'inline',
          renderHTML: attributes => ({ 'data-align': attributes.align || 'inline' })
        }
      };
    },
    addNodeView() {
      return ({ node, editor: view, getPos }) => {
        const wrap = document.createElement('span');
        wrap.className = 'tiptap-img-wrap';
        wrap.dataset.align = node.attrs.align || 'inline';

        // Alignment bar — how the image sits relative to the text around it.
        const bar = document.createElement('span');
        bar.className = 'tiptap-img-bar';
        bar.contentEditable = 'false';

        const setAlign = value => {
          if (typeof getPos !== 'function') return;
          const pos = getPos();
          if (typeof pos !== 'number') return;
          // Read the node back out of the document rather than using the one
          // captured when this view was built. That copy is a snapshot: after
          // a resize it still carries the old width, so aligning would quietly
          // undo the size, and vice versa.
          const current = view.view.state.doc.nodeAt(pos);
          if (!current) return;
          view.view.dispatch(
            view.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, align: value })
          );
        };

        for (const [value, label, title] of [
          ['inline', '↔', 'In the line of text'],
          ['left', '⇤', 'Float left, text wraps to the right'],
          ['center', '↕', 'Centred on its own line'],
          ['right', '⇥', 'Float right, text wraps to the left']
        ]) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = label;
          btn.title = title;
          btn.className = 'tiptap-img-align';
          if ((node.attrs.align || 'inline') === value) btn.classList.add('is-active');
          btn.addEventListener('mousedown', event => {
            event.preventDefault();
            event.stopPropagation();
            setAlign(value);
          });
          bar.appendChild(btn);
        }
        wrap.appendChild(bar);

        const img = document.createElement('img');
        img.src = node.attrs.src;
        if (node.attrs.alt) img.alt = node.attrs.alt;
        if (node.attrs.title) img.title = node.attrs.title;
        if (node.attrs.width) img.style.width = node.attrs.width;
        wrap.appendChild(img);

        const handle = document.createElement('span');
        handle.className = 'tiptap-img-handle';
        handle.contentEditable = 'false';
        wrap.appendChild(handle);

        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        // Follow whichever axis the pointer actually moved most. Dragging only
        // rightwards is useless for a right-floated image sitting against the
        // edge — pulling downwards has to grow it too.
        const onMove = event => {
          const dx = event.clientX - startX;
          const dy = event.clientY - startY;
          const aspect = startHeight > 0 ? startWidth / startHeight : 1;
          const next = Math.abs(dy) > Math.abs(dx)
            ? (startHeight + dy) * aspect
            : startWidth + dx;
          img.style.width = `${Math.max(40, Math.round(next))}px`;
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          const finalWidth = `${Math.round(img.getBoundingClientRect().width)}px`;
          if (typeof getPos === 'function') {
            const pos = getPos();
            if (typeof pos === 'number') {
              // Same as above: the live node, not the captured snapshot, so a
              // resize keeps whatever alignment the image currently has.
              const current = view.view.state.doc.nodeAt(pos);
              if (current) {
                view.view.dispatch(
                  view.view.state.tr.setNodeMarkup(pos, undefined, {
                    ...current.attrs,
                    width: finalWidth
                  })
                );
              }
            }
          }
        };

        handle.addEventListener('pointerdown', event => {
          event.preventDefault();
          event.stopPropagation();
          startX = event.clientX;
          startY = event.clientY;
          const rect = img.getBoundingClientRect();
          startWidth = rect.width;
          startHeight = rect.height;
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });

        return {
          dom: wrap,
          // The image is a leaf — let ProseMirror handle every other update.
          update: updated => {
            if (updated.type.name !== node.type.name) return false;
            img.src = updated.attrs.src;
            img.style.width = updated.attrs.width || '';
            const align = updated.attrs.align || 'inline';
            wrap.dataset.align = align;
            for (const btn of bar.querySelectorAll('.tiptap-img-align')) {
              btn.classList.toggle('is-active', btn.title.startsWith('In the line') ? align === 'inline'
                : btn.title.startsWith('Float left') ? align === 'left'
                : btn.title.startsWith('Centred') ? align === 'center'
                : align === 'right');
            }
            return true;
          },
          destroy: () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          }
        };
      };
    }
  });
  // Track the last content we pushed into the editor so we don't re-set on our own updates
  let lastPushedContent = null;

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit,
        // html:true so setContent can parse BOTH legacy markdown content and the
        // HTML we now store. We store HTML (getHTML) because markdown collapses
        // consecutive blank lines — HTML keeps every empty paragraph.
        Markdown.configure({
          html: true,
          transformCopiedText: true,
          transformPastedText: true,
        }),
        // inline:true lets an image sit inside a paragraph — after text, between
        // words, anywhere the caret is — instead of being forced onto its own
        // full-width line. allowBase64 so pasted data: URLs render too.
        ResizableImage.configure({ inline: true, allowBase64: true }),
        Placeholder.configure({ placeholder }),
      ],
      content: content || '',
      editorProps: {
        attributes: { class: 'tiptap-inner', spellcheck: 'false' },
      },
      onUpdate({ editor: e }) {
        const value =
          emit === 'markdown'
            ? (e.storage?.markdown?.getMarkdown?.() ?? e.getHTML())
            : e.getHTML();
        // Tracked in the same format we emit, so the reactive push below can
        // tell "the parent echoed our own value back" from a real change.
        lastPushedContent = value;
        dispatch('change', value);
      },
      onFocus({ event }) {
        dispatch('focus', event);
      },
      onBlur({ event }) {
        dispatch('blur', event);
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
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000));
    color: var(--active-note-text, var(--mode-text-color, #fff));
    box-sizing: border-box;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 1.05rem;
    line-height: 1.6;
    cursor: text;
  }

  /* Inline variant: no scroller of its own and no imposed height, so a task
     row grows to fit exactly the lines it holds. */
  .tiptap-wrap.tiptap-inline {
    flex: 1 1 auto;
    overflow: visible;
    background: none;
    color: inherit;
    font-size: inherit;
    line-height: inherit;
    font-family: inherit;
  }
  .tiptap-wrap.tiptap-inline :global(.tiptap-inner) {
    padding: 0;
    min-height: 0;
  }

  .tiptap-mount {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* Padding lives on the contenteditable itself (not the wrap around it) so
     the padding band is part of the same clickable text surface — clicking
     anywhere in the block, including its edges, hits real editable content
     and gets native/ProseMirror click-to-position instead of falling back
     to a plain (and imprecise) editor.commands.focus() on the outer wrap. */
  :global(.tiptap-inner) {
    flex: 1 1 auto;
    outline: none;
    min-height: 80px;
    padding: 12px;
    box-sizing: border-box;
    white-space: pre-wrap;
    /* word-break: break-word throws off Chrome's contenteditable caret
       hit-testing near line/text ends (clicking after the last character
       lands one position short). overflow-wrap achieves the same
       long-word wrapping without that bug. */
    overflow-wrap: anywhere;
    cursor: text;
  }

  :global(.tiptap-inner p) { margin: 0; }

  /* Images and their drag-to-resize corner */
  :global(.tiptap-img-wrap) {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
    vertical-align: baseline;
  }

  /* Position relative to the surrounding text. Floating is what lets a
     paragraph actually run beside the image instead of under it. */
  :global(.tiptap-img-wrap[data-align='left']) {
    float: left;
    margin: 4px 14px 6px 0;
  }
  :global(.tiptap-img-wrap[data-align='right']) {
    float: right;
    margin: 4px 0 6px 14px;
  }
  :global(.tiptap-img-wrap[data-align='center']) {
    display: block;
    float: none;
    /* fit-content, or the block fills the line and the auto margins collapse
       to zero — leaving the image sitting on the left instead of centred. */
    width: fit-content;
    margin: 10px auto;
  }
  /* Paragraphs after a floated image still start beside it; this keeps the
     block itself from collapsing around the float. */
  :global(.tiptap-inner)::after {
    content: '';
    display: block;
    clear: both;
  }

  /* Alignment bar, only while the pointer is on the image */
  :global(.tiptap-img-bar) {
    position: absolute;
    top: 4px;
    left: 4px;
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.65);
    opacity: 0;
    transition: opacity 0.15s ease;
    z-index: 2;
    line-height: 1;
  }
  :global(.tiptap-img-wrap:hover .tiptap-img-bar) { opacity: 1; }
  :global(.tiptap-img-align) {
    all: unset;
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 4px;
    color: #ffffff;
    font-size: 0.78rem;
    line-height: 1.1;
  }
  :global(.tiptap-img-align:hover) { background: rgba(255, 255, 255, 0.2); }
  :global(.tiptap-img-align.is-active) { background: rgba(255, 255, 255, 0.32); }
  :global(.tiptap-img-wrap img) {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    display: block;
  }
  :global(.tiptap-img-handle) {
    position: absolute;
    right: -5px;
    bottom: -5px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--active-note-text, #ffffff);
    border: 2px solid var(--active-note-bg, #000000);
    cursor: nwse-resize;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  /* Stays out of the way until you actually reach for the image. */
  :global(.tiptap-img-wrap:hover .tiptap-img-handle) { opacity: 1; }

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

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="tiptap-wrap" class:tiptap-inline={variant === 'inline'} bind:this={wrapEl} on:scroll={onScroll}
  on:click={() => editor?.commands.focus()}>
  <div class="tiptap-mount" bind:this={element}></div>
</div>
