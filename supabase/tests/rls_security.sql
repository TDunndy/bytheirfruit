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

select pg_temp.ok((select count(*) from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001') = 9, 'new church gets the nine default roles');
select pg_temp.ok((select cardinality(permissions) from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Pastor') = cardinality(chms_private.all_permissions()), 'Pastor holds every permission');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'seed_default_org_roles'),
  'role seeding is not callable through the API');

-- anonymous and outsiders
select pg_temp.as_user(null, 'anon');
select pg_temp.ok((select count(*) from public.people) = 0, 'anon sees no people');
select pg_temp.ok((select count(*) from public.households) = 0, 'anon sees no households');
select pg_temp.ok(not has_function_privilege('anon', 'public.has_org_permission(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.unlink_person_login(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'chms_private.seed_default_org_roles(uuid)', 'execute'),
  'anon cannot call the church app functions, and nobody can call role seeding');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from public.people) = 0, 'site admin of By Their Fruit sees no church people');
select pg_temp.as_postgres();

-- account ids never reach church users
select pg_temp.ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name in ('people', 'people_audit', 'person_notes', 'org_invitations', 'households', 'person_roles', 'person_overseers', 'org_roles',
                       'org_checkin_settings', 'custom_field_defs', 'custom_field_values_sensitive', 'household_flags', 'access_log', 'chms_audit',
                       'child_care', 'pickup_people', 'person_documents', 'person_credentials', 'contact_consents', 'checkin_keys', 'domain_events',
                       'areas', 'rooms', 'area_leaders', 'room_leaders', 'printers', 'label_templates', 'stations', 'station_scopes', 'schedules',
                       'schedule_rooms', 'occurrences', 'room_overrides', 'checkin_restrictions', 'volunteer_slots', 'volunteer_assignments',
                       'checkin_sessions', 'security_codes', 'attendance_events', 'attendance_pickup_names', 'attendance', 'station_alerts', 'attendance_baselines')
    and (column_name in ('user_id', 'created_by', 'accepted_by', 'actor') or column_name like '%user%')),
  'no church table a leader can read carries an account id');

-- church owner
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.people) = 5, 'owner sees their church''s people only');
select pg_temp.ok(cardinality(public.my_org_permissions('20000000-0000-0000-0000-000000000001')) = cardinality(chms_private.all_permissions()), 'owner holds every permission');
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
  $$insert into public.person_overseers (org_id, person_id, overseer_person_id) values ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000008', '31000000-0000-0000-0000-000000000002')$$) = '42501',
  'only church admins draw the chart, even a pastor placing a newcomer under himself');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000011',
  $$delete from public.person_overseers where person_id = '31000000-0000-0000-0000-000000000002'$$) = '42501',
  'only church admins remove chart lines, even below them');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.person_overseers (org_id, person_id, overseer_person_id) values ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000008', '31000000-0000-0000-0000-000000000002')$$) = '',
  'a church admin places a newcomer under the associate');

-- board members' chart lines are admin-only (they decide who oversees whom)
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000011',
  $$insert into public.person_overseers (org_id, person_id, overseer_person_id) values ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000004', '31000000-0000-0000-0000-000000000001')$$) = '42501'
  and '31000000-0000-0000-0000-000000000004' = any (chms_private.overseer_ids('31000000-0000-0000-0000-000000000001')),
  'a non-admin lead pastor cannot place an unplaced elder who oversees him under himself');
insert into public.people (id, org_id, first_name) values ('31000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000001', 'Bea');
insert into public.person_overseers (org_id, person_id, overseer_person_id) values
  ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000004', '31000000-0000-0000-0000-000000000021');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000011',
  $$insert into public.person_overseers (org_id, person_id, overseer_person_id) values ('20000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000021', '31000000-0000-0000-0000-000000000001')$$) = '42501'
  and '31000000-0000-0000-0000-000000000004' = any (chms_private.overseer_ids('31000000-0000-0000-0000-000000000001')),
  'a non-admin cannot place someone an elder answers to under himself');
delete from public.person_overseers where person_id = '31000000-0000-0000-0000-000000000004';
insert into public.person_roles (person_id, role_id, org_id)
  select '31000000-0000-0000-0000-000000000008', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Elder';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$delete from public.person_overseers where person_id = '31000000-0000-0000-0000-000000000008'$$) = '42501'
  and not ('31000000-0000-0000-0000-000000000008' = any (chms_private.overseer_ids('31000000-0000-0000-0000-000000000001'))),
  'a non-admin cannot remove an elder''s line to make that elder oversee his boss');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$delete from public.person_roles where person_id = '31000000-0000-0000-0000-000000000008'$$) = '42501',
  'a non-admin cannot take someone off a board');
delete from public.person_roles where person_id = '31000000-0000-0000-0000-000000000008';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$insert into public.person_roles (person_id, role_id, org_id) select '31000000-0000-0000-0000-000000000003', id, org_id from public.org_roles where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Elder'$$) = '42501'
  and not ('31000000-0000-0000-0000-000000000003' = any (chms_private.overseer_ids('31000000-0000-0000-0000-000000000001'))),
  'a non-admin cannot put anyone on a board');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$update public.org_roles set description = 'changed' where org_id = '20000000-0000-0000-0000-000000000001' and name = 'Board One'$$) = '42501',
  'a non-admin cannot change a board');

-- an overseer on leave (archived) is still over you
update public.people set archived_at = now() where id = '31000000-0000-0000-0000-000000000001';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$delete from public.person_roles where person_id = '31000000-0000-0000-0000-000000000001'$$) = '42501',
  'a pastor cannot change the roles of an archived pastor over him');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012',
  $$update public.people set archived_at = null where id = '31000000-0000-0000-0000-000000000001'$$) = '42501',
  'a pastor cannot restore an archived pastor over him');
update public.people set archived_at = null where id = '31000000-0000-0000-0000-000000000001';
update public.people set archived_at = now() where id = '31000000-0000-0000-0000-000000000004';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000011',
  $$update public.people set archived_at = null where id = '31000000-0000-0000-0000-000000000004'$$) = '42501',
  'a leader cannot restore an archived elder');
update public.people set archived_at = null where id = '31000000-0000-0000-0000-000000000004';

-- the youth pastor (Staff: view, edit, export) can edit details but not archive those over him
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.people set phone = '555-0199' where id = '31000000-0000-0000-0000-000000000001'$$) = '',
  'staff can update contact details of a pastor');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.people set archived_at = now() where id = '31000000-0000-0000-0000-000000000001'$$) = '42501',
  'staff cannot archive a pastor over them');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.people set archived_at = now() where id = '31000000-0000-0000-0000-000000000006'$$) = '42501',
  'staff cannot archive a leader with more access than they hold');
update public.people set archived_at = now() where id = '31000000-0000-0000-0000-000000000006';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.people set archived_at = null where id = '31000000-0000-0000-0000-000000000006'$$) = '42501',
  'staff cannot restore a leader with more access than they hold');
update public.people set archived_at = null where id = '31000000-0000-0000-0000-000000000006';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.people set archived_at = now() where id = '31000000-0000-0000-0000-000000000007'$$) = ''
  and pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.people set archived_at = null where id = '31000000-0000-0000-0000-000000000007'$$) = '',
  'staff can archive and restore someone with no more access than they hold');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.people set archived_at = now() where id = '30000000-0000-0000-0000-000000000004'$$) = '42501',
  'staff cannot archive the church owner''s record');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000013',
  $$update public.people set archived_at = now() where id = '31000000-0000-0000-0000-000000000012'$$) = '42501',
  'staff cannot archive a board member');

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
insert into _chms values ('notes_before', (select count(*) from public.person_notes));
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000012', $$delete from public.person_notes$$) = ''
  and (select count(*) from public.person_notes)::text = (select v from _chms where k = 'notes_before'),
  'a pastor who is not an admin cannot blindly delete notes about himself or others'' private notes');

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
insert into public.churches (id, name, city, state, status, website) values ('10000000-0000-0000-0000-000000000089', 'Auto Church', 'Tampa', 'FL', 'approved', 'https://autochurch.org');
insert into public.church_claims (church_id, user_id, claim_email, verification_code_hash, code_expires_at, review_status)
  values ('10000000-0000-0000-0000-000000000089', '00000000-0000-0000-0000-00000000000d', 'dan@autochurch.org',
          encode(extensions.digest('313131', 'sha256'), 'hex'), now() + interval '1 hour', 'auto');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.ok((public.verify_claim_code('10000000-0000-0000-0000-000000000089', '313131')->>'manual_review') = 'true',
  'a moderator''s matching-domain claim still waits for review');
select pg_temp.as_postgres();
select pg_temp.ok((select claimed_by is null from public.churches where id = '10000000-0000-0000-0000-000000000089')
  and (select review_status = 'pending_review' and verified from public.church_claims where church_id = '10000000-0000-0000-0000-000000000089'),
  'the moderator''s church stays unclaimed until another reviewer approves');

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
\echo '== chms: check-in A (people changes) =============================='

-- Runs a statement as the current (postgres) role and returns the SQLSTATE.
create or replace function pg_temp.try_sql(p_sql text) returns text language plpgsql as $$
declare v_state text := '';
begin
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate;
  end;
  return v_state;
end $$;
-- A paired station: authenticated, with app_metadata.kind = 'station'.
create or replace function pg_temp.as_station(p_uid uuid, p_station uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'app_metadata', json_build_object('kind', 'station', 'station_id', p_station))::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

select pg_temp.as_postgres();
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'owner@checkin.org'),
  ('00000000-0000-0000-0000-000000000022', 'sam@checkin.org'),
  ('00000000-0000-0000-0000-000000000023', 'gail@checkin.org'),
  ('00000000-0000-0000-0000-000000000024', 'dee@checkin.org'),
  ('00000000-0000-0000-0000-000000000025', 'eli@checkin.org'),
  ('00000000-0000-0000-0000-000000000026', 'kiosk@stations.invalid');
