import { CalendarDays, GraduationCap, Search as SearchIcon, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AccessBadge, Badge, Button, Card, Empty, ErrorState, Loading } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { contentHref, formatDate, label } from '../../lib/format'
import { useAsync, useDocumentTitle } from '../../lib/hooks'
import type { ContentCard } from '../../lib/types'

interface Results {
  contents: ContentCard[]
  courses: { _id: string; title: string; slug: string; summary: string }[]
  events: { _id: string; title: string; slug: string; summary: string; startAt: string; eventType: string }[]
  experts: { _id: string; name: string; headline: string; expertType: string }[]
}

export default function Search() {
  useDocumentTitle('Search')
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const { data, error, loading, reload } = useAsync(() => (q.trim().length >= 2 ? api.get<Results>('/search', { q }) : Promise.resolve(null)), [q, user?.id])
  const total = data ? data.contents.length + data.courses.length + data.events.length + data.experts.length : 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">Search BIAN</h1>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setParams(draft.trim() ? { q: draft.trim() } : {}) }}>
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Opportunities, resources, events, experts…" className="h-11 w-full rounded-lg border border-ink-300/70 bg-white pl-9 pr-3 text-sm" />
        </label>
        <Button type="submit" size="lg">Search</Button>
      </form>
      <div className="mt-8">
        {!q ? <p className="text-sm text-ink-500">Enter at least two characters.</p> : loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !total ? (
          <Empty title={`No results for “${q}”`}>{!user && 'Signing in may reveal members-only results.'}</Empty>
        ) : (
          <div className="space-y-8">
            {data!.contents.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Pages & resources</h2>
                <Card className="divide-y divide-ink-900/8">
                  {data!.contents.map((c) => (
                    <Link key={c._id} to={contentHref(c)} className="block px-4 py-3 hover:bg-brand-50/50">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink-900">{c.title}</span><Badge>{label(c.type)}</Badge><AccessBadge visibility={c.access?.visibility} /></div>
                      <p className="line-clamp-1 text-sm text-ink-500">{c.summary}</p>
                    </Link>
                  ))}
                </Card>
              </section>
            )}
            {data!.courses.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Courses</h2>
                <Card className="divide-y divide-ink-900/8">
                  {data!.courses.map((c) => <Link key={c._id} to={`/courses/${c.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50/50"><GraduationCap className="size-4 text-brand-600" /><span className="font-medium text-ink-900">{c.title}</span></Link>)}
                </Card>
              </section>
            )}
            {data!.events.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Events</h2>
                <Card className="divide-y divide-ink-900/8">
                  {data!.events.map((e) => <Link key={e._id} to={`/events/${e.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50/50"><CalendarDays className="size-4 text-brand-600" /><span className="flex-1 font-medium text-ink-900">{e.title}</span><span className="text-xs text-ink-500">{formatDate(e.startAt)}</span></Link>)}
                </Card>
              </section>
            )}
            {data!.experts.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Experts</h2>
                <Card className="divide-y divide-ink-900/8">
                  {data!.experts.map((e) => <Link key={e._id} to={`/experts/${e._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50/50"><UserRound className="size-4 text-brand-600" /><span className="font-medium text-ink-900">{e.name}</span><span className="text-sm text-ink-500">{e.headline}</span></Link>)}
                </Card>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-6xl font-bold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-ink-500">The page you are looking for doesn't exist or may have moved.</p>
      <Link to="/" className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white">Back to home</Link>
    </div>
  )
}
