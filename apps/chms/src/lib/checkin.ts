// Check-in configuration: settings, areas and rooms, schedules and
// occurrences, volunteers, printers and labels, stations, baselines.
// Every query goes through RLS; the UI only hides what a role cannot do.
import { supabase } from './supabase'
import type { Database } from '@db/database.types'
import type { Criteria } from '@btf/core'

type Tables = Database['public']['Tables']
export type CheckinSettings = Tables['org_checkin_settings']['Row']
export type Area = Tables['areas']['Row']
export type Room = Tables['rooms']['Row']
export type AreaLeader = Tables['area_leaders']['Row']
export type RoomLeader = Tables['room_leaders']['Row']
export type Schedule = Tables['schedules']['Row']
export type ScheduleRoom = Tables['schedule_rooms']['Row']
export type Occurrence = Tables['occurrences']['Row']
export type VolunteerSlot = Tables['volunteer_slots']['Row']
export type VolunteerAssignment = Tables['volunteer_assignments']['Row']
export type Printer = Tables['printers']['Row']
export type LabelTemplate = Tables['label_templates']['Row']
export type Station = Tables['stations']['Row']
export type StationScope = Tables['station_scopes']['Row']
export type Baseline = Tables['attendance_baselines']['Row']
export type RoomOverride = Tables['room_overrides']['Row']
export type Restriction = Tables['checkin_restrictions']['Row']

export const AREA_KINDS: { value: Area['kind']; label: string }[] = [
  { value: 'kids', label: 'Kids' }, { value: 'volunteer', label: 'Volunteers' }, { value: 'event', label: 'Events' },
  { value: 'group', label: 'Groups' }, { value: 'general', label: 'General' },
]
export const SCHEDULE_KINDS: { value: Schedule['kind']; label: string }[] = [
  { value: 'service', label: 'Service' }, { value: 'class', label: 'Class' }, { value: 'event', label: 'Event' },
  { value: 'group', label: 'Group' }, { value: 'other', label: 'Other' },
]
export const STATION_MODES: { value: Station['mode']; label: string; help: string }[] = [
  { value: 'kiosk', label: 'Self-serve kiosk', help: 'Parents check in by phone number or scan' },
  { value: 'staffed', label: 'Staffed desk', help: 'A volunteer runs it; last-4 lookup and guest add' },
  { value: 'roster', label: 'Room roster', help: 'A classroom device: live roster, move, check out' },
  { value: 'volunteer', label: 'Volunteer check-in', help: 'Volunteers check in; own label stock' },
]
export const PRINTER_CONNECTIONS: { value: Printer['connection']; label: string }[] = [
  { value: 'wifi', label: 'Wi-Fi' }, { value: 'bluetooth', label: 'Bluetooth' }, { value: 'usb', label: 'USB' }, { value: 'system', label: 'System printer' },
]
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const label = <T extends string>(list: { value: T; label: string }[], value: T): string => list.find((x) => x.value === value)?.label ?? value

function one<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error
  if (r.data === null) throw new Error('Nothing came back.')
  return r.data
}
function many<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw r.error
  return r.data ?? []
}

// -------------------------------------------------------------- settings --
export async function getSettings(orgId: string): Promise<CheckinSettings | null> {
  const r = await supabase.from('org_checkin_settings').select('*').eq('org_id', orgId).maybeSingle()
  if (r.error) throw r.error
  return r.data
}

export async function saveSettings(orgId: string, patch: Omit<Tables['org_checkin_settings']['Insert'], 'org_id'>): Promise<CheckinSettings> {
  return one(await supabase.from('org_checkin_settings').upsert({ org_id: orgId, ...patch }, { onConflict: 'org_id' }).select('*').single())
}

/** The browser's best guess at the church's zone, for a first-time setup. */
export function guessTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' } catch { return 'America/New_York' }
}

