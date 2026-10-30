-- ============================================================================
-- CHMS PHASE 1: PEOPLE (ADR-0004)
--
--   org_roles          church-named roles carrying permissions
--   people             individuals (records, not accounts)
--   person_logins      the only place a login is tied to a person; each user
--                      sees only their own row, so no church user ever reads
--                      another person's account id (reviews carry user ids
--                      publicly, so an id would expose a leader's review history)
--   households         families, with household_members
--   person_roles       which people hold which roles
--   person_overseers   who answers to whom: a person or everyone holding a role
--                      (e.g. the Lead Pastor answers to the Elders)
--   person_notes       pastoral notes: care / oversight / private
--   people_audit       every insert/update/archive of a person, by person id
--   org_invitations    leader invites (church admins only); accepting links a
--                      login to a person record
--
-- Access comes from roles (flat). Church admins (owners and admins) draw the
-- oversight chart and seat boards. For everyone else: nobody changes their
-- own roles or those of anyone over them (on leave included), nobody archives
-- or restores someone over them, an admin, a board member or someone with
-- more access, and nobody grants, edits or removes a role beyond the
-- permissions they hold. Person lines never loop;
-- a board (role) may hold its own members accountable. A board member who
-- answers through person lines to someone does not oversee them through the
-- board. "Oversight" notes go up the chart only; nobody reads notes about
-- themselves. Only church admins invite or remove logins.
--
-- Also: memberships are created only by invitations and claims; only the
-- claim process changes who claimed a church, nobody approves their own
-- claim, a transfer or un-claim removes the previous claimant as owner, and an
-- organization stays bound to its church listing.
--
-- RLS checks are set-based (computed once per statement) so a 2,000-person
-- church stays fast.
--
-- Guardrail: nothing here references reviews or profiles.
-- Written without drop/revoke statements so the connector applies it without
-- a confirmation prompt; internal helpers live in chms_private, which the API
-- does not expose.
-- ============================================================================

create schema if not exists chms_private;
grant usage on schema chms_private to anon, authenticated, service_role;

-- ------------------------------------------------------------------ roles --
create table public.org_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  description text check (description is null or length(description) <= 500),
  permissions text[] not null default '{}'
    check (permissions <@ array['people.view','people.edit','people.notes','people.export','roles.manage','org.manage']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);

