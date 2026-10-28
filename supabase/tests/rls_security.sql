-- ============================================================================
-- RLS / security regression tests.
-- Plain SQL with DO-block assertions so it runs on any Postgres (local stub
-- or `supabase start`). Every test runs inside a transaction that is rolled
-- back at the end; nothing persists.
--
--   scripts/db-test.sh            (local, uses the stub)
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_security.sql
-- ============================================================================
\set ON_ERROR_STOP on
begin;

-- ---------------------------------------------------------------- helpers --
create or replace function pg_temp.as_user(p_uid uuid, p_role text default 'authenticated') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}'
    else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
  execute format('set local role %I', p_role);
end $$;

create or replace function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end $$;

create or replace function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if coalesce(p_cond, false) then
    raise notice 'ok   - %', p_name;
  else
    raise exception 'FAIL - %', p_name;
  end if;
end $$;

-- Runs a statement as a given user and returns the SQLSTATE ('' on success).
create or replace function pg_temp.try_as(p_uid uuid, p_sql text, p_role text default 'authenticated') returns text
language plpgsql as $$
declare v_state text := '';
begin
  perform pg_temp.as_user(p_uid, p_role);
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate;
  end;
  perform pg_temp.as_postgres();
  return v_state;
end $$;

-- ---------------------------------------------------------------- fixtures --
select pg_temp.as_postgres();
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name":"Alice Anderson","zip_code":"33601"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"full_name":"Bob Brown"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"full_name":"Carol Admin"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dan@example.com',   '{"full_name":"Dan Mod"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000c';
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-00000000000d';
update public.profiles set phone = '555-0100', address = '1 Main St' where id = '00000000-0000-0000-0000-00000000000a';

insert into public.churches (id, name, city, state, zip, latitude, longitude, status, website) values
  ('10000000-0000-0000-0000-000000000001', 'Grace Church Tampa', 'Tampa', 'FL', '33601', 27.9506, -82.4572, 'approved', 'https://gracetampa.org'),
  ('10000000-0000-0000-0000-000000000002', 'Hope Church Orlando', 'Orlando', 'FL', '32801', 28.5383, -81.3792, 'approved', null),
  ('10000000-0000-0000-0000-000000000003', 'Far Church Seattle', 'Seattle', 'WA', '98101', 47.6062, -122.3321, 'approved', null),
  ('10000000-0000-0000-0000-000000000004', 'Pending Church', 'Miami', 'FL', '33101', 25.7617, -80.1918, 'pending', null);
refresh materialized view public.zip_centroids;

\echo
\echo '== profiles ======================================================='

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a'$$) = '42501',
  'user cannot promote self to admin');

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.profiles set review_suspended = false, status = 'active' where id = '00000000-0000-0000-0000-00000000000a'$$) = '',
  'user may save unchanged moderation fields (no-op update allowed)');

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.profiles set status = 'banned' where id = '00000000-0000-0000-0000-00000000000a'$$) = '42501',
  'user cannot change own status');

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.profiles set display_name = 'Alice A.', gender = 'Female' where id = '00000000-0000-0000-0000-00000000000a'$$) = '',
  'user can edit own display name and demographics');

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000d',
    $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000d'$$) = '42501',
  'moderator cannot grant admin');

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000d',
    $$update public.profiles set review_suspended = true where id = '00000000-0000-0000-0000-00000000000a'$$) = '',
  'moderator can suspend a reviewer');

select pg_temp.as_postgres();
update public.profiles set review_suspended = false where id = '00000000-0000-0000-0000-00000000000a';

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000c',
    $$update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-00000000000b'$$) = '',
  'admin can change roles');
select pg_temp.as_postgres();
update public.profiles set role = 'user' where id = '00000000-0000-0000-0000-00000000000b';

-- PII visibility (post privacy lockdown)
select pg_temp.as_user(null, 'anon');
select pg_temp.ok((select count(*) from public.profiles) = 0, 'anon sees no profile rows');
select pg_temp.ok((select count(*) from public.public_profiles) = 4, 'anon sees public_profiles');
select pg_temp.ok(
  not exists (select 1 from information_schema.columns where table_name = 'public_profiles' and column_name in ('email','phone','address','zip_code','gender','income_bracket')),
  'public_profiles exposes no PII columns');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from public.profiles) = 1, 'user sees only own profile');
select pg_temp.ok((select phone from public.profiles where id = '00000000-0000-0000-0000-00000000000a') is null, 'user cannot read another user''s phone');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.profiles) = 4, 'admin sees all profiles');
select pg_temp.as_postgres();

-- Production state before the lockdown: the old public policy is still there.
-- The restrictive policy must keep profiles private regardless.
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
select pg_temp.as_user(null, 'anon');
select pg_temp.ok((select count(*) from public.profiles) = 0, 'restrictive policy: anon sees no profiles despite a public policy');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from public.profiles) = 1, 'restrictive policy: user sees only own profile despite a public policy');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.profiles) = 4, 'restrictive policy: admin still sees all profiles');
select pg_temp.as_postgres();
drop policy "Public profiles are viewable by everyone" on public.profiles;

\echo
\echo '== reviews ========================================================'

-- Alice submits a review and tries to self-publish.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.reviews (church_id, user_id, reviewer_role, text, score_teaching, score_welcome, status, flag_count, approved_by)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Member',
        'A thoughtful review that is long enough to pass validation.', 5, 4, 'published', 99, '00000000-0000-0000-0000-00000000000c');
select pg_temp.as_postgres();
select pg_temp.ok(
  (select status = 'pending' and flag_count = 0 and approved_by is null from public.reviews where user_id = '00000000-0000-0000-0000-00000000000a'),
  'new review is forced to pending with clean moderation fields');

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000b',
    $$insert into public.reviews (church_id, user_id, reviewer_role, text, score_teaching)
      values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Member', 'Trying to post as somebody else entirely.', 3)$$) <> '',
  'user cannot insert a review as another user');

-- Anon cannot see pending reviews; owner can.
select pg_temp.as_user(null, 'anon');
select pg_temp.ok((select count(*) from public.reviews) = 0, 'anon cannot see pending review');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.reviews) = 1, 'author sees own pending review');
select pg_temp.as_postgres();

-- Admin publishes, author edits -> back to pending, protected fields untouched.
update public.reviews set status = 'published', approved_by = '00000000-0000-0000-0000-00000000000c', approved_at = now()
  where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select total_reviews from public.churches where id = '10000000-0000-0000-0000-000000000001') = 1, 'church score recalculated on publish');

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.reviews set text = 'An edited review that is still long enough to be valid.', status = 'published', flag_count = 50
      where user_id = '00000000-0000-0000-0000-00000000000a'$$) = '',
  'author can edit own review within 7 days');
