-- ============================================================================
-- PRIVACY LOCKDOWN — apply only AFTER the frontend from this branch is live.
-- (It stops reading profiles directly, reviewer coordinates, and the raw
-- verification code.)
--
--   * profiles becomes own-row-or-admin; the world reads public_profiles
--   * reviewer coordinates leave the reviews table for good
--   * raw verification codes are gone; only hashes remain
--   * claimants can no longer write to church_claims directly
-- ============================================================================

-- profiles -------------------------------------------------------------------
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Moderators can view all profiles" on public.profiles for select using (public.is_moderator());

-- reviews --------------------------------------------------------------------
alter table public.reviews
  drop column if exists reviewer_lat,
  drop column if exists reviewer_lng,
  drop column if exists distance_miles;

-- church_claims --------------------------------------------------------------
alter table public.church_claims drop column if exists verification_code;
drop policy if exists "Users can update own claims" on public.church_claims;
create policy "Moderators can view all claims" on public.church_claims for select using (public.is_moderator());

-- claim_requests: admins may already read; nothing else exposed.
