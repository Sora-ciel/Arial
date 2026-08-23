<script>
  // Toolbar icons as inline SVG rather than emoji.
  //
  // Emoji render in their own fixed colours and in whatever style the platform
  // ships, so they never followed the theme and looked different on every
  // device. These are drawn with currentColor, so they take the colour of the
  // control they sit in.
  export let name;
  export let size = 15;
</script>

<svg
  class="ci"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'menu'}
    <path d="M4 6h16M4 12h16M4 18h16" />
  {:else if name === 'close'}
    <path d="M6 6l12 12M18 6L6 18" />
  {:else if name === 'mode'}
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'down'}
    <path d="M12 5v14M6 13l6 6 6-6" />
  {:else if name === 'up'}
    <path d="M12 19V5M6 11l6-6 6 6" />
  {:else if name === 'trash'}
    <path d="M4 7h16" />
    <path d="M9 7V5h6v2" />
    <path d="M6 7l1 13h10l1-13" />
  {:else if name === 'export'}
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 20h16" />
  {:else if name === 'import'}
    <path d="M12 15V3" />
    <path d="M7 8l5-5 5 5" />
    <path d="M4 20h16" />
  {:else if name === 'undo'}
    <path d="M9 7L4 12l5 5" />
    <path d="M4 12h10a6 6 0 0 1 0 12h-1" />
  {:else if name === 'redo'}
    <path d="M15 7l5 5-5 5" />
    <path d="M20 12H10a6 6 0 0 0 0 12h1" />
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  {:else if name === 'camera'}
    <path d="M3 8h3.5L8 5.5h8L17.5 8H21v12H3z" />
    <circle cx="12" cy="13.5" r="3.5" />
  {:else if name === 'folder'}
    <path d="M3 6h6l2 2.5h10V19H3z" />
  {/if}
</svg>

<style>
  .ci {
    display: block;
    flex-shrink: 0;
    color: inherit;
  }
</style>
