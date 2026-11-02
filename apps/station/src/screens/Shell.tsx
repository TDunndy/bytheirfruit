import { useEffect, useState } from 'react'
import { useStation } from '@/lib/station'
import { fmtTime } from '@/lib/format'
import { Staff } from './Staff'

export function Shell({ children }: { children: React.ReactNode }) {
  const { day, outboxState, staff, alerts } = useStation()
  const [staffOpen, setStaffOpen] = useState(false)
  const [now, setNow] = useState(() => new Date().toISOString())
  useEffect(() => { const t = window.setInterval(() => setNow(new Date().toISOString()), 15_000); return () => window.clearInterval(t) }, [])
  if (!day) return null
  const tz = day.self.settings?.time_zone
  return (
    <div className="app">
      <header className="bar">
        <span className="title">{day.self.name}</span>
        <span className="muted">{day.self.org_name}</span>
        <span className="spacer" />
        {outboxState.offline && <span className="pill pill-warn">Offline{outboxState.pending ? ` · ${outboxState.pending} waiting` : ''}</span>}
        {!outboxState.offline && outboxState.pending > 0 && <span className="pill">Syncing {outboxState.pending}</span>}
        {outboxState.rejected > 0 && <span className="pill pill-bad">{outboxState.rejected} for staff</span>}
        {day.self.mode !== 'kiosk' && alerts.length > 0 && <span className="pill pill-warn">{alerts.length} alert{alerts.length === 1 ? '' : 's'}</span>}
        {staff && <span className="pill pill-ok">{staff.display_name}</span>}
        <span className="muted" aria-label="Time">{fmtTime(now, tz)}</span>
        <button type="button" className="icon-btn" aria-label="Staff menu" onClick={() => setStaffOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </button>
      </header>
      {children}
      {staffOpen && <Staff onClose={() => setStaffOpen(false)} />}
    </div>
  )
}
