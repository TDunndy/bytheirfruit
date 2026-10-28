# Working in this repository

## What this is
Church reviews site (Next.js static export on Cloudflare Pages) backed by
Supabase, with a paid church dashboard. A church-management product will be
built on the same database. Read `README.md`, then `docs/ROADMAP.md`.

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

## Church app (`apps/chms`)
- Separate Next.js app with its own `package.json`; run `npm ci` and its
  scripts inside `apps/chms`. It imports DB types only (`import type` from
  `@db/database.types`), never runtime code from the root `src/`.
- Every ChMS table carries `org_id` and RLS through `has_org_permission` /
  `is_org_member`. No ChMS table, view or function may join `people` to
  `reviews` or `profiles` (reviewer anonymity; ADR-0004).
