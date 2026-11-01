// Kids' data on a person: care notes (RPC-only, logged), pickups and custody,
// documents, credentials, custom fields, photos, household flags.
import { supabase } from './supabase'
import type { Database } from '@db/database.types'

type Tables = Database['public']['Tables']
export type PickupPerson = Tables['pickup_people']['Row']
export type PersonDocument = Tables['person_documents']['Row']
export type Credential = Tables['person_credentials']['Row']
export type CustomFieldDef = Tables['custom_field_defs']['Row']
export type SensitiveValue = Tables['custom_field_values_sensitive']['Row']
export type HouseholdFlag = Tables['household_flags']['Row']
export type HouseholdMember = Tables['household_members']['Row']

export interface CareNotes {
  allergies: string | null
  allergy_short: string | null
  medical: string | null
  special_needs: string | null
  has_allergy: boolean
  has_medical: boolean
  has_special_needs: boolean
  updated_at: string
}

export const CREDENTIAL_KINDS: { value: Credential['kind']; label: string }[] = [
  { value: 'background_check', label: 'Background check' },
  { value: 'training', label: 'Training' },
  { value: 'child_safety', label: 'Child safety' },
]

export const FLAGS: { value: HouseholdFlag['flag']; label: string; help: string }[] = [
  { value: 'exempt', label: 'Exempt', help: 'The serve policy does not apply to this family' },
  { value: 'joining_team', label: 'Joining a team', help: 'They have said yes and are being onboarded' },
  { value: 'serving_elsewhere', label: 'Serving elsewhere', help: 'Serving outside the kids ministry (staff-verified)' },
  { value: 'no_longer_attending', label: 'No longer attending', help: 'Leave them out of letters' },
  { value: 'pastoral_hold', label: 'Pastoral hold', help: 'A pastor asked that no letters go out' },
]

// ------------------------------------------------------------------ care --
/** Reads care notes through the logged RPC (needs kids.care). */
export async function getCare(personId: string): Promise<CareNotes | null> {
  const { data, error } = await supabase.rpc('get_child_care', { p_person_id: personId })
  if (error) throw error
  return (data as unknown as CareNotes | null) ?? null
}

export async function setCare(personId: string, c: { allergies: string; allergy_short: string; medical: string; special_needs: string }) {
  const { error } = await supabase.rpc('set_child_care', {
    p_person_id: personId, p_allergies: c.allergies, p_allergy_short: c.allergy_short, p_medical: c.medical, p_special_needs: c.special_needs,
  })
  if (error) throw error
}

// --------------------------------------------------------------- pickups --
export async function pickupsFor(childId: string): Promise<PickupPerson[]> {
  const { data, error } = await supabase.from('pickup_people').select('*').eq('child_person_id', childId).is('archived_at', null).order('kind').order('created_at')
  if (error) throw error
  return data ?? []
}

export async function addPickup(orgId: string, childId: string, p: { personId?: string; name?: string; phone?: string; relationship?: string; kind: 'authorized' | 'restricted'; note?: string; validFrom?: string | null; validTo?: string | null }) {
  const { error } = await supabase.from('pickup_people').insert({
    org_id: orgId, child_person_id: childId, person_id: p.personId ?? null, name: p.name || null, phone: p.phone || null,
    relationship: p.relationship || null, kind: p.kind, note: p.note || null, valid_from: p.validFrom || null, valid_to: p.validTo || null,
  })
  if (error) throw error
}

