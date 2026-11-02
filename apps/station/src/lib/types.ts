// Shapes of what the station RPCs return (jsonb in Postgres; see migration
// chms_checkin_d_pairing). Ids, first names and last initials, flags: never
// care notes, addresses or account ids.
import type { Database } from '@db/database.types'
import type { Criteria, LabelLayout } from '@btf/core'

type Tables = Database['public']['Tables']
export type OccurrenceRow = Tables['occurrences']['Row']
export type ScheduleRow = Tables['schedules']['Row']
export type RoomRow = Tables['rooms']['Row']
export type AreaRow = Tables['areas']['Row']
export type PrinterRow = Tables['printers']['Row']
export type LabelTemplateRow = Tables['label_templates']['Row']
export type AlertRow = Tables['station_alerts']['Row']
export type AttendanceRow = Tables['attendance']['Row']

export type StationMode = 'kiosk' | 'staffed' | 'roster' | 'volunteer'

export interface StationSettings {
  time_zone: string
  grade_cutoff_month: number
  grade_cutoff_day: number
  promotion_date: string | null
  punctuality_grace_minutes: number
  label_defaults: Record<string, unknown>
}

export type StationSelf =
  | { status: 'active'; station_id: string; org_id: string; org_name: string; name: string; mode: StationMode; printer_id: string | null; label_stock: string | null; room_ids: string[]; local_today: string; settings: StationSettings | null }
  | { status: 'unpaired' | 'removed' | 'inactive' | 'unknown' }

export interface LookupMember {
  person_id: string
  first_name: string
  display_name: string
  relationship: 'head' | 'spouse' | 'child' | 'other'
  is_guardian: boolean
  can_check_in: boolean
  is_child: boolean
  matched: boolean
}
export interface LookupHousehold { id: string; name: string; members: LookupMember[] }
export interface LookupPerson { person_id: string; display_name: string; first_name: string; last_name?: string; is_child: boolean; in_household: boolean }
export type LookupMethod = 'phone' | 'last4' | 'name' | 'scan'
export type LookupResult =
  | { ok: true; found: number; households: LookupHousehold[]; people: LookupPerson[] }
  | { ok: false; error: 'invalid_method' | 'method_not_allowed' | 'locked' | 'invalid' }

export interface HouseholdMember {
  person_id: string
  first_name: string
  last_name: string
  display_name: string
  relationship: 'head' | 'spouse' | 'child' | 'other'
  is_guardian: boolean
  can_check_in: boolean
  is_child: boolean
  guest: boolean
  birthdate?: string
  gender?: 'male' | 'female'
  tags?: string[]
  custom?: Record<string, unknown>
  grade_override?: number
  grade_override_year?: number
  flags?: { allergy: boolean; medical: boolean; special_needs: boolean; custody: boolean }
  allergy_short?: string
  see_staff: boolean
  override_room_id?: string
  credential_status?: 'cleared' | 'pending' | 'expired' | 'none'
  sms_consent?: boolean
}
export interface HouseholdAttendance {
  occurrence_id: string
  person_id: string
  status: 'in' | 'out'
  room_id: string | null
  codes: string[]
  session_id: string | null
  checked_in_at: string | null
  role: string
}
export interface HouseholdView { id: string; name: string; local_date: string; members: HouseholdMember[]; attendance: HouseholdAttendance[] }

export interface PickupPerson { person_id: string; display_name: string; relationship?: string | null; pickup_id?: string }
export interface PickupList { guardians: PickupPerson[]; authorized: PickupPerson[]; restricted: PickupPerson[] }

export interface VolunteerRow {
  assignment_id: string
  person_id: string
  display_name: string
  first_name: string
  last_name: string
  slot_id: string
  label?: string
  room_id?: string
  room_name?: string
  role_name?: string
  occurrence_id?: string
  starts_at?: string
  ends_at?: string
  arrive_minutes_before: number
  status: 'scheduled' | 'confirmed'
  kids_area: boolean
  credential_status: 'cleared' | 'pending' | 'expired' | 'none'
  attendance_status?: 'in' | 'out'
  checked_in_at?: string
  punctuality?: 'early' | 'on_time' | 'late'
  attendance_room_id?: string
}
export interface VolunteersResult { ok: true; local_date: string; volunteers: VolunteerRow[] }

export interface RosterRow {
  person_id: string
  display_name: string
  photo_path: string | null
  role: string
  status: 'in' | 'out'
  room_id: string | null
  checked_in_at: string | null
  checked_out_at: string | null
  codes: string[]
  anomalies: string[]
  punctuality: string | null
  has_allergy: boolean
  has_medical: boolean
  has_special_needs: boolean
  allergy_short: string | null
  restriction: string | null
  guardian_first_name: string | null
}

export interface StaffPerson { person_id: string; display_name: string }
export type StaffPermission = 'checkin.station' | 'checkin.manage' | 'kids.view' | 'kids.care' | 'custody.manage'
export interface StaffUnlock { person_id: string; display_name: string; permissions: StaffPermission[]; until: number }

/** A room as the core package wants it, with its area. */
export interface RoomInfo {
  id: string
  name: string
  area_id: string
  area_name: string
  area_kind: AreaRow['kind']
  priority: number
  capacity: number | null
  children_per_adult: number | null
  overflow_room_id: string | null
  criteria: Criteria
  active: boolean
}

export interface TemplateInfo { kind: 'child' | 'pickup' | 'volunteer'; width_mm: number; height_mm: number; layout: LabelLayout }
