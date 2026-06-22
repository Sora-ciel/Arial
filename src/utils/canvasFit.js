// Shared canvas-zoom math — single source of truth for "what zoom does the
// canvas open at" and "how big is the screen, in canvas-space units, at that
// zoom". CanvasMode.svelte uses this for its own mount/reset zoom; App.svelte
// uses it to size pasted/dropped media and to place new blocks within what's
// actually visible. Keeping one implementation avoids the kind of drift bug
// where two copies of the same formula quietly disagree.

export const MIN_CANVAS_WIDTH = 1080;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 16;

export function getControlsHeight() {
  if (typeof document === 'undefined') return 56;
  const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--controls-height'));
  return Number.isFinite(v) && v > 0 ? v : 56;
}

// Deterministic "home" zoom based purely on screen width (not content), so
// it matches CanvasMode's own opening/reset zoom regardless of whether the
// canvas is currently mounted.
export function getInitialCanvasScale() {
  if (typeof window === 'undefined') return 1;
  const availableWidth = Math.max(window.innerWidth, 1);
  const fitted = availableWidth / MIN_CANVAS_WIDTH;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(1, fitted)));
}

// The box (in canvas-space units) that fills the screen at the canvas's
// opening zoom — i.e. how big something needs to be, in canvas units, to
// look "about as tall/wide as the screen" right when the canvas first opens.
export function getOpeningViewportBox() {
  const scale = getInitialCanvasScale();
  const controlsHeight = getControlsHeight();
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    width: w / scale,
    height: Math.max(1, h - controlsHeight) / scale
  };
}
