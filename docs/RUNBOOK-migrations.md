# Runbook: shipping this branch to production

Three things change together: the database, the edge functions, and the
frontend. The order below keeps the live site working at every step.

## 0. One-time CLI setup

```bash
npx supabase login
npx supabase link --project-ref ffqmbhftivmiubvtzhhr
# The baseline migration describes what production already has. Mark it applied:
npx supabase migration repair --status applied 20261022000100
```

## 1. Apply the hardening migration now (safe with the current site)

`supabase/migrations/20261022000200_hardening.sql` only adds objects and blocks
writes the legitimate app never performs. It closes the role self-promotion and
score-tampering holes immediately.

```bash
npx supabase db push --dry-run     # should list 0200, 0300, 0400
```

`db push` applies every pending migration, so apply 0200 on its own through the
SQL editor (paste the file) or psql, then record it:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261022000200_hardening.sql
npx supabase migration repair --status applied 20261022000200
```

It builds the `zip_centroids` materialized view and two indexes over 270k
churches; expect 10-30 seconds.

## 2. Deploy edge functions and set secrets

```bash
npx supabase functions deploy send-verification-email
npx supabase functions deploy notify-admin-report
npx supabase functions deploy notify-new-review --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy weekly-digest --no-verify-jwt
```

Secrets (Dashboard → Edge Functions → Secrets). Existing: `RESEND_API_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DIGEST_CRON_SECRET`. New, all optional:

| Secret | Purpose | Default |
|---|---|---|
| `ADMIN_NOTIFY_EMAIL` | where report / new-review notifications go | hard-coded admin address |
| `VERIFY_FROM_ADDRESS` | sender for claim codes | `verify@bytheirfruit.church` |
| `NOTIFY_FROM_ADDRESS` | sender for notifications and digests | `notifications@bytheirfruit.church` |
| `NOTIFY_WEBHOOK_SECRET` | lets `notify-new-review` reject callers that are not the DB trigger | unset (accepts all) |

If you set `NOTIFY_WEBHOOK_SECRET`, also tell the trigger about it:

```sql
alter database postgres set app.settings.notify_webhook_secret = '<same value>';
```

Both sender domains must be verified in Resend.

## 3. Merge to main

Cloudflare Pages builds and deploys the new frontend (2-3 minutes). The new
frontend reads `public_profiles`, calls `verify_claim_code`, `churches_near`,
`geocode_zip` and `church_reviewer_demographics`, and writes
`review_locations`. All of those exist after step 1.

## 4. Apply the privacy lockdown and tenancy migrations

Only after the new frontend is live (the old one read `profiles` directly):

```bash
npx supabase db push        # applies 0300_privacy_lockdown and 0400_organizations
```

0300 drops `reviews.reviewer_lat/lng/distance_miles` (already copied to
`review_locations` by 0200) and `church_claims.verification_code` (replaced by
the hash). 0400 is additive and backfills organizations from existing claims.

## 5. Auth and Stripe settings (dashboard, not SQL)

- Authentication → Providers → Email: keep "Confirm email" on.
- Authentication → Settings: enable **Leaked password protection**.
- Authentication → URL configuration: add `https://bytheirfruit.church` and
  `https://bytheirfruit.church/**` to redirect URLs (PKCE flow).
- Stripe → Developers → Webhooks: the only endpoint should be
  `https://ffqmbhftivmiubvtzhhr.supabase.co/functions/v1/stripe-webhook`. The
  old `/api/stripe-webhook` Cloudflare handler was removed.

## 6. Verify

- Open a church page: reviewer first names render (the `public_profiles` embed works).
- `curl -s 'https://ffqmbhftivmiubvtzhhr.supabase.co/rest/v1/profiles?select=email&limit=1' -H "apikey: $ANON"` returns `[]`.
- Discover → Near Me returns churches sorted by distance, not Florida rows.
- Claim a church end to end: code email arrives, verification succeeds, the church shows "claimed", payment link opens in the same tab.
- `https://bytheirfruit.church/sitemap.xml` lists ~270 church sitemaps of 1,000 URLs.
- Supabase → Advisors → Security: the "role mutable search_path" and "anon can execute" warnings are gone.

## Rolling back

- Triggers and functions can be dropped individually; nothing in 0200 destroys data.
- 0300 drops columns. Reviewer coordinates survive in `review_locations`; verification codes are simply reissued.
- 0400 can be dropped wholesale (`drop table subscriptions, org_members, organizations cascade`) without touching legacy columns.
