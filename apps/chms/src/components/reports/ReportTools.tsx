'use client'

import Link from 'next/link'
import { useSession } from '@/components/Session'
import { dayOffset } from '@/lib/checkin'
import { downloadCsv, toCsv } from '@/lib/csv'

/** A report's title, one-line lead and the way back to the list. */
export function ReportHead({ title, lead, children }: { title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <header className="report-head">
      <Link href="/checkin/reports" className="back">Reports</Link>
      <div className="report-head-row">
        <div>
          <h2 className="report-title">{title}</h2>
          {lead && <p className="report-lead">{lead}</p>}
        </div>
        {children && <div className="actions">{children}</div>}
      </div>
    </header>
  )
}

export type RangePreset = 'month' | 'last_month' | 'ytd' | '90' | '8w'
export function presetRange(p: RangePreset, today = dayOffset(0)): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  switch (p) {
    case 'month': return { from: `${y}-${pad(m)}-01`, to: today }
    case 'last_month': { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return { from: `${py}-${pad(pm)}-01`, to: dayOffset(-1, `${y}-${pad(m)}-01`) } }
    case 'ytd': return { from: `${y}-01-01`, to: today }
    case '90': return { from: dayOffset(-90, today), to: today }
    default: return { from: dayOffset(-55, today), to: today }
  }
}

/** From / Until inputs with the usual presets. */
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const tooLong = from && to && (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 400
  return (
    <div className="toolbar-row">
      <label className="row"><span className="muted">From</span>
        <input type="date" className="field-input" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} /></label>
      <label className="row"><span className="muted">Until</span>
        <input type="date" className="field-input" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} /></label>
      <select className="popup" aria-label="Quick range" value="" onChange={(e) => { if (e.target.value) { const r = presetRange(e.target.value as RangePreset); onChange(r.from, r.to) } }}>
        <option value="">Quick range…</option>
        <option value="8w">Last eight weeks</option>
        <option value="month">This month</option>
        <option value="last_month">Last month</option>
        <option value="ytd">Year to date</option>
        <option value="90">Last 90 days</option>
      </select>
      {tooLong && <span className="muted small warn-text">Up to 400 days at a time.</span>}
    </div>
  )
}

/**
 * Downloads the rows on screen as CSV. A report that names people exports
 * only for holders of people.export; the read itself was logged when the
 * report loaded.
 */
export function ExportButton({ filename, headers, rows, names = false, disabled = false }: {
  filename: string; headers: string[]; rows: unknown[][]; names?: boolean; disabled?: boolean
}) {
  const { can } = useSession()
  if (names && !can('people.export')) return null
  return (
    <button type="button" className="btn btn-tinted btn-small" disabled={disabled || rows.length === 0} onClick={() => downloadCsv(filename, toCsv(headers, rows))}>
      Export CSV
    </button>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card empty"><p className="muted">{children}</p></div>
}
