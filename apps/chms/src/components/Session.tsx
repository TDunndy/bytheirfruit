'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { fetchMyOrgs, rememberOrgId, rememberedOrgId, type MyOrg } from '@/lib/orgs'

type Status = 'loading' | 'signed-out' | 'ready' | 'error'

export type Permission = 'people.view' | 'people.edit' | 'people.notes' | 'people.export' | 'roles.manage' | 'org.manage'

interface SessionValue {
  status: Status
  user: User | null
  orgs: MyOrg[]
  org: MyOrg | null
  /** What the signed-in leader may do in the current church (the database enforces it). */
  can: (permission: Permission) => boolean
  isChurchAdmin: boolean
  selectOrg: (id: string) => void
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [orgs, setOrgs] = useState<MyOrg[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])

  const load = useCallback(async (u: User | null) => {
    setUser(u)
    if (!u) { setOrgs([]); setStatus('signed-out'); return }
    try {
      const mine = await fetchMyOrgs(u.id)
      setOrgs(mine)
      const remembered = rememberedOrgId()
      // One church: pick it. Several: reuse the last choice, otherwise show the picker.
      setOrgId(mine.length === 1 ? mine[0].id : mine.some((o) => o.id === remembered) ? remembered : null)
      setStatus('ready')
    } catch (e) {
      console.error('Loading churches failed', e)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    // getSession waits for the PKCE code exchange when returning from Google.
    supabase.auth.getSession().then(({ data }) => load(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: supabase-js holds a lock during this callback.
        setTimeout(() => load(session?.user ?? null), 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  useEffect(() => {
    setPermissions([])
    if (!orgId) return
    let cancelled = false
    supabase.rpc('my_org_permissions', { p_org_id: orgId }).then(({ data, error }) => {
      if (error) console.error('Loading permissions failed', error)
      if (!cancelled) setPermissions(data ?? [])
    })
    return () => { cancelled = true }
  }, [orgId, user])

  const selectOrg = useCallback((id: string) => { rememberOrgId(id); setOrgId(id) }, [])
  const signOut = useCallback(async () => { await supabase.auth.signOut() }, [])

  const value = useMemo<SessionValue>(() => {
    const org = orgs.find((o) => o.id === orgId) ?? null
    return {
      status, user, orgs, org, selectOrg, signOut,
      can: (permission: Permission) => permissions.includes(permission),
      isChurchAdmin: org?.role === 'owner' || org?.role === 'admin',
    }
  }, [status, user, orgs, orgId, permissions, selectOrg, signOut])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
