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
  primary: string;
  accent: string;
}

export interface Theme extends ThemeColors {
  id: ThemeId;
  label: string;
  primary: string;
  presets: ThemePreset[];
}

export interface ThemeUpdate {
  id: ThemeId;
  primary?: string;
  accent?: string;
}

const CSS_VARS: Array<[keyof ThemeColors, string]> = [
  ['navy', '--navy'],
  ['navyLight', '--navy-light'],
  ['accent', '--accent'],
  ['accentDark', '--accent-dark'],
  ['bg', '--bg'],
  ['card', '--card'],
  ['text', '--text'],
  ['muted', '--muted'],
  ['border', '--border'],
  ['heading', '--heading'],
  ['onAccent', '--on-accent'],
];

export function applyTheme(theme: ThemeColors): void {
  const root = document.documentElement;
  for (const [key, cssVar] of CSS_VARS) {
    const value = theme[key];
    if (typeof value === 'string' && value) {
      root.style.setProperty(cssVar, value);
    }
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.navy);
}