insert into public.organizations (id, name, slug) values ('20000000-0000-0000-0000-000000000003', 'Checkin Church', 'checkin-church');
insert into public.org_members (org_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000021', 'owner'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000022', 'staff'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000023', 'volunteer'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000024', 'volunteer'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000025', 'volunteer');
insert into public.people (id, org_id, first_name, last_name, birthdate, phone) values
  ('32000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'Sam', 'Staff', null, null),
  ('32000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'Gail', 'Greeter', null, null),
  ('32000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Dee', 'Deacon', null, null),
  ('32000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 'Eli', 'Elder', null, null),
  ('32000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', 'Pat', 'Parent', '1988-05-05', '(941) 555-0100'),
  ('32000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000003', 'Kid', 'Parent', '2020-01-01', null),
  ('32000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', 'Tess', 'Teen', (current_date - interval '17 years')::date, null),
  ('32000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000003', 'Uri', 'Uncle', '1985-01-01', null),
  ('32000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000003', 'Ann', 'Aunt', '1986-01-01', null);
insert into public.person_logins (person_id, org_id, user_id) values
  ('32000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000022'),
  ('32000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000023'),
  ('32000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000024'),
  ('32000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000025');
insert into public.org_roles (org_id, name, permissions) values ('20000000-0000-0000-0000-000000000003', 'Greeter', '{people.view}');
insert into public.person_roles (person_id, role_id, org_id)
  select x.pid::uuid, r.id, r.org_id
  from (values ('32000000-0000-0000-0000-000000000001', 'Staff'), ('32000000-0000-0000-0000-000000000002', 'Greeter'),
               ('32000000-0000-0000-0000-000000000003', 'Deacon'), ('32000000-0000-0000-0000-000000000004', 'Elder')) x(pid, role)
  join public.org_roles r on r.org_id = '20000000-0000-0000-0000-000000000003' and r.name = x.role;
insert into public.households (id, org_id, name) values ('42000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'The Parents');
insert into public.household_members (household_id, person_id, org_id, relationship, is_guardian, can_check_in) values
  ('42000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', 'head', true, true),
  ('42000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000003', 'child', false, false),
  ('42000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000003', 'other', true, true);

-- permissions
select pg_temp.ok((select count(*) from public.org_roles where org_id = '20000000-0000-0000-0000-000000000003') = 10, 'a church gets nine default roles (plus one custom here)');
select pg_temp.ok(array['kids.view', 'kids.care', 'custody.manage', 'checkin.manage', 'rules.manage']::text[] <@ chms_private.all_permissions(), 'the permission list carries the check-in permissions');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.org_roles (org_id, name, permissions) values ('20000000-0000-0000-0000-000000000003', 'Bad', '{people.fly}')$$) = '23514',
  'unknown permissions are refused');
select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
select pg_temp.ok(public.my_org_permissions('20000000-0000-0000-0000-000000000003') <@ chms_private.all_permissions()
  and chms_private.all_permissions() <@ public.my_org_permissions('20000000-0000-0000-0000-000000000003'), 'the owner holds every new permission too');
select pg_temp.ok(public.has_org_permission('20000000-0000-0000-0000-000000000003', 'custody.manage'), 'has_org_permission knows the new permissions');
select pg_temp.ok((select permissions @> '{kids.view,kids.care}' from public.org_roles where org_id = '20000000-0000-0000-0000-000000000003' and name = 'Staff'), 'the Staff role carries kids.view and kids.care');
select pg_temp.ok((select permissions @> '{custody.manage}' from public.org_roles where org_id = '20000000-0000-0000-0000-000000000003' and name = 'Elder'), 'elders hold custody.manage');
select pg_temp.ok((select not (permissions @> '{kids.care}') from public.org_roles where org_id = '20000000-0000-0000-0000-000000000003' and name = 'Deacon'), 'deacons do not hold kids.care');

-- children need kids.view
select pg_temp.as_user('00000000-0000-0000-0000-000000000023');
select pg_temp.ok((select count(*) from public.people where id = '32000000-0000-0000-0000-000000000005') = 1, 'people.view reads an adult');
select pg_temp.ok((select count(*) from public.people where id in ('32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000007')) = 0, 'people.view alone hides children (by household and by birthdate)');
select pg_temp.ok((select count(*) from public.household_members where person_id = '32000000-0000-0000-0000-000000000006') = 0, 'people.view alone hides a child''s household row');
select pg_temp.ok((select count(*) from public.people_audit where person_id = '32000000-0000-0000-0000-000000000006') = 0, 'people.view alone hides a child''s history');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select count(*) from public.people where id in ('32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000007')) = 2, 'kids.view reads children');
select pg_temp.ok((select count(*) from public.people_audit where person_id = '32000000-0000-0000-0000-000000000006') = 1, 'kids.view reads a child''s history');
select pg_temp.as_postgres();

-- phones
select pg_temp.ok((select phone_e164 from public.people where id = '32000000-0000-0000-0000-000000000005') = '+19415550100', 'phones are normalized to E.164');

-- care notes: no direct reads, logged RPC reads
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$select public.set_child_care('32000000-0000-0000-0000-000000000006', 'Peanuts', 'Peanut', 'Inhaler in bag', null)$$) = '',
  'a care holder writes care notes through the RPC');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select count(*) from public.child_care) = 0, 'care notes are never readable directly, even by a care holder');
select pg_temp.ok((public.get_child_care('32000000-0000-0000-0000-000000000006') ->> 'allergies') = 'Peanuts', 'a care holder reads care notes through the RPC');
select pg_temp.as_user('00000000-0000-0000-0000-000000000024');
select pg_temp.ok(pg_temp.try_sql($$select public.get_child_care('32000000-0000-0000-0000-000000000006')$$) = '42501', 'kids.view alone cannot read care notes');
select pg_temp.ok((select has_allergy and allergy_short = 'Peanut' from public.child_care_summary('20000000-0000-0000-0000-000000000003') where person_id = '32000000-0000-0000-0000-000000000006'),
  'kids.view reads the alert flags and label text');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$select public.get_child_care('32000000-0000-0000-0000-000000000006')$$) = '42501', 'another church''s owner cannot read care notes');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000024',
  $$select public.set_child_care('32000000-0000-0000-0000-000000000006', 'x', null, null, null)$$) = '42501', 'kids.view alone cannot write care notes');
select pg_temp.as_postgres();
select pg_temp.ok((select count(*) from public.access_log where subject_person_id = '32000000-0000-0000-0000-000000000006' and action in ('child_care.write', 'child_care.read')
                   and actor_person_id = '32000000-0000-0000-0000-000000000001' and actor_kind = 'leader') = 2,
  'care reads and writes are logged with the actor''s person record');
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'child_care' and row_id = '32000000-0000-0000-0000-000000000006' and action = 'insert') = 1,
  'care notes are audited with before and after');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select count(*) from public.access_log) = 0, 'only church admins read the access log');
select pg_temp.as_postgres();

-- pickups and custody: restricted wins
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$insert into public.pickup_people (org_id, child_person_id, person_id, kind, note) values
      ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000008', 'restricted', 'court order on file'),
      ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000009', 'authorized', null)$$) = '',
  'a custody manager records pickups');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000024',
  $$insert into public.pickup_people (org_id, child_person_id, person_id, kind) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000009', 'restricted')$$) = '42501',
  'kids.view alone cannot record pickups');
select pg_temp.ok(chms_private.pickup_status('32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000005') = 'guardian', 'a guardian may pick up');
select pg_temp.ok(chms_private.pickup_status('32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000009') = 'authorized', 'an authorized person may pick up');
select pg_temp.ok(chms_private.pickup_status('32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000008') = 'restricted', 'a restricted person is refused even as a household guardian');
select pg_temp.ok(chms_private.pickup_status('32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000002') = 'unknown', 'anyone else is unknown');
select pg_temp.as_user('00000000-0000-0000-0000-000000000024');
select pg_temp.ok((select string_agg(kind, ',') from public.pickup_people where child_person_id = '32000000-0000-0000-0000-000000000006') = 'authorized', 'kids.view reads authorized pickups but not restricted ones');
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'pickup_people') = 0, 'custody audit rows need custody.manage');
select pg_temp.as_user('00000000-0000-0000-0000-000000000025');
select pg_temp.ok((select count(*) from public.pickup_people where child_person_id = '32000000-0000-0000-0000-000000000006') = 2, 'a custody manager reads every pickup');
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'pickup_people' and actor_person_id = '32000000-0000-0000-0000-000000000004') = 2, 'pickup changes are audited with the actor');
select pg_temp.ok((select created_by_person_id = '32000000-0000-0000-0000-000000000004' from public.pickup_people where person_id = '32000000-0000-0000-0000-000000000008'), 'the creator is stamped from the login');
select pg_temp.as_postgres();

-- households: memberships end, never delete
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$delete from public.household_members where person_id = '32000000-0000-0000-0000-000000000008'$$) = ''
  and (select count(*) from public.household_members where person_id = '32000000-0000-0000-0000-000000000008') = 1,
  'household memberships cannot be deleted');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$update public.household_members set ended_at = now() where person_id = '32000000-0000-0000-0000-000000000008'$$) = ''
  and chms_private.pickup_status('32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000008') = 'restricted',
  'an editor ends a membership; the ended guardian no longer counts');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$update public.household_members set is_guardian = true where person_id = '32000000-0000-0000-0000-000000000006'$$) = '23514',
  'a child cannot be a guardian');

-- household flags
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000024',
  $$insert into public.household_flags (org_id, household_id, flag, note) values ('20000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000001', 'pastoral_hold', 'see notes')$$) = '',
  'a note keeper sets a pastoral hold');
select pg_temp.ok((select set_by_person_id = '32000000-0000-0000-0000-000000000003' from public.household_flags where flag = 'pastoral_hold'), 'the flag records who set it');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000024',
  $$insert into public.household_flags (org_id, household_id, flag) values ('20000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000001', 'pastoral_hold')$$) = '23505',
  'one active flag of a kind per household');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000023',
  $$insert into public.household_flags (org_id, household_id, flag) values ('20000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000001', 'exempt')$$) = '42501',
  'people.view alone cannot set flags');

-- settings
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.org_checkin_settings (org_id, time_zone) values ('20000000-0000-0000-0000-000000000003', 'America/New_York')$$) = '42501',
  'check-in settings need checkin.manage');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.org_checkin_settings (org_id, time_zone) values ('20000000-0000-0000-0000-000000000003', 'Mars/Phobos')$$) = '22023',
  'an unknown time zone is refused');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.org_checkin_settings (org_id, time_zone) values ('20000000-0000-0000-0000-000000000003', 'America/New_York')$$) = '',
  'an admin sets the church time zone');

-- credentials
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.person_credentials (org_id, person_id, kind, completed_on, expires_on) values
      ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000001', 'background_check', current_date - 30, current_date + 300),
      ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000002', 'background_check', current_date - 800, current_date - 70)$$) = '',
  'a check-in manager records credentials');
select pg_temp.ok(chms_private.credential_status('32000000-0000-0000-0000-000000000001') = 'cleared'
  and chms_private.credential_status('32000000-0000-0000-0000-000000000002') = 'expired'
  and chms_private.credential_status('32000000-0000-0000-0000-000000000005') = 'none', 'credential status: cleared, expired, none');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$select count(*) from public.person_credentials$$) = '' and (select count(*) from (select 1 from public.person_credentials) s) = 2
  and pg_temp.try_as('00000000-0000-0000-0000-000000000024',
  $$insert into public.person_credentials (org_id, person_id, kind, completed_on) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000003', 'training', current_date)$$) = '42501',
  'only check-in managers record credentials');

