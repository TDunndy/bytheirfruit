'use client'

import { useEffect, useMemo, useState } from 'react'
import { SegmentedControl, Spinner, Switch } from '@/components/ui'
import { StatusBadge } from '@/components/PersonParts'
import { age, displayName, errorMessage, getHousehold, householdsOf, type Person } from '@/lib/people'
import { MERGE_FIELDS, defaultKeep, mergePeople, type FieldPick } from '@/lib/merge'

/**
 * Merges two records: staff choose which one to keep, pick a side for each
 * field that differs, and may add the kept person to the other family too.
 * The archived record keeps its history; the reports read it as the kept one.
 */
export function MergeSheet({ a, b, onDone, onCancel }: { a: Person; b: Person; onDone: (keptId: string) => void; onCancel: () => void }) {
  const [keepId, setKeepId] = useState(defaultKeep(a, b).id)
  const [picks, setPicks] = useState<FieldPick>({})
  const [join, setJoin] = useState(false)
  const [otherFamily, setOtherFamily] = useState<{ name: string; others: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const keep = keepId === a.id ? a : b
  const drop = keepId === a.id ? b : a

  const differing = useMemo(() => MERGE_FIELDS.filter((f) => {
    const kv = keep[f.key], dv = drop[f.key]
    return kv !== null && kv !== '' && dv !== null && dv !== '' && String(kv) !== String(dv)
  }), [keep, drop])

  // Does the dropped record leave people behind in a family of its own?
  useEffect(() => {
    let cancelled = false
    setOtherFamily(null)
    householdsOf(drop.id).then(async (fams) => {
      const keepFams = await householdsOf(keep.id)
      const own = fams.find((f) => !keepFams.some((k) => k.household.id === f.household.id))
      const full = own ? await getHousehold(own.household.id) : null
      if (cancelled) return
      setOtherFamily(own ? { name: own.household.name, others: Math.max(0, (full?.members.length ?? 1) - 1) } : null)
    }).catch(() => { if (!cancelled) setOtherFamily(null) })
    return () => { cancelled = true }
  }, [keep.id, drop.id])

  const submit = async () => {
    setBusy(true); setError('')
    try {
      await mergePeople(keep.id, drop.id, picks, join)
      onDone(keep.id)
    } catch (e) { setError(errorMessage(e)); setBusy(false) }
  }

  const Side = ({ p }: { p: Person }) => (
    <span className="cell-text">
      <span className="cell-title">{displayName(p)}{p.tags.includes('guest') && <span className="chip" style={{ marginLeft: 8 }}>Guest</span>}</span>
      <span className="cell-sub">{[age(p.birthdate) !== null ? `Age ${age(p.birthdate)}` : null, p.phone, p.email].filter(Boolean).join(' · ') || 'No contact details'}</span>
    </span>
  )
  return (
    <form className="card form merge-sheet" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <fieldset>
        <legend className="group-head">Keep which record?</legend>
        <ul className="group">
          <li className="cell"><Side p={a} /><StatusBadge status={a.membership_status} /></li>
          <li className="cell"><Side p={b} /><StatusBadge status={b.membership_status} /></li>
        </ul>
        <div className="mt">
          <SegmentedControl label="Keep" name="merge-keep" value={keepId} onChange={setKeepId}
            options={[{ value: a.id, label: `Keep ${a.first_name}` }, { value: b.id, label: `Keep ${b.first_name}` }]} />
        </div>
        <p className="group-foot">The other record is archived. Its check-ins, notes, groups, pickups and care notes carry over; its history stays readable under the kept name.</p>
      </fieldset>
      {differing.length > 0 && (
        <fieldset>
          <legend className="group-head">Where they differ</legend>
          <ul className="group">
            {differing.map((f) => (
              <li key={f.key} className="cell merge-field">
                <span className="cell-title">{f.label}</span>
                <span className="merge-options" role="radiogroup" aria-label={f.label}>
                  {(['keep', 'drop'] as const).map((side) => {
                    const p = side === 'keep' ? keep : drop
                    const checked = (picks[f.key] ?? 'keep') === side
                    return (
                      <label key={side} className={checked ? 'chip chip-tint merge-option' : 'chip merge-option'}>
                        <input type="radio" name={`merge-${f.key}`} checked={checked} onChange={() => setPicks({ ...picks, [f.key]: side })} />
                        {String(p[f.key])}
                      </label>
                    )
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p className="group-foot">Blank fields fill in from the other record either way.</p>
        </fieldset>
      )}
      {otherFamily && otherFamily.others > 0 && (
        <fieldset>
          <legend className="group-head">Family</legend>
          <ul className="group"><li className="cell"><Switch label={`Also add ${keep.first_name} to ${otherFamily.name}`} checked={join} onChange={setJoin} /></li></ul>
          <p className="group-foot">{drop.first_name} leaves {otherFamily.name}. Turn this on when {keep.first_name} really belongs to both families.</p>
        </fieldset>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn btn-plain" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn btn-filled" disabled={busy}>{busy ? <Spinner /> : `Merge into ${keep.first_name}`}</button>
      </div>
      <p className="muted small">This cannot be undone.</p>
    </form>
  )
}
