// Groups: ministries, serving teams, small groups, classes and community
// groups, with members and leaders drawn from People. Every query goes
// through RLS: groups.manage or an active leader row writes; people.view
// reads members (children need kids.view).
import { supabase } from './supabase'
import type { Database } from '@db/database.types'
import type { Person } from './people'
import { listAreaLeaders, listAreas, listAssignments, listRoomLeaders, listRooms, listSchedules, listSlots, type Area, type Room, type VolunteerAssignment, type VolunteerSlot } from './checkin'

type Tables = Database['public']['Tables']
export type Group = Tables['groups']['Row']
export type GroupMember = Tables['group_members']['Row']
export type GroupKind = Group['kind']
export type MemberRole = GroupMember['role']

export const GROUP_KINDS: { value: GroupKind; label: string; plural: string; help: string }[] = [
  { value: 'ministry', label: 'Ministry', plural: 'Ministries', help: 'Kids, worship, youth, missions' },
  { value: 'team', label: 'Serving team', plural: 'Serving teams', help: 'Welcome, parking, Barn rooms, tech' },
  { value: 'small_group', label: 'Small group', plural: 'Small groups', help: 'Meets in homes or on site' },
  { value: 'class', label: 'Class', plural: 'Classes', help: 'Sunday school, membership class, studies' },
  { value: 'community', label: 'Community group', plural: 'Community groups', help: 'Moms, men, seniors, recovery' },
]
export const MEMBER_ROLES: { value: MemberRole; label: string }[] = [
  { value: 'member', label: 'Member' }, { value: 'co_leader', label: 'Co-leader' }, { value: 'leader', label: 'Leader' },
]
export const kindLabel = (k: GroupKind) => GROUP_KINDS.find((x) => x.value === k)?.label ?? k
export const roleLabel = (r: MemberRole) => MEMBER_ROLES.find((x) => x.value === r)?.label ?? r
export const isLeaderRole = (r: MemberRole) => r === 'leader' || r === 'co_leader'

function one<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error
  if (r.data === null) throw new Error('Nothing came back.')
  return r.data
}
function many<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw r.error
  return r.data ?? []
}

export async function listGroups(orgId: string, includeArchived = false): Promise<Group[]> {
  let q = supabase.from('groups').select('*').eq('org_id', orgId).order('name')
  if (!includeArchived) q = q.is('archived_at', null)
  return many(await q)
}