// -------------------------------------------------------- areas and rooms --
export async function listAreas(orgId: string, includeArchived = false): Promise<Area[]> {
  let q = supabase.from('areas').select('*').eq('org_id', orgId).order('sort_order').order('name')
  if (!includeArchived) q = q.is('archived_at', null)
  return many(await q)
}

export async function saveArea(orgId: string, area: Partial<Area> & { name: string; kind: Area['kind'] }): Promise<Area> {
  // age_band is an int4range ('[0,72)' in months); the generated type calls it unknown
  const row = { name: area.name, kind: area.kind, sort_order: area.sort_order ?? 0, age_band: (area.age_band ?? null) as never }
  if (area.id) {
    return one(await supabase.from('areas').update(row).eq('id', area.id).select('*').single())
  }
  return one(await supabase.from('areas').insert({ org_id: orgId, ...row }).select('*').single())
}

export async function archiveArea(id: string, archived: boolean) {
  const { error } = await supabase.from('areas').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id)
  if (error) throw error
}

export async function listRooms(orgId: string, includeArchived = false): Promise<Room[]> {
  let q = supabase.from('rooms').select('*').eq('org_id', orgId).order('priority').order('name')
  if (!includeArchived) q = q.is('archived_at', null)
  return many(await q)
}

export interface RoomInput {
  id?: string
  area_id: string
  name: string
  capacity: number | null
  children_per_adult: number | null
  overflow_room_id: string | null
  priority: number
  criteria: Criteria
  active: boolean
}

export async function saveRoom(orgId: string, room: RoomInput): Promise<Room> {
  const row = {
    area_id: room.area_id, name: room.name, capacity: room.capacity, children_per_adult: room.children_per_adult,
    overflow_room_id: room.overflow_room_id, priority: room.priority, criteria: room.criteria as unknown as Room['criteria'], active: room.active,
  }
  if (room.id) return one(await supabase.from('rooms').update(row).eq('id', room.id).select('*').single())
  return one(await supabase.from('rooms').insert({ org_id: orgId, ...row }).select('*').single())
}

export async function archiveRoom(id: string, archived: boolean) {
  const { error } = await supabase.from('rooms').update({ archived_at: archived ? new Date().toISOString() : null, active: !archived }).eq('id', id)
  if (error) throw error
}

