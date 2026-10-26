import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Eye, Pencil, Plus, Save, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BlockEditor } from '../../components/admin/BlockEditor'
import { MediaPicker } from '../../components/admin/MediaPicker'
import { AccessEditor, AudienceSummary, PublishPanel, useDefaultStatus, useLookups, useStatuses, type PublishState } from '../../components/admin/Publishing'
import { useFeature } from '../../lib/features'
import { Alert, Badge, Button, Card, Checkbox, Empty, ErrorState, IconButton, Input, LinkButton, Loading, Modal, PageHeader, Pagination, RowActions, Select, StatusBadge, Tabs, TagInput, Textarea, useFeedback } from '../../components/ui'
import { ApiError, api, type Paged } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatDate, formatDateTime, fromLocalInput, label, toLocalInput } from '../../lib/format'
import { useAsync, useDocumentTitle, useQueryState } from '../../lib/hooks'
import type { Access, Block, EventItem, PublicationStatus } from '../../lib/types'

function ImageField({ value, onChange, labelText }: { value: string; onChange: (v: string) => void; labelText: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ink-900">{labelText}</p>
      <div className="flex gap-2">
        <input aria-label={labelText} className="h-10 flex-1 rounded-lg border border-ink-300/70 px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… or choose from library" />
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>Library</Button>
      </div>
      {value && <img src={value} alt="" className="max-h-32 rounded-lg" />}
      <MediaPicker open={open} kind="image" onClose={() => setOpen(false)} onPick={(m) => onChange(m.url)} />
    </div>
  )
}

// ---------------------------------------------------------------- courses

interface CourseRow { _id: string; title: string; slug: string; status: PublicationStatus; access: Access; enrollments: number; lessonCount: number; updatedAt: string }

export function CourseList() {
  useDocumentTitle('Courses')
  const { can } = useAuth()
  const { toast, confirm } = useFeedback()
  const [f, setF] = useQueryState({ status: '', page: '1' })
  const statuses = useStatuses()
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<CourseRow>>('/admin/courses', { status: f.status, page: f.page }), [f.status, f.page])
  return (
    <div>
      <PageHeader title="Courses" subtitle="Courses, modules and lessons with progress tracking and lesson-level feedback." actions={<LinkButton to="/admin/courses/new"><Plus className="size-4" />New course</LinkButton>} />
      <Tabs value={f.status} onChange={(status) => setF({ status })} tabs={[{ value: '', label: 'All' }, ...statuses.map((s) => ({ value: s, label: label(s) }))]} />
      <div className="mt-4">
        {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? <Empty title="No courses yet" /> : (
          <Card className="divide-y divide-ink-900/8">
            {data.items.map((c) => (
              <div key={c._id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-brand-50/40">
                <div className="min-w-0 flex-1"><Link to={`/admin/courses/${c._id}`} className="font-medium text-ink-900 hover:text-brand-700">{c.title}</Link><p className="text-xs text-ink-500">{c.lessonCount} lessons · <AudienceSummary access={c.access} /></p></div>
                <span className="inline-flex items-center gap-1 text-sm text-ink-500" title="Enrolments"><Users className="size-4" />{c.enrollments}</span>
                <StatusBadge status={c.status} />
                <RowActions label={c.title} viewTo={`/courses/${c.slug}`} editTo={`/admin/courses/${c._id}`} remove={can('content.publish') ? async () => { if (await confirm({ title: 'Delete course?', message: <>“{c.title}” will be permanently deleted. All enrolments and progress are removed too.</>, confirmLabel: 'Delete', danger: true })) { try { await api.del(`/admin/courses/${c._id}`); toast('Deleted'); reload() } catch (e) { toast((e as Error).message, 'error') } } } : undefined} removeUnavailable="Deleting requires publishing rights" />
              </div>
            ))}
          </Card>
        )}
        {data && <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />}
      </div>
    </div>
  )
}

