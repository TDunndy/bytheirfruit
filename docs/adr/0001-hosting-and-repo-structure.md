# ADR-0001: Hosting and repository structure for the expansion

**Status:** accepted (2026-10-22)

## Context

The public site is a Next.js static export on Cloudflare Pages with a handful
of Pages Functions for SEO. A church-management product needs authenticated
server routes, background jobs, file handling and a much larger UI surface.

## Decision

1. Keep the public reviews site as a static export on Cloudflare Pages. It is
   cheap, fast, and the SEO shell function already works.
2. Build the church-management app as a separate Next.js app with a server
   runtime (Cloudflare via `@opennextjs/cloudflare`, or Vercel) so it can use
   route handlers, server components and middleware.
3. Move to a monorepo once the second app exists:
   `apps/web`, `apps/chms`, `packages/db` (migrations, generated types, the
   `src/lib/api` layer), `packages/ui` (theme tokens, ScoreBar, etc.).
4. Supabase remains the single backend. Schema changes happen only through
   `supabase/migrations`; RLS plus the `is_org_member` / `has_active_subscription`
   helpers are the authorization model for both apps.

## Consequences

- No big-bang rewrite of the public site; it is split into routes incrementally.
- The data-access layer in `src/lib/api` is written so it can be lifted into
  `packages/db` unchanged.
- Two deploy targets, one database, one set of migrations.
