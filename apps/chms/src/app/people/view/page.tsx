'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from '@/components/Session'
import { PersonForm, StatusBadge } from '@/components/PersonParts'
import { PersonPicker } from '@/components/PersonPicker'
import { Avatar, BackLink, Chevron, IconTile, RemoveGlyph } from '@/components/ui'
import {
  addChartLine, addNote, addRole, addToHousehold, age, chartFor, createHousehold, deleteNote, displayName,
  errorMessage, getPerson, historyFor, householdsOf, listRoles, notesFor, peopleNames, personRoleIds,
  removeChartLine, removeRole, setArchived, teamLogins, updatePerson,
  type AuditEntry, type ChartLine, type Membership, type Note, type NoteVisibility, type OrgRole, type Person,
} from '@/lib/people'

export default function PersonPage() {
  return (
    <Suspense fallback={<div className="spinner" aria-label="Loading" />}>
      <PersonView />
    </Suspense>
  )
}

const VISIBILITY: { value: NoteVisibility; label: string; help: string }[] = [
  { value: 'care', label: 'Care team', help: 'Everyone who keeps pastoral notes' },
  { value: 'oversight', label: 'Oversight', help: 'Only those over this person in the chart' },
  { value: 'private', label: 'Private', help: 'Only you' },
]

function PersonView() {
  const id = useSearchParams().get('id') ?? ''
  const { org, can, isChurchAdmin } = useSession()
  const [person, setPerson] = useState<Person | null>(null)
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [roleIds, setRoleIds] = useState<string[]>([])
  const [families, setFamilies] = useState<Membership[]>([])
  const [chart, setChart] = useState<{ answersTo: ChartLine[]; reports: ChartLine[] }>({ answersTo: [], reports: [] })
  const [notes, setNotes] = useState<Note[]>([])
  const [history, setHistory] = useState<AuditEntry[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loginRole, setLoginRole] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!org || !id) return
    try {
      const p = await getPerson(id)
      if (!p) { setMissing(true); return }
      setPerson(p)
      const [allRoles, mine, fams, ch, hist, logins] = await Promise.all([
        listRoles(org.id), personRoleIds(id), householdsOf(id), chartFor(id), historyFor(id), teamLogins(org.id),
      ])
      const ns = can('people.notes') ? await notesFor(id) : []
      setRoles(allRoles); setRoleIds(mine); setFamilies(fams); setChart(ch); setHistory(hist); setNotes(ns)
      setLoginRole(logins.get(id) ?? null)
      const ids = [
        ...ch.answersTo.map((l) => l.overseer_person_id ?? ''), ...ch.reports.map((l) => l.person_id),
        ...ns.map((n) => n.author_person_id ?? ''), ...hist.map((h) => h.actor_person_id ?? ''),
      ]
      setNames(await peopleNames(ids))
      setError('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [org, id, can])

  useEffect(() => { load() }, [load])

  const roleName = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])
  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load() } catch (e) { setError(errorMessage(e)) }
  }

  if (missing) return <section><BackLink href="/people" label="People" /><p className="muted">This person isn't in your directory.</p></section>
  if (!person || !org) return <div className="spinner" aria-label="Loading" />

  const a = age(person.birthdate)
  const address = [person.address_line1, person.address_line2, [person.city, person.state].filter(Boolean).join(', '), person.postal_code]
    .filter(Boolean).join(' · ')

  const hasDetails = Boolean(person.email || person.phone || address || person.birthdate || person.gender
    || person.first_visit_date || person.joined_date || person.tags.length > 0)

  return (
    <section className="person">
      <div className="page-nav">
        <BackLink href="/people" label="People" />
        {can('people.edit') && !editing && (
          <div className="actions">
            <button className="btn btn-tinted btn-small" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn btn-tinted btn-small" onClick={() => act(() => setArchived(person.id, !person.archived_at))}>
              {person.archived_at ? 'Restore' : 'Archive'}
            </button>
          </div>
        )}
      </div>
      <header className="hero">
        <Avatar name={displayName(person)} size="lg" />
        <div className="hero-text">
          <h1>{displayName(person)}</h1>
          <div className="meta">
            {person.title && <span>{person.title}</span>}
            <StatusBadge status={person.membership_status} />
            {person.archived_at && <span className="status status-inactive">Archived</span>}
            {loginRole && <span className="chip">Signs in · {loginRole}</span>}
          </div>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      {editing ? (
        <PersonForm
          initial={person}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            try { await updatePerson(person.id, values); setEditing(false); await load() } catch (e) { throw new Error(errorMessage(e)) }
          }}
        />
      ) : (
        <div className="columns">
          <div className="column">
            <section className="section">
              <h2 className="group-head">Details</h2>
              {hasDetails ? (
              <dl className="group details">
                {person.email && <div className="kv"><dt>Email</dt><dd><a href={`mailto:${person.email}`}>{person.email}</a></dd></div>}
                {person.phone && <div className="kv"><dt>Phone</dt><dd><a href={`tel:${person.phone}`}>{person.phone}</a></dd></div>}
                {address && <div className="kv"><dt>Address</dt><dd>{address}</dd></div>}
                {person.birthdate && <div className="kv"><dt>Birthday</dt><dd>{fmtDate(person.birthdate)}{a !== null ? ` (${a})` : ''}</dd></div>}
                {person.gender && <div className="kv"><dt>Gender</dt><dd className="cap">{person.gender}</dd></div>}
                {person.first_visit_date && <div className="kv"><dt>First visit</dt><dd>{fmtDate(person.first_visit_date)}</dd></div>}
                {person.joined_date && <div className="kv"><dt>Joined</dt><dd>{fmtDate(person.joined_date)}</dd></div>}
                {person.tags.length > 0 && (
                  <div className="kv"><dt>Tags</dt><dd><div className="chips">{person.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div></dd></div>
                )}
              </dl>
              ) : <div className="group"><div className="cell muted">No details yet.</div></div>}
            </section>

            <section className="section">
              <h2 className="group-head">Family</h2>
              <ul className="group">
                {families.length === 0 && <li className="cell muted">Not in a family yet.</li>}
                {families.map((f) => (
                  <li key={f.household.id}>
                    <Link href={`/households/view?id=${f.household.id}`} className="cell-link">
                      <IconTile name="house" />
                      <span className="cell-title">{f.household.name}</span>
                      <span className="cell-value cap">{f.relationship}</span>
                      <Chevron />
                    </Link>
                  </li>
                ))}
                {families.length === 0 && can('people.edit') && (
                  <li>
                    <button className="cell-link cell-action" onClick={() => act(async () => {
                      const h = await createHousehold(org.id, `The ${person.last_name || person.first_name} Family`, person)
                      await addToHousehold(org.id, h.id, person.id, 'head')
                    })}>Start a family</button>
                  </li>
                )}
              </ul>
            </section>

            {can('people.notes') && (
              <NotesCard
                notes={notes}
                names={names}
                canManage={can('org.manage')}
                onAdd={(body, visibility) => act(() => addNote(org.id, person.id, body, visibility))}
                onDelete={(noteId) => act(() => deleteNote(noteId))}
              />
            )}
          </div>

          <div className="column">
            <section className="section">
              <h2 className="group-head">Roles</h2>
              <ul className="group">
                {roleIds.length === 0 && <li className="cell muted">No roles.</li>}
                {roleIds.map((r) => (
                  <li key={r} className="cell">
                    <span className="cell-title">{roleName.get(r) ?? 'Role'}</span>
                    {can('roles.manage') && (
                      <button className="remove-btn" aria-label={`Remove ${roleName.get(r)}`} onClick={() => act(() => removeRole(person.id, r))}><RemoveGlyph /></button>
                    )}
                  </li>
                ))}
                {can('roles.manage') && roles.some((r) => !roleIds.includes(r.id)) && (
                  <li className="cell">
                    <select className="row-select action" aria-label="Add role" value="" onChange={(e) => e.target.value && act(() => addRole(org.id, person.id, e.target.value))}>
                      <option value="">Add a role…</option>
                      {roles.filter((r) => !roleIds.includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </li>
                )}
              </ul>
            </section>

            <section className="section">
              <h2 className="group-head">Answers to</h2>
              <ul className="group lines">
                {chart.answersTo.length === 0 && <li className="cell muted">No one yet.</li>}
                {chart.answersTo.map((l) => (
                  <li key={l.id} className="split">
                    {l.overseer_person_id
                      ? (
                        <Link href={`/people/view?id=${l.overseer_person_id}`} className="cell-link">
                          <Avatar name={names.get(l.overseer_person_id) ?? 'Someone'} size="sm" />
                          <span className="cell-title">{names.get(l.overseer_person_id) ?? 'Someone'}</span>
                          <Chevron />
                        </Link>
                      )
                      : (
                        <div className="cell">
                          <IconTile name="board" />
                          <span className="cell-text">
                            <span className="cell-title">{roleName.get(l.overseer_role_id ?? '') ?? 'Role'} board</span>
                            <span className="cell-sub">Everyone with this role</span>
                          </span>
                        </div>
                      )}
                    {can('roles.manage') && <button className="remove-btn" aria-label="Remove line" onClick={() => act(() => removeChartLine(l.id))}><RemoveGlyph /></button>}
                  </li>
                ))}
                {can('roles.manage') && (
                  <li className="cell">
                    <PersonPicker orgId={org.id} exclude={[person.id]} placeholder="Answers to… (search)"
                      onPick={(p) => act(() => addChartLine(org.id, person.id, { personId: p.id }))} />
                  </li>
                )}
                {can('roles.manage') && isChurchAdmin && (
                  <li className="cell">
                    <select className="row-select action" aria-label="Answers to a board" value="" onChange={(e) => e.target.value && act(() => addChartLine(org.id, person.id, { roleId: e.target.value }))}>
                      <option value="">…or answers to a board (everyone in a role)</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </li>
                )}
              </ul>
            </section>

            <section className="section">
              <h2 className="group-head">Oversees</h2>
              <ul className="group lines">
                {chart.reports.length === 0 && <li className="cell muted">No one reports directly.</li>}
                {chart.reports.map((l) => (
                  <li key={l.id}>
                    <Link href={`/people/view?id=${l.person_id}`} className="cell-link">
                      <Avatar name={names.get(l.person_id) ?? 'Someone'} size="sm" />
                      <span className="cell-title">{names.get(l.person_id) ?? 'Someone'}</span>
                      <Chevron />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="section">
              <h2 className="group-head">History</h2>
              <ul className="group history">
                {history.map((h) => (
                  <li key={h.id} className="cell">
                    <span className="cell-text">
                      <span className="cell-title wrap">
                        {h.action === 'insert' ? 'Added' : h.action === 'update' ? 'Updated' : h.action === 'archive' ? 'Archived' : 'Restored'}
                        {h.action === 'update' && <span className="muted"> {Object.keys(h.changes as Record<string, unknown>).map(label).join(', ')}</span>}
                      </span>
                      <span className="cell-sub">{h.actor_person_id ? names.get(h.actor_person_id) ?? 'A leader' : h.actor_kind === 'admin' ? 'Church admin' : 'Import'} · {fmtDateTime(h.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </section>
  )
}

function NotesCard({ notes, names, canManage, onAdd, onDelete }: {
  notes: Note[]
  names: Map<string, string>
  canManage: boolean
  onAdd: (body: string, visibility: NoteVisibility) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<NoteVisibility>('care')
  const [busy, setBusy] = useState(false)
  return (
    <section className="section">
      <h2 className="group-head">Pastoral notes</h2>
      <form className="group compose" onSubmit={async (e) => {
        e.preventDefault()
        if (!body.trim()) return
        setBusy(true)
        await onAdd(body.trim(), visibility)
        setBody('')
        setBusy(false)
      }}>
        <div className="cell">
          <textarea rows={3} placeholder="Add a note…" value={body} onChange={(e) => setBody(e.target.value)} aria-label="New note" />
        </div>
        <div className="cell compose-bar">
          <select className="row-select" aria-label="Who can read it" value={visibility} onChange={(e) => setVisibility(e.target.value as NoteVisibility)}>
            {VISIBILITY.map((v) => <option key={v.value} value={v.value}>{v.label}: {v.help}</option>)}
          </select>
          <button className="btn btn-filled btn-small" disabled={busy || !body.trim()}>Add note</button>
        </div>
      </form>
      <ul className="group notes">
        {notes.length === 0 && <li className="cell muted">No notes you can see.</li>}
        {notes.map((n) => (
          <li key={n.id} className="note">
            <p>{n.body}</p>
            <div className="note-meta">
              <span className={`vis vis-${n.visibility}`}>{VISIBILITY.find((v) => v.value === n.visibility)?.label}</span>
              {' · '}{n.author_person_id ? names.get(n.author_person_id) ?? 'A leader' : 'Imported'} · {fmtDateTime(n.created_at)}
              {canManage && <> · <button className="link-btn destructive" onClick={() => onDelete(n.id)}>Delete</button></>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

const LABELS: Record<string, string> = {
  first_name: 'first name', last_name: 'last name', preferred_name: 'goes by', membership_status: 'status',
  first_visit_date: 'first visit', joined_date: 'joined', address_line1: 'address', address_line2: 'address',
  postal_code: 'zip', archived_at: 'archived',
}
function label(k: string) { return LABELS[k] ?? k.replace(/_/g, ' ') }
function fmtDate(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
function fmtDateTime(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
