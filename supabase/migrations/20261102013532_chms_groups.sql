-- ============================================================================
-- ChMS groups (G1): ministries, serving teams, small groups, classes and
-- community groups, with their members and leaders, drawn from People.
--
-- A new permission, groups.manage, creates groups and edits any group's
-- members; an active leader or co-leader of a group edits that group and
-- its members without it. Members are read with people.view (children need
-- kids.view, as in the directory); a person always reads their own rows.
-- Memberships end, never delete. Every change is audited and put on the
-- event bus (group.created|updated|archived, group.member_added|updated|ended)
-- so the rules engine can follow it later. Stations are not church members
-- and read nothing here.
-- ============================================================================

-- ---------------------------------------------------------- permission --
create or replace function chms_private.all_permissions()
returns text[] language sql immutable set search_path = public as $$
  select array[
    'people.view', 'people.edit', 'people.notes', 'people.export', 'roles.manage', 'org.manage',
    'kids.view', 'kids.care', 'custody.manage',
    'checkin.station', 'checkin.manage', 'attendance.reports',
    'notify.page', 'notify.broadcast', 'rules.manage',
    'groups.manage'
  ]::text[];
$$;

-- Staff and kids directors manage groups by default; pastors hold everything.
create or replace function chms_private.seed_default_org_roles(p_org_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.org_roles (org_id, name, description, permissions) values
    (p_org_id, 'Pastor', 'Leads the church; can do everything.', chms_private.all_permissions()),
    (p_org_id, 'Staff', 'Keeps the directory up to date.',
      array['people.view','people.edit','people.export','kids.view','kids.care','checkin.station','attendance.reports','groups.manage']),
    (p_org_id, 'Elder', 'Shepherds the congregation.',
      array['people.view','people.notes','kids.view','kids.care','custody.manage']),
    (p_org_id, 'Deacon', 'Cares for members and makes care calls.', array['people.view','people.notes','kids.view']),
    (p_org_id, 'Group Leader', 'Leads a group or ministry.', array['people.view','kids.view']),
    (p_org_id, 'Volunteer', 'Serves on a team.', '{}'),
    (p_org_id, 'Kids Director', 'Runs a kids area: rooms, check-in, volunteers.',
      array['people.view','people.edit','people.notes','people.export','kids.view','kids.care','custody.manage',
            'checkin.station','checkin.manage','attendance.reports','notify.page','notify.broadcast','groups.manage']),
    (p_org_id, 'Room Leader', 'Head volunteer for a room.',
      array['people.view','kids.view','kids.care','checkin.station','notify.page']),
    (p_org_id, 'Check-in Volunteer', 'Runs a check-in station.', array['checkin.station'])
  on conflict (org_id, name) do nothing;
$$;

-- Existing churches: extend the default roles that were never edited (set
-- equality against the check-in A seed), as migration A did.
update public.org_roles set permissions = permissions || '{groups.manage}'
  where name = 'Staff'
    and permissions <@ array['people.view','people.edit','people.export','kids.view','kids.care','checkin.station','attendance.reports']
    and array['people.view','people.edit','people.export','kids.view','kids.care','checkin.station','attendance.reports'] <@ permissions;
update public.org_roles set permissions = permissions || '{groups.manage}'
  where name = 'Kids Director'
    and permissions <@ array['people.view','people.edit','people.notes','people.export','kids.view','kids.care','custody.manage',
                             'checkin.station','checkin.manage','attendance.reports','notify.page','notify.broadcast']
    and array['people.view','people.edit','people.notes','people.export','kids.view','kids.care','custody.manage',
              'checkin.station','checkin.manage','attendance.reports','notify.page','notify.broadcast'] <@ permissions;
update public.org_roles set permissions = chms_private.all_permissions()
  where name = 'Pastor' and cardinality(permissions) = 15 and permissions <@ chms_private.all_permissions();

-- ---------------------------------------------------------------- tables --
create table public.groups (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null default 'small_group' check (kind in ('ministry', 'team', 'small_group', 'class', 'community')),
  description text check (description is null or length(description) <= 2000),
  meets text check (meets is null or length(meets) <= 200),
  area_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id),
  foreign key (area_id, org_id) references public.areas (id, org_id) on delete set null (area_id)
);
create unique index idx_groups_name on public.groups (org_id, lower(btrim(name))) where archived_at is null;
create index idx_groups_org on public.groups (org_id, kind) where archived_at is null;
alter table public.groups enable row level security;

create table public.group_members (
  id uuid primary key default chms_private.uuidv7(),
  group_id uuid not null,
  person_id uuid not null,
  org_id uuid not null,
  role text not null default 'member' check (role in ('member', 'leader', 'co_leader')),
  joined_on date not null default current_date,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id, org_id) references public.groups (id, org_id) on delete cascade,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
