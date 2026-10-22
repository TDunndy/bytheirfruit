import { supabase } from '../supabase'
import type { Database } from '../database.types'

export type ReviewRow = Database['public']['Tables']['reviews']['Row']
export type ReviewInsert = Database['public']['Tables']['reviews']['Insert']

/** Selection used by the public church page; profile data comes from the PII-free view. */
export const PUBLIC_REVIEW_SELECT =
  '*, public_profiles!reviews_user_id_fkey(display_name, avatar_url), ' +
  'church_responses(id, text, created_at, public_profiles!church_responses_responder_id_fkey(display_name)), ' +
  'review_likes(user_id), review_photos(id, storage_path, caption, sort_order)'

export async function fetchChurchReviews(churchId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .select(PUBLIC_REVIEW_SELECT)
    .eq('church_id', churchId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Records where a review was written from. Coordinates are only ever readable
 * by moderators; the DB computes distance and sets reviews.location_verified.
 */
export async function recordReviewLocation(reviewId: string, userId: string, lat: number, lng: number) {
  const { error } = await supabase.from('review_locations').insert({ review_id: reviewId, user_id: userId, lat, lng })
  if (error) throw error
}

export interface DemographicsResult {
  total: number
  suppressed: boolean
  min_required?: number
  gender?: Record<string, number>
  age?: Record<string, number>
  income?: Record<string, number>
  role?: Record<string, number>
}

/** Aggregate reviewer demographics for a claimed church (k-anonymised server-side). */
export async function fetchChurchDemographics(churchId: string): Promise<DemographicsResult> {
  const { data, error } = await supabase.rpc('church_reviewer_demographics', { p_church_id: churchId })
  if (error) throw error
  return (data ?? { total: 0, suppressed: true }) as unknown as DemographicsResult
}
