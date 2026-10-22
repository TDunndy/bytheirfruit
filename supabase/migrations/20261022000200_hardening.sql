-- ============================================================================
-- HARDENING — safe to apply while the pre-migration frontend is still live.
--
-- Closes the critical holes found in the 2026-10-22 review:
--   * any user could set their own role = 'admin'              → protect_profile_columns
--   * users could self-publish reviews / tamper flag counts   → pin_review_columns
--   * church claimants could edit scores / subscription       → protect_church_columns
--   * trigger & definer functions callable by anon             → revokes + search_path
--   * verification code readable by the claimant               → hashed code + verify_claim_code RPC
--   * reviewer home coordinates on a public table              → review_locations (admin-only)
--   * Near Me / zip search scanned arbitrary rows              → churches_near + zip_centroids
--   * client-side anti-abuse checks                            → server-side triggers
-- Everything here is additive or only blocks writes that the legitimate
-- frontend never performs.
-- ============================================================================

set search_path = public, extensions;

create extension if not exists cube          with schema extensions;
create extension if not exists earthdistance with schema extensions;

-- NOTE: the protect_* / pin_* trigger functions below are deliberately
-- SECURITY INVOKER. They decide what to allow by looking at current_user
-- (anon / authenticated vs. postgres / service_role). A SECURITY DEFINER
-- trigger would always run as postgres and the checks would never fire.

-- ----------------------------------------------------------------------------
-- 1. Role helpers
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator'));
$$;

-- True when the statement is NOT coming from an end-user API role, i.e. it
-- runs as postgres / service_role / inside a SECURITY DEFINER function.
create or replace function public.is_privileged()
returns boolean language sql stable set search_path = public as $$
  select current_user not in ('anon', 'authenticated');
$$;

grant execute on function public.is_admin(), public.is_moderator(), public.is_privileged() to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. profiles: protected columns
-- ----------------------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_privileged() then
    return new;
  end if;

  -- Only full admins may touch role, and nobody may hand out / strip admin
  -- through the API except an admin.
  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Only administrators can change roles' using errcode = '42501';
    end if;
  end if;

  -- Moderators and admins may change moderation fields; users may not.
  if (new.status is distinct from old.status
      or new.review_suspended is distinct from old.review_suspended
      or new.suspension_reason is distinct from old.suspension_reason)
     and not public.is_moderator() then
    raise exception 'Not allowed to change moderation fields' using errcode = '42501';
  end if;

  -- Identity / audit fields are never editable through the API.
  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.provider is distinct from old.provider
     or new.created_at is distinct from old.created_at then
    raise exception 'Not allowed to change protected profile fields' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_columns on public.profiles;
create trigger trg_protect_profile_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ----------------------------------------------------------------------------
-- 3. reviews: pin moderation columns, force re-moderation on edit
-- ----------------------------------------------------------------------------
create or replace function public.pin_review_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_privileged() or public.is_moderator() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- user_id is enforced by the RLS WITH CHECK; everything else is pinned.
    new.status := 'pending';
    new.flag_count := 0;
    new.approved_at := null;
    new.approved_by := null;
    new.deleted_at := null;
    new.ai_moderation := null;
    new.ai_summary := null;
    new.edited_at := null;
    new.location_verified := false;
    new.created_at := now();
    return new;
  end if;

  -- UPDATE by the author: only content fields may change, and the review
  -- goes back into the moderation queue.
  if old.status = 'removed' or old.deleted_at is not null then
    raise exception 'This review can no longer be edited' using errcode = '42501';
  end if;
  if new.church_id is distinct from old.church_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Not allowed to change protected review fields' using errcode = '42501';
  end if;

  new.status := 'pending';
  new.flag_count := old.flag_count;
  new.approved_at := null;
  new.approved_by := null;
  new.deleted_at := old.deleted_at;
  new.ai_moderation := old.ai_moderation;
  new.ai_summary := old.ai_summary;
  new.location_verified := old.location_verified;
  new.edited_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pin_review_columns on public.reviews;
create trigger trg_pin_review_columns before insert or update on public.reviews
  for each row execute function public.pin_review_columns();

-- Authors may edit their own review for 7 days; the UI now matches this rule.
-- (The policy already exists; restated here so the rule is in version control.)
drop policy if exists "Users can update own review within 7 days" on public.reviews;
create policy "Users can update own review within 7 days" on public.reviews for update
  using (auth.uid() = user_id and created_at > now() - interval '7 days')
  with check (auth.uid() = user_id);

