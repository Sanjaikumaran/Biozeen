import { ArrowRight, Briefcase, Layers, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BlockRenderer } from '../../components/BlockRenderer'
import { Card, Empty, ErrorState, LinkButton, Loading } from '../../components/ui'
import { PageBanner } from '../../layouts/PublicLayout'
import { api, type Paged } from '../../lib/api'
import { contentHref, label } from '../../lib/format'
import { useAuth } from '../../lib/auth'
import { useAsync, useDocumentTitle } from '../../lib/hooks'
import type { ContentCard, ContentDetail } from '../../lib/types'

/** About BIAN — rendered from the CMS "about" portfolio page. */
export function About() {
  useDocumentTitle('About BIAN')
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(() => api.get<ContentDetail>('/contents/by-slug/page/about'), [user?.id])
  return (
    <>
      <PageBanner title={data?.title ?? 'About BIAN'} subtitle={data?.summary} />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data && <BlockRenderer blocks={data.blocks} target={{ kind: 'content', id: data._id, title: data.title }} />}
        <div className="mt-10 flex flex-wrap gap-3">
          <LinkButton to="/portfolio">Explore our portfolio <ArrowRight className="size-4" /></LinkButton>
          <LinkButton to="/contact" variant="outline"><Mail className="size-4" /> Contact the secretariat</LinkButton>
        </div>
      </div>
    </>
  )
}

const GROUPS = [
  { type: 'service', title: 'Services & capabilities', icon: Layers },
  { type: 'project', title: 'Projects & initiatives', icon: Briefcase },
  { type: 'case_study', title: 'Case studies', icon: Briefcase },
  { type: 'page', title: 'More about BIAN', icon: Layers },
]

export function Portfolio() {
  useDocumentTitle('Company Portfolio')
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(() => api.get<Paged<ContentCard>>('/contents', { type: 'portfolio', limit: 100, sort: 'order' }), [user?.id])
  const items = data?.items ?? []
  return (
    <>
      <PageBanner title="Company Portfolio" subtitle="Who we are, what we offer, and the work of the BIAN network." />
      <div className="mx-auto max-w-7xl space-y-12 px-4 py-10 sm:px-6">
        {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : items.length === 0 ? (
          <Empty title="Portfolio content is on its way">BIAN administrators will publish services, projects and case studies here.</Empty>
        ) : (
          GROUPS.map((g) => {
            const list = items.filter((i) => i.type === g.type && !(g.type === 'page' && i.slug === 'about'))
            if (!list.length) return null
            return (
              <section key={g.type}>
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold"><g.icon className="size-6 text-brand-600" />{g.title}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((i) => (
                    <Link key={i._id} to={contentHref(i)} className="group">
                      <Card className="h-full overflow-hidden transition group-hover:border-brand-200 group-hover:shadow-md">
                        {i.featuredImage && <img src={i.featuredImage} alt="" className="aspect-video w-full object-cover" />}
                        <div className="p-5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{label(i.type)}{i.portfolio?.year ? ` · ${i.portfolio.year}` : ''}</p>
                          <p className="mt-1 font-semibold text-ink-900 group-hover:text-brand-700">{i.title}</p>
                          <p className="mt-1 text-sm text-ink-500">{i.summary}</p>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })
        )}
      </div>
    </>
  )
}