-- ----------------------------------------------------------------- people --
create table public.people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  last_name text not null default '' check (length(last_name) <= 100),
  preferred_name text check (preferred_name is null or length(preferred_name) <= 100),
  title text check (title is null or length(title) <= 100),  -- position, e.g. Lead Pastor
  email text check (email is null or (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or length(phone) <= 40),
  birthdate date check (birthdate is null or birthdate between '1900-01-01' and current_date + 1),
  gender text check (gender is null or gender in ('male', 'female')),
  membership_status text not null default 'visitor'
    check (membership_status in ('visitor', 'regular', 'member', 'inactive')),
  first_visit_date date,
  joined_date date,
  address_line1 text check (address_line1 is null or length(address_line1) <= 200),
  address_line2 text check (address_line2 is null or length(address_line2) <= 200),
  city text check (city is null or length(city) <= 100),
  state text check (state is null or length(state) <= 50),
  postal_code text check (postal_code is null or length(postal_code) <= 20),
  photo_url text check (photo_url is null or length(photo_url) <= 1000),
  tags text[] not null default '{}' check (cardinality(tags) <= 50),
  external_source text check (external_source is null or length(external_source) <= 40),
  external_id text check (external_id is null or length(external_id) <= 200),
  search_text text generated always as (
    lower(coalesce(preferred_name, '') || ' ' || first_name || ' ' || last_name || ' ' || coalesce(email, '') || ' ' || coalesce(phone, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id),
  unique (org_id, external_source, external_id)
);
create index idx_people_org_name on public.people (org_id, last_name, first_name);
create index idx_people_search on public.people using gin (search_text gin_trgm_ops);

create table public.person_logins (
  person_id uuid primary key,
  org_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  unique (org_id, user_id),
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
create index idx_person_logins_user on public.person_logins (user_id);

-- ------------------------------------------------------------- households --
create table public.households (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  address_line1 text check (address_line1 is null or length(address_line1) <= 200),
  address_line2 text check (address_line2 is null or length(address_line2) <= 200),
  city text check (city is null or length(city) <= 100),
  state text check (state is null or length(state) <= 50),
  postal_code text check (postal_code is null or length(postal_code) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id)
);
create index idx_households_org on public.households (org_id, name);

-- Composite keys keep a household, its members and their roles inside one church.
create table public.household_members (
  household_id uuid not null,
  person_id uuid not null,
  org_id uuid not null,
  relationship text not null default 'other' check (relationship in ('head', 'spouse', 'child', 'other')),
  created_at timestamptz not null default now(),
  primary key (household_id, person_id),
  foreign key (household_id, org_id) references public.households (id, org_id) on delete cascade,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
create index idx_household_members_person on public.household_members (person_id);

create table public.person_roles (
  person_id uuid not null,
  role_id uuid not null,
  org_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (person_id, role_id),
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (role_id, org_id) references public.org_roles (id, org_id) on delete cascade
);
create index idx_person_roles_role on public.person_roles (role_id);

-- Oversight chart. A person answers to another person or to everyone holding a
-- role (a board such as the Elders). Several overseers are allowed.
create table public.person_overseers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  person_id uuid not null,
  overseer_person_id uuid,
  overseer_role_id uuid,
  created_at timestamptz not null default now(),
  check ((overseer_person_id is null) <> (overseer_role_id is null)),
  check (overseer_person_id is distinct from person_id),
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (overseer_person_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (overseer_role_id, org_id) references public.org_roles (id, org_id) on delete cascade,
  unique (person_id, overseer_person_id),
  unique (person_id, overseer_role_id)
);
create index idx_person_overseers_person on public.person_overseers (person_id);
create index idx_person_overseers_overseer on public.person_overseers (overseer_person_id) where overseer_person_id is not null;
create index idx_person_overseers_role on public.person_overseers (overseer_role_id) where overseer_role_id is not null;

create table public.person_notes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null,
  org_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 10000),
  -- care: everyone with people.notes; oversight: only those over the person
  -- in the chart; private: the author only.
  visibility text not null default 'care' check (visibility in ('care', 'oversight', 'private')),
  author_person_id uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
create index idx_person_notes_person on public.person_notes (person_id, created_at desc);
create index idx_person_notes_org on public.person_notes (org_id, created_at desc);

create table public.people_audit (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null,
  actor_person_id uuid,
  actor_kind text not null check (actor_kind in ('leader', 'admin', 'system')),
  action text not null check (action in ('insert', 'update', 'archive', 'restore')),
  changes jsonb not null default '{}',
  at timestamptz not null default now()
);
create index idx_people_audit_person on public.people_audit (person_id, at desc);

create table public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  person_id uuid not null,
  member_role text not null default 'staff' check (member_role in ('admin', 'staff', 'volunteer')),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  invited_by_person_id uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
create index idx_org_invitations_org on public.org_invitations (org_id, created_at desc);

-- Who sent an invitation, kept out of every table a church user can read.
create table chms_private.invitation_inviters (
  invitation_id uuid primary key references public.org_invitations(id) on delete cascade,
  user_id uuid not null
);
create index idx_invitation_inviters_user on chms_private.invitation_inviters (user_id);

alter table public.org_roles         enable row level security;
alter table public.people            enable row level security;
alter table public.person_logins     enable row level security;
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.person_roles      enable row level security;
alter table public.person_overseers  enable row level security;
alter table public.person_notes      enable row level security;
alter table public.people_audit      enable row level security;
alter table public.org_invitations   enable row level security;
alter table chms_private.invitation_inviters enable row level security;

-- --------------------------------------------------------- private helpers --
create or replace function chms_private.is_church_admin(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_member(p_org_id, 'admin');
$$;

-- A user's permissions in a church: owners and admins hold everything, other
-- members hold the permissions of the roles on their linked person.
create or replace function chms_private.user_permissions(p_org_id uuid, p_user_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when p_user_id is null then '{}'::text[]
    when exists (select 1 from public.org_members m
                 where m.org_id = p_org_id and m.user_id = p_user_id and m.role in ('owner', 'admin'))
      then array['org.manage','people.edit','people.export','people.notes','people.view','roles.manage']
    else coalesce((
      select array_agg(distinct perm order by perm)
      from public.org_members m
      join public.person_logins pl on pl.org_id = m.org_id and pl.user_id = m.user_id
      join public.people p on p.id = pl.person_id and p.archived_at is null
      join public.person_roles pr on pr.person_id = p.id
      join public.org_roles r on r.id = pr.role_id
      cross join unnest(r.permissions) perm
      where m.org_id = p_org_id and m.user_id = p_user_id
    ), '{}'::text[])
  end;
$$;

-- Every church where the signed-in user holds a permission. Policies call it
-- inside (select ...) so it runs once per statement, not once per row.
create or replace function chms_private.orgs_with_permission(p_permission text)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct s.org_id), '{}')
  from (
    select m.org_id from public.org_members m
    where m.user_id = auth.uid() and m.role in ('owner', 'admin')
    union
    select m.org_id
    from public.org_members m
    join public.person_logins pl on pl.org_id = m.org_id and pl.user_id = m.user_id
    join public.people p on p.id = pl.person_id and p.archived_at is null
    join public.person_roles pr on pr.person_id = p.id
    join public.org_roles r on r.id = pr.role_id
    where m.user_id = auth.uid() and p_permission = any (r.permissions)
  ) s;
$$;

-- Churches the signed-in user belongs to.
create or replace function chms_private.my_orgs()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(org_id), '{}') from public.org_members where user_id = auth.uid();
$$;

-- Permissions carried by a person's roles.
create or replace function chms_private.person_role_permissions(p_person_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct perm order by perm), '{}')
  from public.person_roles pr
  join public.org_roles r on r.id = pr.role_id
  cross join unnest(r.permissions) perm
  where pr.person_id = p_person_id;
$$;

create or replace function chms_private.role_permissions(p_role_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select permissions from public.org_roles where id = p_role_id), '{}');
$$;

