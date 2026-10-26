import { ArrowLeft, Bookmark, BookmarkCheck, Building2, CalendarClock, ExternalLink, Eye, Mail, MapPin } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BlockRenderer } from '../../components/BlockRenderer'
import { FeedbackWidget } from '../../components/FeedbackWidget'
import { AccessBadge, Alert, Badge, Button, Card, ErrorState, Loading, useFeedback } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatDate, label } from '../../lib/format'
import { useAsync, useDocumentTitle } from '../../lib/hooks'
import type { ContentDetail } from '../../lib/types'

interface Props {
  /** API type segment: a content type or the "knowledge" / "portfolio" groups. */
  type: string
  back: { to: string; label: string }
}

export default function ContentPage({ type, back }: Props) {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const { toast } = useFeedback()
  const { data, error, loading, reload, setData } = useAsync(() => api.get<ContentDetail>(`/contents/by-slug/${type}/${slug}`), [type, slug, user?.id])
  const [saving, setSaving] = useState(false)
  useDocumentTitle(data?.seo?.title || data?.title)

  if (loading) return <Loading />
  if (error || !data)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )

  const o = data.opportunity
  const org = o && typeof o.organization === 'object' ? o.organization : undefined
  const target = { kind: 'content' as const, id: data._id, title: data.title }

  async function toggleSave() {
    setSaving(true)
    try {
      const r = await api.post<{ saved: boolean }>(`/contents/${data!._id}/save`)
      setData({ ...data!, saved: r.saved })
      toast(r.saved ? 'Saved to your dashboard' : 'Removed from saved items')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article>
      <header className="hero-bg text-white">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <Link to={back.to} className="mb-4 inline-flex items-center gap-1 text-sm text-brand-100 hover:text-white">
            <ArrowLeft className="size-4" /> {back.label}
          </Link>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="lime">{label(o?.opportunityType ?? data.knowledge?.section ?? data.type)}</Badge>
            {data.categories?.map((c) => <Badge key={c._id} className="bg-white/10 text-white ring-white/20">{c.name}</Badge>)}
            <AccessBadge visibility={data.access?.visibility} />
          </div>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">{data.title}</h1>
          {data.summary && <p className="mt-3 max-w-3xl text-lg text-brand-100">{data.summary}</p>}
          <p className="mt-4 text-sm text-brand-100/80">
            {data.author?.name && `${data.author.name} · `}
            {formatDate(data.publishedAt)}
            {data.knowledge?.readingMinutes ? ` · ${data.knowledge.readingMinutes} min read` : ''}
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {data.preview && (
            <div className="mb-6">
              <Alert tone="warning" title={`Preview — ${label(data.status)}`}>
                <Eye className="mr-1 inline size-3.5" />
                You can see this because you manage content. It is not visible to members yet.
              </Alert>
            </div>
          )}
          {data.featuredImage && <img src={data.featuredImage} alt="" className="mb-6 w-full rounded-xl" />}
          {o?.eligibility && (
            <section className="mb-6">
              <h2 className="mb-2 text-xl font-semibold">Eligibility</h2>
              <p className="whitespace-pre-line text-ink-700">{o.eligibility}</p>
            </section>
          )}
          <BlockRenderer blocks={data.blocks} target={target} />
          {data.tags && data.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-1.5">
              {data.tags.map((t) => <Badge key={t._id}>#{t.name}</Badge>)}
            </div>
          )}
          {data.feedbackForm && (
            <div className="mt-10">
              <FeedbackWidget form={data.feedbackForm} target={target} />
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {o && (
            <Card className="space-y-3 p-5 text-sm">
              <p className="flex items-center gap-2 font-semibold text-ink-900"><Building2 className="size-4 text-brand-600" />{o.organizationName || org?.name || 'BIAN'}</p>
              {o.location && <p className="flex items-center gap-2"><MapPin className="size-4 text-ink-500" />{o.location}{o.workMode && ` · ${label(o.workMode)}`}</p>}
              {o.employmentType && <p>{o.employmentType}</p>}
              {o.deadline && <p className="flex items-center gap-2"><CalendarClock className="size-4 text-ink-500" />Apply by {formatDate(o.deadline)}</p>}
              {o.applyUrl && (
                <a href={o.applyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-strong">
                  Apply now <ExternalLink className="size-4" />
                </a>
              )}
              {o.applyEmail && <p className="flex items-center gap-2"><Mail className="size-4 text-ink-500" />{o.applyEmail}</p>}
              {org?.slug && <Link to={`/partners/${org.slug}`} className="block text-brand-600 hover:underline">About {org.name}</Link>}
            </Card>
          )}
          {user && (
            <Button variant="outline" className="w-full" onClick={toggleSave} loading={saving}>
              {data.saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
              {data.saved ? 'Saved' : 'Save for later'}
            </Button>
          )}
          <Card className="p-5 text-sm">
            <p className="font-semibold text-ink-900">Questions?</p>
            <p className="mt-1 text-ink-500">The BIAN secretariat can help with introductions and enquiries.</p>
            <Link to="/contact" className="mt-2 inline-block font-semibold text-brand-600 hover:underline">Contact us</Link>
          </Card>
        </aside>
      </div>
    </article>
  )
}
