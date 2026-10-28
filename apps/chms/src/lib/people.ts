import { supabase } from './supabase'
import type { Database } from '@db/database.types'

type Tables = Database['public']['Tables']
export type Person = Tables['people']['Row']
export type PersonInput = Tables['people']['Insert']
export type Household = Tables['households']['Row']
export type OrgRole = Tables['org_roles']['Row']
export type Note = Tables['person_notes']['Row']
export type AuditEntry = Tables['people_audit']['Row']
export type NoteVisibility = 'care' | 'oversight' | 'private'
export type MembershipStatus = 'visitor' | 'regular' | 'member' | 'inactive'

export const MEMBERSHIP_STATUSES: { value: MembershipStatus; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'regular', label: 'Regular attender' },
  { value: 'visitor', label: 'Visitor' },
  { value: 'inactive', label: 'Inactive' },
]

export const RELATIONSHIPS = ['head', 'spouse', 'child', 'other'] as const
export type Relationship = (typeof RELATIONSHIPS)[number]

export function displayName(p: Pick<Person, 'first_name' | 'last_name' | 'preferred_name'>): string {
  return `${p.preferred_name || p.first_name} ${p.last_name}`.trim()
}

export function age(birthdate: string | null): number | null {
  if (!birthdate) return null
  const b = new Date(birthdate + 'T00:00:00')
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a -= 1
  return a
}

export const PAGE_SIZE = 50

export interface PeopleQuery {
  q?: string
  status?: MembershipStatus | ''
  roleId?: string
  tag?: string
  archived?: boolean
  page?: number
}

export interface DirectoryRow extends Person {
  person_roles: { role_id: string }[]
}