-- Flagging your own review makes no sense and inflates counts.
create or replace function public.validate_review_flag()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if exists (select 1 from public.reviews where id = new.review_id and user_id = new.flagged_by) then
    raise exception 'You cannot flag your own review' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validate_review_flag on public.review_flags;
create trigger trg_validate_review_flag before insert on public.review_flags
  for each row execute function public.validate_review_flag();

-- ----------------------------------------------------------------------------
-- 4. churches: inserts are always pending; claimants get an allow-list
-- ----------------------------------------------------------------------------
create or replace function public.protect_church_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_privileged() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if public.is_moderator() then
      return new;
    end if;
    new.added_by := auth.uid();
    new.status := 'pending';
    new.approved_at := null;  new.approved_by := null;
    new.claimed_by := null;   new.claimed_at := null;
    new.claim_email := null;  new.claim_verified := false;
    new.subscription_status := null; new.current_period_end := null;
    new.stripe_customer_id := null;  new.stripe_subscription_id := null;
    new.score_teaching := null; new.score_welcome := null; new.score_community := null;
    new.score_worship := null;  new.score_prayer := null;  new.score_kids := null;
    new.score_youth := null;    new.score_leadership := null; new.score_service := null;
    new.score_finances := null; new.score_overall := null;
    new.total_reviews := 0;     new.scores_updated_at := null;
    new.source := 'manual';
    new.created_at := now();
    return new;
  end if;

  -- Billing columns are owned by the Stripe webhook (service role) only.
  if new.subscription_status is distinct from old.subscription_status
     or new.current_period_end is distinct from old.current_period_end
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id then
    raise exception 'Billing fields are managed by the payment system' using errcode = '42501';
  end if;

  if public.is_moderator() then
    return new;
  end if;

  -- Claimant: identity, moderation, ownership and score columns are frozen.
  if new.id is distinct from old.id
     or new.name is distinct from old.name
     or new.city is distinct from old.city
     or new.state is distinct from old.state
     or new.status is distinct from old.status
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.added_by is distinct from old.added_by
     or new.claimed_by is distinct from old.claimed_by
     or new.claimed_at is distinct from old.claimed_at
     or new.claim_email is distinct from old.claim_email
     or new.claim_verified is distinct from old.claim_verified
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at
     or new.total_reviews is distinct from old.total_reviews
     or new.scores_updated_at is distinct from old.scores_updated_at
     or new.score_teaching is distinct from old.score_teaching
     or new.score_welcome is distinct from old.score_welcome
     or new.score_community is distinct from old.score_community
     or new.score_worship is distinct from old.score_worship
     or new.score_prayer is distinct from old.score_prayer
     or new.score_kids is distinct from old.score_kids
     or new.score_youth is distinct from old.score_youth
     or new.score_leadership is distinct from old.score_leadership
     or new.score_service is distinct from old.score_service
     or new.score_finances is distinct from old.score_finances
     or new.score_overall is distinct from old.score_overall then
    raise exception 'Only church profile fields can be edited by a claimant' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_church_columns on public.churches;
create trigger trg_protect_church_columns before insert or update on public.churches
  for each row execute function public.protect_church_columns();

-- ----------------------------------------------------------------------------
-- 5. Function hygiene: pinned search_path, no anon execution of internals
-- ----------------------------------------------------------------------------
alter function public.check_review_rate_limit()          set search_path = public;
alter function public.validate_review_content()          set search_path = public;
alter function public.increment_flag_count()             set search_path = public;
alter function public.recalculate_church_scores()        set search_path = public;
alter function public.recalculate_single_church_scores() set search_path = public;
alter function public.compute_regional_benchmarks()      set search_path = public;
alter function public.notify_new_review()                set search_path = public;
alter function public.soft_delete_review(uuid)           set search_path = public;

-- Trigger-only functions: nobody calls these through the API.
revoke execute on function public.handle_new_user()                 from public, anon, authenticated;
revoke execute on function public.sync_profile_email()              from public, anon, authenticated;
revoke execute on function public.check_review_rate_limit()         from public, anon, authenticated;
revoke execute on function public.validate_review_content()         from public, anon, authenticated;
revoke execute on function public.increment_flag_count()            from public, anon, authenticated;
revoke execute on function public.recalculate_single_church_scores() from public, anon, authenticated;
revoke execute on function public.update_church_score_snapshots()   from public, anon, authenticated;
revoke execute on function public.notify_new_review()               from public, anon, authenticated;
revoke execute on function public.protect_profile_columns()         from public, anon, authenticated;
revoke execute on function public.pin_review_columns()              from public, anon, authenticated;
revoke execute on function public.protect_church_columns()          from public, anon, authenticated;
revoke execute on function public.validate_review_flag()            from public, anon, authenticated;

