# Working in this repository

## What this is
Church reviews site (Next.js static export on Cloudflare Pages) backed by
Supabase, with a paid church dashboard. A church-management product will be
built on the same database. Read `README.md`, then `docs/ROADMAP.md`.

## Platform principles
From `docs/specs/checkin-and-rules.md` §1; they apply to every vertical.

1. **Multi-church, config-driven.** Every row is scoped to a church and protected by RLS. No church-specific logic in code — LWR's setup is data, not code.
2. **Log everything, delete nothing.** Every action writes an immutable event: who, what, when (device time + server time), which device/station. Current state is derived from the log or kept in sync with it. Soft-delete only. Store UTC; each church has a time zone.
3. **One attendance core.** Kids check-in, volunteer check-in, events (Parents Night Out, VBS) and groups all share one schedule → occurrence → location → check-in model. No kids-only tables.
4. **Rules are platform-level.** Every vertical emits domain events (`checkin.created`, `person.created`, …). Emit them from day one, before the engine exists.
5. **Offline-tolerant clients.** Client-generated UUIDs (v7) + idempotent writes, so a station can queue during a Wi-Fi drop and sync with no duplicates.
6. **Least privilege for kids' data.** Role-scoped access (a room volunteer sees their room, not the database). Log who views or edits child records.

## Rules that matter
- Schema changes go in `supabase/migrations/` only. Never edit production through
  the dashboard without a matching migration.
- Run `npm run test:db` after any SQL change. Add a test in
  `supabase/tests/rls_security.sql` for every new policy or trigger.
- Authorization lives in Postgres (RLS + triggers). UI checks are convenience only.
- Trigger functions that inspect `current_user` (the `protect_*` / `pin_*`
  family) must stay `SECURITY INVOKER`. Inside a `SECURITY DEFINER` body use
  `auth.uid()` / `auth.role()` for gating, never `is_privileged()`.
- New SQL functions: pin `search_path`, revoke `execute` from `anon` unless
  the public site needs it.
- `public_profiles` is deliberately a SECURITY DEFINER view (lint 0010); keep it.
- Migration file names must match the versions recorded in production
  (`supabase migration list`); when the connector applies a migration, rename
  the local file to the version it assigned.
- `profiles` is private. Public code reads `public_profiles`. Never expose
  email, phone, address, zip, or demographics per person; aggregate only
  (see `church_reviewer_demographics`).
- Reviewer anonymity is a product guarantee: churches see first names only and
  never a reviewer's history across churches.
- Put new queries in `src/lib/api/`, typed against `src/lib/database.types.ts`
  (regenerate with `npm run db:types`). Do not add new inline queries to the
  legacy components.
- The two legacy components keep `// @ts-nocheck` above `"use client"`;
  everything else is strict TypeScript and must pass `npm run typecheck`.
- Edge function secrets are documented in `docs/RUNBOOK-migrations.md`. Never
  commit keys; the anon key is public and fine.

## Commands
```
npm run dev | lint | typecheck | build
npm run test:db          # migrations + RLS tests on a local Postgres
npm run db:types         # same, plus regenerate database.types.ts
```

## Check-in (migrations A–C, ADR-0005)
- `attendance_events`, `checkin_sessions`, `security_codes`, `station_alerts`,
  `access_log`, `chms_audit`, `people_audit`, `domain_events` and
  `chms_private.audit_actors` are append-only for everyone, the database owner
  included. Never add an UPDATE/DELETE policy or drop a `deny_changes` trigger.
  Write attendance only through `ingest()`.
- Permissions are the one list in `chms_private.all_permissions()`. `kids.view`
  gates children in the directory; `kids.care` care notes and restriction
  reasons; `custody.manage` pickups and custody documents; `checkin.manage`
  configuration; `checkin.station` running a station. Care and custody imply
  `kids.view` (CHECK on `org_roles`).
- Stations are auth users with `app_metadata.kind = 'station'`, known only
  through `chms_private.station_principals` (`chms_private.my_station()`).
  Never trust the token's `station_id` claim. Every public RPC granted to
  `authenticated` must refuse `public.is_station()` unless stations need it.
- Room criteria, ages, grades and labels are computed in `packages/core`
  (pure TypeScript, vitest); `chms_private.check_room_criteria` mirrors
  `isCriteria`. Change both together.
- Events carry ids and codes, never names or free text.

## Church app (`apps/chms`)
- Separate Next.js app with its own `package.json`; run `npm ci` and its
  scripts inside `apps/chms`. It imports DB types only (`import type` from
  `@db/database.types`), never runtime code from the root `src/`.
- Every ChMS table carries `org_id` and RLS through `has_org_permission` /
  `is_org_member`. No ChMS table, view or function may join `people` to
  `reviews` or `profiles` (reviewer anonymity; ADR-0004).
- Hosted at app.bytheirfruit.church by the Cloudflare Worker `bytheirfruit-chms`
  (static assets). Workers Builds deploys every push to `main` using
  `apps/chms/wrangler.jsonc`; its `name` must match the Worker's name.
