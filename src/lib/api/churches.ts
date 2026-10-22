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
