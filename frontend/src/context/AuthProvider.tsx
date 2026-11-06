import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, login as loginRequest, me, register as registerRequest, setToken, setUnauthorizedHandler } from '../lib/api'
import type { User } from '../lib/types'

type RegisterInput = {
  name: string
  email: string
  password: string
  role: User['role']
}

type AuthValue = {
  user: User | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
  adopt: (user: User, token: string) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUnauthorizedHandler(() => {
      setToken(null)
      setUser(null)
      navigate('/login', { replace: true })
    })

    if (!getToken()) {
      setReady(true)
      return () => {
        cancelled = true
      }
    }

    me()
      .then((next) => {
        if (!cancelled) setUser(next)
      })
      .catch(() => {
        if (!cancelled) {
          setToken(null)
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [navigate])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      async login(email, password) {
        const session = await loginRequest(email, password)
        setToken(session.token)
        setUser(session.user)
      },
      async register(input) {
        const session = await registerRequest(input)
        setToken(session.token)
        setUser(session.user)
      },
      logout() {
        setToken(null)
        setUser(null)
        navigate('/login', { replace: true })
      },
      adopt(next, token) {
        setToken(token)
        setUser(next)
      },
    }),
    [navigate, ready, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
