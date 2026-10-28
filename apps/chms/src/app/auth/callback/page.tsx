'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Google sign-in returns here with a PKCE code. The Supabase client exchanges
// it on load (detectSessionInUrl) and AppShell waits for that, so by the time
// this renders the user is signed in.
export default function AuthCallback() {
  const router = useRouter()
  useEffect(() => { router.replace('/people') }, [router])
  return null
}