-- consents
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.contact_consents (org_id, phone_e164, scope, person_id, source, text_version) values ('20000000-0000-0000-0000-000000000003', '+19415550100', 'safety', '32000000-0000-0000-0000-000000000005', 'admin', 'v1')$$) = '',
  'an editor records consent');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.contact_consents (org_id, phone_e164, scope, source, text_version) values ('20000000-0000-0000-0000-000000000003', '+19415550100', 'safety', 'admin', 'v1')$$) = '23505',
  'one active consent per number and scope');

-- sensitive custom fields
select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
insert into public.custom_field_defs (id, org_id, applies_to, key, label, field_type, sensitive)
  values ('52000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'person', 'iep', 'IEP on file', 'boolean', true);
select pg_temp.as_postgres();
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000024',
  $$insert into public.custom_field_values_sensitive (field_id, org_id, subject_id, value) values ('52000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'true')$$) = '42501',
  'sensitive custom values need kids.care');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.custom_field_values_sensitive (field_id, org_id, subject_id, value) values ('52000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'true')$$) = '',
  'a care holder sets a sensitive custom value');

-- domain events and append-only logs
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.people (org_id, first_name, last_name, tags) values ('20000000-0000-0000-0000-000000000003', 'New', 'Guest', '{guest}')$$) = '', 'staff add a person');
select pg_temp.ok((select payload ->> 'guest' = 'true' and actor_kind = 'leader' and actor_person_id = '32000000-0000-0000-0000-000000000001'
                   from public.domain_events where type = 'person.created' order by seq desc limit 1),
  'adding a person emits person.created with the actor''s person id');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$update public.people set phone = '941-555-0199' where id = '32000000-0000-0000-0000-000000000005'$$) = ''
  and (select payload -> 'changed' = '["phone"]' from public.domain_events where type = 'person.updated' order by seq desc limit 1),
  'updating a person emits the changed field names, not values');
select pg_temp.ok(not exists (select 1 from public.domain_events where payload::text like '%555-0199%'), 'event payloads carry no personal data');
select pg_temp.ok((select count(*) from public.domain_events where type = 'household.member_ended') = 1, 'ending a membership emits an event');
select pg_temp.ok(pg_temp.try_sql($$update public.domain_events set payload = '{}' where seq = (select max(seq) from public.domain_events)$$) = '42501'
  and pg_temp.try_sql($$delete from public.access_log$$) = '42501'
  and pg_temp.try_sql($$delete from public.chms_audit$$) = '42501'
  and pg_temp.try_sql($$delete from public.people_audit where person_id = '32000000-0000-0000-0000-000000000005'$$) = '42501',
  'event, access, audit and history logs are append-only, even for postgres');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$update public.domain_events set payload = '{}'$$) in ('', '42501')
  and (select payload <> '{}' from public.domain_events where type = 'person.updated' order by seq desc limit 1),
  'owners cannot change events');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select count(*) from public.domain_events) = 0, 'only church admins read events');
select pg_temp.as_postgres();

-- audit rows never exceed their table's permission
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'child_care') = 0, 'care holders cannot read care-note history through the audit');
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'person_credentials') = 0, 'credential history needs checkin.manage, kids.care is not enough');
select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'child_care') = 1
  and not exists (select 1 from public.chms_audit where table_name = 'child_care' and (new_row ? 'medical' or new_row ? 'allergies')),
  'the care-note audit keeps flags and label text, never the notes');
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'person_credentials') = 2, 'church admins read credential history');
select pg_temp.as_postgres();
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'household_members' and action = 'update') >= 1, 'guardian and membership changes are audited');
select pg_temp.as_user('00000000-0000-0000-0000-000000000024');
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'household_members') = 0, 'membership history needs custody.manage');
select pg_temp.as_postgres();

-- a STOP is final
update public.contact_consents set revoked_at = now(), revoked_source = 'stop' where phone_e164 = '+19415550100';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$update public.contact_consents set revoked_at = null, revoked_source = null where phone_e164 = '+19415550100'$$) = '42501',
  'a STOP cannot be undone by an editor');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.contact_consents (org_id, phone_e164, scope, source, text_version) values ('20000000-0000-0000-0000-000000000003', '+19415550100', 'safety', 'admin', 'v2')$$) = '',
  'consenting again after a STOP is a new row');

-- attribution is pinned
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000024',
  $$update public.household_flags set set_by_person_id = '32000000-0000-0000-0000-000000000004', set_at = '2020-01-01' where flag = 'pastoral_hold'$$) = ''
  and (select set_by_person_id = '32000000-0000-0000-0000-000000000003' and set_at > '2020-01-02' from public.household_flags where flag = 'pastoral_hold'),
  'a note keeper cannot rewrite who set a flag');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000024',
  $$update public.household_flags set cleared_at = now() where flag = 'pastoral_hold'$$) = '', 'a note keeper clears a flag');
select pg_temp.ok((select cleared_by_person_id = '32000000-0000-0000-0000-000000000003' from public.household_flags where flag = 'pastoral_hold'),
  'clearing a flag records who cleared it');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000024',
  $$update public.household_flags set cleared_at = null where flag = 'pastoral_hold'$$) = '42501',
  'a cleared flag cannot be re-opened');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$update public.pickup_people set created_by_person_id = '32000000-0000-0000-0000-000000000003', created_at = '2020-01-01' where kind = 'restricted'$$) = '',
  'a custody manager edits a pickup');
select pg_temp.ok((select created_by_person_id = '32000000-0000-0000-0000-000000000004' and created_at > '2020-01-02' from public.pickup_people where kind = 'restricted'),
  'pickup attribution cannot be rewritten');

-- admins without a person record are still identified, privately
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$select public.get_child_care('32000000-0000-0000-0000-000000000006')$$) = '', 'an owner reads care notes');
select pg_temp.ok((select l.actor_person_id is null and l.actor_kind = 'admin' and a.user_id = '00000000-0000-0000-0000-000000000021'
                   from public.access_log l join chms_private.audit_actors a on a.log = 'access_log' and a.log_id = l.id
                   where l.action = 'child_care.read' order by l.id desc limit 1),
  'an unlinked owner''s read is attributed in chms_private, never in a church-readable table');
select pg_temp.ok((select count(*) from public.access_log where action = 'child_care.summary' and subject_count = 1) = 1, 'a care summary read is logged once');

-- documents live under their own org, kind and person
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$insert into public.person_documents (org_id, person_id, kind, storage_path, title) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'custody', '20000000-0000-0000-0000-000000000003/custody/32000000-0000-0000-0000-000000000006/order.pdf', 'Custody order')$$) = '',
  'a custody manager files a custody document');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.person_documents (org_id, person_id, kind, storage_path, title) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'medical', '20000000-0000-0000-0000-000000000003/custody/32000000-0000-0000-0000-000000000006/order.pdf', 'x')$$) = '23514',
  'a document row cannot point at another kind''s folder');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select count(*) from public.person_documents) = 0, 'care holders do not see custody documents');
select pg_temp.as_postgres();

-- guards that hold for everyone
select pg_temp.ok(pg_temp.try_sql($$truncate public.domain_events$$) = '42501'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$truncate public.access_log$$) = '42501',
  'append-only tables cannot be truncated');
select pg_temp.ok(not has_function_privilege('authenticated', 'chms_private.emit_event(uuid,text,text,uuid,jsonb,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'chms_private.pickup_status(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'chms_private.log_access(uuid,text,uuid,int,jsonb)', 'execute'),
  'internal helpers are not callable by API roles');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$insert into public.pickup_people (org_id, child_person_id, name, kind) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'Someone', 'restricted')$$) = '23514',
  'a restriction must name a directory record');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$insert into public.pickup_people (org_id, child_person_id, person_id, kind) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', 'authorized')$$) = '23503',
  'a pickup cannot name another church''s person');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$update public.household_members set can_check_in = true where person_id = '32000000-0000-0000-0000-000000000006'$$) = '23514',
  'a child cannot be allowed to check in siblings');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.custom_field_values_sensitive (field_id, org_id, subject_id, value) values ('52000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'true')$$) = '23503',
  'a sensitive value cannot point at another church''s person');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$insert into public.pickup_people (org_id, child_person_id, person_id, kind, valid_to) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000009', 'restricted', current_date - 1)$$) = '',
  'a custody manager records a dated restriction');
select pg_temp.ok(chms_private.pickup_status('32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000009') = 'authorized',
  'a restriction with a past end date no longer applies');

-- people.edit without kids.view cannot touch children, even blind
update public.org_roles set permissions = '{people.view,people.edit}' where org_id = '20000000-0000-0000-0000-000000000003' and name = 'Greeter';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000023',
  $$update public.people set membership_status = 'inactive'$$) = '', 'an editor runs an unfiltered update');
select pg_temp.ok((select count(*) from public.people where id in ('32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000007') and membership_status = 'inactive') = 0
  and (select membership_status from public.people where id = '32000000-0000-0000-0000-000000000005') = 'inactive',
  'an editor without kids.view cannot change children, even with an unfiltered update');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000023',
  $$insert into public.people (org_id, first_name, last_name, birthdate) values ('20000000-0000-0000-0000-000000000003', 'Baby', 'New', current_date - 100)$$) = '42501',
  'an editor without kids.view cannot add a child');
update public.people set membership_status = 'member' where org_id = '20000000-0000-0000-0000-000000000003';
update public.org_roles set permissions = '{people.view}' where org_id = '20000000-0000-0000-0000-000000000003' and name = 'Greeter';

-- review fixes, round 2
insert into public.custom_field_defs (id, org_id, applies_to, key, label, field_type, sensitive)
  values ('52000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000003', 'person', 'bus', 'Rides the bus', 'boolean', false);
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022', $$update public.people set custom = '{"iep": true}' where id = '32000000-0000-0000-0000-000000000006'$$) = '23514'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000022', $$update public.people set custom = '{"bus": true}' where id = '32000000-0000-0000-0000-000000000006'$$) = ''
  and pg_temp.try_as('00000000-0000-0000-0000-000000000022', $$insert into public.custom_field_values_sensitive (field_id, org_id, subject_id, value) values ('52000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'true')$$) = '23503',
  'sensitive keys stay out of the directory; plain keys stay out of the sensitive table');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.pickup_people (org_id, child_person_id, person_id, kind) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', '32000000-0000-0000-0000-000000000005', 'authorized');
    update public.people set membership_status = 'regular' where id = '32000000-0000-0000-0000-000000000005'$$) = '',
  'an owner without a person record acts');
select pg_temp.ok(exists (select 1 from chms_private.audit_actors a join public.chms_audit c on a.log = 'chms_audit' and a.log_id = c.id
                          where c.table_name = 'pickup_people' and a.user_id = '00000000-0000-0000-0000-000000000021')
  and exists (select 1 from chms_private.audit_actors a join public.people_audit pa on a.log = 'people_audit' and a.log_id = pa.id
              where pa.person_id = '32000000-0000-0000-0000-000000000005' and a.user_id = '00000000-0000-0000-0000-000000000021')
  and exists (select 1 from chms_private.audit_actors a join public.domain_events e on a.log = 'domain_events' and a.log_id = e.seq
              where e.subject_id = '32000000-0000-0000-0000-000000000005' and a.user_id = '00000000-0000-0000-0000-000000000021'),
  'audit rows, history and events by an unlinked admin are attributed in chms_private');