-- The signed-in user's person record in a church (current members only).
create or replace function chms_private.my_person_id(p_org_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select pl.person_id
  from public.person_logins pl
  join public.people p on p.id = pl.person_id and p.archived_at is null
  join public.org_members m on m.org_id = pl.org_id and m.user_id = pl.user_id
  where pl.org_id = p_org_id and pl.user_id = auth.uid()
  limit 1;
$$;

-- The signed-in user's person records in every church they belong to.
create or replace function chms_private.my_person_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(pl.person_id), '{}')
  from public.person_logins pl
  join public.people p on p.id = pl.person_id and p.archived_at is null
  join public.org_members m on m.org_id = pl.org_id and m.user_id = pl.user_id
  where pl.user_id = auth.uid();
$$;

-- People a person answers to through person lines only (archived included).
create or replace function chms_private.person_line_ids(p_person_id uuid)
returns uuid[] language plpgsql stable security definer cost 1000 set search_path = public as $$
declare
  v_seen uuid[] := '{}';
  v_frontier uuid[] := array[p_person_id];
  v_next uuid[];
begin
  loop
    select coalesce(array_agg(distinct o.overseer_person_id), '{}') into v_next
    from public.person_overseers o
    where o.person_id = any (v_frontier) and o.overseer_person_id is not null
      and not o.overseer_person_id = any (v_seen);
    exit when cardinality(v_next) = 0;
    v_seen := v_seen || v_next;
    v_frontier := v_next;
  end loop;
  return v_seen;
end;
$$;

-- Everyone reachable upward from a person (archived included). A board edge
-- from X to a holder h is skipped when h is X or answers to X through person
-- lines. Cycle-safe.
create or replace function chms_private.overseer_ids_raw(p_person_id uuid)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  v_seen uuid[] := '{}';
  v_frontier uuid[] := array[p_person_id];
  v_next uuid[];
begin
  if p_person_id is null then
    return '{}';
  end if;
  loop
    select coalesce(array_agg(distinct s.x), '{}') into v_next
    from (
      select o.overseer_person_id as x
      from public.person_overseers o
      where o.person_id = any (v_frontier) and o.overseer_person_id is not null
      union
      select pr.person_id
      from public.person_overseers o
      join public.person_roles pr on pr.role_id = o.overseer_role_id
      where o.person_id = any (v_frontier)
        and pr.person_id <> o.person_id
        and not o.person_id = any (chms_private.person_line_ids(pr.person_id))
    ) s
    where not s.x = any (v_seen);
    exit when cardinality(v_next) = 0;
    v_seen := v_seen || v_next;
    v_frontier := v_next;
  end loop;
  return v_seen;
end;
$$;

-- Everyone over a person (active people only, never the person themselves).
create or replace function chms_private.overseer_ids(p_person_id uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id), '{}')
  from public.people p
  where p.id = any (chms_private.overseer_ids_raw(p_person_id))
    and p.id <> p_person_id and p.archived_at is null;
$$;

-- Everyone under the signed-in user, in every church (the same edges walked
-- downward). Policies call it once per statement; each board member's person
-- lines are looked up once per call, not once per edge.
create or replace function chms_private.people_i_oversee()
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  v_seen uuid[] := '{}';
  v_frontier uuid[] := chms_private.my_person_ids();
  v_next uuid[];
  v_lines jsonb;
