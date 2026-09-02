import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isSyncableThemeId,
  themeForSync,
  themeFromSync,
  reconcileThemes,
  themeChanged
} from '../src/utils/themeSync.js';

const theme = (id, updatedAt, extra = {}) => ({
  id,
  name: id,
  description: 'Custom theme',
  controlColors: { left: { panelBg: '#111' } },
  blockTheme: { accentColor: '#ff5f5f' },
  previewBg: '#000',
  createdAt: 1,
  updatedAt,
  ...extra
});

describe('isSyncableThemeId', () => {
  it('accepts an ordinary slug', () => {
    assert.equal(isSyncableThemeId('midnight-blue'), true);
  });

  // The same danger a blank folder name was: `themes/${id}` with a blank id
  // collapses to the node holding every theme, and the write replaces the lot.
  // Ids are slugified from a user-typed name, so a name of pure punctuation
  // arrives here empty.
  it('refuses an empty id', () => {
    assert.equal(isSyncableThemeId(''), false);
  });

  it('refuses the characters a database key cannot hold', () => {
    for (const id of ['a.b', 'a#b', 'a$b', 'a/b', 'a[b', 'a]b']) {
      assert.equal(isSyncableThemeId(id), false, `${id} should be refused`);
    }
  });

  it('refuses anything that is not a string', () => {
    assert.equal(isSyncableThemeId(undefined), false);
    assert.equal(isSyncableThemeId(null), false);
    assert.equal(isSyncableThemeId(42), false);
  });
});

describe('themeForSync', () => {
  it('keeps the fields that describe the theme', () => {
    const out = themeForSync(theme('dusk', 500));

    assert.equal(out.id, 'dusk');
    assert.equal(out.name, 'dusk');
    assert.deepEqual(out.blockTheme, { accentColor: '#ff5f5f' });
    assert.equal(out.updatedAt, 500);
  });

  // Where a theme came from is a fact about this device, not about the theme.
  it('drops the local-only flag', () => {
    const out = themeForSync(theme('dusk', 500, { isCustom: true }));
    assert.equal(out.isCustom, undefined);
  });

  // Themes written before syncing existed have only createdAt. Inheriting it
  // means an untouched old theme loses to any edit made since, which is the
  // right way round.
  it('falls back to createdAt when there is no updatedAt', () => {
    const legacy = { id: 'old', name: 'old', createdAt: 123 };
    assert.equal(themeForSync(legacy).updatedAt, 123);
  });

  it('stamps both when a theme has neither', () => {
    const out = themeForSync({ id: 'bare', name: 'bare' }, 999);
    assert.equal(out.updatedAt, 999);
    assert.equal(out.createdAt, 999);
  });

  it('refuses a theme that cannot be keyed', () => {
    assert.equal(themeForSync({ id: '', name: 'x' }), null);
    assert.equal(themeForSync({ id: 'a/b', name: 'x' }), null);
    assert.equal(themeForSync(null), null);
  });
});

describe('themeFromSync', () => {
  it('puts the local-only flag back', () => {
    assert.equal(themeFromSync(theme('dusk', 1)).isCustom, true);
  });

  it('refuses a malformed record rather than letting it into the picker', () => {
    assert.equal(themeFromSync({ id: '' }), null);
    assert.equal(themeFromSync(undefined), null);
  });
});