select pg_temp.ok(
  (select status = 'pending' and flag_count = 0 and approved_by is null and edited_at is not null
     from public.reviews where user_id = '00000000-0000-0000-0000-00000000000a'),
  'edited review returns to pending and keeps moderation fields clean');

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.reviews set church_id = '10000000-0000-0000-0000-000000000002' where user_id = '00000000-0000-0000-0000-00000000000a'$$) = '42501',
  'author cannot move a review to another church');

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$insert into public.review_flags (review_id, flagged_by, reason)
      select id, '00000000-0000-0000-0000-00000000000a', 'spam' from public.reviews where user_id = '00000000-0000-0000-0000-00000000000a'$$) = '42501',
  'author cannot flag own review');

-- reviewer coordinates: columns gone, locations table admin-only
select pg_temp.ok(
  not exists (select 1 from information_schema.columns where table_name = 'reviews' and column_name in ('reviewer_lat','reviewer_lng','distance_miles')),
  'reviews table no longer carries reviewer coordinates');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$insert into public.review_locations (review_id, user_id, lat, lng)
      select id, '00000000-0000-0000-0000-00000000000a', 27.95, -82.46 from public.reviews where user_id = '00000000-0000-0000-0000-00000000000a'$$) = '',
  'author can record own review location');
select pg_temp.ok((select location_verified from public.reviews where user_id = '00000000-0000-0000-0000-00000000000a'), 'nearby location marks review as verified');
select pg_temp.ok((select distance_miles < 2 from public.review_locations limit 1), 'distance computed server-side');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from public.review_locations) = 0, 'other users cannot read review locations');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.review_locations) = 0, 'even the author cannot read back raw coordinates');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.review_locations) = 1, 'admin can read review locations');
select pg_temp.as_postgres();

-- Far-away submission suspends the reviewer (server-side now).
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.reviews (church_id, user_id, reviewer_role, text, score_teaching)
values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'Visitor', 'Bob visited Seattle and wrote about it at length here.', 4);
insert into public.review_locations (review_id, user_id, lat, lng)
  select id, '00000000-0000-0000-0000-00000000000b', 25.76, -80.19 from public.reviews where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.as_postgres();
select pg_temp.ok((select review_suspended from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'far-away submission auto-suspends reviewer');
select pg_temp.ok((select suspension_reason like 'Auto-flagged:%' from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'suspension reason recorded');

\echo
\echo '== churches ======================================================='

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.churches (id, name, city, state, status, claimed_by, subscription_status, score_overall, total_reviews, source)
values ('10000000-0000-0000-0000-000000000005', 'Sneaky Church', 'Tampa', 'FL', 'approved', '00000000-0000-0000-0000-00000000000a', 'active', 5, 999, 'seed');
select pg_temp.as_postgres();
select pg_temp.ok(
  (select status = 'pending' and claimed_by is null and subscription_status is null and score_overall is null and total_reviews = 0 and source = 'manual' and added_by = '00000000-0000-0000-0000-00000000000a'
     from public.churches where id = '10000000-0000-0000-0000-000000000005'),
  'user-submitted church is pending and stripped of privileged fields');

select pg_temp.as_user(null, 'anon');
select pg_temp.ok((select count(*) from public.churches where status <> 'approved') = 0, 'anon only sees approved churches');
select pg_temp.as_postgres();

-- Make Alice the claimant of Grace Church and test the allow-list.
update public.churches set claimed_by = '00000000-0000-0000-0000-00000000000a', claimed_at = now() where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.churches set description = 'We love our city', pastor_name = 'Rev. Smith', website = 'https://gracetampa.org' where id = '10000000-0000-0000-0000-000000000001'$$) = '',
  'claimant can edit profile fields');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.churches set subscription_status = 'active' where id = '10000000-0000-0000-0000-000000000001'$$) = '42501',
  'claimant cannot activate own subscription');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.churches set score_overall = 5, total_reviews = 500 where id = '10000000-0000-0000-0000-000000000001'$$) = '42501',
  'claimant cannot edit scores');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.churches set claimed_by = '00000000-0000-0000-0000-00000000000b' where id = '10000000-0000-0000-0000-000000000001'$$) = '42501',
  'claimant cannot transfer the claim');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000b',
    $$update public.churches set description = 'hijack' where id = '10000000-0000-0000-0000-000000000001'$$) = '',
  'non-claimant update is a silent no-op under RLS');
select pg_temp.ok((select description from public.churches where id = '10000000-0000-0000-0000-000000000001') = 'We love our city', 'non-claimant did not change anything');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000c',
    $$update public.churches set subscription_status = 'active' where id = '10000000-0000-0000-0000-000000000001'$$) = '42501',
  'even admins cannot write billing fields through the API');

\echo
\echo '== claims ========================================================='

select pg_temp.as_postgres();
-- Simulate the edge function (service role) issuing a hashed code for Bob on Hope Church.
insert into public.church_claims (church_id, user_id, claim_email, verification_code_hash, code_expires_at)
values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'bob@hopeorlando.org',
        encode(extensions.digest('123456', 'sha256'), 'hex'), now() + interval '1 hour');

select pg_temp.ok(
  not exists (select 1 from information_schema.columns where table_name = 'church_claims' and column_name = 'verification_code'),
  'raw verification code column is gone');

select pg_temp.try_as('00000000-0000-0000-0000-00000000000b',
    $$update public.church_claims set verified = true where user_id = '00000000-0000-0000-0000-00000000000b'$$);
select pg_temp.ok(
  (select not verified from public.church_claims where user_id = '00000000-0000-0000-0000-00000000000b'),
  'claimant cannot mark own claim verified');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((public.verify_claim_code('10000000-0000-0000-0000-000000000002', '000000')->>'ok') = 'false', 'wrong code is rejected');
select pg_temp.ok((public.verify_claim_code('10000000-0000-0000-0000-000000000002', '123456')->>'ok') = 'true', 'correct code verifies');
select pg_temp.as_postgres();
select pg_temp.ok((select claimed_by = '00000000-0000-0000-0000-00000000000b' and claim_verified from public.churches where id = '10000000-0000-0000-0000-000000000002'), 'church is claimed server-side');
select pg_temp.ok((select verify_attempts = 1 and verification_code_hash is null from public.church_claims where user_id = '00000000-0000-0000-0000-00000000000b'), 'attempt counted and hash cleared');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((public.verify_claim_code('10000000-0000-0000-0000-000000000002', '123456')->>'ok') = 'false', 'another user cannot verify someone else''s claim');
select pg_temp.as_user(null, 'anon');
select pg_temp.ok(not has_function_privilege('anon', 'public.verify_claim_code(uuid,text)', 'execute'), 'anon cannot call verify_claim_code');
select pg_temp.as_postgres();

