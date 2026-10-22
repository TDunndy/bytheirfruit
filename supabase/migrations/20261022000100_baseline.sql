-- ============================================================================
-- BASELINE — reconstructed from the live project (ffqmbhftivmiubvtzhhr)
-- on 2026-10-22. This captures everything that existed before migrations
-- were versioned: tables, constraints, indexes, functions, triggers, RLS,
-- storage bucket and cron job.
--
-- For the EXISTING production project this migration must be marked as
-- already applied (it is), never executed:
--   supabase migration repair --status applied 20261022000100
-- For a fresh project / local stack it builds the schema from scratch.
-- ============================================================================

-- Extensions ---------------------------------------------------------------
set search_path = public, extensions;
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto   with schema extensions;
create extension if not exists pg_trgm    with schema extensions;

-- ============================================================================
-- TABLES
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  provider text,
  role text default 'user' check (role in ('user','moderator','admin','church_admin')),
  status text default 'active' check (status in ('active','suspended','banned')),
  created_at timestamptz default now(),
  last_active_at timestamptz default now(),
  review_suspended boolean default false,
  suspension_reason text,
  gender text,
  age_range text,
  income_bracket text,
  phone text,
  email text,
  address text,
  zip_code text
);

create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text not null,
  state text not null default 'FL',
  zip text,
  latitude numeric,
  longitude numeric,
  denomination text default 'Non-Denominational',
  size text,
  service_style text,
  service_times text,
  website text,
  phone text,
  email text,
  source text default 'manual' check (source in ('seed','google','manual')),
  added_by uuid references public.profiles(id),
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  score_teaching numeric, score_welcome numeric, score_community numeric,
  score_worship numeric, score_prayer numeric, score_kids numeric,
  score_youth numeric, score_leadership numeric, score_service numeric,
  score_finances numeric, score_overall numeric,
  total_reviews int default 0,
  scores_updated_at timestamptz,
  service_days jsonb,
  avg_attendance int,
  staff_count int,
  volunteer_count int,
  campus_count int default 1,
  programs text[],
  facebook_url text, instagram_url text, youtube_url text, livestream_url text,
  pastor_name text,
  year_founded int,
  description text,
  created_at timestamptz default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  claim_email text,
  claim_verified boolean default false,
  subscription_status text,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_role text not null,
  text text not null,
  score_teaching int check (score_teaching between 1 and 5),
  score_welcome int check (score_welcome between 1 and 5),
  score_community int check (score_community between 1 and 5),
  score_worship int check (score_worship between 1 and 5),
  score_prayer int check (score_prayer between 1 and 5),
  score_kids int check (score_kids between 1 and 5),
  score_youth int check (score_youth between 1 and 5),
  score_leadership int check (score_leadership between 1 and 5),
  score_service int check (score_service between 1 and 5),
  score_finances int check (score_finances between 1 and 5),
  comment_teaching text, comment_welcome text, comment_community text,
  comment_worship text, comment_prayer text, comment_kids text,
  comment_youth text, comment_leadership text, comment_service text,
  comment_finances text,
  status text default 'pending' check (status in ('pending','published','flagged','removed','hidden')),
  flag_count int default 0,
  ai_moderation jsonb,
  ai_summary text,
  edited_at timestamptz,
  created_at timestamptz default now(),
  deleted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  reviewer_lat double precision,
  reviewer_lng double precision,
  distance_miles double precision,
  location_verified boolean default false,
  last_visited text,
  unique (church_id, user_id)
);

create table if not exists public.review_flags (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  flagged_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('inappropriate','spam','personal_attack','fake','other')),
  details text,
  created_at timestamptz default now(),
  unique (review_id, flagged_by)
);

create table if not exists public.claim_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  role_at_church text not null,
  work_email text not null,
  phone text,
  message text,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  payment_verified boolean default false,
  stripe_subscription_id text,
  unique (church_id, user_id)
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, church_id)
);