-- Admin-only RPCs: keep callable by signed-in users but gate inside.
create or replace function public.recalculate_church_scores()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Inside a SECURITY DEFINER body current_user is always the owner, so the
  -- gate must look at the JWT: a signed-in caller has to be a moderator.
  if auth.uid() is not null and not public.is_moderator() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  update churches c set
    score_teaching = sub.avg_teaching, score_welcome = sub.avg_welcome,
    score_community = sub.avg_community, score_worship = sub.avg_worship,
    score_prayer = sub.avg_prayer, score_kids = sub.avg_kids,
    score_youth = sub.avg_youth, score_leadership = sub.avg_leadership,
    score_service = sub.avg_service, score_finances = sub.avg_finances,
    score_overall = (
      coalesce(sub.avg_teaching,0) + coalesce(sub.avg_welcome,0) + coalesce(sub.avg_community,0) +
      coalesce(sub.avg_worship,0) + coalesce(sub.avg_prayer,0) + coalesce(sub.avg_kids,0) +
      coalesce(sub.avg_youth,0) + coalesce(sub.avg_leadership,0) + coalesce(sub.avg_service,0) +
      coalesce(sub.avg_finances,0)
    ) / nullif(
      (sub.avg_teaching is not null)::int + (sub.avg_welcome is not null)::int +
      (sub.avg_community is not null)::int + (sub.avg_worship is not null)::int +
      (sub.avg_prayer is not null)::int + (sub.avg_kids is not null)::int +
      (sub.avg_youth is not null)::int + (sub.avg_leadership is not null)::int +
      (sub.avg_service is not null)::int + (sub.avg_finances is not null)::int, 0),
    total_reviews = sub.cnt,
    scores_updated_at = now()
  from (
    select church_id, count(*) as cnt,
      avg(score_teaching) avg_teaching, avg(score_welcome) avg_welcome,
      avg(score_community) avg_community, avg(score_worship) avg_worship,
      avg(score_prayer) avg_prayer, avg(score_kids) avg_kids,
      avg(score_youth) avg_youth, avg(score_leadership) avg_leadership,
      avg(score_service) avg_service, avg(score_finances) avg_finances
    from reviews where status = 'published' group by church_id
  ) sub
  where c.id = sub.church_id;
end;
$$;
revoke execute on function public.recalculate_church_scores()   from public, anon;
revoke execute on function public.compute_regional_benchmarks() from public, anon, authenticated;
revoke execute on function public.soft_delete_review(uuid)      from public, anon;

-- notify_new_review must never block a review insert if pg_net is unhappy.
create or replace function public.notify_new_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  church_name text; reviewer_name text;
begin
  begin
    select name into church_name from churches where id = new.church_id;
    select display_name into reviewer_name from profiles where id = new.user_id;
    perform net.http_post(
      url := 'https://ffqmbhftivmiubvtzhhr.supabase.co/functions/v1/notify-new-review',
      -- Optional shared secret so the function can reject strangers:
      --   alter database postgres set app.settings.notify_webhook_secret = '<secret>';
      headers := jsonb_build_object('Content-Type', 'application/json')
        || case when coalesce(current_setting('app.settings.notify_webhook_secret', true), '') <> ''
             then jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.notify_webhook_secret', true))
             else '{}'::jsonb end,
      body := jsonb_build_object('record', jsonb_build_object(
        'id', new.id, 'church_id', new.church_id,
        'church_name', coalesce(church_name, 'Unknown Church'),
        'reviewer_name', coalesce(reviewer_name, 'Anonymous'),
        'text', coalesce(new.text, ''), 'status', new.status, 'created_at', new.created_at)));
  exception when others then
    raise warning 'notify_new_review failed: %', sqlerrm;
  end;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. church_claims: Stripe's real status vocabulary + hashed codes
-- ----------------------------------------------------------------------------
alter table public.church_claims drop constraint if exists church_claims_subscription_status_check;
alter table public.church_claims add constraint church_claims_subscription_status_check check (
  subscription_status in ('pending','active','trialing','past_due','unpaid','canceled','cancelled',
                          'expired','incomplete','incomplete_expired','paused'));

alter table public.church_claims
  add column if not exists verification_code_hash text,
  add column if not exists code_expires_at timestamptz,
  add column if not exists verify_attempts int not null default 0;

