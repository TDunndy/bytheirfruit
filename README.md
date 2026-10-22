# By Their Fruit

Church reviews written by congregants, plus a paid dashboard for churches.
Live at https://bytheirfruit.church.

## Architecture

| Layer | What | Where |
|---|---|---|
| Public site | Next.js 14 static export (`output: 'export'`) | `src/` → Cloudflare Pages |
| Church pages for crawlers | Cloudflare Pages Function injecting meta + JSON-LD into the SPA shell | `functions/church/[[path]].ts` |
| Sitemaps | Cloudflare Pages Functions | `functions/sitemap*.ts` |
| Database, auth, storage | Supabase project `ffqmbhftivmiubvtzhhr` | `supabase/migrations/` |
| Server-side logic | Supabase Edge Functions (Deno) | `supabase/functions/` |
| Billing | Stripe Payment Link → `stripe-webhook` edge function → `churches.subscription_status` + `subscriptions` | `supabase/functions/stripe-webhook` |
| Email | Resend | edge functions |
| Analytics | PostHog | `src/app/layout.tsx` |

The database schema is **only** changed through files in `supabase/migrations/`.
`scripts/db-test.sh` applies every migration to a throwaway Postgres and runs
`supabase/tests/rls_security.sql`, which asserts the security model below.

## Security model (enforced in Postgres, not in the UI)

- Row level security on every table. The anon key in the bundle is public by design.
- `profiles` is readable only by its owner and moderators; the world reads the
  `public_profiles` view (id, display name, avatar). The view is intentionally
  SECURITY DEFINER (Supabase lint 0010): PostgREST can only embed a view or
  table, and this is the one place a private table is exposed on purpose.
- Users cannot change their own `role`, `status` or moderation flags
  (`protect_profile_columns` trigger). Only admins change roles.
- Reviews always enter as `pending`; authors can edit content for 7 days and the
  review returns to the queue (`pin_review_columns`).
- Church claimants can edit profile fields only; scores, status, ownership and
  billing columns are frozen (`protect_church_columns`).
- Claims are verified by `verify_claim_code()` against a hashed code; the RPC is
  what sets `claimed_by`.
- Reviewer coordinates live in `review_locations` (moderators only). The DB
  computes distance and applies anti-abuse holds.
- Tenancy foundation for the church-management product: `organizations`,
  `org_members`, `subscriptions`, `is_org_member()`, `has_active_subscription()`.

## Local development

```bash
npm install
npm run dev            # http://localhost:3000 against production Supabase (anon key, RLS)
npm run lint
npm run typecheck
npm run build          # static export to out/
```

Database work (needs a local Postgres 16 with contrib extensions, or `supabase start`):

```bash
npm run test:db                                  # apply migrations + run RLS tests
DB_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres npm run test:db
npm run db:types                                 # also regenerates src/lib/database.types.ts
```

Point the app at a local stack with `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.

## Deploying

- **Site:** every push to `main` is built by Cloudflare Pages (`npm run build`, output `out/`).
- **Database:** `npx supabase link --project-ref ffqmbhftivmiubvtzhhr` once, then
  `npx supabase db push`. Read `docs/RUNBOOK-migrations.md` first; the privacy
  migration must follow the frontend deploy.
- **Edge functions:** `npx supabase functions deploy <name>`. Secrets are listed in
  the runbook.

## Repository map

```
src/app/                 Next.js app shell (layout, two client pages)
src/components/          ByTheirFruit.tsx (public app), AdminDashboard.tsx (admin) — legacy, untyped
src/lib/supabase.ts      typed client (PKCE)
src/lib/api/             typed data-access layer shared with the future ChMS
src/lib/database.types.ts generated from the migrated schema
functions/               Cloudflare Pages Functions (SEO shell, sitemaps)
supabase/migrations/     versioned schema: placeholders for pre-2026-10 history, 0100 baseline,
                         seven hardening parts (versions assigned by the connector), privacy, organizations
supabase/tests/          RLS regression tests (plain SQL, run by scripts/db-test.sh)
supabase/functions/      edge functions (Deno)
docs/                    runbook, ADRs, roadmap
```

## Docs

- `docs/RUNBOOK-migrations.md` — exact apply order and secrets
- `docs/ROADMAP.md` — what is done and what comes next for the church-management expansion
- `docs/adr/` — architecture decisions (hosting, tenancy, billing)
