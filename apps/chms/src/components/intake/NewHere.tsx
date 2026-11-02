'use client'

// The public "I'm new" form: a family tells the church about itself before
// or after a first visit. No account; the intake edge function verifies
// Turnstile when the church has it configured, and the database makes a
// guest family and a follow-up task for the right director.
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Switch } from '@/components/ui'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''
interface Kid { first: string; last: string; birthdate: string; gender: '' | 'male' | 'female'; allergies: string }
const blankKid = (): Kid => ({ first: '', last: '', birthdate: '', gender: '', allergies: '' })

export function NewHere() {
  return <Suspense fallback={null}><Form /></Suspense>
}

function Form() {
  const slug = useSearchParams().get('church') ?? ''
  const [church, setChurch] = useState<{ name: string; turnstile: boolean } | null | undefined>(undefined)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [kids, setKids] = useState<Kid[]>([blankKid()])
  const [sms, setSms] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<null | { repeat: boolean }>(null)
  const widget = useRef<HTMLDivElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!slug) { setChurch(null); return }
    fetch(`${supabaseUrl}/functions/v1/intake?church=${encodeURIComponent(slug)}`, { headers: { apikey: supabaseAnonKey } })
      .then(async (r) => (r.ok ? r.json() : null)).then((d) => setChurch(d && d.name ? { name: d.name, turnstile: !!d.turnstile } : null)).catch(() => setChurch(null))
  }, [slug])

  // Cloudflare Turnstile, only when the church has it and the build knows the site key
  useEffect(() => {
    if (!church?.turnstile || !SITE_KEY || document.getElementById('cf-turnstile-script')) return
    const s = document.createElement('script')
    s.id = 'cf-turnstile-script'
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    s.async = true
    document.head.appendChild(s)
  }, [church])

  const valid = first.trim() && last.trim() && (phone.replace(/\D/g, '').length === 10 || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
    && kids.every((k) => (!k.first.trim() && !k.birthdate) || (k.first.trim() && k.birthdate))

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true); setError('')
    const token = (widget.current?.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value ?? ''
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/intake`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
        body: JSON.stringify({
          church: slug, token,
          adult: { first_name: first.trim(), last_name: last.trim(), phone: phone.trim() || null, email: email.trim() || null },
          children: kids.filter((k) => k.first.trim() && k.birthdate).map((k) => ({ first_name: k.first.trim(), last_name: k.last.trim() || null, birthdate: k.birthdate, gender: k.gender || null, allergies: k.allergies.trim() || null })),
          sms_consent: sms && phone.replace(/\D/g, '').length === 10, consent_version: 'v1',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { setError(data.error ?? 'Something went wrong. Please try again.'); return }
      setDone({ repeat: !!data.repeat })
    } catch { setError('No connection. Please try again.') } finally { setBusy(false) }
  }

  if (church === undefined) return <main className="public-page"><div className="inner"><p className="muted">Loading…</p></div></main>
  if (church === null) return <main className="public-page"><div className="inner"><h1>Hmm, which church?</h1><p className="muted">This link is missing the church. Please scan the code again or ask at the welcome desk.</p></div></main>
  if (done) {
    return (
      <main className="public-page"><div className="inner thanks">
        <h1>Thank you, {first.trim()}!</h1>
        <p className="lead" style={{ margin: '0 auto 16px' }}>{done.repeat ? 'We already have your details from today.' : `Someone from ${church.name} will be in touch soon.`} When you arrive, the check-in desk can find you by your phone number.</p>
      </div></main>
    )
  }

  return (
    <main className="public-page">
      <div className="inner">
        <div className="brand"><Leaf /> <span>{church.name}</span></div>
        <h1>New here? Welcome!</h1>
        <p className="lead">Tell us a little about your family so we can say hello and have your children&apos;s rooms ready.</p>
        <form className="card form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <fieldset>
            <legend className="group-head">About you</legend>
            <div className="group">
              <label className="field"><span>First name</span><input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" required maxLength={100} /></label>
              <label className="field"><span>Last name</span><input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" required maxLength={100} /></label>
              <label className="field"><span>Mobile number</span><input inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(000) 000-0000" maxLength={40} /></label>
              <label className="field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} /></label>
            </div>
            <p className="group-foot">A mobile number or an email, whichever you prefer.</p>
          </fieldset>
          <fieldset>
            <legend className="group-head">Children (optional)</legend>
            {kids.map((k, i) => (
              <div key={i} className="group" style={{ marginBottom: 12 }}>
                <label className="field"><span>First name</span><input value={k.first} onChange={(e) => setKids((ks) => ks.map((x, j) => (j === i ? { ...x, first: e.target.value } : x)))} maxLength={100} /></label>
                <label className="field"><span>Last name</span><input value={k.last} placeholder={last || 'Same as yours'} onChange={(e) => setKids((ks) => ks.map((x, j) => (j === i ? { ...x, last: e.target.value } : x)))} maxLength={100} /></label>
                <label className="field"><span>Birthdate</span><input type="date" max={today} value={k.birthdate} onChange={(e) => setKids((ks) => ks.map((x, j) => (j === i ? { ...x, birthdate: e.target.value } : x)))} /></label>
                <label className="field"><span>Gender (optional)</span>
                  <select value={k.gender} onChange={(e) => setKids((ks) => ks.map((x, j) => (j === i ? { ...x, gender: e.target.value as Kid['gender'] } : x)))}><option value="">Not said</option><option value="female">Girl</option><option value="male">Boy</option></select>
                </label>
                <label className="field"><span>Allergies (optional)</span><input value={k.allergies} onChange={(e) => setKids((ks) => ks.map((x, j) => (j === i ? { ...x, allergies: e.target.value } : x)))} placeholder="e.g. peanuts" maxLength={2000} /></label>
                {kids.length > 1 && <div className="field"><button type="button" className="btn btn-plain btn-small" onClick={() => setKids((ks) => ks.filter((_, j) => j !== i))}>Remove this child</button></div>}
              </div>
            ))}
            {kids.length < 10 && <button type="button" className="btn btn-tinted" onClick={() => setKids((ks) => [...ks, blankKid()])}>Add another child</button>}
          </fieldset>
          <fieldset>
            <div className="group">
              <div className="field"><Switch label="Text me about my children while they are checked in (safety messages only). Reply STOP to opt out." checked={sms} onChange={setSms} /></div>
            </div>
          </fieldset>
          {church.turnstile && SITE_KEY && <div ref={widget} className="cf-turnstile" data-sitekey={SITE_KEY} data-theme="auto" style={{ marginBottom: 16 }} />}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions"><button type="submit" className="btn btn-filled btn-large" disabled={!valid || busy}>{busy ? 'Sending…' : 'Send'}</button></div>
        </form>
        <p className="small muted" style={{ marginTop: 16 }}>We keep your details private and use them only to welcome your family. By Their Fruit for Churches.</p>
      </div>
    </main>
  )
}

function Leaf() {
  return <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7.2" fill="#1d1d1f" /><path d="M16 6C16 6 10 13 10 18C10 21.3 12.7 24 16 24C19.3 24 22 21.3 22 18C22 13 16 6 16 6Z" fill="#007aff" /></svg>
}
