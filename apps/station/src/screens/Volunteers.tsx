// The volunteer station: today's schedule, one tap to check in with
// early / on time / late against the slot, the volunteer label, and a
// walk-up path for someone not on the schedule. A kids-room role without a
// cleared background check is blocked here and raises a silent alert; the
// Phase 4 rule only notifies (plan §5).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { punctuality as punct } from '@btf/core'
import { lookup as rpcLookup, volunteers as fetchVolunteers } from '@/lib/api'
import { liveServices, type Service } from '@/lib/day'
import { errorText, fmtPhone, fmtTime } from '@/lib/format'
import { labelDate, printSheet } from '@/lib/labels'
import type { Command } from '@/lib/outbox'
import { useStation } from '@/lib/station'
import type { LookupPerson, VolunteerRow } from '@/lib/types'
import { uuidv7 } from '@/lib/uuid'
import { Keypad, Sheet } from './Keypad'

export function Volunteers() {
  const { day, presence, send, staff } = useStation()
  const [rows, setRows] = useState<VolunteerRow[] | null>(null)
  const [error, setError] = useState('')
  const [walkup, setWalkup] = useState(false)
  const [placing, setPlacing] = useState<{ person: { person_id: string; first_name: string; last_name: string; display_name: string }; row?: VolunteerRow } | null>(null)
  const [justIn, setJustIn] = useState<{ name: string; text: string } | null>(null)
  const live = useMemo(() => (day ? liveServices(day) : []), [day])
  const tz = day?.self.settings?.time_zone
  const load = useCallback(() => { fetchVolunteers().then((r) => { setRows(r.volunteers); setError('') }).catch((e) => setError(errorText(e))) }, [])
  useEffect(() => { load() }, [load])
  const stamp = presence.filter((p) => p.role !== 'child').map((p) => `${p.person_id}:${p.status}`).join('|')
  useEffect(() => { const t = window.setTimeout(load, 500); return () => window.clearTimeout(t) }, [stamp, load])
  if (!day) return null

  const isIn = (r: VolunteerRow) => r.attendance_status === 'in' || presence.some((p) => p.person_id === r.person_id && p.occurrence_id === r.occurrence_id && p.status === 'in')
  const service = (r: VolunteerRow): Service | null => live.find((s) => s.id === r.occurrence_id) ?? null

  const checkIn = async (person: { person_id: string; first_name: string; last_name: string }, s: Service, roomId: string, roleLabel: string, arriveBefore: number, row?: VolunteerRow) => {
    const room = day.rooms.find((r) => r.id === roomId)
    const at = new Date()
    const actor = staff ? { actor_person_id: staff.person_id } : {}
    if (room?.area_kind === 'kids' && (row ? row.credential_status !== 'cleared' : false)) {
      send([{ op: 'alert.raise', id: uuidv7(), kind: 'credential_block', occurrence_id: s.id, detail: { person_id: person.person_id, slot_id: row?.slot_id, room_id: roomId, status: row?.credential_status }, device_at: at.toISOString() }])
      setJustIn({ name: person.first_name, text: 'A cleared background check is needed for a kids room. Please see staff.' })
      return
    }
    const cmds: Command[] = [
      { op: 'event', id: uuidv7(), type: 'check_in', occurrence_id: s.id, person_id: person.person_id, role: 'volunteer', room_id: roomId, device_at: at.toISOString(), ...actor },
      { op: 'event', id: uuidv7(), type: 'label_print_requested', occurrence_id: s.id, person_id: person.person_id, label_kind: 'volunteer', printer_id: day.self.printer_id, device_at: at.toISOString(), ...actor },
    ]
    send(cmds)
    const p = punct(at, new Date(s.starts_at), arriveBefore, day.self.settings?.punctuality_grace_minutes ?? 10)
    setJustIn({ name: person.first_name, text: p.status === 'on_time' ? 'Right on time. Thank you!' : p.status === 'early' ? `${-p.minutes} minutes early. Thank you!` : `${p.minutes} minutes after your arrival time.` })
    setPlacing(null)
    await printSheet(day.templates.volunteer, [{ first_name: person.first_name, last_name: person.last_name, role: roleLabel, date: labelDate(day), service: s.name, church: day.self.org_name }])
  }

  const byService = new Map<string, VolunteerRow[]>()
  for (const r of rows ?? []) byService.set(r.occurrence_id ?? 'none', [...(byService.get(r.occurrence_id ?? 'none') ?? []), r])

  return (
    <main className="screen wide">
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Volunteers</h1>
        <span className="spacer" />
        <button type="button" className="btn btn-tinted" onClick={() => setWalkup(true)}>Not on the list</button>
        <button type="button" className="btn btn-plain" onClick={load}>Refresh</button>
      </div>
      {justIn && <p className="notice notice-ok" role="status" onClick={() => setJustIn(null)}>{justIn.name}: {justIn.text}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null ? <span className="spin" /> : rows.length === 0 ? <p className="muted">Nobody is scheduled today. Use “Not on the list” to check a volunteer in.</p> : (
        [...byService.entries()].map(([occ, list]) => {
          const s = live.find((x) => x.id === occ) ?? day.services.find((x) => x.id === occ) ?? null
          return (
            <section key={occ} style={{ marginBottom: 20 }}>
              <h2>{s ? `${s.name} · ${fmtTime(s.starts_at, tz)}` : 'No service'}</h2>
              <ul className="list">
                {list.map((r) => {
                  const here = isIn(r)
                  const svc = service(r)
                  const blocked = r.kids_area && r.credential_status !== 'cleared'
                  return (
                    <li key={r.assignment_id} className="item">
                      <span className="item-text">
                        <span className="item-title">{r.display_name}{blocked && <span className="tag tag-warn" style={{ marginLeft: 8 }}>Background check {r.credential_status === 'none' ? 'missing' : r.credential_status}</span>}</span>
                        <span className="item-sub">{r.label ?? r.room_name ?? r.role_name ?? 'Volunteer'} · arrive by {s ? fmtTime(new Date(new Date(s.starts_at).getTime() - r.arrive_minutes_before * 60_000).toISOString(), tz) : '—'}{here ? ` · in${r.punctuality ? `, ${r.punctuality.replace('_', ' ')}` : ''}` : ''}</span>
                      </span>
                      {here ? <span className="tag tag-ok">In</span> : !svc ? <span className="tag">No service</span> : (
                        <button type="button" className="btn btn-filled" onClick={() => {
                          if (r.room_id) void checkIn({ person_id: r.person_id, first_name: r.first_name, last_name: r.last_name }, svc, r.room_id, r.label ?? r.room_name ?? 'Volunteer', r.arrive_minutes_before, r)
                          else setPlacing({ person: { person_id: r.person_id, first_name: r.first_name, last_name: r.last_name, display_name: r.display_name }, row: r })
                        }}>Check in</button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })
      )}
      {walkup && <WalkUp onClose={() => setWalkup(false)} onPick={(p) => { setWalkup(false); setPlacing({ person: { person_id: p.person_id, first_name: p.first_name, last_name: p.last_name ?? '', display_name: p.display_name } }) }} />}
      {placing && (
        <Sheet title={`Where is ${placing.person.first_name} serving?`} onClose={() => setPlacing(null)}>
          <div className="stack">
            {live.length === 0 ? <p className="notice">No service is running.</p> : live.map((s) => (
              <div key={s.id}>
                <h2 style={{ fontSize: 17 }}>{s.name} · {fmtTime(s.starts_at, tz)}</h2>
                <ul className="list">{day.rooms.map((r) => <li key={r.id}><button type="button" className="item tap" onClick={() => checkIn(placing.person, s, r.id, placing.row?.label ?? r.name, placing.row?.arrive_minutes_before ?? 15, placing.row)}><span className="item-text"><span className="item-title">{r.name}</span><span className="item-sub">{r.area_name}</span></span></button></li>)}</ul>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </main>
  )
}

function WalkUp({ onClose, onPick }: { onClose: () => void; onPick: (p: LookupPerson) => void }) {
  const [digits, setDigits] = useState('')
  const [name, setName] = useState('')
  const [people, setPeople] = useState<LookupPerson[] | null>(null)
  const [error, setError] = useState('')
  const run = async (q: string, method: 'phone' | 'last4' | 'name') => {
    setError('')
    try {
      const r = await rpcLookup(q, method)
      if (!r.ok) { setError(r.error === 'locked' ? 'Too many tries.' : 'Try again.'); return }
      setPeople(r.people.filter((p) => !p.is_child))
    } catch (e) { setError(errorText(e)) }
  }
  const looked = useRef('')
  useEffect(() => {
    if (digits.length === 10 && looked.current !== digits) { looked.current = digits; void run(digits, 'phone') }
    if (digits.length < 10) looked.current = ''
  }, [digits])
  return (
    <Sheet title="Find a volunteer" onClose={onClose}>
      <div className="stack">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) void run(name.trim(), 'name') }}>
          <label className="field" style={{ flex: 1 }}><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
          <button type="submit" className="btn btn-tinted" style={{ alignSelf: 'flex-end' }}>Search</button>
        </form>
        <div className="readout">{digits ? fmtPhone(digits) : <span className="ghost">or phone number</span>}</div>
        <Keypad onDigit={(d) => setDigits((x) => (x + d).slice(0, 10))} onBackspace={() => setDigits((x) => x.slice(0, -1))} onClear={() => setDigits('')} action={digits.length === 4 ? 'Last 4' : undefined} onAction={() => run(digits, 'last4')} />
        {error && <p className="error" role="alert">{error}</p>}
        {people && (people.length === 0 ? <p className="muted">No adult matches. They can be added in the church app.</p> : (
          <ul className="list">{people.map((p) => <li key={p.person_id}><button type="button" className="item tap" onClick={() => onPick(p)}><span className="item-text"><span className="item-title">{p.display_name}</span></span></button></li>)}</ul>
        ))}
      </div>
    </Sheet>
  )
}
