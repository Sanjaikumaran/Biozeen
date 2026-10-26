import { ArrowLeft, Briefcase, Building2, Mail, MapPin, Search, ShieldCheck, UserSearch } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, ExpertCard } from '../../components/Cards'
import { Alert, Badge, Button, Card, Empty, ErrorState, Loading, Modal, Pagination, Select, SkeletonGrid, Tabs, Textarea, useFeedback } from '../../components/ui'
import { ApiError, api, type Paged } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { label } from '../../lib/format'
import { useAsync, useDocumentTitle, useQueryState } from '../../lib/hooks'
import type { Expert } from '../../lib/types'
import { useFeature } from '../../lib/features'

const TYPES = ['industry_expert', 'research_expert', 'trainer', 'consultant', 'mentor'] as const

export default function Experts() {
  useDocumentTitle('Experts Network')
  const { user } = useAuth()
  const [f, setF] = useQueryState({ type: 'industry_expert', q: '', expertise: '', domain: '', location: '', minYears: '', page: '1' })
  const [draft, setDraft] = useState({ q: f.q, expertise: f.expertise, location: f.location })
  const { data, error, loading, reload } = useAsync(
    () => api.get<Paged<Expert> & { domains: string[] }>('/experts', { type: f.type, q: f.q, expertise: f.expertise, domain: f.domain, location: f.location, minYears: f.minYears, page: f.page }),
    [f.type, f.q, f.expertise, f.domain, f.location, f.minYears, f.page, user?.id],
  )
  const apply = () => setF({ q: draft.q, expertise: draft.expertise, location: draft.location })

  return (
    <>
      <section className="hero-bg text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-xl bg-lime-500/20 text-lime-400"><UserSearch className="size-6" /></div>
            <div>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">Connect with Experts</h1>
              <p className="text-brand-100">Access a diverse network of industry and academic experts.</p>
            </div>
          </div>
          <form className="mt-6 flex gap-2 rounded-xl bg-card p-2" onSubmit={(e) => { e.preventDefault(); apply() }}>
            <label className="relative flex-1">
              <span className="sr-only">Search experts</span>
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="Search by name, expertise or keyword…" className="h-11 w-full rounded-lg pl-9 pr-3 text-sm text-ink-900 outline-none" />
            </label>
            <Button type="submit" className="h-11 bg-lime-600 hover:bg-lime-500" aria-label="Search"><Search className="size-4" /></Button>
          </form>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); apply() }}>
          <input aria-label="Expertise" value={draft.expertise} onChange={(e) => setDraft({ ...draft, expertise: e.target.value })} placeholder="Expertise (e.g. GMP)" className="h-10 rounded-lg border border-ink-300/70 bg-card px-3 text-sm" />
          <Select aria-label="Domain" value={f.domain} onChange={(e) => setF({ domain: e.target.value })} className="h-10">
            <option value="">All domains</option>
            {data?.domains.map((d) => <option key={d}>{d}</option>)}
          </Select>
          <input aria-label="Location" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Location" className="h-10 rounded-lg border border-ink-300/70 bg-card px-3 text-sm" />
          <Select aria-label="Experience" value={f.minYears} onChange={(e) => setF({ minYears: e.target.value })} className="h-10">
            <option value="">Any experience</option>
            {[5, 10, 15, 20].map((y) => <option key={y} value={y}>{y}+ years</option>)}
          </Select>
          <Button type="submit">Search</Button>
        </form>

        <Tabs className="mt-6" value={f.type} onChange={(type) => setF({ type })} tabs={TYPES.map((t) => ({ value: t, label: label(t) }))} />
        {!user && <p className="mt-4 text-sm text-ink-500"><Link to="/login?next=/experts" className="font-semibold text-brand-600">Sign in</Link> to see members-only expert profiles and send connect requests.</p>}

        <div className="mt-6">
          {loading ? <SkeletonGrid className="h-56" /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items.length ? (
            <Empty icon={<UserSearch className="size-8" />} title="No experts found">Try another category or broaden your filters.</Empty>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((e) => <ExpertCard key={e._id} expert={e} />)}</div>
              <Pagination page={data.page} pages={data.pages} onChange={(p) => setF({ page: String(p) })} />
            </>
          )}
        </div>
      </div>
    </>
  )
}

