import {
  ArrowRight, Bell, Bookmark, BookOpen, Briefcase, CalendarDays, CheckCircle2, ClipboardList, GraduationCap, LayoutDashboard,
  MessageSquare, MessagesSquare, PlusCircle, Search, Settings, ShieldCheck, Star, UserRound, UserSearch, Users,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ContentTile, EventRow, OpportunityCard } from '../../components/Cards'
import { Alert, Badge, Button, Card, Checkbox, Empty, ErrorState, Input, LinkButton, Loading, PageHeader, RowActions, Select, StatTile, StatusBadge, TagInput, Textarea, useFeedback } from '../../components/ui'
import { WorkspaceLayout, type NavItem } from '../../layouts/WorkspaceLayout'
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useFeature, useFeatures } from '../../lib/features'
import { contentHref, formatDate, label, timeAgo } from '../../lib/format'
import { useAsync, useDocumentTitle } from '../../lib/hooks'
import type { ContentCard, Enrollment, EventItem, Expert, Organization } from '../../lib/types'
import { AccessEditor, MemberAudienceProvider } from '../../components/admin/Publishing'
import Appearance from '../Appearance'

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/dashboard/profile', label: 'Profile', icon: UserRound },
  { to: '/dashboard/post-opportunity', label: 'Post Opportunity', icon: PlusCircle, permission: 'opportunities.post', feature: 'opportunities.post' },
  { to: '/dashboard/opportunities', label: 'My Opportunities', icon: Briefcase, permission: 'opportunities.post', feature: 'opportunities.post' },
  { to: '/experts', label: 'Expert Search', icon: UserSearch, feature: 'experts' },
  { to: '/partners?type=academia', label: 'Academia Connect', icon: GraduationCap, feature: 'partners' },
  { to: '/partners?tier=innovation', label: 'Innovation Connect', icon: Users, feature: 'partners' },
  { to: '/dashboard/learning', label: 'My Learning', icon: BookOpen, feature: 'dashboard.learning' },
  { to: '/dashboard/saved', label: 'Saved', icon: Bookmark, feature: 'saved' },
  { to: '/dashboard/events', label: 'My Events', icon: CalendarDays, feature: 'dashboard.events' },
  { to: '/dashboard/requests', label: 'Requests & Messages', icon: MessagesSquare, feature: 'dashboard.requests' },
  { to: '/dashboard/feedback', label: 'My Feedback', icon: Star, feature: 'dashboard.feedback' },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function MemberLayout() {
  return <WorkspaceLayout title="Member Portal" items={NAV} requireFeature="dashboard" />
}

interface DashboardData {
  counts: { activePosts: number; pendingPosts: number; saved: number; enrollments: number; upcomingEvents: number; openRequests: number; feedback: number }
  saved: ContentCard[]
  enrollments: Enrollment[]
  registrations: { _id: string; event: EventItem }[]
  opportunities: ContentCard[]
  knowledge: ContentCard[]
  announcements: ContentCard[]
  events: EventItem[]
  expertProfile: { status: string; headline: string } | null
  recentRequests: { _id: string; type: string; subject?: string; status: string; response?: string; updatedAt: string }[]
  notifications: { kind: string; text: string; at: string }[]
}

