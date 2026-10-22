-- Hardening part 1 of 6 — applied to production 2026-10-22 through the
-- Supabase connector (apply_migration), which assigned this version.
-- Closes: users setting their own role, self-published reviews, claimants
-- editing scores/billing. See docs/RUNBOOK-migrations.md.
set search_path = public, extensions;
create extension if not exists cube          with schema extensions;
create extension if not exists earthdistance with schema extensions;

-- NOTE: the protect_* / pin_* trigger functions are deliberately
-- SECURITY INVOKER. They decide what to allow by looking at current_user
-- (anon / authenticated vs. postgres / service_role). A SECURITY DEFINER
-- trigger would always run as postgres and the checks would never fire.

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator'));
$$;
create or replace function public.is_privileged()
returns boolean language sql stable set search_path = public as $$
  select current_user not in ('anon', 'authenticated');
$$;
grant execute on function public.is_admin(), public.is_moderator(), public.is_privileged() to anon, authenticated, service_role;

create or replace function public.protect_profile_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Only administrators can change roles' using errcode = '42501';
    end if;
  end if;
  if (new.status is distinct from old.status
      or new.review_suspended is distinct from old.review_suspended
      or new.suspension_reason is distinct from old.suspension_reason)
     and not public.is_moderator() then
    raise exception 'Not allowed to change moderation fields' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.provider is distinct from old.provider
     or new.created_at is distinct from old.created_at then
    raise exception 'Not allowed to change protected profile fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_profile_columns on public.profiles;
create trigger trg_protect_profile_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

create or replace function public.pin_review_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_privileged() or public.is_moderator() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.flag_count := 0;
    new.approved_at := null;
    new.approved_by := null;
    new.deleted_at := null;
    new.ai_moderation := null;
    new.ai_summary := null;
    new.edited_at := null;
    new.location_verified := false;
    new.created_at := now();
    return new;
  end if;
  if old.status = 'removed' or old.deleted_at is not null then
    raise exception 'This review can no longer be edited' using errcode = '42501';
  end if;
  if new.church_id is distinct from old.church_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Not allowed to change protected review fields' using errcode = '42501';
  end if;
  new.status := 'pending';
  new.flag_count := old.flag_count;
  new.approved_at := null;
  new.approved_by := null;
  new.deleted_at := old.deleted_at;
  new.ai_moderation := old.ai_moderation;
  new.ai_summary := old.ai_summary;
  new.location_verified := old.location_verified;
  new.edited_at := now();
  return new;
end;
$$;
drop trigger if exists trg_pin_review_columns on public.reviews;
create trigger trg_pin_review_columns before insert or update on public.reviews
  for each row execute function public.pin_review_columns();

drop policy if exists "Users can update own review within 7 days" on public.reviews;
create policy "Users can update own review within 7 days" on public.reviews for update
  using (auth.uid() = user_id and created_at > now() - interval '7 days')
  with check (auth.uid() = user_id);

create or replace function public.validate_review_flag()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if exists (select 1 from public.reviews where id = new.review_id and user_id = new.flagged_by) then
    raise exception 'You cannot flag your own review' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validate_review_flag on public.review_flags;
create trigger trg_validate_review_flag before insert on public.review_flags
  for each row execute function public.validate_review_flag();

create or replace function public.protect_church_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if public.is_moderator() then
      return new;
    end if;
    new.added_by := auth.uid();
    new.status := 'pending';
    new.approved_at := null;  new.approved_by := null;
    new.claimed_by := null;   new.claimed_at := null;
    new.claim_email := null;  new.claim_verified := false;
    new.subscription_status := null; new.current_period_end := null;
    new.stripe_customer_id := null;  new.stripe_subscription_id := null;
    new.score_teaching := null; new.score_welcome := null; new.score_community := null;
    new.score_worship := null;  new.score_prayer := null;  new.score_kids := null;
    new.score_youth := null;    new.score_leadership := null; new.score_service := null;
    new.score_finances := null; new.score_overall := null;
    new.total_reviews := 0;     new.scores_updated_at := null;
    new.source := 'manual';
    new.created_at := now();
    return new;
  end if;
  if new.subscription_status is distinct from old.subscription_status
     or new.current_period_end is distinct from old.current_period_end
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id then
    raise exception 'Billing fields are managed by the payment system' using errcode = '42501';
  end if;
  if public.is_moderator() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.name is distinct from old.name
     or new.city is distinct from old.city
     or new.state is distinct from old.state
     or new.status is distinct from old.status
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.added_by is distinct from old.added_by
     or new.claimed_by is distinct from old.claimed_by
     or new.claimed_at is distinct from old.claimed_at
     or new.claim_email is distinct from old.claim_email
     or new.claim_verified is distinct from old.claim_verified
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at
     or new.total_reviews is distinct from old.total_reviews
     or new.scores_updated_at is distinct from old.scores_updated_at
     or new.score_teaching is distinct from old.score_teaching
     or new.score_welcome is distinct from old.score_welcome
     or new.score_community is distinct from old.score_community
     or new.score_worship is distinct from old.score_worship
     or new.score_prayer is distinct from old.score_prayer
     or new.score_kids is distinct from old.score_kids
     or new.score_youth is distinct from old.score_youth
     or new.score_leadership is distinct from old.score_leadership
     or new.score_service is distinct from old.score_service
     or new.score_finances is distinct from old.score_finances
     or new.score_overall is distinct from old.score_overall then
    raise exception 'Only church profile fields can be edited by a claimant' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_church_columns on public.churches;
create trigger trg_protect_church_columns before insert or update on public.churches
  for each row execute function public.protect_church_columns();