select pg_temp.ok(pg_temp.try_sql($$update chms_private.audit_actors set user_id = gen_random_uuid()$$) = '42501'
  and pg_temp.try_sql($$truncate chms_private.audit_actors$$) = '42501', 'attribution is append-only too');
update public.org_roles set permissions = '{people.view,people.edit}' where org_id = '20000000-0000-0000-0000-000000000003' and name = 'Greeter';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000023',
  $$insert into public.household_members (household_id, person_id, org_id, relationship) values ('42000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000003', 'other')$$) = ''
  and pg_temp.try_as('00000000-0000-0000-0000-000000000023',
  $$update public.household_members set relationship = 'child' where person_id = '32000000-0000-0000-0000-000000000009'$$) = '42501',
  'an editor without kids.view cannot relabel an adult as a child');
update public.org_roles set permissions = '{people.view}' where org_id = '20000000-0000-0000-0000-000000000003' and name = 'Greeter';
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.org_roles (org_id, name, permissions) values ('20000000-0000-0000-0000-000000000003', 'Custody only', '{people.view,custody.manage}')$$) = '23514',
  'care and custody permissions imply kids.view');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$insert into public.person_documents (org_id, person_id, kind, storage_path, title) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'custody', '20000000-0000-0000-0000-000000000003/custody/32000000-0000-0000-0000-000000000006/..', 'Dots')$$) = '23514'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$insert into public.person_documents (org_id, person_id, kind, storage_path, title) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'custody', '20000000-0000-0000-0000-000000000003/custody/32000000-0000-0000-0000-000000000006/a b.pdf', 'Space')$$) = '23514'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$insert into public.person_documents (org_id, person_id, kind, storage_path, title) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'custody', '20000000-0000-0000-0000-000000000003/custody/32000000-0000-0000-0000-000000000006/order-2.pdf', 'Order')$$) = '',
  'document file names are plain');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.contact_consents (org_id, phone_e164, scope, source, text_version, revoked_at, revoked_source) values ('20000000-0000-0000-0000-000000000003', '+19415550177', 'general', 'admin', 'v9', now(), 'stop')$$) = '42501'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.contact_consents (org_id, phone_e164, scope, source, text_version, consented_at) values ('20000000-0000-0000-0000-000000000003', '+19415550177', 'general', 'admin', 'v9', '2019-01-01')$$) = '',
  'an editor cannot fabricate consent history');
select pg_temp.ok((select consented_at > now() - interval '1 minute' from public.contact_consents where text_version = 'v9'), 'a new consent is dated now');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$update public.contact_consents set revoked_at = now(), revoked_source = 'stop' where text_version = 'v9'$$) = '', 'an editor revokes a consent');
select pg_temp.ok((select revoked_source from public.contact_consents where text_version = 'v9') = 'admin',
  'an editor''s revocation is recorded as admin, never as a STOP');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$update public.contact_consents set revoked_at = null, revoked_source = null where text_version = 'v9'$$, 'service_role') = '42501',
  'not even the service role reverses a revocation');
select pg_temp.ok(pg_temp.try_sql($$delete from public.people where id = '32000000-0000-0000-0000-000000000008'$$) in ('23503', '42501')
  and pg_temp.try_sql($$delete from public.household_members where person_id = '32000000-0000-0000-0000-000000000009'$$) = '42501'
  and pg_temp.try_sql($$truncate public.household_members$$) = '42501',
  'people in a restriction or a family are never hard-deleted, by anyone');
update public.org_checkin_settings set time_zone = 'Pacific/Kiritimati' where org_id = '20000000-0000-0000-0000-000000000003';
select pg_temp.ok(not chms_private.is_minor(gen_random_uuid(), (chms_private.local_today('20000000-0000-0000-0000-000000000003') - interval '18 years')::date, '20000000-0000-0000-0000-000000000003')
  and chms_private.is_minor(gen_random_uuid(), (chms_private.local_today('20000000-0000-0000-0000-000000000003') - interval '18 years' + interval '1 day')::date, '20000000-0000-0000-0000-000000000003'),
  'the 18th birthday is counted on the church''s local date');
update public.org_checkin_settings set time_zone = 'America/New_York' where org_id = '20000000-0000-0000-0000-000000000003';
select pg_temp.as_user(null, 'anon');
select pg_temp.ok(not chms_private.is_minor('32000000-0000-0000-0000-000000000006') and (select count(*) from public.people) = 0, 'anon learns nothing from is_minor');
select pg_temp.as_postgres();
select pg_temp.ok(not has_function_privilege('anon', 'chms_private.uuidv7()', 'execute') and not has_function_privilege('anon', 'chms_private.all_permissions()', 'execute'),
  'anon cannot call the private helpers');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.households (id, org_id, name) values ('42000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000003', 'The Teen Family')$$) = '',
  'an editor starts a family for a teen');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.household_members (household_id, person_id, org_id, relationship, is_guardian, can_check_in) values ('42000000-0000-0000-0000-000000000009', '32000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', 'head', true, true)$$) = '23514'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.household_members (household_id, person_id, org_id, relationship) values ('42000000-0000-0000-0000-000000000009', '32000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', 'child')$$) = '',
  'a minor is never a guardian');

-- a paired station is a different kind of actor
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '62000000-0000-0000-0000-000000000001');
select pg_temp.ok(public.is_station(), 'a station token is recognised');
select pg_temp.ok((select count(*) from public.people) = 0, 'a station reads no people through the directory');
select pg_temp.ok(pg_temp.try_sql($$select public.get_child_care('32000000-0000-0000-0000-000000000006')$$) = '42501', 'a station cannot read care notes');
select pg_temp.as_postgres();

\echo '== chms: check-in B (configuration and stations) =================='

-- Station claims without switching role: the deny trigger must hold even
-- inside SECURITY DEFINER code, where row policies do not apply.
create or replace function pg_temp.claims_station(p_uid uuid, p_station uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'app_metadata', json_build_object('kind', 'station', 'station_id', p_station))::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;

select pg_temp.as_postgres();
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$insert into public.schedules (org_id, name, local_time, weekdays, starts_on) values ('20000000-0000-0000-0000-000000000001', 'Early', '09:00', '{0}', '2027-03-01')$$) = '22023',
  'a schedule needs the church time zone first');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.org_checkin_settings (org_id, time_zone) values ('20000000-0000-0000-0000-000000000003', 'America/New_York')
    on conflict (org_id) do update set time_zone = excluded.time_zone$$) = '',
  'the owner sets the time zone');

-- areas and rooms
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$
  insert into public.areas (id, org_id, name, kind) values
    ('72000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'The Barn', 'kids'),
    ('72000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'K/5', 'kids'),
    ('72000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Welcome desk', 'volunteer');
  insert into public.rooms (id, org_id, area_id, name, capacity, children_per_adult, priority, criteria) values
    ('73000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Ducklings', 12, 4, 10,
      '{"rules": [{"kind": "age_months", "min": 30, "min_inclusive": true, "max": 36, "max_inclusive": false, "measured_on": "occurrence"}]}'),
    ('73000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Cubs', 16, 6, 20,
      '{"rules": [{"kind": "age_years", "min": 3, "min_inclusive": true, "max": 4, "max_inclusive": false, "measured_on": "cutoff"}]}'),
    ('73000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Colts', 16, 6, 30,
      '{"match": "all", "rules": [{"kind": "age_years", "min": 4, "min_inclusive": true, "max": 6, "max_inclusive": false, "measured_on": "cutoff"}, {"kind": "grade", "max": -1, "max_inclusive": true}]}'),
    ('73000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000002', 'Kindergarten', 20, 8, 40,
      '{"rules": [{"kind": "grade", "min": 0, "min_inclusive": true, "max": 0, "max_inclusive": true}, {"kind": "gender", "value": "female"}, {"kind": "tag", "value": "guest"}, {"kind": "custom_field", "key": "bus", "value": true}]}'),
    ('73000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000002', 'Overflow', null, null, 90,
      '{"manual_only": true, "rules": []}')$$) = '',
  'a check-in manager builds areas and rooms with typed criteria');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.rooms (org_id, area_id, name, criteria) values ('20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Bad1', '{"rules": [{"kind": "shoe_size", "min": 1, "min_inclusive": true}]}')$$) = '23514'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.rooms (org_id, area_id, name, criteria) values ('20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Bad2', '{"rules": [{"kind": "age_months", "min": 36, "min_inclusive": true, "max": 30, "max_inclusive": false, "measured_on": "occurrence"}]}')$$) = '23514'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.rooms (org_id, area_id, name, criteria) values ('20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Bad3', '{"rules": [{"kind": "age_months", "min": 30, "max": 36, "max_inclusive": false, "measured_on": "occurrence"}]}')$$) = '23514'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.rooms (org_id, area_id, name, criteria) values ('20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Bad4', '{"rules": [{"kind": "age_years", "min": 3, "min_inclusive": true}]}')$$) = '23514'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.rooms (org_id, area_id, name, criteria) values ('20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Bad5', '{"rules": []}')$$) = '23514'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.rooms (org_id, area_id, name, criteria) values ('20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Bad6', '{"rules": [{"kind": "gender", "value": "other"}]}')$$) = '23514'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.rooms (org_id, area_id, name, criteria) values ('20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Bad7', '{"rules": [{"kind": "birthdate", "min": "2020-13-45", "min_inclusive": true}], "extra": 1}')$$) = '23514',
  'criteria with an unknown kind, min above max, a bound without its flag, an age without measured_on, no rules, a bad gender or an extra key are refused');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.rooms (org_id, area_id, name) values ('20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Mine')$$) = '42501',
  'checkin.station alone cannot add rooms');
select pg_temp.as_user('00000000-0000-0000-0000-000000000023');
select pg_temp.ok((select count(*) from public.rooms) = 5, 'any member reads the rooms');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.rooms) + (select count(*) from public.areas) = 0, 'another church''s owner sees no rooms or areas');
select pg_temp.as_postgres();

-- schedules → occurrences, across a DST change (US spring forward 2027-03-14)
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$
  insert into public.schedules (id, org_id, name, local_time, duration_minutes, weekdays, starts_on) values
    ('74000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'First service', '09:00', 75, '{0}', '2027-03-01'),
    ('74000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'Biweekly', '18:30', 60, '{3}', '2027-03-03');
  update public.schedules set interval_weeks = 2 where id = '74000000-0000-0000-0000-000000000002';
  insert into public.schedule_rooms (org_id, schedule_id, room_id) values
    ('20000000-0000-0000-0000-000000000003', '74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000003', '74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002')$$) = '',
  'a check-in manager creates schedules');