\echo
\echo '== organizations (tenancy) ========================================'

select pg_temp.ok((select count(*) from public.organizations where church_id in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')) = 2, 'claims create organizations');
select pg_temp.ok((select role from public.org_members m join public.organizations o on o.id = m.org_id where o.church_id = '10000000-0000-0000-0000-000000000002') = 'owner', 'claimant becomes org owner');
update public.churches set subscription_status = 'active', stripe_customer_id = 'cus_123', current_period_end = now() + interval '30 days' where id = '10000000-0000-0000-0000-000000000002';
select pg_temp.ok((select status from public.subscriptions s join public.organizations o on o.id = s.org_id where o.church_id = '10000000-0000-0000-0000-000000000002') = 'active', 'webhook-style update mirrors into subscriptions');
select pg_temp.ok(public.has_active_subscription((select id from public.organizations where church_id = '10000000-0000-0000-0000-000000000002')), 'has_active_subscription is true');
select pg_temp.ok(not public.has_active_subscription((select id from public.organizations where church_id = '10000000-0000-0000-0000-000000000001')), 'unpaid org has no active subscription');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from public.organizations) = 1, 'member sees only own organization');
select pg_temp.ok(public.is_org_member((select id from public.organizations limit 1), 'owner'), 'is_org_member honours role rank');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.subscriptions where church_id = '10000000-0000-0000-0000-000000000002') = 0, 'non-member cannot read another org''s subscription');
select pg_temp.as_postgres();

\echo
\echo '== geo ============================================================'

select pg_temp.as_user(null, 'anon');
select pg_temp.ok((select count(*) from public.churches_near(27.95, -82.46, 100)) = 2, 'radius search returns FL churches only (approved)');
select pg_temp.ok((select name from public.churches_near(27.95, -82.46, 100) limit 1) = 'Grace Church Tampa', 'nearest church first');
select pg_temp.ok((select count(*) from public.churches_near(27.95, -82.46, 100, 'Baptist')) = 0, 'denomination filter applies');
select pg_temp.ok((select lat between 27 and 29 from public.geocode_zip('33601')), 'zip centroid derived from church data');
select pg_temp.as_postgres();

\echo
\echo '== function exposure =============================================='

select pg_temp.ok(not has_function_privilege('anon', 'public.handle_new_user()', 'execute'), 'anon cannot execute handle_new_user');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.increment_flag_count()', 'execute'), 'authenticated cannot execute increment_flag_count');
select pg_temp.ok(not has_function_privilege('anon', 'public.recalculate_church_scores()', 'execute'), 'anon cannot execute recalculate_church_scores');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a', $$select public.recalculate_church_scores()$$) = '42501',
  'regular user cannot recalculate scores');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000c', $$select public.recalculate_church_scores()$$) = '',
  'admin can recalculate scores');
select pg_temp.ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.proconfig is null and p.prolang <> (select oid from pg_language where lanname = 'c')) = 0,
  'every SECURITY DEFINER function pins search_path');

\echo
\echo '== site stats and claim review ===================================='

select pg_temp.as_user(null, 'anon');
select pg_temp.ok(has_function_privilege('anon', 'public.site_stats()', 'execute'), 'anon can call site_stats');
select pg_temp.ok((select churches >= 3 and members = 4 from public.site_stats()), 'site_stats returns church and member counts');
select pg_temp.as_postgres();
select pg_temp.ok((select reviews from public.site_stats()) = (select count(*) from public.reviews where status = 'published' and deleted_at is null), 'site_stats counts published reviews only');

-- Alice claims Far Church Seattle, which has no website on file: the code proves the email, not ownership.
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$insert into public.claim_requests (church_id, user_id, full_name, role_at_church, work_email, profile)
      values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'Alice Anderson', 'Pastor', 'alice@gmail.com',
              '{"pastor_name":"Alice Anderson","avg_attendance":"120","year_founded":"1987","programs":["Youth","Choir"],"description":"Small church","staff_count":"not a number"}')$$) = '',
  'claimant can submit a claim request with profile details');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000b',
    $$insert into public.claim_requests (church_id, user_id, full_name, role_at_church, work_email, status)
      values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'Bob', 'Pastor', 'bob@x.org', 'approved')$$) = '42501',
  'claimant cannot submit a claim request as approved');
insert into public.church_claims (church_id, user_id, claim_email, verification_code_hash, code_expires_at, review_status)
values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'alice@gmail.com',
        encode(extensions.digest('654321', 'sha256'), 'hex'), now() + interval '1 hour', 'pending_review');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select (r->>'ok') = 'true' and (r->>'manual_review') = 'true' from public.verify_claim_code('10000000-0000-0000-0000-000000000003', '654321') r), 'pending-review code verifies but flags manual review');
select pg_temp.as_postgres();
select pg_temp.ok((select claimed_by is null from public.churches where id = '10000000-0000-0000-0000-000000000003'), 'pending-review claim does not claim the church');
select pg_temp.ok((select verified from public.church_claims where church_id = '10000000-0000-0000-0000-000000000003'), 'pending-review claim marks the email verified');

select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000b',
    $$select public.review_church_claim((select id from public.church_claims where church_id = '10000000-0000-0000-0000-000000000003'), true, null)$$) = '42501',
  'regular user cannot review claims');
select pg_temp.ok(not has_function_privilege('anon', 'public.review_church_claim(uuid,boolean,text)', 'execute'), 'anon cannot call review_church_claim');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.ok((public.review_church_claim((select id from public.church_claims where church_id = '10000000-0000-0000-0000-000000000003'), false, 'not convinced')->>'status') = 'rejected', 'moderator can reject a claim');
select pg_temp.as_postgres();
select pg_temp.ok((select claimed_by is null from public.churches where id = '10000000-0000-0000-0000-000000000003'), 'rejected claim leaves the church unclaimed');
select pg_temp.ok((select review_status = 'rejected' and reviewed_by = '00000000-0000-0000-0000-00000000000d' and review_note = 'not convinced' from public.church_claims where church_id = '10000000-0000-0000-0000-000000000003'), 'rejection is recorded');
select pg_temp.ok((select not verified and verified_at is null and code_expires_at is null and verification_code_hash is null from public.church_claims where church_id = '10000000-0000-0000-0000-000000000003'), 'rejection clears the verification so others can claim');
select pg_temp.ok((select status = 'rejected' from public.claim_requests where church_id = '10000000-0000-0000-0000-000000000003' and user_id = '00000000-0000-0000-0000-00000000000a'), 'rejection is mirrored to claim_requests');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((public.verify_claim_code('10000000-0000-0000-0000-000000000003', '654321')->>'ok') = 'false', 'a rejected claim cannot be verified again');
select pg_temp.as_postgres();
-- Even with a fresh, valid code on the row, a rejected claim must not verify (guards the review_status check itself).
update public.church_claims set verification_code_hash = encode(extensions.digest('222222', 'sha256'), 'hex'), code_expires_at = now() + interval '1 hour'
  where church_id = '10000000-0000-0000-0000-000000000003';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select (r->>'ok') = 'false' and r->>'error' like '%not approved%' from public.verify_claim_code('10000000-0000-0000-0000-000000000003', '222222') r), 'a rejected claim with a valid code is still refused');
