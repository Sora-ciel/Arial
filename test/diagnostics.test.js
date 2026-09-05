import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FOLLOWS_BLOCK,
  summariseBlocks,
  flagSuspicions,
  buildDiagnostics,
  formatDiagnostics
} from '../src/utils/diagnostics.js';

const THEME = { bgColor: '#3a1d18', textColor: '#6fe3dc' };
const OLD = { bgColor: '#fffaf2', textColor: '#4a3725' };

const painted = (over = {}) => ({
  id: 'b1',
  type: 'text',
  bgColor: THEME.bgColor,
  textColor: THEME.textColor,
  _themedBgColor: THEME.bgColor,
  _themedTextColor: THEME.textColor,
  ...over
});

test('blocks are counted by type', () => {
  const out = summariseBlocks([painted(), painted({ type: 'music' }), painted({ type: 'music' })], THEME);
  assert.equal(out.total, 3);
  assert.deepEqual(out.byType, { text: 1, music: 2 });
});

test('a block wearing the active theme is themed and not stale', () => {
  const out = summariseBlocks([painted()], THEME);
  assert.deepEqual(
    { themed: out.themed, stale: out.stale, handPicked: out.handPicked, unpainted: out.unpainted },
    { themed: 1, stale: 0, handPicked: 0, unpainted: 0 }
  );
});

// The folder bug, seen from the outside.
test('a block wearing an older theme is counted stale', () => {
  const old = painted({
    bgColor: OLD.bgColor,
    textColor: OLD.textColor,
    _themedBgColor: OLD.bgColor,
    _themedTextColor: OLD.textColor
  });
  assert.equal(summariseBlocks([old], THEME).stale, 1);
});

test('a block recoloured by hand is told apart from a stale one', () => {
  const hand = painted({ bgColor: '#cc2929' });
  const out = summariseBlocks([hand], THEME);
  assert.equal(out.handPicked, 1);
  assert.equal(out.stale, 0);
});

test('a block the theme has never had is counted separately', () => {
  const out = summariseBlocks([{ id: 'x', type: 'text', bgColor: '#000', textColor: '#fff' }], THEME);
  assert.equal(out.unpainted, 1);
  assert.equal(out.themed, 0);
});

test('nothing throws on a missing block list', () => {
  assert.equal(summariseBlocks(undefined, THEME).total, 0);
  assert.equal(summariseBlocks(null, THEME).total, 0);
});

// ── the notes, which are the point ────────────────────────────────

test('a pinned header background is called out by name', () => {
  const notes = flagSuspicions({ blockTheme: { headerBg: '#3a1d18' }, blocks: {}, followTheme: {} });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /Header background is pinned/);
  assert.match(notes[0], /#3a1d18/);
});

test('a header set to follow its block raises nothing', () => {
  const notes = flagSuspicions({ blockTheme: { headerBg: FOLLOWS_BLOCK }, blocks: {}, followTheme: {} });
  assert.deepEqual(notes, []);
});

test('an opacity below full is reported, at full it is not', () => {
  const low = flagSuspicions({ blockTheme: { bgOpacity: 20, headerOpacity: 100 }, blocks: {}, followTheme: {} });
  assert.equal(low.length, 1);
  assert.match(low[0], /Block background opacity is 20%/);

  const full = flagSuspicions({
    blockTheme: { bgOpacity: 100, headerOpacity: 100, textOpacity: 100 },
    blocks: {},
    followTheme: {}
  });
  assert.deepEqual(full, []);
});

test('stale blocks are only worth reporting while the switch is on', () => {
  const on = flagSuspicions({ blockTheme: {}, blocks: { stale: 3, themed: 3 }, followTheme: { allFolders: true } });
  assert.ok(on.some((n) => /3 block\(s\) still wear a theme/.test(n)));

  const off = flagSuspicions({ blockTheme: {}, blocks: { stale: 3, themed: 3 }, followTheme: {} });
  assert.ok(off.some((n) => /Follow-theme is off/.test(n)));
  assert.ok(!off.some((n) => /still wear a theme/.test(n)));
});

test('a header that does not match its body as drawn is reported', () => {
  const notes = flagSuspicions({
    blockTheme: {},
    blocks: {},
    followTheme: {},
    samples: [{ label: 'Text', bodyBg: 'rgb(29, 14, 12)', headerBg: 'rgb(58, 29, 24)' }]
  });
  assert.ok(notes.some((n) => /header rgb\(58, 29, 24\) does not match body/.test(n)));
});

test('a block with no background at all is called out', () => {
  const notes = flagSuspicions({
    blockTheme: {},
    blocks: {},
    followTheme: {},
    samples: [{ label: 'Text', bodyBg: 'rgba(0, 0, 0, 0)', headerBg: 'rgba(0, 0, 0, 0)' }]
  });
  assert.ok(notes.some((n) => /no background at all/.test(n)));
});

// ── the whole thing ───────────────────────────────────────────────

