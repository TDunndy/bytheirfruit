'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { Empty, ExportButton, ReportHead } from '@/components/reports/ReportTools'
import { Spinner } from '@/components/ui'
import { age, errorMessage } from '@/lib/people'
import { dayOffset, fmtDate, getSettings, listAreas, listOccurrences, listRooms, todayIn, type CheckinSettings } from '@/lib/checkin'
import { childName, coreRooms, cutoffFrom, moveUps, reportChildren, type ChildRow, type MoveUp } from '@/lib/reports'
import type { Occurrence, Room } from '@/lib/checkin'

export default function MoveUpReport() {
  const { org, can } = useSession()
  const [through, setThrough] = useState(dayOffset(60))
  const [data, setData] = useState<{ children: ChildRow[]; rooms: Room[]; kidsAreas: Set<string>; settings: CheckinSettings | null; occurrences: Occurrence[] } | null>(null)
  const [error, setError] = useState('')
  const allowed = can('attendance.reports') && can('kids.view')
  const today = todayIn(data?.settings?.time_zone)

  // One read: every child, with the rooms, settings and the services up to a year out.
  useEffect(() => {
    if (!org || !allowed) return
    let cancelled = false
    const t = dayOffset(0)
    Promise.all([reportChildren(org.id, t, t), listRooms(org.id), listAreas(org.id), getSettings(org.id), listOccurrences(org.id, t, dayOffset(400))])
      .then(([children, rooms, areas, settings, occurrences]) => {
        if (cancelled) return
        setData({ children, rooms, kidsAreas: new Set(areas.filter((a) => a.kind === 'kids').map((a) => a.id)), settings, occurrences })
        setError('')
      })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e)); setData({ children: [], rooms: [], kidsAreas: new Set(), settings: null, occurrences: [] }) } })
    return () => { cancelled = true }
  }, [org, allowed])

  const moves = useMemo<MoveUp[]>(() => {
    if (!data) return []
    return moveUps(data.children, coreRooms(data.rooms, data.kidsAreas), cutoffFrom(data.settings), today, through, data.occurrences)
  }, [data, today, through])

  // Grouped by the date the room changes.
  const byDate = useMemo(() => {
    const out: { on: string; service: Occurrence | null; items: MoveUp[] }[] = []
    for (const m of moves) {
      let g = out.find((x) => x.on === m.on)
      if (!g) { g = { on: m.on, service: m.service, items: [] }; out.push(g) }
      g.items.push(m)
    }
    return out
  }, [moves])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="children's rooms" />
  const promotion = data?.settings?.promotion_date
  const csv = moves.map((m) => [m.on, m.service?.local_date ?? '', childName(m.child), m.child.household_name, age(m.child.birthdate), m.from?.name ?? '', m.to?.name ?? 'No room'])
  return (
    <div className="stack">
      <ReportHead title="Move-Up" lead="Children whose room changes by a date: a birthday that crosses an age line, or the school-year rollover. Each is matched to the first service on or after the day.">
        <ExportButton filename={`move-up-through-${through}.csv`} headers={['Changes on', 'First service', 'Child', 'Family', 'Age', 'From', 'To']} rows={csv} names />
      </ReportHead>
      <div className="toolbar"><div className="toolbar-row">
        <label className="row"><span className="muted">Through</span>
          <input type="date" className="field-input" value={through} min={today} onChange={(e) => setThrough(e.target.value || dayOffset(60))} /></label>
        <button type="button" className="btn btn-plain btn-small" onClick={() => setThrough(dayOffset(60))}>Next 60 days</button>
        {promotion && <button type="button" className="btn btn-plain btn-small" onClick={() => setThrough(promotion)}>Through Move-Up Sunday ({fmtDate(promotion)})</button>}
        {data && <span className="muted">{moves.length} {moves.length === 1 ? 'child' : 'children'}</span>}
      </div></div>
      {error && <p className="error" role="alert">{error}</p>}
      {!data ? <Spinner /> : byDate.length === 0 ? <Empty>Nobody changes rooms by {fmtDate(through)}.</Empty> : byDate.map((g) => (
        <section key={g.on} className="section">
          <h3 className="group-head">{fmtDate(g.on)}{g.service && g.service.local_date !== g.on ? ` · first service ${fmtDate(g.service.local_date)}` : ''}</h3>
          <ul className="group">
            {g.items.map((m) => (
              <li key={m.child.person_id} className="cell">
                <span className="cell-text">
                  <span className="cell-title"><Link href={`/people/view?id=${m.child.person_id}`}>{childName(m.child)}</Link>{m.child.household_name ? <span className="muted"> · {m.child.household_name}</span> : null}</span>
                  <span className="cell-sub">{m.from?.name ?? 'No room'} → {m.to?.name ?? 'No room'}{age(m.child.birthdate) !== null ? ` · age ${age(m.child.birthdate)}` : ''}</span>
                </span>
                {!m.to && <span className="chip chip-warn">Ages out</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="group-foot">Rooms come from each room&apos;s criteria under Check-in → Rooms; a room override on a child is not shown here.</p>
    </div>
  )
}
