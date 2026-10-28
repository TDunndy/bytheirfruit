-- ============================================================================
-- CHMS PHASE 1: PEOPLE (ADR-0004)
--
--   org_roles          church-named roles carrying permissions
--   people             individuals (records, not accounts)
--   households         families, with household_members
--   person_roles       which people hold which roles
--   person_notes       pastoral notes (people.notes only)
--   people_audit       every insert/update/archive of a person, with the actor
--   org_invitations    leader invites; accepting links a login to a person
--   has_org_permission(org_id, permission)   the check every policy uses
--
-- Guardrail: nothing here references reviews or profiles. A login is linked
-- to a person only through accept_org_invitation().
--
-- Written without drop/revoke statements so the connector applies it without
-- a confirmation prompt (every object is new).
-- ============================================================================

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
  user_id uuid references auth.users(id) on delete set null,
  external_source text check (external_source is null or length(external_source) <= 40),
  external_id text check (external_id is null or length(external_id) <= 200),
  search_text text generated always as (
    lower(coalesce(preferred_name, '') || ' ' || first_name || ' ' || last_name || ' ' || coalesce(email, '') || ' ' || coalesce(phone, ''))
  ) stored,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id),
  unique (org_id, user_id),
  unique (org_id, external_source, external_id)
);
create index idx_people_org_name on public.people (org_id, last_name, first_name);
create index idx_people_search on public.people using gin (search_text gin_trgm_ops);
create index idx_people_user on public.people (user_id) where user_id is not null;

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

create table public.person_notes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null,
  org_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
create index idx_person_notes_person on public.person_notes (person_id, created_at desc);

create table public.people_audit (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null,
  actor uuid,
  action text not null check (action in ('insert', 'update', 'archive', 'restore')),
  changes jsonb not null default '{}',
  at timestamptz not null default now()
);
create index idx_people_audit_person on public.people_audit (person_id, at desc);

create table public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  person_id uuid,
  member_role text not null default 'staff' check (member_role in ('admin', 'staff', 'volunteer')),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
create index idx_org_invitations_org on public.org_invitations (org_id, created_at desc);

alter table public.org_roles         enable row level security;
alter table public.people            enable row level security;
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.person_roles      enable row level security;
alter table public.person_notes      enable row level security;
alter table public.people_audit      enable row level security;
alter table public.org_invitations   enable row level security;

-- --------------------------------------------------------------- helpers --
-- Owners and admins hold every permission; staff and volunteers hold the
-- permissions of the roles on the person record their login is linked to.
create or replace function public.has_org_permission(p_org_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.org_members m
      where m.org_id = p_org_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.org_members m
      join public.people p on p.org_id = m.org_id and p.user_id = m.user_id and p.archived_at is null
      join public.person_roles pr on pr.person_id = p.id
      join public.org_roles r on r.id = pr.role_id
      where m.org_id = p_org_id and m.user_id = auth.uid() and p_permission = any (r.permissions)
    )
  );
$$;

-- Every permission the signed-in user holds in a church (drives the UI).
create or replace function public.my_org_permissions(p_org_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct perm order by perm), '{}')
  from unnest(array['people.view','people.edit','people.notes','people.export','roles.manage','org.manage']) perm
  where public.has_org_permission(p_org_id, perm);
$$;

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

-- A login is linked to a person only by accept_org_invitation(), which sets
-- app.chms_linking for its own transaction. SECURITY INVOKER on purpose.
create or replace function public.protect_people_user_link()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.user_id is not null
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id)
     and coalesce(current_setting('app.chms_linking', true), '') <> 'on' then
    raise exception 'people.user_id is set only by accepting an invitation' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_protect_people_user_link before insert or update of user_id on public.people
  for each row execute function public.protect_people_user_link();

-- Audit trail for people. Definer so it can write past RLS; the actor is auth.uid().
create or replace function public.audit_people()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_changes jsonb := '{}';
  v_old jsonb;
  v_new jsonb;
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
  insert into public.people_audit (org_id, person_id, actor, action, changes)
  values (new.org_id, new.id, auth.uid(), v_action, v_changes);
  return new;
end;
$$;
create trigger trg_audit_people after insert or update on public.people
  for each row execute function public.audit_people();

-- Default roles for every church; editable afterwards.
create or replace function public.seed_default_org_roles(p_org_id uuid)
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

create or replace function public.seed_org_roles_on_create()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_org_roles(new.id);
  return new;
end;
$$;
create trigger trg_seed_org_roles after insert on public.organizations
  for each row execute function public.seed_org_roles_on_create();

select public.seed_default_org_roles(id) from public.organizations;

