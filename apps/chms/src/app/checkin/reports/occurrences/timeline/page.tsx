'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { Empty, ExportButton, ReportHead } from '@/components/reports/ReportTools'
import { Spinner } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import { getSettings, listRooms, type Room } from '@/lib/checkin'
import { fmtClock, reportTimeline, type TimelineRow } from '@/lib/reports'

export default function TimelinePage() {
  return <Suspense fallback={<Spinner />}><Timeline /></Suspense>
}

function Timeline() {
  const id = useSearchParams().get('id') ?? ''
  const { org, can } = useSession()
  const [step, setStep] = useState(5)
  const [rows, setRows] = useState<TimelineRow[] | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [tz, setTz] = useState<string | null>(null)
  const [error, setError] = useState('')
  const allowed = can('attendance.reports')

  useEffect(() => {
    if (!org || !allowed || !id) return
    let cancelled = false
    setRows(null)
    Promise.all([reportTimeline(id, step), listRooms(org.id, true), getSettings(org.id)])
      .then(([r, rm, s]) => { if (!cancelled) { setRows(r); setRooms(rm); setTz(s?.time_zone ?? null); setError('') } })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e)); setRows([]) } })
    return () => { cancelled = true }
  }, [org, allowed, id, step])

  // Ticks down, rooms across; a room over its ratio is flagged.
  const grid = useMemo(() => {
    const roomIds = Array.from(new Set((rows ?? []).map((r) => r.room_id)))
    const names = new Map((rows ?? []).map((r) => [r.room_id, r.room_name]))
    const ratio = new Map(rooms.map((r) => [r.id, r.children_per_adult]))
    const ticks = Array.from(new Set((rows ?? []).map((r) => r.at))).sort()
    const cell = new Map((rows ?? []).map((r) => [`${r.at}|${r.room_id}`, r]))
    // trim the quiet start and end
    const busy = (t: string) => roomIds.some((rid) => { const c = cell.get(`${t}|${rid}`); return c && (c.children + c.adults) > 0 })
    const first = ticks.findIndex(busy), last = ticks.length - 1 - [...ticks].reverse().findIndex(busy)
    return { roomIds, names, ratio, ticks: first < 0 ? [] : ticks.slice(Math.max(0, first - 1), last + 2), cell }
  }, [rows, rooms])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="reports" />
  if (!id) return <Empty>No service chosen.</Empty>
  const over = (rid: string, c: TimelineRow) => { const r = grid.ratio.get(rid); return !!r && c.children > c.adults * r }
  const csv = (rows ?? []).map((r) => [r.at, r.room_name, r.children, r.adults])
  return (
    <div className="stack">
      <ReportHead title="Through the service" lead="Children and adults in each room every few minutes, from the first arrival to the last pickup. A room past its children-per-adult ratio is marked.">
        <ExportButton filename={`timeline-${id.slice(0, 8)}.csv`} headers={['At', 'Room', 'Children', 'Adults']} rows={csv} />
      </ReportHead>
      <div className="toolbar"><div className="toolbar-row">
        <label className="row"><span className="muted">Every</span>
          <select className="popup" aria-label="Step" value={step} onChange={(e) => setStep(Number(e.target.value))}>
            {[5, 10, 15, 30].map((n) => <option key={n} value={n}>{n} minutes</option>)}
          </select></label>
      </div></div>
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null ? <Spinner /> : grid.ticks.length === 0 ? <Empty>Nobody was in a room during this service.</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Time</th>{grid.roomIds.map((rid) => <th key={rid} className="num">{grid.names.get(rid)}</th>)}</tr></thead>
            <tbody>
              {grid.ticks.map((t) => (
                <tr key={t}>
                  <td>{fmtClock(t, tz)}</td>
                  {grid.roomIds.map((rid) => {
                    const c = grid.cell.get(`${t}|${rid}`)
                    if (!c || c.children + c.adults === 0) return <td key={rid} className="num muted">—</td>
                    return <td key={rid} className="num">{over(rid, c) ? <span className="chip chip-warn">{c.children} / {c.adults}</span> : <>{c.children} <span className="muted">/ {c.adults}</span></>}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="group-foot">Each cell is children / adults in the room at that moment.</p>
    </div>
  )
}
