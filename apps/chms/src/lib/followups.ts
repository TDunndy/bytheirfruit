// Follow-ups: the tasks a first-time family (or staff) opens, who they go to,
// and closing them. RLS decides who sees what: check-in managers, the
// assignee (person or role) and the directors and leaders of the task's area.
import { supabase } from './supabase'
import type { Database } from '@db/database.types'
import { listAreas, listOccurrences, listRooms, listSchedules, type Area } from './checkin'
import { age, displayName, listRoles, type OrgRole, type Person } from './people'

type Tables = Database['public']['Tables']
export type Task = Tables['tasks']['Row']
export type TaskStatus = Task['status']

export const SOURCE_LABEL: Record<Task['source'], string> = { checkin: 'Checked in', form: 'Signed up online', staff: 'Marked by staff', rule: 'Rule' }

function many<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw r.error
  return r.data ?? []
}

export async function listTasks(orgId: string, status: 'open' | 'closed'): Promise<Task[]> {
  let q = supabase.from('tasks').select('*').eq('org_id', orgId)
  q = status === 'open' ? q.eq('status', 'open').order('opened_at', { ascending: false }) : q.neq('status', 'open').order('closed_at', { ascending: false }).limit(100)
  return many(await q)
}

export async function tasksForHousehold(householdId: string): Promise<Task[]> {
  return many(await supabase.from('tasks').select('*').eq('subject_household_id', householdId).order('opened_at', { ascending: false }))
}

export async function closeTask(id: string, status: 'done' | 'dismissed', note: string | null) {
  const { error } = await supabase.from('tasks').update({ status, close_note: note }).eq('id', id)
  if (error) throw error
}

export async function reassignTask(id: string, to: { personId?: string | null; roleId?: string | null }) {
  const { error } = await supabase.from('tasks').update({ assignee_person_id: to.personId ?? null, assignee_role_id: to.roleId ?? null }).eq('id', id)
  if (error) throw error
}

/** Opens (or returns) the first-visit task for a family, or for a person with no family. */
export async function markFirstVisit(subject: { householdId?: string; personId?: string }): Promise<string> {
  const { data, error } = await supabase.rpc('mark_first_visit', { p_household_id: subject.householdId ?? undefined, p_person_id: subject.personId ?? undefined })
  if (error) throw error
  return data as string
}

export interface TaskChild { id: string; name: string; age: number | null }
export interface TaskContext {
  householdName: Map<string, string>
  personName: Map<string, string>
  children: Map<string, TaskChild[]>   // by household id
  areaName: Map<string, string>
  roleName: Map<string, string>
  roomName: Map<string, string>
  serviceName: Map<string, string>     // occurrence id → "9:00 service · Nov 2"
  roles: OrgRole[]
  areas: Area[]
}

/** The names a task list needs, fetched once for the batch (what the caller may read). */
export async function taskContext(orgId: string, tasks: Task[]): Promise<TaskContext> {
  const householdIds = unique(tasks.map((t) => t.subject_household_id))
  const occIds = unique(tasks.map((t) => (t.detail as { occurrence_id?: string } | null)?.occurrence_id))
  const [households, members, areas, roles, rooms, schedules, occurrences] = await Promise.all([
    householdIds.length ? many(await supabase.from('households').select('id, name').in('id', householdIds)) : Promise.resolve([] as { id: string; name: string }[]),
    householdIds.length ? many(await supabase.from('household_members').select('household_id, person_id, relationship').in('household_id', householdIds).is('ended_at', null)) : Promise.resolve([] as { household_id: string; person_id: string; relationship: string }[]),
    listAreas(orgId, true), listRoles(orgId), listRooms(orgId, true), listSchedules(orgId, true),
    occIds.length ? many(await supabase.from('occurrences').select('id, schedule_id, local_date').in('id', occIds)) : Promise.resolve([] as { id: string; schedule_id: string; local_date: string }[]),
  ])
  const personIds = unique([
    ...members.map((m) => m.person_id), ...tasks.map((t) => t.subject_person_id), ...tasks.map((t) => t.assignee_person_id),
    ...tasks.map((t) => t.opened_by_person_id), ...tasks.map((t) => t.closed_by_person_id),
  ])
  const people: Person[] = personIds.length ? many(await supabase.from('people').select('*').in('id', personIds)) : []
  const personById = new Map(people.map((p) => [p.id, p]))
  const children = new Map<string, TaskChild[]>()
  for (const m of members) {
    const p = personById.get(m.person_id)
    if (!p || m.relationship !== 'child') continue
    children.set(m.household_id, [...(children.get(m.household_id) ?? []), { id: p.id, name: p.first_name, age: age(p.birthdate) }])
  }
  const scheduleName = new Map(schedules.map((s) => [s.id, s.name]))
  return {
    householdName: new Map(households.map((h) => [h.id, h.name])),
    personName: new Map(people.map((p) => [p.id, displayName(p)])),
    children,
    areaName: new Map(areas.map((a) => [a.id, a.name])),
    roleName: new Map(roles.map((r) => [r.id, r.name])),
    roomName: new Map(rooms.map((r) => [r.id, r.name])),
    serviceName: new Map(occurrences.map((o) => [o.id, `${scheduleName.get(o.schedule_id) ?? 'Service'} · ${fmtDate(o.local_date)}`])),
    roles, areas,
  }
}

export function assigneeText(t: Task, ctx: TaskContext): string {
  if (t.assignee_person_id) return ctx.personName.get(t.assignee_person_id) ?? 'Someone'
  if (t.assignee_role_id) return `${ctx.roleName.get(t.assignee_role_id) ?? 'A role'} (any)`
  return 'Unassigned'
}

export function arrivedText(t: Task, ctx: TaskContext): string {
  const d = (t.detail ?? {}) as { room_id?: string; occurrence_id?: string }
  if (t.source === 'checkin') {
    const room = d.room_id ? ctx.roomName.get(d.room_id) : null
    const svc = d.occurrence_id ? ctx.serviceName.get(d.occurrence_id) : null
    return ['Checked in', room ? `to ${room}` : null, svc ? `· ${svc}` : null].filter(Boolean).join(' ')
  }
  if (t.source === 'staff') return `Marked by ${t.opened_by_person_id ? ctx.personName.get(t.opened_by_person_id) ?? 'staff' : 'staff'} · ${fmtDate(t.opened_at.slice(0, 10))}`
  return `${SOURCE_LABEL[t.source]} · ${fmtDate(t.opened_at.slice(0, 10))}`
}

export function fmtDate(d: string): string {
  return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function unique(ids: (string | null | undefined)[]): string[] {
  return Array.from(new Set(ids.filter((x): x is string => !!x)))
}

// -------------------------------------------------------------- age bands --
/** '[0,72)' → { from: 0, to: 72 } (months; the upper bound is exclusive). */
export function parseBand(v: unknown): { from: number; to: number } | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^[\[(]\s*(\d+)\s*,\s*(\d+)\s*[\])]$/)
  if (!m) return null
  const from = Number(m[1]), to = Number(m[2]) + (v.endsWith(']') ? 1 : 0)
  return { from: v.startsWith('(') ? from + 1 : from, to }
}
export function bandText(v: unknown): string | null {
  const b = parseBand(v)
  if (!b) return null
  const y = (m: number) => (m % 12 === 0 ? `${m / 12} yr` : `${m} mo`)
  return `${y(b.from)} – ${y(b.to)}`
}
