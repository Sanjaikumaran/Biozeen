import { BarChart3, BookOpenCheck, FileStack, FlaskRound, GraduationCap, Lightbulb, Scale, Search, Trophy, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ContentTile } from '../../components/Cards'
import { AccessBadge, Badge, Button, Card, Empty, ErrorState, Pagination, Select, SkeletonGrid, Tabs } from '../../components/ui'
import { cx } from '../../lib/cx'
import { api, type Paged } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { label } from '../../lib/format'
import { useAsync, useDocumentTitle, useQueryState } from '../../lib/hooks'
import type { Access, ContentCard, Ref } from '../../lib/types'

const SECTIONS = [
  { key: 'industry_insights', text: 'Reports, trends and market updates', icon: BarChart3 },
  { key: 'research_repository', text: 'Publications, case studies and whitepapers', icon: FlaskRound },
  { key: 'regulatory_corner', text: 'GMP, compliance and global regulatory updates', icon: Scale },
  { key: 'learning_center', text: 'Webinars, workshops and training materials', icon: Lightbulb },
  { key: 'funding_opportunities', text: 'Grants, fellowships and government schemes', icon: Wallet },
  { key: 'innovation_center', text: 'Startup resources and incubation support', icon: Lightbulb },
  { key: 'templates_downloads', text: 'SOPs, formats and templates', icon: FileStack },
  { key: 'success_stories', text: 'Real collaborations. Real impact.', icon: Trophy },
]

interface CourseCard {
  _id: string
  title: string
  slug: string
  summary: string
  thumbnail?: string
  level: string
  moduleCount: number
  lessonCount: number
  access?: Access
}

function Courses() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<CourseCard>>('/courses', { limit: 24 }), [user?.id])
  if (loading) return <SkeletonGrid count={3} />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data?.items.length) return <Empty icon={<GraduationCap className="size-8" />} title="No courses available">{user ? 'New courses will appear here when published.' : 'Sign in to see member courses.'}</Empty>
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.items.map((c) => (
        <Link key={c._id} to={`/courses/${c.slug}`} className="group">
          <Card className="flex h-full flex-col overflow-hidden transition group-hover:border-brand-200 group-hover:shadow-md">
            {c.thumbnail ? <img src={c.thumbnail} alt="" className="aspect-video w-full object-cover" /> : <div className="hero-bg grid aspect-video place-items-center"><GraduationCap className="size-12 text-lime-400" /></div>}
            <div className="flex flex-1 flex-col p-5">
              <div className="mb-2 flex gap-1.5"><Badge tone="blue">{label(c.level)}</Badge><AccessBadge visibility={c.access?.visibility} /></div>
              <p className="font-semibold text-ink-900 group-hover:text-brand-700">{c.title}</p>
              <p className="mt-1 flex-1 text-sm text-ink-500">{c.summary}</p>
              <p className="mt-3 text-xs text-ink-500">{c.moduleCount} modules · {c.lessonCount} lessons</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}

export default function Knowledge() {
  useDocumentTitle('Knowledge Hub')
  const { user } = useAuth()
  const [f, setF] = useQueryState({ tab: 'resources', q: '', section: '', category: '', page: '1' })
  const [draft, setDraft] = useState(f.q)
  const { data: tax } = useAsync(() => api.get<{ categories: Ref[] }>('/contents/taxonomy'), [])
  const { data, error, loading, reload } = useAsync(
    () => (f.tab === 'resources' ? api.get<Paged<ContentCard>>('/contents', { type: 'knowledge', q: f.q, section: f.section, category: f.category, page: f.page, limit: 12 }) : Promise.resolve(null)),
    [f.tab, f.q, f.section, f.category, f.page, user?.id],
  )

  return (
    <>
      <section className="hero-bg text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Knowledge Hub</h1>
          <p className="mt-1 text-brand-100">Explore. Learn. Share. Grow.</p>
          <form className="mt-6 flex gap-2 rounded-xl bg-card p-2" onSubmit={(e) => { e.preventDefault(); setF({ q: draft, tab: 'resources' }) }}>
            <label className="relative flex-1">
              <span className="sr-only">Search resources</span>
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search resources…" className="h-11 w-full rounded-lg pl-9 pr-3 text-sm text-ink-900 outline-none" />
            </label>
            <Button type="submit" className="h-11 bg-lime-600 hover:bg-lime-500" aria-label="Search"><Search className="size-4" /></Button>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {SECTIONS.map(({ key, text, icon: Icon }) => (
            <button
              key={key}
              aria-pressed={f.section === key}
              onClick={() => setF({ section: f.section === key ? '' : key, tab: 'resources' })}
              className={cx('flex flex-col items-center gap-1.5 rounded-xl border bg-card p-4 text-center transition', f.section === key ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-ink-900/8 hover:border-brand-200')}
            >
              <Icon className="size-7 text-brand-600" />
              <span className="text-sm font-semibold text-ink-900">{label(key)}</span>
              <span className="text-xs text-ink-500">{text}</span>
            </button>
          ))}
        </div>

        <Tabs className="mt-8" value={f.tab} onChange={(tab) => setF({ tab })} tabs={[{ value: 'resources', label: 'Articles & resources' }, { value: 'courses', label: <span className="inline-flex items-center gap-1.5"><BookOpenCheck className="size-4" />Courses</span> }]} />

        <div className="mt-6">
          {f.tab === 'courses' ? <Courses /> : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-500">{f.section ? label(f.section) : 'All resources'}{data ? ` · ${data.total} item${data.total === 1 ? '' : 's'}` : ''}</p>
                <Select aria-label="Category" value={f.category} onChange={(e) => setF({ category: e.target.value })} className="h-9 w-52">
                  <option value="">All categories</option>
                  {tax?.categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </Select>
              </div>
              {loading ? <SkeletonGrid /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? (
                <Empty title="No resources found">{user ? 'Try another section or keyword.' : 'Some resources are only visible to signed-in members.'}</Empty>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((k) => <ContentTile key={k._id} item={k} />)}</div>
                  <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
