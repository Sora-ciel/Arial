export const CONTROL_COLOR_DEFAULTS = {
  left: {
    panelBg: '#111111b0',
    textColor: '#ffffff',
    buttonBg: '#333333',
    buttonText: '#ffffff',
    borderColor: '#444444',
    inputBg: '#1d1d1d'
  },
  right: {
    panelBg: '#222222',
    textColor: '#ffffff',
    buttonBg: '#222222',
    buttonText: '#ffffff',
    borderColor: '#444444'
  },
  canvas: {
    outerBg: '#000000',
    innerBg: '#000000'
  }
};

export const BLOCK_THEME_DEFAULTS = {
  borderColor: 'rgba(255, 255, 255, 0.22)',
  borderWidth: '1px',
  borderRadius: '14px',
  shadow:
    '0 18px 45px rgba(0, 0, 0, 0.5), 0 0 22px rgba(88, 160, 255, 0.08)',
  focusOutline: 'rgba(110, 168, 255, 0.85)',
  focusShadow:
    '0 0 0 2px rgba(110, 168, 255, 0.35), 0 0 12px rgba(110, 168, 255, 0.5)',
  headerBg: 'var(--bg)',
  headerText: 'var(--text)',
  headerFont: "'Inter', system-ui, sans-serif",
  headerLetterSpacing: '0.06em',
  headerTransform: 'uppercase',
  bodyFont: "'Inter', system-ui, sans-serif",
  accentColor: '#ff5f5f',
  accentText: '#ffffff',
  controlRadius: '8px',
  mediaButtonBg: 'rgba(255, 255, 255, 0.08)',
  mediaButtonText: '#ffffff'
};

export const CUSTOM_THEME_ID = 'custom';
export const DEFAULT_PREVIEW_BG = 'rgba(20, 20, 24, 0.8)';

export function normalizeControlColors(raw = {}) {
  const left = {
    ...CONTROL_COLOR_DEFAULTS.left,
    ...(raw.left || {})
  };

  const right = {
    ...CONTROL_COLOR_DEFAULTS.right,
    ...(raw.right || {})
  };

  const canvas = {
    ...CONTROL_COLOR_DEFAULTS.canvas,
    ...(raw.canvas || {})
  };

  return { left, right, canvas };
}

export function normalizeBlockTheme(raw = {}) {
  return { ...BLOCK_THEME_DEFAULTS, ...(raw || {}) };
}