-- The claimant must never be able to flip these through the API.
create or replace function public.protect_church_claim_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_privileged() or public.is_moderator() then
    return new;
  end if;
  raise exception 'Claims are verified through verify_claim_code()' using errcode = '42501';
end;
$$;
drop trigger if exists trg_protect_church_claim_columns on public.church_claims;
create trigger trg_protect_church_claim_columns before update on public.church_claims
  for each row execute function public.protect_church_claim_columns();
revoke execute on function public.protect_church_claim_columns() from public, anon, authenticated;

-- Server-side verification. Compares the hash, enforces expiry + attempt
-- limits, and performs the church claim itself (the client could never do
-- this under RLS, which is why claims silently failed).
create or replace function public.verify_claim_code(p_church_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.church_claims%rowtype;
  v_hash text;
begin
  if v_uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into v_claim from public.church_claims
  where church_id = p_church_id and user_id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No pending claim found. Please request a new code.');
  end if;
  if v_claim.verified then
    return jsonb_build_object('ok', true, 'already_verified', true);
  end if;
  if v_claim.verify_attempts >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Too many attempts. Please request a new code.');
  end if;
  if v_claim.code_expires_at is null or v_claim.code_expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'This code has expired. Please request a new code.');
  end if;

  v_hash := encode(extensions.digest(trim(p_code), 'sha256'), 'hex');
  if v_claim.verification_code_hash is null or v_hash <> v_claim.verification_code_hash then
    update public.church_claims set verify_attempts = verify_attempts + 1 where id = v_claim.id;
    return jsonb_build_object('ok', false, 'error', 'Incorrect code. Please check your email and try again.');
  end if;

  if exists (select 1 from public.churches where id = p_church_id and claimed_by is not null and claimed_by <> v_uid) then
    return jsonb_build_object('ok', false, 'error', 'This church has already been claimed.');
  end if;

  update public.church_claims
    set verified = true, verified_at = now(), verification_code_hash = null
    where id = v_claim.id;

  update public.churches
    set claimed_by = v_uid, claimed_at = now(), claim_email = v_claim.claim_email, claim_verified = true
    where id = p_church_id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.verify_claim_code(uuid, text) from public, anon;
grant  execute on function public.verify_claim_code(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Reviewer locations move off the public reviews table
-- ----------------------------------------------------------------------------
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
-- privacy migration once the new frontend is live).
insert into public.review_locations (review_id, user_id, lat, lng, distance_miles, created_at)
select id, user_id, reviewer_lat, reviewer_lng, distance_miles, created_at
from public.reviews where reviewer_lat is not null and reviewer_lng is not null
on conflict (review_id) do nothing;

-- Distance + anti-abuse computed server-side (replaces the client-side logic).
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

-- Multi-state activity check (was client-side and therefore optional).
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

-- ----------------------------------------------------------------------------
-- 8. Public profile view: what the world may know about a reviewer
-- ----------------------------------------------------------------------------
create or replace view public.public_profiles
  with (security_invoker = false) as
  select id, display_name, avatar_url, created_at
  from public.profiles;
grant select on public.public_profiles to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. Aggregate demographics for church owners (k-anonymity, min 5 reviews)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 10. Geo search: radius query with a GiST index, and zip centroids derived
--     from the church dataset itself (no third-party geocoder needed).
-- ----------------------------------------------------------------------------
create index if not exists idx_churches_earth
  on public.churches using gist (extensions.ll_to_earth(latitude::double precision, longitude::double precision))
  where latitude is not null and longitude is not null;
-- pg_trgm lives in `public` on the production project and in `extensions`
-- on fresh stacks; the opclass is resolved through search_path on purpose.
create index if not exists idx_churches_city_trgm on public.churches using gin (city gin_trgm_ops);
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

-- ----------------------------------------------------------------------------
-- 11. Input sanity on anonymous write endpoints
-- ----------------------------------------------------------------------------
alter table public.abuse_reports drop constraint if exists abuse_reports_description_len;
alter table public.abuse_reports add constraint abuse_reports_description_len check (char_length(description) <= 5000);
alter table public.church_reports drop constraint if exists church_reports_description_len;
alter table public.church_reports add constraint church_reports_description_len check (description is null or char_length(description) <= 5000);
alter table public.newsletter_subscribers drop constraint if exists newsletter_subscribers_email_format;
alter table public.newsletter_subscribers add constraint newsletter_subscribers_email_format
  check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254);
alter table public.reviews drop constraint if exists reviews_text_len;
alter table public.reviews add constraint reviews_text_len check (char_length(text) <= 10000);
