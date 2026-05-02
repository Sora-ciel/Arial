export const MODE_DEFINITIONS = {
  default: {
    id: 'default',
    label: 'Canvas Mode',
    addBlockTypes: ['text', 'cleantext', 'image', 'music', 'embed'],
    showRightControls: true
  },
  simple: {
    id: 'simple',
    label: 'Simple Note Mode',
    addBlockTypes: ['text', 'cleantext', 'image', 'music', 'embed'],
    showRightControls: true,
    settings: { simpleColumns: true }
  },
  single: {
    id: 'single',
    label: 'Single Note Mode',
    addBlockTypes: ['text', 'cleantext'],
    showRightControls: true
  },
  habit: {
    id: 'habit',
    label: 'Habit Tracker Mode',
    addBlockTypes: [],
    showRightControls: false
  },
  task: {
    id: 'task',
    label: 'Task Mode',
    addBlockTypes: ['text', 'cleantext', 'image', 'music', 'embed', 'task'],
    showRightControls: true
  },
  birthday: {
    id: 'birthday',
    label: 'Birthday Mode',
    addBlockTypes: [],
    showRightControls: false,
    requiresUnlock: true
  }
};

export const MODE_ORDER = ['default', 'simple', 'single', 'habit', 'task', 'birthday'];

export function getModeDefinition(mode) {
  return MODE_DEFINITIONS[mode] || MODE_DEFINITIONS.single;
}

export function getModeOptions({ birthdayModeUnlocked = false } = {}) {
  return MODE_ORDER.map((id) => {
    const def = MODE_DEFINITIONS[id];
    const locked = def.requiresUnlock && !birthdayModeUnlocked;
    return {
      id,
      label: locked ? `${def.label} 🔒` : def.label,
      locked
    };
  });
}
