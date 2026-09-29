import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [session])

  async function startChatSession(phone, username) {
    const cleanPhone = phone.trim()
    const displayName = (username || cleanPhone).trim()

    const { data, error } = await supabase.auth.signInAnonymously({
      options: { data: { username: displayName, phone: cleanPhone } },
    })

    if (error) return { data, error }

    if (data.user) {
      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({ username: displayName })
        .eq('id', data.user.id)
        .select()
        .single()

      if (profileError) return { data, error: profileError }
      setProfile(updatedProfile)
    }

    return { data, error: null }
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signUp: (phone, username) => startChatSession(phone, username),
    signIn: (phone) => startChatSession(phone, phone),
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
