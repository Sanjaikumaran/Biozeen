import { AlertTriangle, CheckCircle2, ChevronDown, Download, FileText, Info, Quote } from 'lucide-react'
import { Link } from 'react-router-dom'
import { embedUrl } from '../lib/embed'
import { contentHref, formatBytes } from '../lib/format'
import type { Block, ContentCard } from '../lib/types'
import { FeedbackWidget, type FeedbackTarget } from './FeedbackWidget'
import { cx } from '../lib/cx'

function Video({ url, caption }: { url: string; caption?: string }) {
  if (!url) return null
  const embed = embedUrl(url)
  return (
    <figure className="my-6">
      <div className="aspect-video max-w-full overflow-hidden rounded-xl bg-black">
        {embed ? (
          <iframe src={embed} title={caption || 'Embedded video'} className="size-full" allow="encrypted-media; picture-in-picture; fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        ) : /\.(mp4|webm)$|\/api\/media\//.test(url) ? (
          <video src={url} controls className="size-full" preload="metadata" />
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" className="grid size-full place-items-center text-sm text-white underline">Watch video</a>
        )}
      </div>
      {caption && <figcaption className="mt-2 text-center text-sm text-ink-500">{caption}</figcaption>}
    </figure>
  )
}

function RelatedCard({ item }: { item: ContentCard }) {
  return (
    <Link to={contentHref(item)} className="block rounded-xl border border-ink-900/8 bg-card p-4 transition hover:border-brand-200 hover:shadow-sm">
      <p className="font-semibold text-ink-900">{item.title}</p>
      <p className="mt-1 line-clamp-2 text-sm text-ink-500">{item.summary}</p>
    </Link>
  )
}

