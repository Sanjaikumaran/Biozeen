import { ArrowRight, BookOpen, Building2, FlaskConical, GraduationCap, Handshake, Lightbulb, Megaphone, Play, Share2, Sparkles, UserSearch, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ContentTile, EventRow, OpportunityCard } from '../../components/Cards'
import { Card, LinkButton, Modal, SkeletonGrid } from '../../components/ui'
import { api } from '../../lib/api'
import { embedUrl } from '../../lib/embed'
import { contentHref, formatDate } from '../../lib/format'
import { useAsync, useDocumentTitle } from '../../lib/hooks'
import type { ContentCard, EventItem, Organization, SiteSettings } from '../../lib/types'

interface HomeData {
  stats: { partners: number; experts: number; institutions: number; opportunities: number; members: number }
  about: { title: string; summary: string } | null
  services: ContentCard[]
  opportunities: ContentCard[]
  knowledge: ContentCard[]
  announcements: ContentCard[]
  events: EventItem[]
  partners: Pick<Organization, '_id' | 'name' | 'slug' | 'logoUrl' | 'partnerTier'>[]
  settings: SiteSettings | null
}

const QUICK = [
  { to: '/opportunities?type=hiring', label: 'Hire Talent', icon: Users },
  { to: '/experts', label: 'Find Experts', icon: UserSearch },
  { to: '/contact?type=collaboration', label: 'Collaborate', icon: Share2 },
  { to: '/knowledge?section=funding_opportunities', label: 'Access Funding', icon: Lightbulb },
  { to: '/knowledge', label: 'Learn & Grow', icon: GraduationCap },
  { to: '/knowledge?section=templates_downloads', label: 'Share Resources', icon: BookOpen },
]

const PILLARS = [
  { icon: Users, label: 'People' },
  { icon: Handshake, label: 'Partnerships' },
  { icon: Lightbulb, label: 'Ideas' },
  { icon: BookOpen, label: 'Knowledge' },
  { icon: Sparkles, label: 'Opportunities' },
  { icon: FlaskConical, label: 'Impact' },
]

