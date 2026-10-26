import { CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { NotificationList } from '../components/NotificationBell'
import { Badge, Button, Card, PageHeader, Tabs } from '../components/ui'
import { useDocumentTitle, useQueryState } from '../lib/hooks'
import { useNotifications } from '../lib/notifications'

export default function Notifications() {
  useDocumentTitle('Notifications')
  const { items, unread, live, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()
  const [f, setF] = useQueryState({ show: 'all' })
  const shown = f.show === 'unread' ? items.filter((n) => !n.readAt) : items
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle={<>Updates on your requests, approvals, submissions and new content for you. {live ? <Badge tone="green">Live</Badge> : <Badge>Connecting…</Badge>}</>}
        actions={unread > 0 && <Button variant="outline" onClick={() => void markAllRead()}><CheckCheck className="size-4" />Mark all read</Button>}
      />
      <Tabs value={f.show} onChange={(show) => setF({ show })} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unread }]} className="mb-4" />
      <Card className="overflow-hidden">
        <NotificationList
          items={shown}
          empty={f.show === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
          onOpen={(n) => {
            void markRead(n._id)
            if (n.link) navigate(n.link)
          }}
        />
      </Card>
      <p className="mt-3 text-xs text-ink-500">Notifications are kept for 90 days.</p>
    </div>
  )
}
