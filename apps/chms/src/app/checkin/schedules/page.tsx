'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { IconTile, Spinner, Switch } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import {
  SCHEDULE_KINDS, WEEKDAYS, archiveSchedule, closeOccurrence, dayOffset, fmtDate, fmtInstant, fmtTime, fmtWeekdays, generateOccurrences, getSettings,
  listOccurrences, listRooms, listScheduleRooms, listSchedules, saveSchedule, setOccurrenceStatus, setScheduleRooms,
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
  const [notice, setNotice] = useState('')
  const [loaded, setLoaded] = useState(false)
  const manage = can('checkin.manage')
  const allowed = manage || can('checkin.station') || can('kids.view') || can('attendance.reports')
  const through = dayOffset(WEEKS_AHEAD * 7)

  const load = useCallback(async () => {
    if (!org || !allowed) return
    try {
      const [s, r, l, o, st] = await Promise.all([listSchedules(org.id), listRooms(org.id), listScheduleRooms(org.id), listOccurrences(org.id, dayOffset(-1), through), getSettings(org.id)])
      setSchedules(s); setRooms(r); setLinks(l); setOcc(o); setSettings(st); setError(''); setLoaded(true)
    } catch (e) { setError(errorMessage(e)) }
  }, [org, allowed, through])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load() } catch (e) { setError(errorMessage(e)) } }
  const roomName = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms])
  const schedName = useMemo(() => new Map(schedules.map((s) => [s.id, s.name])), [schedules])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="schedules" />
  if (!loaded && !error) return <Spinner />

  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      {!settings && <p className="muted">Set the church&apos;s time zone in Settings before adding schedules.</p>}
      {manage && !editing && settings && (
        <div className="row"><button className="btn btn-filled" onClick={() => setEditing({ roomIds: [] })}>Add schedule</button></div>
      )}
      {editing && (
        <ScheduleForm initial={editing} rooms={rooms} onCancel={() => setEditing(null)}
          onSave={(s, roomIds) => act(async () => {
            const saved = await saveSchedule(org.id, s)
            await setScheduleRooms(org.id, saved.id, roomIds)
            setEditing(null)
          })} />
      )}
      <section className="section">
        <h2 className="group-head">Schedules</h2>
        <ul className="group">
          {schedules.length === 0 && <li className="cell muted">No schedules yet.</li>}
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
                  <button className="btn btn-plain btn-small" onClick={() => setEditing({ ...toInput(s), roomIds: links.filter((l) => l.schedule_id === s.id).map((l) => l.room_id) })}>Edit</button>
                  <button className="btn btn-plain btn-small" onClick={() => act(() => archiveSchedule(s.id, true))}>Archive</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <div className="group-head-row">
          <h2 className="group-head">Next {WEEKS_AHEAD} weeks</h2>
          {manage && schedules.length > 0 && (
            <button className="btn btn-tinted btn-small" onClick={() => act(async () => { const n = await generateOccurrences(org.id, through); setNotice(n === 0 ? 'Everything was already there.' : `Added ${n} ${n === 1 ? 'occurrence' : 'occurrences'}.`) })}>
              Generate through {fmtDate(through)}
            </button>
          )}
        </div>
        {notice && <p className="muted" role="status">{notice}</p>}
        <ul className="group">
          {occ.length === 0 && <li className="cell muted">Nothing scheduled yet. A nightly job keeps eight weeks ahead once the first run exists.</li>}
          {occ.map((o) => (
            <li key={o.id} className="cell">
              <span className="cell-text">
                <span className="cell-title">{schedName.get(o.schedule_id) ?? 'Service'}</span>
                <span className="cell-sub">{fmtInstant(o.starts_at, settings?.time_zone)}{o.note ? ` · ${o.note}` : ''}</span>
              </span>
              <span className={`status status-${o.status === 'open' ? 'member' : o.status === 'cancelled' ? 'inactive' : o.status === 'closed' ? 'visitor' : 'regular'}`}>{o.status}</span>
              {manage && o.status === 'scheduled' && <button className="btn btn-plain btn-small" onClick={() => act(() => setOccurrenceStatus(o.id, 'cancelled'))}>Cancel</button>}
              {manage && o.status === 'cancelled' && <button className="btn btn-plain btn-small" onClick={() => act(() => setOccurrenceStatus(o.id, 'scheduled'))}>Restore</button>}
              {manage && o.status === 'open' && <button className="btn btn-plain btn-small" onClick={() => act(() => closeOccurrence(o.id))}>Close</button>}
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
  const [exdates, setExdates] = useState((initial.exdates ?? []).join(', '))
  const toggle = (list: number[] | string[], x: never) => (list as unknown[]).includes(x) ? (list as unknown[]).filter((y) => y !== x) : [...(list as unknown[]), x]
  return (
    <form className="card form" onSubmit={(e) => {
      e.preventDefault()
      if (!v.name.trim() || v.weekdays.length === 0) return
      onSave({ ...v, name: v.name.trim(), exdates: exdates.split(',').map((d) => d.trim()).filter(Boolean) }, roomIds)
    }}>
      <fieldset>
        <legend className="group-head">{v.id ? 'Edit schedule' : 'New schedule'}</legend>
        <div className="group">
          <label className="field"><span>Name</span><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. First service" required /></label>
          <label className="field"><span>Kind</span>
            <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Schedule['kind'] })}>{SCHEDULE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
          </label>
          <label className="field"><span>Starts at</span><input type="time" value={v.local_time} onChange={(e) => setV({ ...v, local_time: e.target.value })} required /></label>
          <label className="field"><span>Length (min)</span><input type="number" min={5} max={1440} value={v.duration_minutes} onChange={(e) => setV({ ...v, duration_minutes: Number(e.target.value) })} /></label>
          <div className="field"><span>Days</span>
            <div className="chips" role="group" aria-label="Weekdays">
              {WEEKDAYS.map((d, i) => (
                <label key={d} className={v.weekdays.includes(i) ? 'chip chip-check on' : 'chip chip-check'}>
                  <input type="checkbox" checked={v.weekdays.includes(i)} onChange={() => setV({ ...v, weekdays: toggle(v.weekdays, i as never) as number[] })} />{d}
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
          <label className="field"><span>Skip dates</span><input value={exdates} onChange={(e) => setExdates(e.target.value)} placeholder="2027-12-26, comma separated" /></label>
          <div className="field"><Switch label="Active" checked={v.active} onChange={(on) => setV({ ...v, active: on })} /></div>
        </div>
      </fieldset>
      <fieldset>
        <legend className="group-head">Rooms that run</legend>
        <div className="group">
          {rooms.length === 0 && <div className="cell muted">Add rooms first.</div>}
          {rooms.map((r) => (
            <div key={r.id} className="field"><Switch label={r.name} checked={roomIds.includes(r.id)} onChange={() => setRoomIds(toggle(roomIds, r.id as never) as string[])} /></div>
          ))}
        </div>
      </fieldset>
      <div className="actions"><button type="button" className="btn btn-tinted" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-filled" disabled={v.weekdays.length === 0}>Save schedule</button></div>
    </form>
  )
}
