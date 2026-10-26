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
/** A preset accent, or 'custom' for a colour the user picks (stored as `custom`, a #rrggbb hex). */
export type Accent = (typeof ACCENTS)[number]['key'] | 'custom'
export interface ThemeChoice { mode: ThemeMode; accent: Accent; custom?: string }

export const DEFAULT_THEME: ThemeChoice = { mode: 'system', accent: 'forest' }
export const DEFAULT_CUSTOM = '#6d28d9'
export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
