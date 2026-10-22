import { supabase } from '../supabase'

export interface VerifyResult {
  ok: boolean
  error?: string
  already_verified?: boolean
}

/** Step 1: ask the edge function to email a code to a church-domain address. */
export async function requestClaimCode(churchId: string, claimEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
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
  return { ok: true }
}

/** Step 2: verify server-side. On success the church is claimed by the caller. */
export async function verifyClaimCode(churchId: string, code: string): Promise<VerifyResult> {
  const { data, error } = await supabase.rpc('verify_claim_code', { p_church_id: churchId, p_code: code })
  if (error) return { ok: false, error: error.message }
  return (data ?? { ok: false, error: 'Unexpected response' }) as unknown as VerifyResult
}
