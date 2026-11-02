'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from '@/components/Session'
import { StatusBadge } from '@/components/PersonParts'
import { PersonPicker } from '@/components/PersonPicker'
import { Avatar, BackLink, Chevron, RemoveGlyph, Spinner } from '@/components/ui'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { HouseholdExtras } from '@/components/kids/HouseholdExtras'
import {
  RELATIONSHIPS, addToHousehold, age, displayName, errorMessage, getHousehold, removeFromHousehold,
  type Household, type Person, type Relationship,
} from '@/lib/people'
import { arrivedText, assigneeText, fmtDate, markFirstVisit, taskContext, tasksForHousehold, type Task, type TaskContext } from '@/lib/followups'

export default function HouseholdPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <HouseholdView />
    </Suspense>
  )
}

function HouseholdView() {
  const id = useSearchParams().get('id') ?? ''
  const { org, can } = useSession()
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<{ relationship: string; person: Person }[]>([])
  const [relationship, setRelationship] = useState<Relationship>('child')
  const [missing, setMissing] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskCtx, setTaskCtx] = useState<TaskContext | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id || !org) return
    try {
      const h = await getHousehold(id)
      if (!h) { setMissing(true); return }
      setHousehold(h.household)
      setMembers(h.members)
      // follow-ups the signed-in leader may see for this family
      try { const t = await tasksForHousehold(id); setTasks(t); setTaskCtx(await taskContext(org.id, t)) } catch { setTasks([]) }
      setError('')
    } catch (e) { setError(errorMessage(e)) }
  }, [id, org])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load() } catch (e) { setError(errorMessage(e)) }
  }
  useDocumentTitle(household?.name ?? null)

  if (missing) return <section><BackLink href="/people" label="People" /><p className="muted">This family isn't in your directory.</p></section>
  if (!household || !org) return <Spinner />
  // One-line subtitle: "Street, City, ST ZIP".
  const address = [
    household.address_line1,
    [[household.city, household.state].filter(Boolean).join(', '), household.postal_code].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ')

  return (
    <section>
      <div className="page-nav"><BackLink href="/people" label="People" /></div>
      <header className="page-head">
        <div className="page-title">
          <h1>{household.name}</h1>
          {address && <p className="page-sub">{address}</p>}
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="section narrow">
        <h2 className="group-head">Members</h2>
        <ul className="group household-members">
          {members.map(({ relationship: rel, person }) => {
            const a = age(person.birthdate)
            return (
              <li key={person.id} className="member split">
                {can('people.edit') && (
                  <button className="remove-btn" aria-label={`Remove ${displayName(person)} from this family`}
                    onClick={() => act(() => removeFromHousehold(household.id, person.id))}><RemoveGlyph /></button>
                )}
                <Link href={`/people/view?id=${person.id}`} className="cell-link">
                  <Avatar name={displayName(person)} size="md" />
                  <span className="cell-text">
                    <span className="cell-title">{displayName(person)}</span>
                    <span className="cell-sub"><span className="cap">{rel}</span>{a !== null ? ` · Age ${a}` : ''}</span>
                  </span>
                  <StatusBadge status={person.membership_status} />
                  <Chevron />
                </Link>
              </li>
            )
          })}
          {can('people.edit') && (
            <li className="cell add-member">
              <select className="popup" aria-label="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value as Relationship)}>
                {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
              <PersonPicker orgId={org.id} exclude={members.map((m) => m.person.id)} placeholder="Add someone to this family"
                onPick={(p) => act(() => addToHousehold(org.id, household.id, p.id, relationship))} />
            </li>
          )}
        </ul>
      </section>
      <section className="section narrow">
        <h2 className="group-head">Follow-ups</h2>
        <ul className="group">
          {tasks.length === 0 && <li className="cell muted">No follow-ups for this family.</li>}
          {tasks.map((t) => (
            <li key={t.id} className="cell">
              <span className="cell-text">
                <span className="cell-title">{t.kind === 'manual' ? t.title : 'First visit'}{t.status !== 'open' && <span className="chip" style={{ marginLeft: 8 }}>{t.status === 'done' ? 'Done' : 'Dismissed'}</span>}</span>
                <span className="cell-sub">{taskCtx ? `${arrivedText(t, taskCtx)} · ${assigneeText(t, taskCtx)}` : fmtDate(t.opened_at.slice(0, 10))}{t.close_note ? ` · ${t.close_note}` : ''}</span>
              </span>
              {t.status === 'open' && <Link href="/followups" className="btn btn-plain btn-small">Open</Link>}
            </li>
          ))}
          {(can('checkin.manage') || can('people.edit')) && !tasks.some((t) => t.kind === 'first_visit') && (
            <li><button className="cell-link cell-action" onClick={() => act(() => markFirstVisit({ householdId: household.id }))}>Mark as a first-time family</button></li>
          )}
        </ul>
        <p className="group-foot">A first-time family&apos;s follow-up goes to the kids director for the youngest child&apos;s age, or to the church&apos;s default assignee.</p>
      </section>
      <HouseholdExtras key={members.map((m) => m.person.id).join(',')} householdId={household.id} memberNames={new Map(members.map((m) => [m.person.id, displayName(m.person)]))} />
    </section>
  )
}
