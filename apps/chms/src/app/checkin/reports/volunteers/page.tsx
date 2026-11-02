'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { DateRange, Empty, ExportButton, ReportHead, presetRange } from '@/components/reports/ReportTools'
import { SegmentedControl, Spinner } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import { fmtDate, getSettings } from '@/lib/checkin'
import { fmtClock, fmtMonth, punctualityLabel, reportVolunteers, volunteerSummary, type VolunteerRow } from '@/lib/reports'

type View = 'serves' | 'rooms' | 'punctuality' | 'detail'

export default function VolunteersReport() {
  const { org, can } = useSession()
  const [range, setRange] = useState(presetRange('8w'))
  const [view, setView] = useState<View>('serves')
  const [rows, setRows] = useState<VolunteerRow[] | null>(null)
  const [tz, setTz] = useState<string | null>(null)
  const [error, setError] = useState('')
  const allowed = can('attendance.reports') && can('people.view')

  useEffect(() => {
    if (!org || !allowed || !range.from || !range.to) return
    let cancelled = false
    setRows(null)
    Promise.all([reportVolunteers(org.id, range.from, range.to), getSettings(org.id)])
      .then(([r, s]) => { if (!cancelled) { setRows(r); setTz(s?.time_zone ?? null); setError('') } })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e)); setRows([]) } })
    return () => { cancelled = true }
  }, [org, allowed, range])

  const summary = useMemo(() => volunteerSummary(rows ?? [], range.from, range.to), [rows, range])
  const wide = summary.months.length <= 12

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="the volunteers report" />
  const csv = view === 'detail'
    ? { headers: ['Date', 'Service', 'Volunteer', 'Room', 'Need', 'Scheduled', 'Attended', 'Checked in', 'Punctuality', 'Minutes vs expected'],
        rows: (rows ?? []).map((r) => [r.local_date, r.schedule_name, r.name, r.room_name, r.slot_label ?? r.role_name, r.scheduled, r.attended, r.checked_in_at, punctualityLabel(r.punctuality), r.minutes_vs_expected]) }
    : { headers: ['Volunteer', 'Serves', ...summary.months.map(fmtMonth), ...summary.rooms, 'Early', 'On time', 'Late', 'No-shows', 'Walk-ups'],
        rows: summary.people.map((p) => [p.name, p.serves, ...summary.months.map((m) => p.byMonth[m] ?? 0), ...summary.rooms.map((r) => p.byRoom[r] ?? 0), p.early, p.on_time, p.late, p.no_show, p.unscheduled]) }
  return (
    <div className="stack">
      <ReportHead title="Volunteers" lead="Serves per volunteer (one per service), by month and by room, and how each scheduled volunteer arrived: early, on time, late, or not at all.">
        <ExportButton filename={`volunteers-${view}-${range.from}-${range.to}.csv`} headers={csv.headers} rows={csv.rows} names />
      </ReportHead>
      <div className="toolbar">
        <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <div className="toolbar-row">
          <SegmentedControl label="View" name="volunteer-view" value={view} onChange={setView} options={[
            { value: 'serves', label: 'Serves' }, { value: 'rooms', label: 'By room' }, { value: 'punctuality', label: 'Punctuality' }, { value: 'detail', label: 'Every service' }]} />
          {rows && <span className="muted">{summary.people.length} volunteers</span>}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null ? <Spinner /> : rows.length === 0 ? <Empty>No volunteer schedule or check-ins in this range.</Empty> : view === 'detail' ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Service</th><th>Volunteer</th><th>Room</th><th className="hide-md">Need</th><th>Checked in</th><th>Arrived</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.occurrence_id}-${r.person_id}-${i}`}>
                  <td>{fmtDate(r.local_date)}</td><td>{r.schedule_name}</td>
                  <td><Link href={`/people/view?id=${r.person_id}`}>{r.name}</Link></td>
                  <td>{r.room_name ?? '—'}</td><td className="hide-md muted">{r.slot_label ?? r.role_name ?? (r.scheduled ? 'Scheduled' : '—')}</td>
                  <td>{fmtClock(r.checked_in_at, tz)}</td>
                  <td><Punct p={r.punctuality} mins={r.minutes_vs_expected} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>Volunteer</th><th className="num">Serves</th>
              {view === 'serves' && wide && summary.months.map((m) => <th key={m} className="num">{fmtMonth(m)}</th>)}
              {view === 'rooms' && summary.rooms.map((r) => <th key={r} className="num">{r}</th>)}
              {view === 'punctuality' && <><th className="num">Early</th><th className="num">On time</th><th className="num">Late</th><th className="num">No-shows</th><th className="num">Walk-ups</th><th className="num">On time or early</th></>}
            </tr></thead>
            <tbody>
              {summary.people.map((p) => {
                const timed = p.early + p.on_time + p.late
                return (
                  <tr key={p.person_id}>
                    <td><Link href={`/people/view?id=${p.person_id}`}>{p.name}</Link></td>
                    <td className="num"><strong>{p.serves}</strong></td>
                    {view === 'serves' && wide && summary.months.map((m) => <td key={m} className="num">{p.byMonth[m] ? p.byMonth[m] : <span className="muted">·</span>}</td>)}
                    {view === 'rooms' && summary.rooms.map((r) => <td key={r} className="num">{p.byRoom[r] ? p.byRoom[r] : <span className="muted">·</span>}</td>)}
                    {view === 'punctuality' && <>
                      <td className="num">{p.early || <span className="muted">·</span>}</td><td className="num">{p.on_time || <span className="muted">·</span>}</td>
                      <td className="num">{p.late ? <span className="chip chip-warn">{p.late}</span> : <span className="muted">·</span>}</td>
                      <td className="num">{p.no_show ? <span className="chip chip-warn">{p.no_show}</span> : <span className="muted">·</span>}</td>
                      <td className="num">{p.unscheduled || <span className="muted">·</span>}</td>
                      <td className="num">{timed ? `${Math.round(((p.early + p.on_time) / timed) * 100)}%` : <span className="muted">—</span>}</td>
                    </>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="group-foot">Expected arrival is the service start minus the need&apos;s &quot;arrive early&quot; minutes, with the grace window from Check-in → Settings. A no-show is a scheduled volunteer with no check-in once the service has ended.</p>
    </div>
  )
}

function Punct({ p, mins }: { p: string | null; mins: number | null }) {
  const label = punctualityLabel(p)
  const cls = p === 'late' || p === 'no_show' ? 'chip chip-warn' : p === 'early' || p === 'on_time' ? 'chip chip-tint' : 'chip'
  if (!p) return <span className="muted">Pending</span>
  return <span className={cls}>{label}{mins !== null && (p === 'early' || p === 'late') ? ` ${Math.abs(mins)} min` : ''}</span>
}
