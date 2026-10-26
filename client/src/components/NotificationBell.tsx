import { Bell, CheckCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { cx } from '../lib/cx'
import { timeAgo } from '../lib/format'
import { useNotifications, type AppNotification } from '../lib/notifications'

export function NotificationList({ items, onOpen, empty = 'You are all caught up.' }: { items: AppNotification[]; onOpen: (n: AppNotification) => void; empty?: string }) {
  if (!items.length) return <p className="px-4 py-8 text-center text-sm text-ink-500">{empty}</p>
  return (
    <ul className="divide-y divide-ink-900/8">
      {items.map((n) => (
        <li key={n._id}>
          <button onClick={() => onOpen(n)} className={cx('flex w-full gap-3 px-4 py-3 text-left transition hover:bg-ink-900/5', !n.readAt && 'bg-brand-50/60')}>
            <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-600')} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={cx('block text-sm text-ink-900', !n.readAt && 'font-semibold')}>{n.title}</span>
              {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-ink-500">{n.body}</span>}
              <span className="mt-1 block text-xs text-ink-500">{timeAgo(n.createdAt)}{!n.readAt && <span className="sr-only"> · unread</span>}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function NotificationBell() {
  const { items, unread, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const openItem = (n: AppNotification) => {
    setOpen(false)
    void markRead(n._id)
    if (n.link) navigate(n.link)
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-md p-2 text-ink-500 hover:bg-ink-900/5 hover:text-ink-900" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open}>
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-ink-900/10 bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-ink-900/8 px-4 py-3">
            <p className="font-semibold text-ink-900">Notifications</p>
            {unread > 0 && <button onClick={() => void markAllRead()} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><CheckCheck className="size-3.5" />Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto"><NotificationList items={items.slice(0, 8)} onOpen={openItem} /></div>
          <Link to="/dashboard/notifications" onClick={() => setOpen(false)} className="block border-t border-ink-900/8 px-4 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-ink-900/5">View all notifications</Link>
        </div>
      )}
    </div>
  )
}
