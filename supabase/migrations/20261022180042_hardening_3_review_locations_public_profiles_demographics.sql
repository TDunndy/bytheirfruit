-- Hardening part 3 of 6 — applied to production 2026-10-22 (version assigned
-- by the connector; it sorts before parts 2a/2b, which is fine: nothing here
-- depends on them). Reviewer coordinates move to a moderator-only table, the
-- world reads profiles through public_profiles, demographics are aggregated.
set search_path = public, extensions;

create table if not exists public.review_locations (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  distance_miles double precision,
  created_at timestamptz default now()
);
alter table public.review_locations enable row level security;
drop policy if exists "Reviewers insert own location" on public.review_locations;
create policy "Reviewers insert own location" on public.review_locations for insert
  with check (auth.uid() = user_id and exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid()));
drop policy if exists "Admins read locations" on public.review_locations;
create policy "Admins read locations" on public.review_locations for select using (public.is_moderator());

-- Copy whatever is already there (reviews.reviewer_lat/lng are dropped in the
-- privacy migration once the new frontend is live). Runs before the trigger
-- below exists, so no anti-abuse side effects on historical rows.
insert into public.review_locations (review_id, user_id, lat, lng, distance_miles, created_at)
select id, user_id, reviewer_lat, reviewer_lng, distance_miles, created_at
from public.reviews where reviewer_lat is not null and reviewer_lng is not null
on conflict (review_id) do nothing;

create or replace function public.process_review_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_church public.churches%rowtype;
  v_dist double precision;
begin
  select c.* into v_church from public.churches c join public.reviews r on r.church_id = c.id where r.id = new.review_id;
  if v_church.latitude is not null and v_church.longitude is not null then
    v_dist := extensions.earth_distance(
      extensions.ll_to_earth(new.lat, new.lng),
      extensions.ll_to_earth(v_church.latitude::double precision, v_church.longitude::double precision)) / 1609.344;
    new.distance_miles := round(v_dist::numeric, 1);
    update public.reviews set location_verified = (v_dist <= 50) where id = new.review_id;
    if v_dist > 50 then
      update public.profiles
        set review_suspended = true,
            suspension_reason = format('Auto-flagged: submitted experience from %s miles away from %s', round(v_dist), v_church.name)
        where id = new.user_id and review_suspended = false;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.process_review_location() from public, anon, authenticated;
drop trigger if exists trg_process_review_location on public.review_locations;
create trigger trg_process_review_location before insert on public.review_locations
  for each row execute function public.process_review_location();

create or replace function public.check_multi_state_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_states int;
begin
  select count(distinct c.state) into v_states
  from public.reviews r join public.churches c on c.id = r.church_id
  where r.user_id = new.user_id and r.deleted_at is null;
  if v_states >= 3 then
    update public.profiles
      set review_suspended = true,
          suspension_reason = format('Auto-flagged: reviewed churches across %s states', v_states)
      where id = new.user_id and review_suspended = false;
  end if;
  return new;
end;
$$;
revoke execute on function public.check_multi_state_activity() from public, anon, authenticated;
drop trigger if exists trg_check_multi_state_activity on public.reviews;
create trigger trg_check_multi_state_activity after insert on public.reviews
  for each row execute function public.check_multi_state_activity();

-- Intentionally a SECURITY DEFINER view (Supabase lint 0010): it exposes four
-- safe columns of the now-private profiles table, and PostgREST can only
-- embed a view or table, not a function.
create or replace view public.public_profiles
  with (security_invoker = false) as
  select id, display_name, avatar_url, created_at
  from public.profiles;
grant select on public.public_profiles to anon, authenticated, service_role;

create or replace function public.church_reviewer_demographics(p_church_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_total int;
  v_min constant int := 5;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_moderator()
     and not exists (select 1 from public.churches where id = p_church_id and claimed_by = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select count(*) into v_total from public.reviews
  where church_id = p_church_id and status = 'published' and deleted_at is null;
  if v_total < v_min then
    return jsonb_build_object('total', v_total, 'suppressed', true, 'min_required', v_min);
  end if;
  return (
    with r as (
      select rv.reviewer_role, p.gender, p.age_range, p.income_bracket
      from public.reviews rv join public.profiles p on p.id = rv.user_id
      where rv.church_id = p_church_id and rv.status = 'published' and rv.deleted_at is null
    )
    select jsonb_build_object(
      'total', v_total, 'suppressed', false,
      'gender', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(gender,'Not specified') k, count(*) n from r group by 1) g),
      'age',    (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(age_range,'Not specified') k, count(*) n from r group by 1) a),
      'income', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(income_bracket,'Not specified') k, count(*) n from r group by 1) i),
      'role',   (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (select coalesce(reviewer_role,'Not specified') k, count(*) n from r group by 1) o)
    )
  );
end;
$$;
revoke execute on function public.church_reviewer_demographics(uuid) from public, anon;
grant  execute on function public.church_reviewer_demographics(uuid) to authenticated;

alter table public.abuse_reports drop constraint if exists abuse_reports_description_len;
alter table public.abuse_reports add constraint abuse_reports_description_len check (char_length(description) <= 5000);
alter table public.church_reports drop constraint if exists church_reports_description_len;
alter table public.church_reports add constraint church_reports_description_len check (description is null or char_length(description) <= 5000);
alter table public.newsletter_subscribers drop constraint if exists newsletter_subscribers_email_format;
alter table public.newsletter_subscribers add constraint newsletter_subscribers_email_format
  check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254);
alter table public.reviews drop constraint if exists reviews_text_len;
alter table public.reviews add constraint reviews_text_len check (char_length(text) <= 10000);
