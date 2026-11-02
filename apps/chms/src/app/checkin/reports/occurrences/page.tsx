'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { DateRange, Empty, ExportButton, ReportHead, presetRange } from '@/components/reports/ReportTools'
import { Spinner } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import { fmtDate, fmtInstant, getSettings } from '@/lib/checkin'
import { reportOccurrences, type OccurrenceRow } from '@/lib/reports'

export default function OccurrencesReport() {
  const { org, can } = useSession()
  const [range, setRange] = useState(presetRange('8w'))
  const [rows, setRows] = useState<OccurrenceRow[] | null>(null)
  const [tz, setTz] = useState<string | null>(null)
  const [error, setError] = useState('')
  const allowed = can('attendance.reports')

  useEffect(() => {
    if (!org || !allowed || !range.from || !range.to) return
    let cancelled = false
    setRows(null)
    Promise.all([reportOccurrences(org.id, range.from, range.to), getSettings(org.id)])
      .then(([r, s]) => { if (!cancelled) { setRows(r); setTz(s?.time_zone ?? null); setError('') } })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e)); setRows([]) } })
    return () => { cancelled = true }
  }, [org, allowed, range])

  // Services in order, each with its rooms; a service nobody attended shows once.
  const services = useMemo(() => {
    const out: { id: string; head: OccurrenceRow; rooms: OccurrenceRow[] }[] = []
    for (const r of rows ?? []) {
      let s = out.find((x) => x.id === r.occurrence_id)
      if (!s) { s = { id: r.occurrence_id, head: r, rooms: [] }; out.push(s) }
      if (r.room_id) s.rooms.push(r)
    }
    return out
  }, [rows])
  const totals = (s: { rooms: OccurrenceRow[] }) => s.rooms.reduce((t, r) => ({ children: t.children + r.children, volunteers: t.volunteers + r.volunteers, attendees: t.attendees + r.attendees, first: t.first + r.first_timers, anomalies: t.anomalies + r.anomalies }), { children: 0, volunteers: 0, attendees: 0, first: 0, anomalies: 0 })

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="reports" />
  const csv = (rows ?? []).filter((r) => r.room_id).map((r) => [r.local_date, r.schedule_name, r.area_name, r.room_name, r.children, r.volunteers, r.attendees, r.first_timers, r.anomalies])
  return (
    <div className="stack">
      <ReportHead title="Services" lead="Who was in each room: children, volunteers, other adults, first-timers and anomalies, by the room the child ended the service in.">
        <ExportButton filename={`services-${range.from}-${range.to}.csv`} headers={['Date', 'Service', 'Area', 'Room', 'Children', 'Volunteers', 'Adults', 'First-timers', 'Anomalies']} rows={csv} />
      </ReportHead>
      <div className="toolbar"><DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} /></div>
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null ? <Spinner /> : services.length === 0 ? <Empty>No services in this range.</Empty> : services.map((s) => {
        const t = totals(s)
        return (
          <section key={s.id} className="section">
            <div className="group-head-row">
              <h3 className="group-head">{fmtDate(s.head.local_date)} · {s.head.schedule_name} · {fmtInstant(s.head.starts_at, tz).split(', ').slice(-1)[0]}</h3>
              <Link href={`/checkin/reports/occurrences/timeline?id=${s.id}`} className="btn btn-plain btn-small">Timeline</Link>
            </div>
            {s.rooms.length === 0 ? <p className="muted small">Nobody checked in.</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Room</th><th>Area</th><th className="num">Children</th><th className="num">Volunteers</th><th className="num">Adults</th><th className="num">First-timers</th><th className="num">Anomalies</th></tr></thead>
                  <tbody>
                    {s.rooms.map((r) => (
                      <tr key={r.room_id}>
                        <td>{r.room_name}</td><td className="muted">{r.area_name}</td>
                        <td className="num">{r.children}</td><td className="num">{r.volunteers}</td><td className="num">{r.attendees}</td>
                        <td className="num">{r.first_timers}</td><td className="num">{r.anomalies > 0 ? <span className="chip chip-warn">{r.anomalies}</span> : 0}</td>
                      </tr>
                    ))}
                    <tr className="total-row"><td>Total</td><td /><td className="num">{t.children}</td><td className="num">{t.volunteers}</td><td className="num">{t.attendees}</td><td className="num">{t.first}</td><td className="num">{t.anomalies}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
