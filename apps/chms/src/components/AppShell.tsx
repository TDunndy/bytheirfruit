'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useSession } from './Session'
import { Logo, SignIn } from './SignIn'
import { Avatar, Chevron, Icon, type IconName } from './ui'
import type { MyOrg } from '@/lib/orgs'

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/people', label: 'People', icon: 'people' },
  { href: '/groups', label: 'Groups', icon: 'groups' },
  { href: '/events', label: 'Events', icon: 'events' },
  { href: '/health', label: 'Health', icon: 'health' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, user, orgs, org, selectOrg, signOut } = useSession()
  const pathname = usePathname()

  if (status === 'loading') return <main className="center-page"><div className="spinner" aria-label="Loading" /></main>
  if (status === 'signed-out') return <SignIn />
  if (status === 'error') {
    return (
      <main className="center-page">
        <div className="auth">
          <Logo stacked />
          <h1>Something went wrong</h1>
          <p className="auth-lead">We couldn't load your churches. Check your connection and try again.</p>
          <button className="btn btn-filled btn-large btn-block" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </main>
    )
  }
  if (orgs.length === 0) {
    return (
      <main className="center-page">
        <div className="auth">
          <Logo stacked />
          <h1>No church yet</h1>
          <p className="auth-lead">
            You're signed in as {user?.email}, but you aren't a leader at any church here yet.
            Ask your church's administrator to invite you, or claim your church on{' '}
            <a href="https://bytheirfruit.church/#/for-churches">bytheirfruit.church</a>.
          </p>
          <button className="btn btn-raised btn-large btn-block" onClick={signOut}>Sign out</button>
        </div>
      </main>
    )
  }
  if (!org) {
    return (
      <main className="center-page">
        <div className="auth">
          <Logo stacked />
          <h1>Choose a church</h1>
          <ul className="group church-list">
            {orgs.map((o) => (
              <li key={o.id}>
                <button className="cell-link" onClick={() => selectOrg(o.id)}>
                  <ChurchTile name={o.name} />
                  <span className="cell-title">{o.name}</span>
                  <Chevron />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    )
  }

  const email = user?.email ?? ''
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-inner">
          <Logo />
          <ChurchSwitcher orgs={orgs} org={org} onSelect={selectOrg} />
          <nav aria-label="Main" className="nav">
            {NAV.map((n) => {
              const active = Boolean(pathname?.startsWith(n.href) || (n.href === '/people' && pathname?.startsWith('/households')))
              return (
                <Link key={n.href} href={n.href} className={active ? 'nav-item active' : 'nav-item'} aria-current={active ? 'page' : undefined}>
                  <Icon name={n.icon} size={22} />
                  <span>{n.label}</span>
                </Link>
              )
            })}
          </nav>
          <div className="sidebar-foot">
            <Avatar name={email} size="sm" />
            <div className="account">
              <div className="account-email" title={email}>{email}</div>
              <button className="link-btn small" onClick={signOut}>Sign out</button>
            </div>
          </div>
        </div>
      </aside>
      <header className="phone-bar">
        <ChurchSwitcher orgs={orgs} org={org} onSelect={selectOrg} compact />
        <AccountMenu email={email} onSignOut={signOut} />
      </header>
      <main className="content"><div className="content-inner">{children}</div></main>
    </div>
  )
}

function ChurchTile({ name }: { name: string }) {
  return <span className="church-tile" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
}

/** The current church; a pop-up menu (native select) when the leader belongs to several. */
function ChurchSwitcher({ orgs, org, onSelect, compact = false }: {
  orgs: MyOrg[]
  org: MyOrg
  onSelect: (id: string) => void
  compact?: boolean
}) {
  const cls = compact ? 'church church-compact' : 'church'
  if (orgs.length < 2) {
    return <div className={cls} title={org.name}><ChurchTile name={org.name} /><span className="church-name">{org.name}</span></div>
  }
  return (
    <label className={`${cls} church-switch`} title={org.name}>
      <ChurchTile name={org.name} />
      <span className="church-name">{org.name}</span>
      <svg className="updown" width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M2 5l3-3 3 3M2 9l3 3 3-3" /></svg>
      <select aria-label="Church" value={org.id} onChange={(e) => onSelect(e.target.value)}>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  )
}

/** Phone-only account button: shows who is signed in and offers Sign out. */
function AccountMenu({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="account-btn" aria-label="Account" aria-expanded={open} aria-controls="account-popover" onClick={() => setOpen(!open)}>
        <Avatar name={email} size="sm" />
      </button>
      {open && (
        <div className="popover account-popover" id="account-popover">
          <div className="account-popover-email">{email}</div>
          <button type="button" className="btn btn-tinted btn-destructive btn-block" onClick={onSignOut}>Sign out</button>
        </div>
      )}
    </div>
  )
}

export function ComingNext({ title, lead, items }: { title: string; lead: string; items: string[] }) {
  return (
    <section>
      <header className="page-head">
        <h1>{title}</h1>
        <span className="badge">Coming next</span>
      </header>
      <p className="lead">{lead}</p>
      <ul className="group checklist">
        {items.map((i) => (
          <li key={i} className="cell">
            <Icon name="planned" size={20} className="checklist-icon" />
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