test('a report carries its own notes', () => {
  const report = buildDiagnostics({
    version: '0.8.51',
    blockTheme: { headerBg: '#111111' },
    activeColors: THEME,
    blocks: [painted()],
    followTheme: { allFolders: true }
  });
  assert.equal(report.version, '0.8.51');
  assert.ok(report.notes.some((n) => /pinned/.test(n)));
});

test('the text names the version, the theme and the switches', () => {
  const text = formatDiagnostics(
    buildDiagnostics({
      version: '0.8.51',
      platform: 'web',
      mode: 'default',
      folder: 'FolderB',
      theme: { id: 'copper', name: 'Copper Lagoon', customCount: 2 },
      blockTheme: { headerBg: FOLLOWS_BLOCK, bgOpacity: 100, headerOpacity: 100, textOpacity: 100 },
      activeColors: THEME,
      blocks: [painted(), painted({ type: 'music' })],
      followTheme: { allFolders: true },
      library: { tracks: 4, playlists: 2 }
    })
  );
  assert.match(text, /version 0\.8\.51 · web/);
  assert.match(text, /Copper Lagoon \(copper\)/);
  assert.match(text, /all folders=on/);
  assert.match(text, /text×1, music×1/);
  assert.match(text, /4 track\(s\), 2 playlist\(s\)/);
});

test('an empty app still produces a readable report', () => {
  const text = formatDiagnostics(buildDiagnostics({}));
  assert.match(text, /Austavia diagnostics/);
  assert.match(text, /blocks: 0/);
});

// A theme only misbehaves while it is active, so a snapshot taken under a
// different one must still show what the others would do.
test('a pinned header on a theme that is not active is still reported', () => {
  const report = buildDiagnostics({
    theme: { id: 'copper-lagoon', name: 'Copper Lagoon' },
    blockTheme: { headerBg: FOLLOWS_BLOCK },
    themes: [
      { id: 'copper-lagoon', name: 'Copper Lagoon', blockTheme: { headerBg: FOLLOWS_BLOCK } },
      { id: 'mine', name: 'My theme', isCustom: true, blockTheme: { headerBg: '#221111' } }
    ]
  });
  assert.ok(report.notes.some((n) => /Custom theme "My theme" pins its header/.test(n)));
  assert.match(formatDiagnostics(report), /My theme \[custom\] — header #221111/);
});

// The real report: four built-in themes use gradient headers on purpose, and
// burying the one genuine finding under them is how a reader learns to skip
// this section.
test('built-in themes are listed but never flagged', () => {
  const report = buildDiagnostics({
    themes: [
      { id: 'aurora', name: 'Aurora Glass', blockTheme: { headerBg: 'linear-gradient(135deg, #082, #0e3)' } },
      { id: 'paper', name: 'Paper Notebook', blockTheme: { headerBg: 'linear-gradient(120deg, #f9f, #f0e)' } }
    ]
  });
  assert.deepEqual(report.notes, [], 'a theme shipped that way is not a fault');
  assert.match(formatDiagnostics(report), /Aurora Glass — header linear-gradient/);
});

test('a custom theme left nearly see-through is called out', () => {
  const report = buildDiagnostics({
    themes: [
      { id: 'copy', name: 'Custom theme Copy', isCustom: true,
        blockTheme: { headerBg: FOLLOWS_BLOCK, bgOpacity: 6, headerOpacity: 15, textOpacity: 100 } }
    ]
  });
  const notes = report.notes.join(' | ');
  assert.match(notes, /block background opacity at 6%/);
  assert.match(notes, /nearly see-through/);
  assert.match(notes, /block header opacity at 15%/);
  assert.ok(!/text opacity/.test(notes), 'a dial left at full is not worth a line');
});

test('themes are listed with their opacities', () => {
  const text = formatDiagnostics(
    buildDiagnostics({
      themes: [{ id: 'a', name: 'A', blockTheme: { headerBg: FOLLOWS_BLOCK, bgOpacity: 40, headerOpacity: 100, textOpacity: 100 } }]
    })
  );
  assert.match(text, /A — header var\(--bg\) · opacity 40%\/100%\/100%/);
});

// The bug the first two reports missed: the block measured correctly and
// something else was painted on top of it.
test('a layer painted over a block is reported, not the block underneath', () => {
  const notes = flagSuspicions({
    blockTheme: {},
    blocks: {},
    followTheme: {},
    samples: [{
      label: 'Text (cleantext)',
      bodyBg: 'rgb(58, 29, 24)',
      headerBg: 'rgb(58, 29, 24)',
      coveredBy: 'tiptap-wrap rgb(29, 14, 12)'
    }]
  });
  const joined = notes.join(' | ');
  assert.match(joined, /has something painted over it: tiptap-wrap rgb\(29, 14, 12\)/);
  assert.match(joined, /block itself is rgb\(58, 29, 24\)/);
});

test('a block with nothing painted over it raises nothing', () => {
  const notes = flagSuspicions({
    blockTheme: {},
    blocks: {},
    followTheme: {},
    samples: [{ label: 'Text', bodyBg: 'rgb(58, 29, 24)', headerBg: 'rgb(58, 29, 24)', coveredBy: null }]
  });
  assert.deepEqual(notes, []);
});
