import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import { useAuth } from './auth'
import { useSocket } from './socket'

type Flags = Record<string, boolean>
const FeaturesContext = createContext<{ flags: Flags; reload: () => void }>({ flags: {}, reload: () => undefined })

/**
 * Which screens and features the current viewer may use, as decided by the developer console.
 * The server enforces the same rules; this only keeps the interface in step with them.
 */
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const socket = useSocket()
  const [flags, setFlags] = useState<Flags | null>(null)
  const userId = user?.id

  const reload = useCallback(() => {
    api
      .get<{ features: Flags }>('/features')
      .then((r) => setFlags(r.features))
      .catch(() => setFlags((f) => f ?? {}))
  }, [])

  useEffect(() => {
    if (!loading) reload()
  }, [loading, userId, reload])

  // Developer changes reach open sessions live; visitors pick them up when they return to the tab.
  useEffect(() => {
    socket?.on('features:changed', reload)
    const onFocus = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      socket?.off('features:changed', reload)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [socket, reload])

  if (!flags) return null
  return <FeaturesContext.Provider value={{ flags, reload }}>{children}</FeaturesContext.Provider>
}

/** True unless the feature is switched off for this viewer. Unknown keys count as on. */
// eslint-disable-next-line react-refresh/only-export-components
export function useFeature(key?: string) {
  const { flags } = useContext(FeaturesContext)
  return !key || flags[key] !== false
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeatures() {
  const { flags } = useContext(FeaturesContext)
  return useCallback((key?: string) => !key || flags[key] !== false, [flags])
}

/** Renders children only when the feature is on. */
export function Feature({ name, children, fallback = null }: { name: string; children: ReactNode; fallback?: ReactNode }) {
  return <>{useFeature(name) ? children : fallback}</>
}
