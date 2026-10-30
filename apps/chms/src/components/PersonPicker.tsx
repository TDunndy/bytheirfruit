'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { displayName, listPeople, type DirectoryRow } from '@/lib/people'
import { Avatar, SearchField } from './ui'

const MAX_RESULTS = 8
const ROW = 44           // option height (px), for deciding which way the list opens
const LIST_MAX = 340     // .picker-results max-height

/**
 * Type-ahead search over the church directory, as an ARIA combobox: the results are a
 * listbox that ArrowUp/ArrowDown move through, Enter picks and Escape closes. It closes
 * when focus or a click goes elsewhere, opens upward when there is no room below, and a
 * hidden status line says how many people were found.
 */
export function PersonPicker({ orgId, exclude = [], placeholder, onPick }: {
  orgId: string
  exclude?: string[]
  placeholder?: string
  onPick: (p: DirectoryRow) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<DirectoryRow[]>([])
  const [searched, setSearched] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [up, setUp] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()
  const listId = `${id}-list`
  const optionId = (i: number) => `${id}-opt-${i}`

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); setSearched(false); return }
    let cancelled = false
    const t = setTimeout(() => {
      listPeople(orgId, { q: term })
        .then((r) => { if (!cancelled) { setResults(r.rows.filter((p) => !exclude.includes(p.id)).slice(0, MAX_RESULTS)); setSearched(true); setActive(-1) } })
        .catch(() => { if (!cancelled) { setResults([]); setSearched(true) } })
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, orgId, exclude])

  const shown = open && results.length > 0

  // Open upward when the list would not fit between the field and the bottom of the
  // visible area (the on-screen keyboard shrinks visualViewport) and there is more room above.
  useLayoutEffect(() => {
    if (!shown || !wrap.current) return
    const r = wrap.current.getBoundingClientRect()
    const height = window.visualViewport?.height ?? window.innerHeight
    const need = Math.min(LIST_MAX, results.length * ROW + 12) + 6
    const below = height - r.bottom
    setUp(below < need && r.top > below)
  }, [shown, results.length])

  // A click or tap anywhere outside closes the list.
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  useEffect(() => {
    if (shown && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
  // optionId only depends on id, which never changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, active])

  const pick = (p: DirectoryRow) => {
    onPick(p)
    setQ(''); setResults([]); setSearched(false); setActive(-1); setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault()
      setOpen(true)
      setActive((a) => (shown ? Math.min(a + 1, results.length - 1) : 0))
    } else if (e.key === 'ArrowUp' && shown) {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && shown && active >= 0) {
      e.preventDefault()
      pick(results[active])
    } else if (e.key === 'Escape' && shown) {
      // First Escape closes the list; a second one clears the field (the search input's own behaviour).
      e.preventDefault()
      setOpen(false)
      setActive(-1)
    }
  }

  const term = q.trim()
  const status = term.length >= 2 && searched
    ? results.length === 0 ? 'No matches' : `${results.length} ${results.length === 1 ? 'person' : 'people'} found`
    : ''

  return (
    <div className="picker" ref={wrap}
      onBlur={(e) => { if (e.relatedTarget && !wrap.current?.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <SearchField value={q} placeholder={placeholder ?? 'Search people'} aria-label={placeholder ?? 'Search people'}
        role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? optionId(active) : undefined}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onKeyDown={onKeyDown} />
      {/* tabIndex -1: the list scrolls, and a scrollable box would otherwise take a Tab stop. */}
      <ul id={listId} role="listbox" aria-label="Matching people" hidden={!shown} tabIndex={-1}
        className={up ? 'picker-results popover up' : 'picker-results popover'}>
        {shown && results.map((p, i) => (
          <li key={p.id} id={optionId(i)} role="option" aria-selected={i === active}
            className={i === active ? 'picker-option active' : 'picker-option'}
            // Keep focus in the field so the list does not close before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onMouseMove={() => { if (i !== active) setActive(i) }}
            onClick={() => pick(p)}>
            <Avatar name={displayName(p)} size="xs" />
            <span className="picker-name">{displayName(p)}{p.title ? <span className="muted"> · {p.title}</span> : null}</span>
          </li>
        ))}
      </ul>
      <span className="sr-only" role="status">{status}</span>
    </div>
  )
}
