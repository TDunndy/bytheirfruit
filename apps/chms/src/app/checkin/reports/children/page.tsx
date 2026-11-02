'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { DateRange, Empty, ExportButton, ReportHead, presetRange } from '@/components/reports/ReportTools'
import { SearchField, Spinner, Switch } from '@/components/ui'
import { age, errorMessage } from '@/lib/people'
import { childName, fmtMonth, fmtShortDate, monthsBetween, reportChildren, type ChildRow } from '@/lib/reports'

export default function ChildrenReport() {
  const { org, can } = useSession()
  const [range, setRange] = useState(presetRange('ytd'))
  const [rows, setRows] = useState<ChildRow[] | null>(null)
  const [q, setQ] = useState('')
  const [onlyAttended, setOnlyAttended] = useState(true)
  const [error, setError] = useState('')
  const allowed = can('attendance.reports') && can('kids.view')

  useEffect(() => {
    if (!org || !allowed || !range.from || !range.to) return
    let cancelled = false
    setRows(null)
    reportChildren(org.id, range.from, range.to)
      .then((r) => { if (!cancelled) { setRows(r); setError('') } })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e)); setRows([]) } })
    return () => { cancelled = true }
  }, [org, allowed, range])

  const months = useMemo(() => monthsBetween(range.from, range.to), [range])
  const wide = months.length <= 12
  const shown = useMemo(() => (rows ?? []).filter((r) => (!onlyAttended || r.attended > 0) && (!q || childName(r).toLowerCase().includes(q.toLowerCase()) || (r.household_name ?? '').toLowerCase().includes(q.toLowerCase()))), [rows, q, onlyAttended])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="children's attendance" />
  const headers = ['Child', 'Family', 'Age', ...(wide ? months.map(fmtMonth) : []), 'Check-ins', 'First attended', 'Last attended', 'Last room', 'Absences in a row']
  const csv = shown.map((r) => [childName(r), r.household_name, age(r.birthdate), ...(wide ? months.map((m) => r.by_month[m] ?? 0) : []), r.attended, r.first_attended, r.last_attended, r.last_room_name, r.consecutive_absences])
  return (
    <div className="stack">
      <ReportHead title="Children" lead="Each child's check-ins in the range by month, when they first and last attended, their last room, and how many of their own services they have missed in a row.">
        <ExportButton filename={`children-${range.from}-${range.to}.csv`} headers={headers} rows={csv} names />
      </ReportHead>
      <div className="toolbar">
        <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <div className="toolbar-row">
          <SearchField className="search" placeholder="Search children" aria-label="Search children" value={q} onChange={(e) => setQ(e.target.value)} />
          <Switch label="Only children who attended" checked={onlyAttended} onChange={setOnlyAttended} />
          {rows && <span className="muted">{shown.length} of {rows.length}</span>}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null ? <Spinner /> : shown.length === 0 ? <Empty>No children match.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>Child</th><th className="hide-md">Family</th><th className="num">Age</th>
              {wide && months.map((m) => <th key={m} className="num">{fmtMonth(m)}</th>)}
              <th className="num">Total</th><th>First</th><th>Last</th><th>Last room</th><th className="num">Missed in a row</th>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.person_id}>
                  <td><Link href={`/checkin/reports/children/history?id=${r.person_id}`}>{childName(r)}</Link></td>
                  <td className="hide-md muted">{r.household_name ?? '—'}</td>
                  <td className="num">{age(r.birthdate) ?? '—'}</td>
                  {wide && months.map((m) => <td key={m} className="num">{r.by_month[m] ? r.by_month[m] : <span className="muted">·</span>}</td>)}
                  <td className="num"><strong>{r.attended}</strong></td>
                  <td>{fmtShortDate(r.first_attended)}</td><td>{fmtShortDate(r.last_attended)}</td>
                  <td>{r.last_room_name ?? '—'}</td>
                  <td className="num">{r.consecutive_absences >= 4 ? <span className="chip chip-warn">{r.consecutive_absences}</span> : r.consecutive_absences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="group-foot">Absences count services of the schedules the child has attended, that actually ran, since their last check-in.</p>
    </div>
  )
}