select pg_temp.as_postgres();
select pg_temp.ok((select claimed_by is null from public.churches where id = '10000000-0000-0000-0000-000000000003'), 'refused verification leaves the church unclaimed');
update public.church_claims set verification_code_hash = null, code_expires_at = null where church_id = '10000000-0000-0000-0000-000000000003';
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.claim_requests set status = 'approved' where church_id = '10000000-0000-0000-0000-000000000003'$$) = '42501',
  'rejected claimant cannot mark own request approved');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
    $$update public.claim_requests set status = 'pending', reviewed_by = null, reviewed_at = null where church_id = '10000000-0000-0000-0000-000000000003'$$) = '',
  'rejected claimant can re-apply');
select pg_temp.as_postgres();
select pg_temp.ok((select status = 'pending' from public.claim_requests where church_id = '10000000-0000-0000-0000-000000000003' and user_id = '00000000-0000-0000-0000-00000000000a'), 're-application resets the request to pending');

-- The edge function (service role) issues a fresh code and Alice verifies it again.
update public.church_claims set review_status = 'pending_review', verified = true, verified_at = now() where church_id = '10000000-0000-0000-0000-000000000003';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((public.review_church_claim((select id from public.church_claims where church_id = '10000000-0000-0000-0000-000000000003'), true, null)->>'ok') = 'true', 'admin can approve a claim');
select pg_temp.as_postgres();
select pg_temp.ok((select claimed_by = '00000000-0000-0000-0000-00000000000a' and claim_verified from public.churches where id = '10000000-0000-0000-0000-000000000003'), 'approval claims the church for the claimant');
select pg_temp.ok((select review_status = 'approved' from public.church_claims where church_id = '10000000-0000-0000-0000-000000000003'), 'approval is recorded');
select pg_temp.ok((select status = 'approved' from public.claim_requests where church_id = '10000000-0000-0000-0000-000000000003' and user_id = '00000000-0000-0000-0000-00000000000a'), 'approval is mirrored to claim_requests');
select pg_temp.ok((select pastor_name = 'Alice Anderson' and avg_attendance = 120 and year_founded = 1987 and programs = array['Youth','Choir'] and description = 'Small church' and staff_count is null
  from public.churches where id = '10000000-0000-0000-0000-000000000003'), 'approval applies valid profile fields and skips invalid ones');

-- A claim cannot be approved once someone else holds the church.
update public.church_claims set review_status = 'pending_review' where church_id = '10000000-0000-0000-0000-000000000003';
update public.churches set claimed_by = '00000000-0000-0000-0000-00000000000d' where id = '10000000-0000-0000-0000-000000000003';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((public.review_church_claim((select id from public.church_claims where church_id = '10000000-0000-0000-0000-000000000003'), true, null)->>'ok') = 'false', 'approval refuses a church claimed by someone else');
select pg_temp.as_postgres();

-- Moderators see every claim; claimants only their own.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.ok((select count(*) from public.church_claims) >= 2, 'moderator reads all claims');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.church_claims) = 1, 'claimant reads only own claim');
select pg_temp.as_postgres();

-- Claimants cannot write church_claims at all: no self-issued codes, no forged "verified" rows.
insert into public.churches (id, name, city, state, status) values
  ('10000000-0000-0000-0000-000000000009', 'Unclaimed Chapel', 'Austin', 'TX', 'approved');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000b',
    $$insert into public.church_claims (church_id, user_id, claim_email, verified, verified_at, review_status)
      values ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000b', 'pastor@unclaimed.org', true, now(), 'pending_review')$$) <> '',
  'claimant cannot insert a forged verified claim');
select pg_temp.ok(
  pg_temp.try_as('00000000-0000-0000-0000-00000000000b',
    $$insert into public.church_claims (church_id, user_id, claim_email, verification_code_hash, code_expires_at, review_status)
      values ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000b', 'me@x.org', encode(extensions.digest('111111', 'sha256'), 'hex'), now() + interval '1 hour', 'auto')$$) <> '',
  'claimant cannot insert a claim with a self-chosen code');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((public.verify_claim_code('10000000-0000-0000-0000-000000000009', '111111')->>'ok') = 'false', 'self-issued code does not verify');
select pg_temp.as_postgres();
select pg_temp.ok((select claimed_by is null from public.churches where id = '10000000-0000-0000-0000-000000000009'), 'unclaimed church stays unclaimed');
select pg_temp.ok(not exists (select 1 from public.church_claims where church_id = '10000000-0000-0000-0000-000000000009'), 'no claim row was created');

\echo
\echo '== chms: people ===================================================='

select pg_temp.as_postgres();
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com',   '{"full_name":"Eve Deacon"}'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@example.com', '{"full_name":"Frank Outsider"}');
insert into public.organizations (id, name, slug) values
  ('20000000-0000-0000-0000-000000000001', 'Pilot Church', 'pilot-church'),
  ('20000000-0000-0000-0000-000000000002', 'Other Church', 'other-church');
insert into public.org_members (org_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'owner');
insert into public.people (id, org_id, first_name, last_name, email, membership_status) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Paul', 'Pilot', 'paul@pilot.org', 'member'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Eve', 'Deacon', 'eve@example.com', 'member'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Kid', 'Pilot', null, 'regular'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'Alice', 'Owner', 'alice@example.com', 'member'),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 'Frank', 'Prospect', 'frank@example.com', 'visitor'),
  ('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000002', 'Quinn', 'Other', 'quinn@other.org', 'member');
create temp table _chms (k text primary key, v text);
grant all on _chms to authenticated, anon;
-- The owner is in the directory (needed to write notes).
insert into public.person_logins (person_id, org_id, user_id) values
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a');
insert into public.households (id, org_id, name) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Pilot family'),
  ('40000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000002', 'Other family');
insert into public.household_members (household_id, person_id, org_id, relationship) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'head'),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'child');

