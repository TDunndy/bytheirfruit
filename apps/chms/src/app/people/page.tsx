'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { StatusBadge } from '@/components/PersonParts'
import {
  MEMBERSHIP_STATUSES, PAGE_SIZE, age, displayName, errorMessage, listPeople, listRoles,
  type DirectoryRow, type MembershipStatus, type OrgRole,
} from '@/lib/people'

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
        <h1>People</h1>
        <span className="muted small">{loading ? 'Loading…' : `${total.toLocaleString()} ${archived ? 'archived' : ''} ${total === 1 ? 'person' : 'people'}`}</span>
        <span className="spacer" />
        {can('people.edit') && <Link href="/people/new" className="btn btn-primary">Add person</Link>}
      </header>

      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search name, email or phone"
          aria-label="Search people"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as MembershipStatus | '')}>
          <option value="">All statuses</option>
          {MEMBERSHIP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="hide-sm">Status</th>
              <th className="hide-sm">Roles</th>
              <th className="hide-sm">Age</th>
              <th className="hide-md">Contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const a = age(p.birthdate)
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/people/view?id=${p.id}`} className="person-link">{displayName(p)}</Link>
                    {p.title && <div className="muted small">{p.title}</div>}
                  </td>
                  <td className="hide-sm"><StatusBadge status={p.membership_status} /></td>
                  <td className="hide-sm">
                    <div className="chips">
                      {p.person_roles.map((r) => <span key={r.role_id} className="chip">{roleNames.get(r.role_id) ?? 'Role'}</span>)}
                    </div>
                  </td>
                  <td className="hide-sm">{a ?? ''}</td>
                  <td className="hide-md small">
                    {p.email && <div>{p.email}</div>}
                    {p.phone && <div className="muted">{p.phone}</div>}
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

      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button className="btn btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted small">Page {page + 1} of {pages}</span>
          <button className="btn btn-secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </section>
  )
}
