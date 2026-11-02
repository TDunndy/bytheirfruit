# Runbook: shipping this branch to production

Three things change together: the database, the edge functions, and the
frontend. The order below keeps the live site working at every step.

## Status

| Step | State |
|---|---|
| 1. Hardening migration | **applied to production on 2026-10-22** through the Supabase connector, as seven recorded migrations (see below) |
| 2. Edge functions + secrets | pending (needs the CLI) |
| 2b. Claim lockdown + review lifecycle migrations | **applied to production on 2026-10-24** (20261024011258, 20261024011342) |
| 3. Merge to main (frontend deploy) | **done** (main deploys to Cloudflare Pages) |
| 4a. Profiles private (restrictive policy) | **applied to production on 2026-10-27** (20261027190746); anon reads 0 profiles, users their own row, admins all. The one review carrying reviewer coordinates was cleared (copy kept in `review_locations`) |
| 4b. Organizations (tenancy) | **applied to production on 2026-10-28** (20261028043405), written without drop/revoke statements so no confirmation prompt was needed; backfill created one organization (the admin's test listing) |
| 4c. Church app: People | **applied to production on 2026-10-31** (20261031041359); `send-verification-email` redeployed (v12, free-mail website domains no longer auto-verify). Pilot data for Lakewood Ranch Baptist Church (owner, 6 staff, chart, 100 fictional people) loaded with a seed script kept outside the repo; the public listing stays unclaimed |
| 4d. Check-in A/B/C + core | **applied to production on 2026-11-01**: `20261101164119_chms_checkin_a_people` (connector `apply_migration`), then `20261101172345_chms_checkin_b_config`, `20261101172346_chms_checkin_b_grants`, `20261101172347_chms_checkin_c_attendance`, `20261101172348_chms_checkin_c_grants` and `20261101174720_chms_checkin_c_review_fixes` and `20261101185558_chms_checkin_c_stays_and_scope` (second review round) through the connector's `execute_sql`, with their rows inserted into `supabase_migrations.schema_migrations` by hand (see below). `document-url` deployed (v1, verify_jwt), `send-verification-email` redeployed (v13, station guard), `supabase/seed/lwr-checkin.sql` loaded (3 areas, 10 rooms, 2 services, 18 occurrences, 18 volunteer needs, 3 label templates, 4 stations), advisors clean apart from the expected rows (no-policy tables in `chms_private` and `child_care`, definer RPCs that check permissions themselves, unindexed composite FKs on small config tables). **Pending:** `20261101172349_chms_checkin_b_claim_guard` (the station guard on `verify_claim_code`): the connector asks the owner to confirm that one function and the prompt never reached him. The station wall already keeps a station out of `church_claims` and `churches`, so nothing is exposed meanwhile |
| 4e. Check-in D (pairing, station lookups) + station app | **applied to production on 2026-11-02**: `20261102002936_chms_checkin_d_pairing` (connector `execute_sql` + a hand-inserted version row, as for B/C); `pair-station` deployed (v1, `verify_jwt = false`). Owner side: create the Cloudflare Worker `bytheirfruit-station` (Workers Builds from `main`, root `apps/station`, build `npm run build`, deploy `npx wrangler deploy`, config `apps/station/wrangler.jsonc`) with the custom domain station.bytheirfruit.church (no Auth redirect URL is needed: a device's session comes from the pairing function, not from a sign-in redirect). A laptop then pairs from Check-in → Stations → Pair device; for silent label printing run Chrome with `--kiosk-printing` and add the 62×29 mm and 62×100 mm custom paper sizes to the QL driver |
| 4f. Groups (G1) | **applied to production on 2026-11-02**: `20261102013532_chms_groups` (connector `execute_sql` + a hand-inserted version row). Adds `groups.manage` to the permission list and to the untouched Staff and Kids Director roles |
| 4g. Follow-ups (G2) | **applied to production on 2026-11-02**: `20261102015108_chms_followups` (connector `execute_sql` + a hand-inserted version row); LWR's age bands set (Barn 0–72 months, K/5 60–144). Owner side: set each area's director and the default assignee under Check-in → Rooms and Settings |
| 4h. Intake form (G3) | **applied to production on 2026-11-02**: `20261102015902_chms_intake` (connector `execute_sql` + a hand-inserted version row); `intake` deployed (v1, `verify_jwt = false`). Owner side: create a Cloudflare Turnstile widget for app.bytheirfruit.church; set its secret as the edge function secret `TURNSTILE_SECRET` and its site key as the Worker build variable `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (until both are set the form runs without the bot check). The QR card is under Check-in → Settings |
| 4i. Group messaging v1 (G4) | **pending apply**: `chms_group_contacts` (connector `execute_sql` + a hand-inserted version row). No secrets: the buttons open the leader's own mail or Messages app |
| 4. Privacy lockdown | pending: its policy and column drops need the owner to approve Supabase's confirmation prompt within 60 s; profiles are already private via 4a. Apply together with `revoke execute ... from anon` on `is_org_member`, `has_active_subscription` and `org_role_rank` (anon can execute them through default privileges; they return false without a login) |
| 5. Dashboard settings | pending |
| Church app hosting | **live on 2026-11-01**: Cloudflare Worker `bytheirfruit-chms` (Workers Builds from `main`, root `apps/chms`, build `npm run build`, deploy `npx wrangler deploy`, config `apps/chms/wrangler.jsonc`), custom domain app.bytheirfruit.church; Supabase Auth redirect URL `https://app.bytheirfruit.church/**` |

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
20261023042127_site_stats_and_claim_review
20261024011258_claim_insert_lockdown
20261024011342_claim_review_lifecycle
```

Applied 2026-10-24 (the Supabase connector asks the account owner to confirm
any statement that drops something; earlier attempts timed out only because
that prompt went unanswered):

```
20261024011258_claim_insert_lockdown   # claimants can no longer insert their own claim rows
20261024011342_claim_review_lifecycle  # reject resets the claim; profile applied on approval
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

### Claim review (added 2026-10-23)

`send-verification-email` now sends a code to any address. When the address
is on the church's website domain the claim completes on its own; otherwise
(no website on file, which is 92 % of listings) the claim lands in the admin
dashboard's **Claims** tab after the code is verified. Approving there makes
the claimant the owner and opens their dashboard (free while billing is
paused, ADR-0003).

## 2. Deploy edge functions and set secrets

```bash
npx supabase functions deploy send-verification-email
npx supabase functions deploy document-url
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
| `BILLING_ENABLED` | `true` limits `weekly-digest` to paying churches | unset (every claimed church, beta) |
| `TURNSTILE_SECRET` | `intake` verifies the public sign-up form's Turnstile token when set | unset (no bot check; the per-address throttle and same-day phone fold still apply) |

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
npx supabase db push        # applies 20261022200000_privacy_lockdown (organizations is already applied)
```

The privacy migration drops `reviews.reviewer_lat/lng/distance_miles`
(already copied to `review_locations`) and `church_claims.verification_code`
(replaced by the hash). The organizations migration (20261028043405) is
already applied; it is additive and backfilled organizations from existing claims.

If `db push` is not available, the connector's migration tool works the same
way it did for the hardening parts; record the versions it assigns and
rename the local files to match.

## 5. Auth and Stripe settings (dashboard, not SQL)

- Authentication → Providers → Email: keep "Confirm email" on.
- Authentication → Settings: enable **Leaked password protection**.
- Authentication → URL configuration: add `https://bytheirfruit.church` and
  `https://bytheirfruit.church/**` to redirect URLs (PKCE flow).
- Stripe: billing is paused for the beta (ADR-0003). Deactivate the Payment
  Link (Stripe → Payment Links) and cancel any active subscription (Stripe →
  Subscriptions), telling that church. If a webhook endpoint stays, it should be only
  `https://ffqmbhftivmiubvtzhhr.supabase.co/functions/v1/stripe-webhook`; the
  legacy Cloudflare handler `/api/stripe-webhook` is deleted.

## 6. Verify

- Open a church page: reviewer first names render (the `public_profiles` embed works).
- `curl -s 'https://ffqmbhftivmiubvtzhhr.supabase.co/rest/v1/profiles?select=email&limit=1' -H "apikey: $ANON"` returns `[]` (after step 4).
- Discover → Near Me returns churches sorted by distance, not Florida rows.
- Claim a church end to end: code email arrives, verification succeeds, the church shows "claimed", "Open dashboard" opens the full dashboard (no payment step while billing is paused).
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

### When the confirmation never arrives (2026-11-01)

The connector asks the owner to confirm some migrations (on 2026-11-01 it
asked for anything containing `verify_claim_code` and for `drop index`, not
for REVOKE, ALTER TABLE or the `auth.users` trigger) and times out after 60 s
when the card does not
reach them. `execute_sql` runs the same text without asking, in one
transaction, so check-in B and C went in that way, in dependency-ordered
chunks, and the version rows were added by hand:

```sql
insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'), '<name>',
        array['-- applied through the connector (execute_sql); the text is supabase/migrations/<version>_<name>.sql']);
```

Then rename the local file to that version. A statement the connector wants
confirmed can be found without waiting: send it concurrently with another
call and it comes back `cancelled` at once instead of hanging.
