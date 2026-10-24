-- Claim review lifecycle, from the adversarial review of the claim-review change.
--
-- 1. Rejecting a claim left verified = true, which made the edge function
--    refuse every later claimant for that church. Rejection now resets the
--    row, mirrors the decision into claim_requests (which drives the
--    church-page badge) and lets the claimant re-apply.
-- 2. Profile details typed into the claim form are kept in
--    claim_requests.profile and applied when an admin approves the claim.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 2. claim_requests: claimant-editable while pending, profile payload
-- ---------------------------------------------------------------------------
alter table public.claim_requests add column if not exists profile jsonb;

drop policy if exists "Users can submit claims" on public.claim_requests;
create policy "Users can submit claims" on public.claim_requests for insert
  with check (
    user_id = (select auth.uid())
    and coalesce(status, 'pending') = 'pending'
    and reviewed_by is null and reviewed_at is null
    and coalesce(payment_verified, false) = false and stripe_subscription_id is null
  );
drop policy if exists "Users can update own pending claim requests" on public.claim_requests;
create policy "Users can update own pending claim requests" on public.claim_requests for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null and reviewed_at is null
    and coalesce(payment_verified, false) = false and stripe_subscription_id is null
  );

-- ---------------------------------------------------------------------------
-- 3. verify_claim_code(): a rejected claim never verifies
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
  if v_claim.review_status = 'rejected' then
    return jsonb_build_object('ok', false, 'error', 'This claim was not approved. Request a new code to apply again.');
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
-- 4. review_church_claim(): reset on reject, apply profile on approve,
--    mirror the decision into claim_requests
-- ---------------------------------------------------------------------------
create or replace function public.review_church_claim(p_claim_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.church_claims%rowtype;
  v_p jsonb;
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
  if not coalesce(v_claim.verified, false) then
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

    -- Profile details from the claim form; whitelisted fields only, invalid values skipped.
    select profile into v_p from public.claim_requests
      where church_id = v_claim.church_id and user_id = v_claim.user_id;
    if v_p is not null and jsonb_typeof(v_p) = 'object' then
      update public.churches c set
        service_days    = case when jsonb_typeof(v_p->'service_days') in ('array','object') then v_p->'service_days' else c.service_days end,
        avg_attendance  = case when v_p->>'avg_attendance'  ~ '^\d{1,9}$' then (v_p->>'avg_attendance')::int  else c.avg_attendance end,
        staff_count     = case when v_p->>'staff_count'     ~ '^\d{1,9}$' then (v_p->>'staff_count')::int     else c.staff_count end,
        volunteer_count = case when v_p->>'volunteer_count' ~ '^\d{1,9}$' then (v_p->>'volunteer_count')::int else c.volunteer_count end,
        campus_count    = case when v_p->>'campus_count'    ~ '^\d{1,9}$' then (v_p->>'campus_count')::int    else c.campus_count end,
        year_founded    = case when v_p->>'year_founded'    ~ '^\d{4}$'   then (v_p->>'year_founded')::int    else c.year_founded end,
        programs        = case when jsonb_typeof(v_p->'programs') = 'array' and jsonb_array_length(v_p->'programs') > 0
                               then array(select left(x, 100) from jsonb_array_elements_text(v_p->'programs') x limit 50)
                               else c.programs end,
        website         = coalesce(nullif(left(btrim(v_p->>'website'), 500), ''), c.website),
        email           = coalesce(nullif(left(btrim(v_p->>'email'), 254), ''), c.email),
        phone           = coalesce(nullif(left(btrim(v_p->>'phone'), 50), ''), c.phone),
        facebook_url    = coalesce(nullif(left(btrim(v_p->>'facebook_url'), 500), ''), c.facebook_url),
        instagram_url   = coalesce(nullif(left(btrim(v_p->>'instagram_url'), 500), ''), c.instagram_url),
        youtube_url     = coalesce(nullif(left(btrim(v_p->>'youtube_url'), 500), ''), c.youtube_url),
        livestream_url  = coalesce(nullif(left(btrim(v_p->>'livestream_url'), 500), ''), c.livestream_url),
        pastor_name     = coalesce(nullif(left(btrim(v_p->>'pastor_name'), 200), ''), c.pastor_name),
        description     = coalesce(nullif(left(btrim(v_p->>'description'), 5000), ''), c.description)
      where c.id = v_claim.church_id;
    end if;

    update public.church_claims
      set review_status = 'approved', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
      where id = p_claim_id;
    update public.claim_requests
      set status = 'approved', reviewed_by = v_uid, reviewed_at = now()
      where church_id = v_claim.church_id and user_id = v_claim.user_id;
    return jsonb_build_object('ok', true, 'status', 'approved');
  end if;

  -- Reject: clear the verification so the church can be claimed by someone else.
  update public.church_claims
    set review_status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note,
        verified = false, verified_at = null, verification_code_hash = null, code_expires_at = null
    where id = p_claim_id;
  update public.claim_requests
    set status = 'rejected', reviewed_by = v_uid, reviewed_at = now()
    where church_id = v_claim.church_id and user_id = v_claim.user_id;
  return jsonb_build_object('ok', true, 'status', 'rejected');
end;
$$;
revoke all on function public.review_church_claim(uuid, boolean, text) from public, anon;
grant execute on function public.review_church_claim(uuid, boolean, text) to authenticated, service_role;
