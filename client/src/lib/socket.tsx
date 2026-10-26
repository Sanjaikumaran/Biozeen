import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from './auth'

const SocketContext = createContext<Socket | null>(null)

/** One live connection per signed-in session, shared by notifications and feature updates. */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id
  // A new connection per signed-in user; it is opened lazily and closed when the user changes.
  const socket = useMemo(() => (userId ? io({ path: '/api/socket', withCredentials: true, transports: ['websocket', 'polling'], autoConnect: false }) : null), [userId])
  useEffect(() => {
    socket?.connect()
    return () => {
      socket?.close()
    }
  }, [socket])
  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => useContext(SocketContext)