begin
  if cardinality(v_frontier) = 0 then
    return '{}';
  end if;
  select coalesce(jsonb_object_agg(h.person_id::text, to_jsonb(chms_private.person_line_ids(h.person_id)::text[])), '{}')
    into v_lines
  from (
    select distinct pr.person_id
    from public.person_roles pr
    where pr.org_id in (select org_id from public.people where id = any (v_frontier))
      and exists (select 1 from public.person_overseers o where o.overseer_role_id = pr.role_id)
  ) h;
  loop
    select coalesce(array_agg(distinct s.x), '{}') into v_next
    from (
      select o.person_id as x
      from public.person_overseers o
      where o.overseer_person_id = any (v_frontier)
      union
      select o.person_id
      from public.person_roles pr
      join public.person_overseers o on o.overseer_role_id = pr.role_id
      where pr.person_id = any (v_frontier)
        and o.person_id <> pr.person_id
        and not coalesce((v_lines -> pr.person_id::text) ? o.person_id::text, false)
    ) s
    where not s.x = any (v_seen);
    exit when cardinality(v_next) = 0;
    v_seen := v_seen || v_next;
    v_frontier := v_next;
  end loop;
  return v_seen;
end;
$$;

-- Person lines never loop back.
create or replace function chms_private.person_lines_loop_at(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_person_id = any (chms_private.person_line_ids(p_person_id));
$$;

-- Is a person over the signed-in user in the chart? Archived people count:
-- the guards below must not treat an overseer on leave as fair game.
create or replace function chms_private.is_over_me(p_org_id uuid, p_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_person_id <> chms_private.my_person_id(p_org_id)
                  and p_person_id = any (chms_private.overseer_ids_raw(chms_private.my_person_id(p_org_id))), false);
$$;

-- Is a role held by the signed-in user or by anyone over them?
create or replace function chms_private.role_held_by_me_or_over_me(p_org_id uuid, p_role_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.person_roles pr
    where pr.role_id = p_role_id
      and (pr.person_id = chms_private.my_person_id(p_org_id) or chms_private.is_over_me(p_org_id, pr.person_id))
  );
$$;

create or replace function chms_private.role_is_board(p_role_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.person_overseers where overseer_role_id = p_role_id);
$$;

-- Does a person sit on a board (hold a role the chart points at)?
create or replace function chms_private.holds_board_role(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.person_roles pr
    join public.person_overseers o on o.overseer_role_id = pr.role_id
    where pr.person_id = p_person_id
  );
$$;

-- Is a person record linked to a church owner or admin login? (A boolean
-- only: no account id leaves this function.)
create or replace function chms_private.person_is_church_admin(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.person_logins pl
    join public.org_members m on m.org_id = pl.org_id and m.user_id = pl.user_id
    where pl.person_id = p_person_id and m.role in ('owner', 'admin')
  );
$$;

-- Default roles for every church; editable afterwards.
create or replace function chms_private.seed_default_org_roles(p_org_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.org_roles (org_id, name, description, permissions) values
    (p_org_id, 'Pastor', 'Leads the church; can do everything.',
      array['people.view','people.edit','people.notes','people.export','roles.manage','org.manage']),
    (p_org_id, 'Staff', 'Keeps the directory up to date.', array['people.view','people.edit','people.export']),
    (p_org_id, 'Elder', 'Shepherds the congregation.', array['people.view','people.notes']),
    (p_org_id, 'Deacon', 'Cares for members and makes care calls.', array['people.view','people.notes']),
    (p_org_id, 'Group Leader', 'Leads a group or ministry.', array['people.view']),
    (p_org_id, 'Volunteer', 'Serves on a team.', '{}')
  on conflict (org_id, name) do nothing;
$$;

-- ---------------------------------------------------------- public checks --
create or replace function public.has_org_permission(p_org_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and p_permission = any (chms_private.user_permissions(p_org_id, auth.uid()));
$$;

-- Every permission the signed-in user holds in a church (drives the UI).
create or replace function public.my_org_permissions(p_org_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select chms_private.user_permissions(p_org_id, auth.uid());
$$;

-- The church's team: people with a login and their membership role, by
-- person id only (never account ids).
create or replace function public.people_with_logins(p_org_id uuid)
returns table (person_id uuid, member_role text) language sql stable security definer set search_path = public as $$
  select pl.person_id, m.role
  from public.person_logins pl
  join public.org_members m on m.org_id = pl.org_id and m.user_id = pl.user_id
  where pl.org_id = p_org_id and public.has_org_permission(p_org_id, 'people.view');
$$;

-- ----------------------------------------------------------------- triggers --
-- updated_at, and rows never move between churches.
create or replace function public.chms_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'org_id cannot change' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_org_roles_touch before update on public.org_roles for each row execute function public.chms_touch();
create trigger trg_people_touch before update on public.people for each row execute function public.chms_touch();
create trigger trg_households_touch before update on public.households for each row execute function public.chms_touch();
create trigger trg_person_notes_touch before update on public.person_notes for each row execute function public.chms_touch();

-- The guards below are SECURITY INVOKER on purpose (is_privileged() reads
-- current_user); everything they look up goes through definer helpers so a
-- caller's own RLS view cannot hide a row from the check.

-- Archiving switches off a leader's access and restoring switches it back on,
-- so nobody but a church admin archives or restores themselves, someone over
-- them (on leave included), a church admin, a board member, or someone whose
-- roles carry permissions they do not hold.
create or replace function public.protect_people_hierarchy()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_privileged() or chms_private.is_church_admin(new.org_id) then
    return new;
  end if;
  if (old.archived_at is null) <> (new.archived_at is null)
     and (old.id = chms_private.my_person_id(new.org_id)
          or chms_private.is_over_me(new.org_id, old.id)
          or chms_private.person_is_church_admin(old.id)
          or chms_private.holds_board_role(old.id)
          or not (chms_private.person_role_permissions(old.id) <@ public.my_org_permissions(new.org_id))) then
    raise exception 'only a church admin can archive or restore this person' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_protect_people_hierarchy before update of archived_at on public.people
  for each row execute function public.protect_people_hierarchy();

-- Role assignments: not your own, not anyone over you, never a role that
-- carries a permission you do not hold, and only admins decide who sits on a
-- board (board members oversee people).
create or replace function public.protect_person_roles()
returns trigger language plpgsql set search_path = public as $$
declare
  v_row public.person_roles%rowtype;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  if public.is_privileged() or chms_private.is_church_admin(v_row.org_id) then
    return v_row;
  end if;
  if chms_private.role_is_board(v_row.role_id) then
    raise exception 'only a church admin can change who sits on a board' using errcode = '42501';
  end if;
  if v_row.person_id = chms_private.my_person_id(v_row.org_id) or chms_private.is_over_me(v_row.org_id, v_row.person_id) then
    raise exception 'you cannot change your own roles or those of someone over you' using errcode = '42501';
  end if;
  if not (chms_private.role_permissions(v_row.role_id) <@ public.my_org_permissions(v_row.org_id)) then
    raise exception 'that role carries permissions you do not hold' using errcode = '42501';
  end if;
  return v_row;
end;
$$;
create trigger trg_protect_person_roles before insert or delete on public.person_roles
  for each row execute function public.protect_person_roles();

-- Role definitions: you can only add or remove permissions you hold, never
-- touch a role held by you or someone over you, and only admins change or
-- delete a role that the chart uses as a board.
create or replace function public.protect_org_roles()
returns trigger language plpgsql set search_path = public as $$
declare
  v_org uuid;
  v_mine text[];
begin
  if tg_op = 'DELETE' then v_org := old.org_id; else v_org := new.org_id; end if;
  if public.is_privileged() or chms_private.is_church_admin(v_org) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  v_mine := public.my_org_permissions(v_org);
  if tg_op <> 'DELETE' and not (new.permissions <@ v_mine) then
    raise exception 'a role cannot carry permissions you do not hold' using errcode = '42501';
  end if;
  if tg_op <> 'INSERT' then
    if chms_private.role_is_board(old.id) then
      raise exception 'only a church admin can change a board' using errcode = '42501';
    end if;
    if not (old.permissions <@ v_mine) then
      raise exception 'you cannot change a role that carries permissions you do not hold' using errcode = '42501';
    end if;
    if chms_private.role_held_by_me_or_over_me(v_org, old.id) then
      raise exception 'you cannot change a role held by you or by someone over you' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger trg_protect_org_roles before insert or update or delete on public.org_roles
  for each row execute function public.protect_org_roles();

-- The chart is drawn by church admins only. Who answers to whom decides who
-- reads oversight notes and who may change whose roles, so letting leaders
-- redraw it would let them choose their own overseers.
create or replace function public.protect_person_overseers()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_privileged() or chms_private.is_church_admin(coalesce(new.org_id, old.org_id)) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'only a church admin can change the chart' using errcode = '42501';
end;
$$;
create trigger trg_protect_person_overseers before insert or update or delete on public.person_overseers
  for each row execute function public.protect_person_overseers();

-- Person lines never loop, for anyone (owners included). Chart writes for a
-- church run one at a time so two concurrent edits cannot form a loop.
create or replace function public.check_chart_loops()
returns trigger language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('chms_chart:' || new.org_id::text));
  if new.overseer_person_id is not null and chms_private.person_lines_loop_at(new.person_id) then
    raise exception 'that would make the chart go in a circle' using errcode = '23514';
  end if;
  return null;
end;
$$;
create trigger trg_chart_loops after insert or update on public.person_overseers
  for each row execute function public.check_chart_loops();

-- Notes are attributed to the writer's person record; leaders must be in the
-- directory to write one, and authorship never changes.
create or replace function public.set_note_author()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.author_person_id := chms_private.my_person_id(new.org_id);
    if new.author_person_id is null then
      raise exception 'add yourself to the directory before writing notes' using errcode = '42501';
    end if;
  elsif new.author_person_id is distinct from old.author_person_id then
    raise exception 'a note''s author cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_set_note_author before insert or update on public.person_notes
  for each row execute function public.set_note_author();

-- Audit trail for people. Definer so it writes past RLS; records the actor's
-- person id (never an account id).
create or replace function public.audit_people()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_changes jsonb := '{}';
  v_old jsonb;
  v_new jsonb;
  v_actor uuid := chms_private.my_person_id(new.org_id);
  k text;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
  else
    v_action := case
      when old.archived_at is null and new.archived_at is not null then 'archive'
      when old.archived_at is not null and new.archived_at is null then 'restore'
      else 'update' end;
    v_old := to_jsonb(old) - 'updated_at' - 'search_text';
    v_new := to_jsonb(new) - 'updated_at' - 'search_text';
    for k in select jsonb_object_keys(v_new) loop
      if v_new -> k is distinct from v_old -> k then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
      end if;
    end loop;
    if v_changes = '{}' then
      return new;
    end if;
  end if;
  insert into public.people_audit (org_id, person_id, actor_person_id, actor_kind, action, changes)
  values (new.org_id, new.id, v_actor,
          case when auth.uid() is null then 'system' when v_actor is not null then 'leader' else 'admin' end,
          v_action, v_changes);
  return new;
end;
$$;
create trigger trg_audit_people after insert or update on public.people
  for each row execute function public.audit_people();

-- Seed default roles for every new church.
create or replace function public.seed_org_roles_on_create()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform chms_private.seed_default_org_roles(new.id);
  return new;
end;
$$;
create trigger trg_seed_org_roles after insert on public.organizations
  for each row execute function public.seed_org_roles_on_create();

select chms_private.seed_default_org_roles(id) from public.organizations;

-- Leaving a church unlinks the login and cancels invitations that member sent.
create or replace function public.cleanup_on_member_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.person_logins where org_id = old.org_id and user_id = old.user_id;
  update public.org_invitations i set revoked_at = now()
  from chms_private.invitation_inviters ii
  where ii.invitation_id = i.id and ii.user_id = old.user_id
    and i.org_id = old.org_id and i.accepted_at is null and i.revoked_at is null;
  return old;
end;
$$;
create trigger trg_cleanup_on_member_removed after delete on public.org_members
  for each row execute function public.cleanup_on_member_removed();

-- ------------------------------------------------------------ ownership --
-- Claim columns change only through the claim functions (verify_claim_code,
-- review_church_claim), never through a plain update, moderators included.
create or replace function public.protect_church_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.claimed_by := null;   new.claimed_at := null;
    new.claim_email := null;  new.claim_verified := false;
    new.subscription_status := null; new.current_period_end := null;
    new.stripe_customer_id := null;  new.stripe_subscription_id := null;
    if public.is_moderator() then
      return new;
    end if;
    new.added_by := auth.uid();
    new.status := 'pending';
    new.approved_at := null;  new.approved_by := null;
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
  if new.claimed_by is distinct from old.claimed_by
     or new.claimed_at is distinct from old.claimed_at
     or new.claim_email is distinct from old.claim_email
     or new.claim_verified is distinct from old.claim_verified then
    raise exception 'Church claims change only through the claim process' using errcode = '42501';
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

-- Nobody approves their own claim (review_church_claim records the reviewer).
create or replace function public.protect_claim_self_review()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.review_status = 'approved' and new.review_status is distinct from old.review_status
     and new.reviewed_by is not null and new.reviewed_by = new.user_id then
    raise exception 'a claim cannot be approved by the claimant' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_protect_claim_self_review before update of review_status on public.church_claims
  for each row execute function public.protect_claim_self_review();

-- A site moderator's own claim always waits for another reviewer, even when
-- the email domain matches the website (moderators can edit websites).
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

-- An organization stays bound to its church listing; only the name and slug
-- can be edited.
create or replace function public.protect_organization_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  if new.id is distinct from old.id or new.church_id is distinct from old.church_id
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'only the name of a church organization can be edited' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_protect_organization_columns before update on public.organizations
  for each row execute function public.protect_organization_columns();

-- A transfer or un-claim removes the previous claimant as owner. The claimant's
-- account id is not kept on the organization (members can read that row).
create or replace function public.sync_org_from_church()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
begin
  if tg_op = 'UPDATE' and old.claimed_by is not null and old.claimed_by is distinct from new.claimed_by then
    delete from public.org_members m
    using public.organizations o
    where o.church_id = new.id and m.org_id = o.id and m.user_id = old.claimed_by and m.role = 'owner';
  end if;

  if new.claimed_by is null then
    return new;
  end if;

  select id into v_org_id from public.organizations where church_id = new.id;
  if v_org_id is null then
    insert into public.organizations (church_id, name, slug)
    values (new.id, new.name, public.slugify(new.name) || '-' || left(new.id::text, 8))
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

update public.organizations set created_by = null where created_by is not null;

-- ------------------------------------------------------------ invitations --
-- Church admins invite a login onto a person record. Returns the plain token
-- once; only its hash is stored.
create or replace function public.create_org_invitation(
  p_org_id uuid, p_email text, p_person_id uuid, p_member_role text default 'staff'
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid;
begin
  if auth.uid() is null or not chms_private.is_church_admin(p_org_id) then
    raise exception 'only church admins can invite leaders' using errcode = '42501';
  end if;
  if not exists (select 1 from public.people where id = p_person_id and org_id = p_org_id and archived_at is null) then
    raise exception 'no such person in this church' using errcode = '22023';
  end if;
  if exists (select 1 from public.person_logins where person_id = p_person_id) then
    raise exception 'this person already has a login' using errcode = '23505';
  end if;
  insert into public.org_invitations (org_id, email, person_id, member_role, token_hash, invited_by_person_id)
  values (p_org_id, lower(btrim(p_email)), p_person_id, p_member_role,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), chms_private.my_person_id(p_org_id))
  returning id into v_id;
  insert into chms_private.invitation_inviters (invitation_id, user_id) values (v_id, auth.uid());
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

-- The invited user accepts with the token from their email. The invitation
-- must be addressed to the email on their account, and its sender must still
-- be an admin of the church. Checks that can fail run before anything is
-- written; races end in an error that rolls back.
create or replace function public.accept_org_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.org_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;

  select * into v_inv from public.org_invitations
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found or v_inv.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'This invitation is not valid.');
  end if;
  if v_inv.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'This invitation was already used.');
  end if;
  if v_inv.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'This invitation has expired. Ask for a new one.');
  end if;
  if v_email is distinct from v_inv.email then
    return jsonb_build_object('ok', false, 'error', 'This invitation was sent to a different email address.');
  end if;
  if not exists (
    select 1 from chms_private.invitation_inviters ii
    join public.org_members m on m.user_id = ii.user_id and m.org_id = v_inv.org_id and m.role in ('owner', 'admin')
    where ii.invitation_id = v_inv.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'This invitation needs to be sent again by a church admin.');
  end if;

  perform 1 from public.people where id = v_inv.person_id for update;
  if exists (select 1 from public.people where id = v_inv.person_id and archived_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'This invitation is not valid.');
  end if;
  if exists (select 1 from public.person_logins where person_id = v_inv.person_id) then
    return jsonb_build_object('ok', false, 'error', 'That person already has a login.');
  end if;
  if exists (select 1 from public.person_logins where org_id = v_inv.org_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'Your login is already linked to another person at this church.');
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.member_role)
  on conflict (org_id, user_id) do update
    set role = case when public.org_role_rank(excluded.role) > public.org_role_rank(public.org_members.role)
                    then excluded.role else public.org_members.role end;
  insert into public.person_logins (person_id, org_id, user_id) values (v_inv.person_id, v_inv.org_id, v_uid);

  update public.org_invitations set accepted_at = now() where id = v_inv.id;
  return jsonb_build_object('ok', true, 'org_id', v_inv.org_id);
