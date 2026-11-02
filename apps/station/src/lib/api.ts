// Every call the station makes. Reads go through RPCs that log once per
// call and return ids, first names and last initials; writes go through
// ingest() from the outbox (see outbox.ts).
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, APP_VERSION } from './supabase'
import type {
  AlertRow, AreaRow, AttendanceRow, HouseholdView, LabelTemplateRow, LookupMethod, LookupResult, OccurrenceRow, PickupList, PrinterRow,
  RoomRow, RosterRow, ScheduleRow, StaffPerson, StaffPermission, StationSelf, VolunteersResult,
} from './types'

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  if (r.data === null || r.data === undefined) throw new Error('Nothing came back.')
  return r.data
}
function rows<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(r.error.message)
  return r.data ?? []
}

export function platform(): string {
  const ua = navigator.userAgent
  if (/iPad|Macintosh/.test(ua) && 'ontouchend' in document) return 'ipad-web'
  if (/Android/.test(ua)) return 'android-web'
  if (/Windows/.test(ua)) return 'windows-web'
  if (/Macintosh/.test(ua)) return 'mac-web'
  return 'web'
}

// --------------------------------------------------------------- pairing --
export async function pair(code: string): Promise<{ session: { access_token: string; refresh_token: string }; station: { id: string; name: string; mode: string } }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pair-station`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ action: 'pair', code, platform: platform(), app_version: APP_VERSION }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok) throw new Error(body.error ?? 'Could not pair this device.')
  const { error } = await supabase.auth.setSession({ access_token: body.session.access_token, refresh_token: body.session.refresh_token })
  if (error) throw new Error(error.message)
  return body
}

export async function stationSelf(): Promise<StationSelf | null> {
  const { data, error } = await supabase.rpc('station_self')
  if (error) throw new Error(error.message)
  return (data as StationSelf | null) ?? null
}

export async function heartbeat() {
  await supabase.rpc('station_heartbeat', { p_platform: platform(), p_app_version: APP_VERSION })
}

/** Unpairs this device (after a staff PIN) and signs out everywhere, which revokes its refresh token. */
export async function unpairSelf() {
  const { error } = await supabase.rpc('station_unpair_self')
  if (error) throw new Error(error.message)
  await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined)
  localStorage.clear()
}

export async function signOutLocal() {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  localStorage.clear()
}

// --------------------------------------------------------------- the day --
export async function listOccurrences(localDate: string): Promise<OccurrenceRow[]> {
  return rows(await supabase.from('occurrences').select('*').eq('local_date', localDate).neq('status', 'cancelled').order('starts_at'))
}
export async function listSchedules(): Promise<ScheduleRow[]> {
  return rows(await supabase.from('schedules').select('*').is('archived_at', null))
}
export async function listScheduleRooms(): Promise<{ schedule_id: string; room_id: string }[]> {
  return rows(await supabase.from('schedule_rooms').select('schedule_id, room_id'))
}
export async function listRooms(): Promise<RoomRow[]> {
  return rows(await supabase.from('rooms').select('*').is('archived_at', null).eq('active', true).order('priority'))
}
export async function listAreas(): Promise<AreaRow[]> {
  return rows(await supabase.from('areas').select('*').is('archived_at', null))
}
export async function listTemplates(): Promise<LabelTemplateRow[]> {
  return rows(await supabase.from('label_templates').select('*').is('archived_at', null))
}
export async function listPrinters(): Promise<PrinterRow[]> {
  return rows(await supabase.from('printers').select('*').is('archived_at', null))
}

// ------------------------------------------------------------------ codes --
export async function allocateCodes(localDate: string, n: number): Promise<string[]> {
  return must(await supabase.rpc('allocate_codes', { p_local_date: localDate, p_n: n }))
}
/** The station's unissued codes for the day, so a reloaded browser keeps its block. */
export async function heldCodes(stationId: string, localDate: string): Promise<string[]> {
  const r = await supabase.from('security_codes').select('code').eq('station_id', stationId).eq('local_date', localDate).is('session_id', null).is('issued_at', null)
  return rows(r).map((x) => x.code)
}

// -------------------------------------------------------------- lookups --
export async function lookup(query: string, method: LookupMethod): Promise<LookupResult> {
  return must(await supabase.rpc('station_lookup', { p_query: query, p_method: method })) as unknown as LookupResult
}
export async function household(id: string): Promise<HouseholdView> {
  return must(await supabase.rpc('station_household', { p_household_id: id })) as unknown as HouseholdView
}
export async function pickups(personId: string): Promise<PickupList> {
  return must(await supabase.rpc('station_pickups', { p_person_id: personId })) as unknown as PickupList
}
export async function volunteers(): Promise<VolunteersResult> {
  return must(await supabase.rpc('station_volunteers')) as unknown as VolunteersResult
}
export async function roster(occurrenceId: string, roomId: string): Promise<RosterRow[]> {
  return rows(await supabase.rpc('roster', { p_occurrence_id: occurrenceId, p_room_id: roomId })) as RosterRow[]
}
/** Counts per room for the day's occurrences (the rows a station may read: its rooms). */
export async function attendanceToday(occurrenceIds: string[]): Promise<Pick<AttendanceRow, 'occurrence_id' | 'person_id' | 'room_id' | 'status' | 'role' | 'rev'>[]> {
  if (occurrenceIds.length === 0) return []
  return rows(await supabase.from('attendance').select('occurrence_id, person_id, room_id, status, role, rev').in('occurrence_id', occurrenceIds).neq('status', 'none'))
}
export async function attendanceSince(rev: number): Promise<Pick<AttendanceRow, 'occurrence_id' | 'person_id' | 'room_id' | 'status' | 'role' | 'rev'>[]> {
  return rows(await supabase.from('attendance').select('occurrence_id, person_id, room_id, status, role, rev').gt('rev', Math.max(0, rev - 1000)).neq('status', 'none'))
}

// ---------------------------------------------------------------- alerts --
export async function openAlerts(): Promise<AlertRow[]> {
  return rows(await supabase.from('station_alerts').select('*').is('acknowledged_at', null).order('raised_at', { ascending: false }).limit(50))
}

// ------------------------------------------------------------------ staff --
export async function staffList(): Promise<StaffPerson[]> {
  return rows(await supabase.rpc('station_staff')) as StaffPerson[]
}
export async function verifyPin(personId: string, pin: string): Promise<{ ok: true; person_id: string; permissions: StaffPermission[] } | { ok: false; error: string }> {
  return must(await supabase.rpc('verify_staff_pin', { p_person_id: personId, p_pin: pin })) as unknown as { ok: true; person_id: string; permissions: StaffPermission[] } | { ok: false; error: string }
}

// ----------------------------------------------------------------- ingest --
export type IngestStatus = 'accepted' | 'duplicate' | 'retry' | 'rejected'
export interface IngestResult { id: string; op: string; status: IngestStatus; reason?: string; detail?: string; alerts?: string[] }
export async function ingest(commands: Record<string, unknown>[]): Promise<{ results: IngestResult[]; rev: number }> {
  return must(await supabase.rpc('ingest', { p_commands: commands as never })) as unknown as { results: IngestResult[]; rev: number }
}
