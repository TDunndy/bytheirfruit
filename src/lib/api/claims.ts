import { supabase } from '../supabase'
import type { Database } from '../database.types'

export interface VerifyResult {
  ok: boolean
  error?: string
  already_verified?: boolean
  /** true when the email was verified but an admin still has to approve the claim */
  manual_review?: boolean
}

export type ClaimRow = Database['public']['Tables']['church_claims']['Row']

/** A verified claim waiting for an admin, joined with what the claimant told us. */
export interface ClaimForReview {
  id: string
  church_id: string
  user_id: string
  claim_email: string
  verified: boolean | null
  verified_at: string | null
  review_note: string | null
  created_at: string | null
  church: { id: string; name: string; city: string | null; state: string | null; website: string | null } | null
  request: { full_name: string | null; role_at_church: string | null; phone: string | null; message: string | null } | null
}

/** Step 1: ask the edge function to email a code to a church-domain address. */
export async function requestClaimCode(churchId: string, claimEmail: string): Promise<{ ok: true; manualReview: boolean } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('send-verification-email', {
    body: { churchId, claimEmail },
  })
  if (error) {
    // supabase-js wraps non-2xx responses; surface the function's message when present.
    let message = error.message || 'Failed to send verification email'
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json()
        if (body?.error) message = body.error
      }
    } catch { /* keep default */ }
    return { ok: false, error: message }
  }
  if (data?.error) return { ok: false, error: data.error }
  return { ok: true, manualReview: !!data?.manual_review }
}

/** Step 2: verify server-side. Auto claims are claimed at once; `manual_review` ones wait for an admin. */
export async function verifyClaimCode(churchId: string, code: string): Promise<VerifyResult> {
  const { data, error } = await supabase.rpc('verify_claim_code', { p_church_id: churchId, p_code: code })
  if (error) return { ok: false, error: error.message }
  return (data ?? { ok: false, error: 'Unexpected response' }) as unknown as VerifyResult
}

/** Admin: claims whose email is verified and that wait for a human decision. */
export async function listClaimsForReview(): Promise<ClaimForReview[]> {
  const { data, error } = await supabase
    .from('church_claims')
    .select('id, church_id, user_id, claim_email, verified, verified_at, review_note, created_at, churches(id, name, city, state, website)')
    .eq('review_status', 'pending_review')
    .order('verified_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return []
  // What the claimant typed into the form lives in claim_requests (admin-readable).
  const { data: requests } = await supabase
    .from('claim_requests')
    .select('church_id, user_id, full_name, role_at_church, phone, message')
    .in('church_id', rows.map((r) => r.church_id))
  return rows.map((r) => {
    const church = Array.isArray(r.churches) ? r.churches[0] ?? null : (r.churches as ClaimForReview['church'])
    const req = (requests ?? []).find((q) => q.church_id === r.church_id && q.user_id === r.user_id) ?? null
    return {
      id: r.id, church_id: r.church_id, user_id: r.user_id, claim_email: r.claim_email,
      verified: r.verified, verified_at: r.verified_at, review_note: r.review_note, created_at: r.created_at,
      church,
      request: req ? { full_name: req.full_name, role_at_church: req.role_at_church, phone: req.phone, message: req.message } : null,
    }
  })
}

/** Admin: approve (claims the church for the claimant) or reject a pending claim. */
export async function reviewClaim(claimId: string, approve: boolean, note?: string): Promise<{ ok: boolean; error?: string; status?: string }> {
  const { data, error } = await supabase.rpc('review_church_claim', { p_claim_id: claimId, p_approve: approve, p_note: note ?? undefined })
  if (error) return { ok: false, error: error.message }
  return (data ?? { ok: false, error: 'Unexpected response' }) as unknown as { ok: boolean; error?: string; status?: string }
}
