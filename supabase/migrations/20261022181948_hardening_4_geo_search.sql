-- Hardening part 4 of 6 — applied to production 2026-10-22.
-- Radius search in the database (backed by idx_churches_earth, part 5) and
-- zip centroids derived from the church dataset itself, so Near Me and zip
-- search no longer sort an arbitrary 500-row slice or call a third-party
-- geocoder. zip_centroids is a read-only aggregate, selectable by anon on
-- purpose (Supabase lint 0016).
set search_path = public, extensions;

create index if not exists idx_churches_zip on public.churches (zip text_pattern_ops);

create or replace function public.churches_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles double precision default 50,
  p_denomination text default null,
  p_state text default null,
  p_query text default null,
  p_limit int default 50
)
returns table (
  id uuid, name text, denomination text, city text, state text, address text, zip text,
  latitude numeric, longitude numeric, website text, phone text, email text,
  size text, service_style text, service_times text, total_reviews int,
  score_teaching numeric, score_welcome numeric, score_community numeric, score_worship numeric,
  score_prayer numeric, score_kids numeric, score_youth numeric, score_leadership numeric,
  score_service numeric, score_finances numeric, score_overall numeric,
  status text, claimed_by uuid, claimed_at timestamptz, subscription_status text,
  distance_miles double precision
)
language sql stable security invoker set search_path = public, extensions as $$
  select c.id, c.name, c.denomination, c.city, c.state, c.address, c.zip,
         c.latitude, c.longitude, c.website, c.phone, c.email,
         c.size, c.service_style, c.service_times, c.total_reviews,
         c.score_teaching, c.score_welcome, c.score_community, c.score_worship,
         c.score_prayer, c.score_kids, c.score_youth, c.score_leadership,
         c.score_service, c.score_finances, c.score_overall,
         c.status, c.claimed_by, c.claimed_at, c.subscription_status,
         round((extensions.earth_distance(
            extensions.ll_to_earth(p_lat, p_lng),
            extensions.ll_to_earth(c.latitude::double precision, c.longitude::double precision)) / 1609.344)::numeric, 1)::double precision
  from public.churches c
  where c.latitude is not null and c.longitude is not null
    and c.status = 'approved'
    and extensions.earth_box(extensions.ll_to_earth(p_lat, p_lng), least(greatest(p_radius_miles, 1), 300) * 1609.344)
        @> extensions.ll_to_earth(c.latitude::double precision, c.longitude::double precision)
    and extensions.earth_distance(extensions.ll_to_earth(p_lat, p_lng),
          extensions.ll_to_earth(c.latitude::double precision, c.longitude::double precision))
        <= least(greatest(p_radius_miles, 1), 300) * 1609.344
    and (p_denomination is null or p_denomination = 'All' or c.denomination = p_denomination)
    and (p_state is null or p_state = 'All' or c.state = p_state)
    and (p_query is null or p_query = '' or c.name ilike '%' || p_query || '%')
  order by 32 asc, c.total_reviews desc
  limit least(greatest(p_limit, 1), 200);
$$;
grant execute on function public.churches_near(double precision, double precision, double precision, text, text, text, int) to anon, authenticated, service_role;

create materialized view if not exists public.zip_centroids as
  select left(zip, 5) as zip,
         avg(latitude)::double precision as lat,
         avg(longitude)::double precision as lng,
         count(*)::int as church_count
  from public.churches
  where latitude is not null and longitude is not null and zip ~ '^[0-9]{5}'
  group by left(zip, 5);
create unique index if not exists idx_zip_centroids_zip on public.zip_centroids (zip);
grant select on public.zip_centroids to anon, authenticated, service_role;

create or replace function public.geocode_zip(p_zip text)
returns table (lat double precision, lng double precision, church_count int)
language sql stable security invoker set search_path = public as $$
  select lat, lng, church_count from public.zip_centroids where zip = left(regexp_replace(p_zip, '[^0-9]', '', 'g'), 5);
$$;
grant execute on function public.geocode_zip(text) to anon, authenticated, service_role;

create or replace function public.refresh_zip_centroids()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.zip_centroids;
end;
$$;
revoke execute on function public.refresh_zip_centroids() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $x$
      select cron.schedule('refresh-zip-centroids', '30 3 * * 0', 'select public.refresh_zip_centroids()')
      where not exists (select 1 from cron.job where jobname = 'refresh-zip-centroids')
    $x$;
  end if;
end $$;
