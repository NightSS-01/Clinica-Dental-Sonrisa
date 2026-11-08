import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return undefined
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (!session?.user?.id) return
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, full_name, rut, active, must_change_password')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!active) return
      setProfile(error ? null : data)
      setLoading(false)
    }

    if (session?.user?.id) loadProfile()
    else if (!loading) setProfile(null)

    return () => { active = false }
  }, [session?.user?.id])

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email: email.trim(), password })
  }

  async function signOut() {
    return supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
