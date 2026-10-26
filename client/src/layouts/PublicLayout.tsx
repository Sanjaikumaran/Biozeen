import { ChevronDown, LayoutDashboard, LogOut, Mail, MapPin, Menu, Moon, Palette, Phone, Search, Shield, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { NotificationBell } from '../components/NotificationBell'
import { LinkButton, useFeedback } from '../components/ui'
import { cx } from '../lib/cx'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/hooks'
import { useTheme } from '../lib/theme'
import type { SiteSettings } from '../lib/types'
import { PageErrorBoundary } from '../components/ErrorBoundary'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/partners', label: 'Partners' },
  { to: '/opportunities', label: 'Opportunities' },
  { to: '/experts', label: 'Experts' },
  { to: '/knowledge', label: 'Knowledge Hub' },
  { to: '/events', label: 'Events' },
  { to: '/contact', label: 'Contact' },
]

function ThemeToggle() {
  const { theme, resolvedMode, setTheme } = useTheme()
  const { toast } = useFeedback()
  const next = resolvedMode === 'dark' ? 'light' : 'dark'
  return (
    <button
      onClick={() => setTheme({ ...theme, mode: next }).catch((e: Error) => toast(e.message, 'error'))}
      className="rounded-md p-2 text-ink-500 hover:bg-ink-900/5 hover:text-ink-900"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {resolvedMode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}

function UserMenu() {
  const { user, logout, can } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  if (!user) return null
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-900 hover:bg-ink-900/5" aria-expanded={open}>
        <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">{user.name.slice(0, 2).toUpperCase()}</span>
        <span className="hidden max-w-32 truncate xl:inline">{user.name}</span>
        <ChevronDown className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-ink-900/10 bg-card p-1.5 shadow-lg">
          <p className="truncate px-3 py-2 text-xs text-ink-500">{user.email}</p>
          <Link to="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink-900/5">
            <LayoutDashboard className="size-4" /> My dashboard
          </Link>
          {can('admin.access') && (
            <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink-900/5">
              <Shield className="size-4" /> Admin workspace
            </Link>
          )}
          <Link to="/dashboard/appearance" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink-900/5">
            <Palette className="size-4" /> Appearance
          </Link>
          <button
            onClick={async () => {
              await logout()
              navigate('/')
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function SiteHeader() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  // Close the mobile menu after navigation.
  const [menuPath, setMenuPath] = useState(loc.pathname)
  if (menuPath !== loc.pathname) {
    setMenuPath(loc.pathname)
    setOpen(false)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-ink-900/8 bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="ml-auto hidden items-center gap-0.5 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('whitespace-nowrap rounded-md px-2 py-2 text-[13px] font-medium transition-colors', isActive ? 'text-brand-700' : 'text-ink-700 hover:text-brand-700')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <Link to="/search" className="rounded-md p-2 text-ink-500 hover:bg-ink-900/5 hover:text-ink-900" aria-label="Search">
            <Search className="size-4" />
          </Link>
          <ThemeToggle />
          {user && <NotificationBell />}
          {user ? (
            <UserMenu />
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <LinkButton to="/login" variant="dark" size="sm">Login</LinkButton>
              <LinkButton to="/register" variant="accent" size="sm">Join Now</LinkButton>
            </div>
          )}
          <button className="rounded-md p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-ink-900/8 bg-card px-4 pb-4 lg:hidden">
          <form
            className="my-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search BIAN…" className="w-full rounded-lg border border-ink-300/70 px-3 py-2 text-sm" aria-label="Search" />
          </form>
          <nav className="grid gap-1" aria-label="Mobile">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          {!user && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <LinkButton to="/login" variant="dark">Login</LinkButton>
              <LinkButton to="/register" variant="accent">Join Now</LinkButton>
            </div>
          )}
        </div>
      )}
    </header>
  )
}

function SiteFooter() {
  const { data } = useAsync(() => api.get<SiteSettings>('/settings'), [])
  const c = data?.contact
  return (
    <footer className="hero-bg mt-16 text-brand-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo dark />
          <p className="mt-4 max-w-md text-sm text-brand-100/80">Bridging Industry, Academia and Innovation for a Healthier, More Sustainable Tomorrow.</p>
          <p className="mt-2 text-xs uppercase tracking-widest text-lime-400">Connect · Collaborate · Innovate · Grow</p>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">Explore</p>
          <ul className="space-y-2 text-sm">
            {NAV.slice(1).map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="hover:text-white">{n.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold text-white">BIAN Secretariat</p>
          <ul className="space-y-2 text-sm">
            {c?.email && <li className="flex items-center gap-2"><Mail className="size-4 text-lime-400" /><a href={`mailto:${c.email}`} className="hover:text-white">{c.email}</a></li>}
            {c?.phone && <li className="flex items-center gap-2"><Phone className="size-4 text-lime-400" />{c.phone}</li>}
            {c?.address && <li className="flex items-center gap-2"><MapPin className="size-4 text-lime-400" />{c.address}</li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-brand-100/70">© {new Date().getFullYear()} Biozeen · BIAN — Biozeen Industry Academy Network</div>
    </footer>
  )
}

export default function PublicLayout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <PageErrorBoundary><Outlet /></PageErrorBoundary>
      </main>
      <SiteFooter />
    </div>
  )
}

export function PageBanner({ title, subtitle, children, icon }: { title: string; subtitle?: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <section className="hero-bg text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex items-center gap-3">
          {icon && <div className="grid size-12 place-items-center rounded-xl bg-lime-500/20 text-lime-400">{icon}</div>}
          <div>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-1 text-brand-100">{subtitle}</p>}
          </div>
        </div>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  )
}