select pg_temp.ok((select count(*) from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001') = 6, 'new church gets the six default roles');
select pg_temp.ok((select cardinality(permissions) from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Pastor') = 6, 'Pastor holds every permission');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'seed_default_org_roles'),
  'role seeding is not callable through the API');

-- anonymous and outsiders
select pg_temp.as_user(null, 'anon');
select pg_temp.ok((select count(*) from public.people) = 0, 'anon sees no people');
select pg_temp.ok((select count(*) from public.households) = 0, 'anon sees no households');
select pg_temp.ok(not public.has_org_permission('20000000-0000-0000-0000-000000000001', 'people.view'), 'anon has no permission');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.people) = 0, 'site admin of By Their Fruit sees no church people');
select pg_temp.as_postgres();

-- account ids never reach church users
select pg_temp.ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name in ('people', 'people_audit', 'person_notes', 'org_invitations', 'households', 'person_roles', 'person_overseers', 'org_roles')
    and (column_name in ('user_id', 'created_by', 'accepted_by', 'actor') or column_name like '%user%')),
  'no church table a leader can read carries an account id');

-- church owner
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.people) = 5, 'owner sees their church''s people only');
select pg_temp.ok(cardinality(public.my_org_permissions('20000000-0000-0000-0000-000000000001')) = 6, 'owner holds every permission');
select pg_temp.ok((select count(*) from public.people where search_text like '%pilot%') = 2, 'search text finds people by name');
select pg_temp.ok((select array_agg(person_id) from public.people_with_logins('20000000-0000-0000-0000-000000000001')) = array['30000000-0000-0000-0000-000000000004']::uuid[],
  'leaders with a login are listed by person id');
update public.people set phone = '555-0101' where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from public.people_audit where person_id = '30000000-0000-0000-0000-000000000001' and action = 'update'
                   and actor_person_id = '30000000-0000-0000-0000-000000000004' and actor_kind = 'leader' and changes ? 'phone') = 1,
  'edits are audited with the actor''s person record and the change');
update public.people set archived_at = now() where id = '30000000-0000-0000-0000-000000000003';
select pg_temp.ok((select count(*) from public.people_audit where person_id = '30000000-0000-0000-0000-000000000003' and action = 'archive') = 1, 'archiving is audited');
insert into _chms values ('audit_before', (select count(*) from public.people_audit where person_id = '30000000-0000-0000-0000-000000000001'));
update public.people set phone = phone where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from public.people_audit where person_id = '30000000-0000-0000-0000-000000000001')::text = (select v from _chms where k = 'audit_before'),
  'an update that changes nothing is not audited');
update public.organizations set name = 'Pilot Church (renamed)' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.ok((select name from public.organizations where id = '20000000-0000-0000-0000-000000000001') = 'Pilot Church (renamed)', 'an owner can rename their church');
insert into public.person_notes (person_id, org_id, body) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Asked for prayer for his mother.');
select pg_temp.ok((select author_person_id from public.person_notes limit 1) = '30000000-0000-0000-0000-000000000004', 'notes are attributed to the writer''s person record');
select pg_temp.as_postgres();

select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.person_logins (person_id, org_id, user_id) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000f')$$) = '42501',
  'an owner cannot link a login to a person directly');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$update public.person_notes set author_person_id = '30000000-0000-0000-0000-000000000001'$$) = '42501',
  'a note''s author cannot be changed');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.household_members (household_id, person_id, org_id) values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001')$$) <> '',
  'a household cannot include a person from another church');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$update public.organizations set church_id = '10000000-0000-0000-0000-000000000004' where id = '20000000-0000-0000-0000-000000000001'$$) = '42501',
  'an owner cannot re-point their church organization to another listing');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.org_members (org_id, user_id, role) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000f', 'staff')$$) = '42501',
  'an owner cannot add an account to the church directly');
select pg_temp.ok(not exists (select 1 from public.organizations where created_by is not null), 'organizations keep no claimant account id');

-- moving a record between churches fails even for someone who can edit both
insert into public.org_members (org_id, user_id, role) values ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'admin');
insert into public.people (id, org_id, first_name) values ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'Mover');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$update public.people set org_id = '20000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000005'$$) = '42501',
  'a person cannot be moved to another church');
delete from public.org_members where org_id = '20000000-0000-0000-0000-000000000002' and user_id = '00000000-0000-0000-0000-00000000000a';

-- another church's owner
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000b',
  $$insert into public.people (org_id, first_name) values ('20000000-0000-0000-0000-000000000001', 'Intruder')$$) = '42501',
  'another church cannot add people to this church');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from public.people) = 1, 'another church sees only its own people');
update public.people set last_name = 'Changed' where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from public.person_notes) = 0, 'another church cannot read notes');
select pg_temp.as_postgres();
select pg_temp.ok((select last_name from public.people where id = '30000000-0000-0000-0000-000000000001') = 'Pilot', 'another church cannot edit this church''s people');

-- invitations
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into _chms values ('eve', public.create_org_invitation('20000000-0000-0000-0000-000000000001', 'Eve@Example.com ', '30000000-0000-0000-0000-000000000002', 'staff')->>'token');
insert into _chms values ('revoked', public.create_org_invitation('20000000-0000-0000-0000-000000000001', 'frank@example.com', '30000000-0000-0000-0000-000000000006', 'volunteer')->>'token');
select public.revoke_org_invitation((select id from public.org_invitations where email = 'frank@example.com'));
select pg_temp.as_postgres();
select pg_temp.ok((select count(*) from public.org_invitations where token_hash = (select v from _chms where k = 'eve')) = 0, 'invitation tokens are stored hashed');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.ok((public.accept_org_invitation((select v from _chms where k = 'eve'))->>'ok') = 'false', 'an invitation cannot be accepted from a different email');
select pg_temp.ok((public.accept_org_invitation((select v from _chms where k = 'revoked'))->>'ok') = 'false', 'a revoked invitation cannot be accepted');
select pg_temp.ok(not public.is_org_member('20000000-0000-0000-0000-000000000001'), 'refused invitations grant nothing');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.ok((select count(*) from public.people) = 0, 'before accepting, the invited leader sees nobody');
select pg_temp.ok((public.accept_org_invitation((select v from _chms where k = 'eve'))->>'ok') = 'true', 'the invited leader accepts with their own email');
select pg_temp.ok((public.accept_org_invitation((select v from _chms where k = 'eve'))->>'ok') = 'false', 'an invitation works only once');
select pg_temp.ok(public.is_org_member('20000000-0000-0000-0000-000000000001', 'staff'), 'accepting makes them a staff member');
select pg_temp.ok((select count(*) from public.people) = 1, 'with no roles yet, a leader sees only their own person record');
select pg_temp.as_postgres();
select pg_temp.ok((select user_id from public.person_logins where person_id = '30000000-0000-0000-0000-000000000002') = '00000000-0000-0000-0000-00000000000e', 'accepting links the login to the person');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok(not exists (select 1 from public.org_members where user_id <> auth.uid()), 'even an owner reads only their own membership rows');
select pg_temp.ok((select count(*) from public.person_logins) = 1, 'an owner reads only their own login link');
select pg_temp.as_postgres();
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.org_members (org_id, user_id, role) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e', 'staff')$$) = '42501',
  'adding an existing member fails the same way as anyone else (no membership probe)');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$delete from public.org_members where org_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000e'$$) = ''
  and public.is_org_member('20000000-0000-0000-0000-000000000001') is not null
  and exists (select 1 from public.org_members where org_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000e'),
  'members are not removed by direct deletes');

