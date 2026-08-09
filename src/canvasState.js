// Shared canvas state — CanvasMode writes here, App reads here.
// Avoids bind:this chains that destabilise component lifecycles during HMR.
let _scale = 1;
let _canvasRef = null;

export function setCanvasScale(s) { _scale = (s > 0 ? s : 1); }
export function setCanvasRef(ref) { _canvasRef = ref; }

export function getCanvasViewport() {
  if (!_canvasRef) return null;
  const s = _scale;
  return {
    canvasX: _canvasRef.scrollLeft / s,
    canvasY: _canvasRef.scrollTop / s,
    canvasVisibleW: _canvasRef.clientWidth / s,
    canvasVisibleH: _canvasRef.clientHeight / s,
    scale: s
  };
}
