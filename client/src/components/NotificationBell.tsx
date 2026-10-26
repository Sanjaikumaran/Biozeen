import { Bell, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cx } from '../lib/cx'
import { timeAgo } from '../lib/format'
import { useNotifications, type AppNotification } from '../lib/notifications'
import { Badge, Drawer, Tabs } from './ui'

function NotificationList({ items, onOpen, empty }: { items: AppNotification[]; onOpen: (n: AppNotification) => void; empty: string }) {
  if (!items.length) return <p className="px-1 py-10 text-center text-sm text-ink-500">{empty}</p>
  return (
    <ul className="-mx-5 divide-y divide-ink-900/8">
      {items.map((n) => (
        <li key={n._id}>
          <button onClick={() => onOpen(n)} className={cx('flex w-full gap-3 px-5 py-3 text-left transition hover:bg-ink-900/5', !n.readAt && 'bg-brand-50/60')}>
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

/** Header bell; opens the notifications in a right-hand drawer. */
export function NotificationBell() {
  const { items, unread, live, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const [show, setShow] = useState<'all' | 'unread'>('all')
  const navigate = useNavigate()

  const openItem = (n: AppNotification) => {
    void markRead(n._id)
    if (n.link) {
      setOpen(false)
      navigate(n.link)
    }
  }
  const shown = show === 'unread' ? items.filter((n) => !n.readAt) : items

  return (
    <>
      <button onClick={() => setOpen(true)} className="relative rounded-md p-2 text-ink-500 hover:bg-ink-900/5 hover:text-ink-900" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-haspopup="dialog">
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title={<span className="inline-flex items-center gap-2">Notifications {live ? <Badge tone="green">Live</Badge> : <Badge>Connecting…</Badge>}</span>}
        actions={unread > 0 && <button onClick={() => void markAllRead()} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><CheckCheck className="size-3.5" />Mark all read</button>}
        footer={<p className="mr-auto text-xs text-ink-500">Notifications are kept for 90 days.</p>}
      >
        <Tabs value={show} onChange={setShow} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unread }]} className="-mx-5 mb-1 px-5" />
        <NotificationList items={shown} onOpen={openItem} empty={show === 'unread' ? 'No unread notifications.' : 'No notifications yet.'} />
      </Drawer>
    </>
  )
}
