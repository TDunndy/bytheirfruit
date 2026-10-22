-- Hardening part 5 of 6 — applied to production 2026-10-22.
-- GiST index backing churches_near(); kept in its own migration because it
-- is the slowest statement (191k rows with coordinates).
set search_path = public, extensions;
create index if not exists idx_churches_earth
  on public.churches using gist (extensions.ll_to_earth(latitude::double precision, longitude::double precision))
  where latitude is not null and longitude is not null;
