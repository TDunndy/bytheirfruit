// Reports: each call is one logged read of a SECURITY DEFINER function
// (report.<name> in access_log, with the filter and the row count). The
// shapes below mirror the SQL, including the columns that come back null.
import { supabase } from './supabase'
import { isCriteria, matchRooms, nextRoom, type Child, type Criteria, type CutoffSettings, type Room as CoreRoom } from '@btf/core'
import type { CheckinSettings, Occurrence, Room } from './checkin'

export interface OccurrenceRow {
  occurrence_id: string; local_date: string; schedule_name: string; starts_at: string; status: string
  room_id: string | null; room_name: string | null; area_id: string | null; area_name: string | null; area_kind: string | null
  children: number; volunteers: number; attendees: number; first_timers: number; anomalies: number
}
export interface TimelineRow { at: string; room_id: string; room_name: string; children: number; adults: number }
export interface ChildRow {
  person_id: string; first_name: string; last_name: string; preferred_name: string | null
  birthdate: string | null; gender: 'male' | 'female' | null; tags: string[]; custom: Record<string, unknown> | null
  grade_override: number | null; grade_override_year: number | null
  household_id: string | null; household_name: string | null
  attended: number; by_month: Record<string, number>; first_attended: string | null; last_attended: string | null
  last_room_id: string | null; last_room_name: string | null; consecutive_absences: number
}
export interface HistoryRow {
  occurrence_id: string; local_date: string; schedule_name: string; role: string
  first_room_name: string | null; room_name: string | null; checked_in_at: string | null; checked_out_at: string | null
  status: string; pickup_status: string | null; anomalies: string[]
}
export interface FamilyChild { person_id: string; name: string; room_name: string | null }
export interface FamilyRow {
  household_id: string; household_name: string; parents: string[]; children: FamilyChild[]
  checkins: number; baseline: number; total: number; last_seen: string | null
  serves_ytd: number; serving_adult: boolean; flags: string[]
  area_id: string | null; area_name: string | null; exclusion: string | null; over_threshold: boolean
}
export interface VolunteerRow {
  local_date: string; occurrence_id: string; schedule_name: string; person_id: string; name: string
  room_id: string | null; room_name: string | null; slot_label: string | null; role_name: string | null
  scheduled: boolean; assignment_status: string | null; attended: boolean; checked_in_at: string | null
  punctuality: string | null; minutes_vs_expected: number | null
}
export interface OpsRow {
  local_date: string; sessions: number; completed_sessions: number; avg_session_seconds: number | null; checkins: number
  prints: number; reprints: number; print_failures: number; delayed_events: number; offline_sessions: number
  anomalies: number; alerts: number; stations_used: number
}
export interface ArrivalRow { at: string; station_id: string | null; station_name: string | null; sessions: number; checkins: number }

async function rows<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const r = await p
  if (r.error) throw r.error
  return (r.data ?? []) as T[]
}

export const reportOccurrences = (orgId: string, from: string, to: string) =>
  rows<OccurrenceRow>(supabase.rpc('report_occurrences', { p_org_id: orgId, p_from: from, p_to: to }))
export const reportTimeline = (occurrenceId: string, stepMinutes = 5) =>
  rows<TimelineRow>(supabase.rpc('report_occurrence_timeline', { p_occurrence_id: occurrenceId, p_step_minutes: stepMinutes }))
export const reportChildren = (orgId: string, from: string, to: string) =>
  rows<ChildRow>(supabase.rpc('report_children', { p_org_id: orgId, p_from: from, p_to: to }))
export const reportChildHistory = (personId: string) =>
  rows<HistoryRow>(supabase.rpc('report_child_history', { p_person_id: personId }))
export const reportFamilies = (orgId: string, year: number, asOf: string | null, threshold: number) =>
  rows<FamilyRow>(supabase.rpc('report_families', { p_org_id: orgId, p_year: year, p_as_of: asOf ?? undefined, p_threshold: threshold }))
export const reportVolunteers = (orgId: string, from: string, to: string) =>
  rows<VolunteerRow>(supabase.rpc('report_volunteers', { p_org_id: orgId, p_from: from, p_to: to }))
export const reportOps = (orgId: string, from: string, to: string) =>
  rows<OpsRow>(supabase.rpc('report_ops', { p_org_id: orgId, p_from: from, p_to: to }))
export const reportArrivals = (orgId: string, localDate: string, stepMinutes = 5) =>
  rows<ArrivalRow>(supabase.rpc('report_arrivals', { p_org_id: orgId, p_local_date: localDate, p_step_minutes: stepMinutes }))

// ---------------------------------------------------------------- display --
export const EXCLUSIONS: Record<string, string> = {
  pastoral_hold: 'Pastoral hold', exempt: 'Exempt', joining_team: 'Joining the team', serving_elsewhere: 'Serving elsewhere',
  no_longer_attending: 'No longer attending', serving: 'A parent serves', lapsed: 'Not seen in 3 months',
}
export const exclusionLabel = (e: string | null): string => (e ? EXCLUSIONS[e] ?? e : '')

export const PUNCTUALITY: Record<string, string> = {
  early: 'Early', on_time: 'On time', late: 'Late', no_show: 'No-show', unscheduled: 'Walk-up', declined: 'Declined',
}
export const punctualityLabel = (p: string | null): string => (p ? PUNCTUALITY[p] ?? p : 'Pending')

