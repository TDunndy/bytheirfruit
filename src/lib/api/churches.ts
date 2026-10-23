import { supabase } from '../supabase'
import type { Database } from '../database.types'

export type ChurchRow = Database['public']['Tables']['churches']['Row']
export type ChurchNearRow = Database['public']['Functions']['churches_near']['Returns'][number]
export type ChurchProfileUpdate = Pick<
  Database['public']['Tables']['churches']['Update'],
  | 'address' | 'zip' | 'latitude' | 'longitude' | 'denomination' | 'size' | 'service_style' | 'service_times'
  | 'website' | 'phone' | 'email' | 'service_days' | 'avg_attendance' | 'staff_count' | 'volunteer_count'
  | 'campus_count' | 'programs' | 'facebook_url' | 'instagram_url' | 'youtube_url' | 'livestream_url'
  | 'pastor_name' | 'year_founded' | 'description'
>

export interface NearFilters {
  radiusMiles?: number
  denomination?: string | null
  state?: string | null
  query?: string | null
  limit?: number
}

/** Radius search backed by the GiST index; returns rows sorted by distance. */
export async function churchesNear(lat: number, lng: number, f: NearFilters = {}) {
  const { data, error } = await supabase.rpc('churches_near', {
    p_lat: lat,
    p_lng: lng,
    p_radius_miles: f.radiusMiles ?? 50,
    p_denomination: f.denomination && f.denomination !== 'All' ? f.denomination : undefined,
    p_state: f.state && f.state !== 'All' ? f.state : undefined,
    p_query: f.query || undefined,
    p_limit: f.limit ?? 50,
  })
  if (error) throw error
  return (data ?? []) as ChurchNearRow[]
}

/** Zip → centroid, derived from the church dataset itself (no third-party geocoder). */
export async function geocodeZip(zip: string): Promise<{ lat: number; lng: number } | null> {
  const { data, error } = await supabase.rpc('geocode_zip', { p_zip: zip })
  if (error) throw error
  const row = (data ?? [])[0]
  return row ? { lat: row.lat, lng: row.lng } : null
}

/** Fields a verified claimant is allowed to edit (enforced by a DB trigger too). */
export async function updateChurchProfile(churchId: string, patch: ChurchProfileUpdate) {
  const { error } = await supabase.from('churches').update(patch).eq('id', churchId)
  if (error) throw error
}

/** Columns the public cards need; never `select *` on churches (it carries billing columns). */
export const CHURCH_CARD_SELECT =
  'id, name, denomination, city, state, zip, address, website, phone, size, service_style, service_times, ' +
  'latitude, longitude, total_reviews, score_teaching, score_welcome, score_community, score_worship, ' +
  'score_prayer, score_kids, score_youth, score_leadership, score_service, score_finances, score_overall, ' +
  'status, claimed_by, claimed_at, subscription_status, description, pastor_name'

/** Home-page spotlight: the best-rated churches that have at least one review. */
export async function fetchFeaturedChurches(limit = 3) {
  const { data, error } = await supabase
    .from('churches')
    .select(CHURCH_CARD_SELECT)
    .eq('status', 'approved')
    .gte('total_reviews', 1)
    .order('score_overall', { ascending: false, nullsFirst: false })
    .order('total_reviews', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

/** One church by id, full row (used when a deep link or a restored draft names a church). */
export async function fetchChurchById(id: string): Promise<ChurchRow | null> {
  const { data, error } = await supabase.from('churches').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export interface SiteStats { churches: number; reviews: number; members: number }

/** Social-proof counters from site_stats(); one cheap RPC instead of three full-table counts. */
export async function fetchSiteStats(): Promise<SiteStats> {
  const { data, error } = await supabase.rpc('site_stats')
  if (error) throw error
  const row = (data ?? [])[0]
  return { churches: Number(row?.churches ?? 0), reviews: Number(row?.reviews ?? 0), members: Number(row?.members ?? 0) }
}
