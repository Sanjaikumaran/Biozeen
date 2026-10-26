import { Activity, Check, ChevronDown, Code2, Download, Gauge, Link2, RotateCcw, ToggleRight, Upload, UserCog, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, ErrorState, Loading, PageHeader, SearchInput, Select, Tabs, useFeedback } from '../../components/ui'
import { WorkspaceLayout, type NavItem } from '../../layouts/WorkspaceLayout'
import { ApiError, api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { formatDate, timeAgo } from '../../lib/format'
import { useAsync, useDocumentTitle, useQueryState } from '../../lib/hooks'
import { AUDIENCE_LABELS, explain, resolveFeature, type FeatureDef, type Setting } from './resolve'

const NAV: NavItem[] = [
  { to: '/developer', label: 'Overview', icon: Gauge, end: true },
  { to: '/developer/features', label: 'Feature control', icon: ToggleRight },
  { to: '/admin', label: 'Admin workspace', icon: Users },
  { to: '/developer/settings', label: 'My settings', icon: UserCog },
]

export function DeveloperLayout() {
  return <WorkspaceLayout title="Developer console" items={NAV} developerOnly />
}

interface Snapshot {
  features: FeatureDef[]
  audiences: string[]
  settings: Record<string, Setting>
  matrix: Record<string, Record<string, { on: boolean; reason?: string; key?: string }>>
}

// ------------------------------------------------------------------ overview

interface Overview {
  environment: Record<string, string | boolean>
  features: { total: number; off: number; limited: number }
  collections: Record<string, number>
  developers: { _id: string; name: string; email: string; lastLoginAt?: string }[]
  history: { _id: string; at: string; summary: string; actorEmail?: string }[]
}

export function DeveloperOverview() {
  useDocumentTitle('Developer console')
  const { data, error, loading, reload } = useAsync(() => api.get<Overview>('/developer/overview'), [])
  if (loading) return <Loading />
  if (error || !data) return <ErrorState error={error} onRetry={reload} />
  const env = data.environment
  const flag = (v: unknown) => (v ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>)
  return (
    <div className="space-y-6">
      <PageHeader title="Developer console" subtitle="Control which screens and features each member category can use. Changes apply immediately for everyone." actions={<Link to="/developer/features"><Button><ToggleRight className="size-4" />Feature control</Button></Link>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><p className="text-3xl font-bold text-ink-900 tabular-nums">{data.features.total}</p><p className="text-sm text-ink-500">Features under control</p></Card>
        <Card className="p-5"><p className="text-3xl font-bold text-ink-900 tabular-nums">{data.features.off}</p><p className="text-sm text-ink-500">Switched off</p></Card>
        <Card className="p-5"><p className="text-3xl font-bold text-ink-900 tabular-nums">{data.features.limited}</p><p className="text-sm text-ink-500">Limited to some categories</p></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Environment</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-ink-500">Mode</dt><dd>{String(env.nodeEnv)} · Node {String(env.node)}</dd>
            <dt className="text-ink-500">App URL</dt><dd className="break-all">{String(env.appUrl)}</dd>
            <dt className="text-ink-500">Email</dt><dd>{String(env.email)}</dd>
            <dt className="text-ink-500">Sign-in codes</dt><dd>{flag(env.loginOtp)}</dd>
            <dt className="text-ink-500">Admin approval</dt><dd>{flag(env.requireApproval)}</dd>
            <dt className="text-ink-500">Email verification</dt><dd>{flag(env.requireEmailVerification)}</dd>
            <dt className="text-ink-500">Auto-init database</dt><dd>{flag(env.autoInitDb)}</dd>
          </dl>
          <p className="mt-3 text-xs text-ink-500">These come from <code>server/.env</code> and need a restart to change.</p>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Recent feature changes</h2>
          {data.history.length ? (
            <ul className="divide-y divide-ink-900/8 text-sm">
              {data.history.map((h) => <li key={h._id} className="py-2"><p className="text-ink-900">{h.summary}</p><p className="text-xs text-ink-500">{h.actorEmail} · {timeAgo(h.at)}</p></li>)}
            </ul>
          ) : <p className="text-sm text-ink-500">No changes yet. Every feature is on for everyone.</p>}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Developer accounts</h2>
          <ul className="space-y-2 text-sm">
            {data.developers.map((d) => <li key={d._id} className="flex items-center justify-between gap-3"><span><span className="font-medium text-ink-900">{d.name}</span> <span className="text-ink-500">{d.email}</span></span><span className="text-xs text-ink-500">{d.lastLoginAt ? `Last sign-in ${formatDate(d.lastLoginAt)}` : 'Never signed in'}</span></li>)}
          </ul>
          <p className="mt-3 text-xs text-ink-500">Developer accounts are not a role: they don't appear in Roles & Permissions, member lists or the admin audit log. Create one with <code>DEVELOPER_EMAIL</code> and <code>DEVELOPER_PASSWORD</code>.</p>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Database</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {Object.entries(data.collections).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-ink-500">{k}</span><span className="tabular-nums text-ink-900">{v}</span></div>)}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ feature control

function useSnapshot() {
  const state = useAsync(() => api.get<Snapshot>('/developer/features'), [])
  return state
}

/** Features ordered as a tree (each parent followed by its children), with their depth. */
function tree(features: FeatureDef[]) {
  const children = new Map<string | undefined, FeatureDef[]>()
  for (const f of features) children.set(f.parent, [...(children.get(f.parent) ?? []), f])
  const out: { def: FeatureDef; depth: number }[] = []
  const walk = (parent: string | undefined, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      out.push({ def: f, depth })
      walk(f.key, depth + 1)
    }
  }
  walk(undefined, 0)
  return out
}

function AudiencePicker({ def, setting, audiences, onChange }: { def: FeatureDef; setting: Setting; audiences: string[]; onChange: (a: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  if (def.scope === 'staff') return <span className="text-xs text-ink-500">Staff feature</span>
  const options = def.scope === 'member' ? audiences.filter((a) => a !== 'visitor') : audiences
  const chosen = setting.audience.filter((a) => options.includes(a))
  const everyone = chosen.length === 0
  const toggle = (a: string) => {
    const base = everyone ? options : chosen
    const next = base.includes(a) ? base.filter((x) => x !== a) : [...base, a]
    onChange(next.length === options.length ? [] : next)
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cx('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium', everyone ? 'border-ink-900/10 text-ink-700' : 'border-amber-200 bg-amber-50 text-amber-800')}>
        {everyone ? (def.scope === 'member' ? 'All members' : 'Everyone') : chosen.length === 1 ? AUDIENCE_LABELS[chosen[0]!] : `${chosen.length} audiences`}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-ink-900/10 bg-card p-2 shadow-lg">
          <p className="px-1 pb-1 text-xs text-ink-500">Who can use “{def.label}”</p>
          {options.map((a) => {
            const on = everyone || chosen.includes(a)
            return (
              <label key={a} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-ink-900/5">
                <input type="checkbox" className="accent-brand-600" checked={on} onChange={() => toggle(a)} />
                {AUDIENCE_LABELS[a]}
              </label>
            )
          })}
          {!everyone && <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded px-1 py-1 text-left text-xs font-medium text-brand-600 hover:bg-ink-900/5">Allow everyone</button>}
        </div>
      )}
    </div>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cx('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition', on ? 'bg-brand-600' : 'bg-ink-300')}>
      <span className={cx('inline-block size-5 rounded-full bg-white shadow transition', on ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

export function FeatureControl() {
  useDocumentTitle('Feature control')
  const { toast, confirm } = useFeedback()
  const { data, error, loading, reload, setData } = useSnapshot()
  const [f, setF] = useQueryState({ view: 'tree', as: 'student', q: '' })
  const [busy, setBusy] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const byKey = useMemo(() => new Map((data?.features ?? []).map((d) => [d.key, d])), [data])
  if (loading) return <Loading />
  if (error || !data) return <ErrorState error={error} onRetry={reload} />
  const { features, settings, audiences } = data
  const asAudience = f.as === 'staff' ? null : f.as

  const save = async (key: string, next: Setting) => {
    setBusy(key)
    try {
      setData(await api.put<Snapshot>(`/developer/features/${key}`, next))
    } catch (e) {
      toast((e as ApiError).message, 'error')
    } finally {
      setBusy('')
    }
  }

  /** Features that are on now (for anyone) but would go off if `key` is switched off. */
  const dependentsOff = (key: string) => {
    const after = { ...settings, [key]: { ...settings[key]!, enabled: false } }
    const audiencesToCheck: (string | null)[] = [...audiences, null]
    return features.filter((d) => d.key !== key && audiencesToCheck.some((a) => resolveFeature(features, settings, d.key, a).on && !resolveFeature(features, after, d.key, a).on))
  }

  const toggle = async (def: FeatureDef, on: boolean) => {
    const s = settings[def.key]!
    if (!on) {
      const deps = dependentsOff(def.key)
      if (deps.length) {
        const ok = await confirm({
          title: `Switch off “${def.label}”?`,
          message: (
            <div className="space-y-2">
              <p>These features depend on it and will also stop working:</p>
              <ul className="list-disc pl-5">{deps.map((d) => <li key={d.key}>{d.label} <span className="text-ink-500">({d.group})</span></li>)}</ul>
              <p className="text-ink-500">Their own settings are kept, so they come back when you switch this on again.</p>
            </div>
          ),
          confirmLabel: `Switch off ${deps.length + 1} features`,
          danger: true,
        })
        if (!ok) return
      }
    }
    await save(def.key, { ...s, enabled: on })
    toast(`${def.label} ${on ? 'on' : 'off'}`)
  }

  const resetAll = async () => {
    if (!(await confirm({ title: 'Reset every feature?', message: 'All screens and features will be switched on for everyone.', confirmLabel: 'Reset', danger: true }))) return
    setData(await api.post<Snapshot>('/developer/features/reset'))
    toast('All features reset')
  }

  const exportConfig = () => {
    const changed = Object.fromEntries(Object.entries(settings).filter(([, s]) => !s.enabled || s.audience.length))
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), settings: changed }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'bian-features.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importConfig = async (file: File) => {
    try {
      const json = JSON.parse(await file.text()) as { settings?: Record<string, Setting> }
      if (!json.settings) throw new Error('This file has no "settings" object.')
      if (!(await confirm({ title: 'Apply this configuration?', message: `It replaces every current setting (${Object.keys(json.settings).length} changed features in the file).`, confirmLabel: 'Apply' }))) return
      setData(await api.put<Snapshot>('/developer/features', { settings: json.settings }))
      toast('Configuration applied')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const q = f.q.trim().toLowerCase()
  const rows = tree(features).filter(({ def }) => !q || `${def.label} ${def.key} ${def.description}`.toLowerCase().includes(q))
  const groups = [...new Set(features.map((d) => d.group))]
  const offCount = Object.values(settings).filter((s) => !s.enabled).length
  const limitedCount = Object.values(settings).filter((s) => s.enabled && s.audience.length).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Feature control"
        subtitle="Switch screens and features on or off, and choose which visitors and member categories can use them. Switching something off also switches off everything that depends on it."
        actions={
          <>
            <Button variant="outline" onClick={exportConfig}><Download className="size-4" />Export</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4" />Import</Button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importConfig(file) }} />
            <Button variant="ghost" onClick={resetAll}><RotateCcw className="size-4" />Reset all</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={f.view} onChange={(view) => setF({ view })} tabs={[{ value: 'tree', label: 'Screens & features' }, { value: 'matrix', label: 'Category matrix' }]} />
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <Badge>{features.length} features</Badge>
          <Badge tone={offCount ? 'red' : 'gray'}>{offCount} off</Badge>
          <Badge tone={limitedCount ? 'amber' : 'gray'}>{limitedCount} limited</Badge>
        </div>
      </div>

      {f.view === 'matrix' ? (
        <Matrix data={data} onToggleAudience={(def, a) => {
          const s = settings[def.key]!
          const options = def.scope === 'member' ? audiences.filter((x) => x !== 'visitor') : audiences
          const base = s.audience.length ? s.audience : options
          const next = base.includes(a) ? base.filter((x) => x !== a) : [...base, a]
          void save(def.key, { ...s, audience: next.length === options.length ? [] : next })
        }} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Search features…" />
            <Select label="Preview as" value={f.as} onChange={(e) => setF({ as: e.target.value })} className="h-10 w-52">
              {audiences.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>)}
              <option value="staff">Staff (admin access)</option>
            </Select>
            <p className="pb-2 text-xs text-ink-500">The status column shows what the chosen audience gets, including the effect of the chain.</p>
          </div>
          {groups.map((group) => {
            const groupRows = rows.filter((r) => r.def.group === group)
            if (!groupRows.length) return null
            return (
              <Card key={group} className="overflow-hidden">
                <h2 className="border-b border-ink-900/8 bg-ink-900/[0.02] px-4 py-2.5 text-sm font-semibold text-ink-900">{group}</h2>
                <ul className="divide-y divide-ink-900/8">
                  {groupRows.map(({ def, depth }) => {
                    const s = settings[def.key]!
                    const r = resolveFeature(features, settings, def.key, asAudience)
                    const why = explain(r, def.key, byKey, f.as)
                    return (
                      <li key={def.key} id={`f-${def.key}`} className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3', !s.enabled && 'bg-ink-900/[0.02]')}>
                        <div className="min-w-0 flex-1" style={{ paddingLeft: `${depth * 1.5}rem` }}>
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
                            {depth > 0 && <span className="text-ink-300" aria-hidden>└</span>}
                            {def.label}
                            <code className="text-[11px] font-normal text-ink-500">{def.key}</code>
                          </p>
                          <p className="text-xs text-ink-500">{def.description}</p>
                          {!!def.requires?.length && (
                            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-500">
                              <Link2 className="size-3" />Needs
                              {def.requires.map((k) => <a key={k} href={`#f-${k}`} className="rounded bg-ink-900/5 px-1.5 py-0.5 text-ink-700 hover:bg-ink-900/10">{byKey.get(k)?.label}</a>)}
                            </p>
                          )}
                        </div>
                        <div className="w-48 text-xs">
                          {r.on ? <span className="inline-flex items-center gap-1 font-medium text-brand-700"><Check className="size-3.5" />Available</span> : <span className="font-medium text-red-700">{why}</span>}
                        </div>
                        <AudiencePicker def={def} setting={s} audiences={audiences} onChange={(audience) => void save(def.key, { ...s, audience })} />
                        <Switch on={s.enabled} label={`${def.label} on or off`} onChange={(on) => void toggle(def, on)} />
                        {busy === def.key && <Activity className="size-4 animate-pulse text-ink-500" />}
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )
          })}
        </>
      )}
    </div>
  )
}

function Matrix({ data, onToggleAudience }: { data: Snapshot; onToggleAudience: (def: FeatureDef, audience: string) => void }) {
  const cols = [...data.audiences, 'staff']
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="border-b border-ink-900/8 bg-ink-900/[0.02] text-xs text-ink-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Feature</th>
            {cols.map((c) => <th key={c} className="px-2 py-2 text-center font-medium">{c === 'staff' ? 'Staff' : AUDIENCE_LABELS[c]}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-900/8">
          {tree(data.features).map(({ def, depth }) => (
            <tr key={def.key}>
              <td className="px-3 py-2" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}><span className={cx(depth === 0 && 'font-medium text-ink-900')}>{def.label}</span></td>
              {cols.map((c) => {
                const r = data.matrix[def.key]?.[c] ?? { on: true }
                const own = r.key === def.key
                const editable = c !== 'staff' && def.scope !== 'staff' && !(def.scope === 'member' && c === 'visitor')
                const title = r.on ? 'Available' : r.reason === 'audience' && own ? 'Not for this audience' : own ? 'Switched off' : `Off because ${data.features.find((x) => x.key === r.key)?.label} is ${r.reason === 'audience' ? 'limited' : 'off'}`
                return (
                  <td key={c} className="px-1 py-1 text-center">
                    <button
                      type="button"
                      disabled={!editable}
                      title={editable ? `${title} — click to change for ${AUDIENCE_LABELS[c]}` : title}
                      aria-label={`${def.label}, ${c === 'staff' ? 'staff' : AUDIENCE_LABELS[c]}: ${title}`}
                      onClick={() => onToggleAudience(def, c)}
                      className={cx(
                        'grid size-7 place-items-center rounded-md text-xs font-bold',
                        r.on ? 'bg-brand-50 text-brand-700' : own ? 'bg-red-50 text-red-700' : 'bg-ink-900/5 text-ink-500',
                        editable ? 'hover:ring-2 hover:ring-brand-500/30' : 'cursor-default',
                      )}
                    >
                      {r.on ? '✓' : own ? '✕' : '–'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex flex-wrap gap-4 border-t border-ink-900/8 px-3 py-2 text-xs text-ink-500">
        <span><b className="text-brand-700">✓</b> available</span>
        <span><b className="text-red-700">✕</b> off or limited by its own setting</span>
        <span><b>–</b> off because something it depends on is off</span>
        <span>Click a cell to allow or block that audience. <Code2 className="inline size-3" /> Staff columns follow on/off only.</span>
      </p>
    </Card>
  )
}