create table if not exists public.church_responses (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  church_id uuid not null references public.churches(id) on delete cascade,
  responder_id uuid not null references public.profiles(id),
  text text not null,
  created_at timestamptz default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_session_id text,
  customer_email text,
  amount_cents int,
  currency text default 'usd',
  payment_status text not null default 'pending',
  event_type text,
  created_at timestamptz default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  subscribed_at timestamptz default now(),
  unsubscribed boolean default false
);

create table if not exists public.review_likes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (review_id, user_id)
);

create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('church_leader','financial','spiritual','sexual','discrimination','other')),
  church_name text,
  church_city text,
  church_state text,
  description text not null check (char_length(description) >= 20),
  contact_method text,
  submitted_at timestamptz default now()
);

create table if not exists public.church_claims (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null unique references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_email text not null,
  verification_code text,
  verified boolean default false,
  verified_at timestamptz,
  subscription_status text default 'pending' check (subscription_status in ('pending','active','expired','cancelled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_payment_id text,
  created_at timestamptz default now()
);

create table if not exists public.church_reports (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('not_christian','lgbtq_affirming','false_teaching','cult_or_abusive','closed_or_moved','duplicate','other')),
  description text,
  status text default 'pending' check (status in ('pending','reviewed','actioned','dismissed')),
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz default now()
);

create table if not exists public.regional_benchmarks (
  id uuid primary key default gen_random_uuid(),
  region_type text not null check (region_type in ('national','state','city')),
  region_value text not null,
  category text not null,
  avg_score numeric,
  church_count int,
  review_count int,
  last_updated timestamptz default now(),
  created_at timestamptz default now(),
  unique (region_type, region_value, category)
);

create table if not exists public.score_snapshots (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  category text not null,
  score_value numeric,
  snapshot_date date not null,
  review_count int,
  created_at timestamptz default now(),
  unique (church_id, category, snapshot_date)
);

create table if not exists public.review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  storage_path text not null,
  file_name text not null,
  file_size int,
  mime_type text,
  caption text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references public.churches(id) on delete set null,
  stripe_event_id text not null unique,
  event_type text not null,
  status text,
  amount_cents int,
  raw jsonb,
  created_at timestamptz default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
create unique index if not exists idx_churches_unique_name_location
  on public.churches (lower(trim(name)), lower(trim(coalesce(city,''))), lower(trim(coalesce(state,''))));
create index if not exists idx_churches_name_trgm on public.churches using gin (name gin_trgm_ops);
create index if not exists idx_churches_denomination on public.churches (denomination);
create index if not exists idx_churches_total_reviews on public.churches (total_reviews desc);
create index if not exists idx_churches_state_reviews on public.churches (state, total_reviews desc);
create index if not exists idx_churches_sub_status on public.churches (subscription_status);
create index if not exists idx_churches_stripe_customer on public.churches (stripe_customer_id);
create index if not exists idx_churches_stripe_subscription on public.churches (stripe_subscription_id);
create index if not exists idx_churches_period_end on public.churches (current_period_end);

create index if not exists idx_reviews_status on public.reviews (status);
create index if not exists idx_reviews_church_user on public.reviews (church_id, user_id);
create index if not exists idx_reviews_user_date on public.reviews (user_id, created_at);
create index if not exists idx_reviews_status_church on public.reviews (church_id, status)
  where status = 'published' and deleted_at is null;

create index if not exists idx_church_responses_review on public.church_responses (review_id);
create index if not exists idx_claim_requests_user_status on public.claim_requests (user_id, status);
create index if not exists idx_payments_user on public.payments (user_id);
create index if not exists idx_payments_subscription on public.payments (stripe_subscription_id);
create index if not exists idx_review_likes_review_id on public.review_likes (review_id);
create index if not exists idx_review_likes_user_id on public.review_likes (user_id);
create index if not exists idx_review_photos_review_id on public.review_photos (review_id);
create index if not exists idx_regional_benchmarks_lookup on public.regional_benchmarks (region_type, region_value, category);
create index if not exists idx_score_snapshots_church_date on public.score_snapshots (church_id, snapshot_date);
create index if not exists idx_score_snapshots_category on public.score_snapshots (church_id, category, snapshot_date);
create index if not exists idx_subscription_events_church on public.subscription_events (church_id);
create index if not exists idx_subscription_events_created on public.subscription_events (created_at);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, provider, phone, address, zip_code, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_app_meta_data->>'provider', 'email'),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'address', ''),
    nullif(new.raw_user_meta_data->>'zip_code', ''),
    new.email
  );
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.check_review_rate_limit()
returns trigger language plpgsql security definer as $$
declare
  daily_count int;
  user_status text;
  user_suspended boolean;
