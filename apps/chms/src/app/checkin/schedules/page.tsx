'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { IconTile, Spinner, Switch } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import {
  SCHEDULE_KINDS, WEEKDAYS, archiveSchedule, closeOccurrence, dayOffset, fmtDate, fmtInstant, fmtTime, fmtWeekdays, generateOccurrences, getSettings,
  label, listOccurrences, listRooms, listScheduleRooms, listSchedules, saveSchedule, setOccurrenceStatus, setScheduleRooms, todayIn,
  type CheckinSettings, type Occurrence, type Room, type Schedule, type ScheduleInput, type ScheduleRoom,
} from '@/lib/checkin'

const WEEKS_AHEAD = 8

export default function SchedulesPage() {
  const { org, can } = useSession()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [links, setLinks] = useState<ScheduleRoom[]>([])
  const [occ, setOcc] = useState<Occurrence[]>([])
  const [settings, setSettings] = useState<CheckinSettings | null>(null)
  const [editing, setEditing] = useState<Partial<ScheduleInput> & { roomIds?: string[] } | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [loaded, setLoaded] = useState(false)
  const manage = can('checkin.manage')
  const allowed = manage || can('checkin.station') || can('kids.view') || can('attendance.reports')

  const load = useCallback(async () => {
    if (!org || !allowed) return
    try {
      const st = await getSettings(org.id)
      const today = todayIn(st?.time_zone)
      const [s, r, l, o] = await Promise.all([listSchedules(org.id), listRooms(org.id), listScheduleRooms(org.id), listOccurrences(org.id, dayOffset(-1, today), dayOffset(WEEKS_AHEAD * 7, today))])
      setSchedules(s); setRooms(r); setLinks(l); setOcc(o); setSettings(st); setError(''); setLoaded(true)
    } catch (e) { setError(errorMessage(e)) }
  }, [org, allowed])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>, done = 'Saved') => { setStatus(''); try { await fn(); await load(); setStatus(done) } catch (e) { setError(errorMessage(e)) } }
  const roomName = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms])
  const schedName = useMemo(() => new Map(schedules.map((s) => [s.id, s.name])), [schedules])
  const through = dayOffset(WEEKS_AHEAD * 7, todayIn(settings?.time_zone))

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="schedules" />
  if (!loaded && !error) return <Spinner />

  if (editing) {
    return (
      <ScheduleForm key={editing.id ?? 'new'} initial={editing} rooms={rooms} onCancel={() => setEditing(null)}
        onSave={(s, roomIds) => act(async () => {
          const saved = await saveSchedule(org.id, s)
          await setScheduleRooms(org.id, saved.id, roomIds)
          // Saving a schedule puts the next eight weeks on the calendar.
          await generateOccurrences(org.id, through)
          setEditing(null)
        }, 'Schedule saved')} />
    )
  }

  return (
    <div className="stack">
      <p className="sr-only" role="status">{status}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {!settings && <p className="muted">Set the church&apos;s time zone in Settings before adding schedules.</p>}
      {manage && settings && <div className="row"><button className="btn btn-filled" onClick={() => setEditing({ roomIds: [] })}>Add schedule</button></div>}
      <section className="section">
        <h2 className="group-head">Schedules</h2>
        <ul className="group">
          {schedules.length === 0 && <li className="cell muted">No schedules yet. A schedule is a service, class or event that repeats: Sundays at 9:00, for example.</li>}
          {schedules.map((s) => (
            <li key={s.id} className="cell">
              <IconTile name="clock" />
              <span className="cell-text">
                <span className="cell-title">{s.name}{!s.active && <span className="chip">Paused</span>}</span>
                <span className="cell-sub">
                  {fmtWeekdays(s.weekdays)} at {fmtTime(s.local_time)} · {s.duration_minutes} min{s.interval_weeks > 1 ? ` · every ${s.interval_weeks} weeks` : ''}
                  {' · '}{links.filter((l) => l.schedule_id === s.id).map((l) => roomName.get(l.room_id)).filter(Boolean).join(', ') || 'no rooms'}
                </span>
              </span>
              {manage && (
                <div className="actions">
                  <button className="btn btn-plain btn-small" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ ...toInput(s), roomIds: links.filter((l) => l.schedule_id === s.id).map((l) => l.room_id) })}>Edit</button>
                  <button className="btn btn-plain btn-small" aria-label={`Archive ${s.name}`} onClick={() => { if (window.confirm(`Archive ${s.name}? Its upcoming services are cancelled.`)) act(() => archiveSchedule(s.id, true), 'Schedule archived') }}>Archive</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <div className="group-head-row">
          <h2 className="group-head">Services in the next {WEEKS_AHEAD} weeks</h2>
          {manage && schedules.length > 0 && (
            <button className="btn btn-tinted btn-small" onClick={() => act(async () => { const n = await generateOccurrences(org.id, through); setStatus(n === 0 ? 'The calendar was already complete.' : `Added ${n} ${n === 1 ? 'service' : 'services'}.`) }, '')}>
              Fill the calendar through {fmtDate(through)}
            </button>
          )}
        </div>
        {status && !/^Saved|saved$/.test(status) && <p className="muted">{status}</p>}
        <ul className="group">
          {occ.length === 0 && <li className="cell muted">Nothing on the calendar yet. Saving a schedule adds its services; a nightly job keeps eight weeks ahead after that.</li>}
          {occ.map((o) => (
            <li key={o.id} className="cell">
              <span className="cell-text">
                <span className="cell-title">{schedName.get(o.schedule_id) ?? 'Service'}</span>
                <span className="cell-sub">{fmtInstant(o.starts_at, settings?.time_zone)}{o.note ? ` · ${o.note}` : ''}</span>
              </span>
              <span className={`status status-${o.status === 'open' ? 'member' : o.status === 'cancelled' ? 'inactive' : o.status === 'closed' ? 'visitor' : 'regular'}`}>
                {o.status === 'scheduled' ? 'Scheduled' : o.status === 'open' ? 'Open' : o.status === 'closed' ? 'Closed' : 'Cancelled'}
              </span>
              {manage && o.status === 'scheduled' && <button className="btn btn-plain btn-small" aria-label={`Cancel the ${schedName.get(o.schedule_id) ?? 'service'} on ${fmtDate(o.local_date)}`} onClick={() => act(() => setOccurrenceStatus(o.id, 'cancelled'), 'Service cancelled')}>Cancel service</button>}
              {manage && o.status === 'cancelled' && <button className="btn btn-plain btn-small" aria-label={`Restore the ${schedName.get(o.schedule_id) ?? 'service'} on ${fmtDate(o.local_date)}`} onClick={() => act(() => setOccurrenceStatus(o.id, 'scheduled'), 'Service restored')}>Restore</button>}
              {manage && o.status === 'open' && <button className="btn btn-plain btn-small" aria-label={`Close the ${schedName.get(o.schedule_id) ?? 'service'} on ${fmtDate(o.local_date)}`} onClick={() => { if (window.confirm(`Close the ${schedName.get(o.schedule_id) ?? 'service'}? No more check-ins will be taken.`)) act(() => closeOccurrence(o.id), 'Service closed') }}>Close service</button>}
              {manage && o.status === 'closed' && <button className="btn btn-plain btn-small" aria-label={`Reopen the ${schedName.get(o.schedule_id) ?? 'service'} on ${fmtDate(o.local_date)}`} onClick={() => act(() => setOccurrenceStatus(o.id, 'open'), 'Service reopened')}>Reopen</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function toInput(s: Schedule): ScheduleInput {
  return {
    id: s.id, name: s.name, kind: s.kind, local_time: s.local_time.slice(0, 5), duration_minutes: s.duration_minutes, weekdays: s.weekdays,
    interval_weeks: s.interval_weeks, starts_on: s.starts_on, until: s.until, exdates: s.exdates, active: s.active,
  }
}

function ScheduleForm({ initial, rooms, onSave, onCancel }: {
  initial: Partial<ScheduleInput> & { roomIds?: string[] }
  rooms: Room[]
  onSave: (s: ScheduleInput, roomIds: string[]) => Promise<void>
  onCancel: () => void
}) {
  const [v, setV] = useState<ScheduleInput>({
    id: initial.id, name: initial.name ?? '', kind: initial.kind ?? 'service', local_time: initial.local_time ?? '09:00', duration_minutes: initial.duration_minutes ?? 90,
    weekdays: initial.weekdays ?? [0], interval_weeks: initial.interval_weeks ?? 1, starts_on: initial.starts_on ?? dayOffset(0), until: initial.until ?? null,
    exdates: initial.exdates ?? [], active: initial.active ?? true,
  })
  const [roomIds, setRoomIds] = useState<string[]>(initial.roomIds ?? [])
  const [skip, setSkip] = useState('')
  const [busy, setBusy] = useState(false)
  const toggleDay = (d: number) => setV({ ...v, weekdays: v.weekdays.includes(d) ? v.weekdays.filter((x) => x !== d) : [...v.weekdays, d] })
  const toggleRoom = (id: string) => setRoomIds(roomIds.includes(id) ? roomIds.filter((x) => x !== id) : [...roomIds, id])
  return (
    <form className="card form" onSubmit={async (e) => {
      e.preventDefault()
      if (!v.name.trim() || v.weekdays.length === 0) return
      setBusy(true)
      await onSave({ ...v, name: v.name.trim() }, roomIds)
      setBusy(false)
    }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit schedule' : 'New schedule'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. First service" required /></label>
          <label className="field"><span>Kind</span>
            <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Schedule['kind'] })}>{SCHEDULE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
          </label>
          <label className="field"><span>Starts at</span><input type="time" value={v.local_time} onChange={(e) => setV({ ...v, local_time: e.target.value })} required /></label>
          <label className="field"><span>Length (min)</span><input type="number" min={5} max={1440} value={v.duration_minutes} onChange={(e) => setV({ ...v, duration_minutes: Number(e.target.value) })} /></label>
          <div className="field"><span>Days</span>
            <div className="chips" role="group" aria-label="Weekdays">
              {WEEKDAYS.map((d, i) => (
                <label key={d} className={v.weekdays.includes(i) ? 'chip chip-check on' : 'chip chip-check'}>
                  <input type="checkbox" checked={v.weekdays.includes(i)} onChange={() => toggleDay(i)} />{d}
                </label>
              ))}
            </div>
          </div>
          <label className="field"><span>Every</span>
            <select value={v.interval_weeks} onChange={(e) => setV({ ...v, interval_weeks: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 1 ? 'week' : `${n} weeks`}</option>)}
            </select>
          </label>
          <label className="field"><span>From</span><input type="date" value={v.starts_on} onChange={(e) => setV({ ...v, starts_on: e.target.value })} required /></label>
          <label className="field"><span>Until</span><input type="date" value={v.until ?? ''} data-empty={!v.until} onChange={(e) => setV({ ...v, until: e.target.value || null })} /></label>
          <div className="field"><span>Skip dates</span>
            <div className="chips" role="group" aria-label="Skipped dates">
              {v.exdates.map((d) => (
                <span key={d} className="chip">{fmtDate(d)}<button type="button" className="chip-remove" aria-label={`Stop skipping ${fmtDate(d)}`} onClick={() => setV({ ...v, exdates: v.exdates.filter((x) => x !== d) })}>×</button></span>
              ))}
              <input type="date" className="field-input" aria-label="Date to skip" value={skip} data-empty={!skip} onChange={(e) => setSkip(e.target.value)} />
              <button type="button" className="btn btn-plain btn-small" disabled={!skip} onClick={() => { if (skip && !v.exdates.includes(skip)) setV({ ...v, exdates: [...v.exdates, skip].sort() }); setSkip('') }}>Skip</button>
            </div>
          </div>
          <div className="field"><Switch label="Active" checked={v.active} onChange={(on) => setV({ ...v, active: on })} /></div>
        </div>
      </fieldset>
      <fieldset>
        <legend className="group-head">Rooms that run</legend>
        <div className="group">
          {rooms.length === 0 && <div className="cell muted">Add rooms first.</div>}
          {rooms.map((r) => (
            <div key={r.id} className="field"><Switch label={r.name} checked={roomIds.includes(r.id)} onChange={() => toggleRoom(r.id)} /></div>
          ))}
        </div>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled" disabled={v.weekdays.length === 0 || busy}>{busy ? 'Saving…' : 'Save schedule'}</button></div>
    </form>
  )
}

