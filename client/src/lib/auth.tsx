import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import type { SessionUser } from './types'

/** Returned instead of a session when sign-in codes are enabled on the server. */
export interface OtpChallenge {
  challenge: string
  email: string
  expiresInMinutes: number
  devCode?: string
}
export type LoginResult = { user: SessionUser | null; otp?: undefined } | { user?: undefined; otp: OtpChallenge }

interface AuthState {
  user: SessionUser | null
  loading: boolean
  refresh: () => Promise<SessionUser | null>
  login: (email: string, password: string, remember: boolean) => Promise<LoginResult>
  verifyOtp: (challenge: string, code: string) => Promise<SessionUser | null>
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
    async (email: string, password: string, remember: boolean): Promise<LoginResult> => {
      const r = await api.post<{ ok?: boolean; otpRequired?: boolean } & Partial<OtpChallenge>>('/auth/login', { email, password, remember })
      if (r.otpRequired) return { otp: { challenge: r.challenge!, email: r.email!, expiresInMinutes: r.expiresInMinutes!, devCode: r.devCode } }
      return { user: await refresh() }
    },
    [refresh],
  )

  const verifyOtp = useCallback(
    async (challenge: string, code: string) => {
      await api.post('/auth/login/otp', { challenge, code })
      return refresh()
    },
    [refresh],
  )

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined)
    setUser(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, loading, refresh, login, verifyOtp, logout, can: (p) => !!user?.permissions.includes(p) }),
    [user, loading, refresh, login, verifyOtp, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