end;
$$;

create or replace function public.revoke_org_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.org_invitations where id = p_invitation_id;
  if v_org is null or auth.uid() is null or not chms_private.is_church_admin(v_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.org_invitations set revoked_at = now() where id = p_invitation_id and accepted_at is null;
end;
$$;

-- Church admins remove a person's login and membership. Owners change only
-- through the church claim.
create or replace function public.unlink_person_login(p_person_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_login public.person_logins%rowtype;
begin
  select * into v_login from public.person_logins where person_id = p_person_id;
  if not found then
    return;
  end if;
  if auth.uid() is null or not chms_private.is_church_admin(v_login.org_id) then
    raise exception 'only church admins can remove a login' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_members where org_id = v_login.org_id and user_id = v_login.user_id and role = 'owner') then
    raise exception 'owners are changed through the church claim' using errcode = '42501';
  end if;
  delete from public.org_members where org_id = v_login.org_id and user_id = v_login.user_id;
  delete from public.person_logins where person_id = p_person_id;
end;
$$;

grant execute on function public.has_org_permission(uuid, text), public.my_org_permissions(uuid),
  public.people_with_logins(uuid), public.create_org_invitation(uuid, text, uuid, text),
  public.accept_org_invitation(text), public.revoke_org_invitation(uuid), public.unlink_person_login(uuid)
  to authenticated, service_role;

-- ------------------------------------------------------------------- RLS --
-- Membership rows carry account ids: each user reads only their own, and
-- clients never write them (invitations and claims do, as definer code).
create policy "Members read only their own membership row" on public.org_members
  as restrictive for select
  using (user_id = auth.uid() or public.is_moderator());
create policy "Memberships come only from invitations and claims" on public.org_members
  as restrictive for insert to anon, authenticated
  with check (false);
create policy "Memberships are removed only through the app" on public.org_members
  as restrictive for delete to anon, authenticated
  using (false);

create policy "Members read their church's roles" on public.org_roles for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]));
create policy "Role managers add roles" on public.org_roles for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('roles.manage'))::uuid[]));
create policy "Role managers edit roles" on public.org_roles for update
  using (org_id = any ((select chms_private.orgs_with_permission('roles.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('roles.manage'))::uuid[]));
create policy "Role managers delete roles" on public.org_roles for delete
  using (org_id = any ((select chms_private.orgs_with_permission('roles.manage'))::uuid[]));

create policy "Viewers read people; leaders read themselves" on public.people for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[])
         or id = any ((select chms_private.my_person_ids())::uuid[]));
create policy "Editors add people" on public.people for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]));
create policy "Editors edit people" on public.people for update
  using (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]));

