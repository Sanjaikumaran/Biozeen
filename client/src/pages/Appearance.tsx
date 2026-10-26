import { Check, Monitor, Moon, Pipette, Sun } from 'lucide-react'
import { useState } from 'react'
import { LogoMark } from '../components/Logo'
import { Badge, Button, Card, PageHeader, useFeedback } from '../components/ui'
import { useAuth } from '../lib/auth'
import { cx } from '../lib/cx'
import { useDocumentTitle } from '../lib/hooks'
import { useTheme } from '../lib/theme'
import { ACCENTS, DEFAULT_CUSTOM, DEFAULT_THEME, type Accent, type ThemeChoice, type ThemeMode } from '../lib/themes'

const MODES: { key: ThemeMode; label: string; hint: string; icon: typeof Sun }[] = [
  { key: 'light', label: 'Light', hint: 'Bright backgrounds', icon: Sun },
  { key: 'dark', label: 'Dark', hint: 'Easier in low light', icon: Moon },
  { key: 'system', label: 'System', hint: 'Follows your device', icon: Monitor },
]

/** A small mock of the site, rendered with any theme. The data attributes scope the theme to this box. */
function ThemePreview({ accent, mode, compact, custom }: { accent: Accent; mode: 'light' | 'dark'; compact?: boolean; custom?: string }) {
  // A custom accent reads its base colour from this variable, so the preview can show an unsaved pick.
  const style = accent === 'custom' ? ({ '--custom-base': custom ?? DEFAULT_CUSTOM } as React.CSSProperties) : undefined
  if (compact) {
    return (
      <div data-accent={accent} data-mode={mode} style={style} className="theme-fade flex h-20 overflow-hidden rounded-lg bg-surface" aria-hidden>
        <div className="on-brand w-5 bg-brand-900" />
        <div className="flex-1 space-y-1.5 p-2">
          <div className="hero-bg h-5 rounded" />
          <div className="space-y-1 rounded border border-ink-900/8 bg-card p-1.5">
            <div className="h-1.5 w-3/4 rounded bg-ink-900/60" />
            <div className="h-1.5 w-1/2 rounded bg-ink-500/50" />
            <div className="h-2.5 w-8 rounded bg-brand-600" />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div data-accent={accent} data-mode={mode} style={style} className="theme-fade overflow-hidden rounded-xl border border-ink-900/10 bg-surface text-ink-700" aria-label={`Preview: ${accent} accent, ${mode} mode`}>
      <div className="flex items-center gap-2 border-b border-ink-900/8 bg-card px-4 py-2.5">
        <LogoMark className="size-7" />
        <span className="font-extrabold tracking-tight text-ink-900">BIAN</span>
        <span className="ml-auto hidden gap-3 text-xs text-ink-700 sm:flex"><span className="text-brand-700">Home</span><span>Partners</span><span>Experts</span></span>
        <span className="ml-auto rounded-md bg-navy px-2.5 py-1 text-xs font-semibold text-white sm:ml-3">Login</span>
      </div>
      <div className="flex">
        <div className="on-brand hidden w-36 shrink-0 space-y-1 bg-brand-900 p-2 text-xs sm:block">
          <p className="rounded-md bg-lime-500 px-2 py-1.5 font-medium text-brand-900">Dashboard</p>
          <p className="px-2 py-1.5 text-brand-100">My Learning</p>
          <p className="px-2 py-1.5 text-brand-100">Events</p>
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div className="hero-bg rounded-lg p-4 text-white">
            <p className="text-lg font-bold">Bridging industry and academia</p>
            <p className="text-xs text-brand-100">Discover. Collaborate. Create impact.</p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-md bg-lime-500 px-2.5 py-1 text-xs font-semibold text-brand-900">Join now</span>
              <span className="rounded-md border border-white/40 px-2.5 py-1 text-xs font-semibold">Explore</span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-900/8 bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">Biomanufacturing internship</p>
                <Badge tone="green">Open</Badge>
              </div>
              <p className="mt-1 text-xs text-ink-500">Posted by a partner organisation · Closes in 12 days</p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">Apply</span>
                <span className="rounded-md border border-brand-200 bg-card px-2.5 py-1 text-xs font-semibold text-brand-700">Save</span>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-ink-900/8 bg-card p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-600">24</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">Courses in progress</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-ink-900/8"><div className="h-full w-2/3 rounded-full bg-brand-600" /></div>
                <div className="mt-2 flex gap-1.5"><Badge tone="amber">Pending</Badge><Badge tone="blue">New</Badge></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Theme colour and light/dark mode; shown as a section of the Settings page. */
export default function Appearance({ embedded = false }: { embedded?: boolean }) {
  useDocumentTitle(embedded ? undefined : 'Appearance')
  const { theme, systemDark, setTheme } = useTheme()
  const { user } = useAuth()
  const { toast } = useFeedback()
  const [draft, setDraft] = useState<ThemeChoice>(theme)
  const [saving, setSaving] = useState(false)
  const resolve = (m: ThemeMode) => (m === 'system' ? (systemDark ? 'dark' : 'light') : m)
  const changed = draft.mode !== theme.mode || draft.accent !== theme.accent || (draft.accent === 'custom' && (draft.custom ?? DEFAULT_CUSTOM) !== (theme.custom ?? DEFAULT_CUSTOM))
  const customOn = draft.accent === 'custom'
  const customHex = draft.custom ?? DEFAULT_CUSTOM

  const save = async (t: ThemeChoice) => {
    setSaving(true)
    try {
      await setTheme(t)
      toast(user ? 'Appearance saved to your account' : 'Appearance applied for this browser session')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {embedded ? (
        <div>
          <h2 className="text-xl font-bold text-ink-900">Appearance</h2>
          <p className="mt-1 text-sm text-ink-500">Theme colour and light or dark mode. Saved to your account and applied on every device you sign in on.</p>
        </div>
      ) : (
        <PageHeader
          title="Appearance"
          subtitle={user ? 'Choose how BIAN looks for you. Your choice is saved to your account and applies on every device you sign in on.' : 'Choose how BIAN looks in this browser session. Sign in to keep your choice on every device.'}
        />
      )}

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Mode</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Mode">
          {MODES.map((m) => {
            const on = draft.mode === m.key
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDraft({ ...draft, mode: m.key })}
                className={cx('swatch rounded-xl border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40', on ? 'border-brand-500 shadow-[0_0_0_3px] shadow-brand-500/25' : 'border-ink-900/10 hover:border-brand-200')}
              >
                {m.key === 'system' ? (
                  <div className="grid grid-cols-2 gap-1">
                    <ThemePreview accent={draft.accent} custom={draft.custom} mode="light" compact />
                    <ThemePreview accent={draft.accent} custom={draft.custom} mode="dark" compact />
                  </div>
                ) : (
                  <ThemePreview accent={draft.accent} custom={draft.custom} mode={m.key} compact />
                )}
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink-900"><m.icon className="size-4" />{m.label}{on && <Check className="ml-auto size-4 text-brand-600" />}</p>
                <p className="text-xs text-ink-500">{m.key === 'system' ? `${m.hint} (now ${systemDark ? 'dark' : 'light'})` : m.hint}</p>
              </button>
            )
          })}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Theme colour</h2>
        <p className="mt-1 text-sm text-ink-500">Used for buttons, links, highlights, banners and the sidebar.</p>
        <div className="mt-4 flex flex-wrap gap-3" role="radiogroup" aria-label="Theme colour">
          {ACCENTS.map((a) => {
            const on = draft.accent === a.key
            return (
              <button
                key={a.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDraft({ ...draft, accent: a.key })}
                className={cx('swatch flex w-24 flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40', on ? 'border-brand-500 shadow-[0_0_0_3px] shadow-brand-500/25' : 'border-ink-900/10 hover:border-brand-200')}
              >
                <span className="grid size-9 place-items-center rounded-full text-white ring-2 ring-card" style={{ background: `linear-gradient(135deg, ${a.swatch} 55%, ${a.highlight} 55%)` }}><Check className={cx('size-4 transition-all duration-200', on ? 'scale-100 opacity-100' : 'scale-50 opacity-0')} /></span>
                {a.label}
              </button>
            )
          })}
          <label
            className={cx('swatch relative flex w-24 cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium text-ink-900 focus-within:ring-2 focus-within:ring-brand-500/40', customOn ? 'border-brand-500 shadow-[0_0_0_3px] shadow-brand-500/25' : 'border-ink-900/10 hover:border-brand-200')}
            title="Pick any colour"
          >
            <span className="grid size-9 place-items-center rounded-full text-white ring-2 ring-card" style={{ background: customOn ? customHex : 'conic-gradient(#e34948, #eda100, #1baf7a, #2a78d6, #6250d6, #e87ba4, #e34948)' }}>
              {customOn ? <Check className="size-4" /> : <Pipette className="size-4 drop-shadow" />}
            </span>
            Custom
            <input
              type="color"
              aria-label="Custom theme colour"
              value={customHex}
              onClick={() => !customOn && setDraft({ ...draft, accent: 'custom', custom: customHex })}
              onChange={(e) => setDraft({ ...draft, accent: 'custom', custom: e.target.value })}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        </div>
        {customOn && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span className="inline-block size-3 rounded-sm" style={{ background: customHex }} aria-hidden />
            <span className="font-mono uppercase text-ink-700">{customHex}</span>
            Very light colours are darkened automatically so text on buttons stays readable.
          </p>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Preview</h2>
          {changed && <Badge tone="amber">Not saved yet</Badge>}
        </div>
        <ThemePreview accent={draft.accent} custom={draft.custom} mode={resolve(draft.mode)} />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => { setDraft(DEFAULT_THEME); void save(DEFAULT_THEME) }} disabled={saving}>Reset to default</Button>
          {changed && <Button variant="outline" onClick={() => setDraft(theme)} disabled={saving}>Discard</Button>}
          <Button onClick={() => save(draft)} loading={saving} disabled={!changed}>Apply theme</Button>
        </div>
      </Card>
    </div>
  )
}
