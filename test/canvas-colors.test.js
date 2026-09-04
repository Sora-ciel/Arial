import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTROL_COLOR_DEFAULTS,
  normalizeCanvasColors,
  normalizeControlColors
} from '../src/utils/themeDefaults.js';

describe('normalizeCanvasColors', () => {
  // The point of the whole thing: a theme that names one background gets that
  // background, not one colour outside and a slightly different one inside.
  it('uses one colour for both when only the outer is given', () => {
    const canvas = normalizeCanvasColors({ outerBg: '#123456' });

    assert.equal(canvas.outerBg, '#123456');
    assert.equal(canvas.innerBg, '#123456');
  });

  it('uses one colour for both when only the inner is given', () => {
    const canvas = normalizeCanvasColors({ innerBg: '#abcdef' });

    assert.equal(canvas.outerBg, '#abcdef');
    assert.equal(canvas.innerBg, '#abcdef');
  });

  it('falls back to the default when a theme names neither', () => {
    const canvas = normalizeCanvasColors({});

    assert.equal(canvas.outerBg, CONTROL_COLOR_DEFAULTS.canvas.outerBg);
    assert.equal(canvas.innerBg, canvas.outerBg);
  });

  it('copes with nothing at all', () => {
    assert.equal(normalizeCanvasColors().innerBg, normalizeCanvasColors().outerBg);
    assert.equal(normalizeCanvasColors(null).innerBg, CONTROL_COLOR_DEFAULTS.canvas.innerBg);
  });

  // Naming both still works — a theme that genuinely wants the distinction can
  // have it. What cannot happen any more is drifting apart by omission.
  it('respects a theme that deliberately sets both', () => {
    const canvas = normalizeCanvasColors({ outerBg: '#000000', innerBg: '#111111' });

    assert.equal(canvas.outerBg, '#000000');
    assert.equal(canvas.innerBg, '#111111');
  });

  it('reaches the canvas through normalizeControlColors too', () => {
    const { canvas } = normalizeControlColors({ canvas: { outerBg: '#222222' } });
    assert.equal(canvas.innerBg, '#222222');
  });

  it('leaves the other panels alone', () => {
    const colors = normalizeControlColors({ canvas: { outerBg: '#333333' } });

    assert.equal(colors.left.panelBg, CONTROL_COLOR_DEFAULTS.left.panelBg);
    assert.equal(colors.right.panelBg, CONTROL_COLOR_DEFAULTS.right.panelBg);
  });

  it('starts from a matched pair by default', () => {
    assert.equal(
      CONTROL_COLOR_DEFAULTS.canvas.outerBg,
      CONTROL_COLOR_DEFAULTS.canvas.innerBg,
      'the built-in default must not be the thing that introduces a seam'
    );
  });
});