select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
select pg_temp.ok(public.generate_occurrences('20000000-0000-0000-0000-000000000003', '2027-03-31', '2027-03-01') = 7, 'generation makes four Sundays and three alternate Wednesdays');
select pg_temp.ok(public.generate_occurrences('20000000-0000-0000-0000-000000000003', '2027-03-31', '2027-03-01') = 0, 'generation is idempotent');
select pg_temp.ok((select starts_at from public.occurrences where schedule_id = '74000000-0000-0000-0000-000000000001' and local_date = '2027-03-07') = '2027-03-07 14:00:00+00'::timestamptz
  and (select starts_at from public.occurrences where schedule_id = '74000000-0000-0000-0000-000000000001' and local_date = '2027-03-14') = '2027-03-14 13:00:00+00'::timestamptz,
  '9:00 stays 9:00 local across the DST change');
select pg_temp.ok((select array_agg(local_date order by local_date) from public.occurrences where schedule_id = '74000000-0000-0000-0000-000000000002') = array['2027-03-03', '2027-03-17', '2027-03-31']::date[],
  'every-two-weeks counts from the first week');
select pg_temp.ok(pg_temp.try_sql($$select public.generate_occurrences('20000000-0000-0000-0000-000000000003', '2028-06-01', '2027-03-01')$$) = '22023', 'generation stops at a year');
update public.schedules set exdates = '{2027-03-21}', local_time = '10:45' where id = '74000000-0000-0000-0000-000000000001';
select pg_temp.ok((select status from public.occurrences where schedule_id = '74000000-0000-0000-0000-000000000001' and local_date = '2027-03-21') = 'cancelled'
  and (select starts_at from public.occurrences where schedule_id = '74000000-0000-0000-0000-000000000001' and local_date = '2027-03-28') = '2027-03-28 14:45:00+00'::timestamptz,
  'editing a schedule cancels excluded dates and moves unused future occurrences');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok(pg_temp.try_sql($$select public.generate_occurrences('20000000-0000-0000-0000-000000000003', '2027-04-30', '2027-03-01')$$) = '42501', 'checkin.station alone cannot generate occurrences');
select pg_temp.ok((select count(*) from public.occurrences) = 7, 'members read occurrences');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.occurrences) + (select count(*) from public.schedules) = 0, 'another church''s owner sees no schedules');
select pg_temp.as_postgres();

-- stations: known by their pairing row, never by the token
insert into auth.users (id, email, raw_app_meta_data) values ('00000000-0000-0000-0000-000000000027', 'station-2@stations.invalid', '{"kind": "station"}');
select pg_temp.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000027') = 0, 'a station user gets no profile');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$
  insert into public.printers (id, org_id, name, model, address) values ('75000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'Barn QL', 'QL-820NWB', '10.0.0.21');
  insert into public.stations (id, org_id, name, mode, printer_id) values
    ('76000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'Barn kiosk', 'kiosk', '75000000-0000-0000-0000-000000000001'),
    ('76000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'Front desk', 'staffed', null);
  insert into public.station_scopes (org_id, station_id, area_id) values ('20000000-0000-0000-0000-000000000003', '76000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001');
  insert into public.label_templates (org_id, name, kind, is_default) values ('20000000-0000-0000-0000-000000000003', 'Child', 'child', true)$$) = '',
  'a check-in manager creates printers, stations, scopes and templates');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.label_templates (org_id, name, kind, is_default) values ('20000000-0000-0000-0000-000000000003', 'Child 2', 'child', true)$$) = '23505',
  'one default template per label kind');
insert into chms_private.station_principals (station_id, org_id, user_id) values
  ('76000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000026'),
  ('76000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000027');

-- the token claims the front desk; the pairing row says the Barn kiosk
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000002');
select pg_temp.ok((public.station_self() ->> 'station_id') = '76000000-0000-0000-0000-000000000001' and (public.station_self() ->> 'name') = 'Barn kiosk',
  'a station is identified by its pairing row, not by the token''s claim');
select pg_temp.ok((select count(*) from public.rooms) = 3 and (select count(*) from public.rooms where area_id = '72000000-0000-0000-0000-000000000001') = 3,
  'a scoped station reads only its area''s rooms');
select pg_temp.ok((select count(*) from public.schedule_rooms) = 2 and (select count(*) from public.occurrences) = 7 and (select count(*) from public.printers) = 1
  and (select count(*) from public.stations) = 1 and (select count(*) from public.label_templates) = 1,
  'a station reads its church''s schedules, printers and templates, and only itself among stations');
select pg_temp.ok((select count(*) from public.profiles) + (select count(*) from public.church_claims) + (select count(*) from public.org_members)
  + (select count(*) from public.churches) + (select count(*) from public.reviews) + (select count(*) from public.organizations) = 0,
  'a station reads nothing from the review site or the membership tables');
select pg_temp.ok(pg_temp.try_sql($$insert into public.favorites (user_id, church_id) values ('00000000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000001')$$) = '42501'
  and pg_temp.try_sql($$insert into public.reviews (church_id, user_id, reviewer_role, text, score_teaching) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000026', 'Member', 'A station wrote this review, which must never happen at all.', 5)$$) = '42501'
  and pg_temp.try_sql($$insert into public.church_claims (church_id, user_id, claim_email) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000026', 'x@y.org')$$) = '42501',
  'a station cannot post a review, favorite a church or start a claim');
select pg_temp.ok(pg_temp.try_sql($$select public.verify_claim_code('10000000-0000-0000-0000-000000000001', '123456')$$) = '42501'
  and pg_temp.try_sql($$select public.generate_occurrences('20000000-0000-0000-0000-000000000003', '2027-04-30', '2027-03-01')$$) = '42501'
  and pg_temp.try_sql($$select public.set_my_staff_pin('20000000-0000-0000-0000-000000000003', '2468')$$) = '42501',
  'a station cannot verify a claim, generate occurrences or set a PIN');
select pg_temp.ok(pg_temp.try_sql($$insert into public.rooms (org_id, area_id, name) values ('20000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'Hack')$$) = '42501'
  and pg_temp.try_sql($$update public.stations set mode = 'staffed'$$) = '' and (select mode from public.stations) = 'kiosk',
  'a station changes no configuration');
select pg_temp.as_station('00000000-0000-0000-0000-000000000027', '76000000-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.rooms) = 5 and jsonb_array_length(public.station_self() -> 'room_ids') = 5, 'an unscoped station reads every room of its church');
select pg_temp.as_postgres();
-- the wall holds inside definer code too
select pg_temp.claims_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok(pg_temp.try_sql($$insert into public.org_members (org_id, user_id, role) values ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000026', 'owner')$$) = '42501'
  and pg_temp.try_sql($$update public.churches set name = 'x' where id = '10000000-0000-0000-0000-000000000001'$$) = '42501',
  'with a station token, even privileged code cannot add members or edit churches');
select pg_temp.as_postgres();
update chms_private.station_principals set revoked_at = now() where station_id = '76000000-0000-0000-0000-000000000001';
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok(public.station_self() is null and (select count(*) from public.rooms) = 0, 'an unpaired station is nobody');
select pg_temp.as_postgres();
update chms_private.station_principals set revoked_at = null where station_id = '76000000-0000-0000-0000-000000000001';

-- staff PINs
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022', $$select public.set_my_staff_pin('20000000-0000-0000-0000-000000000003', '2468')$$) = '', 'a station user sets their PIN');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022', $$select public.set_my_staff_pin('20000000-0000-0000-0000-000000000003', '1111')$$) = '22023'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000023', $$select public.set_my_staff_pin('20000000-0000-0000-0000-000000000003', '2468')$$) = '42501'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$select public.set_my_staff_pin('20000000-0000-0000-0000-000000000003', '2468')$$) = '42501',
  'weak PINs, people without a check-in permission and logins without a person record are refused');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022', $$select public.verify_staff_pin('32000000-0000-0000-0000-000000000001', '2468')$$) = '42501', 'only a station verifies PINs');
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok((select array_agg(display_name) from public.station_staff()) = array['Sam S.'], 'a station lists PIN holders by first name and initial');
select pg_temp.ok(not (public.verify_staff_pin('32000000-0000-0000-0000-000000000001', '0000') ->> 'ok')::boolean, 'a wrong PIN is refused');
select pg_temp.ok((public.verify_staff_pin('32000000-0000-0000-0000-000000000001', '2468') ->> 'ok')::boolean
  and (public.verify_staff_pin('32000000-0000-0000-0000-000000000001', '2468') -> 'permissions') ? 'checkin.station'
  and not ((public.verify_staff_pin('32000000-0000-0000-0000-000000000001', '2468') -> 'permissions') ? 'attendance.reports'),
  'the right PIN answers with the holder''s check-in permissions only');
select pg_temp.ok(not (public.verify_staff_pin('32000000-0000-0000-0000-000000000002', '2468') ->> 'ok')::boolean, 'a person without a PIN is refused');
select public.verify_staff_pin('32000000-0000-0000-0000-000000000001', '9999') from generate_series(1, 5);
select pg_temp.ok((public.verify_staff_pin('32000000-0000-0000-0000-000000000001', '2468') ->> 'locked_until') is not null, 'five misses lock the PIN, even for the right code');
select pg_temp.as_postgres();
select pg_temp.ok((select count(*) from public.access_log where action = 'staff_pin.verify' and station_id = '76000000-0000-0000-0000-000000000001' and actor_kind = 'station') = 11
  and (select count(*) from public.access_log where action = 'staff_pin.set' and actor_person_id = '32000000-0000-0000-0000-000000000001') = 1,
  'every PIN use is logged against the station');

-- overrides and restrictions
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$insert into public.checkin_restrictions (org_id, person_id, kind, note, set_by_person_id) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'see_staff', 'custody paperwork pending', '32000000-0000-0000-0000-000000000001')$$) = '',
  'a custody manager sets a restriction');
select pg_temp.ok((select set_by_person_id = '32000000-0000-0000-0000-000000000004' and starts_on = chms_private.local_today(org_id) from public.checkin_restrictions limit 1),
  'the restriction records who really set it and when it starts');
select pg_temp.ok(chms_private.active_restriction('32000000-0000-0000-0000-000000000006') = 'see_staff', 'the restriction is in force');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000023',
  $$insert into public.checkin_restrictions (org_id, person_id, kind) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', 'no_checkin')$$) = '42501',
  'people.view cannot restrict a child');
