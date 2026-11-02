// A classroom device: the live roster of its rooms, moves, check-out with
// the pickup check and the code, and reprints. The roster RPC returns first
// names and last initials, flags and code status; it is logged once per
// read. Volunteers never see phone numbers or notes here.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { capacityState } from '@btf/core'
import { pickups as fetchPickups, roster as fetchRoster } from '@/lib/api'
import { liveServices, type Service } from '@/lib/day'
import { errorText, fmtTime } from '@/lib/format'
import { labelDate, printSheet } from '@/lib/labels'
import type { Command } from '@/lib/outbox'
import { useStation } from '@/lib/station'
import type { PickupList, RoomInfo, RosterRow } from '@/lib/types'
import { uuidv7 } from '@/lib/uuid'
import { Sheet } from './Keypad'

export function Roster() {
  const { day, presence } = useStation()
  const live = useMemo(() => (day ? liveServices(day) : []), [day])
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  useEffect(() => {
    if (serviceId && live.some((s) => s.id === serviceId)) return
    const now = Date.now()
    const running = live.find((s) => new Date(s.starts_at).getTime() - 75 * 60_000 <= now && new Date(s.ends_at).getTime() >= now)
    setServiceId((running ?? live[0])?.id ?? null)
  }, [live, serviceId])
  if (!day) return null
  const service = live.find((s) => s.id === serviceId) ?? null
  const tz = day.self.settings?.time_zone
  const counts = (room: RoomInfo) => {
    const rows = presence.filter((p) => p.occurrence_id === serviceId && p.room_id === room.id && p.status === 'in')
    return { children: rows.filter((r) => r.role === 'child').length, adults: rows.filter((r) => r.role !== 'child').length }
  }
  if (service && roomId) {
    const room = day.rooms.find((r) => r.id === roomId)
    if (room) return <RoomRoster service={service} room={room} onBack={() => setRoomId(null)} />
  }
  return (
    <main className="screen wide">
      <div className="row" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Rooms</h1>
        <span className="spacer" />
        {live.length > 1 && <div className="chips">{live.map((s) => <button key={s.id} type="button" className={`chip${s.id === serviceId ? ' on' : ''}`} onClick={() => setServiceId(s.id)}>{s.name} · {fmtTime(s.starts_at, tz)}</button>)}</div>}
      </div>
      {!service ? <p className="notice">No service is running today.</p> : (
        <div className="rooms">
          {day.rooms.map((r) => {
            const c = counts(r)
            const cap = capacityState({ ...r, criteria: r.criteria }, c.children, c.adults)
            return (
              <button key={r.id} type="button" className="room-card" onClick={() => setRoomId(r.id)}>
                <span className="name">{r.name}</span>
                <span className="count">{c.children}{r.capacity ? <span className="muted" style={{ fontSize: 16, fontWeight: 400 }}> / {r.capacity}</span> : null}</span>
                <span className="small muted">{c.adults} adult{c.adults === 1 ? '' : 's'}{cap.adultsNeeded !== null ? ` · ${cap.adultsNeeded} needed` : ''}</span>
                {cap.state !== 'ok' && <span className={`tag ${cap.state === 'near_capacity' ? 'tag-warn' : 'tag-bad'}`}>{cap.state === 'near_capacity' ? 'Nearly full' : cap.state === 'at_capacity' ? 'Full' : 'Over ratio'}</span>}
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}

function RoomRoster({ service, room, onBack }: { service: Service; room: RoomInfo; onBack: () => void }) {
  const { day, presence, send, staff } = useStation()
  const [rows, setRows] = useState<RosterRow[] | null>(null)
  const [error, setError] = useState('')
  const [acting, setActing] = useState<{ row: RosterRow; what: 'move' | 'out' } | null>(null)
  const [showOut, setShowOut] = useState(false)
  const tz = day?.self.settings?.time_zone
  const load = useCallback(() => { fetchRoster(service.id, room.id).then((r) => { setRows(r); setError('') }).catch((e) => setError(errorText(e))) }, [service.id, room.id])
  useEffect(() => { load() }, [load])
  // every live change in this room re-reads the roster (debounced)
  const stamp = presence.filter((p) => p.occurrence_id === service.id && (p.room_id === room.id)).map((p) => `${p.person_id}:${p.status}:${p.room_id}`).join('|')
  useEffect(() => { const t = window.setTimeout(load, 400); return () => window.clearTimeout(t) }, [stamp, load])
  if (!day) return null

  const here = (rows ?? []).filter((r) => r.status === 'in' && r.room_id === room.id)
  const gone = (rows ?? []).filter((r) => r.status === 'out')
  const actor = staff ? { actor_person_id: staff.person_id } : {}

  const move = (row: RosterRow, toRoomId: string) => {
    send([{ op: 'event', id: uuidv7(), type: 'move', occurrence_id: service.id, person_id: row.person_id, role: row.role, room_id: toRoomId, from_room_id: room.id, device_at: new Date().toISOString(), ...actor }])
    setActing(null)
  }
  const reprint = async (row: RosterRow) => {
    const at = new Date().toISOString()
    send([{ op: 'event', id: uuidv7(), type: 'label_print_requested', occurrence_id: service.id, person_id: row.person_id, label_kind: row.role === 'child' ? 'child' : 'volunteer', printer_id: day.self.printer_id, device_at: at, ...actor }])
    const [first, initial] = row.display_name.split(' ')
    await printSheet(row.role === 'child' ? day.templates.child : day.templates.volunteer, [{
      first_name: first, last_name: initial ?? '', room: room.name, service: service.name, date: labelDate(day), code: row.codes[0] ?? null, allergy_short: row.allergy_short,
      flags: { allergy: row.has_allergy, medical: row.has_medical, special_needs: row.has_special_needs }, role: room.name,
    }])
  }

  return (
    <main className="screen wide">
      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-plain" onClick={onBack}>‹ Rooms</button>
        <h1 style={{ margin: 0 }}>{room.name}</h1>
        <span className="muted">{service.name} · {here.length} in</span>
        <span className="spacer" />
        <button type="button" className="btn btn-plain" onClick={load}>Refresh</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null ? <span className="spin" /> : here.length === 0 ? <p className="muted">Nobody is in {room.name} right now.</p> : (
        <ul className="list">
          {here.map((r) => (
            <li key={r.person_id} className="item">
              <span className="item-text">
                <span className="item-title">{r.display_name}
                  {(r.has_allergy || r.has_medical || r.has_special_needs) && <span className="flags" style={{ marginLeft: 8 }}>{r.has_allergy && <span className="flag" title="Allergy">A</span>}{r.has_medical && <span className="flag" title="Medical">M</span>}{r.has_special_needs && <span className="flag" title="Special needs">S</span>}</span>}
                  {r.restriction && <span className="tag tag-warn" style={{ marginLeft: 8 }}>See staff</span>}
                  {r.anomalies.length > 0 && <span className="tag" style={{ marginLeft: 8 }}>{r.anomalies.join(', ')}</span>}
                </span>
                <span className="item-sub">
                  {r.role !== 'child' ? `${r.role}${r.punctuality ? ` · ${r.punctuality.replace('_', ' ')}` : ''}` : `in since ${fmtTime(r.checked_in_at, tz)}${r.guardian_first_name ? ` · with ${r.guardian_first_name}` : ''}`}
                  {r.allergy_short ? ` · ${r.allergy_short}` : ''}{r.codes.length > 0 ? ` · code ${r.codes.join(', ')}` : ' · no code'}
                </span>
              </span>
              <button type="button" className="btn btn-tinted" onClick={() => setActing({ row: r, what: 'move' })}>Move</button>
              <button type="button" className="btn btn-filled" onClick={() => setActing({ row: r, what: 'out' })}>Check out</button>
              <button type="button" className="btn btn-plain" aria-label={`Reprint label for ${r.display_name}`} onClick={() => reprint(r)}>Reprint</button>
            </li>
          ))}
        </ul>
      )}
      {gone.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-plain" onClick={() => setShowOut((s) => !s)}>{showOut ? 'Hide' : 'Show'} {gone.length} checked out</button>
          {showOut && <ul className="list" style={{ marginTop: 8 }}>{gone.map((r) => <li key={r.person_id} className="item"><span className="item-text"><span className="item-title muted">{r.display_name}</span><span className="item-sub">out {fmtTime(r.checked_out_at, tz)}</span></span></li>)}</ul>}
        </div>
      )}
      {acting?.what === 'move' && (
        <Sheet title={`Move ${acting.row.display_name}`} onClose={() => setActing(null)}>
          <ul className="list">{day.rooms.filter((r) => r.id !== room.id).map((r) => <li key={r.id}><button type="button" className="item tap" onClick={() => move(acting.row, r.id)}><span className="item-text"><span className="item-title">{r.name}</span><span className="item-sub">{r.area_name}</span></span></button></li>)}</ul>
        </Sheet>
      )}
      {acting?.what === 'out' && <CheckOut row={acting.row} service={service} room={room} onClose={() => setActing(null)} />}
    </main>
  )
}

function CheckOut({ row, service, room, onClose }: { row: RosterRow; service: Service; room: RoomInfo; onClose: () => void }) {
  const { send, staff, outbox } = useStation()
  const [list, setList] = useState<PickupList | null>(null)
  const [error, setError] = useState('')
  const [picker, setPicker] = useState<{ person_id?: string; pickup_id?: string; name?: string; restricted?: boolean; label: string } | null>(null)
  const [code, setCode] = useState('')
  const [named, setNamed] = useState('')
  const [refused, setRefused] = useState(false)
  const [sent, setSent] = useState(false)
  useEffect(() => { if (row.role === 'child') fetchPickups(row.person_id).then(setList).catch((e) => setError(errorText(e))); else setList({ guardians: [], authorized: [], restricted: [] }) }, [row])

  // a restricted pickup is refused by the server with 'see_staff' and a silent alert; the screen only says see staff
  useEffect(() => {
    if (!sent) return
    const un = outbox.subscribe(() => {
      if (outbox.rejected().some((r) => r.cmd.person_id === row.person_id && r.cmd.type === 'check_out' && r.reason === 'see_staff')) setRefused(true)
    })
    return un
  }, [sent, outbox, row.person_id])

  const canSend = row.role !== 'child' || picker !== null || named.trim().length > 1
  const submit = () => {
    if (!canSend) return
    if (picker?.restricted) { setRefused(true); return }   // never completes; the server would refuse it and alert too
    const actor = staff ? { actor_person_id: staff.person_id, verified_by_person_id: staff.person_id } : {}
    const cmd: Command = {
      op: 'event', id: uuidv7(), type: 'check_out', occurrence_id: service.id, person_id: row.person_id, role: row.role, room_id: room.id, device_at: new Date().toISOString(), ...actor,
      ...(picker?.person_id ? { picked_up_by_person_id: picker.person_id } : picker?.pickup_id ? { picked_up_by_pickup_id: picker.pickup_id } : named.trim() ? { picked_up_by_name: named.trim() } : {}),
      ...(code ? { code: code.toUpperCase() } : {}),
    }
    send([cmd])
    setSent(true)
    if (!picker?.restricted) onClose()
  }

  if (refused || picker?.restricted) {
    return (
      <Sheet title="Please see staff" onClose={onClose}>
        <p className="notice notice-bad">Please see the welcome desk to complete this pickup.</p>
        {picker?.restricted && <p className="small muted">A staff member with the church app can review this.</p>}
      </Sheet>
    )
  }

  return (
    <Sheet title={`Check out ${row.display_name}`} onClose={onClose}>
      <div className="stack">
        {row.role === 'child' && (list === null ? <span className="spin" /> : (
          <>
            <h2 style={{ fontSize: 17 }}>Who is picking up?</h2>
            <div className="chips">
              {list.guardians.map((g) => <button key={g.person_id} type="button" className={`chip${picker?.person_id === g.person_id ? ' on' : ''}`} onClick={() => setPicker({ person_id: g.person_id, label: g.display_name })}>{g.display_name}</button>)}
              {list.authorized.map((a) => <button key={a.pickup_id} type="button" className={`chip${picker?.pickup_id === a.pickup_id ? ' on' : ''}`} onClick={() => setPicker(a.person_id ? { person_id: a.person_id, label: a.display_name } : { pickup_id: a.pickup_id, label: a.display_name })}>{a.display_name}{a.relationship ? ` (${a.relationship})` : ''}</button>)}
              {list.restricted.map((r) => <button key={r.pickup_id} type="button" className={`chip${picker?.pickup_id === r.pickup_id ? ' on' : ''}`} onClick={() => setPicker({ pickup_id: r.pickup_id, person_id: r.person_id, restricted: true, label: r.display_name })}>{r.display_name}</button>)}
            </div>
            <label className="field"><span>Someone else (name)</span><input value={named} onChange={(e) => { setNamed(e.target.value); if (e.target.value) setPicker(null) }} placeholder="Not on the list: write their name, then see staff" /></label>
            <h2 style={{ fontSize: 17 }}>Pickup code on their tag</h2>
            <div className="readout" aria-live="polite">{code || <span className="ghost">{row.codes.length ? '• • •' : 'no code issued'}</span>}</div>
            <CodePad value={code} onChange={setCode} />
          </>
        ))}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" className="btn btn-filled btn-large btn-block" disabled={!canSend} onClick={submit}>
          {row.codes.length > 0 && code && !row.codes.includes(code.toUpperCase()) ? 'Code does not match · check out anyway' : 'Check out'}
        </button>
      </div>
    </Sheet>
  )
}

const CODE_KEYS = ['A', 'C', 'D', 'E', 'F', 'H', 'J', 'K', 'M', 'N', 'P', 'R', 'T', 'U', 'V', 'W', 'X', 'Y', '3', '4', '6', '7', '9']
function CodePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="keypad" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }} role="group" aria-label="Code">
      {CODE_KEYS.map((k) => <button key={k} type="button" className="key" style={{ minHeight: 56, fontSize: 22 }} onClick={() => onChange((value + k).slice(0, 4))}>{k}</button>)}
      <button type="button" className="key soft" style={{ minHeight: 56 }} onClick={() => onChange(value.slice(0, -1))} aria-label="Backspace">⌫</button>
    </div>
  )
}

