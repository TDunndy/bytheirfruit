-- Claimants may not write church_claims directly. The baseline insert policy
-- was never dropped and the column guard ran BEFORE UPDATE only, so any
-- signed-in user could insert a claim row with a self-chosen code hash (or
-- pre-marked verified) and then claim an unclaimed church. Only the
-- service-role edge function and SECURITY DEFINER RPCs write this table now.
drop policy if exists "Users can insert claims" on public.church_claims;
drop policy if exists "Users can update own claims" on public.church_claims;
drop trigger if exists trg_protect_church_claim_columns on public.church_claims;
create trigger trg_protect_church_claim_columns before insert or update on public.church_claims
  for each row execute function public.protect_church_claim_columns();
