'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { PersonPicker } from '@/components/PersonPicker'
import { Avatar, IconTile, RemoveGlyph, Spinner } from '@/components/ui'
import { errorMessage, listRoles, peopleNames, type OrgRole } from '@/lib/people'
import {
  addAssignment, archiveSlot, dayOffset, fmtDate, fmtTime, listAssignments, listOccurrences, listRooms, listSchedules, listSlots, saveSlot, setAssignmentStatus,
  type Occurrence, type Room, type Schedule, type SlotInput, type VolunteerAssignment, type VolunteerSlot,
} from '@/lib/checkin'

/** The Sunday on or before a date, as 'YYYY-MM-DD'. */
function weekStart(d: string): string {
  const t = new Date(d + 'T00:00:00')
  return dayOffset(-t.getDay(), t)
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
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const manage = can('checkin.manage')
  const allowed = manage || can('checkin.station') || can('attendance.reports')
  const weekEnd = dayOffset(6, new Date(week + 'T00:00:00'))

  const load = useCallback(async () => {
    if (!org || !allowed) return
    try {
      const [sl, sc, r, ro, o, a] = await Promise.all([listSlots(org.id), listSchedules(org.id), listRooms(org.id), listRoles(org.id), listOccurrences(org.id, week, weekEnd), listAssignments(org.id, week, weekEnd)])
      setSlots(sl); setSchedules(sc); setRooms(r); setRoles(ro); setOcc(o); setAssignments(a)
      setNames(await peopleNames(a.map((x) => x.person_id)))
      setError(''); setLoaded(true)
    } catch (e) { setError(errorMessage(e)) }
  }, [org, allowed, week, weekEnd])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load() } catch (e) { setError(errorMessage(e)) } }
  const roomName = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms])
  const roleName = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])
  const schedName = useMemo(() => new Map(schedules.map((s) => [s.id, s.name])), [schedules])
  const slotLabel = (s: VolunteerSlot) => s.label || [s.room_id ? roomName.get(s.room_id) : null, s.role_id ? roleName.get(s.role_id) : null].filter(Boolean).join(' · ') || 'Volunteer'

  // This week's dates for each slot: the occurrences of its schedule in the week, or the one occurrence.
  const datesFor = (s: VolunteerSlot): string[] => {
    if (s.occurrence_id) { const o = occ.find((x) => x.id === s.occurrence_id); return o ? [o.local_date] : [] }
    return Array.from(new Set(occ.filter((o) => o.schedule_id === s.schedule_id && o.status !== 'cancelled').map((o) => o.local_date))).sort()
  }

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="volunteer scheduling" />
  if (!loaded && !error) return <Spinner />

  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      {manage && !editing && <div className="row"><button className="btn btn-filled" onClick={() => setEditing({})}>Add slot</button></div>}
      {editing && (
        <SlotForm initial={editing} schedules={schedules} rooms={rooms} roles={roles} onCancel={() => setEditing(null)}
          onSave={(s) => act(async () => { await saveSlot(org.id, s); setEditing(null) })} />
      )}
      <section className="section">
        <h2 className="group-head">Slots</h2>
        <ul className="group">
          {slots.length === 0 && <li className="cell muted">No slots yet. A slot is a need: two volunteers in Ducklings at the 9:00 service, arriving 20 minutes early.</li>}
          {slots.map((s) => (
            <li key={s.id} className="cell">
              {manage && <button className="remove-btn" aria-label={`Remove the ${slotLabel(s)} slot`} onClick={() => act(() => archiveSlot(s.id))}><RemoveGlyph /></button>}
              <IconTile name="people" />
              <span className="cell-text">
                <span className="cell-title">{slotLabel(s)}</span>
                <span className="cell-sub">{s.schedule_id ? schedName.get(s.schedule_id) ?? 'Schedule' : 'One date'} · {s.needed} needed · arrive {s.arrive_minutes_before} min early</span>
              </span>
              {manage && <button className="btn btn-plain btn-small" onClick={() => setEditing({ ...s })}>Edit</button>}
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <div className="group-head-row">
          <h2 className="group-head">Week of {fmtDate(week)}</h2>
          <div className="actions">
            <button className="btn btn-plain btn-small" onClick={() => setWeek(dayOffset(-7, new Date(week + 'T00:00:00')))}>Previous</button>
            <button className="btn btn-plain btn-small" onClick={() => setWeek(weekStart(dayOffset(0)))}>This week</button>
            <button className="btn btn-plain btn-small" onClick={() => setWeek(dayOffset(7, new Date(week + 'T00:00:00')))}>Next</button>
          </div>
        </div>
        {occ.length === 0 && <p className="muted">No occurrences this week. Generate them from Schedules.</p>}
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
                      <select className="row-select" aria-label="Status" value={a.status} onChange={(e) => act(() => setAssignmentStatus(a.id, e.target.value as VolunteerAssignment['status']))}>
                        <option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option>
                      </select>
                    ) : <span className="cell-value cap">{a.status}</span>}
                  </li>
                ))}
                {manage && (
                  <li className="cell">
                    <PersonPicker orgId={org.id} exclude={mine.map((a) => a.person_id)} placeholder="Schedule someone" onPick={(p) => act(() => addAssignment(org.id, s.id, p.id, d))} />
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

function SlotForm({ initial, schedules, rooms, roles, onSave, onCancel }: {
  initial: Partial<SlotInput>
  schedules: Schedule[]
  rooms: Room[]
  roles: OrgRole[]
  onSave: (s: SlotInput) => Promise<void>
  onCancel: () => void
}) {
  const [v, setV] = useState<SlotInput>({
    id: initial.id, schedule_id: initial.schedule_id ?? schedules[0]?.id ?? null, occurrence_id: initial.occurrence_id ?? null,
    room_id: initial.room_id ?? null, role_id: initial.role_id ?? null, label: initial.label ?? null, needed: initial.needed ?? 1, arrive_minutes_before: initial.arrive_minutes_before ?? 15,
  })
  const schedule = fmtTime
  void schedule
  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); if (v.schedule_id || v.occurrence_id) onSave(v) }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit slot' : 'New slot'}</legend>
        <div className="group">
          <label className="field"><span>Schedule</span>
            <select value={v.schedule_id ?? ''} onChange={(e) => setV({ ...v, schedule_id: e.target.value || null, occurrence_id: null })}>
              {schedules.map((s) => <option key={s.id} value={s.id}>{s.name} · {fmtTime(s.local_time)}</option>)}
            </select>
          </label>
          <label className="field"><span>Room</span>
            <select value={v.room_id ?? ''} onChange={(e) => setV({ ...v, room_id: e.target.value || null, role_id: e.target.value ? null : v.role_id })}>
              <option value="">None</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Or role</span>
            <select value={v.role_id ?? ''} onChange={(e) => setV({ ...v, role_id: e.target.value || null, room_id: e.target.value ? null : v.room_id })}>
              <option value="">None</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Label</span><input value={v.label ?? ''} placeholder="Optional, e.g. Greeter" onChange={(e) => setV({ ...v, label: e.target.value || null })} /></label>
          <label className="field"><span>Needed</span><input type="number" min={1} max={100} value={v.needed} onChange={(e) => setV({ ...v, needed: Number(e.target.value) })} /></label>
          <label className="field"><span>Arrive early (min)</span><input type="number" min={0} max={240} value={v.arrive_minutes_before} onChange={(e) => setV({ ...v, arrive_minutes_before: Number(e.target.value) })} /></label>
        </div>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled">Save slot</button></div>
    </form>
  )
}
