'use client'

import { useEffect, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { DateRange, Empty, ExportButton, ReportHead, presetRange } from '@/components/reports/ReportTools'
import { Spinner } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import { fmtDate, getSettings } from '@/lib/checkin'
import { fmtClock, reportArrivals, reportOps, type ArrivalRow, type OpsRow } from '@/lib/reports'

export default function OpsReport() {
  const { org, can } = useSession()
  const [range, setRange] = useState(presetRange('8w'))
  const [rows, setRows] = useState<OpsRow[] | null>(null)
  const [day, setDay] = useState('')
  const [step, setStep] = useState(5)
  const [arrivals, setArrivals] = useState<ArrivalRow[] | null>(null)
  const [tz, setTz] = useState<string | null>(null)
  const [error, setError] = useState('')
  const allowed = can('attendance.reports')

  useEffect(() => {
    if (!org || !allowed || !range.from || !range.to) return
    let cancelled = false
    setRows(null)
    Promise.all([reportOps(org.id, range.from, range.to), getSettings(org.id)])
      .then(([r, s]) => { if (!cancelled) { setRows(r); setTz(s?.time_zone ?? null); setError('') } })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e)); setRows([]) } })
    return () => { cancelled = true }
  }, [org, allowed, range])

  useEffect(() => {
    if (!org || !allowed || !day) { setArrivals(null); return }
    let cancelled = false
    setArrivals(null)
    reportArrivals(org.id, day, step)
      .then((r) => { if (!cancelled) setArrivals(r) })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e)); setArrivals([]) } })
    return () => { cancelled = true }
  }, [org, allowed, day, step])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="reports" />
  const fmtSecs = (s: number | null) => (s === null ? '—' : s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
  const csv = (rows ?? []).map((r) => [r.local_date, r.sessions, r.completed_sessions, r.avg_session_seconds, r.checkins, r.prints, r.reprints, r.print_failures, r.delayed_events, r.offline_sessions, r.anomalies, r.alerts, r.stations_used])
  return (
    <div className="stack">
      <ReportHead title="Operations" lead="Per day: family passes and how long they took, check-ins, labels (first prints, reprints, failures), events that reached the server late, passes queued offline, anomalies, alerts and the stations in use.">
        <ExportButton filename={`operations-${range.from}-${range.to}.csv`} headers={['Date', 'Passes', 'Completed', 'Avg seconds', 'Check-ins', 'Prints', 'Reprints', 'Print failures', 'Synced late', 'Queued offline', 'Anomalies', 'Alerts', 'Stations']} rows={csv} />
      </ReportHead>
      <div className="toolbar"><DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} /></div>
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null ? <Spinner /> : rows.length === 0 ? <Empty>No activity in this range.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Day</th><th className="num">Passes</th><th className="num hide-md">Avg time</th><th className="num">Check-ins</th><th className="num">Prints</th><th className="num">Reprints</th><th className="num hide-md">Failed</th><th className="num">Synced late</th><th className="num hide-md">Offline</th><th className="num">Anomalies</th><th className="num">Alerts</th><th className="num hide-md">Stations</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.local_date}>
                  <td>{fmtDate(r.local_date)}</td>
                  <td className="num">{r.sessions}{r.completed_sessions < r.sessions && <span className="muted small"> ({r.completed_sessions} done)</span>}</td>
                  <td className="num hide-md">{fmtSecs(r.avg_session_seconds)}</td>
                  <td className="num">{r.checkins}</td><td className="num">{r.prints}</td><td className="num">{r.reprints}</td>
                  <td className="num hide-md">{r.print_failures ? <span className="chip chip-warn">{r.print_failures}</span> : 0}</td>
                  <td className="num">{r.delayed_events ? <span className="chip chip-warn">{r.delayed_events}</span> : 0}</td>
                  <td className="num hide-md">{r.offline_sessions}</td>
                  <td className="num">{r.anomalies ? <span className="chip chip-warn">{r.anomalies}</span> : 0}</td>
                  <td className="num">{r.alerts ? <span className="chip chip-warn">{r.alerts}</span> : 0}</td>
                  <td className="num hide-md">{r.stations_used}</td>
                  <td><button type="button" className="btn btn-plain btn-small" aria-pressed={day === r.local_date} onClick={() => setDay(day === r.local_date ? '' : r.local_date)}>Arrivals</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {day && (
        <section className="section">
          <div className="group-head-row">
            <h3 className="group-head">Arrivals on {fmtDate(day)}</h3>
            <label className="row"><span className="muted">Every</span>
              <select className="popup" aria-label="Step" value={step} onChange={(e) => setStep(Number(e.target.value))}>{[5, 10, 15, 30].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label>
          </div>
          {arrivals === null ? <Spinner /> : arrivals.length === 0 ? <p className="muted">No arrivals recorded.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Time</th><th>Station</th><th className="num">Passes</th><th className="num">Check-ins</th></tr></thead>
                <tbody>
                  {arrivals.map((a, i) => (
                    <tr key={`${a.at}-${a.station_id ?? 'none'}-${i}`}>
                      <td>{fmtClock(a.at, tz)}</td><td>{a.station_name ?? <span className="muted">Church app</span>}</td>
                      <td className="num">{a.sessions}</td><td className="num">{a.checkins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      <p className="group-foot">&quot;Synced late&quot; counts events recorded more than two minutes after the device&apos;s own time, which is how a Wi-Fi drop shows up. Print failures are counted when a station reports them.</p>
    </div>
  )
}
