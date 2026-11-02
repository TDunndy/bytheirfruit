'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { IconTile, SearchField, Spinner } from '@/components/ui'
import { errorMessage } from '@/lib/people'
import { fmtDate, listBaselines, listHouseholds, saveBaseline, type Baseline } from '@/lib/checkin'

export default function BaselinesPage() {
  const { org, can } = useSession()
  const [year, setYear] = useState(new Date().getFullYear())
  const [households, setHouseholds] = useState<{ id: string; name: string }[]>([])
  const [baselines, setBaselines] = useState<Baseline[]>([])
  const [q, setQ] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [dates, setDates] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [loaded, setLoaded] = useState(false)
  const manage = can('checkin.manage')
  const allowed = manage || can('attendance.reports')

  const load = useCallback(async () => {
    if (!org || !allowed) return
    try {
      const [h, b] = await Promise.all([listHouseholds(org.id), listBaselines(org.id, year)])
      setHouseholds(h); setBaselines(b); setDrafts({}); setDates({}); setError(''); setLoaded(true)
    } catch (e) { setError(errorMessage(e)) }
  }, [org, allowed, year])
  useEffect(() => { load() }, [load])

  const byHousehold = useMemo(() => new Map(baselines.map((b) => [b.household_id, b])), [baselines])
  const shown = households.filter((h) => !q || h.name.toLowerCase().includes(q.toLowerCase()))
  const total = baselines.reduce((n, b) => n + b.count, 0)

  if (!org) return <Spinner />
  if (!allowed) return <NoAccess what="past check-ins" />
  if (!loaded && !error) return <Spinner />

  const save = async (householdId: string) => {
    const b = byHousehold.get(householdId)
    const raw = drafts[householdId] ?? (b ? String(b.count) : '')
    const date = dates[householdId] ?? b?.last_attended_on ?? ''
    if (raw === '' && !date) return
    const n = raw === '' ? 0 : Number(raw)
    if (!Number.isInteger(n) || n < 0) { setError('Enter a whole number.'); return }
    setStatus('')
    try { await saveBaseline(org.id, householdId, year, n, b?.note ?? null, date || null); await load(); setStatus('Saved') } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <div className="stack">
      <p className="lead">Each family&apos;s child check-ins so far this year, typed in once from the old system, and the date they were last seen there. The serve policy adds the count to what is recorded from now on and uses the date to tell who has stopped coming.</p>
      <p className="sr-only" role="status">{status}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="toolbar">
        <SearchField className="search" placeholder="Search families" aria-label="Search families" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="toolbar-row">
          <label className="row"><span className="muted">Year</span>
            <select className="popup" aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[0, 1, 2].map((d) => { const y = new Date().getFullYear() - d; return <option key={y} value={y}>{y}</option> })}
            </select>
          </label>
          <span className="muted">{baselines.length} families · {total} check-ins recorded</span>
        </div>
      </div>
      <ul className="group">
        {shown.length === 0 && <li className="cell muted">No families match.</li>}
        {shown.slice(0, 300).map((h) => {
          const b = byHousehold.get(h.id)
          const draft = drafts[h.id]
          const date = dates[h.id] ?? b?.last_attended_on ?? ''
          const dirty = (draft !== undefined && draft !== (b ? String(b.count) : '')) || (dates[h.id] !== undefined && dates[h.id] !== (b?.last_attended_on ?? ''))
          return (
            <li key={h.id} className="cell">
              <IconTile name="house" />
              <span className="cell-title">{h.name}</span>
              {manage ? (
                <span className="row baseline-edit">
                  <input type="number" min={0} max={10000} aria-label={`${h.name} check-ins in ${year}`} value={draft ?? (b ? String(b.count) : '')} placeholder="0"
                    onChange={(e) => setDrafts({ ...drafts, [h.id]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(h.id) } }} />
                  <input type="date" className="baseline-date" aria-label={`${h.name} last attended`} value={date} data-empty={!date}
                    onChange={(e) => setDates({ ...dates, [h.id]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(h.id) } }} />
                  {dirty && <button className="btn btn-tinted btn-small" onClick={() => save(h.id)}>Save</button>}
                </span>
              ) : <span className="cell-value">{b ? `${b.count}${b.last_attended_on ? ` · last ${fmtDate(b.last_attended_on)}` : ''}` : '—'}</span>}
            </li>
          )
        })}
        {shown.length > 300 && <li className="cell muted">Search to narrow the list ({shown.length - 300} more).</li>}
      </ul>
    </div>
  )
}
