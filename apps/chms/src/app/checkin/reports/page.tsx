'use client'

import Link from 'next/link'
import { useSession } from '@/components/Session'
import { NoAccess } from '@/components/checkin/CheckinNav'
import { Chevron, IconTile, Spinner, type IconName } from '@/components/ui'

const REPORTS: { href: string; icon: IconName; title: string; sub: string; needs?: 'kids.view' | 'people.view' }[] = [
  { href: '/checkin/reports/families', icon: 'house', title: 'Families and the serve policy', sub: 'Check-ins this year with the baseline, who serves, who is excluded', needs: 'kids.view' },
  { href: '/checkin/reports/occurrences', icon: 'clock', title: 'Services', sub: 'Children, volunteers and first-timers by room, and the ratio through the morning' },
  { href: '/checkin/reports/children', icon: 'people', title: 'Children', sub: 'Attendance by month, first and last seen, absences in a row', needs: 'kids.view' },
  { href: '/checkin/reports/moveup', icon: 'room', title: 'Move-Up', sub: 'Who changes rooms by a date, and on which Sunday', needs: 'kids.view' },
  { href: '/checkin/reports/volunteers', icon: 'shield', title: 'Volunteers', sub: 'Serves by month and room; early, on time, late and no-shows', needs: 'people.view' },
  { href: '/checkin/reports/ops', icon: 'tablet', title: 'Operations', sub: 'Passes and how long they took, labels, arrivals per station, events synced late' },
]

export default function ReportsIndex() {
  const { org, can } = useSession()
  if (!org) return <Spinner />
  if (!can('attendance.reports')) return <NoAccess what="reports" />
  return (
    <div className="stack">
      <p className="lead">Every report takes a date range and exports to CSV. Each read is logged.</p>
      <ul className="group">
        {REPORTS.filter((r) => !r.needs || can(r.needs)).map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="cell-link">
              <IconTile name={r.icon} />
              <span className="cell-text"><span className="cell-title">{r.title}</span><span className="cell-sub">{r.sub}</span></span>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
