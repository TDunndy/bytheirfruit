import { createClient } from '@supabase/supabase-js'
import type { Database } from '@db/database.types'

// Same project as the church app and the review site. The anon key is public
// by design: every request passes through row level security, and a paired
// device is an auth user whose only power is what my_station() grants.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ffqmbhftivmiubvtzhhr.supabase.co'
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcW1iaGZ0aXZtaXVidnR6aGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzYyMTcsImV4cCI6MjA4ODg1MjIxN30.aYpnohEz3_kZzteD5y7mNwR8gzvkZm0iDGXGP_rHmNk'

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: 'btf-station', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

export const APP_VERSION = '1.0.0'
