/**
 * A snapshot of what the app is actually doing, in one paste.
 *
 * Written after two bugs cost far more than they should have, both for the same
 * reason: the code was visible and the *state* was not. The colour picker
 * "didn't work anywhere" — it worked in every configuration tried, because the
 * one that mattered was a switch nobody thought to mention. Block headers
 * stopped matching block bodies — reproducible in seconds with the right theme,
 * and not at all with any other.
 *
 * Neither threw. That is the shape of nearly every bug here: a wrong value, not
 * an exception. Error reporting would have caught neither. What was missing was
 * a plain answer to "what is switched on, and what colour is that block".
 *
 * So this does two things. It records the state, and then it reads it — the
 * notes at the end are the part worth having, because most of these bugs
 * announce themselves once the values sit side by side. A header pinned to a
 * fixed colour explains a header that will not follow its block. Blocks still
 * wearing a theme that is no longer active explain a folder that opened wrong.
 * Saying so beats making someone spot it.
 *
 * Pure on purpose: everything here is passed in, so it can be tested without a
 * browser. The measuring and the copying happen at the call site.
 */

/** The value a header background holds when it is meant to follow its block. */
export const FOLLOWS_BLOCK = 'var(--bg)';

const pct = (n) => (Number.isFinite(Number(n)) ? `${Number(n)}%` : String(n));

/**
 * Blocks grouped by type, with the colour facts that matter.
 *
 * `themed` counts blocks wearing paint from *some* theme; `stale` counts those
 * whose paint is not the theme now in force — the exact condition that made a
 * folder open in the wrong colours.
 */
export function summariseBlocks(blocks = [], activeColors = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  const byType = {};
  let themed = 0;
  let stale = 0;
  let handPicked = 0;
  let unpainted = 0;

  for (const block of list) {
    const type = block?.type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;

    if (block?._themedBgColor === undefined) {
      unpainted += 1;
      continue;
    }
    themed += 1;
    const wearing = block.bgColor === block._themedBgColor && block.textColor === block._themedTextColor;
    if (!wearing) handPicked += 1;
    else if (block._themedBgColor !== activeColors.bgColor || block._themedTextColor !== activeColors.textColor) {
      stale += 1;
    }
  }

  return { total: list.length, byType, themed, stale, handPicked, unpainted };
}

/**
 * What looks wrong, in the reporter's own terms.
 *
 * Each note names something that is true of the state rather than something
 * that might be true of the code, so a wrong note is obvious rather than
 * misleading.
 */
export function flagSuspicions(report) {
  const notes = [];
  const bt = report.blockTheme || {};
  const blocks = report.blocks || {};
  const follow = report.followTheme || {};

  if (bt.headerBg && bt.headerBg !== FOLLOWS_BLOCK) {
    notes.push(
      `Header background is pinned to "${bt.headerBg}", so block headers will NOT match block bodies. ` +
        `Set it back to ${FOLLOWS_BLOCK} for them to match.`
    );
  }

  for (const [key, label] of [
    ['bgOpacity', 'Block background'],
    ['headerOpacity', 'Block header'],
    ['textOpacity', 'Text']
  ]) {
    const value = Number(bt[key]);
    if (Number.isFinite(value) && value < 100) {
      notes.push(`${label} opacity is ${value}%, so what is behind shows through.`);
    }
  }

  if (follow.folder || follow.allFolders) {
    if (blocks.stale) {
      notes.push(
        `${blocks.stale} block(s) still wear a theme that is not the active one — ` +
          `they should have been repainted when this folder opened.`
      );
    }
    if (blocks.handPicked) {
      notes.push(
        `${blocks.handPicked} block(s) have a colour chosen by hand, which is why they do not follow the theme.`
      );
    }
  } else if (blocks.themed) {
    notes.push('Follow-theme is off, so block colours are whatever they were last set to.');
  }

  for (const sample of report.samples || []) {
    if (sample.bodyBg && sample.headerBg && sample.bodyBg !== sample.headerBg) {
      notes.push(`Block "${sample.label || sample.id}": header ${sample.headerBg} does not match body ${sample.bodyBg}.`);
    }
    if (sample.bodyBg === 'rgba(0, 0, 0, 0)') {
      notes.push(`Block "${sample.label || sample.id}" has no background at all — the canvas shows through.`);
    }
  }

  if (report.sync?.lastError) notes.push(`Last sync error: ${report.sync.lastError}`);

  return notes;
}

