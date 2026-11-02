'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { Empty, ExportButton, ReportHead } from '@/components/reports/ReportTools'
import { SearchField, SegmentedControl, Spinner } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import { dayOffset } from '@/lib/checkin'
import { exclusionLabel, fmtShortDate, reportFamilies, type FamilyRow } from '@/lib/reports'

type Bucket = 'conversation' | 'excluded' | 'under' | 'all'
const bucketOf = (r: FamilyRow): Bucket => (r.over_threshold ? (r.exclusion ? 'excluded' : 'conversation') : 'under')

export default function FamiliesReport() {
  const { org, can } = useSession()
  const [year, setYear] = useState(new Date().getFullYear())
  const [asOf, setAsOf] = useState(dayOffset(0))
  const [threshold, setThreshold] = useState(10)
  const [bucket, setBucket] = useState<Bucket>('conversation')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<FamilyRow[] | null>(null)
  const [error, setError] = useState('')
  const allowed = can('attendance.reports') && can('people.view') && can('kids.view')

  useEffect(() => {
    if (!org || !allowed || !asOf || !asOf.startsWith(String(year))) return
    let cancelled = false
    setRows(null)
    reportFamilies(org.id, year, asOf, threshold)
      .then((r) => { if (!cancelled) { setRows(r); setError('') } })
      .catch((e) => { if (!cancelled) { setError(errorMessage(e)); setRows([]) } })
    return () => { cancelled = true }
  }, [org, allowed, year, asOf, threshold])

  const counts = useMemo(() => {
    const c = { conversation: 0, excluded: 0, under: 0, all: rows?.length ?? 0 }
    for (const r of rows ?? []) c[bucketOf(r)] += 1
    return c
  }, [rows])
  const shown = useMemo(() => (rows ?? []).filter((r) => (bucket === 'all' || bucketOf(r) === bucket)
    && (!q || r.household_name.toLowerCase().includes(q.toLowerCase()) || r.parents.some((p) => p.toLowerCase().includes(q.toLowerCase())))), [rows, bucket, q])

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="the families report" />
  const yearMismatch = !asOf.startsWith(String(year))
  const csv = shown.map((r) => [r.household_name, r.parents, r.children.map((c) => c.room_name ? `${c.name} (${c.room_name})` : c.name), r.checkins, r.baseline, r.total, r.last_seen, r.serves_ytd, r.flags, r.area_name, r.over_threshold, exclusionLabel(r.exclusion)])
  return (
    <div className="stack">
      <ReportHead title="Families and the serve policy" lead={`Each family's child check-ins in kids rooms this year, one per child per service, plus the count carried over from the old system. A family at ${threshold} or more with no reason to be excluded needs a serve conversation.`}>
        <ExportButton filename={`serve-policy-${year}-${asOf}.csv`} headers={['Family', 'Parents', 'Children', 'Check-ins', 'Carried over', 'Total', 'Last seen', 'Serves this year', 'Flags', 'Area', 'At threshold', 'Excluded because']} rows={csv} names />
      </ReportHead>
      <div className="toolbar">
        <div className="toolbar-row">
          <label className="row"><span className="muted">Year</span>
            <select className="popup" aria-label="Year" value={year} onChange={(e) => { const y = Number(e.target.value); setYear(y); setAsOf(y === new Date().getFullYear() ? dayOffset(0) : `${y}-12-31`) }}>
              {[0, 1, 2].map((d) => { const y = new Date().getFullYear() - d; return <option key={y} value={y}>{y}</option> })}
            </select></label>
          <label className="row"><span className="muted">As of</span>
            <input type="date" className="field-input" value={asOf} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => setAsOf(e.target.value)} /></label>
          <label className="row"><span className="muted">Threshold</span>
            <input type="number" className="field-input num-input" min={1} max={1000} value={threshold} onChange={(e) => setThreshold(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} /></label>
        </div>
        <div className="toolbar-row">
          <SegmentedControl label="Families" name="family-bucket" value={bucket} onChange={setBucket} options={[
            { value: 'conversation', label: `Needs a conversation (${counts.conversation})` }, { value: 'excluded', label: `Excluded (${counts.excluded})` },
            { value: 'under', label: `Under (${counts.under})` }, { value: 'all', label: `All (${counts.all})` }]} />
          <SearchField className="search" placeholder="Search families" aria-label="Search families" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {yearMismatch && <p className="error" role="alert">Pick an as-of date in {year}.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {rows === null ? (yearMismatch ? null : <Spinner />) : shown.length === 0 ? <Empty>{bucket === 'conversation' ? 'No family needs a serve conversation.' : 'No families here.'}</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Family</th><th>Children</th><th className="num">Check-ins</th><th className="num hide-md">Carried</th><th className="num">Total</th><th>Last seen</th><th className="num hide-md">Serves</th><th>Area</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.household_id}>
                  <td>
                    <Link href={`/households/view?id=${r.household_id}`}>{r.household_name}</Link>
                    {r.parents.length > 0 && <div className="muted small">{r.parents.join(', ')}</div>}
                  </td>
                  <td className="wrap">{r.children.map((c) => <div key={c.person_id}>{c.name}{c.room_name ? <span className="muted"> · {c.room_name}</span> : null}</div>)}</td>
                  <td className="num">{r.checkins}</td>
                  <td className="num hide-md muted">{r.baseline || '·'}</td>
                  <td className="num"><strong>{r.total}</strong></td>
                  <td>{fmtShortDate(r.last_seen)}</td>
                  <td className="num hide-md">{r.serves_ytd || '·'}</td>
                  <td className="muted">{r.area_name ?? '—'}</td>
                  <td>
                    {r.over_threshold && !r.exclusion && <span className="chip chip-warn">Needs a conversation</span>}
                    {r.exclusion && <span className="chip">{exclusionLabel(r.exclusion)}</span>}
                    {!r.over_threshold && !r.exclusion && <span className="muted">{threshold - r.total} to go</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="group-foot">Excluded: an active flag on the family (Family → Serve-policy flags), a parent who served in a kids room in the last 90 days, or no check-in in three months. Carried-over counts and last-seen dates are entered under Check-in → Past check-ins.</p>
    </div>
  )
}
