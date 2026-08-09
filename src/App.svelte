<script>
  import { onMount, onDestroy, tick, setContext } from 'svelte';
  import RightControls from './advanced-param/RightControls.svelte';
  import LeftControls from './advanced-param/LeftControls.svelte';
  import AdvancedCssPage from './advanced-param/AdvancedCssPage.svelte';
  import ModeArea from './Modes/ModeSwitcher.svelte';
  import { saveBlocks, loadBlocks, deleteBlocks, listSavedBlocks } from './storage.js';
  import {
    isFirebaseConfigured,
    onAuthStateChange,
    signInWithGoogle,
    signOutUser,
    loadRemoteFile,
    loadRemoteIndex,
    saveRemoteFile,
    subscribeRemoteIndex,
    checkSyncCompatibility
  } from './firebaseClient.js';
  import {
    CONTROL_COLOR_DEFAULTS,
    BLOCK_THEME_DEFAULTS,
    CUSTOM_THEME_ID,
    DEFAULT_PREVIEW_BG,
    normalizeBlockTheme,
    normalizeControlColors
  } from './utils/themeDefaults.js';

  import { MODE_DEFINITIONS, MODE_ORDER, getModeDefinition } from "./Modes/modeRegistry.js";
  import { getCanvasViewport } from './canvasState.js';
  import { getOpeningViewportBox } from './utils/canvasFit.js';
  const BLOCK_THEME_STORAGE_KEY = 'blockTheme';
  const BLOCK_THEME_ID_STORAGE_KEY = 'blockThemeId';
  const CUSTOM_THEMES_STORAGE_KEY = 'customThemes';

  const BIRTHDAY_UNLOCK_STORAGE_KEY = 'birthdayModeAccess';
  const BIRTHDAY_MODE_PASSWORD = 'Birthday24H';
  const BIRTHDAY_MODE_DURATION_MS = 24 * 60 * 60 * 1000;
  const MOBILE_BREAKPOINT = 1024;

  const MEDIA_HEADER_HEIGHT = 30;
  const MEDIA_DEFAULT_WIDTH = 300;
  const MEDIA_DEFAULT_HEIGHT = 200;
  const MEDIA_FALLBACK_MAX_WIDTH = 400;
  const MEDIA_FALLBACK_MAX_HEIGHT = 300;
  // Margin below 1.0 so a newly placed media block reads as "fit to view"
  // without touching the edges of the screen.
  const MEDIA_FIT_MARGIN = 0.94;

  function getDefaultModeForViewport() {
    if (typeof window === 'undefined') return 'default';
    return window.innerWidth <= MOBILE_BREAKPOINT ? 'simple' : 'default';
  }


  function toCssVarName(key) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();
  }

  const STYLE_PRESETS = [
    {
      id: 'default-dark',
      name: 'Default Dark',
      description: 'Original midnight look with subtle neon glow.',
      controlColors: CONTROL_COLOR_DEFAULTS,
      blockTheme: normalizeBlockTheme({
        focusOutline: 'transparent',
        focusShadow: 'none'
      }),
      previewBg: 'rgba(16, 16, 20, 0.82)'
    },
    {
      id: 'aurora-glass',
      name: 'Aurora Glass',
      description: 'Frosted glass blocks with cyan lighting and cool controls.',
      controlColors: {
        left: {
          panelBg: '#06131fdd',
          textColor: '#e9fbff',
          buttonBg: '#0f2743',
          buttonText: '#7be0ff',
          borderColor: '#1a3a5f',
          inputBg: '#081a2f'
        },
        right: {
          panelBg: '#0a1727f0',
          textColor: '#e9fbff',
          buttonBg: '#10213a',
          buttonText: '#7be0ff',
          borderColor: '#1f3554'
        },
        canvas: {
          outerBg: '#050b14',
          innerBg: '#050b14'
        }
      },
      blockTheme: normalizeBlockTheme({
        borderColor: 'rgba(96, 210, 255, 0.35)',
        borderRadius: '18px',
        shadow:
          '0 30px 60px rgba(18, 56, 92, 0.65), 0 0 28px rgba(96, 210, 255, 0.32)',
        headerBg: 'linear-gradient(135deg, rgba(8, 32, 58, 0.95), rgba(14, 52, 82, 0.9))',
        headerText: '#7be0ff',
        headerFont: "'Chakra Petch', 'Segoe UI', sans-serif",
        headerLetterSpacing: '0.12em',
        bodyFont: "'Source Sans 3', 'Inter', sans-serif",
        accentColor: '#7be0ff',
        accentText: '#051320',
        mediaButtonBg: 'rgba(123, 224, 255, 0.18)',
        mediaButtonText: '#7be0ff'
      }),
      previewBg: 'rgba(8, 24, 38, 0.82)'
    },
    {
      id: 'paper-notebook',
      name: 'Paper Notebook',
      description: 'Warm stationery palette with serif typography and clean no-shadow blocks.',
      controlColors: {
        left: {
          panelBg: '#f6f0e8',
          textColor: '#4a3725',
          buttonBg: '#e4d6c8',
          buttonText: '#4a3725',
          borderColor: '#cdb9a6',
          inputBg: '#fff9f2'
        },
        right: {
          panelBg: '#fefbf7',
          textColor: '#4a3725',
          buttonBg: '#ead9c8',
          buttonText: '#4a3725',
          borderColor: '#d8c7b6'
        },
        canvas: {
          outerBg: '#f9f4ed',
          innerBg: '#f9f4ed'
        }
      },
      blockTheme: normalizeBlockTheme({
        borderColor: '#d3c2b4',
        borderWidth: '2px',
        borderRadius: '16px',
        shadow: 'none',
        focusOutline: '#b5835a',
        focusShadow: '0 0 0 2px rgba(181, 131, 90, 0.35), 0 0 14px rgba(181, 131, 90, 0.45)',
        headerBg: 'linear-gradient(120deg, #f9f2e8, #f0e2d2)',
        headerText: '#4a3725',
        headerFont: "'Cormorant Garamond', 'Georgia', serif",
        headerLetterSpacing: '0.02em',
        headerTransform: 'none',
        bodyFont: "'EB Garamond', 'Georgia', serif",
        accentColor: '#b05d3e',
        accentText: '#fff8f3',
        mediaButtonBg: '#e8d6c7',
        mediaButtonText: '#4a3725'
      }),
      previewBg: '#f8efe3'
    }
  ];

  const CONTROL_COLOR_STORAGE_KEY = 'controlColors';
  const LAST_SAVE_STORAGE_KEY = 'lastLoadedSave';
  const BOOT_LOAD_GUARD_STORAGE_KEY = 'bootLoadGuard';
  const CLOUD_SYNC_MEMORY_STORAGE_KEY = 'cloudSyncMemoryByFile';
  const AUTO_SYNC_ENABLED_STORAGE_KEY = 'autoSyncEnabled';
  const FALLBACK_SAVE_NAME = 'Fallback';
  const DEFAULT_MODE_SETTINGS = {
    simple: {
      columnCount: 2
    },
    single: {
      backgroundImage: '',
      backgroundImageMobile: '',
      bgOpacity: 0.35,
      bgBlur: 0,
      bgSize: 'cover'
    }
  };

  function normalizeModeSettings(settings) {
    const incomingSimple = settings?.simple || {};
    const incomingSingle = settings?.single || {};
    const clamp01 = (n, fallback) => {
      const v = Number(n);
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
    };
    return {
      ...DEFAULT_MODE_SETTINGS,
      simple: {
        ...DEFAULT_MODE_SETTINGS.simple,
        ...incomingSimple,
        columnCount: Math.max(1, Number.parseInt(incomingSimple.columnCount, 10) || DEFAULT_MODE_SETTINGS.simple.columnCount)
      },
      single: {
        ...DEFAULT_MODE_SETTINGS.single,
        ...incomingSingle,
        backgroundImage: typeof incomingSingle.backgroundImage === 'string' ? incomingSingle.backgroundImage : '',
        backgroundImageMobile: typeof incomingSingle.backgroundImageMobile === 'string' ? incomingSingle.backgroundImageMobile : '',
        bgOpacity: clamp01(incomingSingle.bgOpacity, DEFAULT_MODE_SETTINGS.single.bgOpacity),
        bgBlur: Math.max(0, Number(incomingSingle.bgBlur) || 0),
        bgSize: incomingSingle.bgSize === 'contain' ? 'contain' : 'cover'
      }
    };
  }

  function loadStoredCustomThemes() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const serialized = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
      if (!serialized) return [];
      const parsed = JSON.parse(serialized);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(theme => theme && theme.id && theme.name)
        .map(theme => ({
          ...theme,
          controlColors: normalizeControlColors(theme.controlColors),
          blockTheme: normalizeBlockTheme(theme.blockTheme),
          isCustom: true
        }));
    } catch (error) {
      return [];
    }
  }

  function loadStoredControlColors() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const serialized = localStorage.getItem(CONTROL_COLOR_STORAGE_KEY);
      if (!serialized) return null;
      const parsed = JSON.parse(serialized);
      return normalizeControlColors(parsed);
    } catch (error) {
      return null;
    }
  }

  function loadStoredBlockTheme() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const serializedTheme = localStorage.getItem(BLOCK_THEME_STORAGE_KEY);
      const storedId =
        localStorage.getItem(BLOCK_THEME_ID_STORAGE_KEY) || CUSTOM_THEME_ID;
      if (!serializedTheme) {
        return { theme: null, id: storedId };
      }
      const parsed = JSON.parse(serializedTheme);
      return { theme: normalizeBlockTheme(parsed), id: storedId };
    } catch (error) {
      return null;
    }
  }

  function loadStoredLastSaveName() {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(LAST_SAVE_STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function persistLastSaveName(name) {
    if (typeof localStorage === 'undefined') return;
    try {
      if (name) {
        localStorage.setItem(LAST_SAVE_STORAGE_KEY, name);
      } else {
        localStorage.removeItem(LAST_SAVE_STORAGE_KEY);
      }
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function loadBootLoadGuard() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(BOOT_LOAD_GUARD_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const pendingSaveName = typeof parsed.pendingSaveName === 'string'
        ? parsed.pendingSaveName
        : '';
      const startedAt = Number(parsed.startedAt);
      if (!pendingSaveName || !Number.isFinite(startedAt)) return null;
      const openingLastFile = parsed.openingLastFile === true;
      return { pendingSaveName, startedAt, openingLastFile };
    } catch (error) {
      return null;
    }
  }

  function startBootLoadGuard(pendingSaveName) {
    if (typeof localStorage === 'undefined' || !pendingSaveName) return;
    try {
      localStorage.setItem(
        BOOT_LOAD_GUARD_STORAGE_KEY,
        JSON.stringify({ pendingSaveName, startedAt: Date.now(), openingLastFile: true })
      );
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function clearBootLoadGuard() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(BOOT_LOAD_GUARD_STORAGE_KEY);
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function loadCloudSyncMemory() {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(CLOUD_SYNC_MEMORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function persistCloudSyncMemory(memory) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CLOUD_SYNC_MEMORY_STORAGE_KEY, JSON.stringify(memory || {}));
    } catch {
      /* ignore local persistence failure */
    }
  }

  function loadAutoSyncEnabled() {
    if (typeof localStorage === 'undefined') return true;
    try {
      const raw = localStorage.getItem(AUTO_SYNC_ENABLED_STORAGE_KEY);
      if (raw === null) return true;
      return raw === 'true';
    } catch {
      return true;
    }
  }

  function persistAutoSyncEnabled(enabled) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(AUTO_SYNC_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      /* ignore local persistence failure */
    }
  }


  function detectShiftSafeModeDuringStartup(waitMs = 700) {
    if (typeof window === 'undefined') return Promise.resolve(false);

    return new Promise(resolve => {
      let resolved = false;

      const finish = value => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('keydown', onKeyDown);
        resolve(value);
      };

      const onKeyDown = event => {
        if (event.key === 'Shift') {
          finish(true);
        }
      };

      window.addEventListener('keydown', onKeyDown);
      setTimeout(() => finish(false), waitMs);
    });
  }

  async function openFallbackSave(reason = '') {
    const fallbackPayload = { blocks: [], modeOrders: {} };
    await saveBlocks(FALLBACK_SAVE_NAME, fallbackPayload);

    currentSaveName = FALLBACK_SAVE_NAME;
    persistLastSaveName(FALLBACK_SAVE_NAME);
    blocks = [];
    focusedBlockId = null;
    modeOrders = ensureModeOrders(blocks, {});
    savedList = await listSavedBlocks();

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);

    if (reason) {
      await appAlert(`Opened ${FALLBACK_SAVE_NAME} because "${reason}" could not be loaded.`);
    }
  }

  function persistControlColors(colors) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        CONTROL_COLOR_STORAGE_KEY,
        JSON.stringify(colors)
      );
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function persistBlockTheme(theme, id = selectedThemeId) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        BLOCK_THEME_STORAGE_KEY,
        JSON.stringify(theme)
      );
      localStorage.setItem(
        BLOCK_THEME_ID_STORAGE_KEY,
        id || CUSTOM_THEME_ID
      );
    } catch (error) {
      /* ignore persistence failures */
    }
  }


  function loadBirthdayUnlockExpiry() {
    if (typeof localStorage === 'undefined') return 0;
    try {
      const raw = localStorage.getItem(BIRTHDAY_UNLOCK_STORAGE_KEY);
      if (!raw) return 0;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return 0;
      return parsed;
    } catch (error) {
      return 0;
    }
  }

  function persistBirthdayUnlockExpiry(expiresAt) {
    if (typeof localStorage === 'undefined') return;
    try {
      if (expiresAt > Date.now()) {
        localStorage.setItem(BIRTHDAY_UNLOCK_STORAGE_KEY, String(expiresAt));
      } else {
        localStorage.removeItem(BIRTHDAY_UNLOCK_STORAGE_KEY);
      }
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function persistCustomThemes(themes) {
    if (typeof localStorage === 'undefined') return;
    try {
      const serializable = themes.map(({
        id,
        name,
        description,
        controlColors,
        blockTheme,
        previewBg,
        createdAt
      }) => ({
        id,
        name,
        description,
        controlColors,
        blockTheme,
        previewBg,
        createdAt
      }));
      localStorage.setItem(
        CUSTOM_THEMES_STORAGE_KEY,
        JSON.stringify(serializable)
      );
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function slugify(value = '') {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function normalizeThemePayload(detail = {}) {
    const {
      name,
      description,
      controlColors: themeControlColors,
      blockTheme: themeBlock,
      previewBg
    } = detail;

    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return null;
    }

    const normalizedColors = normalizeControlColors(themeControlColors || controlColors);
    const normalizedBlock = normalizeBlockTheme(themeBlock || blockTheme);
    const safePreviewBg =
      typeof previewBg === 'string' && previewBg
        ? previewBg
        : currentThemePreviewBg || DEFAULT_PREVIEW_BG;

    return {
      name: trimmedName,
      description: (description || '').trim() || 'Custom theme',
      controlColors: normalizedColors,
      blockTheme: normalizedBlock,
      previewBg: safePreviewBg
    };
  }

  function createCustomThemePayload(payload, { baseId } = {}) {
    if (!payload) {
      return null;
    }

    const existingIds = new Set([...STYLE_PRESETS, ...customThemes].map(theme => theme.id));
    const slug = baseId || slugify(payload.name) || 'custom-theme';
    let uniqueId = slug;
    let counter = 1;

    while (existingIds.has(uniqueId)) {
      uniqueId = `${slug}-${counter}`;
      counter += 1;
    }

    return {
      id: uniqueId,
      name: payload.name,
      description: payload.description,
      controlColors: payload.controlColors,
      blockTheme: payload.blockTheme,
      previewBg: payload.previewBg,
      createdAt: Date.now(),
      isCustom: true
    };
  }

  let controlColors = normalizeControlColors();
  let blockTheme = normalizeBlockTheme();
  let selectedThemeId = 'default-dark';
  let customThemes = [];
  let currentThemePreviewBg = DEFAULT_PREVIEW_BG;
  let showAdvancedCssPage = false;

  $: availableThemes = [...STYLE_PRESETS, ...customThemes];

  function applyThemePreset(preset, { persistSelection = true } = {}) {
    if (!preset) return;
    const nextControlColors = normalizeControlColors(preset.controlColors);
    const nextBlockTheme = normalizeBlockTheme(preset.blockTheme);

    controlColors = nextControlColors;
    blockTheme = nextBlockTheme;
    selectedThemeId = preset.id;
    currentThemePreviewBg = preset.previewBg ?? DEFAULT_PREVIEW_BG;

    if (persistSelection) {
      persistControlColors(nextControlColors);
      persistBlockTheme(nextBlockTheme, preset.id);
    }
  }

  function handleControlColorChange(event) {
    const { section, side, key, value } = event.detail || {};
    const target = section || side;
    if (!target || !key) return;

    const nextSectionTheme = {
      ...controlColors[target],
      [key]: value
    };

    if (target === 'left' && key === 'panelBg') {
      nextSectionTheme.inputBg = value;
    }

    controlColors = {
      ...controlColors,
      [target]: nextSectionTheme
    };

    selectedThemeId = CUSTOM_THEME_ID;
    persistControlColors(controlColors);
    persistBlockTheme(blockTheme, CUSTOM_THEME_ID);
  }

  function handleBlockThemeChange(event) {
    const { key, value } = event.detail || {};
    if (!key) return;

    blockTheme = {
      ...blockTheme,
      [key]: value
    };

    selectedThemeId = CUSTOM_THEME_ID;
    persistBlockTheme(blockTheme, CUSTOM_THEME_ID);
  }

  function handlePreviewBgChange(event) {
    const { value } = event.detail || {};
    if (typeof value !== 'string') return;

    currentThemePreviewBg = value || DEFAULT_PREVIEW_BG;
    selectedThemeId = CUSTOM_THEME_ID;
  }

  function handleAdvancedThemeSave(event) {
    const payload = normalizeThemePayload(event.detail || {});
    if (!payload) return;

    const newTheme = createCustomThemePayload(payload);
    if (!newTheme) return;

    customThemes = [...customThemes, newTheme];
    persistCustomThemes(customThemes);

    applyThemePreset(newTheme);

    showAdvancedCssPage = false;
  }

  function handleAdvancedThemeUpdate(event) {
    const detail = event.detail || {};
    const { id } = detail;
    if (!id) return;

    const index = customThemes.findIndex(theme => theme.id === id);
    if (index === -1) return;

    const payload = normalizeThemePayload(detail);
    if (!payload) return;

    const existing = customThemes[index];
    const updatedTheme = {
      ...existing,
      ...payload
    };

    customThemes = [
      ...customThemes.slice(0, index),
      updatedTheme,
      ...customThemes.slice(index + 1)
    ];
    persistCustomThemes(customThemes);

    applyThemePreset(updatedTheme);
    showAdvancedCssPage = false;
  }

  function handleAdvancedThemeDelete(event) {
    const id = event.detail?.id;
    if (!id) return;

    const existing = customThemes.find(theme => theme.id === id);
    if (!existing) return;

    customThemes = customThemes.filter(theme => theme.id !== id);
    persistCustomThemes(customThemes);

    if (selectedThemeId === id) {
      const fallback = customThemes[customThemes.length - 1] || STYLE_PRESETS[0] || null;
      if (fallback) {
        applyThemePreset(fallback);
      } else {
        controlColors = normalizeControlColors();
        blockTheme = normalizeBlockTheme();
        selectedThemeId = CUSTOM_THEME_ID;
        currentThemePreviewBg = DEFAULT_PREVIEW_BG;
        persistControlColors(controlColors);
        persistBlockTheme(blockTheme, CUSTOM_THEME_ID);
      }
    }

    showAdvancedCssPage = false;
  }

  function handleAdvancedThemeDuplicate(event) {
    const payload = normalizeThemePayload(event.detail || {});
    if (!payload) return;

    const newTheme = createCustomThemePayload(payload);
    if (!newTheme) return;

    customThemes = [...customThemes, newTheme];
    persistCustomThemes(customThemes);

    applyThemePreset(newTheme);
    showAdvancedCssPage = false;
  }

  onMount(() => {
    const storedCustomThemes = loadStoredCustomThemes();
    if (storedCustomThemes.length) {
      customThemes = storedCustomThemes;
    }

    const storedControlColors = loadStoredControlColors();
    if (storedControlColors) {
      controlColors = storedControlColors;
    }

    const storedTheme = loadStoredBlockTheme();
    if (storedTheme?.theme) {
      blockTheme = storedTheme.theme;
      selectedThemeId = storedTheme.id ?? CUSTOM_THEME_ID;
    } else {
      selectedThemeId = 'default-dark';
    }

    const combinedThemes = [...STYLE_PRESETS, ...storedCustomThemes];
    if (selectedThemeId !== CUSTOM_THEME_ID) {
      const preset = combinedThemes.find(theme => theme.id === selectedThemeId);
      if (preset) {
        applyThemePreset(preset, { persistSelection: false });
      } else if (STYLE_PRESETS.length) {
        applyThemePreset(STYLE_PRESETS[0], { persistSelection: false });
        selectedThemeId = STYLE_PRESETS[0].id;
      }
    }

    const activeTheme =
      combinedThemes.find(theme => theme.id === selectedThemeId) || null;
    if (activeTheme) {
      currentThemePreviewBg = activeTheme.previewBg ?? DEFAULT_PREVIEW_BG;
    } else if (controlColors?.canvas?.innerBg) {
      currentThemePreviewBg = controlColors.canvas.innerBg;
    } else {
      currentThemePreviewBg = DEFAULT_PREVIEW_BG;
    }
  });

  function themeShadowIsDisabled(shadow) {
    if (shadow == null) return false;
    const normalized = String(shadow).trim().toLowerCase();
    return normalized === 'none' || normalized === '0' || normalized === '0px' || normalized === '0 0';
  }

  $: simpleNoteBlockShadow = themeShadowIsDisabled(blockTheme?.shadow)
    ? 'none'
    : '0 0 2px 1px var(--text-color), 0 0 6px 2px var(--text-color)';
  $: simpleNoteBorderColor = themeShadowIsDisabled(blockTheme?.shadow)
    ? 'var(--bg-color)'
    : 'var(--text-color)';

  $: blockThemeCssVars = [
    ...Object.entries(blockTheme || {})
      .map(([key, value]) => `--block-${toCssVarName(key)}: ${value}`),
    `--simple-note-block-shadow: ${simpleNoteBlockShadow}`,
    `--simple-note-border-color: ${simpleNoteBorderColor}`
  ].join('; ');

  function handleThemeSelect(event) {
    const themeId = event.detail?.id;
    if (!themeId) return;
    if (themeId === CUSTOM_THEME_ID) {
      selectedThemeId = CUSTOM_THEME_ID;
      currentThemePreviewBg =
        controlColors?.canvas?.innerBg ?? DEFAULT_PREVIEW_BG;
      persistBlockTheme(blockTheme, CUSTOM_THEME_ID);
      return;
    }
    const preset = availableThemes.find(theme => theme.id === themeId);
    if (!preset) return;
    applyThemePreset(preset);
  }

  const DEFAULT_HISTORY_TRIGGERS = {
    text: ['position', 'size', 'bgColor', 'textColor'],
    cleantext: ['position', 'size', 'bgColor', 'textColor'],
    image: ['position', 'size', 'bgColor', 'textColor', 'src'],
    music: ['position', 'size', 'bgColor', 'textColor', 'trackUrl', 'title', 'content'],
    embed: ['position', 'size', 'bgColor', 'textColor', 'content'],
    task: ['tasks', 'title'],
    __default: ['position', 'size', 'bgColor', 'textColor', 'content', 'src', 'trackUrl', 'title']
  };

  const KNOWN_MODES = [...MODE_ORDER];
  const MODE_LABELS = Object.fromEntries(
    Object.values(MODE_DEFINITIONS).map((definition) => [definition.id, definition.label])
  );

  function applyHistoryTriggers(block) {
    const triggers =
      block.historyTriggers ??
      DEFAULT_HISTORY_TRIGGERS[block.type] ??
      DEFAULT_HISTORY_TRIGGERS.__default;
    return { ...block, historyTriggers: triggers };
  }

  function ensureModeOrders(allBlocks, incomingOrders = {}) {
    const idsInBlockOrder = allBlocks.map(block => block.id);
    const validIds = new Set(idsInBlockOrder);
    const modeNames = new Set([
      ...KNOWN_MODES,
      ...Object.keys(incomingOrders || {})
    ]);

    const normalized = {};
    for (const name of modeNames) {
      const existing = Array.isArray(incomingOrders?.[name])
        ? incomingOrders[name].filter(id => validIds.has(id))
        : [];
      const missing = idsInBlockOrder.filter(id => !existing.includes(id));
      normalized[name] = [...existing, ...missing];
    }

    return normalized;
  }

  function cloneModeOrders(orders) {
    const clone = {};
    for (const [modeName, order] of Object.entries(orders || {})) {
      clone[modeName] = [...order];
    }
    return clone;
  }

  function cloneState(blockList, orders, { bumpVersion = true } = {}) {
    const normalizedOrders = ensureModeOrders(blockList, orders);
    const blocksClone = blockList.map(block => ({
      ...block,
      _version: bumpVersion ? (block._version || 0) + 1 : block._version ?? 0,
      position: { ...block.position },
      size: { ...block.size }
    }));

    return {
      blocks: blocksClone,
      modeOrders: cloneModeOrders(normalizedOrders)
    };
  }

  function serializeState(blockList, orders, { bumpVersion = false } = {}) {
    const snapshot = cloneState(blockList, orders, { bumpVersion });
    return JSON.stringify(snapshot);
  }

  let controlsRef;
  let canvasRef;
  let controlsResizeObserver;
  let observedControlsEl;

  let mode = getDefaultModeForViewport();
  let modeSettings = normalizeModeSettings();
  $: simpleNoteColumnCount = modeSettings.simple.columnCount;
  $: singleNoteSettings = modeSettings.single;
  $: activeModeDefinition = getModeDefinition(mode);
  $: showRightControls = activeModeDefinition?.showRightControls !== false;
  let blocks = [];
  let modeOrders = {};
  let normalizedModeOrders = ensureModeOrders(blocks, modeOrders);
  let modeOrderedBlocks = [];
  let focusedBlockId = null;
  $: normalizedModeOrders = ensureModeOrders(blocks, modeOrders);
  $: modeOrderedBlocks = (() => {
    const order = normalizedModeOrders[mode] || [];
    const blockMap = new Map(blocks.map(block => [block.id, block]));
    const ordered = [];
    for (const id of order) {
      const block = blockMap.get(id);
      if (block) ordered.push(block);
    }
    if (ordered.length < blocks.length) {
      const seen = new Set(order);
      for (const block of blocks) {
        if (!seen.has(block.id)) {
          ordered.push(block);
        }
      }
    }
    return ordered;
  })();
  let currentSaveName = "default";
  let savedList = [];
  let firebaseReady = isFirebaseConfigured();
  let authUser = null;
  let uploadInProgress = false;
  let downloadInProgress = false;
  let fileInputRef;

  // Native window.alert/confirm/prompt are unreliable (or entirely non-functional)
  // inside Capacitor's Android WebView and Tauri's WebView2 host - they must be
  // replaced with an in-app dialog that works the same everywhere.
  let dialogState = null;
  let dialogInputValue = '';
  $: dialogInputValue = dialogState?.defaultValue ?? '';

  function autofocusAction(node) {
    node.focus();
    node.select?.();
  }

  function showDialog(type, message, defaultValue = '') {
    return new Promise((resolve) => {
      dialogState = { type, message, defaultValue, resolve };
    });
  }

  function appAlert(message) {
    return showDialog('alert', message);
  }

  function appConfirm(message) {
    return showDialog('confirm', message);
  }

  function appPrompt(message, defaultValue = '') {
    return showDialog('prompt', message, defaultValue);
  }

  function resolveDialog(value) {
    dialogState?.resolve?.(value);
    dialogState = null;
  }

  function handleDialogConfirm(inputValue) {
    if (!dialogState) return;
    if (dialogState.type === 'prompt') {
      resolveDialog(inputValue);
    } else if (dialogState.type === 'confirm') {
      resolveDialog(true);
    } else {
      resolveDialog(undefined);
    }
  }

  function handleDialogCancel() {
    if (!dialogState) return;
    if (dialogState.type === 'confirm') {
      resolveDialog(false);
    } else {
      resolveDialog(null);
    }
  }

  setContext('appDialogs', { alert: appAlert, confirm: appConfirm, prompt: appPrompt });

  $: leftTheme = controlColors.left || CONTROL_COLOR_DEFAULTS.left;
  $: controlsStyle = `--controls-bg: ${leftTheme.panelBg}; --controls-border: ${leftTheme.borderColor};`;
  $: canvasTheme = controlColors.canvas || CONTROL_COLOR_DEFAULTS.canvas;
  let Pc = window.innerWidth > MOBILE_BREAKPOINT;
  let birthdayUnlockExpiry = loadBirthdayUnlockExpiry();
  let birthdayUnlockMessage = "";
  let deferredLastSaveName = '';
  let deferredLastSaveReason = '';
  let deferredLastSaveTimer = null;
  const DEFERRED_LAST_SAVE_AUTO_DISMISS_MS = 20000;
  let cloudNeedsAttachmentUpload = false;
  let cloudBootstrapInProgress = false;
  let cloudBootstrapComplete = false;
  let cloudSyncGateInProgress = false;
  let cloudSyncMemoryByFile = loadCloudSyncMemory();
  let autoSyncEnabled = loadAutoSyncEnabled();
  let autoSyncUploadIntervalId = null;
  let stopRemoteIndexWatch = () => {};
  let autoSyncDirty = false;
  let lastAutoSyncFingerprint = '';
  let lastAutoSyncAttachmentFingerprint = '';
  let lastRemoteSyncFingerprint = '';
  $: birthdayModeUnlocked = birthdayUnlockExpiry > Date.now();

  function rememberCloudSyncForFile(fileName, syncedAt = Date.now()) {
    cloudSyncMemoryByFile = {
      ...cloudSyncMemoryByFile,
      [fileName]: Number(syncedAt) || Date.now()
    };
    persistCloudSyncMemory(cloudSyncMemoryByFile);
  }

  async function saveRemoteFileWithMemory(fileName, payload, options = {}) {
    const result = await saveRemoteFile(fileName, payload, options);
    const syncedAt = Date.now();
    rememberCloudSyncForFile(fileName, syncedAt);
    return result;
  }

  // --- Undo/Redo history ---
  let history = [];
  let historyIndex = -1;
  let hasUnsnapshottedChanges = false;

  async function ensureCurrentHistorySnapshot() {
    if (!blocks.length && history.length) return;

    if (!hasUnsnapshottedChanges) return;

    if (!history.length) {
      await pushHistory(blocks, modeOrders, { persist: false });
      return;
    }

    const isAtLatestSnapshot = historyIndex === history.length - 1;
    if (!isAtLatestSnapshot) return;

    const currentSnapshot = serializeState(blocks, modeOrders, {
      bumpVersion: false
    });
    const latestHistorySnapshot = history[historyIndex];

    if (latestHistorySnapshot !== currentSnapshot) {
      await pushHistory(blocks, modeOrders, { persist: true });
    } else {
      hasUnsnapshottedChanges = false;
    }
  }

  // ---- Save queue: prevents concurrent writes that cause missing chars ----
  let _saveInFlight = false;
  let _pendingSave = null;       // latest payload waiting to run
  let _debounceTimer = null;     // for non-critical (typing) saves

  async function persistAutosave(blocksToPersist, ordersToPersist = modeOrders, settingsToPersist = modeSettings, { immediate = false } = {}) {
    if (!currentSaveName) return;
    persistLastSaveName(currentSaveName);

    const payload = {
      blocks: blocksToPersist,
      orders: ordersToPersist,
      modeSettings: settingsToPersist
    };

    if (!immediate) {
      // Debounce: replace any queued save, schedule flush
      _pendingSave = payload;
      if (_debounceTimer) return;
      _debounceTimer = setTimeout(() => {
        _debounceTimer = null;
        if (_pendingSave) {
          const p = _pendingSave;
          _pendingSave = null;
          _runSave(p);
        }
      }, 300);
      return;
    }

    // Immediate: flush debounce timer, run (or queue behind in-flight save)
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
    _pendingSave = null;
    await _runSave(payload);
  }

  async function _runSave(payload) {
    if (_saveInFlight) {
      _pendingSave = payload; // queue behind in-flight save
      return;
    }
    _saveInFlight = true;
    try {
      const normalizedOrders = ensureModeOrders(payload.blocks, payload.orders);
      await saveBlocks(currentSaveName, {
        blocks: payload.blocks,
        modeOrders: normalizedOrders,
        modeSettings: normalizeModeSettings(payload.modeSettings)
      });
      savedList = await listSavedBlocks();
      autoSyncDirty = true;
    } finally {
      _saveInFlight = false;
      if (_pendingSave) {
        const next = _pendingSave;
        _pendingSave = null;
        _runSave(next);
      }
    }
  }

  function markCloudAttachmentDirty() {
    cloudNeedsAttachmentUpload = true;
  }


  async function pushHistory(newBlocks, newOrders = modeOrders, options = {}) {
    const stateSnapshot = cloneState(newBlocks, newOrders, { bumpVersion: true });
    const snapshot = JSON.stringify(stateSnapshot);

    if (historyIndex >= 0 && history[historyIndex] === snapshot) {
      blocks = stateSnapshot.blocks;
      modeOrders = stateSnapshot.modeOrders;
      if (options.persist !== false) {
        await persistAutosave(stateSnapshot.blocks, stateSnapshot.modeOrders, modeSettings, { immediate: true });
      }
      hasUnsnapshottedChanges = false;
      return;
    }

    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }

    history.push(snapshot);
    historyIndex++;

    blocks = stateSnapshot.blocks;
    modeOrders = stateSnapshot.modeOrders;
    if (options.persist !== false) {
      await persistAutosave(stateSnapshot.blocks, stateSnapshot.modeOrders, modeSettings, { immediate: true });
    }
    hasUnsnapshottedChanges = false;
  }

  function updatedBlockValueForKey(key, existingBlock, blockUpdates) {
    if (key === 'position') {
      return { ...existingBlock.position, ...(blockUpdates.position || {}) };
    }
    if (key === 'size') {
      return { ...existingBlock.size, ...(blockUpdates.size || {}) };
    }
    return blockUpdates[key];
  }

  function areHistoryValuesEqual(previousValue, nextValue) {
    if (
      previousValue &&
      nextValue &&
      typeof previousValue === 'object' &&
      typeof nextValue === 'object'
    ) {
      return JSON.stringify(previousValue) === JSON.stringify(nextValue);
    }
    return previousValue === nextValue;
  }

  function restoreSnapshotBlocks(snapshotBlocksRaw) {
    const currentVersionById = new Map(
      blocks.map(block => [block.id, block._version || 0])
    );

    return snapshotBlocksRaw.map(block => {
      const currentVersion = currentVersionById.get(block.id) || 0;
      const restoredVersion = Math.max((block._version || 0) + 1, currentVersion + 1);
      return {
        ...block,
        _version: restoredVersion,
        position: { ...block.position },
        size: { ...block.size }
      };
    });
  }

  async function undo() {
    await ensureCurrentHistorySnapshot();

    if (historyIndex > 0) {
      historyIndex--;
      const snapshotState = JSON.parse(history[historyIndex]) || {};
      const snapshotBlocks = restoreSnapshotBlocks(snapshotState.blocks || []);
      const snapshotOrders = ensureModeOrders(
        snapshotBlocks,
        snapshotState.modeOrders
      );
      blocks = [...snapshotBlocks];
      modeOrders = cloneModeOrders(snapshotOrders);
      await persistAutosave(snapshotBlocks, snapshotOrders, modeSettings, { immediate: true });
    }
  }

  async function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      const snapshotState = JSON.parse(history[historyIndex]) || {};
      const snapshotBlocks = restoreSnapshotBlocks(snapshotState.blocks || []);
      const snapshotOrders = ensureModeOrders(
        snapshotBlocks,
        snapshotState.modeOrders
      );
      blocks = [...snapshotBlocks];
      modeOrders = cloneModeOrders(snapshotOrders);
      await persistAutosave(snapshotBlocks, snapshotOrders, modeSettings, { immediate: true });
    }
  }

  function handleUndoRedoShortcut(event) {
    const key = event.key?.toLowerCase();
    const hasCommand = event.ctrlKey || event.metaKey;
    if (!hasCommand || key !== "z") return;

    event.preventDefault();

    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
  }

  // Places a new block without overlapping existing ones. Anchored to the
  // viewport the user is actually looking at (when on the canvas), with a
  // fine-grained sweep that finds real gaps instead of jumping to wherever
  // some unrelated existing block happens to sit.
  function findFreePosition(existingBlocks, width, height) {
    const PADDING = 4;
    const SWEEP_STEP = 28;
    const vp = mode === 'default' ? getCanvasViewport() : null;

    function overlaps(x, y) {
      return existingBlocks.some(b => {
        const bx = b.position?.x ?? 0;
        const by = b.position?.y ?? 0;
        const bw = b.size?.width ?? 420;
        const bh = b.size?.height ?? 280;
        return !(x + width + PADDING <= bx || bx + bw + PADDING <= x ||
                 y + height + PADDING <= by || by + bh + PADDING <= y);
      });
    }

    if (!vp) {
      // No live canvas viewport (different mode, or canvas not mounted yet):
      // stack below the lowest existing block instead of guessing blindly.
      const maxY = Math.max(0, ...existingBlocks.map(b => (b.position?.y ?? 0) + (b.size?.height ?? 280)));
      return { x: 100, y: maxY + PADDING };
    }

    const originX = Math.max(0, vp.canvasX + PADDING);
    const originY = Math.max(0, vp.canvasY + PADDING);
    const sweepMaxX = vp.canvasX + vp.canvasVisibleW - width;
    // Search a few screens below the fold too, not just the exact visible
    // area — so a burst of additions (several pastes/drops in a row) tiles
    // into a grid near the viewport instead of falling straight to the
    // single-column "stack below" fallback the moment the visible area fills.
    const sweepMaxY = vp.canvasY + vp.canvasVisibleH * 3 - height;

    if (sweepMaxX >= originX) {
      for (let y = originY; y <= Math.max(originY, sweepMaxY); y += SWEEP_STEP) {
        for (let x = originX; x <= sweepMaxX; x += SWEEP_STEP) {
          if (!overlaps(x, y)) return { x, y };
        }
      }
    }

    // Nothing free inside the current view — extend just past the bottom of
    // what's visible (only counting blocks that actually overlap the
    // viewport horizontally) so the new block needs at most a small scroll
    // to reach, instead of landing next to some block far away on the canvas.
    const visibleBottom = Math.max(
      vp.canvasY + vp.canvasVisibleH,
      ...existingBlocks
        .filter(b => {
          const bx = b.position?.x ?? 0;
          const bw = b.size?.width ?? 420;
          return bx < vp.canvasX + vp.canvasVisibleW && bx + bw > vp.canvasX;
        })
        .map(b => (b.position?.y ?? 0) + (b.size?.height ?? 280))
    );
    return { x: originX, y: visibleBottom + PADDING };
  }

  function getFittedMediaBlockSize(naturalWidth, naturalHeight) {
    if (!naturalWidth || !naturalHeight) {
      return { width: MEDIA_DEFAULT_WIDTH, height: MEDIA_DEFAULT_HEIGHT };
    }

    const box = getOpeningViewportBox();
    const maxW = Math.max(80, (box.width || MEDIA_FALLBACK_MAX_WIDTH) * MEDIA_FIT_MARGIN);
    const maxH = Math.max(80, (box.height || MEDIA_FALLBACK_MAX_HEIGHT) * MEDIA_FIT_MARGIN) - MEDIA_HEADER_HEIGHT;

    const ratio = naturalWidth / naturalHeight;
    let targetHeight = maxH;
    let targetWidth = targetHeight * ratio;
    if (targetWidth > maxW) {
      targetWidth = maxW;
      targetHeight = targetWidth / ratio;
    }

    return { width: targetWidth, height: targetHeight + MEDIA_HEADER_HEIGHT };
  }

  function loadMediaNaturalSize(src, isVideo) {
    return new Promise((resolve) => {
      if (isVideo) {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight });
        v.onerror = () => resolve({ width: 0, height: 0 });
        v.src = src;
      } else {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = src;
      }
    });
  }

  // --- Block operations ---
  function addBlock(type = "text") {
    if (mode === "single") {
      if (blocks.some(block => block.type === "text" || block.type === "cleantext")) {
        return;
      }
      type = "cleantext";
    }
    const blockW = 300, blockH = 200;
    const position = mode === 'default' ? findFreePosition(blocks, blockW, blockH) : { x: 100, y: 100 };
    const newBlock = applyHistoryTriggers({
      id: crypto.randomUUID(),
      type,
      content: "",
      src: "",
      ...(type === "task" ? { tasks: [], title: "Task List" } : {}),
      position,
      size: { width: blockW, height: blockH },
      bgColor: "#000000",
      textColor: "#ffffff",
      _version: 0
    });
    blocks = [...blocks, newBlock];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    pushHistory(blocks, modeOrders);
  }

  function deleteBlockHandler(event) {
    const id = event.detail?.id;
    const deletingBlock = blocks.find(block => block.id === id);
    blocks = blocks.filter(b => b.id !== id);
    modeOrders = ensureModeOrders(
      blocks,
      Object.fromEntries(
        Object.entries(modeOrders).map(([modeName, order]) => [
          modeName,
          order.filter(existingId => existingId !== id)
        ])
      )
    );
    if (focusedBlockId === id) {
      focusedBlockId = null;
    }
    if (deletingBlock?.type === 'image') {
      markCloudAttachmentDirty();
    }
    pushHistory(blocks, modeOrders);
  }

  async function updateBlockHandler(event) {
    const detail = event.detail || {};
    const {
      pushToHistory,
      changedKeys,
      id,
      bumpVersion,
      historyTriggers: incomingHistoryTriggers,
      ...updates
    } = detail;

    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return;

    const existing = blocks[idx];
    const historyTriggers =
      incomingHistoryTriggers ??
      existing.historyTriggers ??
      DEFAULT_HISTORY_TRIGGERS[existing.type] ??
      DEFAULT_HISTORY_TRIGGERS.__default;

    const normalizedChangedKeys =
      Array.isArray(changedKeys) && changedKeys.length
        ? changedKeys
        : Object.keys(updates);

    const actualChangedKeys = normalizedChangedKeys.filter(key => {
      const previousValue = existing[key];
      const nextValue = updatedBlockValueForKey(key, existing, updates);
      return !areHistoryValuesEqual(previousValue, nextValue);
    });

    if (!actualChangedKeys.length) {
      return;
    }
    if (existing.type === 'image' && actualChangedKeys.includes('src')) {
      markCloudAttachmentDirty();
    }

    let shouldSnapshot;
    if (typeof pushToHistory === "boolean") {
      shouldSnapshot = pushToHistory;
    } else if (actualChangedKeys.length) {
      shouldSnapshot = actualChangedKeys.some(key =>
        historyTriggers.includes(key)
      );
    } else {
      shouldSnapshot = true;
    }

    // Apply ONLY the keys that actually changed. A child block (e.g. ImgBlock)
    // always sends its full state in `detail` — src, colors, size, position — so
    // blindly spreading `...updates` lets a partial update (say, a size-only
    // change) clobber unrelated fields with the child's current values. During
    // HMR a transiently re-mounted block can hold empty `src` / default white,
    // which would then wipe the real image + color and trigger content deletion
    // on the next save. Restricting to `normalizedChangedKeys` prevents that.
    // ✅ always clone position & size so reactivity triggers
    const updatedBlock = {
      ...existing,
      position: { ...existing.position },
      size: { ...existing.size },
      historyTriggers,
      ...(bumpVersion ? { _version: (existing._version || 0) + 1 } : {})
    };
    for (const key of normalizedChangedKeys) {
      if (key === 'position') {
        updatedBlock.position = { ...existing.position, ...(updates.position || {}) };
      } else if (key === 'size') {
        updatedBlock.size = { ...existing.size, ...(updates.size || {}) };
      } else if (key in updates) {
        updatedBlock[key] = updates[key];
      }
    }

    const newBlocks = blocks.map((block, index) =>
      index === idx ? updatedBlock : block
    );

    if (shouldSnapshot) {
      blocks = [...newBlocks];
      modeOrders = ensureModeOrders(blocks, modeOrders);
      await pushHistory(blocks, modeOrders);
    } else {
      blocks = [...newBlocks];
      modeOrders = ensureModeOrders(blocks, modeOrders);
      await persistAutosave(blocks, modeOrders);
      hasUnsnapshottedChanges = true;
    }
  }



  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  async function addImageBlockFromFile(file) {
    if (!file) return;
    if (!file.type?.startsWith('image/') && !file.type?.startsWith('video/')) return;

    const src = await readFileAsDataUrl(file);
    if (typeof src !== 'string') return;

    const isVideo = file.type.startsWith('video/');
    const natural = await loadMediaNaturalSize(src, isVideo);
    const { width: imgW, height: imgH } = getFittedMediaBlockSize(natural.width, natural.height);
    const mediaBlock = applyHistoryTriggers({
      id: crypto.randomUUID(),
      type: 'image',
      content: '',
      src,
      position: mode === 'default' ? findFreePosition(blocks, imgW, imgH) : { x: 100, y: 100 },
      size: { width: imgW, height: imgH },
      bgColor: '#000000',
      textColor: '#ffffff',
      _version: 0
    });

    blocks = [...blocks, mediaBlock];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    markCloudAttachmentDirty();
    await pushHistory(blocks, modeOrders);
  }

  async function handleModeDrop(event) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    const mediaFiles = files.filter(file => file.type?.startsWith('image/') || file.type?.startsWith('video/'));
    for (const file of mediaFiles) {
      try {
        await addImageBlockFromFile(file);
      } catch (error) {
        console.error('Failed to import dropped media:', error);
      }
    }
  }

  function handleModeDragOver(event) {
    event.preventDefault();
  }

  async function handlePaste(event) {
    // Don't intercept paste inside text fields
    const t = event.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    const items = Array.from(event.clipboardData?.items || []);
    const imageItems = items.filter(i => i.kind === 'file' && i.type.startsWith('image/'));
    const textItem   = items.find(i  => i.kind === 'string' && i.type === 'text/plain');

    let handled = false;
    if (imageItems.length) {
      event.preventDefault();
      handled = true;
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          try { await addImageBlockFromFile(file); }
          catch (e) { console.error('Paste image failed:', e); }
        }
      }
    }
    if (textItem && !handled) {
      textItem.getAsString(async (text) => {
        const trimmed = text?.trim();
        if (!trimmed) return;
        event.preventDefault();
        // Split on blank lines to create one block per distinct chunk
        const chunks = trimmed.split(/\n\s*\n/).map(c => c.trim()).filter(Boolean);
        try {
          if (chunks.length <= 1) {
            await addTextBlockFromContent(trimmed);
          } else {
            for (const chunk of chunks) {
              await addTextBlockFromContent(chunk);
            }
          }
        } catch (e) { console.error('Paste text failed:', e); }
      });
    }
  }

  async function addTextBlockFromContent(content) {
    const txtW = 300, txtH = 200;
    const newBlock = applyHistoryTriggers({
      id: crypto.randomUUID(),
      type: 'cleantext',
      content,
      src: '',
      position: mode === 'default' ? findFreePosition(blocks, txtW, txtH) : { x: 100, y: 100 },
      size: { width: txtW, height: txtH },
      bgColor: '#000000',
      textColor: '#ffffff',
      _version: 0
    });
    blocks = [...blocks, newBlock];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    await pushHistory(blocks, modeOrders);
  }

  async function createNewFile() {
    const proposedName = await appPrompt('Enter a name for the new file:');
    if (proposedName === null || proposedName === undefined) {
      return;
    }

    const trimmedName = proposedName.trim();
    if (!trimmedName) {
      await appAlert('File name cannot be empty.');
      return;
    }

    if (savedList.includes(trimmedName)) {
      const shouldOverwrite = await appConfirm(`"${trimmedName}" already exists. Overwrite it with a blank file?`);
      if (!shouldOverwrite) {
        return;
      }
    }

    currentSaveName = trimmedName;
    persistLastSaveName(trimmedName);
    blocks = [];
    focusedBlockId = null;
    modeOrders = ensureModeOrders(blocks, {});
    modeSettings = normalizeModeSettings();
    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
    hasUnsnapshottedChanges = false;
    savedList = await listSavedBlocks();
  }

  async function clear() {
    blocks = [];
    focusedBlockId = null;
    modeOrders = ensureModeOrders(blocks, modeOrders);
    await pushHistory(blocks, modeOrders);
  }

  async function load(name, options = {}) {
    blocks = [];
    currentSaveName = "";
    focusedBlockId = null;
    await tick();

    startBootLoadGuard(name);

    try {
      const loaded = await loadBlocks(name);
      const loadedBlocks = Array.isArray(loaded)
        ? loaded
        : Array.isArray(loaded?.blocks)
        ? loaded.blocks
        : [];
      const loadedOrders = !Array.isArray(loaded)
        ? loaded?.modeOrders
        : {};
      const loadedModeSettings = !Array.isArray(loaded)
        ? loaded?.modeSettings
        : null;

      currentSaveName = name;
      persistLastSaveName(name);
      blocks = loadedBlocks.map(b => ({
        ...applyHistoryTriggers(b),
        _version: 0
      }));
      modeOrders = ensureModeOrders(blocks, loadedOrders);
      modeSettings = normalizeModeSettings(loadedModeSettings);

      history = [];
      historyIndex = -1;
      await pushHistory(blocks, modeOrders, { persist: true });
      if (options.skipCloudUpload) {
        autoSyncDirty = false;
      }
      clearBootLoadGuard();
    } catch (error) {
      console.error('Failed to load save file:', error);
      clearBootLoadGuard();
      await openFallbackSave(name);
    }
  }

  async function openDeferredLastSave() {
    const name = deferredLastSaveName;
    if (!name) return;

    deferredLastSaveName = '';
    deferredLastSaveReason = '';
    await load(name);
  }

  function dismissDeferredLastSave() {
    deferredLastSaveName = '';
    deferredLastSaveReason = '';
  }

  function scheduleDeferredLastSaveAutoDismiss(hasPending) {
    window.clearTimeout(deferredLastSaveTimer);
    deferredLastSaveTimer = hasPending
      ? window.setTimeout(() => {
          deferredLastSaveTimer = null;
          dismissDeferredLastSave();
        }, DEFERRED_LAST_SAVE_AUTO_DISMISS_MS)
      : null;
  }

  async function deleteSave(name) {
    const deletingCurrent = currentSaveName === name;
    await deleteBlocks(name);

    if (deletingCurrent) {
      blocks = [];
      currentSaveName = "";
      persistLastSaveName("");
    }

    modeOrders = ensureModeOrders(blocks, modeOrders);
    if (focusedBlockId && !blocks.some(b => b.id === focusedBlockId)) {
      focusedBlockId = null;
    }
    savedList = await listSavedBlocks();

    if (!deletingCurrent && loadStoredLastSaveName() === name) {
      persistLastSaveName(currentSaveName);
    }

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
  }

  async function signInGoogle() {
    if (!firebaseReady) {
      await appAlert('Firebase is not configured yet.');
      return;
    }

    try {
      await signInWithGoogle();
      await bootstrapCloudSync();
    } catch (error) {
      console.error(error);
      await appAlert(`Google sign-in failed: ${error?.message || error}`);
    }
  }

  async function signOutGoogle() {
    try {
      await signOutUser();
    } catch (error) {
      console.error(error);
      await appAlert(`Sign out failed: ${error?.message || error}`);
    }
  }

  async function uploadAllLocalToCloud(showInfo = true, options = {}) {
    if (!firebaseReady) {
      await appAlert('Firebase is not configured yet.');
      return;
    }

    if (!authUser) {
      await appAlert('Sign in with Google first.');
      return;
    }

    if (uploadInProgress) return;

    uploadInProgress = true;
    try {
      const names = await listSavedBlocks();
      let uploadedCount = 0;

      const uploadAttachments = options.uploadAttachments !== false;

      for (const fileName of names) {
        const localPayload = await loadBlocks(fileName);
        await saveRemoteFileWithMemory(fileName, localPayload, {
          uploadAttachments
        });
        uploadedCount += 1;
      }

      if (showInfo) {
        await appAlert(`Upload complete. Uploaded ${uploadedCount} save file(s).`);
      }
      autoSyncDirty = false;
    } catch (error) {
      console.error(error);
      if (showInfo) {
        await appAlert(`Upload failed: ${error?.message || error}`);
      }
    } finally {
      uploadInProgress = false;
    }
  }

  async function buildLocalSyncFingerprint() {
    const names = await listSavedBlocks();
    const entries = await Promise.all(
      names.map(async fileName => {
        const payload = await loadBlocks(fileName);
        const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
        const attachmentSignature = blocks
          .map(block => {
            if (block?.type !== 'image') return '';
            return `${block.id}:${block.src || ''}:${block.content || ''}:${block.trackUrl || ''}`;
          })
          .filter(Boolean)
          .join('|');

        return {
          fingerprint: `${fileName}:${Number(payload?.updatedAt || 0)}`,
          attachmentFingerprint: `${fileName}:${attachmentSignature}`
        };
      })
    );
    const fingerprint = entries.map(entry => entry.fingerprint).sort().join('|');
    const attachmentFingerprint = entries
      .map(entry => entry.attachmentFingerprint)
      .sort()
      .join('|');

    return { fingerprint, attachmentFingerprint };
  }


  async function remountCurrentSaveIfLoaded() {
    if (!currentSaveName || !savedList.includes(currentSaveName)) return;
    await load(currentSaveName, { skipCloudUpload: true });
  }

  async function pullRemoteUpdatesIfNeeded(options = {}) {
    if (!autoSyncEnabled || !firebaseReady || !authUser || uploadInProgress || cloudBootstrapInProgress) return false;

    const remoteIndex = options.remoteIndex || await loadRemoteIndex();
    const remoteEntries = Object.entries(remoteIndex || {});
    const remoteFingerprint = remoteEntries
      .map(([fileName, meta]) => `${fileName}:${Number(meta?.modifiedAt || meta?.updatedAt || 0)}`)
      .sort()
      .join('|');

    if (remoteFingerprint === lastRemoteSyncFingerprint) return false;

    let downloadedAny = false;
    for (const [fileName, remoteMeta] of remoteEntries) {
      const localPayload = savedList.includes(fileName) ? await loadBlocks(fileName) : null;
      const localModifiedAt = Number(localPayload?.modifiedAt || localPayload?.updatedAt || 0);
      const remoteModifiedAt = Number(remoteMeta?.modifiedAt || remoteMeta?.updatedAt || 0);

      if (!localPayload || remoteModifiedAt > localModifiedAt) {
        const remotePayload = await loadRemoteFile(fileName);
        if (!remotePayload) continue;
        await saveBlocks(fileName, remotePayload);
        rememberCloudSyncForFile(fileName, Number(remoteMeta?.lastSyncedAt || Date.now()));
        downloadedAny = true;
      }
    }

    lastRemoteSyncFingerprint = remoteFingerprint;

    if (downloadedAny) {
      savedList = await listSavedBlocks();
      await remountCurrentSaveIfLoaded();
      if (options.showInfo) {
        await appAlert('Cloud download complete. Newer cloud updates were applied.');
      }
    }

    return downloadedAny;
  }

  function refreshRemoteIndexWatch() {
    stopRemoteIndexWatch();
    stopRemoteIndexWatch = () => {};

    if (!autoSyncEnabled || !firebaseReady || !authUser) return;

    stopRemoteIndexWatch = subscribeRemoteIndex(remoteIndex => {
      pullRemoteUpdatesIfNeeded({ remoteIndex }).catch(error => {
        console.error('Auto sync download failed:', error);
      });
    });
  }

  $: autoSyncEnabled, firebaseReady, authUser, refreshRemoteIndexWatch();

  async function autoSyncUploadTick(options = {}) {
    if (!autoSyncEnabled || !firebaseReady || !authUser || uploadInProgress || cloudBootstrapInProgress) return;
    const force = options.force === true;
    if (!autoSyncDirty && !force) return;
    const { fingerprint, attachmentFingerprint } = await buildLocalSyncFingerprint();
    if (!fingerprint) return;
    if (!force && fingerprint === lastAutoSyncFingerprint) return;

    const attachmentsChanged = force || attachmentFingerprint !== lastAutoSyncAttachmentFingerprint;
    await uploadAllLocalToCloud(false, {
      uploadAttachments: attachmentsChanged
    });

    lastAutoSyncFingerprint = fingerprint;
    lastAutoSyncAttachmentFingerprint = attachmentFingerprint;
    autoSyncDirty = false;
  }

  async function toggleAutoSync() {
    if (autoSyncEnabled) {
      autoSyncEnabled = false;
      persistAutoSyncEnabled(false);
      return;
    }

    if (!firebaseReady || !authUser) {
      await appAlert('Sign in with Google first.');
      return;
    }

    autoSyncEnabled = true;
    persistAutoSyncEnabled(true);
    autoSyncDirty = true;
    cloudSyncGateInProgress = true;
    try {
      await pullRemoteUpdatesIfNeeded();
      await remountCurrentSaveIfLoaded();
    } finally {
      cloudSyncGateInProgress = false;
    }
  }

  async function downloadAllCloudToLocal() {
    if (!firebaseReady) {
      await appAlert('Firebase is not configured yet.');
      return;
    }

    if (!authUser) {
      await appAlert('Sign in with Google first.');
      return;
    }

    if (downloadInProgress) return;

    downloadInProgress = true;
    try {
      await pullRemoteUpdatesIfNeeded({ showInfo: true });
    } catch (error) {
      console.error(error);
      await appAlert(`Download failed: ${error?.message || error}`);
    } finally {
      downloadInProgress = false;
    }
  }

  async function bootstrapCloudSync() {
    if (!firebaseReady || !authUser) return;
    if (cloudBootstrapInProgress) return;

    cloudBootstrapInProgress = true;
    try {
      const [localNames, remoteIndex] = await Promise.all([
        listSavedBlocks(),
        loadRemoteIndex()
      ]);
      const remoteNames = Object.keys(remoteIndex || {});
      const localNameSet = new Set(localNames);
      const remoteNameSet = new Set(remoteNames);

      // Simple sync policy:
      // 1) First time account (no cloud files): upload all local files.
      // 2) Existing cloud account (has cloud files): download cloud files locally.
      if (remoteNames.length === 0) {
        for (const localName of localNames) {
          const localPayload = await loadBlocks(localName);
          await saveRemoteFileWithMemory(localName, localPayload, { uploadAttachments: true });
        }

        savedList = await listSavedBlocks();
        cloudBootstrapComplete = true;
        autoSyncDirty = false;
        return;
      }

      // Existing account: cloud is source of truth during bootstrap.
      for (const remoteName of remoteNames) {
        const remotePayload = await loadRemoteFile(remoteName);
        if (remotePayload) {
          await saveBlocks(remoteName, remotePayload);
          rememberCloudSyncForFile(remoteName, Number(remotePayload?.lastSyncedAt || Date.now()));
        }
      }

      savedList = await listSavedBlocks();
      cloudBootstrapComplete = true;
      autoSyncDirty = false;
    } catch (error) {
      console.error('Cloud bootstrap sync failed:', error);
      // Do not block regular autosync forever if bootstrap fails.
      cloudBootstrapComplete = true;
    } finally {
      cloudBootstrapInProgress = false;
    }
  }

  function exportJSON() {
    const dataStr = JSON.stringify(
      {
        blocks,
        modeOrders: ensureModeOrders(blocks, modeOrders),
        modeSettings: normalizeModeSettings(modeSettings)
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentSaveName || "codex-blocks"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported) || (imported && typeof imported === "object")) {
          const importedBlocks = Array.isArray(imported)
            ? imported
            : Array.isArray(imported.blocks)
            ? imported.blocks
            : [];
          const importedOrders = Array.isArray(imported)
            ? {}
            : imported.modeOrders;
          const importedModeSettings = Array.isArray(imported)
            ? null
            : imported.modeSettings;
          blocks = importedBlocks.map(b => ({
            ...applyHistoryTriggers(b),
            _version: 0
          }));
          modeOrders = ensureModeOrders(blocks, importedOrders);
          modeSettings = normalizeModeSettings(importedModeSettings);
          focusedBlockId = null;
          history = [];
          historyIndex = -1;
          await pushHistory(blocks, modeOrders);
          await appAlert("Imported successfully!");
        } else await appAlert("Invalid file structure!");
      } catch {
        await appAlert("Invalid JSON file!");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function setControlsHeight(value) {
    const px = `${value}px`;
    if (canvasRef) {
      canvasRef.style.setProperty("--controls-height", px);
    }
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--controls-height", px);
    }
  }

  function adjustCanvasPadding() {
    if (typeof window === "undefined") return;

    const fallbackHeight = window.innerWidth <= MOBILE_BREAKPOINT ? 55 : 56;
    const height = controlsRef?.offsetHeight || fallbackHeight;
    setControlsHeight(height);
  }

  async function handleModeSettingChange(event) {
    const detail = event.detail || {};
    let patch = { ...modeSettings };

    if (detail.columnCount !== undefined) {
      const nextColumnCount = Math.max(1, Number.parseInt(detail.columnCount, 10) || DEFAULT_MODE_SETTINGS.simple.columnCount);
      patch = { ...patch, simple: { ...patch.simple, columnCount: nextColumnCount } };
    }

    if (detail.single && typeof detail.single === 'object') {
      patch = { ...patch, single: { ...patch.single, ...detail.single } };
    }

    const nextModeSettings = normalizeModeSettings(patch);
    modeSettings = nextModeSettings;
    await persistAutosave(blocks, modeOrders, nextModeSettings, { immediate: true });
  }

  function setupControlsObserver() {
    if (typeof ResizeObserver === "undefined" || !controlsRef) {
      return;
    }

    if (observedControlsEl === controlsRef) {
      return;
    }

    controlsResizeObserver?.disconnect();
    controlsResizeObserver = new ResizeObserver(() => adjustCanvasPadding());
    controlsResizeObserver.observe(controlsRef);
    observedControlsEl = controlsRef;
  }

  const handleWindowResize = () => {
    adjustCanvasPadding();
    Pc = window.innerWidth > MOBILE_BREAKPOINT;
  };

  function handleFocusToggle(event) {
    const { id } = event.detail || {};
    if (!id) {
      focusedBlockId = null;
      return;
    }

    focusedBlockId = focusedBlockId === id ? null : id;
  }

  async function moveFocusedBlock(offset) {
    if (!focusedBlockId) return;

    const ordersForMode = normalizedModeOrders[mode] || [];
    const index = ordersForMode.indexOf(focusedBlockId);
    if (index === -1) {
      focusedBlockId = null;
      return;
    }

    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= ordersForMode.length) {
      return;
    }

    const updatedOrder = [...ordersForMode];
    updatedOrder.splice(index, 1);
    updatedOrder.splice(targetIndex, 0, focusedBlockId);

    modeOrders = {
      ...modeOrders,
      [mode]: updatedOrder
    };
    await pushHistory(blocks, modeOrders);
  }

  const moveFocusedBlockUp = () => moveFocusedBlock(-1);
  const moveFocusedBlockDown = () => moveFocusedBlock(1);


  function unlockBirthdayMode(passwordAttempt) {
    if ((passwordAttempt || '').trim() !== BIRTHDAY_MODE_PASSWORD) {
      birthdayUnlockMessage = 'Incorrect password.';
      return;
    }

    birthdayUnlockExpiry = Date.now() + BIRTHDAY_MODE_DURATION_MS;
    persistBirthdayUnlockExpiry(birthdayUnlockExpiry);
    birthdayUnlockMessage = 'Birthday mode unlocked for 24 hours.';
  }

  $: if (!birthdayModeUnlocked && mode === "birthday") {
    mode = getDefaultModeForViewport();
  }

  function setMode(nextMode) {
    if (!KNOWN_MODES.includes(nextMode)) return;
    if (nextMode === "birthday" && !birthdayModeUnlocked) return;
    if (nextMode === mode) return;
    mode = nextMode;

    if (
      mode === "single" &&
      !blocks.some(block => block.type === "text" || block.type === "cleantext")
    ) {
      addBlock("cleantext");
    }
  }

  $: if (
    focusedBlockId &&
    !blocks.some(block => block.id === focusedBlockId)
  ) {
    focusedBlockId = null;
  }

  let stopAuthListener = () => {};

  onMount(async () => {
    Pc = window.innerWidth > MOBILE_BREAKPOINT;
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("keydown", handleUndoRedoShortcut);
    window.addEventListener("paste", handlePaste);
    adjustCanvasPadding();

    if (firebaseReady) {
      stopAuthListener = onAuthStateChange(user => {
        authUser = user;
      });
      checkSyncCompatibility()
        .then(result => {
          if (!result.compatible) {
            appAlert('This version of the app is too old to sync with your account. Please update to continue syncing.');
          }
        })
        .catch(() => {});
    }

    savedList = await listSavedBlocks();
    const storedLastSave = loadStoredLastSaveName();
    const safeModeFromShift = await detectShiftSafeModeDuringStartup();
    const safeModeActive = safeModeFromShift;
    let shouldClearLastSavePointer = false;

    if (safeModeActive) {
      deferredLastSaveName = storedLastSave || '';
      deferredLastSaveReason = 'Safe mode: Shift key held on launch.';
      shouldClearLastSavePointer = true;
      persistLastSaveName('');
      clearBootLoadGuard();
      currentSaveName = FALLBACK_SAVE_NAME;
      blocks = [];
      modeOrders = ensureModeOrders(blocks, {});
    } else {
      if (storedLastSave && savedList.includes(storedLastSave)) {
        currentSaveName = storedLastSave;
      } else if (!currentSaveName && savedList.length) {
        currentSaveName = savedList[0];
      }

      const guardedSave = currentSaveName || FALLBACK_SAVE_NAME;
      const bootGuard = loadBootLoadGuard();

      if (bootGuard?.openingLastFile === true) {
        clearBootLoadGuard();
        deferredLastSaveName = bootGuard.pendingSaveName || guardedSave;
        deferredLastSaveReason =
          'Recovered from a previous startup crash while opening the last file.';
        currentSaveName = FALLBACK_SAVE_NAME;
        blocks = [];
        modeOrders = ensureModeOrders(blocks, {});
      } else {
        startBootLoadGuard(guardedSave);
        try {
          const initialData = await loadBlocks(guardedSave);
          const initialBlocks = Array.isArray(initialData)
            ? initialData
            : Array.isArray(initialData?.blocks)
            ? initialData.blocks
            : [];
          const initialOrders = !Array.isArray(initialData)
            ? initialData?.modeOrders
            : {};
          const initialModeSettings = !Array.isArray(initialData)
            ? initialData?.modeSettings
            : null;
          currentSaveName = guardedSave;
          blocks = initialBlocks.map(b => ({
            ...applyHistoryTriggers(b),
            _version: 0
          }));
          modeOrders = ensureModeOrders(blocks, initialOrders);
          modeSettings = normalizeModeSettings(initialModeSettings);
          clearBootLoadGuard();
        } catch (error) {
          console.error('Failed to load last opened save:', error);
          clearBootLoadGuard();
          await openFallbackSave(guardedSave);
        }
      }
    }
    if (birthdayUnlockExpiry <= Date.now()) {
      birthdayUnlockExpiry = 0;
      persistBirthdayUnlockExpiry(0);
      if (mode === "birthday") mode = getDefaultModeForViewport();
    }

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
    if (shouldClearLastSavePointer) {
      persistLastSaveName('');
    } else if (deferredLastSaveName) {
      persistLastSaveName(deferredLastSaveName);
    } else {
      persistLastSaveName(currentSaveName);
    }

    autoSyncUploadIntervalId = window.setInterval(() => {
      autoSyncUploadTick().catch(error => {
        console.error('Auto sync upload tick failed:', error);
      });
    }, 10_000);

    autoSyncUploadTick().catch(error => {
      console.error('Initial auto sync upload tick failed:', error);
    });
  });

  onDestroy(() => {
    window.removeEventListener("resize", handleWindowResize);
    window.removeEventListener("keydown", handleUndoRedoShortcut);
    window.removeEventListener("paste", handlePaste);
    controlsResizeObserver?.disconnect();
    observedControlsEl = null;
    stopAuthListener?.();
    stopRemoteIndexWatch();
    if (autoSyncUploadIntervalId !== null) {
      window.clearInterval(autoSyncUploadIntervalId);
      autoSyncUploadIntervalId = null;
    }
    if (deferredLastSaveTimer !== null) {
      window.clearTimeout(deferredLastSaveTimer);
      deferredLastSaveTimer = null;
    }
  });

  $: scheduleDeferredLastSaveAutoDismiss(!!deferredLastSaveName);

  $: if (firebaseReady && authUser && !cloudBootstrapComplete && !cloudBootstrapInProgress) {
    bootstrapCloudSync();
  }

  $: if (!authUser) {
    cloudBootstrapComplete = false;
  }

  $: if (controlsRef) {
    setupControlsObserver();
    adjustCanvasPadding();
  }

  $: if (canvasRef) {
    adjustCanvasPadding();
  }

  $: groupedBlocks = (() => {
    const groups = [];
    for (let i = 0; i < modeOrderedBlocks.length; i++) {
      const block = modeOrderedBlocks[i];
      const next = modeOrderedBlocks[i + 1];
      if (
        block.type === "image" &&
        next &&
        (next.type === "text" || next.type === "cleantext")
      ) {
        groups.push({ type: "pair", image: block, text: next });
        i++;
      } else {
        groups.push(block);
      }
    }
    return groups;
  })();
