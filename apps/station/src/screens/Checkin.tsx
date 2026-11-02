// Self-serve kiosk and staffed desk: attract → phone keypad (or last four /
// name / scan on a staffed desk) → the family → check in → labels and the
// pickup code. New families sign up from the lookup screen. One purpose per
// screen, phone first (plan §5, the Subsplash parity bar).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LabelData } from '@btf/core'
import { household as fetchHousehold, lookup as rpcLookup } from '@/lib/api'
import { liveServices, roomsFor, type Service } from '@/lib/day'
import { errorText, fmtPhone, fmtTime } from '@/lib/format'
import { labelDate, printSheet } from '@/lib/labels'
import type { Command } from '@/lib/outbox'
import { describeChild, suggestFor } from '@/lib/rooms'
import { useStation } from '@/lib/station'
import type { HouseholdMember, HouseholdView, LookupHousehold, LookupMethod } from '@/lib/types'
import { uuidv7 } from '@/lib/uuid'
import { Keypad } from './Keypad'

type Found = { method: LookupMethod; last4?: string; households: LookupHousehold[] }
type Step =
  | { kind: 'attract' }
  | { kind: 'lookup'; notice?: string }
  | { kind: 'pick'; found: Found }
  | { kind: 'family'; householdId: string; found: Found; local?: HouseholdView }
  | { kind: 'new' }
  | { kind: 'done'; code: string | null; lines: string[]; printed: boolean }

export function Checkin({ staffed }: { staffed: boolean }) {
  const [step, setStep] = useState<Step>(staffed ? { kind: 'lookup' } : { kind: 'attract' })
  const home = useCallback(() => setStep(staffed ? { kind: 'lookup' } : { kind: 'attract' }), [staffed])

  // a kiosk goes back to the attract screen after two minutes without a touch
  useEffect(() => {
    if (staffed || step.kind === 'attract') return
    let t = window.setTimeout(home, 120_000)
    const bump = () => { window.clearTimeout(t); t = window.setTimeout(home, 120_000) }
    window.addEventListener('pointerdown', bump)
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', bump) }
  }, [staffed, step.kind, home])

  if (step.kind === 'attract') return <Attract onStart={() => setStep({ kind: 'lookup' })} />
  if (step.kind === 'lookup') return <Lookup staffed={staffed} notice={step.notice} onFound={(found) => {
    if (found.households.length === 1) setStep({ kind: 'family', householdId: found.households[0].id, found })
    else if (found.households.length > 1) setStep({ kind: 'pick', found })
    else setStep({ kind: 'lookup', notice: "We couldn't find that. Try again, or sign up below." })
  }} onNew={() => setStep({ kind: 'new' })} onHome={home} />
  if (step.kind === 'pick') return <PickHousehold found={step.found} onPick={(id) => setStep({ kind: 'family', householdId: id, found: step.found })} onBack={() => setStep({ kind: 'lookup' })} />
  if (step.kind === 'family') return <Family key={step.householdId} householdId={step.householdId} found={step.found} local={step.local} staffed={staffed}
    onDone={(code, lines, printed) => setStep({ kind: 'done', code, lines, printed })} onBack={() => setStep({ kind: 'lookup' })} />
  if (step.kind === 'new') return <NewFamily onBack={() => setStep({ kind: 'lookup' })} onCreated={(view) => setStep({ kind: 'family', householdId: view.id, found: { method: 'scan', households: [] }, local: view })} />
  return <Done code={step.code} lines={step.lines} printed={step.printed} onHome={home} kiosk={!staffed} />
}

function Attract({ onStart }: { onStart: () => void }) {
  const { day } = useStation()
  return (
    <main className="attract" onClick={onStart} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onStart() }}>
      <div className="leaf" aria-hidden="true"><svg width="56" height="56" viewBox="0 0 32 32"><path d="M16 6C16 6 10 13 10 18C10 21.3 12.7 24 16 24C19.3 24 22 21.3 22 18C22 13 16 6 16 6Z" fill="#007aff" /></svg></div>
      <h1>{day?.self.org_name}</h1>
      <p className="muted" style={{ fontSize: 24 }}>Touch to check in</p>
    </main>
  )
}

