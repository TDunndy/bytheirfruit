'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useSession } from '@/components/Session'
import { MergeSheet } from '@/components/people/MergeSheet'
import { Avatar, BackLink, Spinner } from '@/components/ui'
import { errorMessage, getPerson, type Person } from '@/lib/people'
import { keepSeparate, possibleDuplicates, reasonLabel, type DuplicatePair } from '@/lib/merge'

export default function DuplicatesPage() {
  const { org, can } = useSession()
  const [pairs, setPairs] = useState<DuplicatePair[] | null>(null)
  const [open, setOpen] = useState<{ pair: DuplicatePair; a: Person; b: Person } | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const allowed = can('people.edit')

  const load = useCallback(async () => {
    if (!org || !allowed) return
    try { setPairs(await possibleDuplicates(org.id)); setError('') } catch (e) { setError(errorMessage(e)); setPairs([]) }
  }, [org, allowed])
  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setStatus('')
    try { await fn(); await load(); setStatus(done) } catch (e) { setError(errorMessage(e)) }
  }
  const openPair = async (pair: DuplicatePair) => {
    try {
      const [a, b] = await Promise.all([getPerson(pair.person_a_id), getPerson(pair.person_b_id)])
      if (!a || !b) { setError('One of the records is no longer in the directory.'); return }
      setOpen({ pair, a, b })
    } catch (e) { setError(errorMessage(e)) }
  }

  if (!org) return <Spinner />
  if (!allowed) return <section><BackLink href="/people" label="People" /><div className="card empty"><p className="muted">Your role doesn&apos;t include editing people. Ask a church admin if you need it.</p></div></section>
  return (
    <section>
      <div className="page-nav"><BackLink href="/people" label="People" /></div>
      <header className="page-head">
        <div className="page-title">
          <h1>Possible duplicates</h1>
          <p className="page-sub">{pairs ? `${pairs.length} ${pairs.length === 1 ? 'pair' : 'pairs'}` : 'Loading…'}</p>
        </div>
      </header>
      <p className="lead">Records that share a phone, an email, or a name with the same birthdate. Merging keeps one record and archives the other; marking a pair as separate keeps both and stops asking.</p>
      <p className="sr-only" role="status">{status}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {open && (
        <section className="section narrow">
          <h2 className="group-head">Merge {open.a.first_name} and {open.b.first_name}</h2>
          <MergeSheet a={open.a} b={open.b} onCancel={() => setOpen(null)} onDone={() => { setOpen(null); act(async () => undefined, 'Merged') }} />
        </section>
      )}
      {pairs === null ? <Spinner /> : pairs.length === 0 ? (
        <div className="card empty"><p className="muted">No possible duplicates right now.</p></div>
      ) : (
        <ul className="group dup-list">
          {pairs.map((p) => (
            <li key={`${p.person_a_id}-${p.person_b_id}`} className="cell dup-row">
              <span className="dup-pair">
                <Link href={`/people/view?id=${p.person_a_id}`} className="dup-person">
                  <Avatar name={p.a_name} size="sm" />
                  <span className="cell-text"><span className="cell-title">{p.a_name}{p.a_guest && <span className="chip" style={{ marginLeft: 6 }}>Guest</span>}</span><span className="cell-sub">{p.a_household ?? 'No family'}</span></span>
                </Link>
                <Link href={`/people/view?id=${p.person_b_id}`} className="dup-person">
                  <Avatar name={p.b_name} size="sm" />
                  <span className="cell-text"><span className="cell-title">{p.b_name}{p.b_guest && <span className="chip" style={{ marginLeft: 6 }}>Guest</span>}</span><span className="cell-sub">{p.b_household ?? 'No family'}</span></span>
                </Link>
              </span>
              <span className="chips">{p.reasons.map((r) => <span key={r} className="chip chip-tint">{reasonLabel(r)}</span>)}</span>
              <span className="actions">
                <button className="btn btn-plain btn-small" onClick={() => act(() => keepSeparate(p.person_a_id, p.person_b_id), 'Marked as separate')}>Not the same person</button>
                <button className="btn btn-tinted btn-small" onClick={() => openPair(p)}>Merge…</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
