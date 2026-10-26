import { ArrowDown, ArrowUp, Download, EyeOff, ListChecks, MessageSquareHeart, Plus, Star, Trash2, Users } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Alert, Badge, Button, Card, Checkbox, Empty, ErrorState, Input, Loading, Modal, PageHeader, Pagination, Select, StatTile, StatusBadge, Tabs, Textarea, useFeedback } from '../../components/ui'
import { ApiError, api, downloadUrl, type Paged } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatDate, formatDateTime, label } from '../../lib/format'
import { useAsync, useDocumentTitle, useQueryState } from '../../lib/hooks'
import type { Question } from '../../lib/types'
import { useChartColors } from '../../lib/theme'

const QTYPES: { value: Question['type']; label: string }[] = [
  { value: 'rating', label: 'Star rating' },
  { value: 'nps', label: 'Recommendation (0–10)' },
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'short_text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
]

interface FormRow {
  _id: string
  title: string
  description?: string
  questions: (Omit<Question, '_id'> & { _id?: string })[]
  anonymity: 'identified' | 'anonymous' | 'optional'
  submissionPolicy: 'once' | 'multiple'
  status: 'draft' | 'active' | 'closed'
  version: number
  responses?: number
  updatedAt?: string
}

export function FeedbackForms() {
  useDocumentTitle('Feedback forms')
  const { toast, confirm } = useFeedback()
  const { data, error, loading, reload } = useAsync(() => api.get<FormRow[]>('/admin/feedback/forms'), [])
  const [editing, setEditing] = useState<Partial<FormRow> | null>(null)
  return (
    <div>
      <PageHeader title="Feedback Forms" subtitle="Build reusable forms, then attach them to opportunities, articles, courses, lessons or events." actions={<Button onClick={() => setEditing({ title: '', questions: [{ type: 'rating', label: 'How would you rate this?', required: true, options: [], scaleMax: 5 }], anonymity: 'identified', submissionPolicy: 'once', status: 'active' })}><Plus className="size-4" />New form</Button>} />
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? <Empty icon={<ListChecks className="size-8" />} title="No forms yet" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((f) => (
            <Card key={f._id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2"><p className="font-semibold text-ink-900">{f.title}</p><StatusBadge status={f.status === 'active' ? 'active' : f.status} /></div>
              <p className="mt-1 text-xs text-ink-500">{f.questions.length} questions · v{f.version} · {label(f.anonymity === 'optional' ? 'optional' : f.anonymity)} · {f.submissionPolicy === 'once' ? 'one response per person' : 'multiple responses'}</p>
              <p className="mt-3 flex-1 text-sm text-ink-700">{f.responses} response{f.responses === 1 ? '' : 's'}</p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(f)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => location.assign(`/admin/feedback?formId=${f._id}`)}>Analytics</Button>
                {!f.responses && <Button size="sm" variant="ghost" aria-label="Delete" onClick={async () => { if (await confirm({ title: 'Delete form?', message: `“${f.title}” has no responses and will be deleted.`, danger: true, confirmLabel: 'Delete' })) { await api.del(`/admin/feedback/forms/${f._id}`); toast('Deleted'); reload() } }}><Trash2 className="size-4" /></Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <FormBuilder form={editing} onClose={() => setEditing(null)} onSaved={() => { reload(); setEditing(null) }} />}
    </div>
  )
}

function FormBuilder({ form, onClose, onSaved }: { form: Partial<FormRow>; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback()
  const [f, setF] = useState<Partial<FormRow>>(structuredClone(form))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const qs = f.questions ?? []
  const setQ = (i: number, patch: Partial<FormRow['questions'][number]>) => setF({ ...f, questions: qs.map((q, j) => (j === i ? { ...q, ...patch } : q)) })
  const move = (i: number, d: -1 | 1) => { const n = [...qs]; [n[i], n[i + d]] = [n[i + d], n[i]]; setF({ ...f, questions: n }) }

  async function save() {
    setBusy(true)
    setErrors({})
    try {
      const body = { title: f.title, description: f.description, questions: qs.map((q) => ({ ...q, options: ['single_choice', 'multiple_choice'].includes(q.type) ? q.options : [] })), anonymity: f.anonymity, submissionPolicy: f.submissionPolicy, status: f.status }
      if (f._id) await api.put(`/admin/feedback/forms/${f._id}`, body)
      else await api.post('/admin/feedback/forms', body)
      toast('Form saved')
      onSaved()
    } catch (e) {
      if (e instanceof ApiError) setErrors({ ...e.fields, _: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="xl" title={f._id ? `Edit form · v${f.version}` : 'New feedback form'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save form</Button></>}>
      <div className="space-y-4">
        {errors._ && <Alert tone="error">{errors._}{errors.questions && ` — ${errors.questions}`}</Alert>}
        {!!form.responses && <Alert tone="info">This form has responses. Changing questions creates a new version; earlier answers keep their original wording.</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Title" required value={f.title ?? ''} onChange={(e) => setF({ ...f, title: e.target.value })} error={errors.title} />
          <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as FormRow['status'] })}><option value="active">Active — accepting responses</option><option value="draft">Draft</option><option value="closed">Closed</option></Select>
          <Select label="Respondent identity" value={f.anonymity} onChange={(e) => setF({ ...f, anonymity: e.target.value as FormRow['anonymity'] })} hint="Anonymous responses never store who submitted them">
            <option value="identified">Identified — members must sign in</option><option value="anonymous">Anonymous — never linked to a person</option><option value="optional">Respondent chooses</option>
          </Select>
          <Select label="Submissions" value={f.submissionPolicy} onChange={(e) => setF({ ...f, submissionPolicy: e.target.value as FormRow['submissionPolicy'] })}><option value="once">One response per person per item</option><option value="multiple">Allow repeat responses</option></Select>
        </div>
        <Textarea label="Description" value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} />

        <div className="space-y-3">
          {qs.map((q, i) => (
            <Card key={q._id ?? i} className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-500">Q{i + 1}</span>
                <Select aria-label="Question type" value={q.type} onChange={(e) => setQ(i, { type: e.target.value as Question['type'], options: ['single_choice', 'multiple_choice'].includes(e.target.value) && !q.options?.length ? [{ label: 'Option 1' } as { _id: string; label: string }, { label: 'Option 2' } as { _id: string; label: string }] : q.options })} className="h-9 w-56">{QTYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
                <span className="flex-1" />
                <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-ink-500 disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button aria-label="Move down" disabled={i === qs.length - 1} onClick={() => move(i, 1)} className="p-1 text-ink-500 disabled:opacity-30"><ArrowDown className="size-4" /></button>
                <button aria-label="Delete question" onClick={() => setF({ ...f, questions: qs.filter((_, j) => j !== i) })} className="p-1 text-ink-500 hover:text-red-600"><Trash2 className="size-4" /></button>
              </div>
              <Input aria-label="Question" placeholder="Question" value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} error={errors[`questions.${i}.label`]} />
              <Input aria-label="Help text" placeholder="Help text (optional)" value={q.help ?? ''} onChange={(e) => setQ(i, { help: e.target.value })} />
              {q.type === 'rating' && <Select label="Scale" value={q.scaleMax ?? 5} onChange={(e) => setQ(i, { scaleMax: Number(e.target.value) })} className="w-40">{[3, 5, 7, 10].map((n) => <option key={n} value={n}>1 – {n}</option>)}</Select>}
              {['single_choice', 'multiple_choice'].includes(q.type) && (
                <div className="space-y-2">
                  {(q.options ?? []).map((o, oi) => (
                    <div key={o._id ?? oi} className="flex gap-2">
                      <input aria-label={`Option ${oi + 1}`} className="h-9 flex-1 rounded-lg border border-ink-300/70 px-3 text-sm" value={o.label} onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === oi ? { ...x, label: e.target.value } : x)) })} />
                      <button aria-label="Remove option" onClick={() => setQ(i, { options: q.options.filter((_, j) => j !== oi) })} className="p-1 text-ink-500 hover:text-red-600"><Trash2 className="size-4" /></button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setQ(i, { options: [...(q.options ?? []), { label: `Option ${(q.options?.length ?? 0) + 1}` } as { _id: string; label: string }] })}><Plus className="size-4" />Option</Button>
                </div>
              )}
              <Checkbox label="Required" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} />
            </Card>
          ))}
          <Button variant="outline" onClick={() => setF({ ...f, questions: [...qs, { type: 'short_text', label: '', required: false, options: [] }] })}><Plus className="size-4" />Add question</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- analytics

interface Summary {
  total: number
  averageRating: number | null
  anonymousCount: number
  trend: { date: string; count: number; avg: number | null }[]
  ratingDistribution: { rating: number; count: number }[]
  byTarget: { kind: string; content?: string; course?: string; lessonId?: string; event?: string; title: string; type: string; count: number; avg: number | null }[]
  questions: { questionId: string; label: string; type: string; total: number; average?: number; breakdown: { value: string; label: string; count: number }[] }[]
}

interface Targets {
  targets: { kind: string; content?: string; course?: string; lessonId?: string; event?: string; title: string; type: string }[]
  forms: { _id: string; title: string }[]
  courses: { _id: string; title: string; modules: { _id: string; title: string; lessons: { _id: string; title: string }[] }[] }[]
}

interface Response {
  _id: string
  submittedAt: string
  targetTitle: string
  targetType: string
  formVersion: number
  anonymous: boolean
  ratingAvg?: number
  form?: { title: string }
  user: { name: string; email: string; category: string } | null
  respondentCategory: string | null
  answers: { questionId: string; label: string; type: string; display: string }[]
}


function targetKey(t: { kind: string; content?: string; course?: string; lessonId?: string; event?: string }) {
  return [t.kind, t.content ?? t.event ?? t.course ?? '', t.lessonId ?? ''].join(':')
}
function targetParams(key: string) {
  const [kind, id, lessonId] = key.split(':')
  if (!kind) return {}
  if (kind === 'content') return { contentId: id }
  if (kind === 'event') return { eventId: id }
  if (kind === 'course') return { courseId: id, targetKind: 'course' }
  return { courseId: id, lessonId, targetKind: 'lesson' }
}

function Stars({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-ink-300">—</span>
  return <span className="inline-flex items-center gap-1 font-semibold tabular-nums"><Star className="size-3.5 fill-amber-400 text-amber-400" />{value.toFixed(2)}</span>
}

export function FeedbackAnalytics() {
  const chart = useChartColors()
  useDocumentTitle('Feedback analytics')
  const { can } = useAuth()
  const identified = can('feedback.viewIdentified')
  const [f, setF] = useQueryState({ view: 'summary', from: '', to: '', targetType: '', target: '', courseId: '', formId: '', userId: '', category: '', minRating: '', anonymous: '', q: '', page: '1' })
  const { data: meta } = useAsync(() => api.get<Targets>('/admin/feedback/analytics/targets'), [])
  const filters = {
    from: f.from, to: f.to, targetType: f.targetType, formId: f.formId, minRating: f.minRating, anonymous: f.anonymous,
    ...(f.courseId && !f.target ? { courseId: f.courseId } : targetParams(f.target)),
    ...(identified ? { userId: f.userId, category: f.category } : {}),
  }
  const deps = [f.from, f.to, f.targetType, f.target, f.courseId, f.formId, f.userId, f.category, f.minRating, f.anonymous]
  const summary = useAsync(() => (f.view === 'summary' || f.view === 'courses' ? api.get<Summary>('/admin/feedback/analytics/summary', filters) : Promise.resolve(null)), [f.view, ...deps])
  const responses = useAsync(() => (f.view === 'responses' ? api.get<Paged<Response>>('/admin/feedback/analytics/responses', { ...filters, q: f.q, page: f.page }) : Promise.resolve(null)), [f.view, f.q, f.page, ...deps])
  const users = useAsync(() => (f.view === 'users' && identified ? api.get<{ userId: string; name: string; email: string; category: string; count: number; avg: number | null; last: string }[]>('/admin/feedback/analytics/users') : Promise.resolve(null)), [f.view])
  const [open, setOpen] = useState<Response | null>(null)
  const hasFilters = deps.some(Boolean)
  const course = meta?.courses.find((c) => c._id === f.courseId)

  return (
    <div className="space-y-5">
      <PageHeader title="Feedback Analytics" subtitle="Based on stored responses. Anonymous responses never reveal who submitted them." actions={<Button variant="outline" onClick={() => downloadUrl('/admin/feedback/analytics/export.csv', filters)}><Download className="size-4" />Export CSV</Button>} />

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="From" type="date" value={f.from} onChange={(e) => setF({ from: e.target.value })} />
        <Input label="To" type="date" value={f.to} onChange={(e) => setF({ to: e.target.value })} />
        <Select label="Content type" value={f.targetType} onChange={(e) => setF({ targetType: e.target.value })}><option value="">All types</option>{['opportunity', 'article', 'tutorial', 'blog', 'announcement', 'page', 'course', 'lesson', 'event'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
        <Select label="Feedback form" value={f.formId} onChange={(e) => setF({ formId: e.target.value })}><option value="">All forms</option>{meta?.forms.map((x) => <option key={x._id} value={x._id}>{x.title}</option>)}</Select>
        <Select label="Specific item" value={f.target} onChange={(e) => setF({ target: e.target.value, courseId: '' })} wrapClass="sm:col-span-2"><option value="">All items</option>{meta?.targets.map((t) => <option key={targetKey(t)} value={targetKey(t)}>{label(t.type)} · {t.title}</option>)}</Select>
        <Select label="Minimum rating" value={f.minRating} onChange={(e) => setF({ minRating: e.target.value })}><option value="">Any</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}+ stars</option>)}</Select>
        <Select label="Respondent" value={f.anonymous} onChange={(e) => setF({ anonymous: e.target.value })}><option value="">Identified & anonymous</option><option value="false">Identified only</option><option value="true">Anonymous only</option></Select>
        {identified && <Select label="Member category" value={f.category} onChange={(e) => setF({ category: e.target.value })}><option value="">All categories</option>{['startup', 'academia', 'industry', 'sme', 'alumni', 'student', 'professional', 'other'].map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>}
        {f.userId && <div className="flex items-end"><Button variant="soft" onClick={() => setF({ userId: '' })}>Clear user filter ×</Button></div>}
        {hasFilters && <div className="flex items-end"><Button variant="ghost" onClick={() => setF({ from: '', to: '', targetType: '', target: '', courseId: '', formId: '', userId: '', category: '', minRating: '', anonymous: '' })}>Reset filters</Button></div>}
      </Card>

      <Tabs value={f.view} onChange={(view) => setF({ view })} tabs={[{ value: 'summary', label: 'Summary' }, { value: 'courses', label: 'Courses & lessons' }, { value: 'responses', label: 'Responses' }, ...(identified ? [{ value: 'users', label: 'By member' }] : [])]} />

      {f.view === 'summary' && (summary.loading ? <Loading /> : summary.error ? <ErrorState error={summary.error} onRetry={summary.reload} /> : summary.data && (
        summary.data.total === 0 ? <Empty icon={<MessageSquareHeart className="size-8" />} title="No feedback matches these filters">Responses appear here as members submit feedback.</Empty> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile icon={<MessageSquareHeart className="size-5" />} value={summary.data.total} label="Responses" />
              <StatTile icon={<Star className="size-5" />} value={summary.data.averageRating?.toFixed(2) ?? '—'} label="Average rating (out of 5)" tone="amber" />
              <StatTile icon={<EyeOff className="size-5" />} value={summary.data.anonymousCount} label="Anonymous responses" tone="purple" />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="mb-4 font-semibold">Responses over time</h2>
                <div className="h-56">
                  <ResponsiveContainer>
                    <LineChart data={summary.data.trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, { day: 'numeric', month: 'short' })} tick={{ fontSize: 11, fill: chart.tick }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chart.tick }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={chart.tooltip} labelFormatter={(d) => formatDate(d as string)} formatter={(v, n) => [v, n === 'count' ? 'Responses' : 'Avg rating']} />
                      <Line type="monotone" dataKey="count" stroke={chart.series} strokeWidth={2} dot={summary.data.trend.length < 20 ? { r: 4, fill: chart.series, stroke: chart.surface, strokeWidth: 2 } : false} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="mb-4 font-semibold">Rating distribution</h2>
                <div className="h-56">
                  <ResponsiveContainer>
                    <BarChart data={[1, 2, 3, 4, 5].map((r) => ({ rating: `${r}★`, count: summary.data!.ratingDistribution.find((d) => d.rating === r)?.count ?? 0 }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="rating" tick={{ fontSize: 11, fill: chart.tick }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chart.tick }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.cursor }} formatter={(v) => [v, 'Responses']} />
                      <Bar dataKey="count" fill={chart.series} radius={[4, 4, 0, 0]} barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-ink-500">Each response's rating questions are averaged and normalised to a 5-point scale.</p>
              </Card>
            </div>
            <Card className="overflow-x-auto">
              <h2 className="px-5 pt-5 font-semibold">By content item</h2>
              <table className="mt-3 w-full min-w-[560px] text-left text-sm">
                <thead className="border-y border-ink-900/8 bg-ink-900/[0.02] text-xs uppercase tracking-wider text-ink-500"><tr><th className="px-5 py-2.5">Item</th><th className="px-5 py-2.5">Type</th><th className="px-5 py-2.5 text-right">Responses</th><th className="px-5 py-2.5 text-right">Avg rating</th></tr></thead>
                <tbody className="divide-y divide-ink-900/8">
                  {summary.data.byTarget.map((t) => (
                    <tr key={targetKey(t)} className="cursor-pointer hover:bg-brand-50/40" onClick={() => setF({ target: targetKey(t), view: 'responses' })}>
                      <td className="px-5 py-2.5 font-medium text-ink-900">{t.title}</td><td className="px-5 py-2.5">{label(t.type)}</td><td className="px-5 py-2.5 text-right tabular-nums">{t.count}</td><td className="px-5 py-2.5 text-right"><Stars value={t.avg} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              {summary.data.questions.map((q) => {
                const max = Math.max(...q.breakdown.map((b) => b.count))
                return (
                  <Card key={q.questionId} className="p-5">
                    <p className="font-semibold text-ink-900">{q.label}</p>
                    <p className="text-xs text-ink-500">{QTYPES.find((t) => t.value === q.type)?.label} · {q.total} answers{q.average !== undefined && ` · average ${q.average}`}</p>
                    <ul className="mt-3 space-y-1.5">
                      {q.breakdown.map((b) => (
                        <li key={b.value} className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-sm">
                          <span className="truncate text-ink-700" title={b.label}>{q.type === 'rating' ? `${b.label} ★` : b.label}</span>
                          <span className="h-2.5 overflow-hidden rounded-full bg-ink-900/5"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${(b.count / max) * 100}%` }} /></span>
                          <span className="text-right text-xs tabular-nums text-ink-500">{b.count}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      ))}

      {f.view === 'courses' && (
        <div className="space-y-4">
          <Select label="Course" value={f.courseId} onChange={(e) => setF({ courseId: e.target.value, target: '' })} wrapClass="max-w-md"><option value="">Select a course…</option>{meta?.courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}</Select>
          {!course ? <Empty title="Choose a course">Compare course-level and lesson-level feedback to see which lessons work and which need attention.</Empty> : summary.loading ? <Loading /> : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-ink-900/8 bg-ink-900/[0.02] text-xs uppercase tracking-wider text-ink-500"><tr><th className="px-5 py-2.5">Course / lesson</th><th className="px-5 py-2.5 text-right">Responses</th><th className="px-5 py-2.5 text-right">Avg rating</th></tr></thead>
                <tbody className="divide-y divide-ink-900/8">
                  {(() => {
                    const rows = summary.data?.byTarget ?? []
                    const courseRow = rows.find((r) => r.kind === 'course')
                    return (
                      <>
                        <tr className="bg-brand-50/50"><td className="px-5 py-2.5 font-semibold">Whole course</td><td className="px-5 py-2.5 text-right tabular-nums">{courseRow?.count ?? 0}</td><td className="px-5 py-2.5 text-right"><Stars value={courseRow?.avg} /></td></tr>
                        {course.modules.map((m) => (
                          <Fragment key={m._id}>
                            <tr><td colSpan={3} className="px-5 pt-3 text-xs font-semibold uppercase tracking-wider text-ink-500">{m.title}</td></tr>
                            {m.lessons.map((l) => {
                              const r = rows.find((x) => x.kind === 'lesson' && x.lessonId === l._id)
                              return (
                                <tr key={l._id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => setF({ target: `lesson:${course._id}:${l._id}`, view: 'responses' })}>
                                  <td className="px-5 py-2.5 pl-8">{l.title}</td><td className="px-5 py-2.5 text-right tabular-nums">{r?.count ?? 0}</td>
                                  <td className="px-5 py-2.5 text-right">{r?.avg !== undefined && r.avg !== null && r.avg < 3 ? <Badge tone="red">{r.avg.toFixed(2)} · needs attention</Badge> : <Stars value={r?.avg} />}</td>
                                </tr>
                              )
                            })}
                          </Fragment>
                        ))}
                      </>
                    )
                  })()}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {f.view === 'responses' && (
        <div className="space-y-3">
          <input aria-label="Search answers" value={f.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Search text answers…" className="h-10 w-72 rounded-lg border border-ink-300/70 bg-card px-3 text-sm" />
          {responses.loading ? <Loading /> : responses.error ? <ErrorState error={responses.error} onRetry={responses.reload} /> : !responses.data?.items.length ? <Empty title="No responses" /> : (
            <>
              <Card className="divide-y divide-ink-900/8">
                {responses.data.items.map((r) => (
                  <button key={r._id} onClick={() => setOpen(r)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-brand-50/40">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">{r.targetTitle}</p>
                      <p className="text-xs text-ink-500">{r.form?.title} v{r.formVersion} · {formatDateTime(r.submittedAt)} · {r.anonymous ? 'Anonymous' : r.user ? `${r.user.name} (${label(r.respondentCategory)})` : 'Identity hidden'}</p>
                    </div>
                    <Stars value={r.ratingAvg} />
                  </button>
                ))}
              </Card>
              <Pagination page={responses.data.page} pages={responses.data.pages} onChange={(p) => setF({ page: String(p) })} />
            </>
          )}
        </div>
      )}

      {f.view === 'users' && identified && (
        users.loading ? <Loading /> : !users.data?.length ? <Empty icon={<Users className="size-8" />} title="No identified feedback yet" /> : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-ink-900/8 bg-ink-900/[0.02] text-xs uppercase tracking-wider text-ink-500"><tr><th className="px-5 py-2.5">Member</th><th className="px-5 py-2.5">Category</th><th className="px-5 py-2.5 text-right">Responses</th><th className="px-5 py-2.5 text-right">Avg rating</th><th className="px-5 py-2.5">Last</th></tr></thead>
              <tbody className="divide-y divide-ink-900/8">
                {users.data.map((u) => (
                  <tr key={u.userId} className="cursor-pointer hover:bg-brand-50/40" onClick={() => setF({ userId: u.userId, view: 'responses' })}>
                    <td className="px-5 py-2.5"><p className="font-medium text-ink-900">{u.name}</p><p className="text-xs text-ink-500">{u.email}</p></td><td className="px-5 py-2.5">{label(u.category)}</td><td className="px-5 py-2.5 text-right tabular-nums">{u.count}</td><td className="px-5 py-2.5 text-right"><Stars value={u.avg} /></td><td className="px-5 py-2.5 text-xs">{formatDate(u.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-5 py-3 text-xs text-ink-500">Only identified responses are listed. Anonymous responses are excluded by design.</p>
          </Card>
        )
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title="Response" size="lg">
        {open && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p><span className="text-ink-500">Item:</span> {open.targetTitle}</p>
              <p><span className="text-ink-500">Form:</span> {open.form?.title} (v{open.formVersion})</p>
              <p><span className="text-ink-500">Submitted:</span> {formatDateTime(open.submittedAt)}</p>
              <p><span className="text-ink-500">Respondent:</span> {open.anonymous ? 'Anonymous' : open.user ? `${open.user.name} · ${open.user.email}` : 'Hidden (requires permission)'}</p>
            </div>
            <dl className="divide-y divide-ink-900/8 rounded-lg border border-ink-900/10">
              {open.answers.map((a) => <div key={a.questionId} className="px-4 py-3"><dt className="text-ink-500">{a.label}</dt><dd className="mt-0.5 whitespace-pre-line font-medium text-ink-900">{a.type === 'rating' ? `${a.display} ★` : String(a.display)}</dd></div>)}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  )
}
