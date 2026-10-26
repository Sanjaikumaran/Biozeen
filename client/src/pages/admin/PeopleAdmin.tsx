import { Check, Download, Filter, Plus, ShieldCheck, UserCheck, X } from 'lucide-react'
import { useState } from 'react'
import { AccessEditor, AudienceSummary, useLookups } from '../../components/admin/Publishing'
import { Alert, Badge, Button, Card, Checkbox, DetailList, Empty, ErrorState, Input, LinkButton, Loading, Modal, PageHeader, Pagination, RowActions, SearchInput, Select, StatusBadge, Tabs, TagInput, Textarea, useFeedback } from '../../components/ui'
import { useFeature, useFeatures } from '../../lib/features'
import { useRefreshAdminCounts } from '../../lib/adminCounts'
import { ApiError, api, downloadUrl, type Paged } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { LABELS, contentHref, formatDate, formatDateTime, label, timeAgo } from '../../lib/format'
import { useAsync, useDebounced, useDocumentTitle, useQueryState } from '../../lib/hooks'
import type { Access, Organization } from '../../lib/types'

const CATEGORIES = ['startup', 'academia', 'industry', 'sme', 'alumni', 'student', 'professional', 'other']
const CATEGORY_ROLE: Record<string, string> = { startup: 'startup', academia: 'academia', industry: 'industry', sme: 'expert', alumni: 'alumni', student: 'student', professional: 'professional', other: 'member' }

interface Member {
  _id: string
  name: string
  email: string
  category: string
  accountType: string
  status: string
  emailVerified: boolean
  roles: { _id: string; name: string; displayName: string }[]
  organization?: { _id: string; name: string } | null
  profile?: Record<string, string>
  createdAt: string
  lastLoginAt?: string
}

function RolePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { roles } = useLookups()
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((r) => {
        const on = value.includes(r._id)
        return <button key={r._id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== r._id) : [...value, r._id])} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-900/15 bg-card text-ink-700'}`}>{r.displayName}</button>
      })}
    </div>
  )
}

/** Read-only member details, opened from the View action. */
function MemberView({ member, onClose, onEdit }: { member: Member; onClose: () => void; onEdit?: () => void }) {
  const p = member.profile ?? {}
  const rows: [string, React.ReactNode][] = [
    ['Email', <>{member.email} {member.emailVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}</>],
    ['Category', label(member.category)],
    ['Account type', label(member.accountType)],
    ['Organization', member.organization?.name ?? '—'],
    ['Roles', member.roles.length ? <span className="flex flex-wrap gap-1">{member.roles.map((r) => <Badge key={r._id}>{r.displayName}</Badge>)}</span> : '—'],
    ['Status', <StatusBadge status={member.status} />],
    ['Joined', formatDateTime(member.createdAt)],
    ['Last sign-in', member.lastLoginAt ? timeAgo(member.lastLoginAt) : 'Never'],
    ...(['designation', 'institution', 'graduationYear', 'location', 'linkedin'] as const).filter((k) => p[k]).map((k): [string, React.ReactNode] => [label(k), String(p[k])]),
  ]
  return (
    <Modal open onClose={onClose} title={member.name} size="md" footer={onEdit && <Button onClick={onEdit}>Edit member</Button>}>
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-ink-500">{k}</dt><dd className="min-w-0 break-words text-ink-900">{v}</dd></div>)}
      </dl>
      {p.bio && <p className="mt-4 whitespace-pre-line rounded-lg bg-ink-900/[0.03] p-3 text-sm">{p.bio}</p>}
    </Modal>
  )
}

