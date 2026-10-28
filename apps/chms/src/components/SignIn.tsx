'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const withPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(err.message === 'Invalid login credentials' ? 'That email and password do not match.' : err.message)
  }

  const withGoogle = async () => {
    setError('')
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (err) setError(err.message)
  }

  return (
    <main className="center-page">
      <div className="card narrow">
        <Logo />
        <h1>Sign in</h1>
        <p className="muted">Use your By Their Fruit account. Church leaders get access when their church invites them.</p>
        <button type="button" className="btn btn-secondary btn-block" onClick={withGoogle}>Continue with Google</button>
        <div className="divider"><span>or</span></div>
        <form onSubmit={withPassword} className="stack">
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="muted small">No account yet? <a href="https://bytheirfruit.church">Create one on bytheirfruit.church</a>.</p>
      </div>
    </main>
  )
}

export function Logo() {
  return (
    <div className="logo">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#18181b" />
        <path d="M16 6C16 6 10 13 10 18C10 21.3 12.7 24 16 24C19.3 24 22 21.3 22 18C22 13 16 6 16 6Z" fill="#2563eb" />
      </svg>
      <span>By Their Fruit <em>for Churches</em></span>
    </div>
  )
}
