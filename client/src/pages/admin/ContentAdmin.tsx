import { ArrowLeft, Eye, Plus, Save, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AccessEditor, AudienceSummary, PublishPanel, useLookups, type PublishState } from '../../components/admin/Publishing'
import { BlockEditor } from '../../components/admin/BlockEditor'
import { MediaPicker } from '../../components/admin/MediaPicker'
import { BlockRenderer } from '../../components/BlockRenderer'
import { Alert, Badge, Button, Card, Checkbox, Empty, ErrorState, Input, LinkButton, Loading, PageHeader, Pagination, Select, StatusBadge, Tabs, Textarea, useFeedback } from '../../components/ui'
import { ApiError, api, type Paged } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { contentHref, formatDate, label, timeAgo } from '../../lib/format'
import { useAsync, useDebounced, useDocumentTitle, useQueryState } from '../../lib/hooks'
import type { Access, Block, ContentCard, PublicationStatus, Ref } from '../../lib/types'

const GROUPS: Record<string, { title: string; types: string[] }> = {
  portfolio: { title: 'Portfolio', types: ['page', 'service', 'project', 'case_study'] },
  opportunity: { title: 'Opportunities', types: ['opportunity'] },
  knowledge: { title: 'Knowledge Hub', types: ['article', 'blog', 'tutorial'] },
  announcement: { title: 'Announcements', types: ['announcement'] },
}
const STATUSES: PublicationStatus[] = ['draft', 'pending_review', 'approved', 'scheduled', 'published', 'unpublished', 'archived']