/** The snapshot, assembled from what the app knows about itself. */
export function buildDiagnostics(input = {}) {
  const report = {
    generatedAt: new Date(input.now || Date.now()).toISOString(),
    version: input.version || 'unknown',
    platform: input.platform || 'unknown',
    mode: input.mode || 'unknown',
    folder: input.folder || '(none)',
    theme: {
      id: input.theme?.id || '(none)',
      name: input.theme?.name || '(none)',
      custom: Boolean(input.theme?.custom),
      customCount: input.theme?.customCount ?? 0
    },
    blockTheme: input.blockTheme || {},
    activeColors: input.activeColors || {},
    canvas: input.canvas || {},
    followTheme: input.followTheme || {},
    blocks: summariseBlocks(input.blocks, input.activeColors),
    samples: input.samples || [],
    sync: input.sync || {},
    library: input.library || {}
  };
  report.notes = flagSuspicions(report);
  return report;
}

/** The snapshot as text, for pasting into a message. */
export function formatDiagnostics(report) {
  const bt = report.blockTheme || {};
  const b = report.blocks || {};
  const lines = [];

  lines.push(`Austavia diagnostics — ${report.generatedAt}`);
  lines.push(`version ${report.version} · ${report.platform}`);
  lines.push('');
  lines.push(`mode: ${report.mode}    folder: ${report.folder}`);
  lines.push(
    `theme: ${report.theme.name} (${report.theme.id})${report.theme.custom ? ' [custom]' : ''}` +
      ` · ${report.theme.customCount} custom theme(s) saved`
  );
  lines.push(
    `follow theme: this folder=${report.followTheme.folder ? 'on' : 'off'}` +
      `  all folders=${report.followTheme.allFolders ? 'on' : 'off'}`
  );
  lines.push('');

  lines.push('block theme');
  lines.push(`  headerBg    ${bt.headerBg ?? '(unset)'}`);
  lines.push(`  headerText  ${bt.headerText ?? '(unset)'}`);
  lines.push(`  borderColor ${bt.borderColor ?? '(unset)'}`);
  lines.push(
    `  opacity     bg ${pct(bt.bgOpacity)} · header ${pct(bt.headerOpacity)} · text ${pct(bt.textOpacity)}`
  );
  lines.push(
    `  new blocks  bg ${report.activeColors.bgColor ?? '?'} · text ${report.activeColors.textColor ?? '?'}`
  );
  lines.push(`  canvas      outer ${report.canvas.outerBg ?? '?'} · inner ${report.canvas.innerBg ?? '?'}`);
  lines.push('');

  const types = Object.entries(b.byType || {})
    .map(([type, n]) => `${type}×${n}`)
    .join(', ');
  lines.push(`blocks: ${b.total ?? 0}${types ? ` (${types})` : ''}`);
  lines.push(
    `  themed ${b.themed ?? 0} · stale ${b.stale ?? 0} · hand-picked ${b.handPicked ?? 0} · never painted ${b.unpainted ?? 0}`
  );

  if (report.samples?.length) {
    lines.push('');
    lines.push('as drawn');
    for (const s of report.samples) {
      lines.push(`  ${s.label || s.id}: body ${s.bodyBg} · header ${s.headerBg}`);
    }
  }

  lines.push('');
  lines.push(
    `sync: ${report.sync.signedIn ? 'signed in' : 'signed out'}` +
      ` · auto ${report.sync.autoSync ? 'on' : 'off'}` +
      (report.sync.lastError ? ` · last error: ${report.sync.lastError}` : '')
  );
  lines.push(`music: ${report.library.tracks ?? 0} track(s), ${report.library.playlists ?? 0} playlist(s)`);

  if (report.sync.log?.length) {
    lines.push('');
    lines.push('recent sync log');
    for (const entry of report.sync.log) lines.push(`  ${entry}`);
  }

  if (report.notes?.length) {
    lines.push('');
    lines.push('what looks wrong');
    for (const note of report.notes) lines.push(`  - ${note}`);
  }

  return lines.join('\n');
}