-- ------------------------------------------------------------ invitations --
-- Returns the plain token once; only its hash is stored.
create or replace function public.create_org_invitation(
  p_org_id uuid, p_email text, p_person_id uuid default null, p_member_role text default 'staff'
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid;
begin
  if not public.has_org_permission(p_org_id, 'org.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_member_role = 'admin' and not public.is_org_member(p_org_id, 'admin') then
    raise exception 'only owners and admins can invite admins' using errcode = '42501';
  end if;
  if p_person_id is not null and exists (select 1 from public.people where id = p_person_id and user_id is not null) then
    raise exception 'this person is already linked to a login' using errcode = '23505';
  end if;
  insert into public.org_invitations (org_id, email, person_id, member_role, token_hash)
  values (p_org_id, lower(btrim(p_email)), p_person_id, p_member_role, encode(extensions.digest(v_token, 'sha256'), 'hex'))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

-- The invited user accepts with the token from their email. The invitation
-- must be addressed to the email on their account.
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
  if v_inv.person_id is not null then
    if exists (select 1 from public.people where org_id = v_inv.org_id and user_id = v_uid and id <> v_inv.person_id) then
      return jsonb_build_object('ok', false, 'error', 'Your login is already linked to another person at this church.');
    end if;
    if exists (select 1 from public.people where id = v_inv.person_id and user_id is not null and user_id <> v_uid) then
      return jsonb_build_object('ok', false, 'error', 'That person is already linked to another login.');
    end if;
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.member_role)
  on conflict (org_id, user_id) do update
    set role = case when public.org_role_rank(excluded.role) > public.org_role_rank(public.org_members.role)
                    then excluded.role else public.org_members.role end;

  if v_inv.person_id is not null then
    perform set_config('app.chms_linking', 'on', true);
    update public.people set user_id = v_uid where id = v_inv.person_id;
    perform set_config('app.chms_linking', '', true);
  end if;

  update public.org_invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  return jsonb_build_object('ok', true, 'org_id', v_inv.org_id);
end;
$$;

create or replace function public.revoke_org_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.org_invitations where id = p_invitation_id;
  if v_org is null or not public.has_org_permission(v_org, 'org.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.org_invitations set revoked_at = now() where id = p_invitation_id and accepted_at is null;
end;
$$;

grant execute on function public.has_org_permission(uuid, text), public.my_org_permissions(uuid),
  public.create_org_invitation(uuid, text, uuid, text), public.accept_org_invitation(text),
  public.revoke_org_invitation(uuid)
  to authenticated, service_role;

-- ------------------------------------------------------------------- RLS --
create policy "Members read their church's roles" on public.org_roles for select
  using (public.is_org_member(org_id));
create policy "Role managers add roles" on public.org_roles for insert
  with check (public.has_org_permission(org_id, 'roles.manage'));
create policy "Role managers edit roles" on public.org_roles for update
  using (public.has_org_permission(org_id, 'roles.manage')) with check (public.has_org_permission(org_id, 'roles.manage'));
create policy "Role managers delete roles" on public.org_roles for delete
  using (public.has_org_permission(org_id, 'roles.manage'));

create policy "Viewers read people; leaders read themselves" on public.people for select
  using (public.has_org_permission(org_id, 'people.view') or user_id = auth.uid());
create policy "Editors add people" on public.people for insert
  with check (public.has_org_permission(org_id, 'people.edit'));
create policy "Editors edit people" on public.people for update
  using (public.has_org_permission(org_id, 'people.edit')) with check (public.has_org_permission(org_id, 'people.edit'));

create policy "Viewers read households" on public.households for select
  using (public.has_org_permission(org_id, 'people.view'));
create policy "Editors add households" on public.households for insert
  with check (public.has_org_permission(org_id, 'people.edit'));
create policy "Editors edit households" on public.households for update
  using (public.has_org_permission(org_id, 'people.edit')) with check (public.has_org_permission(org_id, 'people.edit'));

create policy "Viewers read household members" on public.household_members for select
  using (public.has_org_permission(org_id, 'people.view'));
create policy "Editors add household members" on public.household_members for insert
  with check (public.has_org_permission(org_id, 'people.edit'));
create policy "Editors edit household members" on public.household_members for update
  using (public.has_org_permission(org_id, 'people.edit')) with check (public.has_org_permission(org_id, 'people.edit'));
create policy "Editors remove household members" on public.household_members for delete
  using (public.has_org_permission(org_id, 'people.edit'));

create policy "Viewers read role holders; leaders read their own" on public.person_roles for select
  using (public.has_org_permission(org_id, 'people.view')
         or exists (select 1 from public.people p where p.id = person_id and p.user_id = auth.uid()));
create policy "Role managers assign roles" on public.person_roles for insert
  with check (public.has_org_permission(org_id, 'roles.manage'));
create policy "Role managers remove roles" on public.person_roles for delete
  using (public.has_org_permission(org_id, 'roles.manage'));

create policy "Note keepers read notes" on public.person_notes for select
  using (public.has_org_permission(org_id, 'people.notes'));
create policy "Note keepers write notes" on public.person_notes for insert
  with check (public.has_org_permission(org_id, 'people.notes') and created_by = auth.uid());
create policy "Authors edit their notes" on public.person_notes for update
  using (public.has_org_permission(org_id, 'people.notes') and created_by = auth.uid())
  with check (public.has_org_permission(org_id, 'people.notes') and created_by = auth.uid());
create policy "Authors or church managers delete notes" on public.person_notes for delete
  using (public.has_org_permission(org_id, 'people.notes')
         and (created_by = auth.uid() or public.has_org_permission(org_id, 'org.manage')));

create policy "Viewers read people history" on public.people_audit for select
  using (public.has_org_permission(org_id, 'people.view'));

create policy "Church managers read invitations" on public.org_invitations for select
  using (public.has_org_permission(org_id, 'org.manage'));
