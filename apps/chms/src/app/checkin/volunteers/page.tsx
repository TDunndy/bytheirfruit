'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { PersonPicker } from '@/components/PersonPicker'
import { Avatar, IconTile, RemoveGlyph, SegmentedControl, Spinner } from '@/components/ui'
import { errorMessage, listRoles, peopleNames, type OrgRole } from '@/lib/people'
import {
  addAssignment, archiveSlot, dayOffset, fmtDate, fmtTime, listAssignments, listOccurrences, listRooms, listSchedules, listSlots, saveSlot, setAssignmentStatus,
  type Occurrence, type Room, type Schedule, type SlotInput, type VolunteerAssignment, type VolunteerSlot,
} from '@/lib/checkin'

/** The Sunday on or before a date, as 'YYYY-MM-DD'. */
function weekStart(d: string): string {
  return dayOffset(-new Date(d + 'T00:00:00').getDay(), d)
}

export default function VolunteersPage() {
  const { org, can } = useSession()
  const [slots, setSlots] = useState<VolunteerSlot[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [week, setWeek] = useState(weekStart(dayOffset(0)))
  const [occ, setOcc] = useState<Occurrence[]>([])
  const [assignments, setAssignments] = useState<VolunteerAssignment[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [editing, setEditing] = useState<Partial<SlotInput> | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [loaded, setLoaded] = useState(false)
  const manage = can('checkin.manage')
  const allowed = manage || can('checkin.station') || can('attendance.reports')
  const weekEnd = dayOffset(6, week)

  // The latest request wins: a quick week change never shows an older week's answer.
  useEffect(() => {
    if (!org || !allowed) return
    let cancelled = false
    Promise.all([listSlots(org.id), listSchedules(org.id), listRooms(org.id), listRoles(org.id), listOccurrences(org.id, week, weekEnd), listAssignments(org.id, week, weekEnd)])
      .then(async ([sl, sc, r, ro, o, a]) => {
        const n = await peopleNames(a.map((x) => x.person_id))
        if (cancelled) return
        setSlots(sl); setSchedules(sc); setRooms(r); setRoles(ro); setOcc(o); setAssignments(a); setNames(n); setError(''); setLoaded(true)
      })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)) })
    return () => { cancelled = true }
  }, [org, allowed, week, weekEnd, version])

  const act = async (fn: () => Promise<unknown>, done = 'Saved') => { setStatus(''); try { await fn(); setVersion((v) => v + 1); setStatus(done) } catch (e) { setError(errorMessage(e)) } }
  const roomName = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms])
  const roleName = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])
  const schedName = useMemo(() => new Map(schedules.map((s) => [s.id, s.name])), [schedules])
  const slotLabel = (s: VolunteerSlot) => s.label || [s.room_id ? roomName.get(s.room_id) : null, s.role_id ? roleName.get(s.role_id) : null].filter(Boolean).join(' · ') || 'Volunteer'

  // This week's dates for each need: the services of its schedule in the week, or its one date.
  const datesFor = (s: VolunteerSlot): string[] => {
    if (s.occurrence_id) { const o = occ.find((x) => x.id === s.occurrence_id); return o ? [o.local_date] : [] }
    return Array.from(new Set(occ.filter((o) => o.schedule_id === s.schedule_id && o.status !== 'cancelled').map((o) => o.local_date))).sort()
  }

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="volunteer scheduling" />
  if (!loaded && !error) return <Spinner />

  if (editing) {
    return (
      <SlotForm key={editing.id ?? 'new'} initial={editing} schedules={schedules} rooms={rooms} roles={roles} occurrence={editing.occurrence_id ? occ.find((o) => o.id === editing.occurrence_id) ?? null : null}
        onCancel={() => setEditing(null)} onSave={(s) => act(async () => { await saveSlot(org.id, s); setEditing(null) }, 'Need saved')} />
    )
  }

  return (
    <div className="stack">
      <p className="sr-only" role="status">{status}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {manage && <div className="row"><button className="btn btn-filled" onClick={() => setEditing({})}>Add need</button></div>}
      <section className="section">
        <h2 className="group-head">Volunteer needs</h2>
        <ul className="group">
          {slots.length === 0 && <li className="cell muted">No needs yet. A need is, for example, two volunteers in Ducklings at the 9:00 service, arriving 20 minutes early.</li>}
          {slots.map((s) => (
            <li key={s.id} className="cell">
              {manage && <button className="remove-btn" aria-label={`Remove the ${slotLabel(s)} need`} onClick={() => { if (window.confirm(`Remove the ${slotLabel(s)} need?`)) act(() => archiveSlot(s.id), 'Need removed') }}><RemoveGlyph /></button>}
              <IconTile name="people" />
              <span className="cell-text">
                <span className="cell-title">{slotLabel(s)}</span>
                <span className="cell-sub">{s.schedule_id ? schedName.get(s.schedule_id) ?? 'Schedule' : 'One date'} · {s.needed} needed · arrive {s.arrive_minutes_before} min early</span>
              </span>
              {manage && <button className="btn btn-plain btn-small" aria-label={`Edit the ${slotLabel(s)} need`} onClick={() => setEditing({ ...s })}>Edit</button>}
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <div className="group-head-row">
          <h2 className="group-head">Week of {fmtDate(week)}</h2>
          <div className="actions">
            <button className="btn btn-plain btn-small" onClick={() => setWeek(dayOffset(-7, week))}>Previous</button>
            <button className="btn btn-plain btn-small" onClick={() => setWeek(weekStart(dayOffset(0)))}>This week</button>
            <button className="btn btn-plain btn-small" onClick={() => setWeek(dayOffset(7, week))}>Next</button>
          </div>
        </div>
        {occ.length === 0 && <p className="muted">No services this week. Save a schedule to put them on the calendar.</p>}
        {slots.flatMap((s) => datesFor(s).map((d) => ({ s, d }))).sort((a, b) => a.d.localeCompare(b.d)).map(({ s, d }) => {
          const mine = assignments.filter((a) => a.slot_id === s.id && a.local_date === d)
          const filled = mine.filter((a) => a.status !== 'declined').length
          return (
            <div key={`${s.id}-${d}`} className="slot-day">
              <h3 className="group-head">{fmtDate(d)} · {slotLabel(s)} <span className={filled < s.needed ? 'muted warn-text' : 'muted'}>{filled}/{s.needed}</span></h3>
              <ul className="group">
                {mine.map((a) => (
                  <li key={a.id} className="cell">
                    <Avatar name={names.get(a.person_id) ?? 'Someone'} size="xs" />
                    <span className="cell-title">{names.get(a.person_id) ?? 'Someone'}</span>
                    {manage ? (
                      <select className="row-select" aria-label={`${names.get(a.person_id) ?? 'Someone'} status`} value={a.status} onChange={(e) => act(() => setAssignmentStatus(a.id, e.target.value as VolunteerAssignment['status']), 'Status saved')}>
                        <option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option>
                      </select>
                    ) : <span className="cell-value cap">{a.status}</span>}
                  </li>
                ))}
                {manage && (
                  <li className="cell">
                    <PersonPicker orgId={org.id} exclude={mine.map((a) => a.person_id)} placeholder="Schedule someone" onPick={(p) => act(() => addAssignment(org.id, s.id, p.id, d), 'Scheduled')} />
                  </li>
                )}
              </ul>
            </div>
          )
        })}
      </section>
    </div>
  )
}

function SlotForm({ initial, schedules, rooms, roles, occurrence, onSave, onCancel }: {
  initial: Partial<SlotInput>
  schedules: Schedule[]
  rooms: Room[]
  roles: OrgRole[]
  occurrence: Occurrence | null
  onSave: (s: SlotInput) => Promise<void>
  onCancel: () => void
}) {
  const [v, setV] = useState<SlotInput>({
    id: initial.id, schedule_id: initial.occurrence_id ? null : (initial.schedule_id ?? schedules[0]?.id ?? null), occurrence_id: initial.occurrence_id ?? null,
    room_id: initial.room_id ?? null, role_id: initial.role_id ?? null, label: initial.label ?? null, needed: initial.needed ?? 1, arrive_minutes_before: initial.arrive_minutes_before ?? 15,
  })
  const [forWhat, setForWhat] = useState<'room' | 'role'>(initial.role_id ? 'role' : 'room')
  const [busy, setBusy] = useState(false)
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); if (!v.schedule_id && !v.occurrence_id) return; setBusy(true); await onSave(v); setBusy(false) }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit need' : 'New need'}</legend>
        <div className="group">
          {v.occurrence_id ? (
            <div className="field"><span>Date</span><span>{occurrence ? fmtDate(occurrence.local_date) : 'One date'}</span></div>
          ) : (
            <label className="field"><span>Schedule</span>
              <select autoFocus value={v.schedule_id ?? ''} onChange={(e) => setV({ ...v, schedule_id: e.target.value || null })}>
                {schedules.map((s) => <option key={s.id} value={s.id}>{s.name} · {fmtTime(s.local_time)}</option>)}
              </select>
            </label>
          )}
          <div className="field"><span>For</span>
            <SegmentedControl label="For a room or a role" name="for" value={forWhat} options={[{ value: 'room', label: 'A room' }, { value: 'role', label: 'A role' }]}
              onChange={(x) => { setForWhat(x); setV({ ...v, room_id: x === 'room' ? v.room_id : null, role_id: x === 'role' ? v.role_id : null }) }} />
          </div>
          {forWhat === 'room' ? (
            <label className="field"><span>Room</span>
              <select value={v.room_id ?? ''} onChange={(e) => setV({ ...v, room_id: e.target.value || null, role_id: null })}>
                <option value="">Any</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          ) : (
            <label className="field"><span>Role</span>
              <select value={v.role_id ?? ''} onChange={(e) => setV({ ...v, role_id: e.target.value || null, room_id: null })}>
                <option value="">Any</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Label</span><input value={v.label ?? ''} placeholder="Optional, e.g. Greeter" onChange={(e) => setV({ ...v, label: e.target.value || null })} /></label>
          <label className="field"><span>Needed</span><input type="number" min={1} max={100} value={v.needed} onChange={(e) => setV({ ...v, needed: Number(e.target.value) })} /></label>
          <label className="field"><span>Arrive early (min)</span><input type="number" min={0} max={240} value={v.arrive_minutes_before} onChange={(e) => setV({ ...v, arrive_minutes_before: Number(e.target.value) })} /></label>
        </div>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled" disabled={busy}>{busy ? 'Saving…' : 'Save need'}</button></div>
    </form>
  )
}
