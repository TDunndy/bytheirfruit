# ADR-0003: Billing

**Status:** accepted (2026-10-22)

## Context

Churches pay $39/month through a Stripe Payment Link. The deployed
`stripe-webhook` edge function verifies signatures, is idempotent via
`subscription_events`, and writes `churches.subscription_status`. Three
overlapping records existed for a claim (`claim_requests`, `church_claims`,
columns on `churches`) and the client used to set `claimed_by` itself (which
RLS silently blocked for non-admins, so paid claims never matched).

## Decision

- The Supabase edge function is the only webhook endpoint. The duplicate
  Cloudflare handler was removed.
- `verify_claim_code()` sets `claimed_by` server-side before the user reaches
  Stripe, so `client_reference_id` always matches a church.
- `subscriptions` (per organization) is introduced now and kept in sync from
  `churches`; it becomes the source of truth once checkout moves server-side.
- Billing columns on `churches` are writable only by the service role
  (`protect_church_columns`), never through the API.

## Next steps

1. `create-checkout-session` edge function that creates a Stripe Checkout
   session with `metadata.org_id`, replacing the static Payment Link.
2. Stripe Customer Portal for cancellations and card updates.
3. Webhook writes `subscriptions` directly; the trigger mirror is retired.
4. `claim_requests` and `church_claims` collapse into one `church_claims` table.
