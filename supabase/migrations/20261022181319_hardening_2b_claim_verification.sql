-- Hardening part 2b of 6 — applied to production 2026-10-22.
-- Claim codes are stored hashed with expiry and attempt limits; the RPC also
-- performs the church claim itself (the old client-side update was blocked
-- by RLS, which is why paid claims never matched).
set search_path = public, extensions;

alter table public.church_claims drop constraint if exists church_claims_subscription_status_check;
alter table public.church_claims add constraint church_claims_subscription_status_check check (
  subscription_status in ('pending','active','trialing','past_due','unpaid','canceled','cancelled',
                          'expired','incomplete','incomplete_expired','paused'));
alter table public.church_claims
  add column if not exists verification_code_hash text,
  add column if not exists code_expires_at timestamptz,
  add column if not exists verify_attempts int not null default 0;

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
