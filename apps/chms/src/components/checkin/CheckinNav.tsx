'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, type Permission } from '../Session'

const TABS: { href: string; label: string; needs?: Permission[] }[] = [
  { href: '/checkin', label: 'Overview' },
  { href: '/checkin/rooms', label: 'Rooms', needs: ['checkin.manage', 'checkin.station', 'kids.view'] },
  { href: '/checkin/schedules', label: 'Schedules', needs: ['checkin.manage', 'checkin.station', 'kids.view', 'attendance.reports'] },
  { href: '/checkin/volunteers', label: 'Volunteers', needs: ['checkin.manage', 'checkin.station', 'attendance.reports'] },
  { href: '/checkin/labels', label: 'Labels', needs: ['checkin.manage', 'checkin.station'] },
  { href: '/checkin/stations', label: 'Stations', needs: ['checkin.manage', 'checkin.station'] },
  { href: '/checkin/reports', label: 'Reports', needs: ['attendance.reports'] },
  { href: '/checkin/baselines', label: 'Past check-ins', needs: ['checkin.manage', 'attendance.reports'] },
  { href: '/checkin/settings', label: 'Settings', needs: ['checkin.manage', 'checkin.station', 'org.manage'] },
]

/** The section's tabs: a scrollable pill row on phones, a second-level list on wide screens. */
export function CheckinNav() {
  const pathname = usePathname()
  const { can } = useSession()
  return (
    <nav className="subnav" aria-label="Check-in">
      {TABS.filter((t) => !t.needs || t.needs.some((p) => can(p))).map((t) => {
        const active = t.href === '/checkin' ? pathname === '/checkin' : Boolean(pathname?.startsWith(t.href))
        return (
          <Link key={t.href} href={t.href} className={active ? 'subnav-item active' : 'subnav-item'} aria-current={active ? 'page' : undefined}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Shown when the role lacks what a screen needs. */
export function NoAccess({ what }: { what: string }) {
  return (
    <div className="card empty">
      <p className="muted">Your role doesn&apos;t include {what}. Ask a church admin if you need it.</p>
    </div>
  )
}
