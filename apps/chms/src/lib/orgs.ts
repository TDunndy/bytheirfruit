import { supabase } from './supabase'
import type { Database } from '@db/database.types'

export type OrgRole = Database['public']['Tables']['org_members']['Row']['role']

export interface MyOrg {
  id: string
  name: string
  slug: string
  role: OrgRole
}

/** Churches the signed-in user can act for (RLS returns only their memberships). */
export async function fetchMyOrgs(userId: string): Promise<MyOrg[]> {
  const { data, error } = await supabase
    .from('org_members')
    .select('role, organizations ( id, name, slug )')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? [])
    .flatMap((m) => (m.organizations ? [{ ...m.organizations, role: m.role }] : []))
    .sort((a, b) => a.name.localeCompare(b.name))
}

const ORG_KEY = 'chms-org'

export function rememberedOrgId(): string | null {
  try { return localStorage.getItem(ORG_KEY) } catch { return null }
}

export function rememberOrgId(id: string) {
  try { localStorage.setItem(ORG_KEY, id) } catch { /* private mode: picker shows again next time */ }
}
