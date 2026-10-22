# Roadmap: from review site to church-management platform

Status key: **done** (this branch), **next** (ready to start), **later**.

## Security and data integrity

Everything marked done below was applied to production on 2026-10-22 (hardening migration), except the privacy lockdown items that wait for the frontend deploy.

- **done** Users cannot escalate their own role; moderators cannot grant admin.
- **done** Profile PII (email, phone, address, zip, demographics) hidden from the public API; `public_profiles` view for display names.
- **done** Reviews pinned to `pending` on insert and on edit; flag counts and approvals cannot be forged.
- **done** Claimants restricted to profile fields; billing and scores frozen.
- **done** Hashed, expiring claim codes verified server-side; claim hijack closed; free-mail domains rejected when no website exists.
- **done** Reviewer coordinates moved to a moderator-only table; distance and anti-abuse holds computed in the DB.
- **done** JSON-LD XSS on church pages fixed; UUID validation on the SSR route.
- **done** Internal functions no longer callable by anon; `search_path` pinned.
- **next** Enable leaked-password protection and MFA for admins and church owners (dashboard settings).
- **next** Cloudflare Turnstile on signup, review submission, and report forms.
- **later** AI moderation pass on insert (toxicity, named individuals, defamation risk) feeding the existing `ai_moderation` column.

## Product bugs

- **done** Edit window aligned to the 7-day RLS rule.
- **done** Near Me and zip search use a true radius query (`churches_near`); zips geocode from our own data.
- **done** Sitemaps sized to the API row cap; hash URLs removed.
- **done** Dead "browse" route, missing pending badge, admin score column, bulk updates, CSV escaping.
- **done** Stripe redirect no longer blocked by popup blockers.
- **next** Ask for geolocation only on the Discover page, not on first paint.
- **next** Replace ipapi.co free tier (1,000 req/day) with Cloudflare's `cf-ipcountry` / `request.cf` in a Pages Function.

## Engineering foundation

- **done** Versioned migrations with a reconstructed baseline; RLS regression suite; CI running lint, typecheck, build, and migrations+tests.
- **done** Typed Supabase client (PKCE), generated DB types, `src/lib/api` data-access layer.
- **next** Split `ByTheirFruit.tsx` (5k lines) into route components and hooks; remove `@ts-nocheck`.
- **next** Monorepo (`apps/web`, `apps/chms`, `packages/db`, `packages/ui`). See ADR-0001.
- **later** Playwright smoke tests (search, church page, submit review, admin approve).

## Church-management expansion

- **done** Tenancy foundation: `organizations`, `org_members` (owner/admin/staff/volunteer), `subscriptions`, `is_org_member()`, `has_active_subscription()`, auto-synced from claims.
- **next** Auth hook that embeds org roles in the JWT so RLS checks avoid a join.
- **next** Server-created Stripe Checkout sessions and Customer Portal; `subscriptions` becomes the single source of truth (ADR-0003).
- **next** Core ChMS tables with `org_id` + the two helper checks on every policy: `people`, `households`, `groups`, `group_memberships`, `events`, `attendance`, `giving`, `visitor_followups`, `prayer_requests`.
- **next** Nightly rollups (`church_metrics_daily`) via pg_cron; formalize `score_snapshots` and `regional_benchmarks` as views over them.
- **later** Correlations that make the review data valuable to churches: welcome score vs first-time-visitor return rate, kids score vs kids check-in growth, leadership score vs volunteer retention.
- **later** City and state landing pages generated from the 270k listings (largest organic growth lever).
- **later** Invite flow for staff (`org_members`), audit log, data export for churches.

## Product note

The church report flow files "LGBTQ+ affirming" alongside "cult or abusive".
If a doctrinal filter is wanted, a neutral directory attribute carries less
legal and platform-policy risk than a report reason. Unchanged in this branch.
