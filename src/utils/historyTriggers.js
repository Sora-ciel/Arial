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

export function applyHistoryTriggers(block) {
  const triggers =
    block.historyTriggers ??
    DEFAULT_HISTORY_TRIGGERS[block.type] ??
    DEFAULT_HISTORY_TRIGGERS.__default;
  return { ...block, historyTriggers: triggers };
}