begin
  select status, review_suspended into user_status, user_suspended
  from profiles where id = new.user_id;

  if user_status = 'banned' then
    raise exception 'Your account has been banned.';
  end if;
  if user_status = 'suspended' or user_suspended = true then
    raise exception 'Your reviewing ability has been temporarily paused.';
  end if;

  select count(*) into daily_count
  from reviews
  where user_id = new.user_id
    and created_at >= current_date
    and created_at < current_date + interval '1 day';

  if daily_count >= 3 then
    raise exception 'Daily review limit reached. You can submit up to 3 reviews per day.';
  end if;
  return new;
end;
$$;

create or replace function public.validate_review_content()
returns trigger language plpgsql security definer as $$
begin
  if length(trim(new.text)) < 20 then
    raise exception 'Review must be at least 20 characters long.';
  end if;
  if (
    (case when new.score_teaching   is not null then 1 else 0 end) +
    (case when new.score_welcome    is not null then 1 else 0 end) +
    (case when new.score_community  is not null then 1 else 0 end) +
    (case when new.score_worship    is not null then 1 else 0 end) +
    (case when new.score_prayer     is not null then 1 else 0 end) +
    (case when new.score_kids       is not null then 1 else 0 end) +
    (case when new.score_youth      is not null then 1 else 0 end) +
    (case when new.score_leadership is not null then 1 else 0 end) +
    (case when new.score_service    is not null then 1 else 0 end) +
    (case when new.score_finances   is not null then 1 else 0 end)
  ) < 1 then
    raise exception 'Please rate at least 1 category.';
  end if;
  return new;
end;
$$;

create or replace function public.increment_flag_count()
returns trigger language plpgsql security definer as $$
begin
  update reviews set flag_count = flag_count + 1 where id = new.review_id;
  update reviews set status = 'flagged' where id = new.review_id and flag_count >= 3;
  return new;
end;
$$;

create or replace function public.recalculate_church_scores()
returns void language plpgsql security definer as $$
begin
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

create or replace function public.recalculate_single_church_scores()
returns trigger language plpgsql security definer as $$
declare
  target_church_id uuid;
begin
  if tg_op = 'DELETE' then target_church_id := old.church_id; else target_church_id := new.church_id; end if;

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
    from reviews where status = 'published' and church_id = target_church_id
    group by church_id
  ) sub
  where c.id = sub.church_id;

  if not found then
    update churches set
      score_teaching = null, score_welcome = null, score_community = null,
      score_worship = null, score_prayer = null, score_kids = null,
      score_youth = null, score_leadership = null, score_service = null,
      score_finances = null, score_overall = null,
      total_reviews = 0, scores_updated_at = now()
    where id = target_church_id;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.update_church_score_snapshots()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_church_id uuid; v_category text; v_score numeric; v_count int; v_snapshot_date date;
  v_categories text[] := array['teaching','welcome','community','worship','prayer','kids','youth','leadership','service','finances'];
begin
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') and new.status = 'published' then
    v_church_id := new.church_id;
    v_snapshot_date := current_date;
    foreach v_category in array v_categories loop
      select
        avg(case
          when v_category = 'teaching' then r.score_teaching when v_category = 'welcome' then r.score_welcome
          when v_category = 'community' then r.score_community when v_category = 'worship' then r.score_worship
          when v_category = 'prayer' then r.score_prayer when v_category = 'kids' then r.score_kids
          when v_category = 'youth' then r.score_youth when v_category = 'leadership' then r.score_leadership
          when v_category = 'service' then r.score_service when v_category = 'finances' then r.score_finances
        end), count(*)
      into v_score, v_count
      from reviews r where r.church_id = v_church_id and r.status = 'published';
      insert into score_snapshots (church_id, category, score_value, snapshot_date, review_count)
      values (v_church_id, v_category, v_score, v_snapshot_date, v_count)
      on conflict (church_id, category, snapshot_date)
      do update set score_value = v_score, review_count = v_count;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.compute_regional_benchmarks()
