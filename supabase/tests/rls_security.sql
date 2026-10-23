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
\echo 'All tests passed.'
rollback;