export function ExpertDetail() {
  const { id = '' } = useParams()
  const { user, can } = useAuth()
  const connectOn = useFeature('experts.connect')
  const { toast } = useFeedback()
  const { data, error, loading, reload } = useAsync(() => api.get<Expert>(`/experts/${id}`), [id, user?.id])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ purpose: 'mentoring', message: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  useDocumentTitle(data?.name)
  if (loading) return <Loading />
  if (error || !data) return <div className="mx-auto max-w-3xl px-4 py-16"><ErrorState error={error} onRetry={reload} /></div>

  async function send() {
    setSending(true)
    setErrors({})
    try {
      const r = await api.post<{ message: string }>(`/experts/${id}/connect`, form)
      toast(r.message)
      setOpen(false)
      setForm({ purpose: 'mentoring', message: '' })
    } catch (e) {
      if (e instanceof ApiError) setErrors({ ...e.fields, _: e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link to="/experts" className="mb-6 inline-flex items-center gap-1 text-sm text-brand-600"><ArrowLeft className="size-4" />Experts Network</Link>
      <div className="grid gap-8 md:grid-cols-[1fr_280px]">
        <div>
          <div className="flex items-center gap-5">
            <Avatar name={data.name} src={data.photoUrl} className="size-24 text-3xl" />
            <div>
              <h1 className="text-3xl font-bold">{data.name}</h1>
              <p className="text-lg text-ink-700">{data.headline}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="blue">{label(data.expertType).replace(/s$/, '')}</Badge>
                {data.mentoringAvailable && <Badge tone="lime"><Briefcase className="size-3" />Available for mentoring</Badge>}
              </div>
            </div>
          </div>
          {data.bio && <p className="mt-8 whitespace-pre-line text-ink-700">{data.bio}</p>}
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">Skills</h2>
            <div className="flex flex-wrap gap-2">{data.skills.map((s) => <Badge key={s} tone="green">{s}</Badge>)}</div>
          </section>
          {data.expertiseAreas.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 text-lg font-semibold">Areas of expertise</h2>
              <ul className="list-disc space-y-1 pl-5 text-ink-700">{data.expertiseAreas.map((a) => <li key={a}>{a}</li>)}</ul>
            </section>
          )}
        </div>
        <Card className="h-fit space-y-3 p-5 text-sm">
          {data.yearsExperience ? <p><span className="font-semibold text-ink-900">{data.yearsExperience}+ years</span> experience</p> : null}
          {data.domain && <p className="flex items-center gap-2"><ShieldCheck className="size-4 text-ink-500" />{data.domain}</p>}
          {data.location && <p className="flex items-center gap-2"><MapPin className="size-4 text-ink-500" />{data.location}</p>}
          {data.organization && <p className="flex items-center gap-2"><Building2 className="size-4 text-ink-500" />{data.organization.name}</p>}
          {data.email && <p className="flex items-center gap-2"><Mail className="size-4 text-ink-500" /><a href={`mailto:${data.email}`} className="text-brand-600 hover:underline">{data.email}</a></p>}
          {!connectOn ? null : user ? (
            can('experts.contact') ? <Button className="w-full" onClick={() => setOpen(true)}>Request to connect</Button> : <p className="text-ink-500">Your membership does not include expert connect requests.</p>
          ) : (
            <Link to={`/login?next=/experts/${id}`} className="block rounded-lg bg-brand-600 py-2 text-center font-semibold text-white">Sign in to connect</Link>
          )}
          <p className="text-xs text-ink-500">Requests are coordinated by the BIAN secretariat. Contact details are shared only with the expert's consent.</p>
        </Card>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={`Connect with ${data.name}`} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={send} loading={sending}>Send request</Button></>}>
        <div className="space-y-4">
          {errors._ && !errors.message && <Alert tone="error">{errors._}</Alert>}
          <Select label="Purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>
            {['mentoring', 'consultancy', 'collaboration', 'training', 'other'].map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </Select>
          <Textarea label="Message" required value={form.message} error={errors.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Briefly describe what you would like to discuss…" />
        </div>
      </Modal>
    </div>
  )
}