export function childName(r: Pick<ChildRow, 'first_name' | 'last_name' | 'preferred_name'>): string {
  return `${r.preferred_name || r.first_name} ${r.last_name}`.trim()
}

/** 'YYYY-MM' for every month from `from` to `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
    if (out.length > 40) break
  }
  return out
}
export function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
export function fmtShortDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
export function fmtClock(iso: string | null, timeZone?: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }) } catch { return new Date(iso).toLocaleTimeString('en-US') }
}

// ------------------------------------------------------------- volunteers --
export interface VolunteerPerson {
  person_id: string; name: string; serves: number
  byMonth: Record<string, number>; byRoom: Record<string, number>
  early: number; on_time: number; late: number; no_show: number; unscheduled: number
}
export interface VolunteerSummary { people: VolunteerPerson[]; rooms: string[]; months: string[] }

/** Serves per person (one per service, however many needs they filled), by month and room, with punctuality counts. */
export function volunteerSummary(rows: VolunteerRow[], from: string, to: string): VolunteerSummary {
  const people = new Map<string, VolunteerPerson>()
  const seen = new Set<string>()
  const roomSet = new Set<string>()
  const at = (r: VolunteerRow) => {
    let p = people.get(r.person_id)
    if (!p) { p = { person_id: r.person_id, name: r.name, serves: 0, byMonth: {}, byRoom: {}, early: 0, on_time: 0, late: 0, no_show: 0, unscheduled: 0 }; people.set(r.person_id, p) }
    return p
  }
  for (const r of rows) {
    const p = at(r)
    if (r.punctuality === 'no_show') { p.no_show += 1; continue }
    if (!r.attended) continue
    const key = `${r.person_id}:${r.occurrence_id}`
    if (seen.has(key)) continue
    seen.add(key)
    p.serves += 1
    const month = r.local_date.slice(0, 7)
    p.byMonth[month] = (p.byMonth[month] ?? 0) + 1
    const room = r.room_name ?? 'No room'
    roomSet.add(room)
    p.byRoom[room] = (p.byRoom[room] ?? 0) + 1
    if (r.punctuality === 'early' || r.punctuality === 'on_time' || r.punctuality === 'late' || r.punctuality === 'unscheduled') p[r.punctuality] += 1
  }
  return {
    people: Array.from(people.values()).sort((a, b) => b.serves - a.serves || a.name.localeCompare(b.name)),
    rooms: Array.from(roomSet).sort(),
    months: monthsBetween(from, to),
  }
}

// ---------------------------------------------------------------- move-up --
export interface MoveUp {
  child: ChildRow
  from: CoreRoom | null
  to: CoreRoom | null
  on: string
  /** The first service on or after the date, when one is on the calendar. */
  service: Occurrence | null
}

export function cutoffFrom(settings: CheckinSettings | null): CutoffSettings {
  const promotion = settings?.promotion_date ? settings.promotion_date.split('-').map(Number) : null
  return {
    cutoffMonth: settings?.grade_cutoff_month ?? 8, cutoffDay: settings?.grade_cutoff_day ?? 16,
    ...(promotion ? { promotionMonth: promotion[1], promotionDay: promotion[2] } : {}),
  }
}

export function coreRooms(rooms: Room[], kidsAreaIds: Set<string>): CoreRoom[] {
  return rooms
    .filter((r) => r.active && !r.archived_at && kidsAreaIds.has(r.area_id))
    .map((r) => ({
      id: r.id, name: r.name, area_id: r.area_id, priority: r.priority, capacity: r.capacity, children_per_adult: r.children_per_adult,
      overflow_room_id: r.overflow_room_id, active: r.active,
      criteria: (isCriteria(r.criteria) ? r.criteria : { manual_only: true, rules: [] }) as Criteria,
    }))
}

export function childFor(r: ChildRow): Child {
  return {
    birthdate: r.birthdate, gender: r.gender ?? null, tags: r.tags ?? [], custom: (r.custom ?? {}) as Record<string, unknown>,
    gradeOverride: r.grade_override !== null && r.grade_override_year !== null ? { grade: r.grade_override, year: r.grade_override_year } : null,
  }
}

/** Children whose room changes on or before `through`, with the date and the first service after it. */
export function moveUps(children: ChildRow[], rooms: CoreRoom[], settings: CutoffSettings, today: string, through: string, occurrences: Occurrence[]): MoveUp[] {
  const ctx = { on: today, settings }
  const services = occurrences.filter((o) => o.status !== 'cancelled').sort((a, b) => a.local_date.localeCompare(b.local_date))
  const out: MoveUp[] = []
  for (const child of children) {
    if (!child.birthdate && child.grade_override === null) continue
    const c = childFor(child)
    const from = matchRooms(c, rooms, ctx)[0] ?? null
    const nr = nextRoom(c, rooms, ctx, 24)
    if (!nr.on || nr.on > through) continue
    out.push({ child, from, to: nr.room, on: nr.on, service: services.find((o) => o.local_date >= nr.on!) ?? null })
  }
  return out.sort((a, b) => a.on.localeCompare(b.on) || a.child.last_name.localeCompare(b.child.last_name))
}
