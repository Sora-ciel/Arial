/**
 * "Recolor this folder's blocks to match the theme", decided in one place.
 *
 * This lived as a single reactive line in App.svelte:
 *
 *   $: if (blocksFollowTheme && blocks.length) paintBlocksWithTheme(newBlockColors);
 *
 * which names `blocks` in its condition, so it re-ran on every change to any
 * block — including the change the user had just made. Picking a colour set it
 * and the repaint immediately put the theme's colour back. The block never
 * moved, so the colour picker looked broken: not in one folder or one mode, but
 * everywhere, for as long as the switch was on — and the switch is remembered
 * per device, so once on it stayed on. The picker itself was fine the whole
 * time, which is why nothing about it looked wrong.
 *
 * The switch has two moments and only one of them is a repaint:
 *
 *   - the theme's colours move (or the switch is turned on) — repaint every
 *     block, because that is what the switch is for;
 *   - a block arrives — paint only blocks that have never been painted, so a
 *     new block joins the theme and a hand-picked colour is left alone.
 *
 * Telling those apart is what `_baseBgColor` already does. Painting stashes the
 * block's own colours so the switch can be turned off again, so "has a stash"
 * means "the theme has had this one already" — which is exactly the test for
 * whether a colour on it now was chosen by the user.
 */

/**
 * The theme colours, reduced to something comparable.
 *
 * The colours arrive as a fresh object every time the theme is recomputed, so
 * identity says nothing about whether anything actually changed; the values
 * are the only honest answer.
 */
export function themeKey(colors = {}) {
  return `${colors.bgColor ?? ''}|${colors.textColor ?? ''}`;
}

/**
 * Whether a full repaint is owed, given the last theme actually painted.
 *
 * `lastKey` is null when the switch is off or has just been turned on, which is
 * why turning it on repaints: there is no record of having painted anything.
 */
export function needsFullRepaint(lastKey, colors) {
  return themeKey(colors) !== lastKey;
}

function painted(block, colors) {
  return {
    ...block,
    _baseBgColor: block._baseBgColor !== undefined ? block._baseBgColor : block.bgColor,
    _baseTextColor: block._baseTextColor !== undefined ? block._baseTextColor : block.textColor,
    bgColor: colors.bgColor,
    textColor: colors.textColor,
    _version: (block._version || 0) + 1
  };
}

/**
 * Every block onto the theme's colours.
 *
 * Returns the array it was given when nothing needed changing, so the caller
 * can skip the reassignment and the history entry that goes with it. A block
 * already stashed and already wearing these colours is left untouched — that is
 * what makes running this twice free, and running it at all safe.
 */
export function paintAll(blocks, colors) {
  let touched = false;
  const next = blocks.map((block) => {
    const alreadyStashed = block._baseBgColor !== undefined;
    if (alreadyStashed && block.bgColor === colors.bgColor && block.textColor === colors.textColor) {
      return block;
    }
    touched = true;
    return painted(block, colors);
  });
  return touched ? next : blocks;
}

/**
 * Only the blocks the theme has never had.
 *
 * This is the pass that runs when blocks change, so it must not touch a colour
 * the user chose. A block carrying a stash has been painted before; whatever
 * colour it wears now it was given deliberately, and it keeps it until the
 * theme itself moves.
 */
export function paintUnpainted(blocks, colors) {
  let touched = false;
  const next = blocks.map((block) => {
    if (block._baseBgColor !== undefined) return block;
    touched = true;
    return painted(block, colors);
  });
  return touched ? next : blocks;
}
