import { Globe, Lock, ShieldCheck, Users } from 'lucide-react'
import { createContext, useContext } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fromLocalInput, label, toLocalInput } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import type { Access, PublicationStatus } from '../../lib/types'
import { Alert, Card, Input, Select, StatusBadge } from '../ui'
import { cx } from '../../lib/cx'

export interface Lookups {
  roles: { _id: string; name: string; displayName: string }[]
  organizations: { _id: string; name: string }[]
  forms: { _id: string; title: string; status: string; anonymity: string }[]
}

const LookupsContext = createContext<Lookups>({ roles: [], organizations: [], forms: [] })

export function LookupsProvider({ children }: { children: React.ReactNode }) {
  const { data } = useAsync(() => api.get<Lookups>('/admin/lookups'), [])
  return <LookupsContext.Provider value={data ?? { roles: [], organizations: [], forms: [] }}>{children}</LookupsContext.Provider>
}

/** Audience choices for members limiting their own expert profile (no admin lookups needed). */
export function MemberAudienceProvider({ children }: { children: React.ReactNode }) {
  const { data } = useAsync(() => api.get<Lookups>('/experts/audience-options'), [])
  return <LookupsContext.Provider value={data ?? { roles: [], organizations: [], forms: [] }}>{children}</LookupsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useLookups = () => useContext(LookupsContext)

const AUDIENCES = [
  { value: 'public', label: 'Public visitors', text: 'Anyone, including search engines', icon: Globe },
  { value: 'authenticated', label: 'All members', text: 'Any signed-in, approved member', icon: Users },
  { value: 'roles', label: 'Selected roles', text: 'Only members with chosen roles', icon: ShieldCheck },
  { value: 'organizations', label: 'Selected organizations', text: 'Members of chosen organizations', icon: Users },
  { value: 'private', label: 'Administrators only', text: 'Content managers only', icon: Lock },
] as const

export function AccessEditor({ value, onChange, errors, privateOption }: { value: Access; onChange: (a: Access) => void; errors?: Record<string, string>; privateOption?: { label: string; text: string } }) {
  const { roles, organizations } = useLookups()
  const audiences = AUDIENCES.map((a) => (a.value === 'private' && privateOption ? { ...a, ...privateOption } : a))
  const toggle = (key: 'roles' | 'organizations', id: string) => {
    const list = value[key] ?? []
    onChange({ ...value, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] })
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2" role="radiogroup" aria-label="Audience">
        {audiences.map((a) => (
          <label key={a.value} className={cx('flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 text-sm', value.visibility === a.value ? 'border-brand-500 bg-brand-50' : 'border-ink-900/10 hover:border-brand-200')}>
            <input type="radio" name="visibility" className="mt-0.5 accent-brand-600" checked={value.visibility === a.value} onChange={() => onChange({ ...value, visibility: a.value })} />
            <a.icon className="mt-0.5 size-4 text-brand-600" />
            <span><span className="block font-medium text-ink-900">{a.label}</span><span className="text-xs text-ink-500">{a.text}</span></span>
          </label>
        ))}
      </div>
      {value.visibility === 'roles' && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-700">Roles with access</p>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {roles.map((r) => {
              const on = value.roles?.includes(r._id)
              return <button key={r._id} type="button" aria-pressed={on} onClick={() => toggle('roles', r._id)} className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-900/15 bg-card text-ink-700')}>{r.displayName}</button>
            })}
          </div>
          {errors?.['access.roles'] && <p className="mt-1 text-xs text-red-600">{errors['access.roles']}</p>}
        </div>
      )}
      {value.visibility === 'organizations' && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-700">Organizations with access</p>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {organizations.map((o) => {
              const on = value.organizations?.includes(o._id)
              return <button key={o._id} type="button" aria-pressed={on} onClick={() => toggle('organizations', o._id)} className={cx('rounded-full border px-2.5 py-1 text-xs font-medium', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-900/15 bg-card text-ink-700')}>{o.name}</button>
            })}
          </div>
          {errors?.['access.organizations'] && <p className="mt-1 text-xs text-red-600">{errors['access.organizations']}</p>}
        </div>
      )}
    </div>
  )
}

/** One-line description of an access rule for list views. */
export function AudienceSummary({ access }: { access?: Access }) {
  const { roles } = useLookups()
  if (!access) return null
  if (access.visibility !== 'roles') return <span>{label(access.visibility)}</span>
  return <span>{(access.roles ?? []).map((id) => roles.find((r) => r._id === id)?.displayName ?? '…').join(', ')}</span>
}

export interface PublishState {
  status: PublicationStatus
  publishAt?: string | null
  expireAt?: string | null
}

export function PublishPanel({ value, onChange, errors }: { value: PublishState; onChange: (v: PublishState) => void; errors?: Record<string, string> }) {
  const { can } = useAuth()
  const canPublish = can('content.publish')
  const statuses: PublicationStatus[] = canPublish ? ['draft', 'pending_review', 'approved', 'scheduled', 'published', 'unpublished', 'archived'] : ['draft', 'pending_review']
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between"><p className="font-semibold text-ink-900">Publishing</p><StatusBadge status={value.status} /></div>
      <Select label="Status" value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as PublicationStatus })}>
        {statuses.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        {!statuses.includes(value.status) && <option value={value.status}>{label(value.status)}</option>}
      </Select>
      {!canPublish && <Alert tone="info">You can save drafts and submit for review. A publisher will make it live.</Alert>}
      <Input label="Publish date" type="datetime-local" value={toLocalInput(value.publishAt)} onChange={(e) => onChange({ ...value, publishAt: fromLocalInput(e.target.value) })} error={errors?.publishAt} hint={value.status === 'scheduled' ? 'Goes live automatically at this time' : 'Optional'} />
      <Input label="Expiry date" type="datetime-local" value={toLocalInput(value.expireAt)} onChange={(e) => onChange({ ...value, expireAt: fromLocalInput(e.target.value) })} hint="Hidden from members after this time" />
    </Card>
  )
}
