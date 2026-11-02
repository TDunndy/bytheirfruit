'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { Empty, ExportButton, ReportHead } from '@/components/reports/ReportTools'
import { Spinner } from '@/components/ui'
import { displayName, errorMessage, getPerson, type Person } from '@/lib/people'
import { fmtDate, getSettings } from '@/lib/checkin'
import { fmtClock, reportChildHistory, type HistoryRow } from '@/lib/reports'

export default function HistoryPage() {
  return <Suspense fallback={<Spinner />}><History /></Suspense>
}

function History() {
  const id = useSearchParams().get('id') ?? ''
  const { org, can } = useSession()
  const [person, setPerson] = useState<Person | null>(null)
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [tz, setTz] = useState<string | null>(null)
  const [error, setError] = useState('')
  const allowed = can('attendance.reports') && can('kids.view')

  useEffect(() => {
    if (!org || !allowed || !id) return
    let cancelled = false
    Promise.all([reportChildHistory(id), getPerson(id), getSettings(org.id)])
      .then(([r, p, s]) => { if (!cancelled) { setRows(r); setPerson(p); setTz(s?.time_zone ?? null); setError('') } })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e)); setRows([]) } })
    return () => { cancelled = true }
  }, [org, allowed, id])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="children's attendance" />
  const name = person ? displayName(person) : 'Child'
  const csv = (rows ?? []).map((r) => [r.local_date, r.schedule_name, r.role, r.first_room_name, r.room_name, r.checked_in_at, r.checked_out_at, r.status, r.pickup_status, r.anomalies])
  return (
    <div className="stack">
      <ReportHead title={`${name}'s services`} lead="Every service, newest first: the room they were checked into, the room they ended in, times, and how pickup went.">
        <ExportButton filename={`history-${name.replace(/\s+/g, '-').toLowerCase()}.csv`} headers={['Date', 'Service', 'Role', 'Checked into', 'Ended in', 'In', 'Out', 'Status', 'Pickup', 'Anomalies']} rows={csv} names />
      </ReportHead>
      {person && <p className="muted"><Link href={`/people/view?id=${person.id}`}>Open {name}&apos;s record</Link></p>}
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null ? <Spinner /> : rows.length === 0 ? <Empty>No services yet.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Service</th><th>Checked into</th><th>Ended in</th><th>In</th><th>Out</th><th>Pickup</th><th>Notes</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.occurrence_id + r.role}>
                  <td>{fmtDate(r.local_date)}</td>
                  <td>{r.schedule_name}{r.role !== 'child' && <span className="chip" style={{ marginLeft: 8 }}>{r.role}</span>}</td>
                  <td>{r.first_room_name ?? '—'}</td>
                  <td>{r.room_name === r.first_room_name ? <span className="muted">same</span> : r.room_name ?? '—'}</td>
                  <td>{fmtClock(r.checked_in_at, tz)}</td>
                  <td>{r.status === 'in' ? <span className="chip chip-tint">still in</span> : fmtClock(r.checked_out_at, tz)}</td>
                  <td className="muted">{r.pickup_status ?? '—'}</td>
                  <td>{r.anomalies.length > 0 ? r.anomalies.map((a) => <span key={a} className="chip chip-warn" style={{ marginRight: 4 }}>{a.replace(/_/g, ' ')}</span>) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
