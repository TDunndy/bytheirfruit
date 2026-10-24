# ADR-0003: Billing

**Status:** accepted (2026-10-22); billing paused 2026-10-24

## Paused for the beta (2026-10-24)

No new payments are taken. Every claimed church gets the full dashboard, replies
and the weekly digest for free. Nothing in the database gates on payment, so
the switch is client-side plus one function secret:

- `src/lib/billing.ts`: `BILLING_ENABLED = false` hides prices and payment
  buttons, skips the Payment Link redirect after a verified claim and the
  subscription gate on the dashboard.
- `weekly-digest` sends to every claimed church unless the `BILLING_ENABLED`
  function secret is `true`.
- The legacy Cloudflare webhook handler is deleted. The `stripe-webhook` edge
  function stays deployed (it acts only on signed Stripe events), and billing
  columns, `subscriptions` and `has_active_subscription()` stay.
- The Stripe Payment Link should be deactivated in the Stripe dashboard, and
  any active subscription in Stripe → Subscriptions cancelled (and that church
  told). Deactivating a link does not stop subscriptions created from it.
- Production check on 2026-10-24: one claimed church (the admin's test
  listing), no Stripe customer or subscription IDs, no `subscription_events`.
  Stripe itself is the authority if a webhook was ever missed.

To turn billing back on: set both flags to true, reactivate (or replace) the
Payment Link, and decide what happens to churches claimed for free during the
beta (they have `subscription_status` null and would hit the gate).

## Context

Churches pay $39/month through a Stripe Payment Link. The deployed
`stripe-webhook` edge function verifies signatures, is idempotent via
`subscription_events`, and writes `churches.subscription_status`. Three
overlapping records existed for a claim (`claim_requests`, `church_claims`,
columns on `churches`) and the client used to set `claimed_by` itself (which
RLS silently blocked for non-admins, so paid claims never matched).

## Decision

- The Supabase edge function is the only webhook endpoint. The duplicate
  Cloudflare handler is removed (deleted 2026-10-24).
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
