-- Site stats without full-table counts, and a manual-review path for church
-- claims that cannot be proven automatically.
--
-- Why: the home page counted 270k churches with three exact-count requests on
-- every visit (0.8-3 s each). And 92 % of listed churches have no website, so
-- the "work email must match the website domain" rule locked most churches out
-- of claiming. Claims that cannot be auto-verified now wait for an admin.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. site_stats(): cheap social-proof numbers for the home page.
--    Churches come from the planner estimate (exact to within a handful of
--    rows on a table that only grows by imports); reviews and members are
--    tiny tables counted exactly. Runs as definer because profiles is private.
-- ---------------------------------------------------------------------------
create or replace function public.site_stats()
returns table (churches bigint, reviews bigint, members bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_churches bigint;
begin
  select greatest(c.reltuples, 0)::bigint into v_churches
  from pg_catalog.pg_class c where c.oid = 'public.churches'::regclass;
  if coalesce(v_churches, 0) = 0 then
    select count(*) into v_churches from public.churches where status = 'approved';
  end if;
  return query select
    v_churches,
    (select count(*) from public.reviews r where r.status = 'published' and r.deleted_at is null),
    (select count(*) from public.profiles);
end;
$$;
revoke all on function public.site_stats() from public;
grant execute on function public.site_stats() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. church_claims: review state
-- ---------------------------------------------------------------------------
alter table public.church_claims
  add column if not exists review_status text not null default 'auto',
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;
alter table public.church_claims drop constraint if exists church_claims_review_status_check;
alter table public.church_claims add constraint church_claims_review_status_check
  check (review_status in ('auto', 'pending_review', 'approved', 'rejected'));
create index if not exists idx_church_claims_review_status
  on public.church_claims (review_status) where review_status = 'pending_review';

-- Moderators read every claim (the privacy-lockdown migration repeats this; both are idempotent).
drop policy if exists "Moderators can view all claims" on public.church_claims;
create policy "Moderators can view all claims" on public.church_claims for select using (public.is_moderator());

-- ---------------------------------------------------------------------------
-- 3. verify_claim_code(): auto claims still claim the church on a correct
--    code; pending_review claims only mark the email as verified.
-- ---------------------------------------------------------------------------
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
    return jsonb_build_object('ok', true, 'already_verified', true,
      'manual_review', v_claim.review_status = 'pending_review');
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
  if v_claim.review_status = 'pending_review' then
    -- Email proven, ownership not: an admin approves through review_church_claim().
    return jsonb_build_object('ok', true, 'manual_review', true);
  end if;
  update public.churches
    set claimed_by = v_uid, claimed_at = now(), claim_email = v_claim.claim_email, claim_verified = true
    where id = p_church_id;
  return jsonb_build_object('ok', true, 'manual_review', false);
end;
$$;
revoke all on function public.verify_claim_code(uuid, text) from public, anon;
grant execute on function public.verify_claim_code(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. review_church_claim(): admin/moderator approves or rejects a verified
--    pending_review claim. Approval claims the church the same way an
--    auto-verified code does.
-- ---------------------------------------------------------------------------
create or replace function public.review_church_claim(p_claim_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.church_claims%rowtype;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles where id = v_uid and role in ('admin', 'moderator')
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_claim from public.church_claims where id = p_claim_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Claim not found.');
  end if;
  if v_claim.review_status <> 'pending_review' then
    return jsonb_build_object('ok', false, 'error', 'This claim is not awaiting review.');
  end if;
  if not v_claim.verified then
    return jsonb_build_object('ok', false, 'error', 'The claimant has not verified their email yet.');
  end if;
  if p_approve then
    if exists (select 1 from public.churches
               where id = v_claim.church_id and claimed_by is not null and claimed_by <> v_claim.user_id) then
      return jsonb_build_object('ok', false, 'error', 'This church is already claimed by someone else.');
    end if;
    update public.churches
      set claimed_by = v_claim.user_id, claimed_at = now(), claim_email = v_claim.claim_email, claim_verified = true
      where id = v_claim.church_id;
    update public.church_claims
      set review_status = 'approved', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
      where id = p_claim_id;
    return jsonb_build_object('ok', true, 'status', 'approved');
  end if;
  update public.church_claims
    set review_status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
    where id = p_claim_id;
  return jsonb_build_object('ok', true, 'status', 'rejected');
end;
$$;
revoke all on function public.review_church_claim(uuid, boolean, text) from public, anon;
grant execute on function public.review_church_claim(uuid, boolean, text) to authenticated, service_role;
