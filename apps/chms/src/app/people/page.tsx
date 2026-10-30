'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { StatusBadge } from '@/components/PersonParts'
import { Avatar, Chevron, Icon, SearchField, SegmentedControl, Switch } from '@/components/ui'
import {
  MEMBERSHIP_STATUSES, PAGE_SIZE, age, displayName, errorMessage, listPeople, listRoles,
  type DirectoryRow, type MembershipStatus, type OrgRole,
} from '@/lib/people'

// The status filter as a segmented control: same values as the old menu, shorter plural labels.
const STATUS_FILTERS: { value: MembershipStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'member', label: 'Members' },
  { value: 'regular', label: 'Regulars' },
  { value: 'visitor', label: 'Visitors' },
  { value: 'inactive', label: 'Inactive' },
]
const STATUS_LABEL = new Map(MEMBERSHIP_STATUSES.map((s) => [s.value as string, s.label]))

export default function PeoplePage() {
  const { org, can } = useSession()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState<MembershipStatus | ''>('')
  const [roleId, setRoleId] = useState('')
  const [archived, setArchived] = useState(false)
  const [page, setPage] = useState(0)
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [rows, setRows] = useState<DirectoryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => { setPage(0) }, [debouncedQ, status, roleId, archived])

  useEffect(() => {
    if (!org) return
    listRoles(org.id).then(setRoles).catch((e) => setError(errorMessage(e)))
  }, [org])

  useEffect(() => {
    if (!org) return
    let cancelled = false
    setLoading(true)
    listPeople(org.id, { q: debouncedQ, status, roleId, archived, page })
      .then((r) => { if (!cancelled) { setRows(r.rows); setTotal(r.total); setError('') } })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [org, debouncedQ, status, roleId, archived, page])

  const roleNames = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const count = `${total.toLocaleString()} ${archived ? 'archived' : ''} ${total === 1 ? 'person' : 'people'}`

  if (!can('people.view')) {
    return (
      <section>
        <header className="page-head"><h1>People</h1></header>
        <div className="card empty">
          <p className="muted">Your role doesn't include the church directory. Ask a church admin if you need it.</p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <header className="page-head">
        <div className="page-title">
          <h1>People</h1>
          <p className="page-sub">{loading ? 'Loading…' : count}</p>
        </div>
        {can('people.edit') && (
          <Link href="/people/new" className="btn btn-filled btn-add"><Icon name="plus" size={18} /><span className="btn-label">Add person</span></Link>
        )}
      </header>
      {/* Announces the new count after a search or filter change (the visible count is above). */}
      <p className="sr-only" role="status">{loading ? '' : count.replace(/\s+/g, ' ')}</p>

      <div className="toolbar">
        <SearchField
          className="search"
          placeholder="Search name, email or phone"
          aria-label="Search people"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="toolbar-row">
          <SegmentedControl label="Status" name="status" value={status} options={STATUS_FILTERS} onChange={setStatus} />
          <div className="toolbar-end">
            <select className="popup" aria-label="Role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">All roles</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <Switch label="Show archived" checked={archived} onChange={setArchived} />
          </div>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {/* Wide screens: a table. Phones: a list of rows (only one of the two is displayed). */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Roles</th>
              <th className="num">Age</th>
              <th className="hide-md">Contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const a = age(p.birthdate)
              return (
                <tr key={p.id}>
                  <td>
                    <div className="name-cell">
                      <Avatar name={displayName(p)} size="sm" />
                      <div className="name-text">
                        <Link href={`/people/view?id=${p.id}`} className="person-link">{displayName(p)}</Link>
                        {p.title && <div className="cell-sub">{p.title}</div>}
                      </div>
                    </div>
                  </td>
                  <td><StatusBadge status={p.membership_status} /></td>
                  <td>
                    <div className="chips">
                      {p.person_roles.map((r) => <span key={r.role_id} className="chip">{roleNames.get(r.role_id) ?? 'Role'}</span>)}
                    </div>
                  </td>
                  <td className="num">{a ?? ''}</td>
                  <td className="hide-md contact">
                    {p.email && <div>{p.email}</div>}
                    {p.phone && <div className="cell-sub">{p.phone}</div>}
                  </td>
                </tr>
              )
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="muted empty-row">No one matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ul className="group people-list" aria-label="People">
        {rows.map((p) => {
          const sub = [p.title, ...p.person_roles.map((r) => roleNames.get(r.role_id) ?? 'Role')].filter(Boolean).join(' · ')
          return (
            <li key={p.id}>
              <Link href={`/people/view?id=${p.id}`} className="cell-link">
                <Avatar name={displayName(p)} size="md" />
                <span className="cell-text">
                  <span className="cell-title">{displayName(p)}</span>
                  <span className="cell-sub">
                    <span className={`dot dot-${p.membership_status}`} aria-hidden="true" />
                    {STATUS_LABEL.get(p.membership_status) ?? p.membership_status}{sub ? ` · ${sub}` : ''}
                  </span>
                </span>
                <Chevron />
              </Link>
            </li>
          )
        })}
        {!loading && rows.length === 0 && <li className="cell muted">No one matches these filters.</li>}
      </ul>

      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button className="btn btn-tinted" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="pager-label">Page {page + 1} of {pages}</span>
          <button className="btn btn-tinted" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </section>
  )
}
