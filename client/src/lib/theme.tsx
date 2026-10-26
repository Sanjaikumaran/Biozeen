import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { useAuth } from './auth'
import { ACCENTS, DEFAULT_CUSTOM, DEFAULT_THEME, isHex, type Accent, type ThemeChoice, type ThemeMode } from './themes'

const STORAGE_KEY = 'bian.theme' // also read by public/theme-boot.js

const isAccent = (v: unknown): v is Accent => v === 'custom' || ACCENTS.some((a) => a.key === v)
const isMode = (v: unknown): v is ThemeMode => v === 'light' || v === 'dark' || v === 'system'

function readStored(): ThemeChoice {
  try {
    const t = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}')
    return { mode: isMode(t.mode) ? t.mode : DEFAULT_THEME.mode, accent: isAccent(t.accent) ? t.accent : DEFAULT_THEME.accent, ...(isHex(t.custom) ? { custom: t.custom } : {}) }
  } catch {
    return DEFAULT_THEME
  }
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** The operating system's light/dark preference, kept current. */
function useSystemDark() {
  const [dark, setDark] = useState(() => darkQuery().matches)
  useEffect(() => {
    const q = darkQuery()
    const onChange = () => setDark(q.matches)
    q.addEventListener('change', onChange)
    return () => q.removeEventListener('change', onChange)
  }, [])
  return dark
}

interface ThemeState {
  theme: ThemeChoice
  /** 'light' or 'dark' after applying the system preference. */
  resolvedMode: 'light' | 'dark'
  systemDark: boolean
  setTheme: (t: ThemeChoice) => Promise<void>
}

const ThemeContext = createContext<ThemeState | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [theme, setLocal] = useState<ThemeChoice>(readStored)
  const systemDark = useSystemDark()

  // A signed-in member's saved choice follows them to any device.
  const [syncedFor, setSyncedFor] = useState<string | null>(null)
  if (user && syncedFor !== user.id) {
    setSyncedFor(user.id)
    const p = user.preferences
    if (p && (isMode(p.themeMode) || isAccent(p.accent))) {
      setLocal({ mode: isMode(p.themeMode) ? p.themeMode : theme.mode, accent: isAccent(p.accent) ? p.accent : theme.accent, custom: isHex(p.customColor) ? p.customColor : theme.custom })
    }
  } else if (!user && syncedFor) {
    setSyncedFor(null)
  }

  const resolvedMode = theme.mode === 'system' ? (systemDark ? 'dark' : 'light') : theme.mode

  // After the first paint, fade the whole page to a newly chosen theme instead of snapping.
  const appliedRef = useRef<string | null>(null)
  const fadeTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    const root = document.documentElement
    const key = `${theme.accent}|${theme.custom ?? ''}|${resolvedMode}`
    if (appliedRef.current !== null && appliedRef.current !== key) {
      root.classList.add('theme-switching')
      window.clearTimeout(fadeTimer.current)
      fadeTimer.current = window.setTimeout(() => root.classList.remove('theme-switching'), 400)
    }
    appliedRef.current = key
    root.dataset.accent = theme.accent
    root.dataset.mode = resolvedMode
    if (theme.accent === 'custom') root.style.setProperty('--custom-base', theme.custom ?? DEFAULT_CUSTOM)
    else root.style.removeProperty('--custom-base')
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
    } catch {
      // Storage blocked: the choice still applies while the page is open.
    }
  }, [theme, resolvedMode])

  const setTheme = useCallback(
    async (t: ThemeChoice) => {
      setLocal(t)
      if (user) await api.put('/auth/me/preferences', { themeMode: t.mode, accent: t.accent, ...(t.accent === 'custom' ? { customColor: t.custom ?? DEFAULT_CUSTOM } : {}) })
    },
    [user],
  )

  const value = useMemo(() => ({ theme, resolvedMode, systemDark, setTheme }), [theme, resolvedMode, systemDark, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}

/** Resolve a CSS colour expression (tokens, color-mix) under a given theme to a concrete colour. */
function resolve(expr: string, accent: Accent, mode: string, custom?: string) {
  const probe = document.createElement('span')
  probe.dataset.accent = accent
  if (custom) probe.style.setProperty('--custom-base', custom)
  probe.dataset.mode = mode
  probe.style.color = expr
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

/** Chart colours for the active theme. Recharts writes SVG attributes, which can't read CSS variables. */
// eslint-disable-next-line react-refresh/only-export-components
export function useChartColors() {
  const { theme, resolvedMode } = useTheme()
  return useMemo(() => {
    const resolveColor = (expr: string) => resolve(expr, theme.accent, resolvedMode, theme.custom)
    const card = resolveColor('var(--color-card)')
    return {
      series: resolveColor('var(--color-brand-600)'),
      surface: card,
      grid: resolveColor('color-mix(in srgb, var(--color-ink-900) 10%, var(--color-card))'),
      tick: resolveColor('var(--color-ink-500)'),
      label: resolveColor('var(--color-ink-700)'),
      cursor: resolveColor('color-mix(in srgb, var(--color-brand-600) 10%, transparent)'),
      tooltip: { borderRadius: 8, border: `1px solid ${resolveColor('color-mix(in srgb, var(--color-ink-900) 12%, transparent)')}`, fontSize: 12, background: card, color: resolveColor('var(--color-ink-700)') },
    }
  }, [theme.accent, theme.custom, resolvedMode])
}
