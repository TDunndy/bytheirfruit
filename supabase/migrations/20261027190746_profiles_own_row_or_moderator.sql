-- Profiles are private: a restrictive policy limits every SELECT to the
-- user's own row or a moderator, whatever permissive policies exist. The
-- public reads display names through public_profiles (owner-run view).
--
-- Applied to production on 2026-10-27 ahead of the privacy lockdown, whose
-- policy and column drops wait on Supabase's confirmation prompt. It closes
-- the "Public profiles are viewable by everyone" policy without dropping it.
create policy "Profiles: own row or moderator only" on public.profiles
  as restrictive for select
  using (auth.uid() = id or public.is_moderator());