returns table(computed boolean, regions_updated integer) language plpgsql security definer as $$
declare
  v_categories text[] := array['teaching','welcome','community','worship','prayer','kids','youth','leadership','service','finances'];
  v_category text; v_count int := 0;
begin
  foreach v_category in array v_categories loop
    insert into regional_benchmarks (region_type, region_value, category, avg_score, church_count, review_count, last_updated)
    select 'national', 'USA', v_category,
      avg(case
        when v_category = 'teaching' then c.score_teaching when v_category = 'welcome' then c.score_welcome
        when v_category = 'community' then c.score_community when v_category = 'worship' then c.score_worship
        when v_category = 'prayer' then c.score_prayer when v_category = 'kids' then c.score_kids
        when v_category = 'youth' then c.score_youth when v_category = 'leadership' then c.score_leadership
        when v_category = 'service' then c.score_service when v_category = 'finances' then c.score_finances end),
      count(distinct c.id), coalesce(sum(c.total_reviews),0), now()
    from churches c where c.total_reviews > 0
    on conflict (region_type, region_value, category) do update set
      avg_score = excluded.avg_score, church_count = excluded.church_count,
      review_count = excluded.review_count, last_updated = now();
    v_count := v_count + 1;

    insert into regional_benchmarks (region_type, region_value, category, avg_score, church_count, review_count, last_updated)
    select 'state', c.state, v_category,
      avg(case
        when v_category = 'teaching' then c.score_teaching when v_category = 'welcome' then c.score_welcome
        when v_category = 'community' then c.score_community when v_category = 'worship' then c.score_worship
        when v_category = 'prayer' then c.score_prayer when v_category = 'kids' then c.score_kids
        when v_category = 'youth' then c.score_youth when v_category = 'leadership' then c.score_leadership
        when v_category = 'service' then c.score_service when v_category = 'finances' then c.score_finances end),
      count(distinct c.id), coalesce(sum(c.total_reviews),0), now()
    from churches c where c.state is not null and c.total_reviews > 0 group by c.state
    on conflict (region_type, region_value, category) do update set
      avg_score = excluded.avg_score, church_count = excluded.church_count,
      review_count = excluded.review_count, last_updated = now();
    v_count := v_count + 1;

    insert into regional_benchmarks (region_type, region_value, category, avg_score, church_count, review_count, last_updated)
    select 'city', c.city || ', ' || c.state, v_category,
      avg(case
        when v_category = 'teaching' then c.score_teaching when v_category = 'welcome' then c.score_welcome
        when v_category = 'community' then c.score_community when v_category = 'worship' then c.score_worship
        when v_category = 'prayer' then c.score_prayer when v_category = 'kids' then c.score_kids
        when v_category = 'youth' then c.score_youth when v_category = 'leadership' then c.score_leadership
        when v_category = 'service' then c.score_service when v_category = 'finances' then c.score_finances end),
      count(distinct c.id), coalesce(sum(c.total_reviews),0), now()
    from churches c where c.city is not null and c.state is not null and c.total_reviews > 0
    group by c.city, c.state
    on conflict (region_type, region_value, category) do update set
      avg_score = excluded.avg_score, church_count = excluded.church_count,
      review_count = excluded.review_count, last_updated = now();
    v_count := v_count + 1;
  end loop;
  return query select true, v_count;
end;
$$;

create or replace function public.notify_new_review()
returns trigger language plpgsql security definer as $$
declare
  church_name text; reviewer_name text; edge_function_url text;
