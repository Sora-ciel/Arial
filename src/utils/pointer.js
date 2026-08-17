// Canvas blocks start a drag from mousedown/pointerdown/touchstart on their
// header. Only the primary (left) button should do that — right-click is
// reserved for grab-panning the canvas, and without this check a right-press
// on a block header drags the block and pans the canvas at the same time.
//
// touchstart events carry no `button`, and touch-generated pointer events
// report button 0, so both still count as primary.
export function isPrimaryPointer(event) {
  return event?.button == null || event.button === 0;
}
