import {
  Activity, BarChart3, BookOpen, Building2, CalendarDays, ClipboardCheck, Database, FileText, FolderTree, GraduationCap, Handshake,
  History, Image, Inbox, UserCog, LayoutDashboard, ListChecks, MessageSquareHeart, Settings, ShieldCheck, UserCheck, Users, UserSearch,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { LookupsProvider } from '../../components/admin/Publishing'
import { Donut, GrowthChart, MonthlyBars, Sparkline } from '../../components/charts/D3Charts'
import { Card, ErrorState, Loading, PageHeader, Select } from '../../components/ui'
import { WorkspaceLayout, type NavItem } from '../../layouts/WorkspaceLayout'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cx } from '../../lib/cx'
import { useFeatures } from '../../lib/features'
import { label } from '../../lib/format'
import { useAsync, useDocumentTitle, useQueryState } from '../../lib/hooks'
import { VIZ } from '../../lib/viz'

interface Metric { total: number; recent: number; change: number | null }
interface Stats {
  analytics?: boolean
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
    { to: '/admin/approvals', label: 'Member Approvals', icon: UserCheck, permission: 'members.manage', badge: data?.pendingApprovals, feature: 'admin.approvals' },
    { to: '/admin/members', label: 'Members', icon: Users, permission: 'members.manage', feature: 'admin.members' },
    { to: '/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck, permission: 'members.manage', feature: 'admin.roles' },
    { to: '/admin/directory', label: 'Master Database', icon: Database, permission: 'organizations.manage', feature: 'admin.directory' },
    { to: '/admin/experts', label: 'Experts', icon: UserSearch, permission: 'experts.manage', feature: 'admin.experts' },
    { to: '/admin/content?type=portfolio', label: 'Portfolio', icon: Building2, permission: 'content.manage', feature: 'admin.portfolio' },
    { to: '/admin/content?type=opportunity', label: 'Opportunities', icon: Handshake, permission: 'content.manage', badge: data?.pendingContent, feature: 'admin.opportunities' },
    { to: '/admin/content?type=knowledge', label: 'Knowledge', icon: BookOpen, permission: 'content.manage', feature: 'admin.knowledge' },
    { to: '/admin/content?type=announcement', label: 'Announcements', icon: FileText, permission: 'content.manage', feature: 'admin.announcements' },
    { to: '/admin/courses', label: 'Courses', icon: GraduationCap, permission: 'content.manage', feature: 'admin.courses' },
    { to: '/admin/events', label: 'Events', icon: CalendarDays, permission: 'content.manage', feature: 'admin.events' },
    { to: '/admin/feedback/forms', label: 'Feedback Forms', icon: ListChecks, permission: 'feedback.manage', feature: 'admin.feedback' },
    { to: '/admin/feedback', label: 'Feedback Analytics', icon: MessageSquareHeart, permission: 'feedback.view', end: true, feature: 'admin.feedback' },
    { to: '/admin/requests', label: 'Requests', icon: Inbox, permission: 'contacts.manage', badge: data?.newRequests, feature: 'admin.requests' },
    { to: '/admin/taxonomy', label: 'Categories & Tags', icon: FolderTree, permission: 'content.manage', feature: 'admin.taxonomy' },
    { to: '/admin/media', label: 'Media Library', icon: Image, permission: 'media.upload', feature: 'admin.media' },
    { to: '/admin/audit', label: 'Audit Log', icon: History, permission: 'audit.view', feature: 'admin.audit' },
    { to: '/admin/settings', label: 'Site Settings', icon: Settings, permission: 'settings.manage', feature: 'admin.settings' },
    { to: '/admin/account', label: 'My settings', icon: UserCog },
  ]
  return (
    <LookupsProvider>
      <WorkspaceLayout title="Biozeen Admin" items={items} requirePermission="admin.access" />
    </LookupsProvider>
  )
}

const CATEGORY_ORDER = ['startup', 'academia', 'industry', 'sme', 'alumni', 'student', 'professional', 'other']

/** Headline number with its trend; the coloured rail and sparkline share the metric's colour. */
function Kpi({ icon: Icon, value, label: text, change, color, spark, to }: { icon: LucideIcon; value: React.ReactNode; label: string; change?: number | null; color: string; spark?: number[]; to?: string }) {
  const body = (
    <Card className={cx('relative h-full overflow-hidden p-4 pl-5', to && 'transition-shadow hover:shadow-md')}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-500"><Icon className="size-3.5" style={{ color }} aria-hidden />{text}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900">{value}</p>
        </div>
        {spark && <Sparkline values={spark} color={color} />}
      </div>
      {change !== undefined && change !== null && (
        <p className="mt-1 text-xs text-ink-500">
          {(
            <><span className={cx('mr-1 inline-flex items-center rounded-full px-1.5 py-px font-semibold tabular-nums', change > 0 ? 'bg-emerald-500/10 text-emerald-700' : change < 0 ? 'bg-red-500/10 text-red-600' : 'bg-ink-900/5 text-ink-700')}>{change > 0 ? '▲' : change < 0 ? '▼' : '•'} {Math.abs(change)}%</span>vs previous period</>
          )}
        </p>
      )}
    </Card>
  )
  return to ? <Link to={to} className="block h-full">{body}</Link> : body
}

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cx('p-5', className)}>
      <div className="mb-3">
        <h2 className="font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
      </div>
      {children}
    </Card>
  )
}