function Lookup({ staffed, notice, onFound, onNew, onHome }: { staffed: boolean; notice?: string; onFound: (f: Found) => void; onNew: () => void; onHome: () => void }) {
  const [digits, setDigits] = useState('')
  const [mode, setMode] = useState<'phone' | 'name' | 'scan'>('phone')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(notice ?? '')
  const scanRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setError(notice ?? '') }, [notice])
  useEffect(() => { if (mode === 'scan') scanRef.current?.focus() }, [mode])

  const run = useCallback(async (query: string, method: LookupMethod) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const r = await rpcLookup(query, method)
      if (!r.ok) {
        setError(r.error === 'locked' ? 'Too many tries. Please see the welcome desk.' : r.error === 'method_not_allowed' ? 'Enter your whole phone number.' : 'Please check the number and try again.')
        return
      }
      onFound({ method, last4: method === 'last4' ? query : undefined, households: r.households })
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }, [busy, onFound])

  // a whole number looks itself up, once per number typed
  const looked = useRef('')
  useEffect(() => {
    if (digits.length === 10 && looked.current !== digits) { looked.current = digits; void run(digits, 'phone') }
    if (digits.length < 10) looked.current = ''
  }, [digits, run])

  return (
    <main className="screen">
      <div className="keypad-screen">
        {mode === 'phone' && (
          <>
            <h1 className="center" style={{ fontSize: 28 }}>{staffed ? 'Find a family' : 'Enter your phone number'}</h1>
            <div className="readout" aria-live="polite">{digits ? fmtPhone(digits) : <span className="ghost">(000) 000-0000</span>}</div>
            <Keypad onDigit={(d) => setDigits((x) => (x + d).slice(0, 10))} onBackspace={() => setDigits((x) => x.slice(0, -1))} onClear={() => setDigits('')} disabled={busy} />
            {staffed && <button type="button" className="btn btn-tinted btn-large" disabled={digits.length !== 4 || busy} onClick={() => run(digits, 'last4')}>Search last 4 digits</button>}
          </>
        )}
        {mode === 'name' && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 2) void run(text.trim(), 'name') }}>
            <h1 className="center" style={{ fontSize: 28 }}>Search by name</h1>
            <label className="field"><span>First or last name</span><input autoFocus value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" /></label>
            <button type="submit" className="btn btn-filled btn-large btn-block" disabled={text.trim().length < 2 || busy}>Search</button>
          </form>
        )}
        {mode === 'scan' && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 4) void run(text.trim(), 'scan') }}>
            <h1 className="center" style={{ fontSize: 28 }}>Scan your key tag</h1>
            <p className="muted center">Hold the tag or QR code under the scanner.</p>
            <label className="field"><span className="sr-only">Scanned code</span><input ref={scanRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" placeholder="…" /></label>
            <button type="submit" className="btn btn-filled btn-large btn-block" disabled={text.trim().length < 4 || busy}>Look up</button>
          </form>
        )}
        {busy && <p className="center muted"><span className="spin" /></p>}
        {error && <p className="error center" role="alert">{error}</p>}
        <div className="row" style={{ justifyContent: 'center' }}>
          {mode !== 'phone' && <button type="button" className="btn btn-plain" onClick={() => { setMode('phone'); setText('') }}>Phone number</button>}
          {mode !== 'scan' && <button type="button" className="btn btn-plain" onClick={() => { setMode('scan'); setText('') }}>Scan a tag</button>}
          {staffed && mode !== 'name' && <button type="button" className="btn btn-plain" onClick={() => { setMode('name'); setText('') }}>Search by name</button>}
        </div>
        <button type="button" className="btn btn-tinted btn-large btn-block" onClick={onNew}>New here? Sign up and check in</button>
        {!staffed && <button type="button" className="btn btn-plain" onClick={onHome}>Cancel</button>}
      </div>
    </main>
  )
}

