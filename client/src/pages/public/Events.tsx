import { ArrowLeft, CalendarDays, CalendarX2, ExternalLink, MapPin, Megaphone, Monitor, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BlockRenderer } from '../../components/BlockRenderer'
import { EventRow } from '../../components/Cards'
import { FeedbackWidget } from '../../components/FeedbackWidget'
import { AccessBadge, Alert, Badge, Button, Card, Empty, ErrorState, Loading, Pagination, SkeletonGrid, Tabs, useFeedback } from '../../components/ui'
import { PageBanner } from '../../layouts/PublicLayout'
import { api, type Paged } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { contentHref, formatDate, formatDateTime, label, timeAgo } from '../../lib/format'
import { useAsync, useDocumentTitle, useQueryState } from '../../lib/hooks'
import type { Block, ContentCard, EventItem, PublicForm } from '../../lib/types'
import { useFeature } from '../../lib/features'

const TABS = [
  { value: 'upcoming', label: 'Upcoming Events' },
  { value: 'webinar', label: 'Webinars' },
  { value: 'conference', label: 'Conferences' },
  { value: 'workshop', label: 'Workshops' },
  { value: 'industry_visit', label: 'Industry Visits' },
  { value: 'past', label: 'Past events' },
  { value: 'announcements', label: 'Announcements' },
]

function Announcements({ page, onPage }: { page: string; onPage: (p: number) => void }) {
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<ContentCard>>('/contents', { type: 'announcement', page, limit: 15 }), [page, user?.id])
  if (loading) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data?.items.length) return <Empty icon={<Megaphone className="size-8" />} title="No announcements yet" />
  return (
    <>
      <Card className="divide-y divide-ink-900/8">
        {data.items.map((a) => (
          <Link key={a._id} to={contentHref(a)} className="flex items-center gap-3 px-4 py-4 hover:bg-brand-50/50">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><Megaphone className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink-900">{a.title}</span>
              <span className="block truncate text-sm text-ink-500">{a.summary}</span>
            </span>
            <AccessBadge visibility={a.access?.visibility} />
            <span className="shrink-0 text-xs text-ink-500">{timeAgo(a.publishedAt)}</span>
          </Link>
        ))}
      </Card>
      <Pagination page={data.page} pages={data.pages} onChange={onPage} />
    </>
  )
}

export default function Events() {
  useDocumentTitle('Events & Announcements')
  const { user } = useAuth()
  const calendarOn = useFeature('events.calendar')
  const announcementsOn = useFeature('events.announcements')
  const [query, setF] = useQueryState({ tab: 'upcoming', page: '1' })
  // Fall back to whichever half of the screen is switched on.
  const tab = !calendarOn ? 'announcements' : query.tab === 'announcements' && !announcementsOn ? 'upcoming' : query.tab
  const f = { ...query, tab }
  const tabs = TABS.filter((t) => (t.value === 'announcements' ? announcementsOn : calendarOn))
  const isType = !['upcoming', 'past', 'announcements'].includes(f.tab)
  const { data, error, loading, reload } = useAsync(
    () => (f.tab === 'announcements' ? Promise.resolve(null) : api.get<Paged<EventItem>>('/events', { when: f.tab === 'past' ? 'past' : 'upcoming', type: isType ? f.tab : undefined, page: f.page })),
    [f.tab, f.page, user?.id],
  )
  return (
    <>
      <PageBanner title="Events & Announcements" subtitle="Stay updated with the latest events, webinars and ecosystem news." icon={<CalendarDays className="size-6" />} />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Tabs value={f.tab} onChange={(tab) => setF({ tab })} tabs={tabs} />
        <div className="mt-6">
          {f.tab === 'announcements' ? <Announcements page={f.page} onPage={(p) => setF({ page: String(p) })} /> : loading ? <SkeletonGrid count={3} className="h-24" /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? (
            <Empty icon={<CalendarX2 className="size-8" />} title={f.tab === 'past' ? 'No past events' : 'No upcoming events'}>{!user && 'Some events are only visible to signed-in members.'}</Empty>
          ) : (
            <>
              <div className="space-y-3">{data.items.map((e) => <EventRow key={e._id} event={e} />)}</div>
              <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />
            </>
          )}
        </div>
      </div>
    </>
  )
}