create unique index idx_group_members_active on public.group_members (group_id, person_id) where ended_at is null;
create index idx_group_members_person on public.group_members (person_id) where ended_at is null;
create index idx_group_members_group on public.group_members (group_id);
alter table public.group_members enable row level security;

-- --------------------------------------------------------------- helpers --
-- Does the caller lead this group now (as a person linked to their login)?
create or replace function chms_private.leads_group(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.ended_at is null and gm.role in ('leader', 'co_leader')
      and gm.person_id = any (chms_private.my_person_ids()));
$$;
-- policies evaluate it as the caller
revoke execute on function chms_private.leads_group(uuid) from public, anon;
grant execute on function chms_private.leads_group(uuid) to authenticated, service_role;

-- A membership names one person in one group for good; only the role and
-- the end change, and an ended membership is history.
create or replace function chms_private.pin_group_member()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.ended_at is not null then
    raise exception 'an ended membership is history' using errcode = '42501';
  end if;
  new.group_id := old.group_id;
  new.person_id := old.person_id;
  new.org_id := old.org_id;
  new.joined_on := old.joined_on;
  new.created_at := old.created_at;
  return new;
end;
$$;
revoke execute on function chms_private.pin_group_member() from public, anon, authenticated;
create trigger trg_group_members_pin before update on public.group_members
  for each row execute function chms_private.pin_group_member();
create trigger trg_group_members_touch before update on public.group_members
  for each row execute function public.chms_touch();
create trigger trg_group_members_no_delete before delete on public.group_members
  for each row execute function chms_private.deny_changes();
create trigger trg_groups_touch before update on public.groups
  for each row execute function public.chms_touch();

-- ---------------------------------------------------------------- events --
create trigger trg_groups_events after insert or update on public.groups
  for each row execute function chms_private.config_events('group');

create or replace function chms_private.group_member_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform chms_private.emit_event(new.org_id, 'group.member_added', 'group', new.group_id,
      jsonb_build_object('person_id', new.person_id, 'role', new.role, 'membership_id', new.id));
  elsif new.ended_at is not null and old.ended_at is null then
    perform chms_private.emit_event(new.org_id, 'group.member_ended', 'group', new.group_id,
      jsonb_build_object('person_id', new.person_id, 'role', new.role, 'membership_id', new.id));
  elsif new.role is distinct from old.role then
    perform chms_private.emit_event(new.org_id, 'group.member_updated', 'group', new.group_id,
      jsonb_build_object('person_id', new.person_id, 'role', new.role, 'membership_id', new.id));
  end if;
  return null;
end;
$$;
revoke execute on function chms_private.group_member_events() from public, anon, authenticated;
create trigger trg_group_members_events after insert or update on public.group_members
  for each row execute function chms_private.group_member_events();

-- ----------------------------------------------------------------- audit --
create trigger trg_audit_groups after insert or update or delete on public.groups
  for each row execute function chms_private.audit_row();
create trigger trg_audit_group_members after insert or update or delete on public.group_members
  for each row execute function chms_private.audit_row();
create policy "Group audit follows groups.manage" on public.chms_audit for select
  using (table_name in ('groups', 'group_members') and org_id = any ((select chms_private.orgs_with_permission('groups.manage'))::uuid[]));

-- ------------------------------------------------------------------- RLS --
create policy "Members read groups" on public.groups for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]));
create policy "Group managers add groups" on public.groups for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('groups.manage'))::uuid[]));
create policy "Group managers and leaders edit groups" on public.groups for update
  using (org_id = any ((select chms_private.orgs_with_permission('groups.manage'))::uuid[]) or chms_private.leads_group(id))
  with check (org_id = any ((select chms_private.orgs_with_permission('groups.manage'))::uuid[]) or chms_private.leads_group(id));

create policy "Viewers read group members; people read their own" on public.group_members for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[])
         or person_id = any ((select chms_private.my_person_ids())::uuid[]));
create policy "Children's group memberships need kids.view" on public.group_members as restrictive for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
         or person_id = any ((select chms_private.my_person_ids())::uuid[])
         or not chms_private.is_minor(person_id));
create policy "Group managers and leaders add members" on public.group_members for insert
  with check ((org_id = any ((select chms_private.orgs_with_permission('groups.manage'))::uuid[]) or chms_private.leads_group(group_id))
              and (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[]) or not chms_private.is_minor(person_id)));
create policy "Group managers and leaders edit members" on public.group_members for update
  using ((org_id = any ((select chms_private.orgs_with_permission('groups.manage'))::uuid[]) or chms_private.leads_group(group_id))
         and (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[]) or not chms_private.is_minor(person_id)))
  with check ((org_id = any ((select chms_private.orgs_with_permission('groups.manage'))::uuid[]) or chms_private.leads_group(group_id))
              and (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[]) or not chms_private.is_minor(person_id)));
create policy "Group memberships end, never delete" on public.group_members
  as restrictive for delete to anon, authenticated using (false);