export async function getGroup(id: string): Promise<Group | null> {
  const { data, error } = await supabase.from('groups').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export interface GroupInput {
  id?: string
  name: string
  kind: GroupKind
  description: string | null
  meets: string | null
  area_id: string | null
  active: boolean
}

export async function saveGroup(orgId: string, g: GroupInput): Promise<Group> {
  const row = { name: g.name, kind: g.kind, description: g.description, meets: g.meets, area_id: g.area_id, active: g.active }
  if (g.id) return one(await supabase.from('groups').update(row).eq('id', g.id).select('*').single())
  return one(await supabase.from('groups').insert({ org_id: orgId, ...row }).select('*').single())
}

export async function archiveGroup(id: string, archived: boolean) {
  const { error } = await supabase.from('groups').update({ archived_at: archived ? new Date().toISOString() : null, active: !archived }).eq('id', id)
  if (error) throw error
}

/** Active members and leaders per group, for the list. */
export async function memberCounts(orgId: string): Promise<Map<string, { members: number; leaders: number }>> {
  const rows = many(await supabase.from('group_members').select('group_id, role').eq('org_id', orgId).is('ended_at', null))
  const out = new Map<string, { members: number; leaders: number }>()
  for (const r of rows) {
    const c = out.get(r.group_id) ?? { members: 0, leaders: 0 }
    c.members += 1
    if (isLeaderRole(r.role)) c.leaders += 1
    out.set(r.group_id, c)
  }
  return out
}

export interface GroupMembership { membership: GroupMember; person: Person }

/** Active members of a group with their directory rows (what the caller may see), leaders first. */
export async function groupMembers(groupId: string): Promise<GroupMembership[]> {
  const memberships = many(await supabase.from('group_members').select('*').eq('group_id', groupId).is('ended_at', null))
  if (memberships.length === 0) return []
  const people = many(await supabase.from('people').select('*').in('id', memberships.map((m) => m.person_id)))
  const byId = new Map(people.map((p) => [p.id, p]))
  const rank = (r: MemberRole) => (r === 'leader' ? 0 : r === 'co_leader' ? 1 : 2)
  return memberships
    .map((membership) => ({ membership, person: byId.get(membership.person_id) }))
    .filter((x): x is GroupMembership => !!x.person)
    .sort((a, b) => rank(a.membership.role) - rank(b.membership.role) || a.person.first_name.localeCompare(b.person.first_name) || a.person.last_name.localeCompare(b.person.last_name))
}

export async function addMember(orgId: string, groupId: string, personId: string, role: MemberRole = 'member') {
  const { error } = await supabase.from('group_members').insert({ org_id: orgId, group_id: groupId, person_id: personId, role })
  if (error) throw error
}

export async function endMember(membershipId: string) {
  const { error } = await supabase.from('group_members').update({ ended_at: new Date().toISOString() }).eq('id', membershipId)
  if (error) throw error
}

export async function setMemberRole(membershipId: string, role: MemberRole) {
  const { error } = await supabase.from('group_members').update({ role }).eq('id', membershipId)
  if (error) throw error
}

export interface PersonGroup { membership: GroupMember; group: Group }

/** The groups a person is in now, with their role. */
export async function groupsOf(personId: string): Promise<PersonGroup[]> {
  const memberships = many(await supabase.from('group_members').select('*').eq('person_id', personId).is('ended_at', null))
  if (memberships.length === 0) return []
  const groups = many(await supabase.from('groups').select('*').in('id', memberships.map((m) => m.group_id)).is('archived_at', null))
  const byId = new Map(groups.map((g) => [g.id, g]))
  return memberships
    .map((membership) => ({ membership, group: byId.get(membership.group_id) }))
    .filter((x): x is PersonGroup => !!x.group)
    .sort((a, b) => a.group.name.localeCompare(b.group.name))
}

/** The person linked to the signed-in login in this church (null when none). */
export async function myPersonId(orgId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('person_logins').select('person_id').eq('org_id', orgId).eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.person_id ?? null
}

// ------------------------------------------------------------ involvement --
export interface ServingLine { id: string; where: string; kind: 'director' | 'leader'; via: 'person' | 'role' }
export interface UpcomingSlot { assignment: VolunteerAssignment; label: string; date: string }
export interface Involvement {
  groups: PersonGroup[]
  serving: ServingLine[]
  upcoming: UpcomingSlot[]
  /** "this week" summary pieces */
  slotsThisWeek: number
  leads: number
}

/** Everything a person is signed up for: groups, area and room leadership, and the next four weeks of volunteer slots. */
export async function involvementFor(orgId: string, personId: string, roleIds: string[], today: string): Promise<Involvement> {
  const through = addDays(today, 28)
  const [groups, areaLeaders, roomLeaders, assignments, slots, rooms, areas, schedules] = await Promise.all([
    groupsOf(personId), listAreaLeaders(orgId), listRoomLeaders(orgId), listAssignments(orgId, today, through), listSlots(orgId), listRooms(orgId), listAreas(orgId), listSchedules(orgId),
  ])
  const areaName = new Map(areas.map((a: Area) => [a.id, a.name]))
  const roomName = new Map(rooms.map((r: Room) => [r.id, r.name]))
  const scheduleName = new Map(schedules.map((s) => [s.id, s.name]))
  const slotById = new Map(slots.map((s: VolunteerSlot) => [s.id, s]))
  const serving: ServingLine[] = [
    ...areaLeaders.filter((l) => l.person_id === personId || (l.role_id && roleIds.includes(l.role_id)))
      .map((l) => ({ id: l.id, where: areaName.get(l.area_id) ?? 'Area', kind: l.kind as 'director' | 'leader', via: l.person_id ? 'person' as const : 'role' as const })),
    ...roomLeaders.filter((l) => l.person_id === personId || (l.role_id && roleIds.includes(l.role_id)))
      .map((l) => ({ id: l.id, where: roomName.get(l.room_id) ?? 'Room', kind: l.kind as 'director' | 'leader', via: l.person_id ? 'person' as const : 'role' as const })),
  ]
  const upcoming: UpcomingSlot[] = assignments
    .filter((a) => a.person_id === personId && a.status !== 'declined')
    .map((a) => {
      const s = slotById.get(a.slot_id)
      const label = s ? (s.label ?? (s.room_id ? roomName.get(s.room_id) : null) ?? 'Volunteer') + (s.schedule_id ? ` · ${scheduleName.get(s.schedule_id) ?? ''}` : '') : 'Volunteer'
      return { assignment: a, label, date: a.local_date }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  const weekEnd = addDays(today, 7)
  return {
    groups, serving, upcoming,
    slotsThisWeek: upcoming.filter((u) => u.date < weekEnd).length,
    leads: groups.filter((g) => isLeaderRole(g.membership.role)).length,
  }
}

function addDays(d: string, n: number): string {
  const x = new Date(d + 'T00:00:00')
  x.setDate(x.getDate() + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------- messaging --
export interface GroupContact { person_id: string; display_name: string; value: string; for_person_id: string }

/** Email addresses or phone numbers behind one or more groups (minors through their guardians; STOP honoured). Logged per group. */
export async function groupContacts(groupIds: string[], channel: 'email' | 'sms'): Promise<GroupContact[]> {
  const { data, error } = await supabase.rpc('group_contacts', { p_group_ids: groupIds, p_channel: channel })
  if (error) throw error
  return (data ?? []) as unknown as GroupContact[]
}

/** A mailto: link that opens the leader's own mail app with everyone in BCC. */
export function mailtoLink(emails: string[], subject: string): string {
  return `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(subject)}`
}

/** An sms: link for the device's Messages app (iOS and Android spell group texts differently). */
export function smsLink(numbers: string[], body: string): string {
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (ios) return `sms:/open?addresses=${numbers.join(',')}&body=${encodeURIComponent(body)}`
  return `sms:${numbers.join(',')}?body=${encodeURIComponent(body)}`
}