export async function listAreaLeaders(orgId: string): Promise<AreaLeader[]> {
  return many(await supabase.from('area_leaders').select('*').eq('org_id', orgId))
}
export async function addAreaLeader(orgId: string, areaId: string, who: { personId?: string; roleId?: string }, kind: 'director' | 'leader') {
  const { error } = await supabase.from('area_leaders').insert({ org_id: orgId, area_id: areaId, person_id: who.personId ?? null, role_id: who.roleId ?? null, kind })
  if (error) throw error
}
export async function removeAreaLeader(id: string) {
  const { error } = await supabase.from('area_leaders').delete().eq('id', id)
  if (error) throw error
}
export async function listRoomLeaders(orgId: string): Promise<RoomLeader[]> {
  return many(await supabase.from('room_leaders').select('*').eq('org_id', orgId))
}
export async function addRoomLeader(orgId: string, roomId: string, who: { personId?: string; roleId?: string }, kind: 'director' | 'leader') {
  const { error } = await supabase.from('room_leaders').insert({ org_id: orgId, room_id: roomId, person_id: who.personId ?? null, role_id: who.roleId ?? null, kind })
  if (error) throw error
}
export async function removeRoomLeader(id: string) {
  const { error } = await supabase.from('room_leaders').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------- schedules --
export async function listSchedules(orgId: string, includeArchived = false): Promise<Schedule[]> {
  let q = supabase.from('schedules').select('*').eq('org_id', orgId).order('local_time').order('name')
  if (!includeArchived) q = q.is('archived_at', null)
  return many(await q)
}

export interface ScheduleInput {
  id?: string
  name: string
  kind: Schedule['kind']
  local_time: string
  duration_minutes: number
  weekdays: number[]
  interval_weeks: number
  starts_on: string
  until: string | null
  exdates: string[]
  active: boolean
}

export async function saveSchedule(orgId: string, s: ScheduleInput): Promise<Schedule> {
  const row = {
    name: s.name, kind: s.kind, local_time: s.local_time, duration_minutes: s.duration_minutes, weekdays: s.weekdays,
    interval_weeks: s.interval_weeks, starts_on: s.starts_on, until: s.until, exdates: s.exdates, active: s.active,
  }
  if (s.id) return one(await supabase.from('schedules').update(row).eq('id', s.id).select('*').single())
  return one(await supabase.from('schedules').insert({ org_id: orgId, ...row }).select('*').single())
}

export async function archiveSchedule(id: string, archived: boolean) {
  const { error } = await supabase.from('schedules').update({ archived_at: archived ? new Date().toISOString() : null, active: !archived }).eq('id', id)
  if (error) throw error
}

export async function listScheduleRooms(orgId: string): Promise<ScheduleRoom[]> {
  return many(await supabase.from('schedule_rooms').select('*').eq('org_id', orgId))
}
export async function setScheduleRooms(orgId: string, scheduleId: string, roomIds: string[]) {
  const current = await supabase.from('schedule_rooms').select('id, room_id').eq('schedule_id', scheduleId)
  if (current.error) throw current.error
  const have = new Set((current.data ?? []).map((r) => r.room_id))
  const gone = (current.data ?? []).filter((r) => !roomIds.includes(r.room_id)).map((r) => r.id)
  const add = roomIds.filter((r) => !have.has(r)).map((room_id) => ({ org_id: orgId, schedule_id: scheduleId, room_id }))
  if (gone.length) { const { error } = await supabase.from('schedule_rooms').delete().in('id', gone); if (error) throw error }
  if (add.length) { const { error } = await supabase.from('schedule_rooms').insert(add); if (error) throw error }
}

export async function listOccurrences(orgId: string, from: string, through: string): Promise<Occurrence[]> {
  return many(await supabase.from('occurrences').select('*').eq('org_id', orgId).gte('local_date', from).lte('local_date', through).order('starts_at'))
}

/** Makes occurrences for every active schedule; returns how many were new. */
export async function generateOccurrences(orgId: string, through: string, from?: string): Promise<number> {
  const { data, error } = await supabase.rpc('generate_occurrences', { p_org_id: orgId, p_through: through, ...(from ? { p_from: from } : {}) })
  if (error) throw error
  return data ?? 0
}

export async function setOccurrenceStatus(id: string, status: 'scheduled' | 'cancelled' | 'open', note?: string | null) {
  const { error } = await supabase.from('occurrences').update({ status, ...(note !== undefined ? { note } : {}) }).eq('id', id)
  if (error) throw error
}

export async function closeOccurrence(id: string) {
  const { error } = await supabase.rpc('close_occurrence', { p_occurrence_id: id })
  if (error) throw error
}

// ------------------------------------------------------------ volunteers --
export async function listSlots(orgId: string): Promise<VolunteerSlot[]> {
  return many(await supabase.from('volunteer_slots').select('*').eq('org_id', orgId).is('archived_at', null).order('created_at'))
}

export interface SlotInput {
  id?: string
  schedule_id: string | null
  occurrence_id: string | null
  room_id: string | null
  role_id: string | null
  label: string | null
  needed: number
  arrive_minutes_before: number
}

export async function saveSlot(orgId: string, s: SlotInput): Promise<VolunteerSlot> {
  const row = { schedule_id: s.schedule_id, occurrence_id: s.occurrence_id, room_id: s.room_id, role_id: s.role_id, label: s.label, needed: s.needed, arrive_minutes_before: s.arrive_minutes_before }
  if (s.id) return one(await supabase.from('volunteer_slots').update(row).eq('id', s.id).select('*').single())
  return one(await supabase.from('volunteer_slots').insert({ org_id: orgId, ...row }).select('*').single())
}

export async function archiveSlot(id: string) {
  const { error } = await supabase.from('volunteer_slots').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listAssignments(orgId: string, from: string, through: string): Promise<VolunteerAssignment[]> {
  return many(await supabase.from('volunteer_assignments').select('*').eq('org_id', orgId).gte('local_date', from).lte('local_date', through).order('local_date'))
}

export async function addAssignment(orgId: string, slotId: string, personId: string, localDate: string) {
  const { error } = await supabase.from('volunteer_assignments').insert({ org_id: orgId, slot_id: slotId, person_id: personId, local_date: localDate })
  if (error) throw error
}

export async function setAssignmentStatus(id: string, status: VolunteerAssignment['status']) {
  const { error } = await supabase.from('volunteer_assignments').update({ status }).eq('id', id)
  if (error) throw error
}

// ----------------------------------------------------- printers and labels --
export async function listPrinters(orgId: string): Promise<Printer[]> {
  return many(await supabase.from('printers').select('*').eq('org_id', orgId).is('archived_at', null).order('name'))
}

export interface PrinterInput {
  id?: string
  name: string
  model: string | null
  connection: Printer['connection']
  address: string | null
  stock: string
  area_id: string | null
  active: boolean
}

export async function savePrinter(orgId: string, p: PrinterInput): Promise<Printer> {
  const row = { name: p.name, model: p.model, connection: p.connection, address: p.address, stock: p.stock, area_id: p.area_id, active: p.active }
  if (p.id) return one(await supabase.from('printers').update(row).eq('id', p.id).select('*').single())
  return one(await supabase.from('printers').insert({ org_id: orgId, ...row }).select('*').single())
}

export async function archivePrinter(id: string) {
  const { error } = await supabase.from('printers').update({ archived_at: new Date().toISOString(), active: false }).eq('id', id)
  if (error) throw error
}

export async function listTemplates(orgId: string): Promise<LabelTemplate[]> {
  return many(await supabase.from('label_templates').select('*').eq('org_id', orgId).is('archived_at', null).order('kind').order('name'))
}

export interface TemplateInput {
  id?: string
  name: string
  kind: LabelTemplate['kind']
  stock: string
  width_mm: number
  height_mm: number
  layout: unknown
  is_default: boolean
}

export async function saveTemplate(orgId: string, t: TemplateInput): Promise<LabelTemplate> {
  const row = { name: t.name, kind: t.kind, stock: t.stock, width_mm: t.width_mm, height_mm: t.height_mm, layout: t.layout as LabelTemplate['layout'], is_default: t.is_default }
  // One default per kind: the previous default steps aside first, and steps back if the save fails.
  let previous: string | null = null
  if (t.is_default) {
    const prev = await supabase.from('label_templates').select('id').eq('org_id', orgId).eq('kind', t.kind).eq('is_default', true).neq('id', t.id ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
    if (prev.error) throw prev.error
    previous = prev.data?.id ?? null
    if (previous) { const { error } = await supabase.from('label_templates').update({ is_default: false }).eq('id', previous); if (error) throw error }
  }
  try {
    if (t.id) return one(await supabase.from('label_templates').update(row).eq('id', t.id).select('*').single())
    return one(await supabase.from('label_templates').insert({ org_id: orgId, ...row }).select('*').single())
  } catch (e) {
    if (previous) await supabase.from('label_templates').update({ is_default: true }).eq('id', previous)
    throw e
  }
}

export async function archiveTemplate(id: string) {
  const { error } = await supabase.from('label_templates').update({ archived_at: new Date().toISOString(), is_default: false }).eq('id', id)
  if (error) throw error
}

// -------------------------------------------------------------- stations --
export async function listStations(orgId: string): Promise<Station[]> {
  return many(await supabase.from('stations').select('*').eq('org_id', orgId).is('archived_at', null).order('name'))
}

export interface StationInput {
  id?: string
  name: string
  mode: Station['mode']
  printer_id: string | null
  label_stock: string | null
  active: boolean
}

export async function saveStation(orgId: string, s: StationInput): Promise<Station> {
  const row = { name: s.name, mode: s.mode, printer_id: s.printer_id, label_stock: s.label_stock, active: s.active }
  if (s.id) return one(await supabase.from('stations').update(row).eq('id', s.id).select('*').single())
  return one(await supabase.from('stations').insert({ org_id: orgId, ...row }).select('*').single())
}

export async function archiveStation(id: string) {
  const { error } = await supabase.from('stations').update({ archived_at: new Date().toISOString(), active: false }).eq('id', id)
  if (error) throw error
}

export async function listStationScopes(orgId: string): Promise<StationScope[]> {
  return many(await supabase.from('station_scopes').select('*').eq('org_id', orgId))
}

/** Replaces a station's scope: whole areas and single rooms. Empty means every room. */
export async function setStationScope(orgId: string, stationId: string, areaIds: string[], roomIds: string[]) {
  const current = await supabase.from('station_scopes').select('id, area_id, room_id').eq('station_id', stationId)
  if (current.error) throw current.error
  const rows = current.data ?? []
  const gone = rows.filter((r) => (r.area_id && !areaIds.includes(r.area_id)) || (r.room_id && !roomIds.includes(r.room_id))).map((r) => r.id)
  const haveAreas = new Set(rows.map((r) => r.area_id).filter(Boolean))
  const haveRooms = new Set(rows.map((r) => r.room_id).filter(Boolean))
  const add = [
    ...areaIds.filter((a) => !haveAreas.has(a)).map((area_id) => ({ org_id: orgId, station_id: stationId, area_id })),
    ...roomIds.filter((r) => !haveRooms.has(r)).map((room_id) => ({ org_id: orgId, station_id: stationId, room_id })),
  ]
  if (gone.length) { const { error } = await supabase.from('station_scopes').delete().in('id', gone); if (error) throw error }
  if (add.length) { const { error } = await supabase.from('station_scopes').insert(add); if (error) throw error }
}

// ---------------------------------------------------------------- pairing --
export type PairingStatus = Database['public']['Functions']['station_pairing_status']['Returns'][number]

/** Paired or not, last seen, and a live pairing code's expiry, per station. Never an account id. */
export async function pairingStatus(orgId: string): Promise<PairingStatus[]> {
  return many(await supabase.rpc('station_pairing_status', { p_org_id: orgId }))
}

/** A fresh eight-character pairing code for a station (ten minutes, one use). The previous unused code dies. */
export async function createPairingCode(stationId: string): Promise<string> {
  return one(await supabase.rpc('create_pairing_code', { p_station_id: stationId }))
}

/** 'ABCDEFGH' → 'ABCD-EFGH' for reading out. */
export function fmtPairingCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/** Unpairs the device on a station: the pairing row is revoked in Postgres and the edge function bans its account. */
export async function unpairStation(stationId: string) {
  const { data, error } = await supabase.functions.invoke('pair-station', { body: { action: 'unpair', station_id: stationId } })
  if (error) throw new Error((await functionError(error)) ?? 'Could not unpair the device.')
  if (!data?.ok) throw new Error(data?.error ?? 'Could not unpair the device.')
}

async function functionError(e: unknown): Promise<string | null> {
  const ctx = typeof e === 'object' && e && 'context' in e ? (e as { context?: Response }).context : undefined
  if (ctx && typeof ctx.json === 'function') {
    try { const body = await ctx.json(); if (body && typeof body.error === 'string') return body.error } catch { /* not json */ }
  }
  return null
}

/** Sets the signed-in leader's own station PIN (4 to 8 digits). */
export async function setMyStaffPin(orgId: string, pin: string) {
  const { error } = await supabase.rpc('set_my_staff_pin', { p_org_id: orgId, p_pin: pin })
  if (error) throw error
}

// ------------------------------------------------------------- baselines --
export async function listBaselines(orgId: string, year: number): Promise<Baseline[]> {
  return many(await supabase.from('attendance_baselines').select('*').eq('org_id', orgId).eq('year', year))
}

export async function saveBaseline(orgId: string, householdId: string, year: number, count: number, note: string | null, lastAttendedOn: string | null = null) {
  const { error } = await supabase.from('attendance_baselines')
    .upsert({ org_id: orgId, household_id: householdId, year, count, note, last_attended_on: lastAttendedOn }, { onConflict: 'household_id,year' })
  if (error) throw error
}

// ----------------------------------------------- overrides and restrictions --
export async function overridesFor(personId: string): Promise<RoomOverride[]> {
  return many(await supabase.from('room_overrides').select('*').eq('person_id', personId).is('archived_at', null))
}
export async function setOverride(orgId: string, personId: string, roomId: string, endsOn: string | null, note: string | null) {
  const { error: endErr } = await supabase.from('room_overrides').update({ archived_at: new Date().toISOString() }).eq('person_id', personId).is('archived_at', null)
  if (endErr) throw endErr
  const { error } = await supabase.from('room_overrides').insert({ org_id: orgId, person_id: personId, room_id: roomId, ends_on: endsOn, note })
  if (error) throw error
}
export async function clearOverride(id: string) {
  const { error } = await supabase.from('room_overrides').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function restrictionsFor(personId: string): Promise<Restriction[]> {
  return many(await supabase.from('checkin_restrictions').select('*').eq('person_id', personId).order('created_at', { ascending: false }))
}
export async function addRestriction(orgId: string, personId: string, kind: Restriction['kind'], note: string | null, endsOn: string | null) {
  const { error } = await supabase.from('checkin_restrictions').insert({ org_id: orgId, person_id: personId, kind, note, ends_on: endsOn })
  if (error) throw error
}
export async function clearRestriction(id: string) {
  const { error } = await supabase.from('checkin_restrictions').update({ cleared_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------- display --
export function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const d = new Date(2000, 0, 1, h, m)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function fmtWeekdays(days: number[]): string {
  return [...days].sort().map((d) => WEEKDAYS[d]).join(', ')
}

export function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function fmtInstant(iso: string, timeZone?: string | null): string {
  try {
    return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) })
  } catch {
    return new Date(iso).toLocaleString('en-US')
  }
}

/** '5 min ago', 'yesterday', or the date, for last-seen stamps. */
export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d} days ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Today as 'YYYY-MM-DD' in the church's zone (the browser's when none is known). */
export function todayIn(timeZone?: string | null): string {
  try {
    if (timeZone) return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch { /* unknown zone: fall through */ }
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A 'YYYY-MM-DD' date n days from a date (today in the browser's zone by default). */
export function dayOffset(n: number, from?: Date | string): string {
  const base = typeof from === 'string' ? new Date(from + 'T00:00:00') : (from ?? new Date())
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ------------------------------------------------------- directory helpers --
export interface PreviewPerson {
  id: string
  first_name: string
  last_name: string
  birthdate: string | null
  gender: string | null
  tags: string[]
  custom: unknown
  grade_override: number | null
  grade_override_year: number | null
}

/** Children with a birthdate, for "who would land here" previews (needs kids.view). */
export async function previewPeople(orgId: string): Promise<PreviewPerson[]> {
  const { data, error } = await supabase
    .from('people')
    .select('id, first_name, last_name, birthdate, gender, tags, custom, grade_override, grade_override_year')
    .eq('org_id', orgId).is('archived_at', null).not('birthdate', 'is', null)
    .order('birthdate', { ascending: false }).limit(2000)
  if (error) throw error
  return data ?? []
}

export async function listHouseholds(orgId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('households').select('id, name').eq('org_id', orgId).is('archived_at', null).order('name').limit(2000)
  if (error) throw error
  return data ?? []
}