export function BlockRenderer({ blocks, target }: { blocks: Block[]; target?: FeedbackTarget }) {
  return (
    <div className="prose-bian">
      {blocks.map((b) => {
        const d = b.data
        switch (b.type) {
          case 'heading': {
            const Tag = (`h${d.level ?? 2}`) as 'h2' | 'h3' | 'h4'
            return <Tag key={b.id}>{d.text}</Tag>
          }
          case 'richText':
            // HTML is sanitised server-side against a strict allow-list before storage.
            return <div key={b.id} dangerouslySetInnerHTML={{ __html: d.html ?? '' }} />
          case 'image':
            return d.url ? (
              <figure key={b.id} className="my-6">
                <img src={d.url} alt={d.alt ?? ''} className="w-full rounded-xl" loading="lazy" />
                {d.caption && <figcaption className="mt-2 text-center text-sm text-ink-500">{d.caption}</figcaption>}
              </figure>
            ) : null
          case 'gallery':
            return (
              <div key={b.id} className="my-6 grid grid-cols-2 gap-3 md:grid-cols-3">
                {(d.images ?? []).filter((i: { url: string }) => i.url).map((i: { url: string; alt?: string }, n: number) => (
                  <img key={n} src={i.url} alt={i.alt ?? ''} className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
                ))}
              </div>
            )
          case 'video':
            return <Video key={b.id} url={d.url} caption={d.caption} />
          case 'file': {
            const href = d.file?.url ?? d.url
            if (!href) return null
            return (
              <a key={b.id} href={href} target="_blank" rel="noopener noreferrer" className="not-prose my-4 flex items-center gap-4 rounded-xl border border-ink-900/10 bg-card p-4 no-underline hover:border-brand-200">
                <div className="grid size-11 place-items-center rounded-lg bg-brand-50 text-brand-600"><FileText className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{d.label || d.file?.name || 'Download'}</p>
                  <p className="text-xs text-ink-500">{d.description || (d.file ? `${d.file.name} · ${formatBytes(d.file.size)}` : 'External file')}</p>
                </div>
                <Download className="size-5 text-brand-600" />
              </a>
            )
          }
          case 'columns':
            return (
              <div key={b.id} className={cx('my-6 grid gap-6', (d.columns?.length ?? 1) > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
                {(d.columns ?? []).map((c: { html: string }, i: number) => <div key={i} dangerouslySetInnerHTML={{ __html: c.html }} />)}
              </div>
            )
          case 'cards':
            return (
              <div key={b.id} className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(d.cards ?? []).map((c: { title: string; text: string; link?: string; image?: string }, i: number) => {
                  const inner = (
                    <>
                      {c.image && <img src={c.image} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" />}
                      <p className="font-semibold text-ink-900">{c.title}</p>
                      <p className="mt-1 text-sm text-ink-500">{c.text}</p>
                    </>
                  )
                  const cls = 'block rounded-xl border border-ink-900/8 bg-card p-5 no-underline'
                  return c.link ? <a key={i} href={c.link} className={cx(cls, 'hover:border-brand-200')}>{inner}</a> : <div key={i} className={cls}>{inner}</div>
                })}
              </div>
            )
          case 'list': {
            const L = d.ordered ? 'ol' : 'ul'
            return <L key={b.id}>{(d.items ?? []).map((t: string, i: number) => <li key={i}>{t}</li>)}</L>
          }
          case 'table':
            return (
              <div key={b.id} className="my-6 overflow-x-auto rounded-xl border border-ink-900/10">
                <table className="w-full text-left text-sm">
                  {d.headers?.length > 0 && (
                    <thead className="bg-brand-50 text-ink-900">
                      <tr>{d.headers.map((h: string, i: number) => <th key={i} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
                    </thead>
                  )}
                  <tbody>
                    {(d.rows ?? []).map((r: string[], i: number) => (
                      <tr key={i} className="border-t border-ink-900/8">{r.map((c, j) => <td key={j} className="px-4 py-2.5">{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'faq':
            return (
              <div key={b.id} className="my-6 divide-y divide-ink-900/8 rounded-xl border border-ink-900/10 bg-card">
                {(d.items ?? []).map((f: { q: string; a: string }, i: number) => (
                  <details key={i} className="group px-5 py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-ink-900">
                      {f.q}
                      <ChevronDown className="size-4 transition group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 text-sm whitespace-pre-line">{f.a}</p>
                  </details>
                ))}
              </div>
            )
          case 'callout': {
            const tone = { info: ['border-sky-200 bg-sky-50', Info, 'text-sky-600'], success: ['border-brand-200 bg-brand-50', CheckCircle2, 'text-brand-600'], warning: ['border-amber-200 bg-amber-50', AlertTriangle, 'text-amber-600'] }[d.tone as 'info'] ?? ['', Info, '']
            const Icon = tone[1] as typeof Info
            return (
              <div key={b.id} className={cx('my-6 flex gap-3 rounded-xl border p-4', tone[0] as string)}>
                <Icon className={cx('mt-0.5 size-5 shrink-0', tone[2] as string)} />
                <div>
                  {d.title && <p className="font-semibold text-ink-900">{d.title}</p>}
                  <p className="text-sm whitespace-pre-line">{d.text}</p>
                </div>
              </div>
            )
          }
          case 'cta':
            return (
              <div key={b.id} className="hero-bg my-8 flex flex-col items-start gap-4 rounded-2xl p-6 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xl font-bold text-white">{d.title}</p>
                  {d.text && <p className="mt-1 text-sm text-brand-100">{d.text}</p>}
                </div>
                {d.buttonUrl && (
                  <a href={d.buttonUrl} target={d.buttonUrl.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer" className="shrink-0 rounded-lg bg-lime-500 px-5 py-2.5 text-sm font-semibold text-brand-900 no-underline hover:bg-lime-400">
                    {d.buttonLabel || 'Learn more'}
                  </a>
                )}
              </div>
            )
          case 'quote':
            return (
              <blockquote key={b.id} className="not-italic">
                <Quote className="mb-2 size-5 text-brand-300" />
                <p className="text-lg text-ink-900">{d.text}</p>
                {d.cite && <footer className="mt-1 text-sm text-ink-500">— {d.cite}</footer>}
              </blockquote>
            )
          case 'divider':
            return <hr key={b.id} className="my-8 border-ink-900/10" />
          case 'related':
            return d.items?.length ? (
              <section key={b.id} className="my-8">
                <h3>{d.title || 'Related resources'}</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {d.items.map((it: ContentCard) => <RelatedCard key={it._id} item={it} />)}
                </div>
              </section>
            ) : null
          case 'feedback':
            return d.form && target ? (
              <div key={b.id} className="not-prose my-8">
                <FeedbackWidget form={d.form} target={target} heading={d.title} />
              </div>
            ) : null
          default:
            return null
        }
      })}
    </div>
  )
}
