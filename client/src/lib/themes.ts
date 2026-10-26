/** Theme options shared by the provider, the Appearance page and public/theme-boot.js. */
export type ThemeMode = 'light' | 'dark' | 'system'
export const ACCENTS = [
  { key: 'forest', label: 'Forest', swatch: '#136445' },
  { key: 'ocean', label: 'Ocean', swatch: '#1d4f96' },
  { key: 'teal', label: 'Teal', swatch: '#0e6f67' },
  { key: 'indigo', label: 'Indigo', swatch: '#3e3ea3' },
  { key: 'plum', label: 'Plum', swatch: '#7a3273' },
  { key: 'terracotta', label: 'Terracotta', swatch: '#994322' },
] as const
export type Accent = (typeof ACCENTS)[number]['key']
export interface ThemeChoice { mode: ThemeMode; accent: Accent }

export const DEFAULT_THEME: ThemeChoice = { mode: 'system', accent: 'forest' }
