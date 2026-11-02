// Behind a staff PIN (server-checked, per person, five misses lock it):
// sync state and rejections, alerts, a printer test, reload the setup,
// unpair. The PIN never overrides a restriction (plan §5).
import { useEffect, useState } from 'react'
import { openAlerts, staffList, unpairSelf, verifyPin } from '@/lib/api'
import { errorText, fmtTime } from '@/lib/format'
import { printSheet, labelDate } from '@/lib/labels'
import { useStation } from '@/lib/station'
import type { AlertRow, StaffPerson } from '@/lib/types'
import { Keypad, Sheet } from './Keypad'

const ALERT_TEXT: Record<string, string> = {
  restricted_pickup: 'Restricted pickup attempted', restricted_checkin: 'Restricted check-in attempted', credential_block: 'Volunteer without a cleared background check',
  over_ratio: 'Room over ratio', duplicate_code: 'A code was presented by another family', unknown_child: 'A child this device did not know', other: 'Alert',
}

export function Staff({ onClose }: { onClose: () => void }) {
  const { staff, setStaff, day } = useStation()
  const [people, setPeople] = useState<StaffPerson[] | null>(null)
  const [who, setWho] = useState<StaffPerson | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (staff) return
    staffList().then(setPeople).catch((e) => { setError(errorText(e)); setPeople([]) })
  }, [staff])

  if (staff) return <Menu onClose={onClose} />

  const submit = async () => {
    if (!who || pin.length < 4 || busy) return
    setBusy(true); setError('')
    try {
      const r = await verifyPin(who.person_id, pin)
      if (r.ok) setStaff({ person_id: r.person_id, display_name: who.display_name, permissions: r.permissions, until: Date.now() + 30 * 60_000 })
      else { setError(r.error); setPin('') }
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  return (
    <Sheet title="Staff" onClose={onClose}>
      {!who ? (
        <div className="stack">
          <p className="muted">Who are you? Your PIN is set in the church app (Check-in → Settings).</p>
          {people === null ? <span className="spin" /> : people.length === 0 ? <p className="muted">No staff PINs are set for this church yet.</p> : (
            <ul className="list">{people.map((p) => <li key={p.person_id}><button type="button" className="item tap" onClick={() => setWho(p)}><span className="item-text"><span className="item-title">{p.display_name}</span></span></button></li>)}</ul>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {day?.self.mode === 'kiosk' && <p className="small muted">A PIN unlocks staff tools on this kiosk for thirty minutes. It never clears a restriction: that needs the church app.</p>}
        </div>
      ) : (
        <div className="keypad-screen">
          <p className="muted center">{who.display_name}, enter your PIN</p>
          <div className="readout" aria-live="polite" aria-label={`${pin.length} digits entered`}>{'•'.repeat(pin.length) || <span className="ghost">PIN</span>}</div>
          <Keypad onDigit={(d) => setPin((p) => (p + d).slice(0, 8))} onBackspace={() => setPin((p) => p.slice(0, -1))} onClear={() => setPin('')} disabled={busy} />
          {error && <p className="error center" role="alert">{error}</p>}
          <button type="button" className="btn btn-filled btn-large btn-block" disabled={pin.length < 4 || busy} onClick={submit}>{busy ? 'Checking…' : 'Unlock'}</button>
          <button type="button" className="btn btn-plain" onClick={() => { setWho(null); setPin('') }}>Not {who.display_name.split(' ')[0]}</button>
        </div>
      )}
    </Sheet>
  )
}

function Menu({ onClose }: { onClose: () => void }) {
  const { day, outbox, outboxState, staff, setStaff, refreshDay, reload, flush, alerts, dismissAlert, codes } = useStation()
  const [tab, setTab] = useState<'menu' | 'sync' | 'alerts'>('menu')
  const [serverAlerts, setServerAlerts] = useState<AlertRow[] | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const tz = day?.self.settings?.time_zone
  useEffect(() => { if (tab === 'alerts') openAlerts().then(setServerAlerts).catch((e) => setError(errorText(e))) }, [tab])
  if (!day || !staff) return null

  const act = async (fn: () => Promise<unknown>, done: string) => { setError(''); setStatus(''); try { await fn(); setStatus(done) } catch (e) { setError(errorText(e)) } }

  if (tab === 'sync') {
    const rejected = outbox.rejected()
    return (
      <Sheet title="Sync" onClose={onClose}>
        <div className="stack">
          <p className="muted">{outboxState.pending} waiting · last synced {outboxState.lastSyncAt ? fmtTime(outboxState.lastSyncAt, tz) : 'never'} · {codes?.count() ?? 0} codes held</p>
          <div className="row"><button type="button" className="btn btn-tinted" onClick={() => act(flush, 'Synced')}>Sync now</button><button type="button" className="btn btn-plain" onClick={() => setTab('menu')}>Back</button></div>
          {rejected.length === 0 ? <p className="muted">Nothing was refused by the server.</p> : (
            <ul className="list">
              {rejected.map((r) => (
                <li key={r.cmd.id} className="item">
                  <span className="item-text">
                    <span className="item-title">{String(r.cmd.op)}{r.cmd.type ? ` · ${String(r.cmd.type)}` : ''}</span>
                    <span className="item-sub">{r.reason}{r.detail ? ` · ${r.detail}` : ''} · {fmtTime(r.rejected_at, tz)}</span>
                  </span>
                  <button type="button" className="btn btn-plain" onClick={() => outbox.clearRejection(r.cmd.id)}>Dismiss</button>
                </li>
              ))}
            </ul>
          )}
          {status && <p className="ok" role="status">{status}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </Sheet>
    )
  }

  if (tab === 'alerts') {
    return (
      <Sheet title="Alerts" onClose={onClose}>
        <div className="stack">
          <button type="button" className="btn btn-plain" onClick={() => setTab('menu')}>Back</button>
          {alerts.length > 0 && (
            <ul className="list">{alerts.map((a, i) => <li key={i} className="item"><span className="item-text"><span className="item-title">{ALERT_TEXT[a] ?? a}</span><span className="item-sub">Raised by this device's last sync</span></span><button type="button" className="btn btn-plain" onClick={() => dismissAlert(i)}>Dismiss</button></li>)}</ul>
          )}
          {serverAlerts === null ? <span className="spin" /> : serverAlerts.length === 0 ? <p className="muted">No open alerts for this station.</p> : (
            <ul className="list">{serverAlerts.map((a) => <li key={a.id} className="item"><span className="item-text"><span className="item-title">{ALERT_TEXT[a.kind] ?? a.kind}</span><span className="item-sub">{fmtTime(a.raised_at, tz)} · acknowledge in the church app</span></span></li>)}</ul>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={`Staff · ${staff.display_name}`} onClose={onClose}>
      <ul className="list">
        <li><button type="button" className="item tap" onClick={() => setTab('sync')}><span className="item-text"><span className="item-title">Sync</span><span className="item-sub">{outboxState.pending} waiting · {outboxState.rejected} refused</span></span></button></li>
        <li><button type="button" className="item tap" onClick={() => setTab('alerts')}><span className="item-text"><span className="item-title">Alerts</span><span className="item-sub">Restricted pickups, duplicate codes, credentials</span></span></button></li>
        <li><button type="button" className="item tap" onClick={() => act(refreshDay, 'Setup reloaded')}><span className="item-text"><span className="item-title">Reload setup</span><span className="item-sub">Rooms, services, labels · loaded {fmtTime(day.loaded_at, tz)}</span></span></button></li>
        <li><button type="button" className="item tap" onClick={() => act(() => printSheet(day.templates.child, [{ first_name: 'Test', last_name: 'Label', room: day.rooms[0]?.name ?? 'Room', service: day.services[0]?.name ?? 'Service', date: labelDate(day), code: 'TEST', allergy_short: 'Peanut', flags: { allergy: true } }]), 'Test label sent')}><span className="item-text"><span className="item-title">Print a test label</span><span className="item-sub">{day.printer ? `${day.printer.name} (${day.printer.model ?? day.printer.connection})` : 'The browser’s default printer'}</span></span></button></li>
        <li><button type="button" className="item tap" onClick={() => setStaff(null)}><span className="item-text"><span className="item-title">Lock</span><span className="item-sub">Hide the staff tools again</span></span></button></li>
        <li><button type="button" className="item tap" onClick={() => { if (window.confirm('Unpair this device? It stops working at once; pair it again with a new code.')) act(async () => { await unpairSelf(); await reload() }, 'Unpaired') }}><span className="item-text"><span className="item-title" style={{ color: 'var(--red-text)' }}>Unpair this device</span><span className="item-sub">Station {day.self.name} · {day.self.mode}</span></span></button></li>
      </ul>
      {status && <p className="ok" role="status" style={{ marginTop: 12 }}>{status}</p>}
      {error && <p className="error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
    </Sheet>
  )
}
