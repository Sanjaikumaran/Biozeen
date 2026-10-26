import {
  ArrowDown, ArrowUp, Bold, Columns3, Copy, FileDown, Heading, HelpCircle, Image, Images, Italic, Link2, List, ListOrdered,
  Megaphone, MessageSquareHeart, Minus, MousePointerClick, Plus, Quote, Rows3, Table, Trash2, Type, Video, LayoutGrid,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type Paged } from '../../lib/api'
import { label } from '../../lib/format'
import type { Block, BlockType, ContentCard } from '../../lib/types'
import { Badge, Button, Card, Checkbox, IconButton, Input, Select, Textarea } from '../ui'
import { BLOCK_FEATURE } from '../../lib/blockFeatures'
import { useFeatures } from '../../lib/features'
import { cx } from '../../lib/cx'
import type { MediaAsset } from '../../lib/media'
import { MediaPicker } from './MediaPicker'

const PALETTE: { type: BlockType; label: string; icon: typeof Heading; group: string }[] = [
  { type: 'heading', label: 'Heading', icon: Heading, group: 'Text' },
  { type: 'richText', label: 'Rich text', icon: Type, group: 'Text' },
  { type: 'list', label: 'List', icon: List, group: 'Text' },
  { type: 'quote', label: 'Quote', icon: Quote, group: 'Text' },
  { type: 'callout', label: 'Callout', icon: Megaphone, group: 'Text' },
  { type: 'image', label: 'Image', icon: Image, group: 'Media' },
  { type: 'gallery', label: 'Gallery', icon: Images, group: 'Media' },
  { type: 'video', label: 'Video', icon: Video, group: 'Media' },
  { type: 'file', label: 'File download', icon: FileDown, group: 'Media' },
  { type: 'columns', label: 'Columns', icon: Columns3, group: 'Layout' },
  { type: 'cards', label: 'Cards', icon: LayoutGrid, group: 'Layout' },
  { type: 'table', label: 'Table', icon: Table, group: 'Layout' },
  { type: 'faq', label: 'FAQ / accordion', icon: HelpCircle, group: 'Layout' },
  { type: 'divider', label: 'Divider', icon: Minus, group: 'Layout' },
  { type: 'cta', label: 'Call to action', icon: MousePointerClick, group: 'Interactive' },
  { type: 'related', label: 'Related content', icon: Rows3, group: 'Interactive' },
  { type: 'feedback', label: 'Feedback form', icon: MessageSquareHeart, group: 'Interactive' },
]