create policy "Users read their own login link" on public.person_logins for select
  using (user_id = auth.uid() and org_id = any ((select chms_private.my_orgs())::uuid[]));

create policy "Viewers read households" on public.households for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[]));
create policy "Editors add households" on public.households for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]));
create policy "Editors edit households" on public.households for update
  using (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]));

create policy "Viewers read household members" on public.household_members for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[]));
create policy "Editors add household members" on public.household_members for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]));
create policy "Editors edit household members" on public.household_members for update
  using (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]));
create policy "Editors remove household members" on public.household_members for delete
  using (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]));

create policy "Viewers read role holders; leaders read their own" on public.person_roles for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[])
         or person_id = any ((select chms_private.my_person_ids())::uuid[]));
create policy "Role managers assign roles" on public.person_roles for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('roles.manage'))::uuid[]));
create policy "Role managers remove roles" on public.person_roles for delete
  using (org_id = any ((select chms_private.orgs_with_permission('roles.manage'))::uuid[]));

create policy "Viewers read the chart" on public.person_overseers for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[]));
-- Role managers reach the chart guard, which lets only church admins through
-- (so other leaders get a clear error instead of a silent no-op).
create policy "Role managers edit the chart" on public.person_overseers for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('roles.manage'))::uuid[]));
create policy "Role managers remove chart lines" on public.person_overseers for delete
  using (org_id = any ((select chms_private.orgs_with_permission('roles.manage'))::uuid[]));