select pg_temp.as_user('00000000-0000-0000-0000-000000000024');
select pg_temp.ok((select count(*) from public.checkin_restrictions) = 0, 'kids.view alone does not see restrictions');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select count(*) from public.checkin_restrictions) = 1, 'a care holder sees restrictions');
select pg_temp.as_postgres();
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025', $$update public.checkin_restrictions set cleared_at = now(), cleared_by_person_id = '32000000-0000-0000-0000-000000000001'$$) = '', 'a custody manager clears a restriction');
select pg_temp.ok((select cleared_by_person_id = '32000000-0000-0000-0000-000000000004' from public.checkin_restrictions limit 1) and chms_private.active_restriction('32000000-0000-0000-0000-000000000006') is null,
  'clearing records who cleared it and lifts the restriction');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025', $$update public.checkin_restrictions set cleared_at = null$$) = ''
  and (select cleared_at is not null from public.checkin_restrictions limit 1), 'clearing is final');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.room_overrides (org_id, person_id, room_id, ends_on) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', '73000000-0000-0000-0000-000000000002', current_date + 30)$$) = ''
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.room_overrides (org_id, person_id, room_id) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000006', '73000000-0000-0000-0000-000000000001')$$) = '23505',
  'a child has at most one live room override');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.room_overrides (org_id, person_id, room_id) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000007', '73000000-0000-0000-0000-000000000001')$$) = '42501',
  'checkin.station alone cannot set overrides');

-- volunteer scheduling
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$
  insert into public.volunteer_slots (id, org_id, schedule_id, room_id, needed, arrive_minutes_before) values
    ('77000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 2, 20);
  insert into public.volunteer_slots (id, org_id, occurrence_id, label) values
    ('77000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003',
     (select id from public.occurrences where schedule_id = '74000000-0000-0000-0000-000000000001' and local_date = '2027-03-07'), 'Greeter');
  insert into public.volunteer_assignments (org_id, slot_id, person_id, local_date) values
    ('20000000-0000-0000-0000-000000000003', '77000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000004', '2027-03-07')$$) = '',
  'a check-in manager schedules volunteers');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.volunteer_assignments (org_id, slot_id, person_id, local_date) values ('20000000-0000-0000-0000-000000000003', '77000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000004', '2027-03-14')$$) = '22023',
  'an assignment to a single occurrence must carry that date');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000023',
  $$insert into public.volunteer_assignments (org_id, slot_id, person_id, local_date) values ('20000000-0000-0000-0000-000000000003', '77000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002', '2027-03-07')$$) = '42501',
  'a volunteer cannot schedule themselves yet');
select pg_temp.as_user('00000000-0000-0000-0000-000000000023');
select pg_temp.ok((select count(*) from public.volunteer_slots) = 2 and (select count(*) from public.volunteer_assignments) = 1, 'members read the volunteer schedule');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.volunteer_slots) + (select count(*) from public.volunteer_assignments) = 0, 'another church sees no volunteer schedule');
select pg_temp.as_postgres();

-- audit and events
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'rooms' and action = 'insert') = 5
  and (select count(*) from public.chms_audit where table_name = 'checkin_restrictions') = 3,
  'configuration and restrictions are audited');
select pg_temp.ok((select array_agg(distinct type order by type) from public.domain_events where org_id = '20000000-0000-0000-0000-000000000003'
                   and type in ('room.created', 'occurrence.created', 'occurrence.cancelled', 'schedule.updated', 'station.created', 'checkin_restriction.cleared', 'volunteer_assignment.created'))
  = array['checkin_restriction.cleared', 'occurrence.cancelled', 'occurrence.created', 'room.created', 'schedule.updated', 'station.created', 'volunteer_assignment.created'],
  'configuration changes emit domain events');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'rooms') = 0 and (select count(*) from public.chms_audit where table_name = 'checkin_restrictions') = 3,
  'the configuration audit needs checkin.manage; the restriction audit follows kids.care');
select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
select pg_temp.ok((select count(*) from public.chms_audit where table_name = 'rooms') = 5, 'the owner reads the configuration audit');
select pg_temp.as_postgres();
select pg_temp.ok(not has_function_privilege('authenticated', 'chms_private.active_restriction(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.verify_staff_pin(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.station_self()', 'execute'),
  'check-in B helpers are not callable by anon or as internals');

\echo '== chms: check-in C (attendance core) ============================='

create or replace function pg_temp.statuses(p jsonb) returns text[] language sql as $$
  select array(select x ->> 'status' from jsonb_array_elements(p -> 'results') x);
$$;

select pg_temp.as_postgres();
-- a second Sunday service with fixed occurrence ids, and the first service's generated 3/7 occurrence
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$
  insert into public.schedules (id, org_id, name, local_time, duration_minutes, weekdays, starts_on) values
    ('74000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Second service', '12:30', 90, '{0}', '2027-03-01');
  insert into public.occurrences (id, org_id, schedule_id, local_date, starts_at, ends_at) values
    ('78000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', '74000000-0000-0000-0000-000000000003', '2027-03-07', '2027-03-07 17:30:00+00', '2027-03-07 19:00:00+00'),
    ('78000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '74000000-0000-0000-0000-000000000003', '2027-03-14', '2027-03-14 16:30:00+00', '2027-03-14 18:00:00+00');
  insert into public.volunteer_slots (id, org_id, schedule_id, room_id, needed, arrive_minutes_before) values
    ('77000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '74000000-0000-0000-0000-000000000003', '73000000-0000-0000-0000-000000000001', 2, 20);
  insert into public.volunteer_assignments (org_id, slot_id, person_id, local_date) values
    ('20000000-0000-0000-0000-000000000003', '77000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000004', '2027-03-07'),
    ('20000000-0000-0000-0000-000000000003', '77000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000003', '2027-03-07');
  insert into public.person_credentials (org_id, person_id, kind, completed_on, expires_on) values
    ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000003', 'background_check', '2027-01-01', '2029-01-01')$$) = '',
  'a manager sets up the second service, a volunteer slot and a credential');
create temp table occ as select id, schedule_id, local_date from public.occurrences where org_id = '20000000-0000-0000-0000-000000000003';
grant select on occ to public;

-- a family pass at the Barn kiosk
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'session.start', 'id', '80000000-0000-0000-0000-000000000001', 'local_date', '2027-03-07',
      'household_id', '42000000-0000-0000-0000-000000000001', 'guardian_person_id', '32000000-0000-0000-0000-000000000005',
      'lookup_method', 'last4', 'lookup_last4', '0100', 'device_at', '2027-03-07T17:00:00Z'),
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000001', 'type', 'check_in', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000006', 'role', 'child', 'room_id', '73000000-0000-0000-0000-000000000001',
      'session_id', '80000000-0000-0000-0000-000000000001', 'code', 'ACD', 'device_at', '2027-03-07T17:01:00Z'),
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000002', 'type', 'label_print_requested', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000006', 'label_kind', 'child', 'session_id', '80000000-0000-0000-0000-000000000001', 'device_at', '2027-03-07T17:01:05Z'),
    jsonb_build_object('op', 'session.complete', 'id', '80000000-0000-0000-0000-000000000001')
  ))) = array['accepted', 'accepted', 'accepted', 'accepted'], 'a station checks a child in');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'session.start', 'id', '80000000-0000-0000-0000-000000000001', 'local_date', '2027-03-07'),
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000001', 'type', 'check_in', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000006', 'room_id', '73000000-0000-0000-0000-000000000001', 'device_at', '2027-03-07T17:01:00Z'),
    jsonb_build_object('op', 'session.complete', 'id', '80000000-0000-0000-0000-000000000001')
  ))) = array['duplicate', 'duplicate', 'duplicate'], 'replaying the outbox is harmless');
select pg_temp.as_postgres();
select pg_temp.ok((select status = 'in' and room_id = '73000000-0000-0000-0000-000000000001' and codes = '{ACD}' and household_id = '42000000-0000-0000-0000-000000000001'
                          and checked_in_at = '2027-03-07 17:01:00+00' and station_id = '76000000-0000-0000-0000-000000000001' and event_count = 1
                   from public.attendance where occurrence_id = '78000000-0000-0000-0000-000000000001' and person_id = '32000000-0000-0000-0000-000000000006'),
  'the projection shows the child in the room with the code');
select pg_temp.ok((select status from public.occurrences where id = '78000000-0000-0000-0000-000000000001') = 'open'
  and (select session_id = '80000000-0000-0000-0000-000000000001' and issued_at is not null from public.security_codes where org_id = '20000000-0000-0000-0000-000000000003' and local_date = '2027-03-07' and code = 'ACD')
  and (select completed_at is not null and station_id = '76000000-0000-0000-0000-000000000001' from public.checkin_sessions where id = '80000000-0000-0000-0000-000000000001'),
  'the first event opens the occurrence, binds the code and completes the session');
select pg_temp.ok((select source = 'station' and station_id = '76000000-0000-0000-0000-000000000001' and recorded_at > now() - interval '1 minute' from public.attendance_events where id = '81000000-0000-0000-0000-000000000001'),
  'events carry the station and the server clock');

-- out of order: the check-out arrives before the move
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000004', 'type', 'check_out', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000006', 'session_id', '80000000-0000-0000-0000-000000000001',
      'picked_up_by_person_id', '32000000-0000-0000-0000-000000000005', 'code_matched', true, 'device_at', '2027-03-07T17:40:00Z'),
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000003', 'type', 'move', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000006', 'from_room_id', '73000000-0000-0000-0000-000000000001', 'room_id', '73000000-0000-0000-0000-000000000002',
      'device_at', '2027-03-07T17:20:00Z')
  ))) = array['accepted', 'accepted'], 'a check-out and a late move are accepted');
select pg_temp.as_postgres();
select pg_temp.ok((select status = 'out' and room_id = '73000000-0000-0000-0000-000000000002' and first_room_id = '73000000-0000-0000-0000-000000000001'
                          and anomalies = '{}' and pickup_status = 'guardian' and code_matched and checked_out_at = '2027-03-07 17:40:00+00' and event_count = 3
                   from public.attendance where occurrence_id = '78000000-0000-0000-0000-000000000001' and person_id = '32000000-0000-0000-0000-000000000006'),
  'events fold in device order, whatever order they arrive in');
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000005', 'type', 'move', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000006', 'from_room_id', '73000000-0000-0000-0000-000000000002', 'room_id', '73000000-0000-0000-0000-000000000003',
      'device_at', '2027-03-07T17:50:00Z')))) = array['accepted'], 'a move after the check-out is kept');
select pg_temp.as_postgres();
select pg_temp.ok((select anomalies = '{move_after_checkout}' and room_id = '73000000-0000-0000-0000-000000000003'
                   from public.attendance where occurrence_id = '78000000-0000-0000-0000-000000000001' and person_id = '32000000-0000-0000-0000-000000000006'),
  'and flagged as an anomaly');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select array_agg(room_id || ' ' || from_at || ' ' || to_at order by from_at) from public.room_stays
                   where occurrence_id = '78000000-0000-0000-0000-000000000001' and person_id = '32000000-0000-0000-0000-000000000006')
  = array['73000000-0000-0000-0000-000000000001 2027-03-07 17:01:00+00 2027-03-07 17:20:00+00',
          '73000000-0000-0000-0000-000000000002 2027-03-07 17:20:00+00 2027-03-07 17:40:00+00',
          '73000000-0000-0000-0000-000000000003 2027-03-07 17:50:00+00 2027-03-07 19:00:00+00'],
  'room stays are reconstructed from the log');
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000006', 'type', 'void', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000006', 'target_event_id', '81000000-0000-0000-0000-000000000005', 'device_at', '2027-03-07T17:51:00Z')))) = array['accepted'],
  'a wrong move is voided');