const DEFAULTS: Record<BlockType, Record<string, unknown>> = {
  heading: { text: '', level: 2 },
  richText: { html: '' },
  list: { ordered: false, items: [''] },
  quote: { text: '', cite: '' },
  callout: { tone: 'info', title: '', text: '' },
  image: { url: '', alt: '', caption: '' },
  gallery: { images: [] },
  video: { url: '', caption: '' },
  file: { mediaId: '', url: '', label: '', description: '' },
  columns: { columns: [{ html: '' }, { html: '' }] },
  cards: { cards: [{ title: '', text: '', link: '' }] },
  table: { headers: ['Column 1', 'Column 2'], rows: [['', '']] },
  faq: { items: [{ q: '', a: '' }] },
  divider: {},
  cta: { title: '', text: '', buttonLabel: 'Learn more', buttonUrl: '' },
  related: { title: 'Related resources', contentIds: [] },
  feedback: { formId: '', title: '' },
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

const RICH_TOOLS: [typeof Bold, string, string, string?][] = [
  [Bold, 'Bold', 'bold'],
  [Italic, 'Italic', 'italic'],
  [List, 'Bulleted list', 'insertUnorderedList'],
  [ListOrdered, 'Numbered list', 'insertOrderedList'],
  [Heading, 'Subheading', 'formatBlock', 'h3'],
  [Type, 'Paragraph', 'formatBlock', 'p'],
  [Link2, 'Link', 'createLink'],
]

/** Minimal WYSIWYG for rich text. Output is sanitised server-side against an allow-list. */
function RichText({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value
  }, [value])
  function run(cmd: string, arg?: string) {
    if (cmd === 'createLink') {
      arg = window.prompt('Link URL (https://…)') ?? undefined
      if (!arg) return
    }
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    onChange(ref.current?.innerHTML ?? '')
  }
  return (
    <div className="rounded-lg border border-ink-300/70 bg-card focus-within:border-brand-500">
      <div className="flex flex-wrap gap-0.5 border-b border-ink-900/8 p-1">
        {RICH_TOOLS.map(([Icon, title, cmd, arg]) => (
          <button key={title} type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => run(cmd, arg)} className="rounded p-1.5 text-ink-700 hover:bg-ink-900/5"><Icon className="size-4" /></button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline
        data-placeholder={placeholder ?? 'Start writing…'}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')) }}
        className="prose-bian min-h-28 px-3 py-2 text-sm outline-none empty:before:text-ink-300 empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  )
}

function MediaField({ value, onChange, kind, labelText }: { value: { url?: string; mediaId?: string }; onChange: (v: { url: string; mediaId: string; name?: string }) => void; kind: 'image' | 'video' | 'document'; labelText: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ink-900">{labelText}</p>
      <div className="flex gap-2">
        <input className="h-10 flex-1 rounded-lg border border-ink-300/70 px-3 text-sm" placeholder="Paste a URL or choose from the library" value={value.url ?? ''} onChange={(e) => onChange({ url: e.target.value, mediaId: '' })} aria-label={`${labelText} URL`} />
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>Library</Button>
      </div>
      {kind === 'image' && value.url && <img src={value.url} alt="" className="max-h-40 rounded-lg" />}
      <MediaPicker open={open} kind={kind === 'document' ? undefined : kind} onClose={() => setOpen(false)} onPick={(m: MediaAsset) => onChange({ url: m.url, mediaId: m._id, name: m.originalName })} />
    </div>
  )
}

function ListEditor<T>({ items, onChange, render, empty, addLabel }: { items: T[]; onChange: (v: T[]) => void; render: (item: T, update: (v: T) => void) => React.ReactNode; empty: T; addLabel: string }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <div className="flex-1">{render(it, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}</div>
          <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))} className="self-start rounded p-2 text-ink-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...items, empty])}><Plus className="size-4" />{addLabel}</Button>
    </div>
  )
}

function RelatedPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ContentCard[]>([])
  const [selected, setSelected] = useState<ContentCard[]>([])
  useEffect(() => {
    if (!ids.length) return
    api.get<Paged<ContentCard>>('/admin/contents', { limit: 100 }).then((r) => setSelected(r.items.filter((i) => ids.includes(i._id)))).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (q.length < 2) return
    const t = setTimeout(() => api.get<Paged<ContentCard>>('/admin/contents', { q, limit: 8 }).then((r) => setResults(r.items)).catch(() => undefined), 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => {
          const s = selected.find((x) => x._id === id)
          return <span key={id} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs text-brand-700">{s?.title ?? id}<button type="button" onClick={() => onChange(ids.filter((x) => x !== id))} aria-label="Remove">×</button></span>
        })}
      </div>
      <input className="h-10 w-full rounded-lg border border-ink-300/70 px-3 text-sm" placeholder="Search content to link…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search content" />
      {q.length >= 2 && results.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-ink-900/10">
          {results.filter((r) => !ids.includes(r._id)).map((r) => (
            <button key={r._id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => { onChange([...ids, r._id]); setSelected([...selected, r]); setQ('') }}>
              {r.title} <span className="text-xs text-ink-500">· {label(r.type)}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-ink-500">Visitors only see related items they are allowed to access.</p>
    </div>
  )
}

function BlockFields({ block, update, forms }: { block: Block; update: (d: Record<string, unknown>) => void; forms: { _id: string; title: string }[] }) {
  const d = block.data
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => update({ ...d, [k]: e.target.value })
  switch (block.type) {
    case 'heading':
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Input aria-label="Heading text" placeholder="Heading text" value={d.text} onChange={set('text')} />
          <Select aria-label="Level" value={d.level} onChange={(e) => update({ ...d, level: Number(e.target.value) })}><option value={2}>Large (H2)</option><option value={3}>Medium (H3)</option><option value={4}>Small (H4)</option></Select>
        </div>
      )
    case 'richText':
      return <RichText value={d.html} onChange={(html) => update({ ...d, html })} />
    case 'list':
      return (
        <div className="space-y-2">
          <Checkbox label="Numbered list" checked={!!d.ordered} onChange={(e) => update({ ...d, ordered: e.target.checked })} />
          <ListEditor items={d.items as string[]} empty="" addLabel="Add item" onChange={(items) => update({ ...d, items })} render={(v, u) => <input className="h-9 w-full rounded-lg border border-ink-300/70 px-3 text-sm" value={v} onChange={(e) => u(e.target.value)} aria-label="List item" />} />
        </div>
      )
    case 'quote':
      return <div className="space-y-2"><Textarea aria-label="Quote" placeholder="Quote" value={d.text} onChange={set('text')} rows={2} /><Input aria-label="Attribution" placeholder="Attribution" value={d.cite} onChange={set('cite')} /></div>
    case 'callout':
      return (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
            <Select aria-label="Tone" value={d.tone} onChange={set('tone')}><option value="info">Information</option><option value="success">Success / tip</option><option value="warning">Warning</option></Select>
            <Input aria-label="Callout title" placeholder="Title" value={d.title} onChange={set('title')} />
          </div>
          <Textarea aria-label="Callout text" placeholder="Text" value={d.text} onChange={set('text')} rows={2} />
        </div>
      )
    case 'image':
      return <div className="space-y-2"><MediaField kind="image" labelText="Image" value={d} onChange={(v) => update({ ...d, url: v.url, mediaId: v.mediaId })} /><div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Alt text" placeholder="Alt text (describe the image)" value={d.alt} onChange={set('alt')} /><Input aria-label="Caption" placeholder="Caption" value={d.caption} onChange={set('caption')} /></div></div>
    case 'gallery':
      return <ListEditor items={d.images as { url: string; mediaId: string; alt: string }[]} empty={{ url: '', mediaId: '', alt: '' }} addLabel="Add image" onChange={(images) => update({ ...d, images })} render={(v, u) => <div className="space-y-2 rounded-lg bg-ink-900/[0.02] p-2"><MediaField kind="image" labelText="Image" value={v} onChange={(m) => u({ ...v, url: m.url, mediaId: m.mediaId })} /><Input aria-label="Alt text" placeholder="Alt text" value={v.alt} onChange={(e) => u({ ...v, alt: e.target.value })} /></div>} />
    case 'video':
      return <div className="space-y-2"><MediaField kind="video" labelText="Video (YouTube, Vimeo or uploaded MP4)" value={d} onChange={(v) => update({ ...d, url: v.url, mediaId: v.mediaId })} /><Input aria-label="Caption" placeholder="Caption" value={d.caption} onChange={set('caption')} /></div>
    case 'file':
      return (
        <div className="space-y-2">
          <MediaField kind="document" labelText="File" value={d} onChange={(v) => update({ ...d, url: v.mediaId ? '' : v.url, mediaId: v.mediaId, label: d.label || v.name || '' })} />
          {d.mediaId && <p className="text-xs text-brand-700">Linked library file — downloads follow this page's access rules.</p>}
          <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Button label" placeholder="Label" value={d.label} onChange={set('label')} /><Input aria-label="Description" placeholder="Description" value={d.description} onChange={set('description')} /></div>
        </div>
      )
    case 'columns':
      return (
        <div className="space-y-2">
          <Select aria-label="Columns" value={(d.columns as unknown[]).length} onChange={(e) => { const n = Number(e.target.value); const cols = [...(d.columns as { html: string }[])]; while (cols.length < n) cols.push({ html: '' }); update({ ...d, columns: cols.slice(0, n) }) }} className="w-40">
            <option value={2}>2 columns</option><option value={3}>3 columns</option>
          </Select>
          <div className={cx('grid gap-3', (d.columns as unknown[]).length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
            {(d.columns as { html: string }[]).map((c, i) => <RichText key={i} value={c.html} onChange={(html) => update({ ...d, columns: (d.columns as { html: string }[]).map((x, j) => (j === i ? { html } : x)) })} />)}
          </div>
        </div>
      )
    case 'cards':
      return <ListEditor items={d.cards as { title: string; text: string; link: string }[]} empty={{ title: '', text: '', link: '' }} addLabel="Add card" onChange={(cards) => update({ ...d, cards })} render={(v, u) => <div className="grid gap-2 rounded-lg bg-ink-900/[0.02] p-2 sm:grid-cols-2"><Input aria-label="Card title" placeholder="Title" value={v.title} onChange={(e) => u({ ...v, title: e.target.value })} /><Input aria-label="Card link" placeholder="Link (optional)" value={v.link} onChange={(e) => u({ ...v, link: e.target.value })} /><Textarea aria-label="Card text" wrapClass="sm:col-span-2" placeholder="Text" rows={2} value={v.text} onChange={(e) => u({ ...v, text: e.target.value })} /></div>} />
    case 'table': {
      const headers = d.headers as string[]
      const rows = d.rows as string[][]
      const cols = headers.length
      return (
        <div className="space-y-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>{headers.map((h, i) => <th key={i} className="p-1"><input aria-label={`Header ${i + 1}`} className="h-9 w-full rounded border border-ink-300/70 bg-brand-50 px-2 font-semibold" value={h} onChange={(e) => update({ ...d, headers: headers.map((x, j) => (j === i ? e.target.value : x)) })} /></th>)}<th /></tr></thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => <td key={ci} className="p-1"><input aria-label={`Row ${ri + 1} column ${ci + 1}`} className="h-9 w-full rounded border border-ink-300/70 px-2" value={c} onChange={(e) => update({ ...d, rows: rows.map((row, i) => (i === ri ? row.map((x, j) => (j === ci ? e.target.value : x)) : row)) })} /></td>)}
                  <td><button type="button" aria-label="Remove row" onClick={() => update({ ...d, rows: rows.filter((_, i) => i !== ri) })} className="p-1 text-ink-500 hover:text-red-600"><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => update({ ...d, rows: [...rows, Array(cols).fill('')] })}><Plus className="size-4" />Row</Button>
            <Button type="button" variant="ghost" size="sm" disabled={cols >= 12} onClick={() => update({ ...d, headers: [...headers, `Column ${cols + 1}`], rows: rows.map((r) => [...r, '']) })}><Plus className="size-4" />Column</Button>
            <Button type="button" variant="ghost" size="sm" disabled={cols <= 1} onClick={() => update({ ...d, headers: headers.slice(0, -1), rows: rows.map((r) => r.slice(0, -1)) })}><Minus className="size-4" />Column</Button>
          </div>
        </div>
      )
    }
    case 'faq':
      return <ListEditor items={d.items as { q: string; a: string }[]} empty={{ q: '', a: '' }} addLabel="Add question" onChange={(items) => update({ ...d, items })} render={(v, u) => <div className="space-y-2 rounded-lg bg-ink-900/[0.02] p-2"><Input aria-label="Question" placeholder="Question" value={v.q} onChange={(e) => u({ ...v, q: e.target.value })} /><Textarea aria-label="Answer" placeholder="Answer" rows={2} value={v.a} onChange={(e) => u({ ...v, a: e.target.value })} /></div>} />
    case 'cta':
      return <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="CTA title" placeholder="Title" value={d.title} onChange={set('title')} /><Input aria-label="CTA text" placeholder="Supporting text" value={d.text} onChange={set('text')} /><Input aria-label="Button label" placeholder="Button label" value={d.buttonLabel} onChange={set('buttonLabel')} /><Input aria-label="Button URL" placeholder="Button URL (https:// or /path)" value={d.buttonUrl} onChange={set('buttonUrl')} /></div>
    case 'related':
      return <div className="space-y-2"><Input aria-label="Section title" placeholder="Section title" value={d.title} onChange={set('title')} /><RelatedPicker ids={d.contentIds as string[]} onChange={(contentIds) => update({ ...d, contentIds })} /></div>
    case 'feedback':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select aria-label="Feedback form" value={d.formId} onChange={set('formId')}><option value="">Choose a form…</option>{forms.map((f) => <option key={f._id} value={f._id}>{f.title}</option>)}</Select>
          <Input aria-label="Heading" placeholder="Heading (optional)" value={d.title} onChange={set('title')} />
        </div>
      )
    case 'divider':
      return <p className="text-xs text-ink-500">A horizontal divider.</p>
  }
}

export function BlockEditor({ blocks, onChange, forms }: { blocks: Block[]; onChange: (b: Block[]) => void; forms: { _id: string; title: string }[] }) {
  const [adding, setAdding] = useState<number | null>(null)
  const on = useFeatures()
  const palette = PALETTE.filter((p) => on(BLOCK_FEATURE[p.type]))
  const insert = (type: BlockType, at: number) => {
    const next = [...blocks]
    next.splice(at, 0, { id: newId(), type, data: structuredClone(DEFAULTS[type]) })
    onChange(next)
    setAdding(null)
  }
  const move = (i: number, dir: -1 | 1) => {
    const next = [...blocks]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    onChange(next)
  }

  const adder = (at: number) =>
    adding === at ? (
      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Add a block</p><button type="button" className="text-sm text-ink-500" onClick={() => setAdding(null)}>Cancel</button></div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {palette.map((p) => (
            <button key={p.type} type="button" onClick={() => insert(p.type, at)} className="flex items-center gap-2 rounded-lg border border-ink-900/8 px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50">
              <p.icon className="size-4 text-brand-600" />{p.label}
            </button>
          ))}
        </div>
      </Card>
    ) : (
      <div className="group flex justify-center py-1">
        <button type="button" onClick={() => setAdding(at)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-300 px-3 py-1 text-xs font-medium text-ink-500 opacity-70 transition hover:border-brand-500 hover:text-brand-700 group-hover:opacity-100">
          <Plus className="size-3.5" /> Add block
        </button>
      </div>
    )

  return (
    <div>
      {blocks.length === 0 && <p className="mb-2 rounded-lg border border-dashed border-ink-300 px-4 py-8 text-center text-sm text-ink-500">This page has no content yet. Add your first block.</p>}
      {adder(0)}
      {blocks.map((b, i) => {
        const meta = PALETTE.find((p) => p.type === b.type)!
        return (
          <div key={b.id}>
            <Card className="p-3">
              <div className="mb-3 flex items-center gap-2">
                <meta.icon className="size-4 text-brand-600" />
                <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-ink-500">{meta.label}{!on(BLOCK_FEATURE[b.type]) && <Badge tone="amber" className="ml-2 normal-case tracking-normal">Hidden: block type switched off</Badge>}</span>
                <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon={ArrowDown} label="Move down" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon={Copy} tone="brand" label="Duplicate" onClick={() => { const next = [...blocks]; next.splice(i + 1, 0, { ...structuredClone(b), id: newId() }); onChange(next) }} />
                <IconButton icon={Trash2} label="Delete block" tone="danger" onClick={() => onChange(blocks.filter((x) => x.id !== b.id))} />
              </div>
              <BlockFields block={b} forms={forms} update={(data) => onChange(blocks.map((x) => (x.id === b.id ? { ...x, data } : x)))} />
            </Card>
            {adder(i + 1)}
          </div>
        )
      })}
    </div>
  )
}