-- roles grant permissions
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.person_roles (person_id, role_id, org_id)
  select '30000000-0000-0000-0000-000000000002', id, org_id from public.org_roles
  where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Deacon';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.ok((select count(*) from public.people) = 6, 'a Deacon sees the church directory');
select pg_temp.ok((select count(*) from public.person_notes) = 1, 'a Deacon reads care notes');
update public.people set last_name = 'Edited' where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.as_postgres();
select pg_temp.ok((select last_name from public.people where id = '30000000-0000-0000-0000-000000000001') = 'Pilot', 'a Deacon cannot edit people');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000e',
  $$select public.create_org_invitation('20000000-0000-0000-0000-000000000001', 'x@example.com', '30000000-0000-0000-0000-000000000006')$$) = '42501',
  'a Deacon cannot invite leaders');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000e',
  $$insert into public.person_roles (person_id, role_id, org_id) select '30000000-0000-0000-0000-000000000002', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Pastor'$$) = '42501',
  'a Deacon cannot give themselves another role');

update public.person_roles set role_id = (select id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Group Leader')
  where person_id = '30000000-0000-0000-0000-000000000002';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.ok((select count(*) from public.people) = 6, 'a Group Leader sees the directory');
select pg_temp.ok((select count(*) from public.person_notes) = 0, 'a Group Leader cannot read pastoral notes');
select pg_temp.as_postgres();

delete from public.org_members where org_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000e';
select pg_temp.ok(not exists (select 1 from public.person_logins where user_id = '00000000-0000-0000-0000-00000000000e'), 'leaving a church unlinks the login');
insert into public.org_members (org_id, user_id, role) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e', 'volunteer');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.ok(not public.has_org_permission('20000000-0000-0000-0000-000000000001', 'people.view'), 'rejoining does not bring back old roles');
select pg_temp.ok((select count(*) from public.people) = 0, 'a member without a linked person sees nobody');
select pg_temp.as_postgres();
-- Eve rejoins properly for the chart tests below.
insert into public.person_logins (person_id, org_id, user_id) values ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e');

\echo
\echo '== chms: oversight chart =========================================='

-- Pilot Church: the Lead Pastor answers to the Elders (and is an elder himself),
-- the Associate answers to the Lead, the Youth Pastor to the Associate.
select pg_temp.as_postgres();
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000011', 'lead@pilot.org',   '{"full_name":"Lead Pastor"}'),
  ('00000000-0000-0000-0000-000000000012', 'assoc@pilot.org',  '{"full_name":"Associate Pastor"}'),
  ('00000000-0000-0000-0000-000000000013', 'youth@pilot.org',  '{"full_name":"Youth Pastor"}'),
  ('00000000-0000-0000-0000-000000000014', 'elder@pilot.org',  '{"full_name":"An Elder"}'),
  ('00000000-0000-0000-0000-000000000015', 'keeper@pilot.org', '{"full_name":"Role Keeper"}'),
  ('00000000-0000-0000-0000-000000000016', 'paul2@pilot.org',  '{"full_name":"Paul Again"}');
insert into public.org_members (org_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'staff'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'staff'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 'staff'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014', 'volunteer'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015', 'volunteer');
insert into public.people (id, org_id, first_name, last_name, title) values
  ('31000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Lee', 'Lead', 'Lead Pastor'),
  ('31000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Ash', 'Assoc', 'Associate Pastor'),
  ('31000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Yan', 'Youth', 'Youth Pastor'),
  ('31000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'Eli', 'Elder', null),
  ('31000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 'Kip', 'Keeper', null),
  ('31000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 'Val', 'Vacant', 'Pastor (vacant)'),
  ('31000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 'Pat', 'Peer', 'Executive Pastor'),
  ('31000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', 'Una', 'Newcomer', null);
insert into public.person_logins (person_id, org_id, user_id) values
  ('31000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011'),
  ('31000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012'),
  ('31000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013'),
  ('31000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000014'),
  ('31000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000015');
insert into public.org_roles (org_id, name, permissions) values
  ('20000000-0000-0000-0000-000000000001', 'Role Keeper', '{roles.manage}'),
  ('20000000-0000-0000-0000-000000000001', 'Coordinator', '{people.view,roles.manage}'),
  ('20000000-0000-0000-0000-000000000001', 'Inviter', '{people.view,org.manage}');
insert into public.person_roles (person_id, role_id, org_id)
  select x.pid::uuid, r.id, r.org_id
  from (values ('31000000-0000-0000-0000-000000000001', 'Pastor'), ('31000000-0000-0000-0000-000000000001', 'Elder'),
               ('31000000-0000-0000-0000-000000000002', 'Pastor'), ('31000000-0000-0000-0000-000000000003', 'Staff'),
               ('31000000-0000-0000-0000-000000000004', 'Elder'), ('31000000-0000-0000-0000-000000000005', 'Role Keeper'),
               ('31000000-0000-0000-0000-000000000006', 'Pastor')) x(pid, role)
  join public.org_roles r on r.org_id = '20000000-0000-0000-0000-000000000001' and r.name = x.role;
update public.person_roles set role_id = (select id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Deacon')
  where person_id = '30000000-0000-0000-0000-000000000002';
insert into public.person_overseers (org_id, person_id, overseer_role_id)
  select org_id, '31000000-0000-0000-0000-000000000001', id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Elder';
insert into public.person_overseers (org_id, person_id, overseer_person_id) values
  ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000005', '31000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000007', '31000000-0000-0000-0000-000000000001');

select pg_temp.ok(chms_private.overseer_ids('31000000-0000-0000-0000-000000000003')
  @> array['31000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000004']::uuid[]
  and cardinality(chms_private.overseer_ids('31000000-0000-0000-0000-000000000003')) = 3,
  'the youth pastor answers to the associate, the lead and the elders');
select pg_temp.ok(not ('31000000-0000-0000-0000-000000000001' = any (chms_private.overseer_ids('31000000-0000-0000-0000-000000000001')))
  and '31000000-0000-0000-0000-000000000004' = any (chms_private.overseer_ids('31000000-0000-0000-0000-000000000001')),
  'a lead pastor who is also an elder answers to the other elders, not to himself');

-- loops
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.person_overseers (org_id, person_id, overseer_person_id) values ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000003')$$) = '23514',
  'the chart cannot go in a circle, even for the owner');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.person_roles (person_id, role_id, org_id) select '31000000-0000-0000-0000-000000000002', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Elder'$$) = '',
  'the associate can also be an elder');
select pg_temp.ok(not ('31000000-0000-0000-0000-000000000002' = any (chms_private.overseer_ids('31000000-0000-0000-0000-000000000001'))),
  'an elder who answers to the lead pastor does not oversee him through the board');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.person_overseers (org_id, person_id, overseer_role_id) select org_id, '31000000-0000-0000-0000-000000000002', id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Elder'$$) = '',
  'a second pastor-elder can also answer to the Elders');
select pg_temp.as_postgres();
delete from public.person_overseers where person_id = '31000000-0000-0000-0000-000000000002' and overseer_role_id is not null;
delete from public.person_roles where person_id = '31000000-0000-0000-0000-000000000002'
  and role_id = (select id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Elder');
insert into public.org_roles (org_id, name, permissions) values
  ('20000000-0000-0000-0000-000000000001', 'Board One', '{}'), ('20000000-0000-0000-0000-000000000001', 'Board Two', '{}');
insert into public.people (id, org_id, first_name) values
  ('31000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 'Zed'),
  ('31000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000001', 'Zoe');
insert into public.person_overseers (org_id, person_id, overseer_role_id)
  select org_id, '31000000-0000-0000-0000-000000000011', id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Board One';
insert into public.person_overseers (org_id, person_id, overseer_role_id)
  select org_id, '31000000-0000-0000-0000-000000000012', id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Board Two';
insert into public.person_roles (person_id, role_id, org_id)
  select '31000000-0000-0000-0000-000000000012', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Board One';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.person_roles (person_id, role_id, org_id) select '31000000-0000-0000-0000-000000000011', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Board Two'$$) = '',
  'boards may hold each other''s members accountable');
update public.people set archived_at = now() where id = '31000000-0000-0000-0000-000000000002';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.person_overseers (org_id, person_id, overseer_person_id) values ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000003')$$) = '23514',
  'a loop through an archived person is still a loop');
update public.people set archived_at = null where id = '31000000-0000-0000-0000-000000000002';

-- the associate pastor holds every permission but answers to the lead pastor
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$delete from public.person_roles where person_id = '31000000-0000-0000-0000-000000000001'$$) = '42501',
  'a pastor cannot remove the roles of the pastor over him');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$update public.org_roles set permissions = '{people.view}' where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Pastor'$$) = '42501',
  'a pastor cannot change a role held by himself or the pastor over him');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$update public.people set archived_at = now() where id = '31000000-0000-0000-0000-000000000001'$$) = '42501',
  'a pastor cannot archive the pastor over him');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$select public.unlink_person_login('31000000-0000-0000-0000-000000000001')$$) = '42501',
  'a pastor cannot remove the login of the pastor over him');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$delete from public.person_overseers where person_id = '31000000-0000-0000-0000-000000000002'$$) = '42501',
  'nobody can remove who they answer to');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$delete from public.person_overseers where person_id = '31000000-0000-0000-0000-000000000001'$$) = '42501',
  'nobody can change who their overseer answers to');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$insert into public.person_roles (person_id, role_id, org_id) select '31000000-0000-0000-0000-000000000002', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Elder'$$) = '42501',
  'nobody can give themselves a role');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$insert into public.person_roles (person_id, role_id, org_id) select '31000000-0000-0000-0000-000000000003', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Group Leader'$$) = '',
  'a pastor can assign roles to the staff under him');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$insert into public.person_overseers (org_id, person_id, overseer_person_id) values ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000007', '31000000-0000-0000-0000-000000000002')$$) = '42501',
  'a pastor cannot put a peer under himself');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$insert into public.person_overseers (org_id, person_id, overseer_person_id) values ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000001')$$) = '42501',
  'a pastor cannot place his staff under someone above him');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$insert into public.person_overseers (org_id, person_id, overseer_role_id) select org_id, '31000000-0000-0000-0000-000000000008', id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Elder'$$) = '42501',
  'only church admins draw board lines');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$insert into public.person_overseers (org_id, person_id, overseer_person_id) values ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000008', '31000000-0000-0000-0000-000000000002')$$) = '',
  'a pastor can place a newcomer under himself');

