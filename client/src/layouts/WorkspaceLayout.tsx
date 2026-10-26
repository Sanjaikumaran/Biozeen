import { Menu, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Loading } from '../components/ui'
import { cx } from '../lib/cx'
import { useAuth } from '../lib/auth'
import { SiteHeader } from './PublicLayout'
import { FeatureUnavailable } from '../components/FeatureUnavailable'
import { useFeatures } from '../lib/features'
import { PageErrorBoundary } from '../components/ErrorBoundary'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  permission?: string
  /** Hidden when the developer console switches this feature off for the viewer. */
  feature?: string
  badge?: number
}

/** Shared sidebar shell for the member dashboard and admin workspace. */
export function WorkspaceLayout({ title, items, requirePermission, developerOnly, requireFeature }: { title: string; items: NavItem[]; requirePermission?: string; developerOnly?: boolean; requireFeature?: string }) {
  const { user, loading, can } = useAuth()
  const featureOn = useFeatures()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  // Close the mobile menu after navigation.
  const [menuPath, setMenuPath] = useState(loc.pathname)
  if (menuPath !== loc.pathname) {
    setMenuPath(loc.pathname)
    setOpen(false)
  }

  if (loading) return <Loading />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (requirePermission && !can(requirePermission)) return <Navigate to="/dashboard" replace />
  if (developerOnly && !user.isDeveloper) return <Navigate to="/dashboard" replace />
  if (requireFeature && !featureOn(requireFeature)) return <><SiteHeader /><FeatureUnavailable /></>

  const visible = items.filter((i) => (!i.permission || can(i.permission)) && featureOn(i.feature))
  // NavLink ignores the query string, so items like /admin/content?type=… need their own check.
  const isActive = (i: NavItem, linkActive: boolean) => {
    const [path, query] = i.to.split('?')
    if (!query) return linkActive
    const want = new URLSearchParams(query)
    const have = new URLSearchParams(loc.search)
    return loc.pathname.startsWith(path) && [...want].every(([k, v]) => have.get(k) === v)
  }
  const nav = (
    <nav className="space-y-0.5 p-3" aria-label={title}>
      {visible.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          className={({ isActive: linkActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition', isActive(i, linkActive) ? 'bg-lime-500 text-brand-900' : 'text-brand-100 hover:bg-white/10 hover:text-white')}
        >
          <i.icon className="size-4 shrink-0" />
          <span className="flex-1">{i.label}</span>
          {!!i.badge && <span className="rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{i.badge}</span>}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="flex flex-1">
        <div className="on-brand hidden w-60 shrink-0 bg-brand-900 lg:block">
          <aside className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto">
            <p className="px-6 pt-5 text-sm font-bold uppercase tracking-wider text-white">{title}</p>
            {nav}
          </aside>
        </div>
        {open && (
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
            <aside className="on-brand h-full w-64 overflow-y-auto bg-brand-900" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 pt-5">
                <p className="text-sm font-bold uppercase tracking-wider text-white">{title}</p>
                <button onClick={() => setOpen(false)} className="text-white" aria-label="Close menu"><X className="size-5" /></button>
              </div>
              {nav}
            </aside>
          </div>
        )}
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <button onClick={() => setOpen(true)} className="mb-4 inline-flex items-center gap-2 rounded-lg border border-ink-900/10 bg-card px-3 py-1.5 text-sm font-medium lg:hidden">
            <Menu className="size-4" /> {title} menu
          </button>
          <PageErrorBoundary><Outlet /></PageErrorBoundary>
        </main>
      </div>
    </div>
  )
}
