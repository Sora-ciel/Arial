<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import Eyedropper from './Eyedropper.svelte';

  export let value = '#000000';

  const dispatch = createEventDispatcher();

  const FORMATS = ['hex', 'rgb', 'hsl'];
  const FORMAT_KEY = 'cp-format';

  let format = 'hex';
  try {
    const saved = localStorage.getItem(FORMAT_KEY);
    if (saved && FORMATS.includes(saved)) format = saved;
  } catch {}

  let h = 0, s = 0, v = 0;
  let inputText = '';
  let editing = false;
  let svEl, hueEl;
  let lastHex = null;     // our own last emission (avoid prop->state echo)
  let rafId = null;
  let eyedropping = false;

  const PRESETS = [
    '#000000', '#ffffff', '#ff5555', '#ffb86c', '#f1fa8c',
    '#50fa7b', '#8be9fd', '#6ea8ff', '#bd93f9', '#ff79c6'
  ];

  // ── color math ───────────────────────────────────────────────────
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let hh = 0;
    if (d !== 0) {
      if (max === r) hh = ((g - b) / d) % 6;
      else if (max === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      hh *= 60;
      if (hh < 0) hh += 360;
    }
    return { h: hh, s: max === 0 ? 0 : d / max, v: max };
  }

  function hsvToHsl(h, s, v) {
    const l = v * (1 - s / 2);
    let sl = 0;
    if (l > 0 && l < 1) sl = (v - l) / Math.min(l, 1 - l);
    return { h, s: sl, l };
  }

  function hslToHsv(h, sl, l) {
    const v = l + sl * Math.min(l, 1 - l);
    const s = v === 0 ? 0 : 2 * (1 - l / v);
    return { h, s, v };
  }

  function hexToRgb(hex) {
    let c = String(hex || '').replace('#', '').trim();
    if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
    if (c.length === 8) c = c.slice(0, 6); // ignore alpha channel
    if (c.length !== 6 || /[^0-9a-fA-F]/.test(c)) return null;
    const n = parseInt(c, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function currentHex() {
    const rgb = hsvToRgb(h, s, v);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  // ── format display + parsing ─────────────────────────────────────
  function formatColor(fmt, h, s, v) {
    const rgb = hsvToRgb(h, s, v);
    if (fmt === 'rgb') return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    if (fmt === 'hsl') {
      const hsl = hsvToHsl(h, s, v);
      return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`;
    }
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  function parseColor(str) {
    if (!str) return null;
    str = String(str).trim().toLowerCase();
    if (str.startsWith('#') || /^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(str)) {
      const rgb = hexToRgb(str);
      return rgb ? rgbToHsv(rgb.r, rgb.g, rgb.b) : null;
    }
    let m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return rgbToHsv(+m[1], +m[2], +m[3]);
    m = str.match(/hsla?\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?/);
    if (m) return hslToHsv(+m[1], +m[2] / 100, +m[3] / 100);
    return null;
  }

  // keep the input text in sync with the colour + format (unless typing)
  $: if (!editing) inputText = formatColor(format, h, s, v);

  // ── sync external value -> internal hsv ──────────────────────────
  $: syncFromValue(value);
  function syncFromValue(val) {
    const hsv = parseColor(val);
    if (!hsv) return;
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
    const norm = rgbToHex(rgb.r, rgb.g, rgb.b);
    if (norm === lastHex) return;
    h = hsv.h; s = hsv.s; v = hsv.v;
  }

  function emit(commit) {
    const hex = currentHex();
    lastHex = hex;
    dispatch(commit ? 'change' : 'input', hex);
  }

  function emitLive() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; emit(false); });
  }

  function setFormat(next) {
    format = next;
    try { localStorage.setItem(FORMAT_KEY, format); } catch {}
  }
  function cycleFormat() {
    const i = FORMATS.indexOf(format);
    setFormat(FORMATS[(i + 1) % FORMATS.length]);
  }

  // ── pointer dragging (mouse + touch / Android WebView) ───────────
  function svPointer(e) {
    const rect = svEl.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    s = rect.width ? x / rect.width : 0;
    v = rect.height ? 1 - y / rect.height : 0;
    emitLive();
  }

  function huePointer(e) {
    const rect = hueEl.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    h = rect.width ? (x / rect.width) * 360 : 0;
    emitLive();
  }

  function drag(el, handler, e) {
    e.preventDefault();
    e.stopPropagation();
    try { el.setPointerCapture?.(e.pointerId); } catch {}
    handler(e);
    const move = (ev) => handler(ev);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      emit(true);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function commitInput() {
    editing = false;
    const hsv = parseColor(inputText);
    if (!hsv) { inputText = formatColor(format, h, s, v); return; }
    h = hsv.h; s = hsv.s; v = hsv.v;
    emit(true);
  }

  function pickPreset(hex) {
    const hsv = parseColor(hex);
    if (!hsv) return;
    h = hsv.h; s = hsv.s; v = hsv.v;
    emit(true);
  }

  function onEyedropperPick(e) {
    eyedropping = false;
    const hsv = parseColor(e.detail);
    if (!hsv) return;
    h = hsv.h; s = hsv.s; v = hsv.v;
    emit(true);
  }

  onDestroy(() => { if (rafId) cancelAnimationFrame(rafId); });

  $: hueColor = (() => { const c = hsvToRgb(h, 1, 1); return rgbToHex(c.r, c.g, c.b); })();
  $: thumbColor = currentHex();
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="cp">
  <div
    class="cp-sv"
    bind:this={svEl}
    style="background-color:{hueColor};"
    on:pointerdown={(e) => drag(svEl, svPointer, e)}
  >
    <div class="cp-sv-white"></div>
    <div class="cp-sv-black"></div>
    <div class="cp-sv-thumb" style="left:{s * 100}%; top:{(1 - v) * 100}%; background:{thumbColor};"></div>
  </div>

  <div class="cp-controls">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <button class="cp-eyedropper" title="Pick a color from the screen" on:click|stopPropagation={() => (eyedropping = true)}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 22l1-4 11-11 3 3L6 21l-4 1z" />
        <path d="M15 6l3-3a2.1 2.1 0 0 1 3 3l-3 3" />
      </svg>
    </button>
    <div
      class="cp-hue"
      bind:this={hueEl}
      on:pointerdown={(e) => drag(hueEl, huePointer, e)}
    >
      <div class="cp-hue-thumb" style="left:{(h / 360) * 100}%;"></div>
    </div>
  </div>

  <div class="cp-row">
    <span class="cp-preview" style="background:{thumbColor};"></span>
    <input
      class="cp-input"
      value={inputText}
      spellcheck="false"
      on:focus={() => (editing = true)}
      on:input={(e) => (inputText = e.target.value)}
      on:keydown={(e) => { if (e.key === 'Enter') commitInput(); }}
      on:blur={commitInput}
      on:pointerdown|stopPropagation
    />
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <button class="cp-format" title="Switch color format" on:click|stopPropagation={cycleFormat}>
      {format.toUpperCase()}
    </button>
  </div>

  <div class="cp-presets">
    {#each PRESETS as p}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <button
        class="cp-preset"
        style="background:{p};"
        title={p}
        on:click|stopPropagation={() => pickPreset(p)}
      ></button>
    {/each}
  </div>
</div>

{#if eyedropping}
  <Eyedropper on:pick={onEyedropperPick} on:cancel={() => (eyedropping = false)} />
{/if}

<style>
  .cp {
    width: var(--cp-width, 200px);
    display: flex;
    flex-direction: column;
    gap: var(--cp-gap, 8px);
    padding: var(--cp-padding, 8px);
    background: var(--cp-bg, transparent);
    border-radius: var(--cp-radius, 10px);
    box-sizing: border-box;
    user-select: none;
  }

  .cp-sv {
    position: relative;
    width: 100%;
    height: var(--cp-sv-height, 128px);
    border-radius: var(--cp-area-radius, 0px);
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
  }
  .cp-sv-white,
  .cp-sv-black {
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .cp-sv-white { background: linear-gradient(to right, #fff, rgba(255, 255, 255, 0)); }
  .cp-sv-black { background: linear-gradient(to top, #000, rgba(0, 0, 0, 0)); }

  .cp-sv-thumb {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .cp-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cp-eyedropper {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 6px;
    border: 1px solid var(--cp-input-border, rgba(255, 255, 255, 0.18));
    background: var(--cp-input-bg, rgba(255, 255, 255, 0.08));
    color: var(--cp-input-text, #f0f0f0);
    cursor: pointer;
  }
  .cp-eyedropper:hover { background: rgba(255, 255, 255, 0.16); }

  .cp-hue {
    position: relative;
    flex: 1;
    height: var(--cp-hue-height, 14px);
    border-radius: 999px;
    cursor: pointer;
    touch-action: none;
    background: linear-gradient(to right,
      #ff0000 0%, #ffff00 17%, #00ff00 33%,
      #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);
  }
  .cp-hue-thumb {
    position: absolute;
    top: 50%;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .cp-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cp-preview {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    flex-shrink: 0;
  }
  .cp-input {
    flex: 1;
    min-width: 0;
    background: var(--cp-input-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--cp-input-border, rgba(255, 255, 255, 0.18));
    border-radius: 6px;
    color: var(--cp-input-text, #f0f0f0);
    padding: 5px 8px;
    font-size: 0.78rem;
    font-family: monospace;
    outline: none;
  }
  .cp-input:focus { border-color: var(--cp-input-focus, rgba(255, 255, 255, 0.4)); }

  .cp-format {
    flex-shrink: 0;
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid var(--cp-input-border, rgba(255, 255, 255, 0.18));
    background: var(--cp-input-bg, rgba(255, 255, 255, 0.08));
    color: var(--cp-input-text, #f0f0f0);
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 0.03em;
  }
  .cp-format:hover { background: rgba(255, 255, 255, 0.16); }

  .cp-presets {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 4px;
  }
  .cp-preset {
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
  }
  .cp-preset:hover { transform: scale(1.12); }
</style>
