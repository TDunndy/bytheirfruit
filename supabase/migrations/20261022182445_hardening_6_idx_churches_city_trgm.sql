-- Hardening part 6 of 6 — applied to production 2026-10-22.
-- Trigram index for city search. pg_trgm lives in `public` on the production
-- project and in `extensions` on fresh stacks; the opclass resolves through
-- search_path on purpose.
set search_path = public, extensions;
create index if not exists idx_churches_city_trgm on public.churches using gin (city gin_trgm_ops);
