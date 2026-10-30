'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from '@/components/Session'
import { StatusBadge } from '@/components/PersonParts'
import { PersonPicker } from '@/components/PersonPicker'
import { Avatar, BackLink, Chevron } from '@/components/ui'
import {
  RELATIONSHIPS, addToHousehold, age, displayName, errorMessage, getHousehold, removeFromHousehold,
  type Household, type Person, type Relationship,
} from '@/lib/people'

export default function HouseholdPage() {
  return (
    <Suspense fallback={<div className="spinner" aria-label="Loading" />}>
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
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    try {
      const h = await getHousehold(id)
      if (!h) { setMissing(true); return }
      setHousehold(h.household)
      setMembers(h.members)
      setError('')
    } catch (e) { setError(errorMessage(e)) }
  }, [id])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load() } catch (e) { setError(errorMessage(e)) }
  }

  if (missing) return <section><BackLink href="/people" label="People" /><p className="muted">This family isn't in your directory.</p></section>
  if (!household || !org) return <div className="spinner" aria-label="Loading" />
  const address = [household.address_line1, [household.city, household.state].filter(Boolean).join(', '), household.postal_code].filter(Boolean).join(' · ')

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
                <Link href={`/people/view?id=${person.id}`} className="cell-link">
                  <Avatar name={displayName(person)} size="md" />
                  <span className="cell-text">
                    <span className="cell-title">{displayName(person)}</span>
                    <span className="cell-sub"><span className="cap">{rel}</span>{a !== null ? ` · Age ${a}` : ''}</span>
                  </span>
                  <StatusBadge status={person.membership_status} />
                  <Chevron />
                </Link>
                {can('people.edit') && (
                  <button className="link-btn destructive member-remove" onClick={() => act(() => removeFromHousehold(household.id, person.id))}>Remove</button>
                )}
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
    </section>
  )
}
