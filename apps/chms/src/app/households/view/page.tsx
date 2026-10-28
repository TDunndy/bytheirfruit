'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from '@/components/Session'
import { StatusBadge } from '@/components/PersonParts'
import { PersonPicker } from '@/components/PersonPicker'
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

  if (missing) return <section><Link href="/people" className="back">← People</Link><p className="muted">This family isn't in your directory.</p></section>
  if (!household || !org) return <div className="spinner" aria-label="Loading" />
  const address = [household.address_line1, [household.city, household.state].filter(Boolean).join(', '), household.postal_code].filter(Boolean).join(' · ')

  return (
    <section>
      <Link href="/people" className="back">← People</Link>
      <header className="page-head wrap">
        <div>
          <h1>{household.name}</h1>
          {address && <div className="muted small">{address}</div>}
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Relationship</th><th className="hide-sm">Age</th><th className="hide-sm">Status</th>{can('people.edit') && <th />}</tr></thead>
          <tbody>
            {members.map(({ relationship: rel, person }) => (
              <tr key={person.id}>
                <td><Link href={`/people/view?id=${person.id}`} className="person-link">{displayName(person)}</Link></td>
                <td className="cap">{rel}</td>
                <td className="hide-sm">{age(person.birthdate) ?? ''}</td>
                <td className="hide-sm"><StatusBadge status={person.membership_status} /></td>
                {can('people.edit') && (
                  <td><button className="link-btn small" onClick={() => act(() => removeFromHousehold(household.id, person.id))}>Remove</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {can('people.edit') && (
          <div className="row mt">
            <select aria-label="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value as Relationship)}>
              {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
            <PersonPicker orgId={org.id} exclude={members.map((m) => m.person.id)} placeholder="Add someone to this family"
              onPick={(p) => act(() => addToHousehold(org.id, household.id, p.id, relationship))} />
          </div>
        )}
      </div>
    </section>
  )
}
