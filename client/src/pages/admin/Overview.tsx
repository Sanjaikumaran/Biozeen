import {
  Activity, BarChart3, BookOpen, Building2, CalendarDays, ClipboardCheck, Database, FileText, FolderTree, GraduationCap, Handshake,
  History, Image, Inbox, LayoutDashboard, ListChecks, MessageSquareHeart, Settings, ShieldCheck, UserCheck, Users, UserSearch,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { LookupsProvider } from '../../components/admin/Publishing'
import { Card, ErrorState, Loading, PageHeader, Select, StatTile } from '../../components/ui'
import { WorkspaceLayout, type NavItem } from '../../layouts/WorkspaceLayout'
import { api } from '../../lib/api'
import { label } from '../../lib/format'
import { useAsync, useDocumentTitle, useQueryState } from '../../lib/hooks'

interface Metric { total: number; recent: number; change: number | null }
interface Stats {
  days: number
  members: Metric
  organizations: Metric
  experts: Metric
  opportunities: Metric
  collaborations: Metric
  trainingRequests: Metric
  pendingApprovals: number
  pendingContent: number
  newRequests: number
  engagement: { recent: number; change: number | null }
  membershipGrowth: { month: string; total: number; joined: number }[]
  membersByCategory: { category: string; count: number }[]
  opportunityTrend: { month: string; count: number }[]
}

export function AdminLayout() {
  const { data } = useAsync(() => api.get<Stats>('/admin/stats').catch(() => null), [])
  const items: NavItem[] = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/approvals', label: 'Member Approvals', icon: UserCheck, permission: 'members.manage', badge: data?.pendingApprovals },
    { to: '/admin/members', label: 'Members', icon: Users, permission: 'members.manage' },
    { to: '/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck, permission: 'members.manage' },
    { to: '/admin/directory', label: 'Master Database', icon: Database, permission: 'organizations.manage' },
    { to: '/admin/experts', label: 'Experts', icon: UserSearch, permission: 'experts.manage' },
    { to: '/admin/content?type=portfolio', label: 'Portfolio', icon: Building2, permission: 'content.manage' },
    { to: '/admin/content?type=opportunity', label: 'Opportunities', icon: Handshake, permission: 'content.manage', badge: data?.pendingContent },
    { to: '/admin/content?type=knowledge', label: 'Knowledge', icon: BookOpen, permission: 'content.manage' },
    { to: '/admin/content?type=announcement', label: 'Announcements', icon: FileText, permission: 'content.manage' },
    { to: '/admin/courses', label: 'Courses', icon: GraduationCap, permission: 'content.manage' },
    { to: '/admin/events', label: 'Events', icon: CalendarDays, permission: 'content.manage' },
    { to: '/admin/feedback/forms', label: 'Feedback Forms', icon: ListChecks, permission: 'feedback.manage' },
    { to: '/admin/feedback', label: 'Feedback Analytics', icon: MessageSquareHeart, permission: 'feedback.view', end: true },
    { to: '/admin/requests', label: 'Requests', icon: Inbox, permission: 'contacts.manage', badge: data?.newRequests },
    { to: '/admin/taxonomy', label: 'Categories & Tags', icon: FolderTree, permission: 'content.manage' },
    { to: '/admin/media', label: 'Media Library', icon: Image, permission: 'media.upload' },
    { to: '/admin/audit', label: 'Audit Log', icon: History, permission: 'audit.view' },
    { to: '/admin/settings', label: 'Site Settings', icon: Settings, permission: 'settings.manage' },
  ]
  return (
    <LookupsProvider>
      <WorkspaceLayout title="Biozeen Admin" items={items} requirePermission="admin.access" />
    </LookupsProvider>
  )
}

const BRAND = '#136445'
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })

function ChartCard({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {empty ? <p className="grid h-56 place-items-center text-sm text-ink-500">No data yet</p> : <div className="h-56">{children}</div>}
    </Card>
  )
}

const tooltipStyle = { borderRadius: 8, border: '1px solid rgb(15 42 74 / 0.1)', fontSize: 12 }

export function Overview() {
  useDocumentTitle('Admin overview')
  const [f, setF] = useQueryState({ days: '30' })
  const { data, error, loading, reload } = useAsync(() => api.get<Stats>('/admin/stats', { days: f.days }), [f.days])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome, Admin!"
        subtitle="Platform overview and live analytics."
        actions={
          <Select aria-label="Period" value={f.days} onChange={(e) => setF({ days: e.target.value })} className="h-9 w-40">
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option>
          </Select>
        }
      />
      {loading ? <Loading /> : error || !data ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={<Users className="size-5" />} value={data.members.total.toLocaleString('en-IN')} label="Total members" change={data.members.change} />
            <StatTile icon={<Building2 className="size-5" />} value={data.organizations.total} label="Organizations" change={data.organizations.change} tone="blue" />
            <StatTile icon={<UserSearch className="size-5" />} value={data.experts.total} label="Experts registered" change={data.experts.change} tone="amber" />
            <StatTile icon={<Handshake className="size-5" />} value={data.opportunities.total} label="Opportunities posted" change={data.opportunities.change} tone="purple" />
            <StatTile icon={<Activity className="size-5" />} value={data.collaborations.recent} label="Collaboration requests (period)" change={data.collaborations.change} tone="blue" />
            <StatTile icon={<GraduationCap className="size-5" />} value={data.trainingRequests.recent} label="Training requests (period)" change={data.trainingRequests.change} tone="amber" />
            <Link to="/admin/approvals"><StatTile icon={<ClipboardCheck className="size-5" />} value={data.pendingApprovals + data.pendingContent} label={`Pending: ${data.pendingApprovals} members, ${data.pendingContent} content`} tone="red" /></Link>
            <StatTile icon={<BarChart3 className="size-5" />} value={data.engagement.recent.toLocaleString('en-IN')} label="Engagement actions (period)" change={data.engagement.change} tone="purple" />
          </div>
          <p className="text-xs text-ink-500">Engagement counts feedback, course enrolments, event registrations and contact requests in the selected period. Changes compare with the previous period of equal length.</p>

          <div className="grid gap-6 xl:grid-cols-3">
            <ChartCard title="Membership growth" empty={!data.membershipGrowth.some((m) => m.total)}>
              <ResponsiveContainer>
                <LineChart data={data.membershipGrowth} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#e7ebef" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: '#5d6b7c' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5d6b7c' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(m) => new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} formatter={(v, n) => [v, n === 'total' ? 'Total members' : 'Joined']} />
                  <Line type="monotone" dataKey="total" stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Active members by category" empty={!data.membersByCategory.length}>
              <ResponsiveContainer>
                <BarChart data={data.membersByCategory.map((c) => ({ ...c, name: label(c.category) }))} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e7ebef" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#5d6b7c' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#33475e' }} axisLine={false} tickLine={false} tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgb(19 100 69 / 0.06)' }} formatter={(v) => [v, 'Members']} />
                  <Bar dataKey="count" fill={BRAND} radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Opportunities created per month" empty={!data.opportunityTrend.some((m) => m.count)}>
              <ResponsiveContainer>
                <BarChart data={data.opportunityTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#e7ebef" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: '#5d6b7c' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5d6b7c' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgb(19 100 69 / 0.06)' }} labelFormatter={(m) => new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} formatter={(v) => [v, 'Opportunities']} />
                  <Bar dataKey="count" fill={BRAND} radius={[4, 4, 0, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