</script>








<style>

  .app {
  display: flex;
  flex-direction: column;
  height: 100dvh; /* full app height (stable on mobile browsers) */
  overflow: hidden;
}
.controls {
  flex: 0 0 auto;  /* only as tall as needed */
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  padding-top: max(8px, env(safe-area-inset-top));
  background: var(--controls-bg, #111);
  border-bottom: 1px solid var(--controls-border, #333);
  overscroll-behavior: contain;
}

.right-controls {
  margin-left: auto;
}

.startup-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #322300;
  color: #ffe6a3;
  border-bottom: 1px solid #6f4f00;
}

.startup-warning button {
  background: #ad7a00;
  border: none;
  color: #1e1500;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.startup-warning button:hover {
  filter: brightness(1.08);
}

.startup-warning-dismiss {
  margin-left: auto;
  background: transparent !important;
  color: #ffe6a3 !important;
  font-weight: 700 !important;
  padding: 4px 8px !important;
  line-height: 1;
}

.startup-warning-dismiss:hover {
  filter: none !important;
  background: rgba(255, 230, 163, 0.15) !important;
}

.modes {
  flex: 1 1 auto;  /* take the rest of the height */
  display: flex;
  width: 100%;
  overflow: hidden; /* so canvas doesn’t spill */
}

.modes.sync-lock-active {
  pointer-events: none;
  opacity: 0.8;
}

.sync-lock-banner {
  position: fixed;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1300;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(255, 201, 40, 0.16);
  border: 1px solid rgba(255, 201, 40, 0.5);
  color: #ffd86c;
  font-size: 0.9rem;
}










/* Optional: make it more mobile-friendly */
/* Mobile adjustments */
@media (max-width: 1024px) {
  .controls {
    min-height: 55px;
    flex-wrap: nowrap;
    padding: 8px 10px;
    padding-top: max(8px, env(safe-area-inset-top));
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
  }

  .right-controls {
    margin-left: 0;
  }
}

.app-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.app-dialog {
  background: #17171a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 18px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  box-sizing: border-box;
}

.app-dialog-message {
  margin: 0 0 12px;
  color: #f0f0f0;
  font-size: 0.95rem;
  white-space: pre-wrap;
}

.app-dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #444;
  background: #101012;
  color: #f0f0f0;
  font-size: 1rem;
  margin-bottom: 14px;
}