function PickHousehold({ found, onPick, onBack }: { found: Found; onPick: (id: string) => void; onBack: () => void }) {
  return (
    <main className="screen">
      <h1>Which family?</h1>
      <ul className="list">
        {found.households.map((h) => (
          <li key={h.id}>
            <button type="button" className="item tap" onClick={() => onPick(h.id)}>
              <span className="item-text">
                <span className="item-title">{h.name}</span>
                <span className="item-sub">{h.members.filter((m) => m.is_child).map((m) => m.first_name).join(', ') || 'No children on file'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="bottom-actions"><button type="button" className="btn btn-plain btn-large" onClick={onBack}>Back</button></div>
    </main>
  )
}

interface Plan { child: HouseholdMember; on: boolean; already: boolean; roomId: string | null; choices: { id: string; name: string }[]; reason: string }

function Family({ householdId, found, local, staffed, onDone, onBack }: {
  householdId: string; found: Found; local?: HouseholdView; staffed: boolean
  onDone: (code: string | null, lines: string[], printed: boolean) => void; onBack: () => void
}) {
  const { day, codes, send, staff, presence } = useStation()
  const [view, setView] = useState<HouseholdView | null>(local ?? null)
  const [error, setError] = useState('')
  const [guardianId, setGuardianId] = useState<string | null>(null)
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})     // the family's own taps win over the defaults
  const [roomPick, setRoomPick] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const tz = day?.self.settings?.time_zone
  const live = useMemo(() => (day ? liveServices(day) : []), [day])

  useEffect(() => {
    if (local) return
    fetchHousehold(householdId).then(setView).catch((e) => setError(errorText(e)))
  }, [householdId, local])

  // defaults once the family is known: the matched guardian, the service running now, every child not already in
  useEffect(() => {
    if (!view || !day) return
    const matched = found.households.find((h) => h.id === view.id)?.members.filter((m) => m.matched && m.can_check_in).map((m) => m.person_id) ?? []
    const guardians = view.members.filter((m) => m.can_check_in && !m.is_child)
    setGuardianId(matched[0] ?? guardians[0]?.person_id ?? null)
    const now = Date.now()
    const running = live.filter((s) => new Date(s.starts_at).getTime() - 75 * 60_000 <= now && new Date(s.ends_at).getTime() >= now)
    const chosen = running.length > 0 ? running : live.slice(0, 1)
    setServiceIds(chosen.map((s) => s.id))
  }, [view, day, found, live])

  const first = live.find((s) => serviceIds.includes(s.id)) ?? null
  // every child: the core's room suggestion for the chosen service, whether they are in already, and whether they are selected
  const plans = useMemo<Plan[]>(() => {
    if (!view || !day) return []
    const inNow = new Set(presence.filter((p) => p.status === 'in' && serviceIds.includes(p.occurrence_id)).map((p) => p.person_id))
    const inFromServer = new Set(view.attendance.filter((a) => a.status === 'in' && serviceIds.includes(a.occurrence_id)).map((a) => a.person_id))
    return view.members.filter((m) => m.is_child).map((m) => {
      const s = suggestFor(day, first, m)
      const already = inNow.has(m.person_id) || inFromServer.has(m.person_id)
      const chosen = roomPick[m.person_id]
      const roomId = chosen && (s.choices.some((c) => c.id === chosen) || roomsFor(day, first).some((r) => r.id === chosen)) ? chosen : s.room?.id ?? null
      const on = m.see_staff || serviceIds.length === 0 ? false : picked[m.person_id] ?? !already
      return { child: m, on, already, roomId, choices: s.choices.map((c) => ({ id: c.id, name: c.name })), reason: s.reason }
    })
  }, [view, day, first, serviceIds, presence, picked, roomPick])

  if (error) return <main className="screen"><p className="error" role="alert">{error}</p><button type="button" className="btn btn-plain btn-large" onClick={onBack}>Back</button></main>
  if (!view || !day) return <main className="screen center"><span className="spin" /></main>

  const guardians = view.members.filter((m) => m.can_check_in && !m.is_child)
  const kids = plans
  const selected = kids.filter((p) => p.on)
  const ready = selected.length > 0 && selected.every((p) => p.roomId) && serviceIds.length > 0 && (guardianId || guardians.length === 0)
  const existingCode = view.attendance.map((a) => a.codes[0]).find(Boolean) ?? null
  const inToday = (m: HouseholdMember) => {
    const a = presence.find((p) => p.person_id === m.person_id && p.status === 'in') ?? null
    const b = view.attendance.find((x) => x.person_id === m.person_id && x.status === 'in') ?? null
    const roomId = a?.room_id ?? b?.room_id ?? null
    return roomId ? day.rooms.find((r) => r.id === roomId)?.name ?? 'a room' : null
  }

  const checkIn = async () => {
    if (!ready || busy) return
    setBusy(true)
    try {
      const sid = uuidv7()
      const at = new Date().toISOString()
      const code = existingCode ?? codes?.take() ?? null
      const services = live.filter((s) => serviceIds.includes(s.id))
      const actor = staff ? { actor_person_id: staff.person_id } : {}
      const cmds: Command[] = [{
        op: 'session.start', id: sid, household_id: view.id, guardian_person_id: guardianId, lookup_method: found.method === 'scan' && local ? 'manual' : found.method,
        ...(found.last4 ? { lookup_last4: found.last4 } : {}), local_date: day.local_date, device_at: at, ...actor,
      }]
      const lines: string[] = []
      const childLabels: LabelData[] = []
      for (const p of selected) {
        for (const s of services) {
          // the chosen room when the service runs it; otherwise what the core suggests for that service
          const roomId = roomsFor(day, s).some((r) => r.id === p.roomId) ? p.roomId : suggestFor(day, s, p.child).room?.id ?? p.roomId
          cmds.push({ op: 'event', id: uuidv7(), type: 'check_in', occurrence_id: s.id, person_id: p.child.person_id, role: 'child', room_id: roomId, session_id: sid, ...(code ? { code } : {}), device_at: at, ...actor })
        }
        const roomName = day.rooms.find((r) => r.id === p.roomId)?.name ?? ''
        lines.push(`${p.child.first_name} → ${roomName}`)
        childLabels.push({
          first_name: p.child.first_name, last_name: p.child.last_name, room: roomName, service: services.map((s) => s.name).join(' + '), date: labelDate(day),
          code, allergy_short: p.child.allergy_short ?? null, flags: p.child.flags, guest: p.child.guest,
        })
        cmds.push({ op: 'event', id: uuidv7(), type: 'label_print_requested', occurrence_id: services[0].id, person_id: p.child.person_id, label_kind: 'child', session_id: sid, printer_id: day.self.printer_id, device_at: at, ...actor })
      }
      cmds.push({ op: 'event', id: uuidv7(), type: 'label_print_requested', occurrence_id: services[0].id, person_id: selected[0].child.person_id, label_kind: 'pickup', session_id: sid, printer_id: day.self.printer_id, device_at: at, ...actor })
      cmds.push({ op: 'session.complete', id: sid, completed_at: new Date().toISOString() })
      send(cmds)
      let printed = true
      try {
        await printSheet(day.templates.child, childLabels)
        await printSheet(day.templates.pickup, [{ first_name: '', code, children_names: selected.map((p) => p.child.first_name), service: services.map((s) => s.name).join(' + '), date: labelDate(day), church: day.self.org_name }])
      } catch { printed = false }
      onDone(code, lines, printed)
    } finally { setBusy(false) }
  }

  return (
    <main className="screen">
      <h1>{view.name}</h1>
      {guardians.length > 1 && (
        <section className="stack" style={{ marginBottom: 18 }}>
          <h2>Who is checking in?</h2>
          <div className="chips">{guardians.map((g) => <button key={g.person_id} type="button" className={`chip${guardianId === g.person_id ? ' on' : ''}`} onClick={() => setGuardianId(g.person_id)}>{g.first_name}</button>)}</div>
        </section>
      )}
      <section className="stack" style={{ marginBottom: 18 }}>
        <h2>Service</h2>
        {live.length === 0 ? <p className="notice">There is no service to check in for right now.</p> : (
          <div className="chips">{live.map((s) => (
            <button key={s.id} type="button" className={`chip${serviceIds.includes(s.id) ? ' on' : ''}`} aria-pressed={serviceIds.includes(s.id)}
              onClick={() => setServiceIds((ids) => (ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id]))}>{s.name} · {fmtTime(s.starts_at, tz)}</button>
          ))}</div>
        )}
      </section>
      <section className="stack">
        <h2>Children</h2>
        {kids.length === 0 ? <p className="notice">No children are on file for this family. {staffed ? 'Add them in the church app.' : 'Please see the welcome desk.'}</p> : (
          <div className="list">
            {kids.map((p) => {
              const here = inToday(p.child)
              return (
                <div key={p.child.person_id} className="member">
                  <button type="button" className={`check${p.on ? ' on' : ''}`} aria-pressed={p.on} aria-label={`${p.on ? 'Skip' : 'Check in'} ${p.child.first_name}`} disabled={p.child.see_staff || serviceIds.length === 0}
                    onClick={() => setPicked((x) => ({ ...x, [p.child.person_id]: !p.on }))}>{p.on ? '✓' : ''}</button>
                  <div>
                    <div className="name">{p.child.first_name} {staffed ? p.child.last_name : ''}
                      <Flags m={p.child} />
                      {p.child.guest && <span className="tag tag-tint">Guest</span>}
                      {here && <span className="tag tag-ok">In {here}</span>}
                    </div>
                    <div className="sub">{describeChild(day, p.child)}{p.child.allergy_short ? ` · ${p.child.allergy_short}` : ''}</div>
                    {p.child.see_staff && <div className="sub" style={{ color: 'var(--orange-text)' }}>Please see the welcome desk to check {p.child.first_name} in.</div>}
                  </div>
                  {!p.child.see_staff && !(p.already && !p.on) && (p.choices.length > 0 || staffed ? (
                    <select aria-label={`Room for ${p.child.first_name}`} value={p.roomId ?? ''} onChange={(e) => setRoomPick((x) => ({ ...x, [p.child.person_id]: e.target.value }))}>
                      {!p.roomId && <option value="">Choose a room</option>}
                      {(staffed ? roomsFor(day, live.find((s) => serviceIds.includes(s.id)) ?? null) : p.choices).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : <span className="tag tag-warn">See staff for a room</span>)}
                </div>
              )
            })}
          </div>
        )}
      </section>
      {kids.some((p) => p.reason === 'none' && !p.child.see_staff && !(p.already && !p.on)) && !staffed && <p className="small muted" style={{ marginTop: 8 }}>A child without a room: the welcome desk can place them.</p>}
      <div className="bottom-actions">
        <button type="button" className="btn btn-plain btn-large" onClick={onBack}>Back</button>
        <span className="spacer" />
        <button type="button" className="btn btn-filled btn-large" disabled={!ready || busy} onClick={checkIn}>
          {busy ? 'Checking in…' : selected.length === 0 ? 'Choose a child' : `Check in ${selected.length === 1 ? selected[0].child.first_name : `${selected.length} children`}`}
        </button>
      </div>
    </main>
  )
}

function Flags({ m }: { m: HouseholdMember }) {
  const f = m.flags
  if (!f || !(f.allergy || f.medical || f.special_needs || f.custody)) return null
  return (
    <span className="flags" aria-label="Flags">
      {f.allergy && <span className="flag" title="Allergy">A</span>}
      {f.medical && <span className="flag" title="Medical">M</span>}
      {f.special_needs && <span className="flag" title="Special needs">S</span>}
      {f.custody && <span className="flag flag-bad" title="Custody">C</span>}
    </span>
  )
}

interface NewKid { first: string; last: string; birthdate: string; gender: '' | 'male' | 'female'; allergies: string }

function NewFamily({ onBack, onCreated }: { onBack: () => void; onCreated: (view: HouseholdView) => void }) {
  const { day, send } = useStation()
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [phone, setPhone] = useState('')
  const [kids, setKids] = useState<NewKid[]>([{ first: '', last: '', birthdate: '', gender: '', allergies: '' }])
  const [consent, setConsent] = useState(true)
  const [error, setError] = useState('')
  const digits = phone.replace(/\D/g, '')
  const valid = first.trim() && last.trim() && digits.length === 10 && kids.every((k) => k.first.trim() && k.birthdate)
  if (!day) return null

  const submit = () => {
    if (!valid) return
    const hid = uuidv7()
    const adultId = uuidv7()
    const at = new Date().toISOString()
    const people = [
      { id: adultId, first_name: first.trim(), last_name: last.trim(), phone: fmtPhone(digits), relationship: 'head' },
      ...kids.map((k) => ({ id: uuidv7(), first_name: k.first.trim(), last_name: (k.last.trim() || last.trim()), birthdate: k.birthdate, gender: k.gender || null, relationship: 'child' })),
    ]
    const care = kids.map((k, i) => ({ k, id: people[i + 1].id })).filter(({ k }) => k.allergies.trim()).map(({ k, id }) => ({ person_id: id, allergies: k.allergies.trim(), allergy_short: k.allergies.trim().slice(0, 40) }))
    const cmd: Command = {
      op: 'guest.create', id: uuidv7(), device_at: at,
      household: { id: hid, name: `${last.trim()} family` }, people, care,
      ...(consent ? { consent: { phone: fmtPhone(digits), scope: 'safety', person_id: adultId, text_version: 'v1' } } : {}),
    }
    send([cmd])
    onCreated({
      id: hid, name: `${last.trim()} family`, local_date: day.local_date, attendance: [],
      members: [
        { person_id: adultId, first_name: first.trim(), last_name: last.trim(), display_name: `${first.trim()} ${last.trim()[0]}.`, relationship: 'head', is_guardian: true, can_check_in: true, is_child: false, guest: true, see_staff: false, sms_consent: consent },
        ...kids.map((k, i) => ({
          person_id: people[i + 1].id, first_name: k.first.trim(), last_name: k.last.trim() || last.trim(), display_name: `${k.first.trim()} ${(k.last.trim() || last.trim())[0]}.`,
          relationship: 'child' as const, is_guardian: false, can_check_in: false, is_child: true, guest: true, see_staff: false,
          birthdate: k.birthdate, gender: k.gender || undefined, tags: ['guest'],
          flags: { allergy: !!k.allergies.trim(), medical: false, special_needs: false, custody: false }, allergy_short: k.allergies.trim() ? k.allergies.trim().slice(0, 40) : undefined,
        })),
      ],
    })
  }

  return (
    <main className="screen">
      <h1>Welcome! Tell us about your family</h1>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); else setError('Please fill in every name, the phone number and each birthdate.') }}>
        <div className="card stack">
          <h2>Parent or guardian</h2>
          <div className="grid-2">
            <label className="field"><span>First name</span><input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" required /></label>
            <label className="field"><span>Last name</span><input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" required /></label>
          </div>
          <label className="field"><span>Mobile number</span><input inputMode="tel" value={fmtPhone(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="(000) 000-0000" required /></label>
        </div>
        {kids.map((k, i) => (
          <div key={i} className="card stack">
            <div className="row"><h2 style={{ margin: 0 }}>Child {kids.length > 1 ? i + 1 : ''}</h2><span className="spacer" />{kids.length > 1 && <button type="button" className="btn btn-plain" onClick={() => setKids((ks) => ks.filter((_, j) => j !== i))}>Remove</button>}</div>
            <div className="grid-2">
              <label className="field"><span>First name</span><input value={k.first} onChange={(e) => setKids((ks) => ks.map((x, j) => (j === i ? { ...x, first: e.target.value } : x)))} autoComplete="off" required /></label>
              <label className="field"><span>Last name</span><input value={k.last} placeholder={last || 'Same as parent'} onChange={(e) => setKids((ks) => ks.map((x, j) => (j === i ? { ...x, last: e.target.value } : x)))} autoComplete="off" /></label>
            </div>
            <div className="grid-2">
              <label className="field"><span>Birthdate</span><input type="date" value={k.birthdate} max={day.local_date} onChange={(e) => setKids((ks) => ks.map((x, j) => (j === i ? { ...x, birthdate: e.target.value } : x)))} required /></label>
              <label className="field"><span>Gender (optional)</span>
                <select value={k.gender} onChange={(e) => setKids((ks) => ks.map((x, j) => (j === i ? { ...x, gender: e.target.value as NewKid['gender'] } : x)))}><option value="">Not said</option><option value="female">Girl</option><option value="male">Boy</option></select>
              </label>
            </div>
            <label className="field"><span>Allergies (optional)</span><input value={k.allergies} onChange={(e) => setKids((ks) => ks.map((x, j) => (j === i ? { ...x, allergies: e.target.value } : x)))} placeholder="e.g. peanuts" autoComplete="off" /></label>
          </div>
        ))}
        <button type="button" className="btn btn-tinted btn-large" onClick={() => setKids((ks) => [...ks, { first: '', last: '', birthdate: '', gender: '', allergies: '' }])}>Add another child</button>
        <label className="field inline card"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 28, height: 28 }} /><span style={{ fontSize: 16, color: 'var(--label)', fontWeight: 400 }}>Text me about my children while they are checked in (safety messages only). Reply STOP to opt out.</span></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="bottom-actions">
          <button type="button" className="btn btn-plain btn-large" onClick={onBack}>Back</button>
          <span className="spacer" />
          <button type="submit" className="btn btn-filled btn-large" disabled={!valid}>Continue</button>
        </div>
      </form>
    </main>
  )
}

function Done({ code, lines, printed, onHome, kiosk }: { code: string | null; lines: string[]; printed: boolean; onHome: () => void; kiosk: boolean }) {
  useEffect(() => { if (!kiosk) return; const t = window.setTimeout(onHome, 25_000); return () => window.clearTimeout(t) }, [kiosk, onHome])
  return (
    <main className="screen done">
      <h1>You're checked in</h1>
      {code ? <><p className="muted">Your pickup code</p><div className="code-big" aria-label={`Pickup code ${code.split('').join(' ')}`}>{code}</div></> : <p className="notice">No code could be issued; the welcome desk will write one on your tag.</p>}
      <ul className="list" style={{ textAlign: 'left', maxWidth: 480, margin: '16px auto' }}>{lines.map((l) => <li key={l} className="item"><span className="item-title">{l}</span></li>)}</ul>
      <p className="muted">{printed ? 'Take your labels from the printer.' : 'The labels did not print; please see the welcome desk.'}</p>
      <button type="button" className="btn btn-filled btn-large" onClick={onHome}>Done</button>
    </main>
  )
}

