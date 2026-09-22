export type ThemeId = 'classic' | 'night' | 'grass' | 'clay' | 'custom';

export interface ThemeColors {
  navy: string;
  navyLight: string;
  accent: string;
  accentDark: string;
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  heading: string;
  onAccent: string;
}

export interface ThemePreset {
  id: Exclude<ThemeId, 'custom'>;
  label: string;
  blurb: string;
  colors: ThemeColors;
}

export interface ThemeInput {
  id: ThemeId;
  primary?: string;
  accent?: string;
}

export interface Theme extends ThemeColors {
  id: ThemeId;
  label: string;
  primary: string;
  accent: string;
  presets: Array<Pick<ThemePreset, 'id' | 'label' | 'blurb'> & { primary: string; accent: string }>;
}

const HEX = /^#([0-9a-f]{6})$/i;

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'classic',
    label: 'Classic navy',
    blurb: 'Original navy and gold',
    colors: {
      navy: '#0b2545',
      navyLight: '#13315c',
      accent: '#f2a900',
      accentDark: '#d99400',
      bg: '#f4f6fb',
      card: '#ffffff',
      text: '#1b2733',
      muted: '#64748b',
      border: '#e2e8f0',
      heading: '#0b2545',
      onAccent: '#0b2545',
    },
  },
  {
    id: 'night',
    label: 'Night game',
    blurb: 'Dark diamond, gold lights',
    colors: {
      navy: '#0a1220',
      navyLight: '#162033',
      accent: '#f2a900',
      accentDark: '#d99400',
      bg: '#0f1724',
      card: '#162033',
      text: '#e8eef6',
      muted: '#94a3b8',
      border: '#2a3a50',
      heading: '#e8eef6',
      onAccent: '#0a1220',
    },
  },
  {
    id: 'grass',
    label: 'Grass field',
    blurb: 'Green turf and yellow seams',
    colors: {
      navy: '#14532d',
      navyLight: '#166534',
      accent: '#facc15',
      accentDark: '#ca8a04',
      bg: '#f3f7f1',
      card: '#ffffff',
      text: '#14532d',
      muted: '#4d7c5a',
      border: '#d4e3d4',
      heading: '#14532d',
      onAccent: '#14532d',
    },
  },
  {
    id: 'clay',
    label: 'Infield clay',
    blurb: 'Dirt infield and dusk gold',
    colors: {
      navy: '#7c2d12',
      navyLight: '#9a3412',
      accent: '#fbbf24',
      accentDark: '#d97706',
      bg: '#faf5f0',
      card: '#ffffff',
      text: '#431407',
      muted: '#9a6b4f',
      border: '#ecd9c8',
      heading: '#7c2d12',
      onAccent: '#431407',
    },
  },
];

export const DEFAULT_THEME_INPUT: ThemeInput = { id: 'classic' };

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => clampByte(c).toString(16).padStart(2, '0')).join('')}`;
}

function mix(hex: string, toward: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return rgbToHex(a.r + (b.r - a.r) * amount, a.g + (b.g - a.g) * amount, a.b + (b.b - a.b) * amount);
}

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (HEX.test(trimmed)) return `#${trimmed.slice(1).toLowerCase()}`;
  return fallback;
}

export function isThemeId(value: unknown): value is ThemeId {
  return value === 'classic' || value === 'night' || value === 'grass' || value === 'clay' || value === 'custom';
}

function customColors(primary: string, accent: string): ThemeColors {
  const darkPrimary = luminance(primary) < 0.45;
  const navyLight = mix(primary, '#ffffff', darkPrimary ? 0.16 : 0.22);
  const accentDark = mix(accent, '#000000', 0.18);
  const heading = darkPrimary ? primary : mix(primary, '#000000', 0.35);
  return {
    navy: primary,
    navyLight,
    accent,
    accentDark,
    bg: darkPrimary ? '#f4f6fb' : mix(primary, '#ffffff', 0.92),
    card: '#ffffff',
    text: darkPrimary ? '#1b2733' : mix(primary, '#000000', 0.55),
    muted: '#64748b',
    border: '#e2e8f0',
    heading,
    onAccent: luminance(accent) > 0.55 ? primary : '#ffffff',
  };
}

export function parseStoredTheme(raw: string | undefined): ThemeInput {
  if (!raw) return { ...DEFAULT_THEME_INPUT };
  try {
    const parsed = JSON.parse(raw) as Partial<ThemeInput>;
    const id = isThemeId(parsed.id) ? parsed.id : 'classic';
    if (id !== 'custom') return { id };
    const fallback = THEME_PRESETS[0].colors;
    return {
      id,
      primary: normalizeHex(parsed.primary, fallback.navy),
      accent: normalizeHex(parsed.accent, fallback.accent),
    };
  } catch {
    return { ...DEFAULT_THEME_INPUT };
  }
}

export function resolveTheme(input: ThemeInput): Theme {
  const presets = THEME_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    blurb: p.blurb,
    primary: p.colors.navy,
    accent: p.colors.accent,
  }));

  if (input.id === 'custom') {
    const fallback = THEME_PRESETS[0].colors;
    const primary = normalizeHex(input.primary, fallback.navy);
    const accent = normalizeHex(input.accent, fallback.accent);
    const colors = customColors(primary, accent);
    return { id: 'custom', label: 'Custom', primary, accent, presets, ...colors };
  }

  const preset = THEME_PRESETS.find((p) => p.id === input.id) ?? THEME_PRESETS[0];
  return {
    id: preset.id,
    label: preset.label,
    primary: preset.colors.navy,
    accent: preset.colors.accent,
    presets,
    ...preset.colors,
  };
}

export function normalizeThemeInput(body: unknown): ThemeInput {
  const raw = (body ?? {}) as Partial<ThemeInput>;
  if (!isThemeId(raw.id)) {
    throw new Error('id must be classic, night, grass, clay, or custom');
  }
  if (raw.id !== 'custom') return { id: raw.id };
  const fallback = THEME_PRESETS[0].colors;
  const primary = typeof raw.primary === 'string' ? raw.primary.trim() : '';
  const accent = typeof raw.accent === 'string' ? raw.accent.trim() : '';
  if (!HEX.test(primary) || !HEX.test(accent)) {
    throw new Error('custom theme needs primary and accent as #rrggbb colors');
  }
  return {
    id: 'custom',
    primary: normalizeHex(primary, fallback.navy),
    accent: normalizeHex(accent, fallback.accent),
  };
}
