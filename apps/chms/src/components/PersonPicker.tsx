'use client'

import { useEffect, useState } from 'react'
import { displayName, listPeople, type DirectoryRow } from '@/lib/people'

/** Type-ahead search over the church directory. */
export function PersonPicker({ orgId, exclude = [], placeholder, onPick }: {
  orgId: string
  exclude?: string[]
  placeholder?: string
  onPick: (p: DirectoryRow) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<DirectoryRow[]>([])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    let cancelled = false
    const t = setTimeout(() => {
      listPeople(orgId, { q: term })
        .then((r) => { if (!cancelled) setResults(r.rows.filter((p) => !exclude.includes(p.id)).slice(0, 8)) })
        .catch(() => { if (!cancelled) setResults([]) })
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, orgId, exclude])

  return (
    <div className="picker">
      <input type="search" value={q} placeholder={placeholder ?? 'Search people'} aria-label={placeholder ?? 'Search people'}
        onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="picker-results" role="listbox">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p); setQ(''); setResults([]) }}>
                {displayName(p)}{p.title ? <span className="muted"> · {p.title}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