begin
  select name into church_name from churches where id = new.church_id;
  select display_name into reviewer_name from profiles where id = new.user_id;
  edge_function_url := 'https://ffqmbhftivmiubvtzhhr.supabase.co/functions/v1/notify-new-review';
  perform net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('record', jsonb_build_object(
      'id', new.id, 'church_id', new.church_id,
      'church_name', coalesce(church_name, 'Unknown Church'),
      'reviewer_name', coalesce(reviewer_name, 'Anonymous'),
      'text', coalesce(new.text, ''), 'status', new.status, 'created_at', new.created_at)));
  return new;
end;
$$;

create or replace function public.soft_delete_review(p_review_id uuid)
returns void language plpgsql security definer as $$
begin
  update reviews set status = 'removed', deleted_at = now()
  where id = p_review_id and user_id = auth.uid();
  if not found then
    raise exception 'Review not found or not owned by current user';
  end if;
end;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated after update of email on auth.users
  for each row execute function public.sync_profile_email();

drop trigger if exists on_review_flagged on public.review_flags;
create trigger on_review_flagged after insert on public.review_flags
  for each row execute function public.increment_flag_count();

drop trigger if exists validate_review on public.reviews;
create trigger validate_review before insert on public.reviews
  for each row execute function public.validate_review_content();

drop trigger if exists enforce_review_rate_limit on public.reviews;
create trigger enforce_review_rate_limit before insert on public.reviews
  for each row execute function public.check_review_rate_limit();

drop trigger if exists on_review_score_update on public.reviews;
create trigger on_review_score_update after insert or update or delete on public.reviews
  for each row execute function public.recalculate_single_church_scores();

drop trigger if exists trg_review_score_snapshots on public.reviews;
create trigger trg_review_score_snapshots after insert or update on public.reviews
  for each row execute function public.update_church_score_snapshots();

drop trigger if exists on_new_review_notify on public.reviews;
create trigger on_new_review_notify after insert on public.reviews
  for each row execute function public.notify_new_review();

-- ============================================================================
-- ROW LEVEL SECURITY (as it existed on 2026-10-22)
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.churches enable row level security;
alter table public.reviews enable row level security;
alter table public.review_flags enable row level security;
alter table public.claim_requests enable row level security;
alter table public.favorites enable row level security;
alter table public.church_responses enable row level security;
alter table public.payments enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.review_likes enable row level security;
alter table public.abuse_reports enable row level security;
alter table public.church_claims enable row level security;
alter table public.church_reports enable row level security;
alter table public.regional_benchmarks enable row level security;
alter table public.score_snapshots enable row level security;
alter table public.review_photos enable row level security;
alter table public.subscription_events enable row level security;

-- profiles
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Admins can update any profile" on public.profiles for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','moderator')));

-- churches
create policy "Churches are viewable" on public.churches for select using (
  status = 'approved' or added_by = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')));
create policy "Authenticated users can add churches" on public.churches for insert with check (auth.uid() is not null);
create policy "Admins can update churches" on public.churches for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator'))
  or claimed_by = auth.uid());
create policy "Admins can delete churches" on public.churches for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')));