/** One page of the directory. RLS limits rows to churches the leader may view. */
export async function listPeople(orgId: string, query: PeopleQuery): Promise<{ rows: DirectoryRow[]; total: number }> {
  const page = Math.max(0, query.page ?? 0)
  let req = supabase
    .from('people')
    .select(query.roleId ? '*, person_roles!inner(role_id)' : '*, person_roles(role_id)', { count: 'exact' })
    .eq('org_id', orgId)
  req = query.archived ? req.not('archived_at', 'is', null) : req.is('archived_at', null)
  const q = (query.q ?? '').trim().toLowerCase()
  if (q) req = req.ilike('search_text', `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
  if (query.status) req = req.eq('membership_status', query.status)
  if (query.roleId) req = req.eq('person_roles.role_id', query.roleId)
  if (query.tag) req = req.contains('tags', [query.tag])
  const { data, error, count } = await req
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
  if (error) throw error
  return { rows: (data ?? []) as unknown as DirectoryRow[], total: count ?? 0 }
}

export async function listRoles(orgId: string): Promise<OrgRole[]> {
  const { data, error } = await supabase.from('org_roles').select('*').eq('org_id', orgId).order('name')
  if (error) throw error
  return data ?? []
}

export async function getPerson(id: string): Promise<Person | null> {
  const { data, error } = await supabase.from('people').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** Names for a set of person ids (for chart lines, note authors, history). */
export async function peopleNames(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  const names = new Map<string, string>()
  if (unique.length === 0) return names
  const { data, error } = await supabase.from('people').select('id, first_name, last_name, preferred_name').in('id', unique)
  if (error) throw error
  for (const p of data ?? []) names.set(p.id, displayName(p))
  return names
}

export async function createPerson(input: PersonInput): Promise<Person> {
  const { data, error } = await supabase.from('people').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function updatePerson(id: string, patch: Tables['people']['Update']): Promise<Person> {
  const { data, error } = await supabase.from('people').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data
}

export async function setArchived(id: string, archived: boolean): Promise<Person> {
  return updatePerson(id, { archived_at: archived ? new Date().toISOString() : null })
}

// ---------------------------------------------------------------- roles --
export async function personRoleIds(personId: string): Promise<string[]> {
  const { data, error } = await supabase.from('person_roles').select('role_id').eq('person_id', personId)
  if (error) throw error
  return (data ?? []).map((r) => r.role_id)
}

export async function addRole(orgId: string, personId: string, roleId: string) {
  const { error } = await supabase.from('person_roles').insert({ org_id: orgId, person_id: personId, role_id: roleId })
  if (error) throw error
}

export async function removeRole(personId: string, roleId: string) {
  const { error } = await supabase.from('person_roles').delete().eq('person_id', personId).eq('role_id', roleId)
  if (error) throw error
}

// ---------------------------------------------------------------- chart --
export interface ChartLine {
  id: string
  person_id: string
  overseer_person_id: string | null
  overseer_role_id: string | null
}

/** Lines where the person answers to someone, and lines where someone answers to them. */
export async function chartFor(personId: string): Promise<{ answersTo: ChartLine[]; reports: ChartLine[] }> {
  const [up, down] = await Promise.all([
    supabase.from('person_overseers').select('id, person_id, overseer_person_id, overseer_role_id').eq('person_id', personId),
    supabase.from('person_overseers').select('id, person_id, overseer_person_id, overseer_role_id').eq('overseer_person_id', personId),
  ])
  if (up.error) throw up.error
  if (down.error) throw down.error
  return { answersTo: up.data ?? [], reports: down.data ?? [] }
}

export async function addChartLine(orgId: string, personId: string, overseer: { personId?: string; roleId?: string }) {
  const { error } = await supabase.from('person_overseers').insert({
    org_id: orgId,
    person_id: personId,
    overseer_person_id: overseer.personId ?? null,
    overseer_role_id: overseer.roleId ?? null,
  })
  if (error) throw error
}

export async function removeChartLine(lineId: string) {
  const { error } = await supabase.from('person_overseers').delete().eq('id', lineId)
  if (error) throw error
}

// ---------------------------------------------------------- households --
export interface Membership {
  relationship: string
  household: Household
}

export async function householdsOf(personId: string): Promise<Membership[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('relationship, households(*)')
    .eq('person_id', personId)
  if (error) throw error
  return (data ?? []).flatMap((m) => (m.households ? [{ relationship: m.relationship, household: m.households }] : []))
}

export async function getHousehold(id: string): Promise<{ household: Household; members: { relationship: string; person: Person }[] } | null> {
  const { data: household, error } = await supabase.from('households').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!household) return null
  const { data: members, error: mErr } = await supabase
    .from('household_members')
    .select('relationship, people(*)')
    .eq('household_id', id)
  if (mErr) throw mErr
  const order: Record<string, number> = { head: 0, spouse: 1, child: 2, other: 3 }
  const list = (members ?? [])
    .flatMap((m) => (m.people ? [{ relationship: m.relationship, person: m.people }] : []))
    .sort((a, b) => (order[a.relationship] ?? 9) - (order[b.relationship] ?? 9)
      || (a.person.birthdate ?? '').localeCompare(b.person.birthdate ?? ''))
  return { household, members: list }
}

export async function createHousehold(orgId: string, name: string, from?: Pick<Person, 'address_line1' | 'address_line2' | 'city' | 'state' | 'postal_code'>) {
  const { data, error } = await supabase
    .from('households')
    .insert({
      org_id: orgId, name,
      address_line1: from?.address_line1 ?? null, address_line2: from?.address_line2 ?? null,
      city: from?.city ?? null, state: from?.state ?? null, postal_code: from?.postal_code ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function addToHousehold(orgId: string, householdId: string, personId: string, relationship: Relationship) {
  const { error } = await supabase
    .from('household_members')
    .insert({ org_id: orgId, household_id: householdId, person_id: personId, relationship })
  if (error) throw error
}

export async function removeFromHousehold(householdId: string, personId: string) {
  const { error } = await supabase.from('household_members').delete().eq('household_id', householdId).eq('person_id', personId)
  if (error) throw error
}

// ---------------------------------------------------------------- notes --
export async function notesFor(personId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('person_notes')
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function addNote(orgId: string, personId: string, body: string, visibility: NoteVisibility) {
  const { error } = await supabase.from('person_notes').insert({ org_id: orgId, person_id: personId, body, visibility })
  if (error) throw error
}

export async function deleteNote(id: string) {
  const { error } = await supabase.from('person_notes').delete().eq('id', id)
  if (error) throw error
}

// -------------------------------------------------------------- history --
export async function historyFor(personId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('people_audit')
    .select('*')
    .eq('person_id', personId)
    .order('at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

/** Person ids in a church that have a login, with their membership role. */
export async function teamLogins(orgId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('people_with_logins', { p_org_id: orgId })
  if (error) throw error
  return new Map((data ?? []).map((r) => [r.person_id, r.member_role]))
}

/** Friendly text for errors raised by the database guards. */
export function errorMessage(e: unknown): string {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to do that."
  return msg.charAt(0).toUpperCase() + msg.slice(1)
}
