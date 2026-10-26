import { Download, History, Inbox, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { MediaIcon } from '../../components/admin/MediaPicker'
import { uploadMedia, type MediaAsset } from '../../lib/media'
import { Alert, Badge, Button, Card, Checkbox, Empty, ErrorState, Input, Loading, Modal, PageHeader, Pagination, Select, StatusBadge, Tabs, TagInput, Textarea, useFeedback } from '../../components/ui'
import { ApiError, api, downloadUrl, type Paged } from '../../lib/api'
import { formatBytes, formatDateTime, label, timeAgo } from '../../lib/format'
import { useAsync, useDebounced, useDocumentTitle, useQueryState } from '../../lib/hooks'
import type { Ref, SiteSettings } from '../../lib/types'

// ---------------------------------------------------------------- contact & collaboration requests

interface RequestRow {
  _id: string
  type: string
  name: string
  email: string
  phone?: string
  organization?: string
  category?: string
  subject?: string
  message: string
  status: string
  response?: string
  assignedTo?: { _id: string; name: string } | null
  notes?: { _id: string; text: string; at: string; author?: { name: string } }[]
  user?: { name: string; email: string; category: string } | null
  targetExpert?: { headline: string; user?: { name: string; email?: string } } | null
  createdAt: string
}

export function Requests() {
  useDocumentTitle('Requests')
  const [f, setF] = useQueryState({ status: '', type: '', q: '', page: '1' })
  const q = useDebounced(f.q)
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<RequestRow> & { statusCounts: Record<string, number> }>('/admin/contacts', { status: f.status, type: f.type, q, page: f.page }), [f.status, f.type, q, f.page])
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div>
      <PageHeader title="Contact & Collaboration Requests" actions={<Button variant="outline" onClick={() => downloadUrl('/admin/contacts/export.csv', { status: f.status, type: f.type, q })}><Download className="size-4" />Export CSV</Button>} />
      <Tabs value={f.status} onChange={(status) => setF({ status })} tabs={[{ value: '', label: 'All' }, ...['new', 'in_progress', 'responded', 'closed'].map((s) => ({ value: s, label: label(s), count: data?.statusCounts?.[s] ?? 0 }))]} />
      <div className="my-4 flex flex-wrap gap-2">
        <input aria-label="Search" value={f.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Search name, email, message…" className="h-10 w-72 rounded-lg border border-ink-300/70 bg-white px-3 text-sm" />
        <Select aria-label="Type" value={f.type} onChange={(e) => setF({ type: e.target.value })} className="h-10 w-56"><option value="">All types</option>{['general', 'collaboration', 'partnership', 'expert_connect', 'requirement', 'training', 'support'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
      </div>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? <Empty icon={<Inbox className="size-8" />} title="No requests" /> : (
        <>
          <Card className="divide-y divide-ink-900/8">
            {data.items.map((r) => (
              <button key={r._id} onClick={() => setOpenId(r._id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-brand-50/40">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{r.subject || label(r.type)}</p>
                  <p className="truncate text-xs text-ink-500">{r.name} · {r.email}{r.organization && ` · ${r.organization}`}{r.targetExpert?.user && ` → ${r.targetExpert.user.name}`}</p>
                </div>
                <Badge>{label(r.type)}</Badge>
                {r.assignedTo && <span className="text-xs text-ink-500">@{r.assignedTo.name}</span>}
                <StatusBadge status={r.status} />
                <span className="w-24 text-right text-xs text-ink-500">{timeAgo(r.createdAt)}</span>
              </button>
            ))}
          </Card>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />
        </>
      )}
      {openId && <RequestDetail id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  )
}

function RequestDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { toast } = useFeedback()
  const { data, loading, reload } = useAsync(() => api.get<RequestRow>(`/admin/contacts/${id}`), [id])
  const admins = useAsync(() => api.get<Paged<{ _id: string; name: string; roles: { name: string }[] }>>('/admin/users', { status: 'active', limit: 100 }).catch(() => null), [])
  const [note, setNote] = useState('')
  const [response, setResponse] = useState<string | null>(null)
  const staff = (admins.data?.items ?? []).filter((u) => u.roles.some((r) => !['member', 'industry', 'academia', 'startup', 'expert', 'alumni', 'student', 'professional'].includes(r.name)))

  async function patch(body: Record<string, unknown>, msg: string) {
    try {
      await api.patch(`/admin/contacts/${id}`, body)
      toast(msg)
      reload()
      onChanged()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <Modal open onClose={onClose} title={data?.subject || label(data?.type)} size="lg">
      {loading || !data ? <Loading /> : (
        <div className="space-y-5 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <p><span className="text-ink-500">From:</span> {data.name} · <a className="text-brand-600" href={`mailto:${data.email}`}>{data.email}</a></p>
            {data.phone && <p><span className="text-ink-500">Phone:</span> {data.phone}</p>}
            {data.organization && <p><span className="text-ink-500">Organization:</span> {data.organization}</p>}
            {data.category && <p><span className="text-ink-500">Category:</span> {label(data.category)}</p>}
            <p><span className="text-ink-500">Type:</span> {label(data.type)}</p>
            <p><span className="text-ink-500">Received:</span> {formatDateTime(data.createdAt)}</p>
            {data.user && <p><span className="text-ink-500">Member account:</span> {data.user.name}</p>}
            {data.targetExpert?.user && <p><span className="text-ink-500">Expert:</span> {data.targetExpert.user.name} ({data.targetExpert.headline})</p>}
          </div>
          <p className="whitespace-pre-line rounded-lg bg-ink-900/[0.03] p-4">{data.message}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Status" value={data.status} onChange={(e) => patch({ status: e.target.value }, 'Status updated')}>{['new', 'in_progress', 'responded', 'closed'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
            <Select label="Assigned to" value={data.assignedTo?._id ?? ''} onChange={(e) => patch({ assignedTo: e.target.value || null }, 'Assignment updated')}><option value="">Unassigned</option>{staff.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</Select>
          </div>
          {data.user ? (
            <div className="space-y-2">
              <Textarea label="Reply to member (visible in their dashboard)" value={response ?? data.response ?? ''} onChange={(e) => setResponse(e.target.value)} rows={3} />
              <Button size="sm" disabled={response === null} onClick={() => { patch({ response: response ?? '' }, 'Reply saved'); setResponse(null) }}>Save reply</Button>
            </div>
          ) : <Alert tone="info">This requester has no member account — reply by email at {data.email}.</Alert>}
          <div>
            <p className="mb-2 font-semibold text-ink-900">Internal notes</p>
            <ul className="mb-2 space-y-2">
              {data.notes?.map((n) => <li key={n._id} className="rounded-lg bg-amber-50 p-3"><p className="whitespace-pre-line">{n.text}</p><p className="mt-1 text-xs text-ink-500">{n.author?.name} · {timeAgo(n.at)}</p></li>)}
              {!data.notes?.length && <li className="text-ink-500">No notes yet.</li>}
            </ul>
            <div className="flex gap-2">
              <input aria-label="New note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" className="h-10 flex-1 rounded-lg border border-ink-300/70 px-3" />
              <Button disabled={!note.trim()} onClick={async () => { await api.post(`/admin/contacts/${id}/notes`, { text: note }); setNote(''); reload() }}>Add</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- taxonomy

export function Taxonomy() {
  useDocumentTitle('Categories & tags')
  const { toast, confirm } = useFeedback()
  const { data, error, loading, reload } = useAsync(() => api.get<{ categories: (Ref & { description?: string; status: string })[]; tags: Ref[] }>('/admin/taxonomy'), [])
  const [edit, setEdit] = useState<{ kind: 'categories' | 'tags'; _id?: string; name: string; description?: string; status?: string } | null>(null)
  const [err, setErr] = useState('')

  async function save() {
    setErr('')
    try {
      const body = edit!.kind === 'categories' ? { name: edit!.name, description: edit!.description, status: edit!.status ?? 'active' } : { name: edit!.name, description: edit!.description }
      if (edit!._id) await api.put(`/admin/taxonomy/${edit!.kind}/${edit!._id}`, body)
      else await api.post(`/admin/taxonomy/${edit!.kind}`, body)
      toast('Saved')
      setEdit(null)
      reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const section = (kind: 'categories' | 'tags', items: (Ref & { status?: string })[]) => (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{kind === 'categories' ? 'Categories' : 'Tags'}</h2><Button size="sm" onClick={() => setEdit({ kind, name: '' })}><Plus className="size-4" />Add</Button></div>
      <ul className="divide-y divide-ink-900/8">
        {items.map((i) => (
          <li key={i._id} className="flex items-center gap-2 py-2">
            <span className="flex-1 text-sm">{i.name} <span className="text-xs text-ink-500">/{i.slug}</span></span>
            {i.status === 'inactive' && <Badge>Inactive</Badge>}
            <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit({ kind, ...i })}><Pencil className="size-4" /></Button>
            <Button size="sm" variant="ghost" aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete ${i.name}?`, message: 'Items using it must be updated first.', danger: true, confirmLabel: 'Delete' })) { try { await api.del(`/admin/taxonomy/${kind}/${i._id}`); toast('Deleted'); reload() } catch (e) { toast((e as Error).message, 'error') } } }}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ul>
    </Card>
  )

  return (
    <div>
      <PageHeader title="Categories & Tags" subtitle="Used to organize and filter opportunities, knowledge resources, courses and events." />
      {loading ? <Loading /> : error || !data ? <ErrorState error={error} onRetry={reload} /> : <div className="grid gap-6 lg:grid-cols-2">{section('categories', data.categories)}{section('tags', data.tags)}</div>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit' : 'Add'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        {edit && (
          <div className="space-y-4">
            {err && <Alert tone="error">{err}</Alert>}
            <Input label="Name" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Input label="Description" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            {edit.kind === 'categories' && <Select label="Status" value={edit.status ?? 'active'} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></Select>}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------- media library

export function MediaLibrary() {
  useDocumentTitle('Media library')
  const { toast, confirm } = useFeedback()
  const [f, setF] = useQueryState({ kind: '', q: '', page: '1' })
  const q = useDebounced(f.q)
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<MediaAsset>>('/admin/media', { kind: f.kind, q, page: f.page }), [f.kind, q, f.page])
  const input = useRef<HTMLInputElement>(null)
  const [visibility, setVisibility] = useState('public')
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<MediaAsset | null>(null)

  return (
    <div>
      <PageHeader title="Media Library" subtitle="Files are served through access checks — never from an open public folder." />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <Select label="Default access for new uploads" value={visibility} onChange={(e) => setVisibility(e.target.value)} className="w-56" hint="Used when a file is not linked to any content">
          <option value="public">Public</option><option value="authenticated">Members only</option><option value="private">Admins only</option>
        </Select>
        <Button loading={uploading} onClick={() => input.current?.click()}><Upload className="size-4" />Upload</Button>
        <input ref={input} type="file" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { await uploadMedia(file, visibility); toast('Uploaded'); reload() } catch (err) { toast((err as Error).message, 'error') } finally { setUploading(false); e.target.value = '' } }} />
        <span className="flex-1" />
        <input aria-label="Search files" value={f.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Search files…" className="h-10 w-56 rounded-lg border border-ink-300/70 px-3 text-sm" />
        <Select aria-label="Kind" value={f.kind} onChange={(e) => setF({ kind: e.target.value })} className="h-10 w-36"><option value="">All</option><option value="image">Images</option><option value="video">Videos</option><option value="document">Documents</option></Select>
      </Card>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? <Empty title="No files" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.items.map((m) => (
              <Card key={m._id} className="overflow-hidden">
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="grid aspect-[4/3] place-items-center bg-ink-900/5">
                  {m.kind === 'image' ? <img src={m.url} alt="" className="size-full object-cover" /> : <MediaIcon kind={m.kind} className="size-8 text-ink-500" />}
                </a>
                <div className="space-y-1 p-2.5">
                  <p className="truncate text-xs font-medium text-ink-900" title={m.originalName}>{m.originalName}</p>
                  <p className="text-[11px] text-ink-500">{formatBytes(m.size)} · {m.linked.length ? `used by ${m.linked.length}` : 'unused'}</p>
                  <p className="text-[11px] text-ink-500">{m.inheritAccess && m.linked.length ? 'Follows linked content' : label(m.access.visibility)}</p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>Access</Button>
                    <Button size="sm" variant="ghost" aria-label="Delete" onClick={async () => { if (await confirm({ title: 'Delete file?', message: m.originalName, danger: true, confirmLabel: 'Delete' })) { try { await api.del(`/admin/media/${m._id}`); toast('Deleted'); reload() } catch (e) { toast((e as Error).message, 'error') } } }}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />
        </>
      )}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`Access · ${editing.originalName}`} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={async () => { try { await api.patch(`/admin/media/${editing._id}`, { inheritAccess: editing.inheritAccess, access: { visibility: editing.access.visibility, roles: [], organizations: [] } }); toast('Access updated'); setEditing(null); reload() } catch (e) { toast((e as Error).message, 'error') } }}>Save</Button></>}>
          <div className="space-y-4">
            <Checkbox label="Follow the access rules of the content that uses this file" checked={editing.inheritAccess} onChange={(e) => setEditing({ ...editing, inheritAccess: e.target.checked })} />
            <Select label={editing.inheritAccess ? 'Fallback access (when unused)' : 'Access'} value={editing.access.visibility} onChange={(e) => setEditing({ ...editing, access: { visibility: e.target.value } })}><option value="public">Public</option><option value="authenticated">Members only</option><option value="private">Admins only</option></Select>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- audit log

export function AuditLog() {
  useDocumentTitle('Audit log')
  const [f, setF] = useQueryState({ entityType: '', q: '', page: '1' })
  const q = useDebounced(f.q)
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<{ _id: string; at: string; actorEmail?: string; action: string; entityType: string; summary?: string; meta?: unknown; ip?: string }> & { entityTypes: string[] }>('/admin/audit', { entityType: f.entityType, q, page: f.page }), [f.entityType, q, f.page])
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Administrative actions on sensitive records. Secrets are never recorded." />
      <div className="mb-4 flex flex-wrap gap-2">
        <input aria-label="Search" value={f.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Search summary or actor…" className="h-10 w-72 rounded-lg border border-ink-300/70 bg-white px-3 text-sm" />
        <Select aria-label="Entity" value={f.entityType} onChange={(e) => setF({ entityType: e.target.value })} className="h-10 w-48"><option value="">All records</option>{data?.entityTypes.map((t) => <option key={t}>{t}</option>)}</Select>
      </div>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? <Empty icon={<History className="size-8" />} title="No entries" /> : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-ink-900/8 bg-ink-900/[0.02] text-xs uppercase tracking-wider text-ink-500"><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Actor</th><th className="px-4 py-2.5">Action</th><th className="px-4 py-2.5">Summary</th></tr></thead>
              <tbody className="divide-y divide-ink-900/8">
                {data.items.map((a) => (
                  <tr key={a._id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-500">{formatDateTime(a.at)}</td>
                    <td className="px-4 py-2.5 text-xs">{a.actorEmail ?? 'system'}</td>
                    <td className="px-4 py-2.5"><Badge>{a.action}</Badge></td>
                    <td className="px-4 py-2.5">{a.summary}{a.meta ? <details className="mt-1 text-xs text-ink-500"><summary className="cursor-pointer">Details</summary><pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(a.meta, null, 2)}</pre></details> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- site settings

export function SiteSettingsPage() {
  useDocumentTitle('Site settings')
  const { toast } = useFeedback()
  const { data, loading } = useAsync(() => api.get<SiteSettings>('/settings'), [])
  const [form, setForm] = useState<SiteSettings | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  if (loading) return <Loading />
  const s: Required<Pick<SiteSettings, 'hero' | 'contact' | 'social'>> = { hero: {}, contact: {}, social: {}, ...data, ...form } as never
  const hero = s.hero
  const contact = s.contact
  const set = (patch: Partial<SiteSettings>) => setForm({ ...s, ...patch })

  return (
    <div className="max-w-3xl">
      <PageHeader title="Site Settings" subtitle="Homepage hero and secretariat contact details shown across the public site." />
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setErrors({})
          try {
            await api.put('/admin/settings', {
              hero: { headline: hero.headline ?? [], highlight: hero.highlight ?? '', subheading: hero.subheading ?? '', keywords: hero.keywords ?? [], videoUrl: hero.videoUrl ?? '' },
              contact: { email: contact.email ?? '', phone: contact.phone ?? '', address: contact.address ?? '', ownerLine: contact.ownerLine ?? '', quote: contact.quote ?? '' },
              social: s.social,
            })
            toast('Settings saved')
          } catch (err) {
            if (err instanceof ApiError) setErrors({ ...err.fields, _: err.message })
          } finally {
            setBusy(false)
          }
        }}
      >
        {errors._ && <Alert tone="error">{errors._}</Alert>}
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Homepage hero</h2>
          <TagInput label="Headline lines" value={hero.headline ?? []} onChange={(headline) => set({ hero: { ...hero, headline } })} hint="Each entry is shown on its own line" />
          <Input label="Highlighted line" value={hero.highlight ?? ''} onChange={(e) => set({ hero: { ...hero, highlight: e.target.value } })} />
          <Textarea label="Subheading" value={hero.subheading ?? ''} onChange={(e) => set({ hero: { ...hero, subheading: e.target.value } })} rows={2} />
          <TagInput label="Keywords" value={hero.keywords ?? []} onChange={(keywords) => set({ hero: { ...hero, keywords } })} />
          <Input label="Intro video URL" value={hero.videoUrl ?? ''} onChange={(e) => set({ hero: { ...hero, videoUrl: e.target.value } })} hint="YouTube, Vimeo or an uploaded MP4. The “Watch Video” button appears when set." />
        </Card>
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">BIAN Secretariat</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" value={contact.email ?? ''} onChange={(e) => set({ contact: { ...contact, email: e.target.value } })} />
            <Input label="Phone" value={contact.phone ?? ''} onChange={(e) => set({ contact: { ...contact, phone: e.target.value } })} />
          </div>
          <Input label="Address" value={contact.address ?? ''} onChange={(e) => set({ contact: { ...contact, address: e.target.value } })} />
          <Input label="Owner line" value={contact.ownerLine ?? ''} onChange={(e) => set({ contact: { ...contact, ownerLine: e.target.value } })} />
          <Input label="Quote" value={contact.quote ?? ''} onChange={(e) => set({ contact: { ...contact, quote: e.target.value } })} />
        </Card>
        <Button type="submit" loading={busy}>Save settings</Button>
      </form>
    </div>
  )
}
