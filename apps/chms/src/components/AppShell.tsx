'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from './Session'
import { Logo, SignIn } from './SignIn'

const NAV = [
  { href: '/people', label: 'People', icon: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1' },
  { href: '/groups', label: 'Groups', icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1m1-6h1a5 5 0 0 1 5 5v1' },
  { href: '/events', label: 'Events', icon: 'M8 3v3m8-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z' },
  { href: '/health', label: 'Health', icon: 'M20.8 5.6a5 5 0 0 0-7.6.6L12 7.4l-1.2-1.2a5 5 0 1 0-7.1 7.1L12 21.6l8.3-8.3a5 5 0 0 0 .5-7.7z' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, user, orgs, org, selectOrg, signOut } = useSession()
  const pathname = usePathname()

  if (status === 'loading') return <main className="center-page"><div className="spinner" aria-label="Loading" /></main>
  if (status === 'signed-out') return <SignIn />
  if (status === 'error') {
    return (
      <main className="center-page">
        <div className="card narrow">
          <h1>Something went wrong</h1>
          <p className="muted">We couldn't load your churches. Check your connection and try again.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </main>
    )
  }
  if (orgs.length === 0) {
    return (
      <main className="center-page">
        <div className="card narrow">
          <Logo />
          <h1>No church yet</h1>
          <p className="muted">
            You're signed in as {user?.email}, but you aren't a leader at any church here yet.
            Ask your church's administrator to invite you, or claim your church on{' '}
            <a href="https://bytheirfruit.church/#/for-churches">bytheirfruit.church</a>.
          </p>
          <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
        </div>
      </main>
    )
  }
  if (!org) {
    return (
      <main className="center-page">
        <div className="card narrow">
          <Logo />
          <h1>Choose a church</h1>
          <div className="stack">
            {orgs.map((o) => (
              <button key={o.id} className="btn btn-secondary btn-block" onClick={() => selectOrg(o.id)}>{o.name}</button>
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo />
        <div className="org-name" title={org.name}>
          {orgs.length > 1 ? (
            <select aria-label="Church" value={org.id} onChange={(e) => selectOrg(e.target.value)}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          ) : org.name}
        </div>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={pathname?.startsWith(n.href) ? 'nav-item active' : 'nav-item'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={n.icon} /></svg>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="muted small" title={user?.email ?? ''}>{user?.email}</div>
          <button className="link-btn small" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="content">{children}</main>
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
      <ul className="checklist">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </section>
  )
}
