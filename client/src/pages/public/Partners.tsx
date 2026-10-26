import { ArrowLeft, ArrowRight, BookOpen, Building2, ExternalLink, Factory, GraduationCap, Handshake, Lightbulb, MapPin, Search, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, Empty, ErrorState, Loading, Pagination, Select, SkeletonGrid } from '../../components/ui'
import { PageBanner } from '../../layouts/PublicLayout'
import { api, type Paged } from '../../lib/api'
import { label } from '../../lib/format'
import { useAsync, useDebounced, useDocumentTitle, useQueryState } from '../../lib/hooks'
import type { Organization } from '../../lib/types'

const TIERS = [
  { key: 'founding', title: 'Founding Partners', text: 'Strategic partners supporting the vision and growth.', icon: Handshake },
  { key: 'knowledge', title: 'Knowledge Partners', text: 'Academic & training institutions sharing expertise and learning.', icon: BookOpen },
  { key: 'industry', title: 'Industry Partners', text: 'Biopharma, biotech and life science companies driving industry collaboration.', icon: Factory },
  { key: 'innovation', title: 'Innovation Partners', text: 'Incubators, accelerators and innovation ecosystems for next-gen solutions.', icon: Lightbulb },
]

export default function Partners() {
  useDocumentTitle('Partner Ecosystem')
  const [f, setF] = useQueryState({ tier: '', type: '', q: '', page: '1' })
  const q = useDebounced(f.q)
  const { data, error, loading, reload } = useAsync(
    () => api.get<Paged<Organization> & { tiers: Record<string, number> }>('/partners', { tier: f.tier, type: f.type, q, page: f.page }),
    [f.tier, f.type, q, f.page],
  )

  return (
    <>
      <PageBanner title="Our Partner Ecosystem" subtitle="Together we build a stronger, smarter and more connected biotech ecosystem." icon={<Handshake className="size-6" />} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TIERS.map((t) => (
            <Card key={t.key} className={`flex gap-4 p-5 ${f.tier === t.key ? 'border-brand-500 ring-2 ring-brand-500/20' : ''}`}>
              <t.icon className="size-10 shrink-0 text-brand-600" />
              <div className="flex-1">
                <p className="font-semibold text-ink-900">{t.title} {data?.tiers?.[t.key] !== undefined && <span className="text-ink-500">({data.tiers[t.key]})</span>}</p>
                <p className="mt-1 text-sm text-ink-500">{t.text}</p>
                <button onClick={() => setF({ tier: f.tier === t.key ? '' : t.key })} className="mt-3 inline-flex items-center gap-1 rounded-md border border-brand-200 px-3 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                  {f.tier === t.key ? 'Show all' : 'View Partners'} <ArrowRight className="size-3.5" />
                </button>
              </div>
            </Card>
          ))}
          <Card className="flex gap-4 p-5">
            <Users className="size-10 shrink-0 text-brand-600" />
            <div>
              <p className="font-semibold text-ink-900">BIAN Industry Experts</p>
              <p className="mt-1 text-sm text-ink-500">Seasoned professionals from the industry.</p>
              <Link to="/experts?type=industry_expert" className="mt-3 inline-flex items-center gap-1 rounded-md border border-brand-200 px-3 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50">View Experts <ArrowRight className="size-3.5" /></Link>
            </div>
          </Card>
          <Card className="flex gap-4 p-5">
            <GraduationCap className="size-10 shrink-0 text-brand-600" />
            <div>
              <p className="font-semibold text-ink-900">BIAN Academy / Research Experts</p>
              <p className="mt-1 text-sm text-ink-500">Researchers & academicians from top institutions.</p>
              <Link to="/experts?type=research_expert" className="mt-3 inline-flex items-center gap-1 rounded-md border border-brand-200 px-3 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50">View Experts <ArrowRight className="size-3.5" /></Link>
            </div>
          </Card>
        </div>

        <div className="mt-10 flex flex-wrap items-end gap-3">
          <h2 className="mr-auto text-2xl font-bold">{f.tier ? label(f.tier) : 'All partners'}</h2>
          <label className="relative">
            <span className="sr-only">Search partners</span>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <input value={f.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Search partners…" className="h-10 w-56 rounded-lg border border-ink-300/70 bg-card pl-9 pr-3 text-sm" />
          </label>
          <Select aria-label="Organization type" value={f.type} onChange={(e) => setF({ type: e.target.value })} className="h-10 w-44">
            <option value="">All types</option>
            {['industry', 'academia', 'research', 'startup', 'innovation', 'government'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </Select>
        </div>

        <div className="mt-5">
          {loading ? <SkeletonGrid count={6} className="h-32" /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? (
            <Empty icon={<Building2 className="size-8" />} title="No partners match your filters" />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.items.map((o) => (
                  <Link key={o._id} to={`/partners/${o.slug}`} className="group">
                    <Card className="flex h-full items-start gap-4 p-5 transition group-hover:border-brand-200 group-hover:shadow-md">
                      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-50">
                        {o.logoUrl ? <img src={o.logoUrl} alt="" className="max-h-12 max-w-12 object-contain" /> : <Building2 className="size-6 text-brand-600" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink-900 group-hover:text-brand-700">{o.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {o.partnerTier !== 'none' && <Badge tone="green">{label(o.partnerTier).replace(' Partners', ' partner')}</Badge>}
                          <Badge>{label(o.orgType)}</Badge>
                        </div>
                        {o.location && <p className="mt-2 flex items-center gap-1 text-xs text-ink-500"><MapPin className="size-3" />{o.location}</p>}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
              <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />
            </>
          )}
        </div>
      </div>
    </>
  )
}

export function PartnerDetail() {
  const { slug = '' } = useParams()
  const { data, error, loading, reload } = useAsync(() => api.get<Organization>(`/partners/${slug}`), [slug])
  useDocumentTitle(data?.name)
  if (loading) return <Loading />
  if (error || !data) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorState error={error} onRetry={reload} /></div>
  return (
    <>
      <PageBanner title={data.name} subtitle={`${label(data.orgType)}${data.partnerTier !== 'none' ? ` · ${label(data.partnerTier).replace('Partners', 'Partner')}` : ''}`} />
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_260px]">
        <div>
          <Link to="/partners" className="mb-4 inline-flex items-center gap-1 text-sm text-brand-600"><ArrowLeft className="size-4" />All partners</Link>
          <p className="whitespace-pre-line text-ink-700">{data.description}</p>
          {!!data.collaborationAreas?.length && (
            <section className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">Areas of collaboration</h2>
              <div className="flex flex-wrap gap-2">{data.collaborationAreas.map((a) => <Badge key={a} tone="green">{a}</Badge>)}</div>
            </section>
          )}
          {!!data.initiatives?.length && (
            <section className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">Joint initiatives</h2>
              <div className="space-y-3">
                {data.initiatives.map((i, n) => (
                  <Card key={n} className="p-4">
                    <p className="font-semibold text-ink-900">{i.title}{i.year ? ` (${i.year})` : ''}</p>
                    {i.description && <p className="mt-1 text-sm text-ink-500">{i.description}</p>}
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
        <Card className="h-fit space-y-3 p-5 text-sm">
          {data.logoUrl && <img src={data.logoUrl} alt={data.name} className="max-h-16" />}
          {data.location && <p className="flex items-center gap-2"><MapPin className="size-4 text-ink-500" />{data.location}</p>}
          {data.website && <a href={data.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-brand-600 hover:underline"><ExternalLink className="size-4" />Website</a>}
          <Link to={`/contact?type=partnership&org=${encodeURIComponent(data.name)}`} className="block rounded-lg bg-brand-600 py-2 text-center font-semibold text-white hover:bg-brand-strong">Enquire about collaboration</Link>
        </Card>
      </div>
    </>
  )
}
