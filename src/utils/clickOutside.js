// Dismisses a popup when you click away from it — the behaviour the left and
// right control panels already had, packaged so every new popup gets it the
// same way instead of each one growing its own copy.
//
//   <div use:clickOutside={{ onOutside: close, ignore: () => [buttonEl] }}>
//
// The click that opened the popup is ignored: it is still travelling up to
// window at the moment the popup mounts, so listening immediately would close
// it again the instant it appeared.
export function clickOutside(node, options = {}) {
  let config = options;
  let armed = false;

  const arm = () => { armed = true; };

  function ignoredElements() {
    const raw = typeof config.ignore === 'function' ? config.ignore() : config.ignore;
    return (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
  }

  function handle(event) {
    if (!armed || config.enabled === false) return;
    const target = event.target;
    // A click on something already detached (a button inside a list item that
    // just re-rendered) can't be tested for containment, so leave it alone.
    if (!target || !target.isConnected) return;
    if (node.contains(target)) return;
    if (ignoredElements().some(element => element.contains?.(target))) return;
    config.onOutside?.(event);
  }

  function handleKey(event) {
    if (config.enabled === false) return;
    if (event.key === 'Escape') config.onOutside?.(event);
  }

  // A tick's delay is enough to let the opening click finish dispatching.
  // Deliberately a timer rather than requestAnimationFrame: rAF doesn't run
  // while the tab isn't compositing, which would leave the popup permanently
  // disarmed in a background window.
  const armTimer = setTimeout(arm, 0);
  window.addEventListener('pointerdown', handle, true);
  window.addEventListener('keydown', handleKey);

  return {
    update(next = {}) {
      config = next;
    },
    destroy() {
      clearTimeout(armTimer);
      window.removeEventListener('pointerdown', handle, true);
      window.removeEventListener('keydown', handleKey);
    }
  };
}
