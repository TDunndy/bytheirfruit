'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/components/Session'
import { StatusBadge } from '@/components/PersonParts'
import { PersonPicker } from '@/components/PersonPicker'
import { GroupForm } from '@/components/groups/GroupForm'
import { MessageGroups } from '@/components/groups/MessageGroups'
import { Avatar, BackLink, Chevron, RemoveGlyph, Spinner } from '@/components/ui'
import { useDocumentTitle } from '@/components/useDocumentTitle'
import { listAreas, type Area } from '@/lib/checkin'
import { age, displayName, errorMessage } from '@/lib/people'
import {
  MEMBER_ROLES, addMember, archiveGroup, endMember, getGroup, groupMembers, isLeaderRole, kindLabel, myPersonId, roleLabel, saveGroup, setMemberRole,
  type Group, type GroupMembership, type MemberRole,
} from '@/lib/groups'

export default function GroupPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <GroupView />
    </Suspense>
  )
}

function GroupView() {
  const id = useSearchParams().get('id') ?? ''
  const router = useRouter()
  const { org, can, user } = useSession()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMembership[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [role, setRole] = useState<MemberRole>('member')
  const [editing, setEditing] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id || !org) return
    try {
      const g = await getGroup(id)
      if (!g) { setMissing(true); return }
      const [m, a, mine] = await Promise.all([groupMembers(id), listAreas(org.id), user ? myPersonId(org.id, user.id) : Promise.resolve(null)])
      setGroup(g); setMembers(m); setAreas(a); setMe(mine); setError('')
    } catch (e) { setError(errorMessage(e)) }
  }, [id, org, user])
  useEffect(() => { load() }, [load])
  useDocumentTitle(group?.name ?? null)
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load() } catch (e) { setError(errorMessage(e)) } }
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas])

  if (missing) return <section><BackLink href="/groups" label="Groups" /><p className="muted">This group isn't in your church.</p></section>
  if (!group || !org) return <Spinner />
  const leadsHere = !!me && members.some((m) => m.person.id === me && isLeaderRole(m.membership.role))
  const manage = can('groups.manage') || leadsHere
  const leaders = members.filter((m) => isLeaderRole(m.membership.role))
  const sub = [kindLabel(group.kind), group.meets, group.area_id ? areaName.get(group.area_id) : null, group.archived_at ? 'Archived' : !group.active ? 'Paused' : null].filter(Boolean).join(' · ')

  if (editing) {
    return (
      <section>
        <div className="page-nav"><BackLink href={`/groups/view?id=${group.id}`} label={group.name} /></div>
        <GroupForm initial={group} areas={areas} submitLabel="Save" onCancel={() => setEditing(false)}
          onSubmit={async (g) => { try { await saveGroup(org.id, { ...g, id: group.id }); setEditing(false); await load() } catch (e) { throw new Error(errorMessage(e)) } }} />
      </section>
    )
  }

  return (
    <section>
      <div className="page-nav">
        <BackLink href="/groups" label="Groups" />
        {manage && (
          <div className="actions">
            <button className="btn btn-tinted btn-small" onClick={() => setEditing(true)}>Edit</button>
            {can('groups.manage') && (group.archived_at
              ? <button className="btn btn-plain btn-small" onClick={() => act(() => archiveGroup(group.id, false))}>Restore</button>
              : <button className="btn btn-plain btn-small" onClick={() => { if (window.confirm(`Archive ${group.name}? Its members stay on record.`)) act(async () => { await archiveGroup(group.id, true); router.push('/groups') }) }}>Archive</button>)}
          </div>
        )}
      </div>
      <header className="page-head">
        <div className="page-title">
          <h1>{group.name}</h1>
          <p className="page-sub">{sub}</p>
        </div>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {group.description && <p className="lead">{group.description}</p>}
      {(manage || can('notify.broadcast')) && members.length > 0 && !group.archived_at && (
        <section className="section narrow">
          <MessageGroups groupIds={[group.id]} title={group.name} />
        </section>
      )}
      <section className="section narrow">
        <h2 className="group-head">{members.length === 0 ? 'Members' : `${members.length} ${members.length === 1 ? 'member' : 'members'}${leaders.length ? ` · ${leaders.map((l) => l.person.first_name).join(', ')} ${leaders.length === 1 ? 'leads' : 'lead'}` : ''}`}</h2>
        <ul className="group household-members">
          {members.length === 0 && <li className="cell muted">Nobody yet.{manage ? ' Add people below.' : ''}</li>}
          {members.map(({ membership, person }) => {
            const a = age(person.birthdate)
            return (
              <li key={membership.id} className="member split">
                {manage && (
                  <button className="remove-btn" aria-label={`Remove ${displayName(person)} from this group`}
                    onClick={() => act(() => endMember(membership.id))}><RemoveGlyph /></button>
                )}
                <Link href={`/people/view?id=${person.id}`} className="cell-link">
                  <Avatar name={displayName(person)} size="md" />
                  <span className="cell-text">
                    <span className="cell-title">{displayName(person)}</span>
                    <span className="cell-sub">{roleLabel(membership.role)}{a !== null ? ` · Age ${a}` : ''} · since {fmtDate(membership.joined_on)}</span>
                  </span>
                  <StatusBadge status={person.membership_status} />
                  <Chevron />
                </Link>
                {manage && (
                  <select className="popup role-popup" aria-label={`Role of ${displayName(person)}`} value={membership.role} onChange={(e) => act(() => setMemberRole(membership.id, e.target.value as MemberRole))}>
                    {MEMBER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                )}
              </li>
            )
          })}
          {manage && !group.archived_at && (
            <li className="cell add-member">
              <select className="popup" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
                {MEMBER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <PersonPicker orgId={org.id} exclude={members.map((m) => m.person.id)} placeholder="Add someone to this group"
                onPick={(p) => act(() => addMember(org.id, group.id, p.id, role))} />
            </li>
          )}
        </ul>
        {manage && <p className="group-foot">Leaders and co-leaders can add and remove members and edit the group. Removing someone ends their membership; it stays in the record.</p>}
      </section>
    </section>
  )
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
