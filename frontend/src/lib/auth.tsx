/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch, apiPost, getStoredUser, setAuthToken, setStoredUser } from '@/lib/api'
import type { CurrentUser } from '@/lib/format'

interface AuthContextValue {
  user: CurrentUser | null
  loading: boolean
  login: (loginName: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(() => getStoredUser<CurrentUser>())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiFetch<{ user: CurrentUser }>('/auth/me')
      .then((res) => {
        if (!active) return
        setUser(res.user)
        setStoredUser(res.user)
      })
      .catch(() => {
        if (!active) return
        setUser(null)
        setAuthToken(null)
        setStoredUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    const onUnauthorized = () => {
      setUser(null)
      setAuthToken(null)
      setStoredUser(null)
    }
    window.addEventListener('nexusflow:unauthorized', onUnauthorized)
    return () => {
      active = false
      window.removeEventListener('nexusflow:unauthorized', onUnauthorized)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(loginName, password) {
        const res = await apiPost<{ token: string; user: CurrentUser }>('/auth/login', {
          login_name: loginName,
          password,
        })
        setAuthToken(res.token)
        setStoredUser(res.user)
        setUser(res.user)
      },
      async logout() {
        try {
          await apiPost('/auth/logout')
        } finally {
          setAuthToken(null)
          setStoredUser(null)
          setUser(null)
        }
      },
    }),
    [loading, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