export function Approvals() {
  useDocumentTitle('Member approvals')
  const { toast, confirm } = useFeedback()
  const { roles } = useLookups()
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<Member>>('/admin/users', { status: 'pending', limit: 50 }), [])
  const pendingContent = useAsync(() => api.get<Paged<{ _id: string; title: string; type: string; slug: string; author?: { name: string }; createdAt: string }>>('/admin/contents', { status: 'pending_review', limit: 50 }).catch(() => null), [])
  const [approving, setApproving] = useState<Member | null>(null)
  const [viewing, setViewing] = useState<Member | null>(null)
  const refreshCounts = useRefreshAdminCounts()
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const open = (m: Member) => {
    setApproving(m)
    setSelected(roles.filter((r) => r.name === 'member' || r.name === CATEGORY_ROLE[m.category]).map((r) => r._id))
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Member Approvals" subtitle="Review new registrations. A member's category describes them; the roles you assign decide what they can access." />
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? <Empty icon={<UserCheck className="size-8" />} title="No pending registrations" /> : (
        <Card className="divide-y divide-ink-900/8">
          {data.items.map((m) => (
            <div key={m._id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink-900">{m.name} <span className="font-normal text-ink-500">· {m.email}</span></p>
                <p className="text-xs text-ink-500">{label(m.category)}{m.organization && ` · ${m.organization.name}`} · registered {timeAgo(m.createdAt)} · {m.emailVerified ? 'email verified' : 'email not verified'}</p>
              </div>
              <RowActions label={m.name} view={() => setViewing(m)} />
              <Button size="sm" variant="ghost" className="hover:text-red-600" onClick={async () => { if (await confirm({ title: 'Reject registration?', message: `${m.name} will not be able to sign in.`, danger: true, confirmLabel: 'Reject' })) { await api.post(`/admin/users/${m._id}/reject`); toast('Registration rejected'); reload(); refreshCounts() } }}><X className="size-4" />Reject</Button>
              <Button size="sm" onClick={() => open(m)}><Check className="size-4" />Approve</Button>
            </div>
          ))}
        </Card>
      )}

      {pendingContent.data && pendingContent.data.items.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Content awaiting review</h2>
          <Card className="divide-y divide-ink-900/8">
            {pendingContent.data.items.map((c) => (
              <div key={c._id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-brand-50/40">
                <span className="flex-1"><span className="font-medium text-ink-900">{c.title}</span><span className="block text-xs text-ink-500">{label(c.type)} · {c.author?.name} · {timeAgo(c.createdAt)}</span></span>
                <StatusBadge status="pending_review" />
                <RowActions label={c.title} viewTo={contentHref(c)} editTo={`/admin/content/${c._id}`} />
              </div>
            ))}
          </Card>
        </section>
      )}

      <Modal
        open={!!approving}
        onClose={() => setApproving(null)}
        title={`Approve ${approving?.name}`}
        footer={<><Button variant="ghost" onClick={() => setApproving(null)}>Cancel</Button><Button loading={busy} onClick={async () => { setBusy(true); try { await api.post(`/admin/users/${approving!._id}/approve`, { roles: selected }); toast('Member approved'); setApproving(null); reload(); refreshCounts() } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) } }}>Approve member</Button></>}
      >
        <p className="mb-3 text-sm text-ink-500">Category: <span className="font-medium text-ink-900">{label(approving?.category)}</span>. Choose the roles this member receives:</p>
        <RolePicker value={selected} onChange={setSelected} />
      </Modal>
      {viewing && <MemberView member={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

export function Members() {
  useDocumentTitle('Members')
  const { roles } = useLookups()
  const [f, setF] = useQueryState({ q: '', status: '', category: '', role: '', page: '1' })
  const q = useDebounced(f.q)
  const params = { q, status: f.status, category: f.category, role: f.role }
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<Member>>('/admin/users', { ...params, page: f.page }), [q, f.status, f.category, f.role, f.page])
  const [editing, setEditing] = useState<Member | null>(null)
  const [viewing, setViewing] = useState<Member | null>(null)
  const exportsOn = useFeature('admin.exports')
  return (
    <div>
      <PageHeader title="Members" actions={exportsOn && <Button variant="outline" onClick={() => downloadUrl('/admin/users/export.csv', params)}><Download className="size-4" />Export CSV</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Search name or email…" />
        <Select aria-label="Status" value={f.status} onChange={(e) => setF({ status: e.target.value })} className="h-10 w-40"><option value="">All statuses</option>{['pending', 'active', 'suspended', 'inactive', 'rejected'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
        <Select aria-label="Category" value={f.category} onChange={(e) => setF({ category: e.target.value })} className="h-10 w-52"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>
        <Select aria-label="Role" value={f.role} onChange={(e) => setF({ role: e.target.value })} className="h-10 w-48"><option value="">All roles</option>{roles.map((r) => <option key={r._id} value={r._id}>{r.displayName}</option>)}</Select>
      </div>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? <Empty title="No members match" /> : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-ink-900/8 bg-ink-900/[0.02] text-xs uppercase tracking-wider text-ink-500"><tr><th className="px-4 py-3">Member</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Roles</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Joined</th><th /></tr></thead>
              <tbody className="divide-y divide-ink-900/8">
                {data.items.map((m) => (
                  <tr key={m._id}>
                    <td className="px-4 py-3"><p className="font-medium text-ink-900">{m.name}</p><p className="text-xs text-ink-500">{m.email}{m.organization && ` · ${m.organization.name}`}</p></td>
                    <td className="px-4 py-3">{label(m.category)}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{m.roles.map((r) => <Badge key={r._id}>{r.displayName}</Badge>)}</div></td>
                    <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                    <td className="px-4 py-3 text-xs text-ink-500">{formatDate(m.createdAt)}</td>
                    <td className="px-4 py-2.5"><RowActions label={m.name} view={() => setViewing(m)} edit={() => setEditing(m)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />
        </>
      )}
      {editing && <MemberEditor member={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {viewing && <MemberView member={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null) }} />}
    </div>
  )
}

function MemberEditor({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback()
  const { organizations } = useLookups()
  const [form, setForm] = useState({ name: member.name, category: member.category, status: member.status, roles: member.roles.map((r) => r._id), organization: member.organization?._id ?? '', emailVerified: member.emailVerified })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal open onClose={onClose} title={`Edit ${member.name}`} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={async () => { setBusy(true); setError(''); try { await api.patch(`/admin/users/${member._id}`, { ...form, organization: form.organization || null }); toast('Member updated'); onSaved(); onClose() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }}>Save</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <p className="text-sm text-ink-500">{member.email} · last sign-in {member.lastLoginAt ? timeAgo(member.lastLoginAt) : 'never'}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>
          <Select label="Account status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} hint="Suspending signs the member out immediately">{['pending', 'active', 'suspended', 'inactive', 'rejected'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
          <Select label="Organization" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })}><option value="">None</option>{organizations.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}</Select>
        </div>
        <Checkbox label="Email verified" checked={form.emailVerified} onChange={(e) => setForm({ ...form, emailVerified: e.target.checked })} />
        <div><p className="mb-2 text-sm font-medium text-ink-900">Roles</p><RolePicker value={form.roles} onChange={(roles) => setForm({ ...form, roles })} /></div>
      </div>
    </Modal>
  )
}

interface Role { _id: string; name: string; displayName: string; description: string; permissions: string[]; isSystem: boolean; members: number }

export function Roles() {
  useDocumentTitle('Roles & permissions')
  const { can } = useAuth()
  const { toast, confirm } = useFeedback()
  const { data, error, loading, reload } = useAsync(() => api.get<{ roles: Role[]; permissions: { key: string; label: string }[] }>('/admin/roles'), [])
  const [editing, setEditing] = useState<Partial<Role> | null>(null)
  const [viewing, setViewing] = useState<Role | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const editable = can('roles.manage')

  async function save() {
    setBusy(true)
    setErrors({})
    try {
      const body = { name: editing!.name, displayName: editing!.displayName, description: editing!.description, permissions: editing!.permissions ?? [] }
      if (editing!._id) await api.put(`/admin/roles/${editing!._id}`, body)
      else await api.post('/admin/roles', body)
      toast('Role saved')
      setEditing(null)
      reload()
    } catch (e) {
      if (e instanceof ApiError) setErrors({ ...e.fields, _: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Roles & Permissions" subtitle="Roles grant permissions and define content audiences. Member categories never grant access on their own." actions={editable && <Button onClick={() => setEditing({ permissions: [] })}><Plus className="size-4" />New role</Button>} />
      {loading ? <Loading /> : error || !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Card className="divide-y divide-ink-900/8">
          {data.roles.map((r) => (
            <div key={r._id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
              <ShieldCheck className="size-4 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1 basis-60">
                <p className="flex items-center gap-2 font-medium text-ink-900">{r.displayName}{r.isSystem && <Badge>System</Badge>}</p>
                <p className="truncate text-xs text-ink-500" title={r.description}>{r.name}{r.description && ` · ${r.description}`}</p>
              </div>
              <span className="w-24 text-xs text-ink-500">{r.members} member{r.members === 1 ? '' : 's'}</span>
              <span className="w-32 text-xs text-ink-500" title={r.permissions.join(', ')}>{r.permissions.length ? `${r.permissions.length} permission${r.permissions.length === 1 ? '' : 's'}` : 'Audience role'}</span>
              <RowActions
                label={r.displayName}
                view={() => setViewing(r)}
                edit={editable && r.name !== 'super_admin' ? () => setEditing(r) : undefined}
                editUnavailable={!editable ? 'Requires roles.manage' : 'The super administrator role is fixed'}
                removeUnavailable={!editable ? 'Requires roles.manage' : 'System roles can’t be deleted'}
                remove={editable && !r.isSystem ? async () => { if (await confirm({ title: 'Delete role?', message: `“${r.displayName}” will be removed.`, danger: true, confirmLabel: 'Delete' })) { try { await api.del(`/admin/roles/${r._id}`); toast('Role deleted'); reload() } catch (e) { toast((e as Error).message, 'error') } } } : undefined}
              />
            </div>
          ))}
        </Card>
      )}
      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={viewing.displayName} footer={editable && viewing.name !== 'super_admin' && <Button onClick={() => { setEditing(viewing); setViewing(null) }}>Edit role</Button>}>
          <div className="space-y-4 text-sm">
            <p className="text-ink-500">{viewing.name} · {viewing.members} member{viewing.members === 1 ? '' : 's'}{viewing.isSystem && ' · system role'}</p>
            {viewing.description && <p className="text-ink-700">{viewing.description}</p>}
            <div>
              <p className="mb-2 font-semibold text-ink-900">Permissions</p>
              {viewing.permissions.length ? <ul className="space-y-1.5">{viewing.permissions.map((p) => <li key={p} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-600" /><span>{data?.permissions.find((x) => x.key === p)?.label ?? p}<span className="block text-xs text-ink-500">{p}</span></span></li>)}</ul> : <p className="text-ink-500">Audience role: no extra permissions. Used to target content at members.</p>}
            </div>
          </div>
        </Modal>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?._id ? `Edit ${editing.displayName}` : 'New role'} size="lg" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} loading={busy}>Save role</Button></>}>
        {editing && (
          <div className="space-y-4">
            {errors._ && <Alert tone="error">{errors._}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Display name" required value={editing.displayName ?? ''} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} error={errors.displayName} />
              <Input label="Key" required value={editing.name ?? ''} disabled={editing.isSystem} onChange={(e) => setEditing({ ...editing, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} error={errors.name} hint="lowercase_with_underscores" />
            </div>
            <Textarea label="Description" value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} />
            <div>
              <p className="mb-2 text-sm font-medium text-ink-900">Permissions</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {data?.permissions.map((p) => (
                  <Checkbox key={p.key} label={<span><span className="font-medium">{p.label}</span><span className="block text-xs text-ink-500">{p.key}</span></span>} checked={editing.permissions?.includes(p.key)} onChange={(e) => setEditing({ ...editing, permissions: e.target.checked ? [...(editing.permissions ?? []), p.key] : (editing.permissions ?? []).filter((x) => x !== p.key) })} />
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------- master database

const ORG_TYPES = ['industry', 'academia', 'startup', 'research', 'innovation', 'government', 'other']
const TIERS = ['founding', 'knowledge', 'industry', 'innovation', 'none']

function OrgEditor({ org, onClose, onSaved }: { org: Partial<Organization>; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback()
  const [f, setF] = useState<Partial<Organization>>({ orgType: 'industry', partnerTier: 'none', visibility: 'internal', status: 'approved', collaborationAreas: [], contact: {}, ...org })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    setErrors({})
    try {
      const body = { name: f.name, orgType: f.orgType, partnerTier: f.partnerTier, description: f.description, logoUrl: f.logoUrl, website: f.website, location: f.location, contact: f.contact, collaborationAreas: f.collaborationAreas, initiatives: f.initiatives, visibility: f.visibility, status: f.status }
      if (f._id) await api.put(`/admin/directory/organizations/${f._id}`, body)
      else await api.post('/admin/directory/organizations', body)
      toast('Organization saved')
      onSaved()
      onClose()
    } catch (e) {
      if (e instanceof ApiError) setErrors({ ...e.fields, _: e.message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={f._id ? `Edit ${org.name}` : 'New organization'} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        {errors._ && <Alert tone="error">{errors._}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" required value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} />
          <Select label="Type" value={f.orgType} onChange={(e) => setF({ ...f, orgType: e.target.value })}>{ORG_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
          <Select label="Partner tier" value={f.partnerTier} onChange={(e) => setF({ ...f, partnerTier: e.target.value })}>{TIERS.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
          <Input label="Location" value={f.location ?? ''} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <Input label="Website" value={f.website ?? ''} onChange={(e) => setF({ ...f, website: e.target.value })} />
          <Input label="Logo URL" value={f.logoUrl ?? ''} onChange={(e) => setF({ ...f, logoUrl: e.target.value })} />
          <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Organization['status'] })}>{['pending', 'approved', 'inactive'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
          <Select label="Visibility" value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as Organization['visibility'] })} hint="Public = shown in the Partner Ecosystem"><option value="public">Public partner profile</option><option value="internal">Internal record only</option></Select>
        </div>
        <Textarea label="Description" value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} />
        <TagInput label="Collaboration areas" value={f.collaborationAreas ?? []} onChange={(collaborationAreas) => setF({ ...f, collaborationAreas })} />
        <fieldset className="grid gap-4 rounded-xl bg-ink-900/[0.02] p-4 sm:grid-cols-3">
          <legend className="px-1 text-sm font-semibold">Internal contact (never public)</legend>
          <Input label="Contact person" value={f.contact?.name ?? ''} onChange={(e) => setF({ ...f, contact: { ...f.contact, name: e.target.value } })} />
          <Input label="Email" value={f.contact?.email ?? ''} onChange={(e) => setF({ ...f, contact: { ...f.contact, email: e.target.value } })} />
          <Input label="Phone" value={f.contact?.phone ?? ''} onChange={(e) => setF({ ...f, contact: { ...f.contact, phone: e.target.value } })} />
        </fieldset>
      </div>
    </Modal>
  )
}

interface ExpertRow { _id: string; headline: string; expertType: string; domain?: string; skills: string[]; expertiseAreas: string[]; yearsExperience?: number; location?: string; bio?: string; access?: Access; shareEmail: boolean; mentoringAvailable: boolean; status: string; user: { _id: string; name: string; email: string } | null }

function ExpertEditor({ expert, onClose, onSaved }: { expert: Partial<ExpertRow>; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback()
  const [f, setF] = useState<Partial<ExpertRow>>({ expertType: 'industry_expert', access: { visibility: 'authenticated', roles: [], organizations: [] }, status: 'approved', skills: [], expertiseAreas: [], shareEmail: false, mentoringAvailable: false, ...expert })
  const [userQ, setUserQ] = useState('')
  const [userId, setUserId] = useState('')
  const users = useAsync(() => (!f._id && userQ.length >= 2 ? api.get<Paged<Member>>('/admin/users', { q: userQ, status: 'active', limit: 8 }) : Promise.resolve(null)), [userQ])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    setErrors({})
    try {
      const body = { headline: f.headline, bio: f.bio, expertType: f.expertType, domain: f.domain, skills: f.skills, expertiseAreas: f.expertiseAreas, yearsExperience: f.yearsExperience ? Number(f.yearsExperience) : undefined, location: f.location, access: f.access, shareEmail: f.shareEmail, mentoringAvailable: f.mentoringAvailable, status: f.status }
      if (f._id) await api.put(`/admin/directory/experts/${f._id}`, body)
      else await api.post('/admin/directory/experts', { ...body, user: userId })
      toast('Expert saved')
      onSaved()
      onClose()
    } catch (e) {
      if (e instanceof ApiError) setErrors({ ...e.fields, _: e.message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={f._id ? `Edit ${expert.user?.name}` : 'New expert profile'} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        {errors._ && <Alert tone="error">{errors._}</Alert>}
        {!f._id && (
          <div>
            <Input label="Member" value={userQ} onChange={(e) => { setUserQ(e.target.value); setUserId('') }} placeholder="Search an active member…" error={errors.user} />
            {users.data && !userId && <div className="mt-1 rounded-lg border border-ink-900/10">{users.data.items.map((u) => <button key={u._id} type="button" onClick={() => { setUserId(u._id); setUserQ(`${u.name} (${u.email})`) }} className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50">{u.name} <span className="text-ink-500">{u.email}</span></button>)}</div>}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Headline" required value={f.headline ?? ''} onChange={(e) => setF({ ...f, headline: e.target.value })} error={errors.headline} />
          <Select label="Expert type" value={f.expertType} onChange={(e) => setF({ ...f, expertType: e.target.value })}>{['industry_expert', 'research_expert', 'trainer', 'consultant', 'mentor'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
          <Input label="Domain" value={f.domain ?? ''} onChange={(e) => setF({ ...f, domain: e.target.value })} />
          <Input label="Years of experience" type="number" value={f.yearsExperience ?? ''} onChange={(e) => setF({ ...f, yearsExperience: e.target.value as unknown as number })} />
          <Input label="Location" value={f.location ?? ''} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{['pending', 'approved', 'inactive'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-900">Audience <span className="font-normal text-ink-500">(agree changes with the member)</span></legend>
          <AccessEditor value={f.access ?? { visibility: 'authenticated', roles: [], organizations: [] }} onChange={(access) => setF({ ...f, access })} errors={errors} privateOption={{ label: 'BIAN team only', text: 'Hidden from the Experts Network' }} />
        </fieldset>
        <Textarea label="Biography" value={f.bio ?? ''} onChange={(e) => setF({ ...f, bio: e.target.value })} rows={3} />
        <TagInput label="Skills" value={f.skills ?? []} onChange={(skills) => setF({ ...f, skills })} />
        <TagInput label="Areas of expertise" value={f.expertiseAreas ?? []} onChange={(expertiseAreas) => setF({ ...f, expertiseAreas })} />
        <div className="flex flex-wrap gap-4">
          <Checkbox label="Available for mentoring" checked={!!f.mentoringAvailable} onChange={(e) => setF({ ...f, mentoringAvailable: e.target.checked })} />
          <Checkbox label="Member consents to sharing email" checked={!!f.shareEmail} onChange={(e) => setF({ ...f, shareEmail: e.target.checked })} />
        </div>
      </div>
    </Modal>
  )
}

export function Directory({ initialTab = 'organizations' }: { initialTab?: 'organizations' | 'experts' | 'alumni' }) {
  useDocumentTitle('Master database')
  const { can } = useAuth()
  const { toast, confirm } = useFeedback()
  const [f, setF] = useQueryState({ tab: initialTab as string, q: '', status: '', type: '', page: '1' })
  const q = useDebounced(f.q)
  const [editOrg, setEditOrg] = useState<Partial<Organization> | null>(null)
  const [editExpert, setEditExpert] = useState<Partial<ExpertRow> | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const on = useFeatures()
  const [viewing, setViewing] = useState<Member | null>(null)
  const [viewOrg, setViewOrg] = useState<Organization | null>(null)
  const [viewExpert, setViewExpert] = useState<ExpertRow | null>(null)

  const endpoint = f.tab === 'organizations' ? '/admin/directory/organizations' : f.tab === 'experts' ? '/admin/directory/experts' : '/admin/users'
  const params = f.tab === 'organizations' ? { q, status: f.status, orgType: f.type } : f.tab === 'experts' ? { q, status: f.status, expertType: f.type } : { q, status: f.status, category: 'alumni' }
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<Record<string, any>>>(endpoint, { ...params, page: f.page }), [endpoint, q, f.status, f.type, f.page]) // eslint-disable-line @typescript-eslint/no-explicit-any
  const tabs = [
    ...(can('organizations.manage') ? [{ value: 'organizations', label: 'Organization Database' }] : []),
    ...(can('experts.manage') && on('admin.experts') ? [{ value: 'experts', label: 'Expert Database' }] : []),
    ...(can('members.manage') && on('admin.alumni') ? [{ value: 'alumni', label: 'Alumni Database' }] : []),
  ]
  const exportPath = f.tab === 'organizations' ? '/admin/directory/organizations/export.csv' : f.tab === 'experts' ? '/admin/directory/experts/export.csv' : '/admin/users/export.csv'

  return (
    <div>
      <PageHeader title="Master Database" subtitle="Directories of organizations, experts and alumni." actions={f.tab !== 'alumni' && <Button onClick={() => (f.tab === 'organizations' ? setEditOrg({}) : setEditExpert({}))}><Plus className="size-4" />New {f.tab === 'organizations' ? 'organization' : 'expert'}</Button>} />
      <Tabs value={f.tab} onChange={(tab) => { setF({ tab, status: '', type: '' }); setShowFilters(false) }} tabs={tabs} />
      <div className="my-4 flex flex-wrap items-center gap-3">
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder={`Search ${f.tab}…`} />
        <Button variant="outline" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}><Filter className="size-4" />Filter</Button>
        {on('admin.exports') && <Button variant="outline" onClick={() => downloadUrl(exportPath, params)}><Download className="size-4" />Export</Button>}
      </div>
      {showFilters && (
        <Card className="mb-4 flex flex-wrap gap-3 p-3">
          <Select aria-label="Status" value={f.status} onChange={(e) => setF({ status: e.target.value })} className="h-9 w-40"><option value="">Any status</option>{(f.tab === 'alumni' ? ['pending', 'active', 'suspended', 'inactive'] : ['pending', 'approved', 'inactive']).map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
          {f.tab !== 'alumni' && <Select aria-label="Type" value={f.type} onChange={(e) => setF({ type: e.target.value })} className="h-9 w-48"><option value="">Any type</option>{(f.tab === 'organizations' ? ORG_TYPES : ['industry_expert', 'research_expert', 'trainer', 'consultant', 'mentor']).map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>}
        </Card>
      )}
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? <Empty title="No records" /> : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-ink-900/8 bg-ink-900/[0.02] text-xs uppercase tracking-wider text-ink-500">
                {f.tab === 'organizations' ? <tr><th className="px-4 py-3">Organization Name</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Contact Person</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Status</th><th /></tr>
                  : f.tab === 'experts' ? <tr><th className="px-4 py-3">Expert</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Skills</th><th className="px-4 py-3">Visibility</th><th className="px-4 py-3">Status</th><th /></tr>
                  : <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Institution</th><th className="px-4 py-3">Graduation</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Status</th><th /></tr>}
              </thead>
              <tbody className="divide-y divide-ink-900/8">
                {data.items.map((r) => f.tab === 'organizations' ? (
                  <tr key={r._id}>
                    <td className="px-4 py-3 font-medium text-ink-900">{r.name}{r.visibility === 'public' && <Badge tone="green" className="ml-2">Public</Badge>}</td>
                    <td className="px-4 py-3">{r.partnerTier !== 'none' ? `${LABELS[r.partnerTier]?.replace(' Partners', ' Partner')}` : label(r.orgType)}</td>
                    <td className="px-4 py-3">{r.contact?.name}</td>
                    <td className="px-4 py-3 text-xs">{r.contact?.email}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5">
                      <RowActions
                        label={r.name}
                        view={() => setViewOrg(r as Organization)}
                        edit={() => setEditOrg(r)}
                        remove={async () => { if (await confirm({ title: 'Delete organization?', message: `“${r.name}” will be permanently removed.`, danger: true, confirmLabel: 'Delete' })) { try { await api.del(`/admin/directory/organizations/${r._id}`); toast('Deleted'); reload() } catch (e) { toast((e as Error).message, 'error') } } }}
                      />
                    </td>
                  </tr>
                ) : f.tab === 'experts' ? (
                  <tr key={r._id}>
                    <td className="px-4 py-3"><p className="font-medium text-ink-900">{r.user?.name}</p><p className="text-xs text-ink-500">{r.headline}</p></td>
                    <td className="px-4 py-3">{label(r.expertType)}</td>
                    <td className="px-4 py-3 text-xs">{r.skills?.join(', ')}</td>
                    <td className="px-4 py-3"><AudienceSummary access={r.access} /></td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5">
                      <RowActions
                        label={r.user?.name}
                        view={() => setViewExpert(r as ExpertRow)}
                        edit={() => setEditExpert(r)}
                        remove={async () => { if (await confirm({ title: 'Delete expert profile?', message: 'The member account is kept; only the expert listing is removed.', danger: true, confirmLabel: 'Delete' })) { await api.del(`/admin/directory/experts/${r._id}`); toast('Deleted'); reload() } }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={r._id}>
                    <td className="px-4 py-3 font-medium text-ink-900">{r.name}</td>
                    <td className="px-4 py-3">{r.profile?.institution}</td>
                    <td className="px-4 py-3">{r.profile?.graduationYear}</td>
                    <td className="px-4 py-3 text-xs">{r.email}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5"><RowActions label={r.name} view={() => setViewing(r as Member)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />
        </>
      )}
      {editOrg && <OrgEditor org={editOrg} onClose={() => setEditOrg(null)} onSaved={reload} />}
      {viewing && <MemberView member={viewing} onClose={() => setViewing(null)} />}
      {viewOrg && (
        <Modal open onClose={() => setViewOrg(null)} title={viewOrg.name} footer={<>{viewOrg.visibility === 'public' && viewOrg.status === 'approved' && viewOrg.slug && <LinkButton variant="outline" to={`/partners/${viewOrg.slug}`}>Open public profile</LinkButton>}<Button onClick={() => { setEditOrg(viewOrg); setViewOrg(null) }}>Edit</Button></>}>
          <DetailList rows={[
            ['Type', label(viewOrg.orgType)],
            ['Partner tier', viewOrg.partnerTier !== 'none' ? label(viewOrg.partnerTier) : 'Not a partner'],
            ['Status', <StatusBadge status={viewOrg.status} />],
            ['Visibility', viewOrg.visibility === 'public' ? 'Public partner profile' : 'Internal record only'],
            ['Location', viewOrg.location],
            ['Website', viewOrg.website && <a href={viewOrg.website} target="_blank" rel="noopener noreferrer" className="text-brand-600">{viewOrg.website}</a>],
            ['Collaboration', viewOrg.collaborationAreas?.join(', ')],
            ['Contact person', viewOrg.contact?.name],
            ['Contact email', viewOrg.contact?.email],
            ['Contact phone', viewOrg.contact?.phone],
          ]} />
          {viewOrg.description && <p className="mt-4 whitespace-pre-line rounded-lg bg-ink-900/[0.03] p-3 text-sm">{viewOrg.description}</p>}
        </Modal>
      )}
      {viewExpert && (
        <Modal open onClose={() => setViewExpert(null)} title={viewExpert.user?.name ?? 'Expert'} footer={<>{viewExpert.status === 'approved' && viewExpert.access?.visibility !== 'private' && <LinkButton variant="outline" to={`/experts/${viewExpert._id}`}>Open public profile</LinkButton>}<Button onClick={() => { setEditExpert(viewExpert); setViewExpert(null) }}>Edit</Button></>}>
          <DetailList rows={[
            ['Headline', viewExpert.headline],
            ['Email', viewExpert.user?.email],
            ['Type', label(viewExpert.expertType)],
            ['Domain', viewExpert.domain],
            ['Experience', viewExpert.yearsExperience ? `${viewExpert.yearsExperience} years` : undefined],
            ['Location', viewExpert.location],
            ['Skills', viewExpert.skills?.join(', ')],
            ['Expertise', viewExpert.expertiseAreas?.join(', ')],
            ['Audience', <AudienceSummary access={viewExpert.access} />],
            ['Status', <StatusBadge status={viewExpert.status} />],
            ['Mentoring', viewExpert.mentoringAvailable ? 'Available' : 'No'],
            ['Email shared', viewExpert.shareEmail ? 'Yes, with members' : 'No'],
          ]} />
          {viewExpert.bio && <p className="mt-4 whitespace-pre-line rounded-lg bg-ink-900/[0.03] p-3 text-sm">{viewExpert.bio}</p>}
        </Modal>
      )}
      {editExpert && <ExpertEditor expert={editExpert} onClose={() => setEditExpert(null)} onSaved={reload} />}
    </div>
  )
}
