import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// The anon key is public by design: every request still passes through
// row level security. Values can be overridden per environment (preview
// deployments, local `supabase start`) through NEXT_PUBLIC_* variables.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ffqmbhftivmiubvtzhhr.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcW1iaGZ0aXZtaXVidnR6aGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzYyMTcsImV4cCI6MjA4ODg1MjIxN30.aYpnohEz3_kZzteD5y7mNwR8gzvkZm0iDGXGP_rHmNk'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE keeps tokens out of the URL fragment (the implicit flow put them there).
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})

export type SupabaseClient = typeof supabase
