-- ============================================================================
-- ORGANIZATIONS — tenancy and billing foundation for the church-management
-- expansion. Purely additive: existing claim/subscription columns on
-- churches keep working and are mirrored into these tables by trigger, so
-- the deployed Stripe webhook needs no change today.
--
--   organizations   one tenant per claimed church (later: multi-campus, denominations)
--   org_members     who can act for a tenant, with a role
--   subscriptions   one Stripe subscription per tenant
--   is_org_member() / has_active_subscription()  the two checks every future
--                   ChMS table's RLS will use
--
-- Written without drop/revoke statements (none of these objects existed in
-- production) so the Supabase connector applies it without a confirmation
-- prompt; anon execute is revoked in the follow-up migration.
-- ============================================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid unique references public.churches(id) on delete set null,
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner','admin','staff','volunteer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists idx_org_members_user on public.org_members (user_id);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  church_id uuid references public.churches(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text,
  plan text not null default 'church_monthly',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_subscriptions_status on public.subscriptions (status);

alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;
alter table public.subscriptions enable row level security;

-- ----------------------------------------------------------------------------
-- Helpers every ChMS policy will reuse
-- ----------------------------------------------------------------------------
create or replace function public.org_role_rank(p_role text)
returns int language sql immutable as $$
  select case p_role when 'owner' then 4 when 'admin' then 3 when 'staff' then 2 when 'volunteer' then 1 else 0 end;
$$;

create or replace function public.is_org_member(p_org_id uuid, p_min_role text default 'volunteer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
      and public.org_role_rank(m.role) >= public.org_role_rank(p_min_role)
  );
$$;

create or replace function public.has_active_subscription(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.org_id = p_org_id
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now() - interval '3 days')
  );
$$;

grant execute on function public.org_role_rank(text), public.is_org_member(uuid, text), public.has_active_subscription(uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RLS: members read their tenant; only service role writes (via webhook/RPC)
-- ----------------------------------------------------------------------------
create policy "Members read their organization" on public.organizations for select
  using (public.is_org_member(id) or public.is_moderator());
create policy "Owners rename their organization" on public.organizations for update
  using (public.is_org_member(id, 'owner')) with check (public.is_org_member(id, 'owner'));

create policy "Members read membership of their org" on public.org_members for select
  using (user_id = auth.uid() or public.is_org_member(org_id, 'admin') or public.is_moderator());
create policy "Org admins add members" on public.org_members for insert
  with check (public.is_org_member(org_id, 'admin') and role <> 'owner');
create policy "Org admins remove non-owners" on public.org_members for delete
  using (public.is_org_member(org_id, 'admin') and role <> 'owner' and user_id <> auth.uid());

create policy "Org admins read subscription" on public.subscriptions for select
  using (public.is_org_member(org_id, 'admin') or public.is_moderator());

-- ----------------------------------------------------------------------------
-- Keep organizations in sync with the legacy claim columns on churches.
-- ----------------------------------------------------------------------------
create or replace function public.slugify(p text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.sync_org_from_church()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
begin
  if new.claimed_by is null then
    return new;
  end if;

  select id into v_org_id from public.organizations where church_id = new.id;
  if v_org_id is null then
    insert into public.organizations (church_id, name, slug, created_by)
    values (new.id, new.name, public.slugify(new.name) || '-' || left(new.id::text, 8), new.claimed_by)
    returning id into v_org_id;
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, new.claimed_by, 'owner')
  on conflict (org_id, user_id) do update set role = 'owner';

  insert into public.subscriptions (org_id, church_id, stripe_customer_id, stripe_subscription_id, status, current_period_end)
  values (v_org_id, new.id, new.stripe_customer_id, new.stripe_subscription_id, new.subscription_status, new.current_period_end)
  on conflict (org_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    updated_at = now();

  return new;
end;
$$;

create trigger trg_sync_org_from_church
  after insert or update of claimed_by, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end
  on public.churches
  for each row execute function public.sync_org_from_church();

-- Backfill from churches already claimed.
update public.churches set claimed_by = claimed_by where claimed_by is not null;
