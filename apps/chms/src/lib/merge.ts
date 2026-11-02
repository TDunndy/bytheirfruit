// Duplicates and merge. The queue is one logged read (duplicates.read); a
// merge is a single RPC that keeps one record, archives the other and carries
// what can move. History stays under the archived id and the reports fold it.
import { supabase } from './supabase'
import type { Database } from '@db/database.types'
import type { Person } from './people'

type Tables = Database['public']['Tables']
export type PersonMerge = Tables['person_merges']['Row']

export interface DuplicatePair {
  person_a_id: string; person_b_id: string; reasons: string[]
  a_name: string; b_name: string; a_guest: boolean; b_guest: boolean
  a_household: string | null; b_household: string | null; a_minor: boolean; b_minor: boolean
  a_created: string; b_created: string
}

export const REASONS: Record<string, string> = {
  phone: 'Same phone', email: 'Same email', name_birthdate: 'Same name and birthdate', name: 'Same name',
}
export const reasonLabel = (r: string) => REASONS[r] ?? r

export async function possibleDuplicates(orgId: string): Promise<DuplicatePair[]> {
  const { data, error } = await supabase.rpc('possible_duplicates', { p_org_id: orgId })
  if (error) throw error
  return (data ?? []) as unknown as DuplicatePair[]
}

export async function keepSeparate(a: string, b: string): Promise<void> {
  const { error } = await supabase.rpc('keep_separate', { p_a: a, p_b: b })
  if (error) throw error
}

export type FieldPick = Record<string, 'keep' | 'drop'>

export async function mergePeople(keepId: string, dropId: string, fields: FieldPick, joinHouseholds: boolean): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('merge_people', {
    p_keep: keepId, p_drop: dropId, p_fields: fields, p_options: { join_households: joinHouseholds },
  })
  if (error) throw error
  return (data ?? {}) as Record<string, unknown>
}

/** The merge that archived this record, if one did. */
export async function mergeOf(personId: string): Promise<PersonMerge | null> {
  const { data, error } = await supabase.from('person_merges').select('*').eq('merged_person_id', personId).maybeSingle()
  if (error) throw error
  return data
}

/** The fields the sheet lets staff choose between when the two records differ. */
export const MERGE_FIELDS: { key: keyof Person; label: string }[] = [
  { key: 'first_name', label: 'First name' }, { key: 'last_name', label: 'Last name' }, { key: 'preferred_name', label: 'Goes by' },
  { key: 'title', label: 'Title' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
  { key: 'birthdate', label: 'Birthdate' }, { key: 'gender', label: 'Gender' },
  { key: 'address_line1', label: 'Address' }, { key: 'address_line2', label: 'Address line 2' }, { key: 'city', label: 'City' },
  { key: 'state', label: 'State' }, { key: 'postal_code', label: 'ZIP' }, { key: 'membership_status', label: 'Status' },
]

/** Which record to keep by default: the one that is not a guest, else the older one. */
export function defaultKeep(a: Person, b: Person): Person {
  const ag = a.tags.includes('guest'), bg = b.tags.includes('guest')
  if (ag !== bg) return ag ? b : a
  return a.created_at <= b.created_at ? a : b
}