-- the youth pastor (Staff: view, edit, export) can edit details but not archive those over him
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.people set phone = '555-0199' where id = '31000000-0000-0000-0000-000000000001'$$) = '',
  'staff can update contact details of a pastor');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.people set archived_at = now() where id = '31000000-0000-0000-0000-000000000001'$$) = '42501',
  'staff cannot archive a pastor over them');

-- nobody hands out, edits or removes more access than they hold
insert into public.person_roles (person_id, role_id, org_id)
  select '31000000-0000-0000-0000-000000000003', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Coordinator';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$insert into public.person_roles (person_id, role_id, org_id) select '30000000-0000-0000-0000-000000000001', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Pastor'$$) = '42501',
  'a role manager cannot grant a role with more access than they hold');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$insert into public.org_roles (org_id, name, permissions) values ('20000000-0000-0000-0000-000000000001', 'Sneaky', '{org.manage}')$$) = '42501',
  'a role manager cannot create a role with more access than they hold');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.org_roles set permissions = '{people.notes}' where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Volunteer'$$) = '42501',
  'a role manager cannot add a permission they lack to any role');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$insert into public.person_roles (person_id, role_id, org_id) select '30000000-0000-0000-0000-000000000001', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Group Leader'$$) = '',
  'a role manager can grant a role within their own access');

-- a role manager who cannot even see the directory is held to the same rules
insert into public.org_roles (org_id, name, permissions) values ('20000000-0000-0000-0000-000000000001', 'Lead Marker', '{}');
insert into public.person_roles (person_id, role_id, org_id)
  select '31000000-0000-0000-0000-000000000001', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Lead Marker';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000015',
  $$update public.org_roles set description = 'changed' where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Lead Marker'$$) = '42501',
  'a role manager without directory access cannot touch a role held by someone over them');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000015',
  $$delete from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Lead Marker'$$) = '42501',
  'a role manager cannot delete a role held by someone over them');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000015',
  $$delete from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Staff'$$) = '42501',
  'a role manager cannot delete a role carrying permissions they lack');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000015',
  $$update public.org_roles set permissions = '{}' where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Staff'$$) = '42501',
  'a role manager cannot strip permissions they lack from a role');

-- invitations: church admins only
insert into public.person_roles (person_id, role_id, org_id)
  select '31000000-0000-0000-0000-000000000003', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Inviter';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$select public.create_org_invitation('20000000-0000-0000-0000-000000000001', 'me-again@pilot.org', '31000000-0000-0000-0000-000000000008')$$) = '42501',
  'only church admins can invite a login, even with church management permission');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$select public.unlink_person_login('31000000-0000-0000-0000-000000000004')$$) = '42501',
  'only church admins can remove a login');