-- reviews
create policy "Reviews are viewable" on public.reviews for select using (
  status = 'published' or user_id = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')));
create policy "Users can insert own review" on public.reviews for insert with check (auth.uid() = user_id);
create policy "Users can update own review within 7 days" on public.reviews for update using (
  auth.uid() = user_id and created_at > now() - interval '7 days');
create policy "Admins can update any review" on public.reviews for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')));
create policy "Admins can delete reviews" on public.reviews for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')));

-- review_flags
create policy "Users can flag reviews" on public.review_flags for insert with check (auth.uid() = flagged_by);
create policy "Admins can view flags" on public.review_flags for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')));

-- claim_requests
create policy "Users can submit claims" on public.claim_requests for insert with check (auth.uid() = user_id);
create policy "Users can view own claims" on public.claim_requests for select using (user_id = auth.uid());
create policy "Admins can view all claims" on public.claim_requests for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')));
create policy "Admins can update claims" on public.claim_requests for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')));

-- favorites
create policy "Users can view own favorites" on public.favorites for select using (auth.uid() = user_id);
create policy "Users can insert own favorites" on public.favorites for insert with check (auth.uid() = user_id);
create policy "Users can delete own favorites" on public.favorites for delete using (auth.uid() = user_id);

-- church_responses
create policy "Responses are viewable" on public.church_responses for select using (true);
create policy "Church admins can respond" on public.church_responses for insert with check (
  exists (select 1 from public.churches where id = church_responses.church_id and claimed_by = auth.uid()));

-- payments
create policy "Admins can view all payments" on public.payments for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')));
create policy "Users can view own payments" on public.payments for select using (user_id = auth.uid());

-- newsletter_subscribers
create policy "Anyone can subscribe" on public.newsletter_subscribers for insert with check (true);
create policy "Only admins can view subscribers" on public.newsletter_subscribers for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- review_likes
create policy "Anyone can view likes" on public.review_likes for select using (true);
create policy "Users can like reviews" on public.review_likes for insert with check (auth.uid() = user_id);
create policy "Users can unlike their own likes" on public.review_likes for delete using (auth.uid() = user_id);

-- abuse_reports
create policy "Anonymous abuse reports" on public.abuse_reports for insert with check (true);
create policy "Only admins can view abuse reports" on public.abuse_reports for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- church_claims
create policy "Users can insert claims" on public.church_claims for insert with check (auth.uid() = user_id);
create policy "Users can read own claims" on public.church_claims for select using (auth.uid() = user_id);
create policy "Users can update own claims" on public.church_claims for update using (auth.uid() = user_id);

-- church_reports
create policy "Anyone can submit a church report" on public.church_reports for insert with check (true);
create policy "Users can view own reports" on public.church_reports for select using (auth.uid() = user_id);
create policy "Service role can manage church reports" on public.church_reports for all using (auth.role() = 'service_role');

-- regional_benchmarks / score_snapshots
create policy "regional_benchmarks_select_authenticated" on public.regional_benchmarks for select to authenticated using (true);
create policy "score_snapshots_select_authenticated" on public.score_snapshots for select to authenticated using (
  exists (select 1 from public.churches c where c.id = score_snapshots.church_id and c.claimed_by = auth.uid()));

-- review_photos
create policy "Review photos follow review visibility" on public.review_photos for select using (
  exists (select 1 from public.reviews r where r.id = review_photos.review_id and r.deleted_at is null
    and (r.status = 'published' or r.user_id = auth.uid()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','moderator')))));
create policy "Users can insert own photos" on public.review_photos for insert with check (auth.uid() = user_id);
create policy "Users can delete own photos" on public.review_photos for delete using (auth.uid() = user_id);

-- subscription_events
create policy "Admins read subscription events" on public.subscription_events for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator')));

-- ============================================================================
-- STORAGE (only when the storage schema exists, i.e. on Supabase)
-- ============================================================================
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('review-photos', 'review-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;

    if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'Public read access for review photos') then
      execute $p$create policy "Public read access for review photos" on storage.objects for select using (bucket_id = 'review-photos')$p$;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'Users can upload review photos') then
      execute $p$create policy "Users can upload review photos" on storage.objects for insert with check (bucket_id = 'review-photos' and auth.uid() is not null)$p$;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'Users can delete own review photos') then
      execute $p$create policy "Users can delete own review photos" on storage.objects for delete using (bucket_id = 'review-photos' and auth.uid()::text = (storage.foldername(name))[1])$p$;
    end if;
  end if;
end $$;

-- ============================================================================
-- CRON (weekly digest, Mondays 09:00 UTC) — only when pg_cron is installed
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $x$
      select cron.schedule('weekly-digest-job', '0 9 * * 1', $job$
        select net.http_post(
          url := coalesce(current_setting('app.settings.weekly_digest_url', true),
                          'https://ffqmbhftivmiubvtzhhr.supabase.co/functions/v1/weekly-digest'),
          headers := jsonb_build_object('Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.digest_cron_secret', true), '')),
          body := '{}'::jsonb);
      $job$)
      where not exists (select 1 from cron.job where jobname = 'weekly-digest-job')
    $x$;
  end if;
end $$;
