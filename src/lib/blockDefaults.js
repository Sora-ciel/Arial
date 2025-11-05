/**
 * Each block type declares which properties should be considered "major"
 * edits. When any of these keys change we store a fresh entry in the undo
 * history so the user can easily step backwards.
 */
export const DEFAULT_HISTORY_TRIGGERS = {
  text: ['position', 'size', 'bgColor', 'textColor'],
  cleantext: ['position', 'size', 'bgColor', 'textColor'],
  image: ['position', 'size', 'bgColor', 'textColor', 'src'],
  music: [
    'position',
    'size',
    'bgColor',
    'textColor',
    'trackUrl',
    'title',
    'content'
  ],
  embed: ['position', 'size', 'bgColor', 'textColor', 'content'],
  __default: [
    'position',
    'size',
    'bgColor',
    'textColor',
    'content',
    'src',
    'trackUrl',
    'title'
  ]
};

/**
 * The editor currently offers two presentation modes. We keep this list in one
 * place so every helper can agree on which modes exist.
 */
export const KNOWN_MODES = ['default', 'simple'];

/**
 * Ensure a block has a populated `historyTriggers` list. Imported saves may
 * omit the field, so we silently fill it here.
 */
export function applyHistoryTriggers(block) {
  const triggers =
    block.historyTriggers ??
    DEFAULT_HISTORY_TRIGGERS[block.type] ??
    DEFAULT_HISTORY_TRIGGERS.__default;

  return { ...block, historyTriggers: triggers };
}

/**
 * Create a brand new block with sensible defaults. We assign an id, position
 * and size so the caller can place the block directly onto the canvas.
 */
export function createDefaultBlock(type = 'text') {
  return applyHistoryTriggers({
    id: crypto.randomUUID(),
    type,
    content: '',
    src: '',
    position: { x: 100, y: 100 },
    size: { width: 300, height: 200 },
    bgColor: '#000000',
    textColor: '#ffffff',
    _version: 0
  });
}
