import { Briefcase, Building2, CalendarDays, Clock, MapPin, Monitor, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { contentHref, formatDate, label, timeAgo } from '../lib/format'
import type { ContentCard, EventItem, Expert } from '../lib/types'
import { AccessBadge, Badge, Card, type Tone } from './ui'
import { cx } from '../lib/cx'

const OPP_TONE: Record<string, Tone> = {
  hiring: 'green', internship: 'purple', consultancy: 'blue', research_collaboration: 'lime',
  technology_transfer: 'amber', training: 'blue', funding: 'amber',
}

export function OpportunityCard({ item }: { item: ContentCard }) {
  const o = item.opportunity ?? {}
  const org = typeof o.organization === 'object' ? o.organization?.name : undefined
  return (
    <Link to={contentHref(item)} className="group block h-full">
      <Card className="flex h-full flex-col p-5 transition group-hover:border-brand-200 group-hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-ink-900 group-hover:text-brand-700">{item.title}</h3>
          <AccessBadge visibility={item.access?.visibility} />
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
          <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" />{o.organizationName || org || 'BIAN'}</span>
          {o.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{o.location}</span>}
        </p>
        <p className="mt-3 line-clamp-2 flex-1 text-sm text-ink-700">{item.summary}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" />
            {timeAgo(item.publishedAt)}
            {o.employmentType && ` · ${o.employmentType}`}
          </span>
          <div className="flex gap-1.5">
            {o.deadline && <Badge tone={new Date(o.deadline) < new Date() ? 'red' : 'gray'}>Apply by {formatDate(o.deadline, { day: 'numeric', month: 'short' })}</Badge>}
            {o.opportunityType && <Badge tone={OPP_TONE[o.opportunityType]}>{label(o.opportunityType)}</Badge>}
          </div>
        </div>
      </Card>
    </Link>
  )
}

export function ContentTile({ item }: { item: ContentCard }) {
  return (
    <Link to={contentHref(item)} className="group block h-full">
      <Card className="flex h-full flex-col overflow-hidden transition group-hover:border-brand-200 group-hover:shadow-md">
        {item.featuredImage ? (
          <img src={item.featuredImage} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
        ) : (
          <div className="hero-bg aspect-[16/9] w-full" aria-hidden />
        )}
        <div className="flex flex-1 flex-col p-5">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Badge tone="green">{label(item.knowledge?.section ?? item.type)}</Badge>
            <AccessBadge visibility={item.access?.visibility} />
          </div>
          <h3 className="font-semibold text-ink-900 group-hover:text-brand-700">{item.title}</h3>
          <p className="mt-1 line-clamp-3 flex-1 text-sm text-ink-500">{item.summary}</p>
          <p className="mt-3 text-xs text-ink-500">
            {item.author?.name && `${item.author.name} · `}
            {formatDate(item.publishedAt)}
            {item.knowledge?.readingMinutes ? ` · ${item.knowledge.readingMinutes} min read` : ''}
          </p>
        </div>
      </Card>
    </Link>
  )
}

export function EventRow({ event, compact }: { event: EventItem; compact?: boolean }) {
  const d = new Date(event.startAt)
  const loc = event.location
  return (
    <Link to={`/events/${event.slug}`} className="group block">
      <Card className="flex items-stretch gap-4 p-3 transition group-hover:border-brand-200 sm:p-4">
        <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-50 py-2 text-brand-700">
          <span className="text-2xl font-bold leading-none">{d.getDate()}</span>
          <span className="text-xs font-medium">{d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink-900 group-hover:text-brand-700">{event.title}</p>
            <AccessBadge visibility={event.access?.visibility} />
          </div>
          {!compact && event.summary && <p className="line-clamp-1 text-sm text-ink-500">{event.summary}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1">{loc?.mode === 'online' ? <Monitor className="size-3.5" /> : <MapPin className="size-3.5" />}{loc?.mode === 'online' ? 'Online' : [loc?.venue, loc?.city].filter(Boolean).join(', ') || label(loc?.mode)}</span>
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
            <Badge tone="blue">{label(event.eventType)}</Badge>
          </p>
        </div>
        {!compact && event.registration?.enabled && <span className="hidden self-center rounded-lg bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 sm:block">Register</span>}
      </Card>
    </Link>
  )
}

const AVATAR_TONES = ['bg-brand-600', 'bg-sky-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600']

export function Avatar({ name, src, className }: { name?: string; src?: string; className?: string }) {
  const initials = (name ?? '?').replace(/^(Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  const tone = AVATAR_TONES[(name ?? '').length % AVATAR_TONES.length]
  return src ? (
    <img src={src} alt="" className={cx('rounded-full object-cover', className)} />
  ) : (
    <span className={cx('grid place-items-center rounded-full font-bold text-white', tone, className)} aria-hidden>{initials || <UserRound className="size-5" />}</span>
  )
}

export function ExpertCard({ expert }: { expert: Expert }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start gap-3">
        <Avatar name={expert.name} src={expert.photoUrl} className="size-14 text-lg" />
        <div className="min-w-0">
          <p className="font-semibold text-ink-900">{expert.name}</p>
          <p className="text-sm text-ink-700">{expert.headline}</p>
          <p className="text-xs text-ink-500">
            {expert.yearsExperience ? `${expert.yearsExperience}+ years` : ''}
            {expert.domain && ` · ${expert.domain}`}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-wrap content-start gap-1.5">
        {expert.skills.slice(0, 4).map((s) => <Badge key={s} tone="green">{s}</Badge>)}
        {expert.mentoringAvailable && <Badge tone="lime"><Briefcase className="size-3" />Mentoring</Badge>}
      </div>
      <Link to={`/experts/${expert._id}`} className="mt-4 block rounded-lg bg-brand-600 py-2 text-center text-sm font-semibold text-white hover:bg-brand-strong">
        View Profile
      </Link>
    </Card>
  )
}