export async function archivePickup(id: string) {
  const { error } = await supabase.from('pickup_people').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------- documents --
export async function documentsFor(personId: string): Promise<PersonDocument[]> {
  const { data, error } = await supabase.from('person_documents').select('*').eq('person_id', personId).is('archived_at', null).order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Uploads to the private documents bucket at <org>/<kind>/<person>/<file>, then records it. */
export async function uploadDocument(orgId: string, personId: string, kind: PersonDocument['kind'], file: File, title: string, note: string | null) {
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 120) || 'file'
  const path = `${orgId}/${kind}/${personId}/${Date.now()}-${safe}`
  const up = await supabase.storage.from('chms-documents').upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (up.error) throw up.error
  const { error } = await supabase.from('person_documents').insert({ org_id: orgId, person_id: personId, kind, storage_path: path, title, note })
  if (error) throw error
}

export async function archiveDocument(id: string) {
  const { error } = await supabase.from('person_documents').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ----------------------------------------------------------- credentials --
export async function credentialsFor(personId: string): Promise<Credential[]> {
  const { data, error } = await supabase.from('person_credentials').select('*').eq('person_id', personId).is('archived_at', null).order('completed_on', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function addCredential(orgId: string, personId: string, c: { kind: Credential['kind']; completedOn: string; expiresOn: string | null; provider: string | null; reference: string | null; note: string | null }) {
  const { error } = await supabase.from('person_credentials').insert({
    org_id: orgId, person_id: personId, kind: c.kind, completed_on: c.completedOn, expires_on: c.expiresOn, provider: c.provider, reference: c.reference, note: c.note,
  })
  if (error) throw error
}

export async function archiveCredential(id: string) {
  const { error } = await supabase.from('person_credentials').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export function credentialStatus(creds: Credential[], today: string): 'cleared' | 'expired' | 'none' {
  const checks = creds.filter((c) => c.kind === 'background_check')
  if (checks.some((c) => c.completed_on <= today && (!c.expires_on || c.expires_on >= today))) return 'cleared'
  return checks.length > 0 ? 'expired' : 'none'
}

// --------------------------------------------------------- custom fields --
export async function listFieldDefs(orgId: string): Promise<CustomFieldDef[]> {
  const { data, error } = await supabase.from('custom_field_defs').select('*').eq('org_id', orgId).is('archived_at', null).order('sort').order('label')
  if (error) throw error
  return data ?? []
}

export async function saveFieldDef(orgId: string, d: { id?: string; applies_to: 'person' | 'household'; key: string; label: string; field_type: CustomFieldDef['field_type']; options: string[]; sensitive: boolean; sort: number }) {
  const row = { applies_to: d.applies_to, key: d.key, label: d.label, field_type: d.field_type, options: d.options, sensitive: d.sensitive, sort: d.sort }
  if (d.id) {
    const { error } = await supabase.from('custom_field_defs').update({ label: d.label, options: d.options, sort: d.sort }).eq('id', d.id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('custom_field_defs').insert({ org_id: orgId, ...row })
  if (error) throw error
}

export async function archiveFieldDef(id: string) {
  const { error } = await supabase.from('custom_field_defs').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function sensitiveValuesFor(subjectId: string): Promise<SensitiveValue[]> {
  const { data, error } = await supabase.from('custom_field_values_sensitive').select('*').eq('subject_id', subjectId)
  if (error) throw error
  return data ?? []
}

export async function setSensitiveValue(orgId: string, fieldId: string, subjectId: string, value: unknown) {
  const { error } = await supabase.from('custom_field_values_sensitive').upsert({ org_id: orgId, field_id: fieldId, subject_id: subjectId, value: value as SensitiveValue['value'] }, { onConflict: 'field_id,subject_id' })
  if (error) throw error
}

/** Writes the plain (non-sensitive) custom values onto the person or household row. */
export async function setPlainCustom(table: 'people' | 'households', id: string, custom: Record<string, unknown>) {
  const { error } = await supabase.from(table).update({ custom: custom as never }).eq('id', id)
  if (error) throw error
}

// ----------------------------------------------------------------- photos --
/** Uploads to the private photos bucket at <org>/<person>/<file> and points the person at it. */
export async function uploadPhoto(orgId: string, personId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${orgId}/${personId}/${Date.now()}.${ext}`
  const up = await supabase.storage.from('chms-photos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  if (up.error) throw up.error
  const { error } = await supabase.from('people').update({ photo_path: path }).eq('id', personId)
  if (error) throw error
  return path
}

export async function photoUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from('chms-photos').createSignedUrl(path, 60 * 10)
  if (error) return null
  return data?.signedUrl ?? null
}

// ------------------------------------------------------- household flags --
export async function flagsFor(householdId: string): Promise<HouseholdFlag[]> {
  const { data, error } = await supabase.from('household_flags').select('*').eq('household_id', householdId).order('set_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function setFlag(orgId: string, householdId: string, flag: HouseholdFlag['flag'], note: string | null) {
  const { error } = await supabase.from('household_flags').insert({ org_id: orgId, household_id: householdId, flag, note })
  if (error) throw error
}

export async function clearFlag(id: string) {
  const { error } = await supabase.from('household_flags').update({ cleared_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ----------------------------------------------------- household members --
export async function membersFor(householdId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase.from('household_members').select('*').eq('household_id', householdId).is('ended_at', null)
  if (error) throw error
  return data ?? []
}

export async function setMemberFlags(householdId: string, personId: string, flags: { is_guardian?: boolean; can_check_in?: boolean }) {
  const { error } = await supabase.from('household_members').update(flags).eq('household_id', householdId).eq('person_id', personId)
  if (error) throw error
}
