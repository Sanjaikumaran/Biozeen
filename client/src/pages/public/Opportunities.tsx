import { Banknote, Briefcase, FlaskConical, GraduationCap, Handshake, Repeat, Search, UserCog } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OpportunityCard } from '../../components/Cards'
import { Button, Empty, ErrorState, Pagination, Select, SkeletonGrid } from '../../components/ui'
import { cx } from '../../lib/cx'
import { api, type Paged } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useFeature } from '../../lib/features'
import { label } from '../../lib/format'
import { useAsync, useDocumentTitle, useQueryState } from '../../lib/hooks'
import type { ContentCard, Ref } from '../../lib/types'

const TYPES = [
  { key: 'hiring', icon: Briefcase },
  { key: 'internship', icon: GraduationCap },
  { key: 'consultancy', icon: UserCog },
  { key: 'research_collaboration', icon: FlaskConical },
  { key: 'technology_transfer', icon: Repeat },
  { key: 'training', icon: Handshake },
  { key: 'funding', icon: Banknote },
]

export default function Opportunities() {
  useDocumentTitle('Opportunities Hub')
  const { user, can } = useAuth()
  const postOn = useFeature('opportunities.post')
  const navigate = useNavigate()
  const [f, setF] = useQueryState({ q: '', type: '', category: '', location: '', sort: 'latest', page: '1' })
  const [draft, setDraft] = useState({ q: f.q, location: f.location })
  const { data: tax } = useAsync(() => api.get<{ categories: Ref[] }>('/contents/taxonomy'), [])
  const { data, error, loading, reload } = useAsync(
    () => api.get<Paged<ContentCard>>('/contents', { type: 'opportunity', q: f.q, opportunityType: f.type, category: f.category, location: f.location, sort: f.sort, page: f.page, limit: 12 }),
    [f.q, f.type, f.category, f.location, f.sort, f.page, user?.id],
  )

  return (
    <>
      <section className="hero-bg text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">Opportunities Hub</h1>
              <p className="mt-1 text-brand-100">Discover. Collaborate. Create Impact.</p>
            </div>
            {/* Posting is a member action: hidden when signed out, without the permission, or switched off. */}
            {user && can('opportunities.post') && postOn && (
              <Button variant="accent" size="lg" onClick={() => navigate('/dashboard/post-opportunity')}>
                Post a Requirement
              </Button>
            )}
          </div>
          <form
            className="mt-6 grid gap-2 rounded-xl bg-card p-2 sm:grid-cols-[1fr_200px_200px_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              setF({ q: draft.q, location: draft.location })
            }}
          >
            <label className="relative">
              <span className="sr-only">Keyword</span>
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="Search opportunities by keyword…" className="h-11 w-full rounded-lg pl-9 pr-3 text-sm text-ink-900 outline-none" />
            </label>
            <select aria-label="Category" value={f.category} onChange={(e) => setF({ category: e.target.value })} className="h-11 rounded-lg border border-ink-300/50 bg-card pl-3 pr-9 text-sm text-ink-900">
              <option value="">All Categories</option>
              {tax?.categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <input aria-label="Location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="All Locations" className="h-11 rounded-lg border border-ink-300/50 px-3 text-sm text-ink-900" />
            <Button type="submit" variant="primary" className="h-11 bg-lime-600 hover:bg-lime-500">Search</Button>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7" role="group" aria-label="Opportunity type">
          {TYPES.map(({ key, icon: Icon }) => (
            <button
              key={key}
              aria-pressed={f.type === key}
              onClick={() => setF({ type: f.type === key ? '' : key })}
              className={cx('flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition', f.type === key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-900/8 bg-card text-ink-700 hover:border-brand-200')}
            >
              <Icon className="size-5 text-brand-600" />
              {label(key)}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-500">{data ? `${data.total} opportunit${data.total === 1 ? 'y' : 'ies'}` : ''}{!user && ' · Sign in to see member-only listings'}</p>
          <Select aria-label="Sort" value={f.sort} onChange={(e) => setF({ sort: e.target.value })} className="h-9 w-48">
            <option value="latest">Newest first</option>
            <option value="deadline">Deadline soonest</option>
            <option value="title">Title A–Z</option>
          </Select>
        </div>

        <div className="mt-4">
          {loading ? <SkeletonGrid /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? (
            <Empty icon={<Briefcase className="size-8" />} title="No opportunities found" action={<Button variant="outline" onClick={() => { setDraft({ q: '', location: '' }); setF({ q: '', type: '', category: '', location: '' }) }}>Clear filters</Button>}>
              Try a different keyword or category.
            </Empty>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((o) => <OpportunityCard key={o._id} item={o} />)}</div>
              <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