export function Dashboard() {
  useDocumentTitle('Dashboard')
  const { user, can } = useAuth()
  const { data, error, loading, reload } = useAsync(() => api.get<DashboardData>('/me/dashboard'), [])
  const on = useFeatures()
  if (loading) return <Loading />
  if (error || !data) return <ErrorState error={error} onRetry={reload} />
  const c = data.counts
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {user?.name}!</h1>
          <p className="text-sm text-ink-500">Here's what's happening in your network.</p>
        </div>
        <Card className="flex items-center gap-3 px-4 py-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-navy text-white"><UserRound className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold text-ink-900">{user?.organization?.name ?? user?.name}</p>
            <p className="text-xs text-ink-500">{label(user?.category)} member</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {can('opportunities.post') && on('opportunities.post') && <StatTile icon={<Briefcase className="size-5" />} value={c.activePosts} label={`Active posts${c.pendingPosts ? ` · ${c.pendingPosts} in review` : ''}`} />}
        {on('dashboard.learning') && <StatTile icon={<GraduationCap className="size-5" />} value={c.enrollments} label="Courses enrolled" tone="blue" />}
        {on('dashboard.events') && <StatTile icon={<CalendarDays className="size-5" />} value={c.upcomingEvents} label="Upcoming registered events" tone="purple" />}
        {on('dashboard.requests') && <StatTile icon={<MessageSquare className="size-5" />} value={c.openRequests} label="Open requests" tone="amber" />}
      </div>

      {data.notifications.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900"><Bell className="size-4 text-brand-600" />Notifications</p>
          <ul className="space-y-1 text-sm">{data.notifications.map((n, i) => <li key={i}>{n.text}</li>)}</ul>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {on('opportunities') && <Card className="p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Relevant opportunities</h2><Link to="/opportunities" className="text-sm font-semibold text-brand-600">View all →</Link></div>
            {data.opportunities.length ? <div className="grid gap-3 md:grid-cols-2">{data.opportunities.map((o) => <OpportunityCard key={o._id} item={o} />)}</div> : <p className="text-sm text-ink-500">No opportunities available for your roles yet.</p>}
          </Card>}
          {on('dashboard.learning') && <Card className="p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Continue learning</h2><Link to="/dashboard/learning" className="text-sm font-semibold text-brand-600">My learning →</Link></div>
            {data.enrollments.length ? (
              <div className="space-y-3">
                {data.enrollments.map((e) => typeof e.course === 'object' && (
                  <Link key={e._id} to={`/courses/${e.course.slug}`} className="block rounded-lg border border-ink-900/8 p-3 hover:border-brand-200">
                    <div className="flex items-center justify-between gap-3"><p className="font-medium text-ink-900">{e.course.title}</p><span className="text-sm font-semibold tabular-nums">{e.progress}%</span></div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-900/8"><div className="h-full bg-brand-600" style={{ width: `${e.progress}%` }} /></div>
                  </Link>
                ))}
              </div>
            ) : <p className="text-sm text-ink-500">You haven't enrolled in a course yet. <Link to="/knowledge?tab=courses" className="font-semibold text-brand-600">Browse courses</Link></p>}
          </Card>}
          {on('knowledge.resources') && <Card className="p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">New in the Knowledge Hub</h2><Link to="/knowledge" className="text-sm font-semibold text-brand-600">Explore →</Link></div>
            {data.knowledge.length ? <div className="grid gap-3 md:grid-cols-2">{data.knowledge.slice(0, 2).map((k) => <ContentTile key={k._id} item={k} />)}</div> : <p className="text-sm text-ink-500">Nothing new yet.</p>}
          </Card>}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Quick Actions</h2>
            <div className="space-y-2">
              {can('opportunities.post') && on('opportunities.post') && <LinkButton to="/dashboard/post-opportunity" variant="outline" className="w-full justify-start"><PlusCircle className="size-4" />Post a Requirement</LinkButton>}
              {on('experts') && <LinkButton to="/experts" variant="outline" className="w-full justify-start"><Search className="size-4" />Find Experts</LinkButton>}
              {on('opportunities') && <LinkButton to="/opportunities" variant="outline" className="w-full justify-start"><ClipboardList className="size-4" />Browse Opportunities</LinkButton>}
              {on('partners') && <LinkButton to="/partners?type=academia" variant="outline" className="w-full justify-start"><GraduationCap className="size-4" />Connect with Academia</LinkButton>}
            </div>
          </Card>
          {on('dashboard.requests') && <Card className="p-4">
            <h2 className="mb-3 font-semibold">Recent requests</h2>
            {data.recentRequests.length ? (
              <ul className="space-y-3">
                {data.recentRequests.map((r) => (
                  <li key={r._id} className="flex items-start justify-between gap-2 text-sm">
                    <span><span className="block font-medium text-ink-900">{r.subject || label(r.type)}</span><span className="text-xs text-ink-500">{timeAgo(r.updatedAt)}</span></span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-500">No requests yet.</p>}
          </Card>}
          {on('events.calendar') && <Card className="p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Upcoming events</h2><Link to="/events" className="text-sm font-semibold text-brand-600">All →</Link></div>
            <div className="space-y-2">{data.events.length ? data.events.map((e) => <EventRow key={e._id} event={e} compact />) : <p className="text-sm text-ink-500">No upcoming events.</p>}</div>
          </Card>}
          {on('events.announcements') && data.announcements.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-3 font-semibold">Announcements</h2>
              <ul className="space-y-2 text-sm">{data.announcements.map((a) => <li key={a._id}><Link to={contentHref(a)} className="hover:text-brand-700">{a.title}</Link></li>)}</ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export function Profile() {
  useDocumentTitle('Profile')
  const { user, refresh } = useAuth()
  const companyOn = useFeature('dashboard.companyProfile')
  const expertOn = useFeature('experts.selfProfile')
  const { toast } = useFeedback()
  const p = user?.profile ?? {}
  const [form, setForm] = useState({
    name: user?.name ?? '', phone: user?.phone ?? '', designation: p.designation ?? '', department: p.department ?? '', bio: p.bio ?? '',
    interests: (p.interests ?? []) as string[], location: p.location ?? '', linkedin: p.linkedin ?? '', institution: p.institution ?? '', graduationYear: p.graduationYear ? String(p.graduationYear) : '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const { name, phone, graduationYear, ...profile } = form
      await api.put('/me/profile', { name, phone: phone || undefined, profile: { ...profile, graduationYear: graduationYear ? Number(graduationYear) : null } })
      await refresh()
      toast('Profile saved')
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fields, _: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Profile" subtitle={`${user?.email} · ${label(user?.category)}`} />
      <Card className="p-6">
        <form onSubmit={save} className="space-y-4">
          {errors._ && <Alert tone="error">{errors._}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" required value={form.name} onChange={set('name')} error={errors.name} />
            <Input label="Phone" value={form.phone} onChange={set('phone')} />
            <Input label="Designation" value={form.designation} onChange={set('designation')} />
            <Input label="Department" value={form.department} onChange={set('department')} />
            <Input label="Location" value={form.location} onChange={set('location')} />
            <Input label="LinkedIn" value={form.linkedin} onChange={set('linkedin')} error={errors['profile.linkedin']} placeholder="https://www.linkedin.com/in/…" />
            <Input label="Institution" value={form.institution} onChange={set('institution')} />
            <Input label="Graduation year" type="number" value={form.graduationYear} onChange={set('graduationYear')} />
          </div>
          <Textarea label="About you" value={form.bio} onChange={set('bio')} rows={4} />
          <TagInput label="Interests" value={form.interests} onChange={(interests) => setForm({ ...form, interests })} />
          <Button type="submit" loading={busy}>Save profile</Button>
        </form>
      </Card>
      {user?.accountType === 'organization' && user.organization && companyOn && <OrganizationProfile />}
      {expertOn && <ExpertProfileCard />}
    </div>
  )
}

function OrganizationProfile() {
  const { toast } = useFeedback()
  const { data, loading } = useAsync(() => api.get<Organization | null>('/me/organization'), [])
  const [form, setForm] = useState<{ description: string; website: string; location: string; collaborationAreas: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (loading || !data) return null
  const f = form ?? { description: data.description ?? '', website: data.website ?? '', location: data.location ?? '', collaborationAreas: data.collaborationAreas ?? [] }
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Company profile · {data.name}</h2>
          <p className="text-sm text-ink-500">Shown on the Partner Ecosystem when the BIAN team publishes your organization.</p>
        </div>
        <StatusBadge status={data.status} />
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          try {
            await api.put('/me/organization', f)
            toast('Company profile saved')
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        {error && <Alert tone="error">{error}</Alert>}
        <Textarea label="Description" value={f.description} onChange={(e) => setForm({ ...f, description: e.target.value })} rows={4} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Website" value={f.website} onChange={(e) => setForm({ ...f, website: e.target.value })} placeholder="https://" />
          <Input label="Location" value={f.location} onChange={(e) => setForm({ ...f, location: e.target.value })} />
        </div>
        <TagInput label="Areas of collaboration" value={f.collaborationAreas} onChange={(collaborationAreas) => setForm({ ...f, collaborationAreas })} />
        <Button type="submit" loading={busy}>Save company profile</Button>
      </form>
    </Card>
  )
}

const EXPERT_TYPES = ['industry_expert', 'research_expert', 'trainer', 'consultant', 'mentor']

function ExpertProfileCard() {
  const { toast } = useFeedback()
  const { data, loading, reload } = useAsync(() => api.get<Expert | null>('/experts/me/profile'), [])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Expert> & { shareEmail?: boolean }>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  if (loading) return null

  const start = () => {
    setForm(data ?? { headline: '', expertType: 'industry_expert', skills: [], expertiseAreas: [], access: { visibility: 'authenticated', roles: [], organizations: [] }, mentoringAvailable: false })
    setEditing(true)
  }

  if (!editing)
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-brand-600" />Expert profile</h2>
          <p className="text-sm text-ink-500">{data ? <>{data.headline} · <StatusBadge status={data.status} /> · Visible to: {AUDIENCE_LABEL[data.access?.visibility ?? 'authenticated']}</> : 'List yourself in the Experts Network for mentoring, consultancy and collaboration requests.'}</p>
        </div>
        <Button variant="outline" onClick={start}>{data ? 'Edit expert profile' : 'Create expert profile'}</Button>
      </Card>
    )

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">Expert profile</h2>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setErrors({})
          try {
            const { headline, bio, expertType, domain, skills, expertiseAreas, yearsExperience, location, access, shareEmail, mentoringAvailable } = form
            await api.put('/experts/me/profile', { headline, bio, expertType, domain, skills, expertiseAreas, yearsExperience: yearsExperience ? Number(yearsExperience) : undefined, location, access, shareEmail: !!shareEmail, mentoringAvailable: !!mentoringAvailable })
            toast(data ? 'Expert profile updated' : 'Expert profile submitted for approval')
            setEditing(false)
            reload()
          } catch (err) {
            if (err instanceof ApiError) setErrors({ ...err.fields, _: err.message })
          } finally {
            setBusy(false)
          }
        }}
      >
        {errors._ && <Alert tone="error">{errors._}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Headline" required value={form.headline ?? ''} onChange={(e) => setForm({ ...form, headline: e.target.value })} error={errors.headline} placeholder="e.g. Bioprocess Expert" />
          <Select label="Expert type" value={form.expertType} onChange={(e) => setForm({ ...form, expertType: e.target.value })}>{EXPERT_TYPES.map((t) => <option key={t} value={t}>{label(t).replace(/s$/, '')}</option>)}</Select>
          <Input label="Domain" value={form.domain ?? ''} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="e.g. Biopharma" />
          <Input label="Years of experience" type="number" min={0} value={form.yearsExperience ?? ''} onChange={(e) => setForm({ ...form, yearsExperience: e.target.value as unknown as number })} />
          <Input label="Location" value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-900">Who can see your expert profile</legend>
          <MemberAudienceProvider>
            <AccessEditor value={form.access ?? { visibility: 'authenticated', roles: [], organizations: [] }} onChange={(access) => setForm({ ...form, access })} errors={errors} privateOption={EXPERT_PRIVATE} />
          </MemberAudienceProvider>
        </fieldset>
        <Textarea label="Biography" value={form.bio ?? ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4} />
        <TagInput label="Skills" value={form.skills ?? []} onChange={(skills) => setForm({ ...form, skills })} />
        <TagInput label="Areas of expertise" value={form.expertiseAreas ?? []} onChange={(expertiseAreas) => setForm({ ...form, expertiseAreas })} />
        <div className="flex flex-col gap-2">
          <Checkbox label="Available for mentoring" checked={!!form.mentoringAvailable} onChange={(e) => setForm({ ...form, mentoringAvailable: e.target.checked })} />
          <Checkbox label="Show my email address to signed-in members" checked={!!form.shareEmail} onChange={(e) => setForm({ ...form, shareEmail: e.target.checked })} />
        </div>
        <div className="flex gap-2"><Button type="submit" loading={busy}>Save</Button><Button variant="ghost" type="button" onClick={() => setEditing(false)}>Cancel</Button></div>
      </form>
    </Card>
  )
}

const EXPERT_PRIVATE = { label: 'BIAN team only', text: 'Hidden from the Experts Network' }
const AUDIENCE_LABEL: Record<string, string> = { public: 'everyone', authenticated: 'all members', roles: 'selected roles', organizations: 'selected organisations', private: 'BIAN team only' }

const OPP_TYPES = ['hiring', 'internship', 'consultancy', 'research_collaboration', 'technology_transfer', 'training', 'funding']

export function PostOpportunity() {
  useDocumentTitle('Post an opportunity')
  const { toast } = useFeedback()
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', summary: '', details: '', opportunityType: 'hiring', location: '', workMode: 'onsite', employmentType: '', deadline: '', applyUrl: '', applyEmail: '', eligibility: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const { title, summary, details, ...o } = form
      const opportunity = Object.fromEntries(Object.entries({ ...o, deadline: o.deadline ? new Date(o.deadline).toISOString() : '' }).filter(([, v]) => v))
      const r = await api.post<{ message: string }>('/contents/submissions', { title, summary, details: details || undefined, opportunity })
      toast(r.message)
      navigate('/dashboard/opportunities')
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fields, _: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Post a Requirement" subtitle="Submissions are reviewed by the BIAN team before they are published to members." />
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          {errors._ && <Alert tone="error">{errors._}</Alert>}
          <Input label="Title" required value={form.title} onChange={set('title')} error={errors.title} placeholder="e.g. Downstream Process Engineer" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Type" value={form.opportunityType} onChange={set('opportunityType')}>{OPP_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
            <Input label="Location" value={form.location} onChange={set('location')} />
            <Select label="Work mode" value={form.workMode} onChange={set('workMode')}>{['onsite', 'remote', 'hybrid'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select>
            <Input label="Engagement" value={form.employmentType} onChange={set('employmentType')} placeholder="Full-time, 6 months…" />
            <Input label="Deadline" type="date" value={form.deadline} onChange={set('deadline')} />
            <Input label="Application URL" value={form.applyUrl} onChange={set('applyUrl')} placeholder="https://" />
          </div>
          <Textarea label="Short description" required value={form.summary} onChange={set('summary')} error={errors.summary} rows={3} hint="Shown on the opportunity card (20–600 characters)" />
          <Textarea label="Eligibility" value={form.eligibility} onChange={set('eligibility')} rows={3} />
          <Textarea label="Full details" value={form.details} onChange={set('details')} rows={6} hint="Separate paragraphs with a blank line" />
          <Input label="Contact email for applications" type="email" value={form.applyEmail} onChange={set('applyEmail')} />
          <Button type="submit" loading={busy}>Submit for review</Button>
        </form>
      </Card>
    </div>
  )
}

export function MyOpportunities() {
  useDocumentTitle('My opportunities')
  const { data, error, loading, reload } = useAsync(() => api.get<ContentCard[]>('/me/opportunities'), [])
  return (
    <div>
      <PageHeader title="My Opportunities" actions={<LinkButton to="/dashboard/post-opportunity"><PlusCircle className="size-4" />New</LinkButton>} />
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? <Empty title="You haven't posted anything yet" action={<LinkButton to="/dashboard/post-opportunity">Post a requirement</LinkButton>} /> : (
        <Card className="divide-y divide-ink-900/8">
          {data.map((o) => (
            <div key={o._id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink-900">{o.title}</p>
                <p className="text-xs text-ink-500">{label(o.opportunity?.opportunityType)} · submitted {formatDate(o.createdAt)}</p>
              </div>
              <StatusBadge status={o.status} />
              <RowActions label={o.title} viewTo={o.status === 'published' ? contentHref(o) : undefined} viewUnavailable="Visible once the BIAN team publishes it" />
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

export function Learning() {
  useDocumentTitle('My learning')
  const { data, error, loading, reload } = useAsync(() => api.get<Enrollment[]>('/me/learning'), [])
  return (
    <div>
      <PageHeader title="My Learning" actions={<LinkButton to="/knowledge?tab=courses" variant="outline">Browse courses</LinkButton>} />
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? <Empty icon={<GraduationCap className="size-8" />} title="No courses yet" action={<LinkButton to="/knowledge?tab=courses">Find a course</LinkButton>} /> : (
        <Card className="divide-y divide-ink-900/8">
          {data.map((e) => typeof e.course === 'object' && e.course && (
            <div key={e._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-64">
                <Link to={`/courses/${e.course.slug}`} className="font-medium text-ink-900 hover:text-brand-700">{e.course.title}</Link>
                <p className="truncate text-xs text-ink-500">{e.course.summary}</p>
              </div>
              <div className="flex w-48 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-900/8"><div className="h-full bg-brand-600" style={{ width: `${e.progress}%` }} /></div>
                <span className="w-9 text-right text-xs font-semibold tabular-nums">{e.progress}%</span>
              </div>
              {e.status === 'completed' ? <Badge tone="green"><CheckCircle2 className="size-3" />Completed</Badge> : <Badge tone="blue">In progress</Badge>}
              <LinkButton size="sm" variant="soft" to={`/courses/${e.course.slug}`}>{e.status === 'completed' ? 'Review' : e.progress ? 'Continue' : 'Start'}<ArrowRight className="size-4" /></LinkButton>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

export function Saved() {
  useDocumentTitle('Saved')
  const { data, error, loading, reload } = useAsync(() => api.get<ContentCard[]>('/me/saved'), [])
  return (
    <div>
      <PageHeader title="Saved items" subtitle="Opportunities and resources you bookmarked." />
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? <Empty icon={<Bookmark className="size-8" />} title="Nothing saved yet">Use “Save for later” on any opportunity or resource.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.map((c) => (c.type === 'opportunity' ? <OpportunityCard key={c._id} item={c} /> : <ContentTile key={c._id} item={c} />))}</div>
      )}
    </div>
  )
}

export function MyEvents() {
  useDocumentTitle('My events')
  const { data, error, loading, reload } = useAsync(() => api.get<{ _id: string; event: EventItem | null }[]>('/me/events'), [])
  const list = (data ?? []).filter((r) => r.event)
  return (
    <div>
      <PageHeader title="My Events" actions={<LinkButton to="/events" variant="outline">Browse events</LinkButton>} />
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !list.length ? <Empty icon={<CalendarDays className="size-8" />} title="No registrations" /> : <div className="space-y-3">{list.map((r) => <EventRow key={r._id} event={r.event!} />)}</div>}
    </div>
  )
}

export function Requests() {
  useDocumentTitle('Requests')
  const { data, error, loading, reload } = useAsync(
    () => api.get<{ _id: string; type: string; subject?: string; message: string; status: string; response?: string; createdAt: string; targetExpert?: { user?: { name: string } } }[]>('/me/requests'),
    [],
  )
  return (
    <div className="max-w-4xl">
      <PageHeader title="Requests & Messages" subtitle="Contact, collaboration and expert-connect requests you've sent, with replies from the BIAN secretariat." actions={<LinkButton to="/contact">New request</LinkButton>} />
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? <Empty icon={<MessagesSquare className="size-8" />} title="No requests yet" /> : (
        <div className="space-y-2">
          {data.map((r) => (
            <Card key={r._id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink-900">{r.subject || label(r.type)}</p>
                  <p className="text-xs text-ink-500">{label(r.type)}{r.targetExpert?.user?.name && ` · ${r.targetExpert.user.name}`} · {formatDate(r.createdAt)}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-ink-700">{r.message}</p>
              {r.response && <div className="mt-2 rounded-lg bg-brand-50 p-3 text-sm"><p className="mb-1 font-semibold text-brand-700">Reply from BIAN</p><p className="whitespace-pre-line">{r.response}</p></div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export function MyFeedback() {
  useDocumentTitle('My feedback')
  const { data, error, loading, reload } = useAsync(() => api.get<{ _id: string; targetTitle: string; targetType: string; ratingAvg?: number; submittedAt: string; form?: { title: string } }[]>('/feedback/mine'), [])
  return (
    <div className="max-w-3xl">
      <PageHeader title="My Feedback" subtitle="Identified feedback you have submitted. Anonymous responses are never linked to your account." />
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.length ? <Empty icon={<Star className="size-8" />} title="No feedback submitted" /> : (
        <Card className="divide-y divide-ink-900/8">
          {data.map((s) => (
            <div key={s._id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><p className="font-medium text-ink-900">{s.targetTitle}</p><p className="text-xs text-ink-500">{s.form?.title} · {label(s.targetType)} · {formatDate(s.submittedAt)}</p></div>
              {s.ratingAvg !== undefined && <span className="inline-flex items-center gap-1 text-sm font-semibold"><Star className="size-4 fill-amber-400 text-amber-400" />{s.ratingAvg}</span>}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

export function AccountSettings() {
  useDocumentTitle('Settings')
  const appearanceOn = useFeature('appearance')
  const { toast, confirm } = useFeedback()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader title="Settings" subtitle="Appearance, password and signed-in devices." />
      {appearanceOn && <Appearance embedded />}
      <h2 className="text-xl font-bold text-ink-900">Security</h2>
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Change password</h2>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (pw.newPassword !== pw.confirm) return setErrors({ confirm: 'Passwords do not match' })
            setBusy(true)
            setErrors({})
            try {
              const r = await api.post<{ message: string }>('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword })
              toast(r.message)
              setPw({ currentPassword: '', newPassword: '', confirm: '' })
            } catch (err) {
              if (err instanceof ApiError) setErrors({ ...err.fields, _: err.message })
            } finally {
              setBusy(false)
            }
          }}
        >
          {errors._ && !errors.currentPassword && <Alert tone="error">{errors._}</Alert>}
          <Input label="Current password" type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} error={errors.currentPassword} autoComplete="current-password" />
          <Input label="New password" type="password" required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={errors.newPassword} hint="10+ characters with letters and numbers" autoComplete="new-password" />
          <Input label="Confirm new password" type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={errors.confirm} autoComplete="new-password" />
          <Button type="submit" loading={busy}>Update password</Button>
        </form>
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div><h2 className="text-lg font-semibold">Sign out everywhere</h2><p className="text-sm text-ink-500">End all sessions on every device, including this one.</p></div>
        <Button
          variant="outline"
          onClick={async () => {
            if (!(await confirm({ title: 'Sign out of all devices?', message: 'You will need to sign in again on every device.', confirmLabel: 'Sign out everywhere', danger: true }))) return
            await api.post('/auth/logout-all')
            await logout()
            navigate('/login')
          }}
        >
          Sign out everywhere
        </Button>
      </Card>
    </div>
  )
}
