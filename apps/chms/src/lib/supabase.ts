import { createClient } from '@supabase/supabase-js'
import type { Database } from '@db/database.types'

// Same project and accounts as bytheirfruit.church. The anon key is public by
// design: every request passes through row level security.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ffqmbhftivmiubvtzhhr.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcW1iaGZ0aXZtaXVidnR6aGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzYyMTcsImV4cCI6MjA4ODg1MjIxN30.aYpnohEz3_kZzteD5y7mNwR8gzvkZm0iDGXGP_rHmNk'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
})
