'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AppIcon } from './ui'

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
      <div className="auth">
        <Logo stacked />
        <h1>Sign in</h1>
        <p className="auth-lead">Use your By Their Fruit account. Church leaders get access when their church invites them.</p>
        <button type="button" className="btn btn-raised btn-large btn-block" onClick={withGoogle}>Continue with Google</button>
        <div className="divider"><span>or</span></div>
        <form onSubmit={withPassword} className="stack">
          <div className="group">
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="email" placeholder="name@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" placeholder="Required" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-filled btn-large btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="auth-foot">No account yet? <a href="https://bytheirfruit.church">Create one on bytheirfruit.church</a>.</p>
      </div>
    </main>
  )
}

/** App icon and name. `stacked` is the large centered version used on the sign-in and church screens. */
export function Logo({ stacked = false }: { stacked?: boolean }) {
  return (
    <div className={stacked ? 'logo logo-stacked' : 'logo'}>
      <AppIcon size={stacked ? 64 : 28} />
      <span className="logo-name">By Their Fruit <em>for Churches</em></span>
    </div>
  )
}