interface LessonForm { _id?: string; key: string; title: string; summary?: string; durationMinutes?: number; blocks: Block[]; feedbackForm?: string | null }
interface ModuleForm { _id?: string; key: string; title: string; summary?: string; lessons: LessonForm[] }
interface CourseForm {
  title: string; slug: string; summary: string; description: string; thumbnail: string; level: string; objectives: string[]
  modules: ModuleForm[]; access: Access; feedbackForm: string | null; trackCompletion: boolean; publish: PublishState
}

const key = () => Math.random().toString(36).slice(2)

export function CourseEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { toast, confirm } = useFeedback()
  const { can } = useAuth()
  const { forms } = useLookups()
  const defaultStatus = useDefaultStatus()
  const existing = useAsync(() => (isNew ? Promise.resolve(null) : api.get<Record<string, any>>(`/admin/courses/${id}`)), [id]) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<CourseForm | null>(null)
  const [open, setOpen] = useState<{ m: number; l: number } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  useDocumentTitle(form?.title || 'Course editor')

  // Sync the local form whenever a different record (or a reload) arrives.
  const formSource = isNew ? 'new' : existing.data
  const [syncedSource, setSyncedSource] = useState<unknown>(null)
  if (formSource && formSource !== syncedSource) {
    setSyncedSource(formSource)
    const c = existing.data
    if (isNew) setForm({ title: '', slug: '', summary: '', description: '', thumbnail: '', level: 'beginner', objectives: [], modules: [], access: { visibility: 'authenticated', roles: [], organizations: [] }, feedbackForm: null, trackCompletion: true, publish: { status: defaultStatus } })
    else if (c)
      setForm({
        title: c.title, slug: c.slug, summary: c.summary ?? '', description: c.description ?? '', thumbnail: c.thumbnail ?? '', level: c.level, objectives: c.objectives ?? [],
        modules: c.modules.map((m: ModuleForm) => ({ ...m, key: key(), lessons: m.lessons.map((l) => ({ ...l, key: key() })) })),
        access: { roles: [], organizations: [], ...c.access }, feedbackForm: c.feedbackForm ?? null, trackCompletion: c.trackCompletion,
        publish: { status: c.status, publishAt: c.publishAt, expireAt: c.expireAt },
      })
  }

  if (existing.loading || !form) return <Loading />
  if (existing.error) return <ErrorState error={existing.error} />
  const update = (patch: Partial<CourseForm>) => setForm({ ...form, ...patch })
  const setModules = (modules: ModuleForm[]) => update({ modules })
  const moveIn = <T,>(arr: T[], i: number, d: -1 | 1) => { const n = [...arr]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n }

  async function save() {
    setSaving(true)
    setErrors({})
    const body = {
      title: form!.title, slug: form!.slug || undefined, summary: form!.summary, description: form!.description, thumbnail: form!.thumbnail, level: form!.level, objectives: form!.objectives,
      modules: form!.modules.map((m) => ({ _id: m._id, title: m.title, summary: m.summary, lessons: m.lessons.map((l) => ({ _id: l._id, title: l.title, summary: l.summary, durationMinutes: l.durationMinutes ? Number(l.durationMinutes) : undefined, blocks: l.blocks, feedbackForm: l.feedbackForm || null })) })),
      access: form!.access, feedbackForm: form!.feedbackForm || null, trackCompletion: form!.trackCompletion,
      status: form!.publish.status, publishAt: form!.publish.publishAt ?? null, expireAt: form!.publish.expireAt ?? null,
    }
    try {
      const saved = isNew ? await api.post<{ _id: string }>('/admin/courses', body) : await api.put<{ _id: string }>(`/admin/courses/${id}`, body)
      toast('Course saved')
      if (isNew) navigate(`/admin/courses/${saved._id}`, { replace: true })
      else existing.reload()
    } catch (e) {
      if (e instanceof ApiError) { setErrors({ ...e.fields, _: e.message }); toast(e.message, 'error') }
    } finally {
      setSaving(false)
    }
  }

  const lesson = open ? form.modules[open.m]?.lessons[open.l] : null
  const setLesson = (patch: Partial<LessonForm>) => {
    if (!open) return
    setModules(form.modules.map((m, mi) => (mi !== open.m ? m : { ...m, lessons: m.lessons.map((l, li) => (li === open.l ? { ...l, ...patch } : l)) })))
  }

  return (
    <div>
      <Link to="/admin/courses" className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600"><ArrowLeft className="size-4" />Courses</Link>
      <PageHeader
        title={isNew ? 'New course' : form.title}
        actions={
          <>
            {!isNew && <LinkButton variant="ghost" to={`/courses/${form.slug}`}><Eye className="size-4" />View</LinkButton>}
            {!isNew && can('content.publish') && <Button variant="ghost" onClick={async () => { if (await confirm({ title: 'Delete course?', message: 'All enrolments and progress for this course will be removed.', danger: true, confirmLabel: 'Delete' })) { await api.del(`/admin/courses/${id}`); toast('Deleted'); navigate('/admin/courses') } }}><Trash2 className="size-4" />Delete</Button>}
            <Button onClick={save} loading={saving}><Save className="size-4" />Save</Button>
          </>
        }
      />
      {errors._ && <div className="mb-4"><Alert tone="error">{errors._}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <Input label="Title" required value={form.title} onChange={(e) => update({ title: e.target.value })} error={errors.title} />
            <Textarea label="Summary" value={form.summary} onChange={(e) => update({ summary: e.target.value })} rows={2} />
            <Textarea label="Description" value={form.description} onChange={(e) => update({ description: e.target.value })} rows={4} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Level" value={form.level} onChange={(e) => update({ level: e.target.value })}>{['beginner', 'intermediate', 'advanced'].map((l) => <option key={l} value={l}>{label(l)}</option>)}</Select>
              <Input label="URL slug" value={form.slug} onChange={(e) => update({ slug: e.target.value })} />
            </div>
            <TagInput label="Learning objectives" value={form.objectives} onChange={(objectives) => update({ objectives })} placeholder="Type an objective and press Enter" />
            <ImageField labelText="Thumbnail" value={form.thumbnail} onChange={(thumbnail) => update({ thumbnail })} />
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Modules & lessons</h2><Button size="sm" variant="outline" onClick={() => setModules([...form.modules, { key: key(), title: `Module ${form.modules.length + 1}`, lessons: [] }])}><Plus className="size-4" />Module</Button></div>
            {!form.modules.length && <p className="text-sm text-ink-500">Add a module to start building the course.</p>}
            <div className="space-y-4">
              {form.modules.map((m, mi) => (
                <div key={m.key} className="rounded-xl border border-ink-900/10 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-ink-500">M{mi + 1}</span>
                    <input aria-label="Module title" className="h-9 flex-1 rounded-lg border border-ink-300/70 px-3 text-sm font-semibold" value={m.title} onChange={(e) => setModules(form.modules.map((x, i) => (i === mi ? { ...x, title: e.target.value } : x)))} />
                    <IconButton icon={ArrowUp} label="Move module up" disabled={mi === 0} onClick={() => setModules(moveIn(form.modules, mi, -1))} />
                    <IconButton icon={ArrowDown} label="Move module down" disabled={mi === form.modules.length - 1} onClick={() => setModules(moveIn(form.modules, mi, 1))} />
                    <IconButton icon={Trash2} label="Delete module" tone="danger" onClick={async () => { if (!m.lessons.length || (await confirm({ title: 'Delete module?', message: `“${m.title}” and its ${m.lessons.length} lessons will be removed when you save.`, danger: true, confirmLabel: 'Delete' }))) setModules(form.modules.filter((_, i) => i !== mi)) }} />
                  </div>
                  <ul className="mt-2 space-y-1 pl-6">
                    {m.lessons.map((l, li) => (
                      <li key={l.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-50/60">
                        <button className="flex flex-1 items-center gap-2 text-left text-sm" onClick={() => setOpen({ m: mi, l: li })}>
                          <ChevronRight className="size-4 text-ink-300" />{l.title || 'Untitled lesson'}
                          <span className="text-xs text-ink-500">{l.blocks.length} blocks{l.feedbackForm ? ' · feedback' : ''}</span>
                        </button>
                        <IconButton icon={Pencil} tone="edit" label="Edit lesson" onClick={() => setOpen({ m: mi, l: li })} />
                        <IconButton icon={ArrowUp} label="Move lesson up" disabled={li === 0} onClick={() => setModules(form.modules.map((x, i) => (i === mi ? { ...x, lessons: moveIn(x.lessons, li, -1) } : x)))} />
                        <IconButton icon={ArrowDown} label="Move lesson down" disabled={li === m.lessons.length - 1} onClick={() => setModules(form.modules.map((x, i) => (i === mi ? { ...x, lessons: moveIn(x.lessons, li, 1) } : x)))} />
                        <IconButton icon={Trash2} label="Delete lesson" tone="danger" onClick={() => setModules(form.modules.map((x, i) => (i === mi ? { ...x, lessons: x.lessons.filter((_, j) => j !== li) } : x)))} />
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="ghost" className="ml-6 mt-1" onClick={() => { setModules(form.modules.map((x, i) => (i === mi ? { ...x, lessons: [...x.lessons, { key: key(), title: `Lesson ${x.lessons.length + 1}`, blocks: [] }] } : x))); setOpen({ m: mi, l: m.lessons.length }) }}><Plus className="size-4" />Lesson</Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <PublishPanel value={form.publish} onChange={(publish) => update({ publish })} errors={errors} />
          <Card className="p-4"><p className="mb-3 font-semibold">Audience</p><AccessEditor value={form.access} onChange={(access) => update({ access })} errors={errors} /><p className="mt-3 text-xs text-ink-500">Applies to the course, all modules, lessons and their files.</p></Card>
          <Card className="space-y-3 p-4">
            <Select label="Course feedback form" value={form.feedbackForm ?? ''} onChange={(e) => update({ feedbackForm: e.target.value || null })}><option value="">None</option>{forms.map((f) => <option key={f._id} value={f._id}>{f.title}</option>)}</Select>
            <Checkbox label="Track lesson completion & progress" checked={form.trackCompletion} onChange={(e) => update({ trackCompletion: e.target.checked })} />
          </Card>
        </div>
      </div>

      <Modal open={!!lesson} onClose={() => setOpen(null)} title={<span className="inline-flex items-center gap-2"><ChevronDown className="size-4" />Edit lesson</span>} size="xl" footer={<Button onClick={() => setOpen(null)}>Done</Button>}>
        {lesson && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <Input label="Lesson title" value={lesson.title} onChange={(e) => setLesson({ title: e.target.value })} />
              <Input label="Duration (min)" type="number" value={lesson.durationMinutes ?? ''} onChange={(e) => setLesson({ durationMinutes: e.target.value as unknown as number })} />
            </div>
            <Input label="Summary" value={lesson.summary ?? ''} onChange={(e) => setLesson({ summary: e.target.value })} />
            <Select label="Lesson feedback form" value={lesson.feedbackForm ?? ''} onChange={(e) => setLesson({ feedbackForm: e.target.value || null })}><option value="">None</option>{forms.map((f) => <option key={f._id} value={f._id}>{f.title}</option>)}</Select>
            <div className="rounded-xl bg-surface p-3"><BlockEditor blocks={lesson.blocks} onChange={(blocks) => setLesson({ blocks })} forms={forms} /></div>
            <p className="text-xs text-ink-500">Changes are kept in the editor; click Save on the course to store them.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------- events

export function EventList() {
  useDocumentTitle('Events')
  const { can } = useAuth()
  const { toast, confirm } = useFeedback()
  const [f, setF] = useQueryState({ status: '', page: '1' })
  const statuses = useStatuses()
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<EventItem & { registrations: number }>>('/admin/events', { status: f.status, page: f.page }), [f.status, f.page])
  return (
    <div>
      <PageHeader title="Events" subtitle="Programs, webinars, workshops, conferences and industry visits." actions={<LinkButton to="/admin/events/new"><Plus className="size-4" />New event</LinkButton>} />
      <Tabs value={f.status} onChange={(status) => setF({ status })} tabs={[{ value: '', label: 'All' }, ...statuses.map((s) => ({ value: s, label: label(s) }))]} />
      <div className="mt-4">
        {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? <Empty title="No events yet" /> : (
          <Card className="divide-y divide-ink-900/8">
            {data.items.map((e) => (
              <div key={e._id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-brand-50/40">
                <div className="w-24 shrink-0 text-sm font-semibold text-ink-900">{formatDate(e.startAt)}</div>
                <div className="min-w-0 flex-1"><Link to={`/admin/events/${e._id}`} className="font-medium text-ink-900 hover:text-brand-700">{e.title}</Link><p className="text-xs text-ink-500">{label(e.eventType)} · <AudienceSummary access={e.access} /></p></div>
                {e.registration?.enabled && <Badge><Users className="size-3" />{e.registrations}{e.registration.capacity ? `/${e.registration.capacity}` : ''}</Badge>}
                <StatusBadge status={e.status} />
                <RowActions label={e.title} viewTo={`/events/${e.slug}`} editTo={`/admin/events/${e._id}`} remove={can('content.publish') ? async () => { if (await confirm({ title: 'Delete event?', message: <>“{e.title}” will be permanently deleted. Registrations are removed too.</>, confirmLabel: 'Delete', danger: true })) { try { await api.del(`/admin/events/${e._id}`); toast('Deleted'); reload() } catch (err) { toast((err as Error).message, 'error') } } } : undefined} removeUnavailable="Deleting requires publishing rights" />
              </div>
            ))}
          </Card>
        )}
        {data && <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />}
      </div>
    </div>
  )
}

interface EventForm {
  title: string; slug: string; summary: string; eventType: string; startAt: string; endAt: string
  location: { mode: string; venue?: string; city?: string; meetingUrl?: string }
  registration: { enabled: boolean; capacity?: number | null; deadline?: string | null; externalUrl?: string }
  featuredImage: string; blocks: Block[]; access: Access; feedbackForm: string | null; publish: PublishState
}

export function EventEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { toast, confirm } = useFeedback()
  const { can } = useAuth()
  const { forms } = useLookups()
  const defaultStatus = useDefaultStatus()
  const regsOn = useFeature('admin.registrations') && can('members.manage')
  const existing = useAsync(() => (isNew ? Promise.resolve(null) : api.get<Record<string, any>>(`/admin/events/${id}`)), [id]) // eslint-disable-line @typescript-eslint/no-explicit-any
  const regs = useAsync(() => (isNew || !regsOn ? Promise.resolve([]) : api.get<{ _id: string; user: { name: string; email: string; category: string } | null; status: string; createdAt: string }[]>(`/admin/events/${id}/registrations`)), [id])
  const [form, setForm] = useState<EventForm | null>(null)
  const [tab, setTab] = useState<'details' | 'content' | 'registrations'>('details')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  useDocumentTitle(form?.title || 'Event editor')

  // Sync the local form whenever a different record (or a reload) arrives.
  const formSource = isNew ? 'new' : existing.data
  const [syncedSource, setSyncedSource] = useState<unknown>(null)
  if (formSource && formSource !== syncedSource) {
    setSyncedSource(formSource)
    const e = existing.data
    if (isNew) setForm({ title: '', slug: '', summary: '', eventType: 'webinar', startAt: '', endAt: '', location: { mode: 'online' }, registration: { enabled: true }, featuredImage: '', blocks: [], access: { visibility: 'public', roles: [], organizations: [] }, feedbackForm: null, publish: { status: defaultStatus } })
    else if (e)
      setForm({
        title: e.title, slug: e.slug, summary: e.summary ?? '', eventType: e.eventType, startAt: e.startAt, endAt: e.endAt ?? '', location: e.location ?? { mode: 'in_person' },
        registration: e.registration ?? { enabled: false }, featuredImage: e.featuredImage ?? '', blocks: e.blocks ?? [], access: { roles: [], organizations: [], ...e.access },
        feedbackForm: e.feedbackForm ?? null, publish: { status: e.status, publishAt: e.publishAt, expireAt: e.expireAt },
      })
  }

  if (existing.loading || !form) return <Loading />
  if (existing.error) return <ErrorState error={existing.error} />
  const update = (patch: Partial<EventForm>) => setForm({ ...form, ...patch })

  async function save() {
    setSaving(true)
    setErrors({})
    const r = form!.registration
    const body = {
      title: form!.title, slug: form!.slug || undefined, summary: form!.summary, eventType: form!.eventType, startAt: form!.startAt, endAt: form!.endAt || null,
      location: form!.location, registration: { enabled: r.enabled, capacity: r.capacity ? Number(r.capacity) : null, deadline: r.deadline || null, externalUrl: r.externalUrl },
      featuredImage: form!.featuredImage, blocks: form!.blocks, access: form!.access, feedbackForm: form!.feedbackForm || null,
      status: form!.publish.status, publishAt: form!.publish.publishAt ?? null, expireAt: form!.publish.expireAt ?? null,
    }
    try {
      const saved = isNew ? await api.post<{ _id: string }>('/admin/events', body) : await api.put<{ _id: string }>(`/admin/events/${id}`, body)
      toast('Event saved')
      if (isNew) navigate(`/admin/events/${saved._id}`, { replace: true })
      else existing.reload()
    } catch (e) {
      if (e instanceof ApiError) { setErrors({ ...e.fields, _: e.message }); toast(e.message, 'error') }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Link to="/admin/events" className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600"><ArrowLeft className="size-4" />Events</Link>
      <PageHeader
        title={isNew ? 'New event' : form.title}
        actions={
          <>
            {!isNew && <LinkButton variant="ghost" to={`/events/${form.slug}`}><Eye className="size-4" />View</LinkButton>}
            {!isNew && can('content.publish') && <Button variant="ghost" onClick={async () => { if (await confirm({ title: 'Delete event?', message: 'Registrations for this event will also be removed.', danger: true, confirmLabel: 'Delete' })) { await api.del(`/admin/events/${id}`); toast('Deleted'); navigate('/admin/events') } }}><Trash2 className="size-4" />Delete</Button>}
            <Button onClick={save} loading={saving}><Save className="size-4" />Save</Button>
          </>
        }
      />
      {errors._ && <div className="mb-4"><Alert tone="error">{errors._}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'details', label: 'Details' }, { value: 'content', label: 'Page builder' }, ...(!isNew && regsOn ? [{ value: 'registrations' as const, label: 'Registrations', count: regs.data?.filter((r) => r.status === 'registered').length }] : [])]} />
          {tab === 'details' && (
            <Card className="space-y-4 p-5">
              <Input label="Title" required value={form.title} onChange={(e) => update({ title: e.target.value })} error={errors.title} />
              <Textarea label="Summary" value={form.summary} onChange={(e) => update({ summary: e.target.value })} rows={2} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Select label="Event type" value={form.eventType} onChange={(e) => update({ eventType: e.target.value })}>{['summit', 'webinar', 'conference', 'workshop', 'industry_visit', 'meeting', 'program'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
                <Input label="Starts" type="datetime-local" required value={toLocalInput(form.startAt)} onChange={(e) => update({ startAt: fromLocalInput(e.target.value) ?? '' })} error={errors.startAt} />
                <Input label="Ends" type="datetime-local" value={toLocalInput(form.endAt)} onChange={(e) => update({ endAt: fromLocalInput(e.target.value) ?? '' })} error={errors.endAt} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Select label="Format" value={form.location.mode} onChange={(e) => update({ location: { ...form.location, mode: e.target.value } })}>{['in_person', 'online', 'hybrid'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
                <Input label="Venue" value={form.location.venue ?? ''} onChange={(e) => update({ location: { ...form.location, venue: e.target.value } })} />
                <Input label="City" value={form.location.city ?? ''} onChange={(e) => update({ location: { ...form.location, city: e.target.value } })} />
              </div>
              {form.location.mode !== 'in_person' && <Input label="Meeting link" value={form.location.meetingUrl ?? ''} onChange={(e) => update({ location: { ...form.location, meetingUrl: e.target.value } })} hint="Shared only with registered attendees (or all signed-in viewers when registration is off)" />}
              <fieldset className="space-y-3 rounded-xl bg-brand-50/50 p-4">
                <legend className="px-1 text-sm font-semibold">Registration</legend>
                <Checkbox label="Enable registration" checked={form.registration.enabled} onChange={(e) => update({ registration: { ...form.registration, enabled: e.target.checked } })} />
                {form.registration.enabled && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Input label="Capacity" type="number" value={form.registration.capacity ?? ''} onChange={(e) => update({ registration: { ...form.registration, capacity: e.target.value as unknown as number } })} hint="Blank for unlimited" />
                    <Input label="Registration deadline" type="datetime-local" value={toLocalInput(form.registration.deadline)} onChange={(e) => update({ registration: { ...form.registration, deadline: fromLocalInput(e.target.value) } })} />
                    <Input label="External registration URL" value={form.registration.externalUrl ?? ''} onChange={(e) => update({ registration: { ...form.registration, externalUrl: e.target.value } })} />
                  </div>
                )}
              </fieldset>
              <ImageField labelText="Featured image" value={form.featuredImage} onChange={(featuredImage) => update({ featuredImage })} />
              <Input label="URL slug" value={form.slug} onChange={(e) => update({ slug: e.target.value })} />
            </Card>
          )}
          {tab === 'content' && <BlockEditor blocks={form.blocks} onChange={(blocks) => update({ blocks })} forms={forms} />}
          {tab === 'registrations' && regsOn && (
            <Card className="overflow-x-auto">
              {!regs.data?.length ? <p className="p-6 text-sm text-ink-500">No registrations yet.</p> : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink-900/8 text-xs uppercase text-ink-500"><tr><th className="px-4 py-2">Member</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Registered</th></tr></thead>
                  <tbody className="divide-y divide-ink-900/8">{regs.data.map((r) => <tr key={r._id}><td className="px-4 py-2">{r.user?.name}<span className="block text-xs text-ink-500">{r.user?.email}</span></td><td className="px-4 py-2">{label(r.user?.category)}</td><td className="px-4 py-2">{label(r.status)}</td><td className="px-4 py-2 text-xs">{formatDateTime(r.createdAt)}</td></tr>)}</tbody>
                </table>
              )}
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <PublishPanel value={form.publish} onChange={(publish) => update({ publish })} errors={errors} />
          <Card className="p-4"><p className="mb-3 font-semibold">Audience</p><AccessEditor value={form.access} onChange={(access) => update({ access })} errors={errors} /></Card>
          <Card className="p-4"><Select label="Post-event feedback form" value={form.feedbackForm ?? ''} onChange={(e) => update({ feedbackForm: e.target.value || null })} hint="Shown once the event has started"><option value="">None</option>{forms.map((f) => <option key={f._id} value={f._id}>{f.title}</option>)}</Select></Card>
        </div>
      </div>
    </div>
  )
}
