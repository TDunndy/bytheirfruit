-- ============================================================================
-- CHMS CHECK-IN, MIGRATION B (claim guard): verify_claim_code refuses station
-- tokens. Kept apart because the Supabase connector asks the owner to confirm
-- this one function (it touches claim verification); the station wall already
-- blocks a station from writing church_claims or churches, so this is belt
-- and braces.
-- ============================================================================

-- verify_claim_code: same body as 20261031041359, plus the station guard.
create or replace function public.verify_claim_code(p_church_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.church_claims%rowtype;
  v_hash text;
begin
  if v_uid is null or public.is_station() then
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
  if v_claim.review_status <> 'pending_review'
     and exists (select 1 from public.profiles where id = v_uid and role in ('admin', 'moderator')) then
    v_claim.review_status := 'pending_review';
    update public.church_claims
      set review_status = 'pending_review', review_note = 'claimant is a site moderator; needs another reviewer'
      where id = v_claim.id;
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