select pg_temp.as_postgres();
select pg_temp.ok((select anomalies = '{}' and room_id = '73000000-0000-0000-0000-000000000002' and event_count = 3
                   from public.attendance where occurrence_id = '78000000-0000-0000-0000-000000000001' and person_id = '32000000-0000-0000-0000-000000000006'),
  'a void removes its target from the projection');
select pg_temp.ok(pg_temp.try_sql($$insert into public.attendance_events (org_id, occurrence_id, person_id, type, target_event_id, device_at)
    values ('20000000-0000-0000-0000-000000000003', '78000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000007', 'void', '81000000-0000-0000-0000-000000000001', now())$$) = '22023',
  'a void must name an event of the same person');

-- a check-out that reaches the server before its check-in, and a shared code
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'session.start', 'id', '80000000-0000-0000-0000-000000000002', 'local_date', '2027-03-07', 'household_id', '42000000-0000-0000-0000-000000000009', 'device_at', '2027-03-07T17:29:00Z'),
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000008', 'type', 'check_out', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000007', 'session_id', '80000000-0000-0000-0000-000000000002', 'device_at', '2027-03-07T17:35:00Z'),
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000007', 'type', 'check_in', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000007', 'room_id', '73000000-0000-0000-0000-000000000001', 'session_id', '80000000-0000-0000-0000-000000000002',
      'code', 'ACD', 'device_at', '2027-03-07T17:30:00Z')
  ))) = array['accepted', 'accepted', 'accepted'], 'a late check-in is accepted after its check-out');
select pg_temp.as_postgres();
select pg_temp.ok((select status = 'out' and anomalies = '{}' and pickup_status = 'unknown' from public.attendance where occurrence_id = '78000000-0000-0000-0000-000000000001' and person_id = '32000000-0000-0000-0000-000000000007'),
  'the fold puts the check-in first');
select pg_temp.ok((select count(*) from public.station_alerts where kind = 'duplicate_code' and person_id = '32000000-0000-0000-0000-000000000007' and station_id = '76000000-0000-0000-0000-000000000001') = 1,
  'a code already issued to another family raises an alert');

-- one session and one code cover both services
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000009', 'type', 'check_in',
      'occurrence_id', (select id from occ where schedule_id = '74000000-0000-0000-0000-000000000001' and local_date = '2027-03-07'),
      'person_id', '32000000-0000-0000-0000-000000000006', 'room_id', '73000000-0000-0000-0000-000000000001', 'session_id', '80000000-0000-0000-0000-000000000001',
      'code', 'ACD', 'device_at', '2027-03-07T15:40:00Z')))) = array['accepted'], 'the same session checks the child into the other service');
select pg_temp.as_postgres();
select pg_temp.ok((select count(*) from public.attendance where person_id = '32000000-0000-0000-0000-000000000006' and status <> 'none') = 2
  and (select count(*) from public.security_codes where org_id = '20000000-0000-0000-0000-000000000003' and local_date = '2027-03-07' and code = 'ACD') = 1
  and (select count(*) from public.station_alerts where kind = 'duplicate_code') = 1,
  'two services on one day are two attendances with one code');

-- scope and tenancy
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok((public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000010', 'type', 'check_in', 'occurrence_id', '78000000-0000-0000-0000-000000000002',
      'person_id', '32000000-0000-0000-0000-000000000006', 'room_id', '73000000-0000-0000-0000-000000000004', 'device_at', '2027-03-14T16:00:00Z'))) -> 'results' -> 0 ->> 'reason') = 'room_out_of_scope'
  and (public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000011', 'type', 'check_in', 'occurrence_id', '78000000-0000-0000-0000-000000000099',
      'person_id', '32000000-0000-0000-0000-000000000006', 'room_id', '73000000-0000-0000-0000-000000000001', 'device_at', '2027-03-14T16:00:00Z'))) -> 'results' -> 0 ->> 'reason') = 'unknown_occurrence'
  and (public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'session.start', 'id', '80000000-0000-0000-0000-000000000003', 'local_date', '2027-03-14', 'household_id', '40000000-0000-0000-0000-000000000001'))) -> 'results' -> 0 ->> 'status') = 'rejected',
  'a station writes only within its rooms and its church');
select pg_temp.as_station('00000000-0000-0000-0000-000000000027', '76000000-0000-0000-0000-000000000002');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000010', 'type', 'check_in', 'occurrence_id', '78000000-0000-0000-0000-000000000002',
      'person_id', '32000000-0000-0000-0000-000000000006', 'room_id', '73000000-0000-0000-0000-000000000004', 'device_at', '2027-03-14T16:00:00Z')))) = array['accepted'],
  'an unscoped station reaches every room');
select pg_temp.as_postgres();

-- restrictions: see staff, silently
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$insert into public.checkin_restrictions (org_id, person_id, kind) values ('20000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000007', 'no_checkin')$$) = '',
  'an elder restricts a child');
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok((public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000012', 'type', 'check_in', 'occurrence_id', '78000000-0000-0000-0000-000000000002',
      'person_id', '32000000-0000-0000-0000-000000000007', 'room_id', '73000000-0000-0000-0000-000000000001', 'device_at', '2027-03-14T16:05:00Z'))) -> 'results' -> 0 ->> 'reason') = 'see_staff',
  'a restricted child is sent to the desk');
select pg_temp.ok((public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000013', 'type', 'check_out',
      'occurrence_id', (select id from occ where schedule_id = '74000000-0000-0000-0000-000000000001' and local_date = '2027-03-07'),
      'person_id', '32000000-0000-0000-0000-000000000006', 'picked_up_by_person_id', '32000000-0000-0000-0000-000000000008', 'device_at', '2027-03-07T16:30:00Z'))) -> 'results' -> 0 ->> 'reason') = 'see_staff'
  and pg_temp.statuses(public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000014', 'type', 'check_out',
      'occurrence_id', (select id from occ where schedule_id = '74000000-0000-0000-0000-000000000001' and local_date = '2027-03-07'),
      'person_id', '32000000-0000-0000-0000-000000000006', 'picked_up_by_name', 'Grandma', 'device_at', '2027-03-07T16:31:00Z')))) = array['accepted'],
  'a restricted pickup is refused; a named pickup is recorded');
select pg_temp.ok((select count(*) from public.station_alerts where station_id = '76000000-0000-0000-0000-000000000001') = (select count(*) from public.station_alerts)
  and (select count(*) from public.station_alerts where kind in ('restricted_checkin', 'restricted_pickup')) = 2
  and (select count(*) from public.attendance_pickup_names) = 0,
  'a station sees its alerts but no pickup names');
select pg_temp.as_postgres();
select pg_temp.ok((select count(*) from public.attendance_events where id in ('81000000-0000-0000-0000-000000000012', '81000000-0000-0000-0000-000000000013')) = 0
  and (select pickup_status from public.attendance_events where id = '81000000-0000-0000-0000-000000000014') = 'named'
  and (select name from public.attendance_pickup_names where event_id = '81000000-0000-0000-0000-000000000014') = 'Grandma',
  'refused events are not written; names live beside the log');
update public.checkin_restrictions set cleared_at = now() where person_id = '32000000-0000-0000-0000-000000000007';

-- volunteers: punctuality and credential blocks
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok((select r -> 'results' -> 0 ->> 'status' = 'accepted' and r -> 'results' -> 0 -> 'alerts' ? 'credential_block'
                          and r -> 'results' -> 1 ->> 'status' = 'accepted' and not (r -> 'results' -> 1 -> 'alerts' ? 'credential_block')
                   from public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000015', 'type', 'check_in', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000004', 'role', 'volunteer', 'room_id', '73000000-0000-0000-0000-000000000001', 'device_at', '2027-03-07T17:12:00Z'),
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000016', 'type', 'check_in', 'occurrence_id', '78000000-0000-0000-0000-000000000001',
      'person_id', '32000000-0000-0000-0000-000000000003', 'role', 'volunteer', 'room_id', '73000000-0000-0000-0000-000000000001', 'device_at', '2027-03-07T17:25:00Z'))) r),
  'volunteers check in; a missing background check raises an alert');
select pg_temp.as_postgres();
select pg_temp.ok((select punctuality = 'on_time' and minutes_vs_expected = 2 from public.attendance where occurrence_id = '78000000-0000-0000-0000-000000000001' and person_id = '32000000-0000-0000-0000-000000000004')
  and (select punctuality = 'late' and minutes_vs_expected = 15 from public.attendance where occurrence_id = '78000000-0000-0000-0000-000000000001' and person_id = '32000000-0000-0000-0000-000000000003'),
  'punctuality is derived from the slot and the grace window');

-- the log cannot be edited
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$update public.attendance_events set code = 'XXX'$$) = ''
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$delete from public.attendance_events$$) = ''
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$insert into public.attendance_events (org_id, occurrence_id, person_id, type, room_id, device_at) values ('20000000-0000-0000-0000-000000000003', '78000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000006', 'check_in', '73000000-0000-0000-0000-000000000001', now())$$) = '42501',
  'the API cannot write the attendance log directly');
select pg_temp.ok((select count(*) from public.attendance_events where code = 'XXX') = 0 and (select count(*) from public.attendance_events) = 13, 'and the owner''s blind update and delete touched nothing');
select pg_temp.ok(pg_temp.try_sql($$update public.attendance_events set code = 'XXX'$$) = '42501'
  and pg_temp.try_sql($$delete from public.attendance_events$$) = '42501'
  and pg_temp.try_sql($$truncate public.attendance_events$$) in ('42501', '0A000')
  and pg_temp.try_sql($$delete from public.checkin_sessions$$) = '42501'
  and pg_temp.try_sql($$update public.security_codes set code = 'ZZZ'$$) = '42501',
  'the attendance log is append-only even for the database owner');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$update public.attendance set status = 'none'$$) = ''
  and (select count(*) from public.attendance where status = 'none') = 0, 'the projection is not editable');

-- who reads what
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select count(*) from public.attendance) = 6 and (select count(*) from public.attendance_pickup_names) = 1, 'kids.view reads every attendance row');
select pg_temp.as_user('00000000-0000-0000-0000-000000000023');
select pg_temp.ok((select count(*) from public.attendance) + (select count(*) from public.attendance_events) + (select count(*) from public.checkin_sessions) = 0, 'people.view alone reads no attendance');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from public.attendance) + (select count(*) from public.attendance_events) + (select count(*) from public.station_alerts) + (select count(*) from public.security_codes) = 0, 'another church reads nothing');
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from public.attendance) = 5 and (select count(*) from public.attendance where room_id = '73000000-0000-0000-0000-000000000004') = 0,
  'a scoped station reads attendance in its rooms only');
