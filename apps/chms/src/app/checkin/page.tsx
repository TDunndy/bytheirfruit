'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { Chevron, Icon, IconTile, Spinner } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import {
  dayOffset, fmtInstant, getSettings, listAreas, listOccurrences, listRooms, listSchedules, listStations,
  type CheckinSettings, type Occurrence, type Schedule,
} from '@/lib/checkin'

export default function CheckinOverview() {
  const { org, can } = useSession()
  const [settings, setSettings] = useState<CheckinSettings | null | undefined>(undefined)
  const [counts, setCounts] = useState({ areas: 0, rooms: 0, schedules: 0, stations: 0 })
  const [upcoming, setUpcoming] = useState<Occurrence[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [error, setError] = useState('')
  const allowed = can('checkin.manage') || can('checkin.station') || can('attendance.reports') || can('kids.view')

  useEffect(() => {
    if (!org || !allowed) return
    let cancelled = false
    Promise.all([getSettings(org.id), listAreas(org.id), listRooms(org.id), listSchedules(org.id), listStations(org.id), listOccurrences(org.id, dayOffset(0), dayOffset(14))])
      .then(([s, areas, rooms, scheds, stations, occ]) => {
        if (cancelled) return
        setSettings(s)
        setCounts({ areas: areas.length, rooms: rooms.length, schedules: scheds.length, stations: stations.length })
        setSchedules(scheds)
        setUpcoming(occ.filter((o) => o.status !== 'cancelled').slice(0, 8))
      })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)) })
    return () => { cancelled = true }
  }, [org, allowed])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="check-in" />
  if (settings === undefined && !error) return <Spinner />
  const name = new Map(schedules.map((s) => [s.id, s.name]))

  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      {!settings && can('checkin.manage') && (
        <div className="card callout">
          <Icon name="warn" size={20} className="callout-icon" />
          <div>
            <strong>Set the church&apos;s time zone first.</strong>
            <p className="muted">Schedules turn into Sunday-morning times with it. <Link href="/checkin/settings">Open settings</Link>.</p>
          </div>
        </div>
      )}
      <ul className="group">
        <li><Link href="/checkin/rooms" className="cell-link"><IconTile name="room" /><span className="cell-title">Areas and rooms</span><span className="cell-value">{counts.areas} areas · {counts.rooms} rooms</span><Chevron /></Link></li>
        <li><Link href="/checkin/schedules" className="cell-link"><IconTile name="clock" /><span className="cell-title">Schedules</span><span className="cell-value">{counts.schedules}</span><Chevron /></Link></li>
        <li><Link href="/checkin/stations" className="cell-link"><IconTile name="tablet" /><span className="cell-title">Stations</span><span className="cell-value">{counts.stations}</span><Chevron /></Link></li>
        <li><Link href="/checkin/labels" className="cell-link"><IconTile name="print" /><span className="cell-title">Printers and labels</span><Chevron /></Link></li>
      </ul>
      <section className="section">
        <h2 className="group-head">Services in the next two weeks</h2>
        <ul className="group">
          {upcoming.length === 0 && <li className="cell muted">No services on the calendar yet. Add a schedule to fill the next eight weeks.</li>}
          {upcoming.map((o) => (
            <li key={o.id} className="cell">
              <span className="cell-text">
                <span className="cell-title">{name.get(o.schedule_id) ?? 'Service'}</span>
                <span className="cell-sub">{fmtInstant(o.starts_at, settings?.time_zone)}</span>
              </span>
              <span className={`status status-${o.status === 'open' ? 'member' : o.status === 'closed' ? 'inactive' : 'regular'}`}>{o.status === 'scheduled' ? 'Scheduled' : o.status === 'open' ? 'Open' : 'Closed'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
