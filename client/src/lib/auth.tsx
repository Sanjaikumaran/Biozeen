import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import type { SessionUser } from './types'

interface AuthState {
  user: SessionUser | null
  loading: boolean
  refresh: () => Promise<SessionUser | null>
  login: (email: string, password: string, remember: boolean) => Promise<SessionUser | null>
  logout: () => Promise<void>
  can: (permission: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get<{ user: SessionUser | null }>('/auth/me')
      setUser(user)
      return user
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    api
      .get<{ user: SessionUser | null }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(
    async (email: string, password: string, remember: boolean) => {
      await api.post('/auth/login', { email, password, remember })
      return refresh()
    },
    [refresh],
  )

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined)
    setUser(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, loading, refresh, login, logout, can: (p) => !!user?.permissions.includes(p) }),
    [user, loading, refresh, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
