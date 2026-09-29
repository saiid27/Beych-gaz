import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)
const SESSION_KEY = 'beych_gaz_session'

function normalizePhone(phone) {
  return phone.replace(/\D/g, '')
}

async function postAuth(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok) {
    return { data: null, error: { message: data.error || 'Erreur serveur' } }
  }

  return { data, error: null }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = window.localStorage.getItem(SESSION_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      setSession(parsed)
      setProfile(parsed.profile)
    }
    setLoading(false)
  }, [])

  function saveSession(data) {
    const nextSession = { user: data.user, profile: data.profile }
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession))
    setSession(nextSession)
    setProfile(data.profile)
    return { data: nextSession, error: null }
  }

  async function signUp(phone, password) {
    const result = await postAuth('/api/auth/signup', {
      phone: normalizePhone(phone),
      password,
    })

    if (result.error) return result
    return saveSession(result.data)
  }

  async function signIn(phone, password) {
    const result = await postAuth('/api/auth/login', {
      phone: normalizePhone(phone),
      password,
    })

    if (result.error) return result
    return saveSession(result.data)
  }

  function signOut() {
    window.localStorage.removeItem(SESSION_KEY)
    setSession(null)
    setProfile(null)
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
