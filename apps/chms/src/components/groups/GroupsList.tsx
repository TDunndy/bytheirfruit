'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/Session'
import { Chevron, Icon, IconTile, SearchField, Switch } from '@/components/ui'
import { listAreas, type Area } from '@/lib/checkin'
import { errorMessage } from '@/lib/people'
import { GROUP_KINDS, listGroups, memberCounts, type Group } from '@/lib/groups'

export function GroupsList() {
  const { org, can } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [counts, setCounts] = useState<Map<string, { members: number; leaders: number }>>(new Map())
  const [areas, setAreas] = useState<Area[]>([])
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!org) return
    let cancelled = false
    setLoading(true)
    Promise.all([listGroups(org.id, archived), memberCounts(org.id), listAreas(org.id)])
      .then(([g, c, a]) => { if (!cancelled) { setGroups(g); setCounts(c); setAreas(a); setError('') } })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [org, archived])

  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return groups.filter((g) => (archived ? !!g.archived_at : !g.archived_at) && (!needle || g.name.toLowerCase().includes(needle) || (g.meets ?? '').toLowerCase().includes(needle)))
  }, [groups, q, archived])
  const total = groups.filter((g) => (archived ? !!g.archived_at : !g.archived_at)).length
  const count = `${total} ${archived ? 'archived ' : ''}${total === 1 ? 'group' : 'groups'}`

  if (!org) return null
  return (
    <section>
      <header className="page-head">
        <div className="page-title">
          <h1>Groups</h1>
          <p className="page-sub">{loading ? 'Loading…' : count}</p>
        </div>
        {can('groups.manage') && (
          <Link href="/groups/new" className="btn btn-filled btn-add"><Icon name="plus" size={18} /><span className="btn-label">Add group</span></Link>
        )}
      </header>
      <p className="sr-only" role="status">{loading ? '' : count}</p>
      <div className="toolbar">
        <SearchField className="search" placeholder="Search groups" aria-label="Search groups" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="toolbar-row"><div className="toolbar-end"><Switch label="Show archived" checked={archived} onChange={setArchived} /></div></div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && shown.length === 0 && (
        <div className="card empty"><p className="muted">{groups.length === 0 ? 'No groups yet. Ministries, serving teams, small groups, classes and community groups all live here.' : 'Nothing matches.'}</p></div>
      )}
      {GROUP_KINDS.map((k) => {
        const mine = shown.filter((g) => g.kind === k.value)
        if (mine.length === 0) return null
        return (
          <section key={k.value} className="section">
            <h2 className="group-head">{k.plural}</h2>
            <ul className="group">
              {mine.map((g) => {
                const c = counts.get(g.id) ?? { members: 0, leaders: 0 }
                const sub = [
                  `${c.members} ${c.members === 1 ? 'member' : 'members'}${c.leaders ? ` · ${c.leaders} ${c.leaders === 1 ? 'leader' : 'leaders'}` : ''}`,
                  g.meets, g.area_id ? areaName.get(g.area_id) : null,
                ].filter(Boolean).join(' · ')
                return (
                  <li key={g.id}>
                    <Link href={`/groups/view?id=${g.id}`} className="cell-link">
                      <IconTile name="groups" />
                      <span className="cell-text">
                        <span className="cell-title">{g.name}{!g.active && !g.archived_at && <span className="chip" style={{ marginLeft: 8 }}>Paused</span>}</span>
                        <span className="cell-sub">{sub}</span>
                      </span>
                      <Chevron />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </section>
  )
}
