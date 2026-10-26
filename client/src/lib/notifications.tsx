import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { io } from 'socket.io-client'
import { useFeedback } from '../components/ui'
import { api } from './api'
import { useAuth } from './auth'

export interface AppNotification {
  _id: string
  kind: string
  title: string
  body?: string
  link?: string
  readAt?: string | null
  createdAt: string
}

interface NotificationsState {
  items: AppNotification[]
  unread: number
  live: boolean
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsState | null>(null)

/** Loads the signed-in user's notifications and keeps them current over a socket. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { toast } = useFeedback()
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [live, setLive] = useState(false)
  const userId = user?.id

  // Clear the previous account's list as soon as the user changes.
  const [listFor, setListFor] = useState(userId)
  if (listFor !== userId) {
    setListFor(userId)
    setItems([])
    setUnread(0)
    setLive(false)
  }

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    api
      .get<{ items: AppNotification[]; unread: number }>('/notifications', { limit: 30 })
      .then((r) => {
        if (cancelled) return
        setItems(r.items)
        setUnread(r.unread)
      })
      .catch(() => undefined)
    const socket = io({ path: '/api/socket', withCredentials: true, transports: ['websocket', 'polling'] })
    socket.on('connect', () => setLive(true))
    socket.on('disconnect', () => setLive(false))
    socket.on('notification', (n: AppNotification) => {
      setItems((list) => [n, ...list.filter((x) => x._id !== n._id)].slice(0, 50))
      setUnread((u) => u + 1)
      toast(n.title, 'info')
    })
    return () => {
      cancelled = true
      socket.close()
    }
  }, [userId, toast])

  const markRead = useCallback(async (id: string) => {
    const target = items.find((n) => n._id === id)
    if (!target || target.readAt) return
    setItems((list) => list.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)))
    const r = await api.post<{ unread: number }>(`/notifications/${id}/read`)
    setUnread(r.unread)
  }, [items])

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setItems((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: now })))
    setUnread(0)
    await api.post('/notifications/read-all')
  }, [])

  const value = useMemo(() => ({ items, unread, live, markRead, markAllRead }), [items, unread, live, markRead, markAllRead])
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider')
  return ctx
}
