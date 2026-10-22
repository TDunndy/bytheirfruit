# Runbook: shipping this branch to production

Three things change together: the database, the edge functions, and the
frontend. The order below keeps the live site working at every step.

## Status

| Step | State |
|---|---|
| 1. Hardening migration | **applied to production on 2026-10-22** through the Supabase connector, as seven recorded migrations (see below) |
| 2. Edge functions + secrets | pending (needs the CLI) |
| 3. Merge to main (frontend deploy) | pending |
| 4. Privacy lockdown + organizations | pending, only after step 3 |
| 5. Dashboard settings | pending |

## 0. One-time CLI setup

```bash
npx supabase login
npx supabase link --project-ref ffqmbhftivmiubvtzhhr
# The baseline migration describes what production already had. Mark it applied:
npx supabase migration repair --status applied 20261022000100
npx supabase migration list      # local and remote must now agree
```

`supabase/migrations/` mirrors the remote history exactly: nine placeholder
files for migrations recorded before the schema was versioned, the baseline,
and the seven hardening parts with the versions the connector assigned:

```
20261022175121_hardening_1_role_helpers_and_protective_triggers
20261022180042_hardening_3_review_locations_public_profiles_demographics
20261022180600_hardening_2a_function_hygiene
20261022181319_hardening_2b_claim_verification
20261022181948_hardening_4_geo_search
20261022182345_hardening_5_idx_churches_earth
20261022182445_hardening_6_idx_churches_city_trgm
```

(Part 3 sorts before 2a/2b; nothing in it depends on them.)

## 1. Hardening — done

Closed in production as of 2026-10-22 18:25 UTC: role self-promotion,
self-published reviews, claimant score/billing edits, anon-callable
internals, mutable `search_path`, readable verification codes, public
reviewer coordinates. `churches_near()`, `geocode_zip()`,
`verify_claim_code()`, `church_reviewer_demographics()` and
`public_profiles` exist, so the new frontend can be deployed.

Security advisor items that remain **on purpose**:

- lint 0010 `public_profiles` is a SECURITY DEFINER view: it exposes four
  safe columns of the private `profiles` table; PostgREST can only embed a
  view or table, not a function.
- lint 0016 `zip_centroids` is selectable by anon: it is an aggregate of
  public church coordinates, nothing per person.
- `is_admin()` / `is_moderator()` callable by anon: RLS policies evaluate
  them as the calling role; they only report on the caller.
- `verify_claim_code`, `church_reviewer_demographics`, `soft_delete_review`,
  `recalculate_church_scores` callable by signed-in users: each gates
  inside on `auth.uid()`.
- `pg_trgm` in `public`: pre-existing; moving it means rebuilding the name index.

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

Both sender domains must be verified in Resend. Until
`send-verification-email` is redeployed, new claim codes are still written
to the old `verification_code` column and `verify_claim_code()` will report
"expired"; deploy the functions before announcing the claim flow.

## 3. Merge to main

Cloudflare Pages builds and deploys the new frontend (2-3 minutes). The new
frontend reads `public_profiles`, calls `verify_claim_code`, `churches_near`,
`geocode_zip` and `church_reviewer_demographics`, and writes
`review_locations`. All of those exist in production now.

## 4. Apply the privacy lockdown and tenancy migrations

Only after the new frontend is live (the old one read `profiles` directly):

```bash
npx supabase db push        # applies 20261022200000_privacy_lockdown and 20261022200100_organizations
```

The privacy migration drops `reviews.reviewer_lat/lng/distance_miles`
(already copied to `review_locations`) and `church_claims.verification_code`
(replaced by the hash). The organizations migration is additive and
backfills organizations from existing claims.

If `db push` is not available, the connector's migration tool works the same
way it did for the hardening parts; record the versions it assigns and
rename the local files to match.

## 5. Auth and Stripe settings (dashboard, not SQL)

- Authentication → Providers → Email: keep "Confirm email" on.
- Authentication → Settings: enable **Leaked password protection**.
- Authentication → URL configuration: add `https://bytheirfruit.church` and
  `https://bytheirfruit.church/**` to redirect URLs (PKCE flow).
- Stripe → Developers → Webhooks: the only endpoint should be
  `https://ffqmbhftivmiubvtzhhr.supabase.co/functions/v1/stripe-webhook`.
  The legacy Cloudflare handler `functions/api/stripe-webhook.js` is kept
  until that is confirmed; delete it afterwards.

## 6. Verify

- Open a church page: reviewer first names render (the `public_profiles` embed works).
- `curl -s 'https://ffqmbhftivmiubvtzhhr.supabase.co/rest/v1/profiles?select=email&limit=1' -H "apikey: $ANON"` returns `[]` (after step 4).
- Discover → Near Me returns churches sorted by distance, not Florida rows.
- Claim a church end to end: code email arrives, verification succeeds, the church shows "claimed", payment link opens in the same tab.
- `https://bytheirfruit.church/sitemap.xml` lists ~270 church sitemaps of 1,000 URLs.

## Rolling back

- Triggers and functions can be dropped individually; nothing in the hardening parts destroys data.
- The privacy migration drops columns. Reviewer coordinates survive in `review_locations`; verification codes are simply reissued.
- The organizations migration can be dropped wholesale (`drop table subscriptions, org_members, organizations cascade`) without touching legacy columns.

## Applying through the connector (what happened on 2026-10-22)

The connector's raw-SQL tool times out on DDL in a cloud session; its
`apply_migration` tool works but assigns its own version. Each hardening
part was applied as one `apply_migration` call, then the local files were
renamed to the recorded versions. Keep doing it that way if the CLI is not
at hand: apply, read `list_migrations`, rename.