export function ContentList() {
  const [f, setF] = useQueryState({ type: 'opportunity', status: '', q: '', page: '1' })
  const group = GROUPS[f.type] ?? GROUPS.opportunity
  useDocumentTitle(group.title)
  const q = useDebounced(f.q)
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<ContentCard>>('/admin/contents', { type: f.type, status: f.status, q, page: f.page }), [f.type, f.status, q, f.page])

  return (
    <div>
      <PageHeader
        title={group.title}
        subtitle="Create, review and publish content. Each item controls its own audience."
        actions={group.types.length === 1 ? <LinkButton to={`/admin/content/new?type=${group.types[0]}`}><Plus className="size-4" />New {label(group.types[0]).toLowerCase()}</LinkButton> : group.types.map((t) => <LinkButton key={t} variant="outline" to={`/admin/content/new?type=${t}`}><Plus className="size-4" />{label(t)}</LinkButton>)}
      />
      <Tabs value={f.status} onChange={(status) => setF({ status })} tabs={[{ value: '', label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: label(s) }))]} />
      <div className="my-4 flex flex-wrap gap-2">
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
          <input value={f.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Search titles…" className="h-10 w-72 rounded-lg border border-ink-300/70 bg-card pl-9 pr-3 text-sm" />
        </label>
      </div>
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? <Empty title="Nothing here yet" /> : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-ink-900/8 bg-ink-900/[0.02] text-xs uppercase tracking-wider text-ink-500">
                <tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Audience</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-ink-900/8">
                {data.items.map((c) => (
                  <tr key={c._id} className="hover:bg-brand-50/40">
                    <td className="px-4 py-3">
                      <Link to={`/admin/content/${c._id}`} className="font-medium text-ink-900 hover:text-brand-700">{c.title}</Link>
                      {c.author?.name && <p className="text-xs text-ink-500">by {c.author.name}</p>}
                    </td>
                    <td className="px-4 py-3">{label(c.type)}{c.opportunity?.opportunityType && <span className="block text-xs text-ink-500">{label(c.opportunity.opportunityType)}</span>}</td>
                    <td className="px-4 py-3 text-xs"><AudienceSummary access={c.access} /></td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} />{c.status === 'scheduled' && c.publishAt && <span className="block text-xs text-ink-500">{formatDate(c.publishAt)}</span>}</td>
                    <td className="px-4 py-3 text-xs text-ink-500">{timeAgo(c.updatedAt)}</td>
                    <td className="px-4 py-3 text-right"><Link to={contentHref(c)} target="_blank" className="text-xs font-semibold text-brand-600">Preview</Link></td>
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

interface ContentForm {
  type: string
  title: string
  slug: string
  summary: string
  featuredImage: string
  blocks: Block[]
  categories: string[]
  tags: string[]
  featured: boolean
  order: number
  seo: { title?: string; description?: string; noIndex?: boolean }
  access: Access
  feedbackForm: string | null
  opportunity: Record<string, string>
  knowledge: { section?: string; readingMinutes?: number }
  portfolio: { section?: string; client?: string; year?: number }
  publish: PublishState
}

const EMPTY = (type: string): ContentForm => ({
  type, title: '', slug: '', summary: '', featuredImage: '', blocks: [], categories: [], tags: [], featured: false, order: 0, seo: {},
  access: { visibility: type === 'opportunity' ? 'authenticated' : 'public', roles: [], organizations: [] },
  feedbackForm: null, opportunity: {}, knowledge: {}, portfolio: {}, publish: { status: 'draft' },
})

const KNOWLEDGE_SECTIONS = ['industry_insights', 'research_repository', 'regulatory_corner', 'learning_center', 'funding_opportunities', 'innovation_center', 'templates_downloads', 'success_stories']
const OPP_TYPES = ['hiring', 'internship', 'consultancy', 'research_collaboration', 'technology_transfer', 'training', 'funding']

export function ContentEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { toast, confirm } = useFeedback()
  const { can } = useAuth()
  const { forms } = useLookups()
  const { data: tax } = useAsync(() => api.get<{ categories: Ref[]; tags: Ref[] }>('/contents/taxonomy'), [])
  const { data: orgs } = useAsync(() => api.get<{ organizations: { _id: string; name: string }[] }>('/admin/lookups'), [])
  const existing = useAsync(() => (isNew ? Promise.resolve(null) : api.get<ContentCard & { blocks: Block[]; seo: ContentForm['seo']; feedbackForm?: string; order: number }>(`/admin/contents/${id}`)), [id])
  const [form, setForm] = useState<ContentForm | null>(null)
  const [tab, setTab] = useState<'content' | 'details' | 'preview'>('content')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Sync the local form whenever a different record (or a reload) arrives.
  const formSource = isNew ? `new:${params.get('type')}` : existing.data
  const [syncedSource, setSyncedSource] = useState<unknown>(null)
  if (formSource && formSource !== syncedSource) {
    setSyncedSource(formSource)
    if (isNew) setForm(EMPTY(params.get('type') ?? 'article'))
    else if (existing.data) {
      const c = existing.data
      const org = c.opportunity?.organization
      setForm({
        ...EMPTY(c.type),
        title: c.title, slug: c.slug, summary: c.summary ?? '', featuredImage: c.featuredImage ?? '', blocks: c.blocks ?? [],
        categories: (c.categories ?? []).map((x) => (typeof x === 'string' ? x : x._id)), tags: (c.tags ?? []).map((x) => (typeof x === 'string' ? x : x._id)),
        featured: !!c.featured, order: c.order ?? 0, seo: c.seo ?? {}, access: { roles: [], organizations: [], ...c.access } as Access,
        feedbackForm: (c.feedbackForm as string | undefined) ?? null,
        opportunity: { ...(c.opportunity as Record<string, string>), organization: typeof org === 'object' ? org?._id : (org as string) ?? '' },
        knowledge: c.knowledge ?? {}, portfolio: c.portfolio ?? {},
        publish: { status: c.status, publishAt: c.publishAt ?? null, expireAt: c.expireAt ?? null },
      })
    }
    setDirty(false)
  }

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (patch: Partial<ContentForm>) => {
    setForm((f) => (f ? { ...f, ...patch } : f))
    setDirty(true)
  }
  useDocumentTitle(form?.title || 'Content editor')
  const previewTarget = useMemo(() => ({ kind: 'content' as const, id: id ?? 'new', title: form?.title ?? '' }), [id, form?.title])

  if (existing.loading || !form) return <Loading />
  if (existing.error) return <ErrorState error={existing.error} />
  const o = form.opportunity
  const isOpp = form.type === 'opportunity'
  const isKnowledge = ['article', 'blog', 'tutorial'].includes(form.type)
  const isPortfolio = ['page', 'project', 'case_study', 'service'].includes(form.type)

  async function save() {
    if (!form) return
    setSaving(true)
    setErrors({})
    const opp = Object.fromEntries(Object.entries(form.opportunity).filter(([k, v]) => v !== '' && v !== undefined && v !== null && !['_id'].includes(k)))
    const body = {
      type: form.type, title: form.title, slug: form.slug || undefined, summary: form.summary, featuredImage: form.featuredImage, blocks: form.blocks,
      categories: form.categories, tags: form.tags, featured: form.featured, order: Number(form.order) || 0, seo: form.seo, access: form.access,
      feedbackForm: form.feedbackForm || null, status: form.publish.status, publishAt: form.publish.publishAt ?? null, expireAt: form.publish.expireAt ?? null,
      ...(isOpp ? { opportunity: { ...opp, organization: opp.organization || null, deadline: opp.deadline ? new Date(opp.deadline).toISOString() : null } } : {}),
      ...(isKnowledge ? { knowledge: { ...form.knowledge, readingMinutes: form.knowledge.readingMinutes ? Number(form.knowledge.readingMinutes) : undefined } } : {}),
      ...(isPortfolio ? { portfolio: { ...form.portfolio, year: form.portfolio.year ? Number(form.portfolio.year) : undefined } } : {}),
    }
    try {
      const saved = isNew ? await api.post<{ _id: string }>('/admin/contents', body) : await api.put<{ _id: string }>(`/admin/contents/${id}`, body)
      toast('Saved')
      setDirty(false)
      if (isNew) navigate(`/admin/content/${saved._id}`, { replace: true })
      else existing.reload()
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({ ...err.fields, _: err.message })
        toast(err.message, 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!(await confirm({ title: 'Delete this item?', message: <>“{form?.title}” will be permanently deleted. Consider archiving instead to keep its history and feedback context.</>, confirmLabel: 'Delete', danger: true }))) return
    try {
      await api.del(`/admin/contents/${id}`)
      toast('Deleted')
      navigate(`/admin/content?type=${isOpp ? 'opportunity' : isKnowledge ? 'knowledge' : isPortfolio ? 'portfolio' : 'announcement'}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const backType = isOpp ? 'opportunity' : isKnowledge ? 'knowledge' : isPortfolio ? 'portfolio' : 'announcement'
  return (
    <div>
      <Link to={`/admin/content?type=${backType}`} className="mb-3 inline-flex items-center gap-1 text-sm text-brand-600"><ArrowLeft className="size-4" />Back</Link>
      <PageHeader
        title={isNew ? `New ${label(form.type).toLowerCase()}` : form.title || 'Untitled'}
        subtitle={!isNew && <span className="inline-flex items-center gap-2">{label(form.type)} · <StatusBadge status={existing.data?.status} /> {dirty && <Badge tone="amber">Unsaved changes</Badge>}</span>}
        actions={
          <>
            {!isNew && existing.data && <LinkButton variant="ghost" to={contentHref(existing.data)}><Eye className="size-4" />View page</LinkButton>}
            {!isNew && can('content.publish') && <Button variant="ghost" onClick={remove}><Trash2 className="size-4" />Delete</Button>}
            <Button onClick={save} loading={saving}><Save className="size-4" />Save</Button>
          </>
        }
      />
      {errors._ && <div className="mb-4"><Alert tone="error">{errors._}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Card className="space-y-4 p-5">
            <Input label="Title" required value={form.title} onChange={(e) => update({ title: e.target.value })} error={errors.title} />
            <Textarea label="Summary" value={form.summary} onChange={(e) => update({ summary: e.target.value })} rows={2} hint="Shown on cards and in search results" error={errors.summary} />
          </Card>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'content', label: 'Page builder' }, { value: 'details', label: 'Details & SEO' }, { value: 'preview', label: 'Preview' }]} />
          {tab === 'content' && <BlockEditor blocks={form.blocks} onChange={(blocks) => update({ blocks })} forms={forms} />}
          {tab === 'preview' && (
            <Card className="p-6">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-ink-500">Preview — renders exactly as published (feedback blocks are inactive until saved)</p>
              <h1 className="text-3xl font-bold">{form.title || 'Untitled'}</h1>
              {form.summary && <p className="mt-2 text-lg text-ink-500">{form.summary}</p>}
              {form.featuredImage && <img src={form.featuredImage} alt="" className="mt-6 w-full rounded-xl" />}
              <div className="mt-6"><BlockRenderer blocks={form.blocks.filter((b) => b.type !== 'feedback' && b.type !== 'related')} target={previewTarget} /></div>
            </Card>
          )}
          {tab === 'details' && (
            <Card className="space-y-4 p-5">
              {isOpp && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Opportunity type" value={o.opportunityType ?? ''} onChange={(e) => update({ opportunity: { ...o, opportunityType: e.target.value } })}><option value="">Select…</option>{OPP_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
                  <Select label="Organization" value={o.organization ?? ''} onChange={(e) => update({ opportunity: { ...o, organization: e.target.value, organizationName: orgs?.organizations.find((x) => x._id === e.target.value)?.name ?? o.organizationName ?? '' } })}><option value="">—</option>{orgs?.organizations.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</Select>
                  <Input label="Organization display name" value={o.organizationName ?? ''} onChange={(e) => update({ opportunity: { ...o, organizationName: e.target.value } })} />
                  <Input label="Location" value={o.location ?? ''} onChange={(e) => update({ opportunity: { ...o, location: e.target.value } })} />
                  <Select label="Work mode" value={o.workMode ?? ''} onChange={(e) => update({ opportunity: { ...o, workMode: e.target.value } })}><option value="">—</option>{['onsite', 'remote', 'hybrid'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
                  <Input label="Engagement" value={o.employmentType ?? ''} onChange={(e) => update({ opportunity: { ...o, employmentType: e.target.value } })} placeholder="Full-time, Internship…" />
                  <Input label="Application deadline" type="date" value={o.deadline ? o.deadline.slice(0, 10) : ''} onChange={(e) => update({ opportunity: { ...o, deadline: e.target.value } })} />
                  <Input label="Application URL" value={o.applyUrl ?? ''} onChange={(e) => update({ opportunity: { ...o, applyUrl: e.target.value } })} />
                  <Input label="Application email" value={o.applyEmail ?? ''} onChange={(e) => update({ opportunity: { ...o, applyEmail: e.target.value } })} />
                  <Textarea wrapClass="sm:col-span-2" label="Eligibility" value={o.eligibility ?? ''} onChange={(e) => update({ opportunity: { ...o, eligibility: e.target.value } })} rows={3} />
                </div>
              )}
              {isKnowledge && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Select label="Content type" value={form.type} onChange={(e) => update({ type: e.target.value })}>{['article', 'blog', 'tutorial'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
                  <Select label="Knowledge section" value={form.knowledge.section ?? ''} onChange={(e) => update({ knowledge: { ...form.knowledge, section: e.target.value || undefined } })}><option value="">—</option>{KNOWLEDGE_SECTIONS.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
                  <Input label="Reading time (min)" type="number" value={form.knowledge.readingMinutes ?? ''} onChange={(e) => update({ knowledge: { ...form.knowledge, readingMinutes: e.target.value as unknown as number } })} />
                </div>
              )}
              {isPortfolio && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Select label="Portfolio type" value={form.type} onChange={(e) => update({ type: e.target.value })}>{['page', 'service', 'project', 'case_study'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
                  <Input label="Client / partner" value={form.portfolio.client ?? ''} onChange={(e) => update({ portfolio: { ...form.portfolio, client: e.target.value } })} />
                  <Input label="Year" type="number" value={form.portfolio.year ?? ''} onChange={(e) => update({ portfolio: { ...form.portfolio, year: e.target.value as unknown as number } })} />
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-ink-900">Featured image</p>
                <div className="flex gap-2">
                  <input aria-label="Featured image URL" className="h-10 flex-1 rounded-lg border border-ink-300/70 px-3 text-sm" value={form.featuredImage} onChange={(e) => update({ featuredImage: e.target.value })} placeholder="https://… or choose from library" />
                  <Button variant="outline" type="button" onClick={() => setPicker(true)}>Library</Button>
                </div>
                {form.featuredImage && <img src={form.featuredImage} alt="" className="max-h-40 rounded-lg" />}
              </div>
              <Input label="URL slug" value={form.slug} onChange={(e) => update({ slug: e.target.value })} hint="Leave blank to generate from the title" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="SEO title" value={form.seo.title ?? ''} onChange={(e) => update({ seo: { ...form.seo, title: e.target.value } })} />
                <Input label="SEO description" value={form.seo.description ?? ''} onChange={(e) => update({ seo: { ...form.seo, description: e.target.value } })} />
              </div>
              <Checkbox label="Ask search engines not to index this page" checked={!!form.seo.noIndex} onChange={(e) => update({ seo: { ...form.seo, noIndex: e.target.checked } })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Checkbox label="Feature on the homepage" checked={form.featured} onChange={(e) => update({ featured: e.target.checked })} />
                <Input label="Sort order" type="number" value={form.order} onChange={(e) => update({ order: Number(e.target.value) })} />
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <PublishPanel value={form.publish} onChange={(publish) => update({ publish })} errors={errors} />
          <Card className="p-4">
            <p className="mb-3 font-semibold text-ink-900">Audience</p>
            <AccessEditor value={form.access} onChange={(access) => update({ access })} errors={errors} />
          </Card>
          <Card className="space-y-3 p-4">
            <p className="font-semibold text-ink-900">Classification</p>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink-700">Categories</p>
              <div className="flex flex-wrap gap-1.5">
                {tax?.categories.map((c) => {
                  const on = form.categories.includes(c._id)
                  return <button key={c._id} type="button" aria-pressed={on} onClick={() => update({ categories: on ? form.categories.filter((x) => x !== c._id) : [...form.categories, c._id] })} className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-900/15'}`}>{c.name}</button>
                })}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink-700">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {tax?.tags.map((c) => {
                  const on = form.tags.includes(c._id)
                  return <button key={c._id} type="button" aria-pressed={on} onClick={() => update({ tags: on ? form.tags.filter((x) => x !== c._id) : [...form.tags, c._id] })} className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-900/15'}`}>#{c.name}</button>
                })}
              </div>
              <Link to="/admin/taxonomy" className="mt-2 inline-block text-xs text-brand-600">Manage categories & tags</Link>
            </div>
          </Card>
          <Card className="p-4">
            <Select label="Feedback form" value={form.feedbackForm ?? ''} onChange={(e) => update({ feedbackForm: e.target.value || null })} hint="Shown at the end of the page. You can also place feedback blocks inline.">
              <option value="">None</option>
              {forms.map((f) => <option key={f._id} value={f._id}>{f.title}{f.status !== 'active' ? ` (${f.status})` : ''}</option>)}
            </Select>
          </Card>
        </div>
      </div>
      <MediaPicker open={picker} kind="image" onClose={() => setPicker(false)} onPick={(m) => update({ featuredImage: m.url })} />
    </div>
  )
}
