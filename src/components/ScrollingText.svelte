<script>
  // A track name that rolls past when it's too long for its box, the way music
  // players usually show it. Two copies scroll by exactly half the track width
  // (plus half the gap), so the loop repeats with no visible jump back.
  //
  // It only rolls when the text genuinely overflows — otherwise short names
  // would drift about for no reason — and it re-measures whenever the text or
  // the box size changes.
  export let text = '';
  export let always = false; // roll even when it fits (used by the tiny phone window)
  export let speed = 40; // pixels per second

  let box;
  let track;
  let overflows = false;
  let duration = 9;

  function measure() {
    if (!box || !track) return;
    // Half the track is one copy of the text plus one gap.
    const single = track.scrollWidth / 2;
    overflows = single > box.clientWidth + 1;
    duration = Math.max(5, single / speed);
  }

  $: text, requestMeasure();

  let queued = false;
  function requestMeasure() {
    if (queued || typeof requestAnimationFrame === 'undefined') return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      measure();
    });
  }

  function observe(node) {
    box = node;
    requestMeasure();
    if (typeof ResizeObserver === 'undefined') return {};
    const ro = new ResizeObserver(requestMeasure);
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }
</script>

<div class="marquee" class:rolling={always || overflows} use:observe title={text}>
  <div
    class="marquee-track"
    class:rolling={always || overflows}
    style={`--roll-duration: ${duration}s`}
    bind:this={track}
  >
    <span>{text}</span>
    <span aria-hidden="true">{text}</span>
  </div>
</div>

<style>
  .marquee {
    overflow: hidden;
    min-width: 0;
  }

  /* Softens both edges so text scrolling past fades out rather than being
     sliced. Only while it actually rolls: applied unconditionally the fade
     washes out the start and end of every short name that fits perfectly
     well, which reads as the title being cut off.
     The state is mirrored onto the container rather than read off the child
     with :has() — Svelte's CSS analyzer prunes :has() rules as unused. */
  .marquee.rolling {
    mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
  }

  .marquee-track {
    display: flex;
    gap: 2em;
    width: max-content;
    white-space: nowrap;
  }
  .marquee-track:not(.rolling) {
    width: auto;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .marquee-track:not(.rolling) span:last-child { display: none; }

  .marquee-track.rolling { animation: marquee-roll var(--roll-duration, 9s) linear infinite; }
  @keyframes marquee-roll {
    from { transform: translateX(0); }
    to { transform: translateX(calc(-50% - 1em)); }
  }

  /* The roll carries information — the rest of the name — so when motion is
     turned down it stops and falls back to an ellipsis rather than freezing
     mid-word. */
  @media (prefers-reduced-motion: reduce) {
    .marquee.rolling { mask-image: none; -webkit-mask-image: none; }
    .marquee-track.rolling {
      animation: none;
      width: auto;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .marquee-track.rolling span:last-child { display: none; }
  }
</style>
