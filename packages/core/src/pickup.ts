import { compareDates, type LocalDate } from './dates'

export type PickupStatus = 'restricted' | 'guardian' | 'authorized' | 'unknown'

export interface Membership {
  household_id: string
  person_id: string
  relationship: string
  can_check_in: boolean
  ended_at?: string | null
}

export interface PickupEntry {
  child_person_id: string
  person_id: string | null
  kind: 'authorized' | 'restricted'
  valid_from?: LocalDate | null
  valid_to?: LocalDate | null
  archived_at?: string | null
}

function live(p: PickupEntry, today: LocalDate): boolean {
  if (p.archived_at) return false
  if (p.valid_from && compareDates(p.valid_from, today) > 0) return false
  if (p.valid_to && compareDates(p.valid_to, today) < 0) return false
  return true
}

/**
 * Mirrors chms_private.pickup_status: restricted wins over everything; then a
 * guardian (a non-child member of one of the child's households who may
 * check in); then an authorized pickup; otherwise unknown.
 */
export function pickupCheck(childId: string, personId: string, memberships: Membership[], pickups: PickupEntry[], today: LocalDate): PickupStatus {
  const mine = pickups.filter(p => p.child_person_id === childId && p.person_id === personId && live(p, today))
  if (mine.some(p => p.kind === 'restricted')) return 'restricted'
  const childHouseholds = new Set(memberships.filter(m => m.person_id === childId && !m.ended_at).map(m => m.household_id))
  const guardian = memberships.some(m => m.person_id === personId && !m.ended_at && m.relationship !== 'child' && m.can_check_in && childHouseholds.has(m.household_id))
  if (guardian) return 'guardian'
  if (mine.some(p => p.kind === 'authorized')) return 'authorized'
  return 'unknown'
}