create policy "Note keepers read notes they may see" on public.person_notes for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.notes'))::uuid[]) and (
    author_person_id = any ((select chms_private.my_person_ids())::uuid[])
    or (not person_id = any ((select chms_private.my_person_ids())::uuid[])
        and (visibility = 'care'
             or (visibility = 'oversight' and person_id = any ((select chms_private.people_i_oversee())::uuid[]))))
  ));
create policy "Note keepers write notes" on public.person_notes for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('people.notes'))::uuid[]));
create policy "Authors edit their notes" on public.person_notes for update
  using (org_id = any ((select chms_private.orgs_with_permission('people.notes'))::uuid[])
         and author_person_id = any ((select chms_private.my_person_ids())::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('people.notes'))::uuid[])
              and author_person_id = any ((select chms_private.my_person_ids())::uuid[]));
create policy "Authors or church managers delete notes" on public.person_notes for delete
  using (org_id = any ((select chms_private.orgs_with_permission('people.notes'))::uuid[])
         and (author_person_id = any ((select chms_private.my_person_ids())::uuid[])
              or org_id = any ((select chms_private.orgs_with_permission('org.manage'))::uuid[])));

create policy "Viewers read people history" on public.people_audit for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[]));

create policy "Church admins read invitations" on public.org_invitations for select
  using (chms_private.is_church_admin(org_id));
