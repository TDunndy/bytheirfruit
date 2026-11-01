'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../Session'
import { Icon, Switch } from '../ui'
import { errorMessage, peopleNames } from '@/lib/people'
import { FLAGS, clearFlag, flagsFor, membersFor, setFlag, setMemberFlags, type HouseholdFlag, type HouseholdMember } from '@/lib/kids'

function fmt(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }

/** Guardian and check-in switches per member; serve-policy flags on the family. */
export function HouseholdExtras({ householdId, memberNames }: { householdId: string; memberNames: Map<string, string> }) {
  const { org, can } = useSession()
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [flags, setFlags] = useState<HouseholdFlag[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [flag, setFlagKind] = useState<HouseholdFlag['flag']>('exempt')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!org) return
    try {
      const [m, f] = await Promise.all([membersFor(householdId), can('people.notes') ? flagsFor(householdId) : Promise.resolve([])])
      setMembers(m); setFlags(f)
      setNames(await peopleNames(f.flatMap((x) => [x.set_by_person_id ?? '', x.cleared_by_person_id ?? ''])))
      setError('')
    } catch (e) { setError(errorMessage(e)) }
  }, [org, householdId, can])
  useEffect(() => { load() }, [load])
  if (!org) return null
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load() } catch (e) { setError(errorMessage(e)) } }
  const active = flags.filter((f) => !f.cleared_at)

  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      {can('people.edit') && members.some((m) => m.relationship !== 'child') && (
        <section className="section narrow">
          <h2 className="group-head">Who may check children in</h2>
          <div className="group">
            {members.filter((m) => m.relationship !== 'child').map((m) => (
              <div key={m.person_id} className="field">
                <span>{memberNames.get(m.person_id) ?? 'Someone'}</span>
                <span className="row">
                  <Switch label="Guardian" checked={m.is_guardian} onChange={(on) => act(() => setMemberFlags(householdId, m.person_id, { is_guardian: on }))} />
                  <Switch label="Can check in" checked={m.can_check_in} onChange={(on) => act(() => setMemberFlags(householdId, m.person_id, { can_check_in: on }))} />
                </span>
              </div>
            ))}
          </div>
          <p className="group-foot">Guardians count for the serve policy; anyone who can check in may also pick up. Children never can.</p>
        </section>
      )}
      {can('people.notes') && (
        <section className="section narrow">
          <h2 className="group-head">Serve-policy flags</h2>
          <ul className="group">
            {active.length === 0 && <li className="cell muted">No flags. The family is treated like any other.</li>}
            {active.map((f) => (
              <li key={f.id} className="cell">
                <Icon name="planned" size={20} />
                <span className="cell-text">
                  <span className="cell-title">{FLAGS.find((x) => x.value === f.flag)?.label ?? f.flag}</span>
                  <span className="cell-sub">{f.note ? `${f.note} · ` : ''}{f.set_by_person_id ? names.get(f.set_by_person_id) ?? 'A leader' : 'Church admin'} · {fmt(f.set_at)}</span>
                </span>
                <button className="btn btn-plain btn-small" onClick={() => act(() => clearFlag(f.id))}>Clear</button>
              </li>
            ))}
            <li className="cell add-member">
              <select className="popup" aria-label="Flag" value={flag} onChange={(e) => setFlagKind(e.target.value as HouseholdFlag['flag'])}>
                {FLAGS.filter((x) => !active.some((a) => a.flag === x.value)).map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
              <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (optional)" />
              <button className="btn btn-tinted btn-small" disabled={active.some((a) => a.flag === flag)} onClick={() => act(async () => { await setFlag(org.id, householdId, flag, note || null); setNote('') })}>Set flag</button>
            </li>
          </ul>
          <p className="group-foot">{FLAGS.find((x) => x.value === flag)?.help}.</p>
        </section>
      )}
    </>
  )
}
