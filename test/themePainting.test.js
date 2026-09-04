import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  themeKey,
  needsFullRepaint,
  paintAll,
  paintUnpainted
} from '../src/utils/themePainting.js';

const THEME = { bgColor: '#101014', textColor: '#ffffff' };
const OTHER = { bgColor: '#f8efe3', textColor: '#4a3725' };

const block = (over = {}) => ({
  id: 'b1',
  bgColor: '#000000',
  textColor: '#ffffff',
  ...over
});

test('the theme is compared by its colours, not by the object holding them', () => {
  assert.equal(themeKey({ ...THEME }), themeKey({ ...THEME }));
  assert.notEqual(themeKey(THEME), themeKey(OTHER));
});

test('turning the switch on repaints, because nothing has been painted yet', () => {
  assert.equal(needsFullRepaint(null, THEME), true);
});

test('the same theme twice does not repaint', () => {
  assert.equal(needsFullRepaint(themeKey(THEME), { ...THEME }), false);
});

test('a theme whose colours moved repaints', () => {
  assert.equal(needsFullRepaint(themeKey(THEME), OTHER), true);
});

test('painting stashes what the block had, so the switch can be turned off', () => {
  const [out] = paintAll([block()], THEME);
  assert.equal(out.bgColor, THEME.bgColor);
  assert.equal(out.textColor, THEME.textColor);
  assert.equal(out._baseBgColor, '#000000');
  assert.equal(out._baseTextColor, '#ffffff');
});

test('painting an already-painted block again changes nothing at all', () => {
  const once = paintAll([block()], THEME);
  const twice = paintAll(once, THEME);
  // the same array back is the signal not to write history for a no-op
  assert.equal(twice, once);
});

test('a stash is never overwritten, so the original colour survives a theme change', () => {
  const once = paintAll([block()], THEME);
  const [out] = paintAll(once, OTHER);
  assert.equal(out.bgColor, OTHER.bgColor);
  assert.equal(out._baseBgColor, '#000000');
});

// The bug this file exists for.
test('a colour the user picked is left alone when blocks change', () => {
  const [afterPaint] = paintAll([block()], THEME);
  // the user opens the picker and chooses red on a block the theme has had
  const hand = { ...afterPaint, bgColor: '#cc2929' };
  const blocks = [hand];

  const next = paintUnpainted(blocks, THEME);

  // the very same array back: nothing was rewritten, so no history entry
  assert.equal(next, blocks, 'nothing should have been rewritten');
  assert.equal(next[0].bgColor, '#cc2929', 'the picked colour must survive');
});

test('a block that has never been painted joins the theme', () => {
  const fresh = block({ id: 'new', bgColor: '#123456' });
  const [out] = paintUnpainted([fresh], THEME);
  assert.equal(out.bgColor, THEME.bgColor);
  assert.equal(out._baseBgColor, '#123456');
});

test('a new block is caught without disturbing the ones beside it', () => {
  const [old] = paintAll([block({ id: 'old' })], THEME);
  const hand = { ...old, bgColor: '#cc2929' };
  const fresh = block({ id: 'new', bgColor: '#123456' });

  const next = paintUnpainted([hand, fresh], THEME);

  assert.equal(next[0].bgColor, '#cc2929');
  assert.equal(next[1].bgColor, THEME.bgColor);
});

test('painting bumps the version, so a block that caches its colours redraws', () => {
  const [out] = paintAll([block({ _version: 3 })], THEME);
  assert.equal(out._version, 4);
});