interface EventDetailData extends EventItem {
  blocks: Block[]
  registered: boolean
  registeredCount: number
  feedbackForm: PublicForm | null
  preview: boolean
}

export function EventDetail() {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const registrationOn = useFeature('events.registration')
  const navigate = useNavigate()
  const { toast, confirm } = useFeedback()
  const { data, error, loading, reload } = useAsync(() => api.get<EventDetailData>(`/events/${slug}`), [slug, user?.id])
  const [busy, setBusy] = useState(false)
  useDocumentTitle(data?.title)
  if (loading) return <Loading />
  if (error || !data) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorState error={error} onRetry={reload} /></div>

  const reg = data.registration
  const started = new Date(data.startAt) < new Date()
  const ended = new Date(data.endAt ?? data.startAt) < new Date()
  const full = !!reg?.capacity && data.registeredCount >= reg.capacity
  const closed = !!reg?.deadline && new Date(reg.deadline) < new Date()

  async function register() {
    if (!user) return navigate(`/login?next=/events/${slug}`)
    if (data!.registered && !(await confirm({ title: 'Cancel registration?', message: `You will no longer be registered for ${data!.title}.`, confirmLabel: 'Cancel registration', danger: true }))) return
    setBusy(true)
    try {
      if (data!.registered) await api.del(`/events/${data!._id}/register`)
      else await api.post(`/events/${data!._id}/register`)
      toast(data!.registered ? 'Registration cancelled' : 'You are registered')
      reload()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const loc = data.location
  return (
    <>
      <PageBanner title={data.title} subtitle={data.summary} />
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Link to="/events" className="mb-4 inline-flex items-center gap-1 text-sm text-brand-600"><ArrowLeft className="size-4" />All events</Link>
          {data.preview && <div className="mb-4"><Alert tone="warning" title={`Preview — ${label(data.status)}`}>Not yet visible to members.</Alert></div>}
          {data.featuredImage && <img src={data.featuredImage} alt="" className="mb-6 w-full rounded-xl" />}
          <BlockRenderer blocks={data.blocks} target={{ kind: 'event', id: data._id, title: data.title }} />
          {data.feedbackForm && started && <div className="mt-10"><FeedbackWidget form={data.feedbackForm} target={{ kind: 'event', id: data._id, title: data.title }} /></div>}
        </div>
        <Card className="h-fit space-y-3 p-5 text-sm">
          <div className="flex flex-wrap gap-1.5"><Badge tone="blue">{label(data.eventType)}</Badge><AccessBadge visibility={data.access?.visibility} /></div>
          <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 text-ink-500" /><span>{formatDateTime(data.startAt)}{data.endAt && <><br />to {formatDateTime(data.endAt)}</>}</span></p>
          <p className="flex items-start gap-2">{loc?.mode === 'online' ? <Monitor className="mt-0.5 size-4 text-ink-500" /> : <MapPin className="mt-0.5 size-4 text-ink-500" />}<span>{label(loc?.mode)}{[loc?.venue, loc?.city].filter(Boolean).length ? ` · ${[loc?.venue, loc?.city].filter(Boolean).join(', ')}` : ''}</span></p>
          {loc?.meetingUrl && <a href={loc.meetingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-semibold text-brand-600 hover:underline"><ExternalLink className="size-4" />Join online</a>}
          {reg?.capacity ? <p className="flex items-center gap-2"><Users className="size-4 text-ink-500" />{data.registeredCount} / {reg.capacity} registered</p> : null}
          {reg?.deadline && <p className="text-ink-500">Registration closes {formatDate(reg.deadline)}</p>}
          {reg?.externalUrl ? (
            <a href={reg.externalUrl} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-brand-600 py-2.5 text-center font-semibold text-white">Register externally</a>
          ) : reg?.enabled && !ended && registrationOn ? (
            data.registered ? (
              <>
                <Alert tone="success">You are registered.</Alert>
                {!started && <Button variant="ghost" className="w-full" onClick={register} loading={busy}>Cancel registration</Button>}
              </>
            ) : started ? <p className="text-ink-500">This event has started.</p> : full ? <p className="font-semibold text-red-700">Fully booked</p> : closed ? <p className="text-ink-500">Registration has closed.</p> : (
              <Button className="w-full" onClick={register} loading={busy}>{user ? 'Register' : 'Sign in to register'}</Button>
            )
          ) : null}
        </Card>
      </div>
    </>
  )
}