.app-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.app-dialog-btn {
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
}

.app-dialog-cancel {
  background: #2a2a2a;
  color: #f0f0f0;
}

.app-dialog-ok {
  background: #ad7a00;
  color: #1e1500;
}

</style>




<div class="app" style={blockThemeCssVars}>
  <div class="controls" bind:this={controlsRef} style={controlsStyle}>
    <LeftControls
      bind:currentSaveName
      {mode}
      {simpleNoteColumnCount}
      {singleNoteSettings}
      modeLabels={MODE_LABELS}
      {blocks}
      {savedList}
      {focusedBlockId}
      colors={controlColors.left}
      {birthdayModeUnlocked}
      {birthdayUnlockMessage}
      on:addBlock={(e) => addBlock(e.detail)}
      on:clear={clear}
      on:exportJSON={exportJSON}
      on:importJSON={(e) => importJSON(e.detail)}
      on:setMode={(e) => setMode(e.detail)}
      on:unlockBirthdayMode={(e) => unlockBirthdayMode(e.detail?.password)}
      on:undo={undo}
      on:redo={redo}
      on:moveUp={moveFocusedBlockUp}
      on:moveDown={moveFocusedBlockDown}
      on:modeSettingChange={handleModeSettingChange}
    />
    {#if showRightControls}
    <div class="right-controls">
      <RightControls
        {savedList}
        {load}
        {deleteSave}
        {createNewFile}
        {controlColors}
        themes={availableThemes}
        {selectedThemeId}
        {firebaseReady}
        {authUser}
        {uploadInProgress}
        {downloadInProgress}
        {autoSyncEnabled}
        on:googleSignIn={signInGoogle}
        on:googleSignOut={signOutGoogle}
        on:uploadNow={uploadAllLocalToCloud}
        on:downloadNow={downloadAllCloudToLocal}
        on:toggleAutoSync={toggleAutoSync}
        on:updateColors={handleControlColorChange}
        on:selectTheme={handleThemeSelect}
        on:openAdvancedCss={() => (showAdvancedCssPage = true)}
      />
    </div>
    {/if}
  </div>

  {#if deferredLastSaveName}
    <div class="startup-warning">
      <span>{deferredLastSaveReason || `Skipped auto-open for ${deferredLastSaveName}.`}</span>
      <button on:click={openDeferredLastSave}>
        Click to open last file
      </button>
      <button
        class="startup-warning-dismiss"
        type="button"
        aria-label="Dismiss"
        on:click={dismissDeferredLastSave}
      >
        ✕
      </button>
    </div>
  {/if}

  <div class="modes" class:sync-lock-active={cloudBootstrapInProgress || cloudSyncGateInProgress} role="region" aria-label="Workspace" on:dragover={handleModeDragOver} on:drop={handleModeDrop}>
    {#if cloudBootstrapInProgress || cloudSyncGateInProgress}
      <div class="sync-lock-banner">Sync check in progress… editing is temporarily paused.</div>
    {/if}
    <ModeArea
      {mode}
      blocks={modeOrderedBlocks}
      {simpleNoteColumnCount}
      {singleNoteSettings}
      {groupedBlocks}
      {focusedBlockId}
      modeLabels={MODE_LABELS}
      bind:canvasRef
      canvasColors={canvasTheme}
      leftControlColors={leftTheme}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
      on:focusToggle={handleFocusToggle}
      on:modeSettingChange={handleModeSettingChange}
    />
  </div>
</div>

{#if dialogState}
  <div class="app-dialog-overlay" role="presentation" on:click={handleDialogCancel}>
    <div class="app-dialog" role="dialog" aria-modal="true" on:click|stopPropagation>
      <p class="app-dialog-message">{dialogState.message}</p>
      {#if dialogState.type === 'prompt'}
        <input
          type="text"
          class="app-dialog-input"
          bind:value={dialogInputValue}
          on:keydown={(e) => {
            if (e.key === 'Enter') handleDialogConfirm(dialogInputValue);
            if (e.key === 'Escape') handleDialogCancel();
          }}
          use:autofocusAction
        />
      {/if}
      <div class="app-dialog-actions">
        {#if dialogState.type !== 'alert'}
          <button type="button" class="app-dialog-btn app-dialog-cancel" on:click={handleDialogCancel}>Cancel</button>
        {/if}
        <button type="button" class="app-dialog-btn app-dialog-ok" on:click={() => handleDialogConfirm(dialogInputValue)}>OK</button>
      </div>
    </div>
  </div>
{/if}

{#if showAdvancedCssPage}
  <AdvancedCssPage
    {controlColors}
    {blockTheme}
    previewBg={currentThemePreviewBg}
    themes={availableThemes}
    {selectedThemeId}
    on:close={() => (showAdvancedCssPage = false)}
    on:updateControlColor={handleControlColorChange}
    on:updateBlockTheme={handleBlockThemeChange}
    on:updatePreviewBg={handlePreviewBgChange}
    on:saveTheme={handleAdvancedThemeSave}
    on:updateTheme={handleAdvancedThemeUpdate}
    on:deleteTheme={handleAdvancedThemeDelete}
    on:duplicateTheme={handleAdvancedThemeDuplicate}
  />
{/if}
