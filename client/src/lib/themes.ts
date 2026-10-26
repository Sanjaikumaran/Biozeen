/** Theme options shared by the provider, the Appearance page and public/theme-boot.js. */
export type ThemeMode = 'light' | 'dark' | 'system'
export const ACCENTS = [
  { key: 'forest', label: 'Forest', swatch: '#136445', highlight: '#8bd346' },
  { key: 'ocean', label: 'Ocean', swatch: '#1d4f96', highlight: '#5eb8f7' },
  { key: 'teal', label: 'Teal', swatch: '#0e6f67', highlight: '#2dd4bf' },
  { key: 'indigo', label: 'Indigo', swatch: '#3e3ea3', highlight: '#98a2ff' },
  { key: 'plum', label: 'Plum', swatch: '#7a3273', highlight: '#ec8fe4' },
  { key: 'terracotta', label: 'Terracotta', swatch: '#994322', highlight: '#fdab63' },
] as const
export type Accent = (typeof ACCENTS)[number]['key']
export interface ThemeChoice { mode: ThemeMode; accent: Accent }

export const DEFAULT_THEME: ThemeChoice = { mode: 'system', accent: 'forest' }