select pg_temp.as_station('00000000-0000-0000-0000-000000000027', '76000000-0000-0000-0000-000000000002');
select pg_temp.ok((select count(*) from public.attendance) = 6, 'an unscoped station reads its church''s attendance');
select pg_temp.as_postgres();
insert into public.room_leaders (org_id, room_id, person_id) values ('20000000-0000-0000-0000-000000000003', '73000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000002');
select pg_temp.as_user('00000000-0000-0000-0000-000000000023');
select pg_temp.ok((select count(*) from public.attendance) = 1 and (select room_id from public.attendance limit 1) = '73000000-0000-0000-0000-000000000002',
  'a room leader reads their room''s attendance');
select pg_temp.ok((select count(*) from public.roster('78000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002')) = 1
  and pg_temp.try_sql($$select * from public.roster('78000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001')$$) = '42501',
  'a room leader sees their roster and no other');
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok((select display_name = 'Kid P.' and has_allergy and allergy_short = 'Peanut' and guardian_first_name = 'Pat' and codes = '{ACD}' and status = 'out'
                   from public.roster('78000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002')),
  'the roster shows first name, initial, flags, guardian and code');
select pg_temp.as_postgres();
select pg_temp.ok((select count(*) from public.access_log where action = 'roster.read' and station_id = '76000000-0000-0000-0000-000000000001' and actor_kind = 'station') = 1
  and (select count(*) from public.access_log where action = 'roster.read' and actor_person_id = '32000000-0000-0000-0000-000000000002') = 1,
  'roster reads are logged');

-- guest quick-add
select pg_temp.as_station('00000000-0000-0000-0000-000000000027', '76000000-0000-0000-0000-000000000002');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(jsonb_build_object('op', 'guest.create', 'id', '42000000-0000-0000-0000-000000000010',
    'household', jsonb_build_object('id', '42000000-0000-0000-0000-000000000010', 'name', 'The Guests'),
    'people', jsonb_build_array(
      jsonb_build_object('id', '32000000-0000-0000-0000-000000000010', 'first_name', 'Gus', 'last_name', 'Guest', 'phone', '941-555-0199', 'relationship', 'head'),
      jsonb_build_object('id', '32000000-0000-0000-0000-000000000011', 'first_name', 'Gigi', 'last_name', 'Guest', 'birthdate', '2022-02-02', 'relationship', 'child')),
    'care', jsonb_build_array(jsonb_build_object('person_id', '32000000-0000-0000-0000-000000000011', 'allergies', 'Eggs', 'allergy_short', 'Egg')),
    'consent', jsonb_build_object('phone', '941-555-0199', 'scope', 'safety', 'person_id', '32000000-0000-0000-0000-000000000010', 'text_version', 'v1'))))) = array['accepted'],
  'a station adds a guest family');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(jsonb_build_object('op', 'guest.create', 'id', '42000000-0000-0000-0000-000000000010',
    'household', jsonb_build_object('id', '42000000-0000-0000-0000-000000000010', 'name', 'The Guests'))))) = array['duplicate'], 'adding them twice is harmless');
select pg_temp.as_postgres();
select pg_temp.ok((select tags = '{guest}' and membership_status = 'visitor' from public.people where id = '32000000-0000-0000-0000-000000000011')
  and (select is_guardian and can_check_in from public.household_members where person_id = '32000000-0000-0000-0000-000000000010')
  and (select not is_guardian from public.household_members where person_id = '32000000-0000-0000-0000-000000000011')
  and (select has_allergy and allergy_short = 'Egg' from public.child_care where person_id = '32000000-0000-0000-0000-000000000011')
  and (select source = 'station' and station_id = '76000000-0000-0000-0000-000000000002' and phone_e164 = '+19415550199' from public.contact_consents where person_id = '32000000-0000-0000-0000-000000000010')
  and (select count(*) from public.access_log where action = 'child_care.write' and subject_person_id = '32000000-0000-0000-0000-000000000011' and actor_kind = 'station') = 1
  and (select count(*) from public.domain_events where type = 'person.created' and subject_id in ('32000000-0000-0000-0000-000000000010', '32000000-0000-0000-0000-000000000011')) = 2,
  'guests are tagged, the parent can check in, care and consent are recorded and logged');

-- baselines, alerts, closing, the admin path, code blocks
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.attendance_baselines (org_id, household_id, year, count) values ('20000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000001', 2026, 7)$$) = ''
  and pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$insert into public.attendance_baselines (org_id, household_id, year, count) values ('20000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000009', 2026, 2)$$) = '42501'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021',
  $$insert into public.attendance_baselines (org_id, household_id, year, count) values ('20000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000001', 2026, 9)$$) = '23505',
  'a manager records one baseline per family and year');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok((select count(*) from public.attendance_baselines) = 1, 'report readers see baselines');
select pg_temp.ok(pg_temp.try_sql($$update public.station_alerts set acknowledged_at = now() where kind = 'duplicate_code'$$) = '', 'a care holder acknowledges an alert');
select pg_temp.ok((select acknowledged_by_person_id = '32000000-0000-0000-0000-000000000001' from public.station_alerts where kind = 'duplicate_code'), 'the acknowledgement names them');
select pg_temp.ok(pg_temp.try_sql($$update public.station_alerts set acknowledged_at = null where kind = 'duplicate_code'$$) = '42501'
  and pg_temp.try_sql($$update public.station_alerts set kind = 'other' where kind = 'restricted_pickup'$$) = '42501',
  'an alert is acknowledged once; nothing else about it changes');
select pg_temp.ok(pg_temp.try_sql($$select public.close_occurrence('78000000-0000-0000-0000-000000000001')$$) = '42501', 'checkin.station alone cannot close an occurrence');
select pg_temp.as_user('00000000-0000-0000-0000-000000000023');
select pg_temp.ok((select count(*) from public.station_alerts) + (select count(*) from public.attendance_baselines) = 0, 'people.view reads no alerts or baselines');
select pg_temp.ok(pg_temp.try_sql($$select public.ingest('[]'::jsonb)$$) = '42501', 'people.view cannot ingest');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
select pg_temp.ok(pg_temp.statuses(public.ingest(jsonb_build_array(
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000020', 'org_id', '20000000-0000-0000-0000-000000000003', 'type', 'check_in',
      'occurrence_id', '78000000-0000-0000-0000-000000000002', 'person_id', '32000000-0000-0000-0000-000000000011', 'room_id', '73000000-0000-0000-0000-000000000004',
      'source', 'import', 'device_at', '2027-03-14T16:10:00Z'),
    jsonb_build_object('op', 'event', 'id', '81000000-0000-0000-0000-000000000021', 'org_id', '20000000-0000-0000-0000-000000000001', 'type', 'check_in',
      'occurrence_id', '78000000-0000-0000-0000-000000000002', 'person_id', '32000000-0000-0000-0000-000000000011', 'room_id', '73000000-0000-0000-0000-000000000004', 'device_at', '2027-03-14T16:10:00Z')
  ))) = array['accepted', 'rejected'], 'a staff login records a check-in for its own church only');
select pg_temp.as_postgres();
select pg_temp.ok((select source = 'admin' and actor_person_id = '32000000-0000-0000-0000-000000000001' and station_id is null from public.attendance_events where id = '81000000-0000-0000-0000-000000000020'),
  'admin entries name the person and never pass as imports without checkin.manage');
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$select public.close_occurrence('78000000-0000-0000-0000-000000000001')$$) = '', 'a manager closes an occurrence');
select pg_temp.ok((select status = 'closed' and closed_at is not null from public.occurrences where id = '78000000-0000-0000-0000-000000000001'), 'the occurrence is closed');
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok(cardinality(public.allocate_codes(current_date, 5)) = 5, 'a station draws a block of codes for the day');
select pg_temp.ok((select count(distinct code) from public.security_codes where station_id = '76000000-0000-0000-0000-000000000001' and local_date = current_date) = 5, 'the block is recorded against the station');
select pg_temp.ok(pg_temp.try_sql($$select public.allocate_codes('2027-03-07', 5)$$) = '22023', 'blocks are drawn for the coming weeks only');
select pg_temp.as_postgres();
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000022', $$select public.allocate_codes(current_date, 2, '76000000-0000-0000-0000-000000000002')$$) = '42501'
  and pg_temp.try_as('00000000-0000-0000-0000-000000000021', $$select public.allocate_codes(current_date, 2, '76000000-0000-0000-0000-000000000002')$$) = '',
  'a manager pre-allocates codes for a station; station users cannot');
select pg_temp.ok((select array_agg(distinct type order by type) from public.domain_events where org_id = '20000000-0000-0000-0000-000000000003'
                   and type in ('checkin.created', 'checkin.moved', 'checkin.checked_out', 'checkin.voided', 'label.requested', 'occurrence.open', 'occurrence.closed'))
  = array['checkin.checked_out', 'checkin.created', 'checkin.moved', 'checkin.voided', 'label.requested', 'occurrence.closed', 'occurrence.open'],
  'attendance emits the platform events');
select pg_temp.ok(not exists (select 1 from public.domain_events where payload::text ~* 'grandma|peanut|gigi|eggs'), 'event payloads carry no names');
-- documents are opened through a logged RPC
select pg_temp.ok(pg_temp.try_as('00000000-0000-0000-0000-000000000025',
  $$select public.log_document_access((select id from public.person_documents where title = 'Order'))$$) = ''
  and pg_temp.try_as('00000000-0000-0000-0000-000000000022',
  $$select public.log_document_access((select id from public.person_documents where title = 'Order'))$$) = '42501'
  and pg_temp.try_as('00000000-0000-0000-0000-00000000000a',
  $$select public.log_document_access((select id from public.person_documents where title = 'Order'))$$) = '42501',
  'a custody manager opens a custody document; care holders and other churches cannot');
select pg_temp.ok((select count(*) from public.access_log where action = 'document.read' and actor_person_id = '32000000-0000-0000-0000-000000000004') = 1, 'document reads are logged');
select pg_temp.as_station('00000000-0000-0000-0000-000000000026', '76000000-0000-0000-0000-000000000001');
select pg_temp.ok(pg_temp.try_sql($$select public.log_document_access((select id from public.person_documents limit 1))$$) = '42501', 'a station opens no documents');
select pg_temp.as_postgres();
select pg_temp.ok(not has_function_privilege('authenticated', 'chms_private.ingest_one(jsonb,uuid,uuid,uuid,uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.ingest(jsonb)', 'execute') and not has_function_privilege('anon', 'public.roster(uuid,uuid)', 'execute')
  and not has_table_privilege('anon', 'public.room_stays', 'select'),
  'check-in C internals are not callable by anon or as internals');

\echo
\echo 'All tests passed.'
rollback;
