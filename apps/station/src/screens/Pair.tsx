import { useState } from 'react'
import { pair } from '@/lib/api'
import { errorText } from '@/lib/format'

export function Pair({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const shown = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}` : clean
  return (
    <main className="attract">
      <div className="leaf" aria-hidden="true"><svg width="56" height="56" viewBox="0 0 32 32"><path d="M16 6C16 6 10 13 10 18C10 21.3 12.7 24 16 24C19.3 24 22 21.3 22 18C22 13 16 6 16 6Z" fill="#007aff" /></svg></div>
      <h1>Pair this device</h1>
      <p className="muted">In the church app, open Check-in → Stations and tap <strong>Pair device</strong>. Type the code it shows.</p>
      <form className="stack" style={{ width: '100%', maxWidth: 360 }} onSubmit={async (e) => {
        e.preventDefault()
        if (clean.length !== 8 || busy) return
        setBusy(true); setError('')
        try { await pair(clean); onPaired() } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
      }}>
        <label className="field"><span>Pairing code</span>
          <input autoFocus autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text" value={shown} placeholder="ABCD-EFGH"
            style={{ textAlign: 'center', fontSize: 28, letterSpacing: '0.1em', fontFamily: 'ui-monospace, Menlo, monospace' }}
            onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8))} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-filled btn-large btn-block" disabled={clean.length !== 8 || busy}>{busy ? 'Pairing…' : 'Pair'}</button>
      </form>
    </main>
  )
}
