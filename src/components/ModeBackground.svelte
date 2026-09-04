<script>
  // A mode's wallpaper, drawn as one layer behind everything else.
  //
  // Single Note had this written into it; Canvas mode wanted the same thing.
  // Rather than a second copy that drifts, both modes render this and both
  // normalise through utils/modeBackground.js.
  //
  // What it does *not* do is decide where it sits. That is the whole reason it
  // is a component and not a rule: in Single Note it belongs behind the note,
  // and in Canvas mode it has to sit outside the element the zoom transforms,
  // or the picture would scale with the board and the wallpaper would grow and
  // shrink as you zoom. The parent positions it; this only paints it.
  import { backgroundLayerStyle } from '../utils/modeBackground.js';

  export let settings = {};
  export let isMobile = false;

  $: layer = backgroundLayerStyle(settings, { isMobile });
</script>

{#if layer}
  <div
    class="mode-bg-layer"
    aria-hidden="true"
    style="
      background-image: url('{layer.image}');
      opacity: {layer.opacity};
      filter: {layer.filter};
      background-size: {layer.size};
      inset: -{layer.bleed}px;
    "
  ></div>
{/if}

<style>
  .mode-bg-layer {
    position: absolute;
    background-position: center;
    background-repeat: no-repeat;
    /* Behind the mode's own content, and never in the way of a click. */
    z-index: 0;
    pointer-events: none;
  }
</style>
