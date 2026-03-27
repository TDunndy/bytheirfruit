import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ffqmbhftivmiubvtzhhr.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmcW1iaGZ0aXZtaXVidnR6aGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzYyMTcsImV4cCI6MjA4ODg1MjIxN30.aYpnohEz3_kZzteD5y7mNwR8gzvkZm0iDGXGP_rHmNk'

// Server-side Supabase client (no auth, read-only, edge-compatible)
export function createServerSupabase() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })
}