describe('reconcileThemes', () => {
  const synced = (id, updatedAt, extra = {}) =>
    theme(id, updatedAt, { syncedAt: 50, ...extra });

  it('takes the newer of two copies', () => {
    const { themes } = reconcileThemes(
      [synced('a', 100, { name: 'local' })],
      [theme('a', 200, { name: 'remote' })]
    );

    assert.equal(themes.length, 1);
    assert.equal(themes[0].name, 'remote');
  });

  it('keeps a newer local edit and offers to push it', () => {
    const { themes, toUpload } = reconcileThemes(
      [synced('a', 300, { name: 'local' })],
      [theme('a', 200, { name: 'remote' })]
    );

    assert.equal(themes[0].name, 'local');
    assert.deepEqual(toUpload.map(t => t.id), ['a'], 'the cloud is behind and should be caught up');
  });

  // A tie goes to the cloud so devices converge rather than each staying
  // certain it is right — and nobody uploads, so there is no loop either way.
  it('defers to the cloud on a tie, and asks for no upload', () => {
    const { themes, toUpload } = reconcileThemes(
      [synced('a', 200, { name: 'local' })],
      [theme('a', 200, { name: 'remote' })]
    );

    assert.equal(themes[0].name, 'remote');
    assert.deepEqual(toUpload, []);
  });

  it('brings down a theme only the cloud has', () => {
    const { themes, toUpload } = reconcileThemes([], [theme('b', 1)]);

    assert.deepEqual(themes.map(t => t.id), ['b']);
    assert.deepEqual(toUpload, []);
  });

  // The pair of cases that look identical from this device, and are not.
  it('uploads a theme that has never been in the cloud', () => {
    const madeOffline = theme('new-one', 100); // no syncedAt
    const { themes, toUpload } = reconcileThemes([madeOffline], []);

    assert.deepEqual(themes.map(t => t.id), ['new-one']);
    assert.deepEqual(toUpload.map(t => t.id), ['new-one']);
  });

  it('lets go of a synced theme the cloud no longer has', () => {
    const { themes, toUpload } = reconcileThemes([synced('gone', 100)], []);

    assert.deepEqual(themes, [], 'deleted on another device');
    assert.deepEqual(toUpload, []);
  });

  it('does both at once without confusing them', () => {
    const { themes, toUpload } = reconcileThemes(
      [synced('deleted-elsewhere', 1), theme('made-offline', 1)],
      []
    );

    assert.deepEqual(themes.map(t => t.id), ['made-offline']);
    assert.deepEqual(toUpload.map(t => t.id), ['made-offline']);
  });

  it('keeps the local order and appends what only the cloud has', () => {
    const { themes } = reconcileThemes(
      [synced('a', 1), synced('b', 1), synced('c', 1)],
      [theme('a', 1), theme('b', 1), theme('c', 2), theme('d', 1)]
    );

    assert.deepEqual(themes.map(t => t.id), ['a', 'b', 'c', 'd']);
  });

  it('compares on createdAt when a side has no updatedAt', () => {
    const legacyLocal = { id: 'a', name: 'local', createdAt: 100, syncedAt: 1 };
    const { themes } = reconcileThemes([legacyLocal], [theme('a', 200, { name: 'remote' })]);

    assert.equal(themes[0].name, 'remote');
  });

  it('drops records that cannot be keyed from either side', () => {
    const { themes } = reconcileThemes(
      [theme('a', 1), { id: '', name: 'bad' }],
      [{ id: 'a/b', name: 'worse' }, null]
    );

    assert.deepEqual(themes.map(t => t.id), ['a']);
  });

  it('copes with either side being empty or missing', () => {
    assert.deepEqual(reconcileThemes([], []).themes, []);
    assert.equal(reconcileThemes(undefined, [theme('a', 1)]).themes.length, 1);
    assert.equal(reconcileThemes([theme('a', 1)], undefined).themes.length, 1);
  });
});

describe('themeChanged', () => {
  // A round trip is not an edit. Writing back an identical theme would stamp a
  // newer updatedAt, which makes it beat the identical copy everywhere else,
  // which makes those devices write it back — the loop two open windows once
  // got into over folders.
  it('is false for a theme that came straight back from the cloud', () => {
    const before = themeForSync(theme('a', 100));
    const after = themeFromSync({ ...before });

    assert.equal(themeChanged(before, themeForSync(after)), false);
  });

  it('ignores updatedAt alone', () => {
    assert.equal(themeChanged(theme('a', 100), theme('a', 999)), false);
  });

  it('notices a colour actually changing', () => {
    assert.equal(
      themeChanged(theme('a', 100), theme('a', 100, { previewBg: '#fff' })),
      true
    );
  });

  it('notices a nested colour changing', () => {
    assert.equal(
      themeChanged(
        theme('a', 100),
        theme('a', 100, { blockTheme: { accentColor: '#00ff00' } })
      ),
      true
    );
  });

  it('notices a rename', () => {
    assert.equal(themeChanged(theme('a', 1), theme('a', 1, { name: 'other' })), true);
  });
});