function PendingWork({ data }: { data: Pick<Stats, 'pendingApprovals' | 'pendingContent' | 'newRequests'> }) {
  const on = useFeatures()
  const { can } = useAuth()
  const rows = [
    { label: 'Registrations to approve', value: data.pendingApprovals, to: '/admin/approvals', icon: UserCheck, show: can('members.manage') && on('admin.approvals'), color: VIZ[0] },
    { label: 'Content awaiting review', value: data.pendingContent, to: '/admin/approvals', icon: ClipboardCheck, show: can('content.manage') && on('publishing.review'), color: VIZ[3] },
    { label: 'New requests', value: data.newRequests, to: '/admin/requests?status=new', icon: Inbox, show: can('contacts.manage') && on('admin.requests'), color: VIZ[1] },
  ].filter((r) => r.show)
  const top = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ChartCard title="Waiting for you" subtitle="Open items across the workspace">
      {!rows.length ? <p className="text-sm text-ink-500">Nothing assigned to your roles.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.label}>
              <Link to={r.to} className="group block">
                <div className="flex items-center gap-2 text-sm">
                  <r.icon className="size-4" style={{ color: r.color }} aria-hidden />
                  <span className="flex-1 text-ink-700 group-hover:text-ink-900">{r.label}</span>
                  <span className="font-semibold tabular-nums text-ink-900">{r.value}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-900/5"><div className="h-full rounded-full transition-all" style={{ width: `${(r.value / top) * 100}%`, background: r.color }} /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}

function EmptyChart() {
  return <p className="grid h-56 place-items-center text-sm text-ink-500">No data yet</p>
}

export function Overview() {
  useDocumentTitle('Admin overview')
  const [f, setF] = useQueryState({ days: '30' })
  const { data, error, loading, reload } = useAsync(() => api.get<Stats>('/admin/stats', { days: f.days }), [f.days])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Welcome, Admin!"
        subtitle="Platform overview and live analytics."
        actions={data?.analytics !== false && (
          <Select aria-label="Period" value={f.days} onChange={(e) => setF({ days: e.target.value })} className="h-9 w-40">
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option>
          </Select>
        )}
      />
      {loading ? <Loading /> : error || !data ? <ErrorState error={error} onRetry={reload} /> : data.analytics === false ? (
        <div className="grid gap-4 lg:grid-cols-2"><PendingWork data={data} /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Users} value={data.members.total.toLocaleString('en-IN')} label="Total members" change={data.members.change} color={VIZ[0]} spark={data.membershipGrowth.map((m) => m.total)} to="/admin/members" />
            <Kpi icon={Building2} value={data.organizations.total} label="Organizations" change={data.organizations.change} color={VIZ[6]} to="/admin/directory" />
            <Kpi icon={UserSearch} value={data.experts.total} label="Experts registered" change={data.experts.change} color={VIZ[3]} to="/admin/experts" />
            <Kpi icon={Handshake} value={data.opportunities.total} label="Opportunities posted" change={data.opportunities.change} color={VIZ[2]} spark={data.opportunityTrend.map((m) => m.count)} to="/admin/content?type=opportunity" />
            <Kpi icon={Activity} value={data.collaborations.recent} label="Collaboration requests" change={data.collaborations.change} color={VIZ[1]} />
            <Kpi icon={GraduationCap} value={data.trainingRequests.recent} label="Training requests" change={data.trainingRequests.change} color={VIZ[4]} />
            <Kpi icon={ClipboardCheck} value={data.pendingApprovals + data.pendingContent} label="Pending approvals" color={VIZ[7]} to="/admin/approvals" />
            <Kpi icon={BarChart3} value={data.engagement.recent.toLocaleString('en-IN')} label="Engagement actions" change={data.engagement.change} color={VIZ[5]} />
          </div>
          <p className="text-xs text-ink-500">Request and engagement figures cover the selected period; engagement counts feedback, course enrolments, event registrations and contact requests. Changes compare with the previous period of equal length.</p>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard title="Membership growth" subtitle="Last 12 months · hover a month for detail" className="xl:col-span-2">
              {data.membershipGrowth.some((m) => m.total) ? <GrowthChart data={data.membershipGrowth} /> : <EmptyChart />}
            </ChartCard>
            <ChartCard title="Active members by category" subtitle="Hover a slice or row">
              {data.membersByCategory.length ? (
                <Donut
                  totalLabel="active members"
                  data={[...data.membersByCategory]
                    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
                    .map((c) => ({ key: c.category, label: label(c.category), value: c.count, color: VIZ[Math.max(0, CATEGORY_ORDER.indexOf(c.category)) % VIZ.length] }))}
                />
              ) : <EmptyChart />}
            </ChartCard>
            <ChartCard title="Opportunities created per month" subtitle="Last 12 months, with the monthly average" className="xl:col-span-2">
              {data.opportunityTrend.some((m) => m.count) ? <MonthlyBars data={data.opportunityTrend} unit="Opportunities" color={VIZ[2]} /> : <EmptyChart />}
            </ChartCard>
            <PendingWork data={data} />
          </div>
        </>
      )}
    </div>
  )
}