function SectionHead({ title, to, cta }: { title: string; to: string; cta: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
        {cta} <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}

export default function Home() {
  useDocumentTitle('Home')
  const { data, loading } = useAsync(() => api.get<HomeData>('/home'), [])
  const [video, setVideo] = useState(false)
  const hero = data?.settings?.hero
  const headline = hero?.headline?.length ? hero.headline : ['One Network.', 'Multiple Opportunities.']
  const stats = data?.stats

  return (
    <>
      <section className="hero-bg relative overflow-hidden text-white">
        <svg className="pointer-events-none absolute -right-20 top-0 hidden h-full w-[46%] opacity-30 md:block" viewBox="0 0 200 400" aria-hidden>
          {Array.from({ length: 16 }, (_, i) => {
            const y = 10 + i * 24
            const x1 = 100 + Math.sin(i / 2) * 60
            const x2 = 100 - Math.sin(i / 2) * 60
            return (
              <g key={i}>
                <line x1={x1} y1={y} x2={x2} y2={y} className="stroke-[var(--brand-l-200)]" strokeWidth="1.2" />
                <circle cx={x1} cy={y} r="4" fill="#8bd346" />
                <circle cx={x2} cy={y} r="4" className="fill-[var(--brand-l-300)]" />
              </g>
            )
          })}
        </svg>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1.5fr_1fr] md:py-24">
          <div>
            <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
              {headline.map((l) => <span key={l} className="block">{l}</span>)}
              <span className="block text-lime-400">{hero?.highlight ?? 'A Stronger Biotech Future.'}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-brand-100">{hero?.subheading ?? 'Connecting Industry, Academia, Innovation and Expertise for a sustainable bioeconomy.'}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to="/register" variant="accent" size="lg">Join BIAN</LinkButton>
              <LinkButton to="/opportunities" variant="outlineLight" size="lg">Explore Opportunities</LinkButton>
              {hero?.videoUrl && (
                <button onClick={() => setVideo(true)} className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/40 px-6 font-semibold hover:bg-white/10">
                  <Play className="size-4 fill-current" /> Watch Video
                </button>
              )}
            </div>
          </div>
          <ul className="hidden flex-col justify-center gap-2 text-2xl font-semibold text-white/90 md:flex">
            {(hero?.keywords ?? ['Innovate', 'Collaborate', 'Develop', 'Transform']).map((k) => <li key={k}>{k}</li>)}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Card className="relative -mt-10 grid grid-cols-2 divide-ink-900/8 sm:grid-cols-5 sm:divide-x">
          {[
            [stats?.partners, 'Partner Organizations'],
            [stats?.experts, 'Experts'],
            [stats?.institutions, 'Research Institutions'],
            [stats?.opportunities, 'Opportunities'],
            [stats?.members, 'Community Members'],
          ].map(([n, l]) => (
            <div key={l as string} className="px-4 py-5 text-center">
              <p className="text-2xl font-bold text-ink-900 tabular-nums">{loading ? '—' : (n as number)?.toLocaleString('en-IN')}</p>
              <p className="text-xs text-ink-500">{l}</p>
            </div>
          ))}
        </Card>

        <nav className="mt-6 grid grid-cols-3 gap-3 md:grid-cols-6" aria-label="Quick actions">
          {QUICK.map(({ to, label, icon: Icon }) => (
            <Link key={label} to={to} className="flex flex-col items-center gap-2 rounded-xl border border-ink-900/8 bg-card px-2 py-5 text-center text-sm font-medium text-ink-900 transition hover:border-brand-200 hover:shadow-sm">
              <Icon className="size-7 text-brand-600" />
              {label}
            </Link>
          ))}
        </nav>

        <section className="mt-16 grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">About BIAN</p>
            <h2 className="mt-2 text-3xl font-bold">Bridging Industry, Academia and Innovation for a Healthier, More Sustainable Tomorrow.</h2>
            <p className="mt-4 text-ink-700">{data?.about?.summary}</p>
            <div className="mt-6 flex gap-3">
              <LinkButton to="/about" variant="primary">About BIAN</LinkButton>
              <LinkButton to="/portfolio" variant="outline">Company portfolio</LinkButton>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {PILLARS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 rounded-xl bg-brand-50 p-4 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-card text-brand-600 shadow-sm"><Icon className="size-6" /></span>
                <span className="text-sm font-medium text-ink-900">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {!!data?.services.length && (
          <section className="mt-16">
            <SectionHead title="What we offer" to="/portfolio" cta="Explore portfolio" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.services.map((s) => (
                <Link key={s._id} to={contentHref(s)} className="rounded-xl border border-ink-900/8 bg-card p-5 transition hover:border-brand-200 hover:shadow-sm">
                  <p className="font-semibold text-ink-900">{s.title}</p>
                  <p className="mt-1 text-sm text-ink-500">{s.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-16">
          <SectionHead title="Latest opportunities" to="/opportunities" cta="View all opportunities" />
          {loading ? <SkeletonGrid count={3} /> : data?.opportunities.length ? (
            <div className="grid gap-4 md:grid-cols-3">{data.opportunities.map((o) => <OpportunityCard key={o._id} item={o} />)}</div>
          ) : <p className="text-sm text-ink-500">New opportunities will appear here once published.</p>}
        </section>

        <section className="mt-16">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="text-2xl font-bold">Our partner ecosystem</h2>
            <Link to="/partners" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">View all partners <ArrowRight className="size-4" /></Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {data?.partners.map((p) => (
              <Link key={p._id} to={`/partners/${p.slug}`} className="flex h-20 items-center justify-center rounded-xl border border-ink-900/8 bg-card px-3 text-center transition hover:border-brand-200">
                {p.logoUrl ? <img src={p.logoUrl} alt={p.name} className="max-h-10 max-w-full object-contain" /> : <span className="inline-flex items-center gap-2 font-semibold text-ink-900"><Building2 className="size-4 text-brand-600" />{p.name}</span>}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHead title="Upcoming events" to="/events" cta="All events" />
            <div className="space-y-3">
              {data?.events.length ? data.events.map((e) => <EventRow key={e._id} event={e} compact />) : <p className="text-sm text-ink-500">No upcoming events right now.</p>}
            </div>
          </div>
          <div>
            <SectionHead title="Announcements" to="/events?tab=announcements" cta="All announcements" />
            <Card className="divide-y divide-ink-900/8">
              {data?.announcements.length ? data.announcements.map((a) => (
                <Link key={a._id} to={contentHref(a)} className="flex items-center gap-3 px-4 py-3.5 hover:bg-brand-50/50">
                  <Megaphone className="size-4 shrink-0 text-brand-600" />
                  <span className="flex-1 text-sm font-medium text-ink-900">{a.title}</span>
                  <span className="shrink-0 text-xs text-ink-500">{formatDate(a.publishedAt, { day: 'numeric', month: 'short' })}</span>
                </Link>
              )) : <p className="p-4 text-sm text-ink-500">No announcements yet.</p>}
            </Card>
          </div>
        </section>

        {!!data?.knowledge.length && (
          <section className="mt-16">
            <SectionHead title="From the Knowledge Hub" to="/knowledge" cta="Explore resources" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{data.knowledge.map((k) => <ContentTile key={k._id} item={k} />)}</div>
          </section>
        )}

        <section className="hero-bg mt-16 flex flex-col items-start gap-6 rounded-2xl px-6 py-10 text-white sm:px-10 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Have a requirement or a collaboration idea?</h2>
            <p className="mt-1 text-brand-100">The BIAN secretariat connects you with the right partners, experts and institutions.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <LinkButton to="/contact" variant="accent">Get in touch</LinkButton>
            <LinkButton to="/register" variant="outlineLight">Become a member</LinkButton>
          </div>
        </section>
      </div>

      <Modal open={video} onClose={() => setVideo(false)} title="About BIAN" size="xl">
        {hero?.videoUrl && (
          <div className="aspect-video">
            {embedUrl(hero.videoUrl) ? <iframe src={embedUrl(hero.videoUrl)!} title="BIAN video" className="size-full rounded-lg" allow="encrypted-media; fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation" /> : <video src={hero.videoUrl} controls className="size-full rounded-lg" />}
          </div>
        )}
      </Modal>
    </>
  )
}