update public.org_members set role = 'admin' where org_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000011';
select pg_temp.as_user('00000000-0000-0000-0000-000000000011');
insert into _chms values ('paul', public.create_org_invitation('20000000-0000-0000-0000-000000000001', 'paul2@pilot.org', '30000000-0000-0000-0000-000000000001')->>'token');
select pg_temp.as_postgres();
update public.org_members set role = 'staff' where org_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000011';
select pg_temp.as_user('00000000-0000-0000-0000-000000000016');
select pg_temp.ok((public.accept_org_invitation((select v from _chms where k = 'paul'))->>'ok') = 'false',
  'an invitation dies when its sender stops being an admin');
select pg_temp.ok(not public.is_org_member('20000000-0000-0000-0000-000000000001'), 'the refused invitation grants nothing');
select pg_temp.as_postgres();
update public.org_members set role = 'admin' where org_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000015';
select pg_temp.as_user('00000000-0000-0000-0000-000000000015');
select public.create_org_invitation('20000000-0000-0000-0000-000000000001', 'zoe@pilot.org', '31000000-0000-0000-0000-000000000012');
select pg_temp.as_postgres();
delete from public.org_members where org_id = '20000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000015';
select pg_temp.ok((select revoked_at is not null from public.org_invitations where email = 'zoe@pilot.org'), 'removing an admin cancels the invitations they sent');

-- notes: oversight notes go up the chart only; nobody reads notes about themselves
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.person_notes (person_id, org_id, body, visibility) values
  ('31000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Needs a sabbatical soon.', 'oversight'),
  ('31000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Asked for prayer for his family.', 'care'),
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Counseling session notes.', 'private');
select pg_temp.as_user('00000000-0000-0000-0000-000000000011');
select pg_temp.ok((select count(*) from public.person_notes where person_id = '31000000-0000-0000-0000-000000000002') = 2, 'the lead pastor reads care and oversight notes about the associate');
select pg_temp.ok((select count(*) from public.person_notes where visibility = 'private') = 0, 'private notes stay with their author');
select pg_temp.as_user('00000000-0000-0000-0000-000000000014');
select pg_temp.ok((select count(*) from public.person_notes where person_id = '31000000-0000-0000-0000-000000000002') = 2, 'an elder over the chain reads oversight notes');
select pg_temp.as_user('00000000-0000-0000-0000-000000000012');
select pg_temp.ok((select count(*) from public.person_notes where person_id = '31000000-0000-0000-0000-000000000002') = 0, 'the associate cannot read notes about himself');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.ok((select count(*) from public.person_notes where person_id = '31000000-0000-0000-0000-000000000002') = 1, 'a deacon outside the chain reads only the care note');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.person_notes where visibility = 'private') = 1, 'the author reads their private note');
select pg_temp.as_postgres();

\echo
\echo '== chms: church ownership ========================================='

-- Only the claim process changes who claimed a church.
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000d',
  $$update public.churches set claimed_by = '00000000-0000-0000-0000-00000000000d' where id = '10000000-0000-0000-0000-000000000001'$$) = '42501',
  'a moderator cannot make themselves a church''s claimant');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.churches (id, name, city, state, status, claimed_by) values
  ('10000000-0000-0000-0000-000000000077', 'Moderator Church', 'Tampa', 'FL', 'approved', '00000000-0000-0000-0000-00000000000d');
select pg_temp.as_postgres();
select pg_temp.ok((select claimed_by is null from public.churches where id = '10000000-0000-0000-0000-000000000077')
  and not exists (select 1 from public.organizations where church_id = '10000000-0000-0000-0000-000000000077'),
  'a moderator cannot create a church already claimed');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.ok(not public.has_org_permission((select id from public.organizations where church_id = '10000000-0000-0000-0000-000000000001'), 'people.notes'),
  'a moderator holds no church permissions');
select pg_temp.as_postgres();

-- Nobody approves their own claim.
insert into public.churches (id, name, city, state, status) values ('10000000-0000-0000-0000-000000000088', 'Self Review Church', 'Tampa', 'FL', 'approved');
insert into public.church_claims (church_id, user_id, claim_email, verified, verified_at, review_status)
  values ('10000000-0000-0000-0000-000000000088', '00000000-0000-0000-0000-00000000000d', 'dan@example.com', true, now(), 'pending_review');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000d',
  $$select public.review_church_claim((select id from public.church_claims where church_id = '10000000-0000-0000-0000-000000000088'), true)$$) = '42501',
  'a moderator cannot approve their own claim');
select pg_temp.ok((select claimed_by is null from public.churches where id = '10000000-0000-0000-0000-000000000088'), 'the church stays unclaimed');

-- A transfer removes the previous claimant as owner.
update public.churches set claimed_by = '00000000-0000-0000-0000-00000000000f' where id = '10000000-0000-0000-0000-000000000002';
select pg_temp.ok(not exists (select 1 from public.org_members m join public.organizations o on o.id = m.org_id
                              where o.church_id = '10000000-0000-0000-0000-000000000002' and m.user_id = '00000000-0000-0000-0000-00000000000b'),
  'transferring a church removes the previous owner');
update public.churches set claimed_by = null where id = '10000000-0000-0000-0000-000000000002';
select pg_temp.ok(not exists (select 1 from public.org_members m join public.organizations o on o.id = m.org_id
                              where o.church_id = '10000000-0000-0000-0000-000000000002'),
  'un-claiming a church removes its owner');
update public.churches set claimed_by = '00000000-0000-0000-0000-00000000000b' where id = '10000000-0000-0000-0000-000000000002';

-- reviewer anonymity: nothing in the schema joins church people to reviews
select pg_temp.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'chms_private')
    and p.prosrc ~ '(public\.people|public\.person_\w+)\M' and p.prosrc ~* '\m(reviews|profiles|review_\w+)\M'),
  'no function references both church people and reviews or profiles');
select pg_temp.ok(not exists (
  select 1 from pg_views where schemaname in ('public', 'chms_private') and definition ~ '\m(people|person_\w+)\M' and definition ~* '\m(reviews|profiles)\M'),
  'no view joins church people to reviews or profiles');
select pg_temp.ok(not exists (
  select 1 from pg_policies where schemaname = 'public'
    and coalesce(qual, '') || coalesce(with_check, '') ~ '\m(people|person_\w+)\M'
    and coalesce(qual, '') || coalesce(with_check, '') ~* '\m(reviews|profiles)\M'),
  'no policy mixes church people with reviews or profiles');

\echo
\echo 'All tests passed.'
rollback;
