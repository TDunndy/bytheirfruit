-- ============================================================================
-- CHMS CHECK-IN, MIGRATION A: PEOPLE CHANGES (docs/plans/checkin-plan.md §3.1)
--
-- What this adds to People v1 before any check-in table exists:
--   permissions      one list (chms_private.all_permissions) for the CHECK
--                    constraint, the admin branch and the role seed; kids.*,
--                    custody.manage, checkin.*, attendance.reports, notify.*,
--                    rules.manage; three new default roles
--   kids.view        children in the directory need it (restrictive policies
--                    on people, household_members, people_audit)
--   org_checkin_settings   time zone, grade cutoff, promotion date, label
--                    defaults, punctuality grace
--   household_members      is_guardian, can_check_in, ended_at (ended, never
--                    deleted: custody history matters)
--   people           grade override, custom fields, phone_e164, photo_path
--   custom_field_defs, custom_field_values_sensitive, household_flags
--   child_care       no SELECT policy; read and written only through RPCs that
--                    log to access_log
--   pickup_people    authorized / restricted; restricted wins over everything
--   person_documents, person_credentials, contact_consents, checkin_keys
--   access_log, chms_audit, domain_events   append-only logs
--
-- Conventions (plan §2): every table carries org_id and set-based RLS; actor
-- columns are person ids plus a station id, never account ids; append-only
-- tables refuse UPDATE and DELETE for everyone; events carry no personal data.
--
-- Guardrail: nothing here references reviews or profiles.
-- ============================================================================

-- ------------------------------------------------------------- helpers --
-- Time-ordered ids for rows that devices create offline (client-generated)
-- and for server rows that must sort by creation.
create or replace function chms_private.uuidv7()
returns uuid language plpgsql volatile set search_path = public as $$
declare
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  v_bytes := overlay(v_bytes placing substring(int8send(v_ms) from 3 for 6) from 1 for 6);
  v_bytes := set_byte(v_bytes, 6, (get_byte(v_bytes, 6) & 15) | 112);
  v_bytes := set_byte(v_bytes, 8, (get_byte(v_bytes, 8) & 63) | 128);
  return encode(v_bytes, 'hex')::uuid;
end;
$$;

-- Station principals carry app_metadata.kind = 'station' (set server-side at
-- pairing; users cannot edit app_metadata). Migration B replaces
-- current_station_id() with a lookup that never trusts the claim alone.
create or replace function public.is_station()
returns boolean language sql stable set search_path = public as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'kind', '') = 'station';
$$;
grant execute on function public.is_station() to anon, authenticated, service_role;

create or replace function chms_private.current_station_id()
returns uuid language sql stable set search_path = public as $$
  select case when public.is_station() then nullif(auth.jwt() -> 'app_metadata' ->> 'station_id', '')::uuid end;
$$;

-- Who is acting, for audit rows and events: a person id and a kind, never an
-- account id.
create or replace function chms_private.actor_for(p_org_id uuid, out person_id uuid, out kind text, out station_id uuid)
language sql stable security definer set search_path = public as $$
  select
    case when auth.uid() is null or public.is_station() then null else chms_private.my_person_id(p_org_id) end,
    case
      when auth.uid() is null then 'system'
      when public.is_station() then 'station'
      when chms_private.my_person_id(p_org_id) is not null then 'leader'
      else 'admin'
    end,
    chms_private.current_station_id();
$$;

-- Append-only tables: nobody updates or deletes, church owners included.
create or replace function chms_private.deny_changes()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception '% is append-only' , tg_table_name using errcode = '42501';
end;
$$;

-- E.164 for US numbers; anything else stays unmatched (null).
create or replace function chms_private.normalize_phone(p_phone text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_phone is null then null
    when length(d) = 10 then '+1' || d
    when length(d) = 11 and left(d, 1) = '1' then '+' || d
    else null
  end
  from (select regexp_replace(p_phone, '\D', '', 'g') as d) s;
$$;

-- --------------------------------------------------------- permissions --
create or replace function chms_private.all_permissions()
returns text[] language sql immutable set search_path = public as $$
  select array[
    'people.view', 'people.edit', 'people.notes', 'people.export', 'roles.manage', 'org.manage',
    'kids.view', 'kids.care', 'custody.manage',
    'checkin.station', 'checkin.manage', 'attendance.reports',
    'notify.page', 'notify.broadcast', 'rules.manage'
  ]::text[];
$$;

alter table public.org_roles drop constraint org_roles_permissions_check;
alter table public.org_roles add constraint org_roles_permissions_check
  check (permissions <@ chms_private.all_permissions());
-- Care and custody imply seeing children at all.
update public.org_roles set permissions = permissions || '{kids.view}'
  where permissions && array['kids.care', 'custody.manage'] and not ('kids.view' = any (permissions));
alter table public.org_roles add constraint org_roles_kids_view_implied
  check (not (permissions && array['kids.care', 'custody.manage']) or 'kids.view' = any (permissions));

-- Owners and admins hold every permission, from the one list.
create or replace function chms_private.user_permissions(p_org_id uuid, p_user_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when p_user_id is null then '{}'::text[]
    when exists (select 1 from public.org_members m
                 where m.org_id = p_org_id and m.user_id = p_user_id and m.role in ('owner', 'admin'))
      then chms_private.all_permissions()
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

-- Default roles (decisions F and N): medical notes for leadership, staff and
-- head volunteers; custody for pastors, elders and kids directors.
create or replace function chms_private.seed_default_org_roles(p_org_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.org_roles (org_id, name, description, permissions) values
    (p_org_id, 'Pastor', 'Leads the church; can do everything.', chms_private.all_permissions()),
    (p_org_id, 'Staff', 'Keeps the directory up to date.',
      array['people.view','people.edit','people.export','kids.view','kids.care','checkin.station','attendance.reports']),
    (p_org_id, 'Elder', 'Shepherds the congregation.',
      array['people.view','people.notes','kids.view','kids.care','custody.manage']),
    (p_org_id, 'Deacon', 'Cares for members and makes care calls.', array['people.view','people.notes','kids.view']),
    (p_org_id, 'Group Leader', 'Leads a group or ministry.', array['people.view','kids.view']),
    (p_org_id, 'Volunteer', 'Serves on a team.', '{}'),
    (p_org_id, 'Kids Director', 'Runs a kids area: rooms, check-in, volunteers.',
      array['people.view','people.edit','people.notes','people.export','kids.view','kids.care','custody.manage',
            'checkin.station','checkin.manage','attendance.reports','notify.page','notify.broadcast']),
    (p_org_id, 'Room Leader', 'Head volunteer for a room.',
      array['people.view','kids.view','kids.care','checkin.station','notify.page']),
    (p_org_id, 'Check-in Volunteer', 'Runs a check-in station.', array['checkin.station'])
  on conflict (org_id, name) do nothing;
$$;

-- Existing churches: add the new roles, and extend default roles that were
-- never edited (set equality against the People v1 seed).
select chms_private.seed_default_org_roles(id) from public.organizations;
update public.org_roles set permissions = array['people.view','people.edit','people.export','kids.view','kids.care','checkin.station','attendance.reports']
  where name = 'Staff' and permissions <@ array['people.view','people.edit','people.export'] and array['people.view','people.edit','people.export'] <@ permissions;
update public.org_roles set permissions = array['people.view','people.notes','kids.view','kids.care','custody.manage']
  where name = 'Elder' and permissions <@ array['people.view','people.notes'] and array['people.view','people.notes'] <@ permissions;
update public.org_roles set permissions = array['people.view','people.notes','kids.view']
  where name = 'Deacon' and permissions <@ array['people.view','people.notes'] and array['people.view','people.notes'] <@ permissions;
update public.org_roles set permissions = array['people.view','kids.view']
  where name = 'Group Leader' and permissions <@ array['people.view'] and array['people.view'] <@ permissions;
update public.org_roles set permissions = chms_private.all_permissions()
  where name = 'Pastor' and cardinality(permissions) = 6
    and permissions <@ array['people.view','people.edit','people.notes','people.export','roles.manage','org.manage'];

-- ------------------------------------------------------- org settings --
create table public.org_checkin_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  time_zone text not null,
  grade_cutoff_month smallint not null default 8 check (grade_cutoff_month between 1 and 12),
  grade_cutoff_day smallint not null default 16 check (grade_cutoff_day between 1 and 31),
  promotion_date date,
  label_defaults jsonb not null default '{}',
  punctuality_grace_minutes smallint not null default 10 check (punctuality_grace_minutes between 0 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.org_checkin_settings enable row level security;

create or replace function chms_private.validate_checkin_settings()
returns trigger language plpgsql set search_path = public as $$
begin
  perform now() at time zone new.time_zone;   -- raises 22023 for an unknown zone
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_checkin_settings_validate before insert or update on public.org_checkin_settings
  for each row execute function chms_private.validate_checkin_settings();

create policy "Members read check-in settings" on public.org_checkin_settings for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]));
create policy "Check-in managers add settings" on public.org_checkin_settings for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit settings" on public.org_checkin_settings for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

-- ------------------------------------------------- households and kids --
alter table public.household_members
  add column is_guardian boolean not null default false,
  add column can_check_in boolean not null default false,
  add column ended_at timestamptz,
  add constraint household_members_child_not_guardian check (not (relationship = 'child' and (is_guardian or can_check_in)));
update public.household_members set is_guardian = true, can_check_in = true where relationship in ('head', 'spouse');
-- Memberships end; they are never deleted, by anyone.
create policy "Household memberships end, never delete" on public.household_members
  as restrictive for delete to anon, authenticated using (false);
create trigger trg_household_members_no_delete before delete on public.household_members
  for each row execute function chms_private.deny_changes();
create trigger trg_household_members_no_truncate before truncate on public.household_members
  for each statement execute function chms_private.deny_changes();

-- The church's calendar date (UTC when no time zone is set yet).
create or replace function chms_private.local_today(p_org_id uuid)
returns date language sql stable security definer set search_path = public as $$
  select coalesce((select (now() at time zone s.time_zone)::date from public.org_checkin_settings s where s.org_id = p_org_id), current_date);
$$;

-- A minor: under 18 on the church's local date by birthdate, or a child in a household.
create or replace function chms_private.is_minor(p_person_id uuid, p_birthdate date, p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_birthdate is not null and p_birthdate > chms_private.local_today(p_org_id) - interval '18 years')
      or exists (select 1 from public.household_members hm
                 where hm.person_id = p_person_id and hm.relationship = 'child' and hm.ended_at is null);
$$;
create or replace function chms_private.is_minor(p_person_id uuid, p_birthdate date)
returns boolean language sql stable security definer set search_path = public as $$
  select chms_private.is_minor(p_person_id, p_birthdate, (select org_id from public.people where id = p_person_id));
$$;
-- The lookup form answers signed-in callers only (it is an oracle on person ids).
create or replace function chms_private.is_minor(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and coalesce((select chms_private.is_minor(p.id, p.birthdate, p.org_id) from public.people p where p.id = p_person_id), false);
$$;

-- Flags follow the relationship: a row relabelled as a child loses them, and a
-- minor by birthdate is never a guardian whatever the relationship says.
create or replace function chms_private.normalize_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.relationship = 'child' and old.relationship <> 'child' then
    new.is_guardian := false;
    new.can_check_in := false;
  end if;
  if (new.is_guardian or new.can_check_in)
     and exists (select 1 from public.people p where p.id = new.person_id and p.birthdate is not null
                 and p.birthdate > chms_private.local_today(new.org_id) - interval '18 years') then
    raise exception 'a minor cannot be a guardian or check in others' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_household_members_normalize before insert or update on public.household_members
  for each row execute function chms_private.normalize_membership();

-- Children in the directory need kids.view on top of people.view.
-- (The set-based arms come first so kids.view holders never pay the per-row call.)
create policy "Children need kids.view" on public.people as restrictive for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
         or id = any ((select chms_private.my_person_ids())::uuid[])
         or not chms_private.is_minor(id, birthdate, org_id));
create policy "Children need kids.view to edit" on public.people as restrictive for update
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
         or id = any ((select chms_private.my_person_ids())::uuid[])
         or not chms_private.is_minor(id, birthdate, org_id));
create policy "Children need kids.view to add" on public.people as restrictive for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
              or not chms_private.is_minor(id, birthdate, org_id));
create policy "Children's memberships need kids.view" on public.household_members as restrictive for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
         or not chms_private.is_minor(person_id));
create policy "Children's memberships need kids.view to edit" on public.household_members as restrictive for update
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
         or not chms_private.is_minor(person_id))
  with check (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
              or (relationship <> 'child' and not chms_private.is_minor(person_id)));
create policy "Children's memberships need kids.view to add" on public.household_members as restrictive for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
              or (relationship <> 'child' and not chms_private.is_minor(person_id)));
create policy "Children's history needs kids.view" on public.people_audit as restrictive for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
         or not chms_private.is_minor(person_id));

-- Grade: derived from birthdate and the cutoff unless overridden. The override
-- is anchored to a school year and advances with each promotion.
alter table public.people
  add column grade_override smallint check (grade_override between -1 and 12),
  add column grade_override_year smallint check (grade_override_year between 2000 and 2100),
  add column custom jsonb not null default '{}',
  add column phone_e164 text generated always as (chms_private.normalize_phone(phone)) stored,
  add column photo_path text check (photo_path is null or length(photo_path) <= 400),
  add constraint people_grade_override_year check ((grade_override is null) = (grade_override_year is null));
create index idx_people_phone_e164 on public.people (org_id, phone_e164) where phone_e164 is not null;
create index idx_people_phone_last4 on public.people (org_id, right(phone_e164, 4)) where phone_e164 is not null;
alter table public.households add column custom jsonb not null default '{}';

-- ---------------------------------------------------- custom fields --
create table public.custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  applies_to text not null check (applies_to in ('person', 'household')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  field_type text not null check (field_type in ('text', 'number', 'date', 'boolean', 'select', 'multiselect')),
  options text[] not null default '{}' check (cardinality(options) <= 100),
  sensitive boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (org_id, applies_to, key),
  unique (id, org_id)
);
alter table public.custom_field_defs enable row level security;
create policy "Members read custom field definitions" on public.custom_field_defs for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]));
create policy "Church managers add custom fields" on public.custom_field_defs for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('org.manage'))::uuid[]));
create policy "Church managers edit custom fields" on public.custom_field_defs for update
  using (org_id = any ((select chms_private.orgs_with_permission('org.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('org.manage'))::uuid[]));

-- Sensitive values live apart from people.custom, so they never reach the
-- directory, the audit diff or anyone without kids.care.
create table public.custom_field_values_sensitive (
  field_id uuid not null,
  org_id uuid not null,
  subject_id uuid not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (field_id, subject_id),
  foreign key (field_id, org_id) references public.custom_field_defs (id, org_id) on delete cascade
);
alter table public.custom_field_values_sensitive enable row level security;
create or replace function chms_private.check_sensitive_subject()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_applies text;
begin
  select d.applies_to into v_applies from public.custom_field_defs d
  where d.id = new.field_id and d.org_id = new.org_id and d.sensitive;
  if v_applies is null then
    raise exception 'no such sensitive field in this church' using errcode = '23503';
  end if;
  if v_applies = 'person' and not exists (select 1 from public.people where id = new.subject_id and org_id = new.org_id) then
    raise exception 'no such person in this church' using errcode = '23503';
  end if;
  if v_applies = 'household' and not exists (select 1 from public.households where id = new.subject_id and org_id = new.org_id) then
    raise exception 'no such household in this church' using errcode = '23503';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_sensitive_values_subject before insert or update on public.custom_field_values_sensitive
  for each row execute function chms_private.check_sensitive_subject();

-- Sensitive keys never land in the directory-visible custom columns.
create or replace function chms_private.check_custom_keys()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key text;
begin
  if new.custom is null or new.custom = '{}'::jsonb then
    return new;
  end if;
  select d.key into v_key
  from public.custom_field_defs d
  where d.org_id = new.org_id and d.sensitive
    and d.applies_to = case tg_table_name when 'people' then 'person' else 'household' end
    and new.custom ? d.key
  limit 1;
  if v_key is not null then
    raise exception 'field "%" is sensitive and is stored apart from the directory', v_key using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_people_custom_keys before insert or update of custom on public.people
  for each row execute function chms_private.check_custom_keys();
create trigger trg_households_custom_keys before insert or update of custom on public.households
  for each row execute function chms_private.check_custom_keys();

create policy "Care holders read sensitive values" on public.custom_field_values_sensitive for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[]));
create policy "Care holders add sensitive values" on public.custom_field_values_sensitive for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[]));
create policy "Care holders edit sensitive values" on public.custom_field_values_sensitive for update
  using (org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[]));

-- --------------------------------------------------- household flags --
create table public.household_flags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  household_id uuid not null,
  flag text not null check (flag in ('exempt', 'joining_team', 'serving_elsewhere', 'no_longer_attending', 'pastoral_hold')),
  note text check (note is null or length(note) <= 1000),
  set_by_person_id uuid references public.people(id) on delete set null,
  set_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by_person_id uuid references public.people(id) on delete set null,
  foreign key (household_id, org_id) references public.households (id, org_id) on delete cascade
);
create unique index idx_household_flags_active on public.household_flags (household_id, flag) where cleared_at is null;
create index idx_household_flags_org on public.household_flags (org_id, flag) where cleared_at is null;
alter table public.household_flags enable row level security;
create policy "Viewers read household flags" on public.household_flags for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[]));
create policy "Note keepers set household flags" on public.household_flags for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('people.notes'))::uuid[]));
create policy "Note keepers clear household flags" on public.household_flags for update
  using (org_id = any ((select chms_private.orgs_with_permission('people.notes'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('people.notes'))::uuid[]));

create or replace function chms_private.stamp_flag_actor()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.set_by_person_id := chms_private.my_person_id(new.org_id);
    new.set_at := now();
    new.cleared_at := null;
    new.cleared_by_person_id := null;
    return new;
  end if;
  -- Who set a flag, and on which household, never changes; clearing is final.
  new.org_id := old.org_id;
  new.household_id := old.household_id;
  new.flag := old.flag;
  new.set_by_person_id := old.set_by_person_id;
  new.set_at := old.set_at;
  if old.cleared_at is not null then
    if new.cleared_at is distinct from old.cleared_at or new.cleared_by_person_id is distinct from old.cleared_by_person_id then
      raise exception 'a cleared flag stays cleared; set a new one' using errcode = '42501';
    end if;
  elsif new.cleared_at is not null then
    new.cleared_at := now();
    new.cleared_by_person_id := chms_private.my_person_id(new.org_id);
  end if;
  return new;
end;
$$;
create trigger trg_household_flags_actor before insert or update on public.household_flags
  for each row execute function chms_private.stamp_flag_actor();

-- ---------------------------------------------------------- audit logs --
-- Reads of sensitive data, logged once per operation.
create table public.access_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete restrict,
  actor_person_id uuid,
  actor_kind text not null check (actor_kind in ('leader', 'admin', 'station', 'system')),
  station_id uuid,
  action text not null check (length(action) between 3 and 60),
  subject_person_id uuid,
  subject_count int not null default 1,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index idx_access_log_subject on public.access_log (subject_person_id, at desc);
create index idx_access_log_org on public.access_log (org_id, at desc);
alter table public.access_log enable row level security;
create policy "Church admins read the access log" on public.access_log for select
  using (chms_private.is_church_admin(org_id));
create trigger trg_access_log_append_only before update or delete on public.access_log
  for each row execute function chms_private.deny_changes();
create trigger trg_access_log_no_truncate before truncate on public.access_log
  for each statement execute function chms_private.deny_changes();

-- An admin with no person record is still identified, in a table no church
-- user can read (the account id never leaves chms_private). One table serves
-- every log and is as append-only as the logs it attributes.
create table chms_private.audit_actors (
  log text not null check (log in ('access_log', 'chms_audit', 'people_audit', 'domain_events')),
  log_id bigint not null,
  user_id uuid not null,
  primary key (log, log_id)
);
alter table chms_private.audit_actors enable row level security;
revoke all on table chms_private.audit_actors from anon, authenticated;
create trigger trg_audit_actors_append_only before update or delete on chms_private.audit_actors
  for each row execute function chms_private.deny_changes();
create trigger trg_audit_actors_no_truncate before truncate on chms_private.audit_actors
  for each statement execute function chms_private.deny_changes();

create or replace function chms_private.note_actor(p_log text, p_log_id bigint, p_person_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into chms_private.audit_actors (log, log_id, user_id)
  select p_log, p_log_id, auth.uid() where p_person_id is null and auth.uid() is not null;
$$;

create or replace function chms_private.log_access(
  p_org_id uuid, p_action text, p_subject_person_id uuid, p_count int default 1, p_detail jsonb default '{}'
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_id bigint;
begin
  select * into a from chms_private.actor_for(p_org_id);
  insert into public.access_log (org_id, actor_person_id, actor_kind, station_id, action, subject_person_id, subject_count, detail)
  values (p_org_id, a.person_id, a.kind, a.station_id, p_action, p_subject_person_id, p_count, coalesce(p_detail, '{}'))
  returning id into v_id;
  perform chms_private.note_actor('access_log', v_id, a.person_id);
  return v_id;
end;
$$;

-- Before/after audit of sensitive tables.
create table public.chms_audit (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete restrict,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_person_id uuid,
  actor_kind text not null check (actor_kind in ('leader', 'admin', 'station', 'system')),
  station_id uuid,
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);
create index idx_chms_audit_row on public.chms_audit (table_name, row_id, at desc);
alter table public.chms_audit enable row level security;
-- Each table's audit is readable with that table's own permission, never
-- wider; care-note history is for church admins only.
create policy "Audit rows follow their table's permission" on public.chms_audit for select
  using (chms_private.is_church_admin(org_id) or (
    case table_name
      when 'pickup_people' then org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[])
      when 'person_documents' then org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[])
      when 'household_members' then org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[])
      when 'person_credentials' then org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
      when 'contact_consents' then org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[])
      when 'household_flags' then org_id = any ((select chms_private.orgs_with_permission('people.notes'))::uuid[])
      when 'custom_field_values_sensitive' then org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[])
      else false
    end));
create trigger trg_chms_audit_append_only before update or delete on public.chms_audit
  for each row execute function chms_private.deny_changes();
create trigger trg_chms_audit_no_truncate before truncate on public.chms_audit
  for each statement execute function chms_private.deny_changes();

create or replace function chms_private.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid := (v_row ->> 'org_id')::uuid;
  v_id bigint;
  a record;
begin
  if tg_table_name = 'child_care' then
    -- The audit keeps the flags and label text; the notes themselves are read
    -- only through the logged RPC.
    v_new := v_new - 'allergies' - 'medical' - 'special_needs';
    v_old := v_old - 'allergies' - 'medical' - 'special_needs';
  end if;
  select * into a from chms_private.actor_for(v_org);
  insert into public.chms_audit (org_id, table_name, row_id, action, actor_person_id, actor_kind, station_id, old_row, new_row)
  values (v_org, tg_table_name, coalesce(v_row ->> 'id', v_row ->> 'person_id', v_row ->> 'subject_id')::uuid,
          lower(tg_op), a.person_id, a.kind, a.station_id, v_old, v_new)
  returning id into v_id;
  perform chms_private.note_actor('chms_audit', v_id, a.person_id);
  return null;
end;
$$;
create trigger trg_audit_household_flags after insert or update or delete on public.household_flags
  for each row execute function chms_private.audit_row();
create trigger trg_audit_sensitive_values after insert or update or delete on public.custom_field_values_sensitive
  for each row execute function chms_private.audit_row();
create trigger trg_audit_household_members after insert or update or delete on public.household_members
  for each row execute function chms_private.audit_row();

-- People history: stations act too.
alter table public.people_audit drop constraint people_audit_actor_kind_check;
alter table public.people_audit add constraint people_audit_actor_kind_check
  check (actor_kind in ('leader', 'admin', 'system', 'station'));
alter table public.people_audit add column station_id uuid;
create trigger trg_people_audit_append_only before update or delete on public.people_audit
  for each row execute function chms_private.deny_changes();
create trigger trg_people_audit_no_truncate before truncate on public.people_audit
  for each statement execute function chms_private.deny_changes();

create or replace function public.audit_people()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_action text;
  v_changes jsonb := '{}';
  v_old jsonb;
  v_new jsonb;
  v_id bigint;
  a record;
  k text;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
  else
    v_action := case
      when old.archived_at is null and new.archived_at is not null then 'archive'
      when old.archived_at is not null and new.archived_at is null then 'restore'
      else 'update' end;
    v_old := to_jsonb(old) - 'updated_at' - 'search_text' - 'phone_e164';
    v_new := to_jsonb(new) - 'updated_at' - 'search_text' - 'phone_e164';
    for k in select jsonb_object_keys(v_new) loop
      if v_new -> k is distinct from v_old -> k then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
      end if;
    end loop;
    if v_changes = '{}' then
      return new;
    end if;
  end if;
  select * into a from chms_private.actor_for(new.org_id);
  insert into public.people_audit (org_id, person_id, actor_person_id, actor_kind, station_id, action, changes)
  values (new.org_id, new.id, a.person_id, a.kind, a.station_id, v_action, v_changes)
  returning id into v_id;
  perform chms_private.note_actor('people_audit', v_id, a.person_id);
  return new;
end;
$$;

-- --------------------------------------------------------- child care --
create table public.child_care (
  person_id uuid primary key,
  org_id uuid not null,
  allergies text check (allergies is null or length(allergies) <= 2000),
  allergy_short text check (allergy_short is null or length(allergy_short) <= 40),
  medical text check (medical is null or length(medical) <= 4000),
  special_needs text check (special_needs is null or length(special_needs) <= 4000),
  has_allergy boolean not null default false,
  has_medical boolean not null default false,
  has_special_needs boolean not null default false,
  updated_at timestamptz not null default now(),
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
-- No policies on purpose: the API reads and writes child_care only through
-- the two functions below, which log every access.
alter table public.child_care enable row level security;
create trigger trg_audit_child_care after insert or update or delete on public.child_care
  for each row execute function chms_private.audit_row();
create trigger trg_child_care_no_truncate before truncate on public.child_care
  for each statement execute function chms_private.deny_changes();

create or replace function public.get_child_care(p_person_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_row public.child_care%rowtype;
begin
  select org_id into v_org from public.people where id = p_person_id;
  if v_org is null or auth.uid() is null or public.is_station()
     or not public.has_org_permission(v_org, 'kids.care') then
    raise exception 'only care note holders can read this' using errcode = '42501';
  end if;
  perform chms_private.log_access(v_org, 'child_care.read', p_person_id);
  select * into v_row from public.child_care where person_id = p_person_id;
  if not found then
    return null;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_child_care(
  p_person_id uuid, p_allergies text, p_allergy_short text, p_medical text, p_special_needs text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.people where id = p_person_id and archived_at is null;
  if v_org is null or auth.uid() is null or public.is_station()
     or not public.has_org_permission(v_org, 'kids.care') then
    raise exception 'only care note holders can change this' using errcode = '42501';
  end if;
  perform chms_private.log_access(v_org, 'child_care.write', p_person_id);
  insert into public.child_care (person_id, org_id, allergies, allergy_short, medical, special_needs,
                                 has_allergy, has_medical, has_special_needs)
  values (p_person_id, v_org, nullif(btrim(p_allergies), ''), nullif(btrim(p_allergy_short), ''),
          nullif(btrim(p_medical), ''), nullif(btrim(p_special_needs), ''),
          nullif(btrim(p_allergies), '') is not null, nullif(btrim(p_medical), '') is not null,
          nullif(btrim(p_special_needs), '') is not null)
  on conflict (person_id) do update set
    allergies = excluded.allergies, allergy_short = excluded.allergy_short,
    medical = excluded.medical, special_needs = excluded.special_needs,
    has_allergy = excluded.has_allergy, has_medical = excluded.has_medical,
    has_special_needs = excluded.has_special_needs, updated_at = now();
end;
$$;

-- Flags and the label text only: what rosters and labels need.
create or replace function public.child_care_summary(p_org_id uuid)
returns table (person_id uuid, has_allergy boolean, has_medical boolean, has_special_needs boolean, allergy_short text)
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_station() or not public.has_org_permission(p_org_id, 'kids.view') then
    raise exception 'only people viewers can read care flags' using errcode = '42501';
  end if;
  perform chms_private.log_access(p_org_id, 'child_care.summary', null,
    (select count(*) from public.child_care c where c.org_id = p_org_id)::int);
  return query
    select c.person_id, c.has_allergy, c.has_medical, c.has_special_needs, c.allergy_short
    from public.child_care c
    where c.org_id = p_org_id;
end;
$$;

-- ------------------------------------------------- pickups and custody --
create table public.pickup_people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  child_person_id uuid not null,
  person_id uuid,
  name text check (name is null or length(name) <= 120),
  phone text check (phone is null or length(phone) <= 40),
  relationship text check (relationship is null or length(relationship) <= 60),
  kind text not null check (kind in ('authorized', 'restricted')),
  note text check (note is null or length(note) <= 2000),
  valid_from date,
  valid_to date,
  created_by_person_id uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (person_id is not null or name is not null),
  -- A restriction must name a directory record so the check is total.
  check (kind <> 'restricted' or person_id is not null),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  foreign key (child_person_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete restrict
);
create index idx_pickup_people_child on public.pickup_people (child_person_id) where archived_at is null;
alter table public.pickup_people enable row level security;
-- Authorized pickups are everyday data; restricted ones are custody data.
create policy "Viewers read authorized pickups; custody managers read all" on public.pickup_people for select
  using ((kind = 'authorized' and org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[]))
         or org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]));
create policy "Custody managers add pickups" on public.pickup_people for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]));
create policy "Custody managers edit pickups" on public.pickup_people for update
  using (org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]));
create trigger trg_audit_pickup_people after insert or update or delete on public.pickup_people
  for each row execute function chms_private.audit_row();

create or replace function chms_private.stamp_pickup_actor()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_person_id := chms_private.my_person_id(new.org_id);
    new.created_at := now();
    return new;
  end if;
  new.org_id := old.org_id;
  new.child_person_id := old.child_person_id;
  new.created_by_person_id := old.created_by_person_id;
  new.created_at := old.created_at;
  return new;
end;
$$;
create trigger trg_pickup_people_actor before insert or update on public.pickup_people
  for each row execute function chms_private.stamp_pickup_actor();

-- Today in the church's time zone (sessions run in UTC).
-- Restricted wins over guardian, can_check_in and authorized, always.
create or replace function chms_private.pickup_status(p_child_id uuid, p_person_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := chms_private.local_today((select org_id from public.people where id = p_child_id));
begin
  if exists (select 1 from public.pickup_people pp
             where pp.child_person_id = p_child_id and pp.person_id = p_person_id and pp.kind = 'restricted'
               and pp.archived_at is null
               and (pp.valid_from is null or pp.valid_from <= v_today)
               and (pp.valid_to is null or pp.valid_to >= v_today)) then
    return 'restricted';
  end if;
  if exists (select 1 from public.household_members c
             join public.household_members g on g.household_id = c.household_id
             where c.person_id = p_child_id and c.ended_at is null
               and g.person_id = p_person_id and g.ended_at is null and g.can_check_in and g.relationship <> 'child') then
    return 'guardian';
  end if;
  if exists (select 1 from public.pickup_people pp
             where pp.child_person_id = p_child_id and pp.person_id = p_person_id and pp.kind = 'authorized'
               and pp.archived_at is null
               and (pp.valid_from is null or pp.valid_from <= v_today)
               and (pp.valid_to is null or pp.valid_to >= v_today)) then
    return 'authorized';
  end if;
  return 'unknown';
end;
$$;

create or replace function public.pickup_status(p_child_id uuid, p_person_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null or public.is_station() then null
    when public.has_org_permission((select org_id from public.people where id = p_child_id), 'kids.view')
      then chms_private.pickup_status(p_child_id, p_person_id)
  end;
$$;

create table public.person_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  person_id uuid not null,
  kind text not null check (kind in ('custody', 'medical', 'other')),
  storage_path text not null check (length(storage_path) <= 400),
  title text not null check (length(btrim(title)) between 1 and 160),
  note text check (note is null or length(note) <= 2000),
  uploaded_by_person_id uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  -- The object path says which church, which kind and which person it is for.
  check (storage_path ~ ('^' || org_id::text || '/' || kind || '/' || person_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,200}$')),
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
create index idx_person_documents_person on public.person_documents (person_id) where archived_at is null;
alter table public.person_documents enable row level security;
create policy "Custody or care holders read documents" on public.person_documents for select
  using ((kind = 'custody' and org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]))
         or (kind <> 'custody' and org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[])));
create policy "Custody or care holders add documents" on public.person_documents for insert
  with check ((kind = 'custody' and org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]))
              or (kind <> 'custody' and org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[])));
create policy "Document owners archive documents" on public.person_documents for update
  using ((kind = 'custody' and org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]))
         or (kind <> 'custody' and org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[])))
  with check ((kind = 'custody' and org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]))
              or (kind <> 'custody' and org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[])));
create trigger trg_audit_person_documents after insert or update or delete on public.person_documents
  for each row execute function chms_private.audit_row();

create or replace function chms_private.stamp_document_actor()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by_person_id := chms_private.my_person_id(new.org_id);
    new.created_at := now();
    return new;
  end if;
  -- Only the title, note and archived_at change after upload.
  new.org_id := old.org_id;
  new.person_id := old.person_id;
  new.kind := old.kind;
  new.storage_path := old.storage_path;
  new.uploaded_by_person_id := old.uploaded_by_person_id;
  new.created_at := old.created_at;
  return new;
end;
$$;
create trigger trg_person_documents_actor before insert or update on public.person_documents
  for each row execute function chms_private.stamp_document_actor();

-- Document reads are served by a logging edge function (slice 5); the API
-- has no SELECT on the bucket. Uploads need the matching permission.
-- Object path: <org_id>/<kind>/<person_id>/<file>.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chms-documents', 'chms-documents', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chms-photos', 'chms-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Church staff upload documents') then
      execute $p$create policy "Church staff upload documents" on storage.objects for insert
        with check (bucket_id = 'chms-documents' and auth.uid() is not null and not public.is_station()
          and array_length(storage.foldername(name), 1) = 3 and name ~ '/[A-Za-z0-9][A-Za-z0-9._-]{0,200}$'
          and (storage.foldername(name))[2] in ('custody', 'medical', 'other')
          and public.has_org_permission((storage.foldername(name))[1]::uuid,
                case when (storage.foldername(name))[2] = 'custody' then 'custody.manage' else 'kids.care' end))$p$;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Church staff read photos') then
      execute $p$create policy "Church staff read photos" on storage.objects for select
        using (bucket_id = 'chms-photos' and auth.uid() is not null and not public.is_station()
          and public.has_org_permission((storage.foldername(name))[1]::uuid, 'people.view')
          and (not chms_private.is_minor((storage.foldername(name))[2]::uuid)
               or public.has_org_permission((storage.foldername(name))[1]::uuid, 'kids.view')))$p$;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Church editors upload photos') then
      execute $p$create policy "Church editors upload photos" on storage.objects for insert
        with check (bucket_id = 'chms-photos' and auth.uid() is not null and not public.is_station()
          and public.has_org_permission((storage.foldername(name))[1]::uuid, 'people.edit')
          and (not chms_private.is_minor((storage.foldername(name))[2]::uuid)
               or public.has_org_permission((storage.foldername(name))[1]::uuid, 'kids.view')))$p$;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Church editors replace photos') then
      execute $p$create policy "Church editors replace photos" on storage.objects for update
        using (bucket_id = 'chms-photos' and auth.uid() is not null and not public.is_station()
          and public.has_org_permission((storage.foldername(name))[1]::uuid, 'people.edit'))$p$;
    end if;
  end if;
end $$;

-- ------------------------------------------------------- credentials --
create table public.person_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  person_id uuid not null,
  kind text not null check (kind in ('background_check', 'training', 'child_safety')),
  completed_on date not null,
  expires_on date check (expires_on is null or expires_on >= completed_on),
  provider text check (provider is null or length(provider) <= 120),
  reference text check (reference is null or length(reference) <= 120),
  note text check (note is null or length(note) <= 1000),
  verified_by_person_id uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
create index idx_person_credentials_person on public.person_credentials (person_id) where archived_at is null;
alter table public.person_credentials enable row level security;
create policy "Check-in managers read credentials" on public.person_credentials for select
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers add credentials" on public.person_credentials for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit credentials" on public.person_credentials for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create trigger trg_audit_person_credentials after insert or update or delete on public.person_credentials
  for each row execute function chms_private.audit_row();

create or replace function chms_private.stamp_credential_actor()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.verified_by_person_id := chms_private.my_person_id(new.org_id);
    new.created_at := now();
    return new;
  end if;
  new.org_id := old.org_id;
  new.person_id := old.person_id;
  new.verified_by_person_id := old.verified_by_person_id;
  new.created_at := old.created_at;
  return new;
end;
$$;
create trigger trg_person_credentials_actor before insert or update on public.person_credentials
  for each row execute function chms_private.stamp_credential_actor();

-- cleared: a current background check; expired: only lapsed ones; none.
create or replace function chms_private.credential_status(p_person_id uuid, p_on date default current_date)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.person_credentials c
                 where c.person_id = p_person_id and c.kind = 'background_check' and c.archived_at is null
                   and c.completed_on <= p_on and (c.expires_on is null or c.expires_on >= p_on)) then 'cleared'
    when exists (select 1 from public.person_credentials c
                 where c.person_id = p_person_id and c.kind = 'background_check' and c.archived_at is null) then 'expired'
    else 'none'
  end;
$$;

-- ---------------------------------------------------------- consents --
create table public.contact_consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  scope text not null check (scope in ('safety', 'general')),
  person_id uuid,
  source text not null check (source in ('station', 'admin', 'web', 'import')),
  station_id uuid,
  text_version text not null check (length(text_version) <= 40),
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_source text check (revoked_source is null or revoked_source in ('stop', 'admin', 'web')),
  foreign key (person_id, org_id) references public.people (id, org_id) on delete set null (person_id)
);
create unique index idx_contact_consents_active on public.contact_consents (org_id, phone_e164, scope) where revoked_at is null;
create index idx_contact_consents_person on public.contact_consents (person_id);
alter table public.contact_consents enable row level security;
create policy "Viewers read consents" on public.contact_consents for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[]));
create policy "Editors record consents" on public.contact_consents for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]) and source = 'admin');
create policy "Editors revoke consents" on public.contact_consents for update
  using (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]));
create trigger trg_audit_contact_consents after insert or update or delete on public.contact_consents
  for each row execute function chms_private.audit_row();

-- A consent record is never rewritten, and a revocation (STOP) is final:
-- consenting again is a new row.
create or replace function chms_private.protect_consent()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if public.is_privileged() then
      return new;
    end if;
    -- A new consent is live and dated now; history cannot be fabricated.
    if new.revoked_at is not null or new.revoked_source is not null or new.station_id is not null then
      raise exception 'a new consent is recorded as given now' using errcode = '42501';
    end if;
    new.consented_at := now();
    return new;
  end if;
  -- Revoked stays revoked, for everyone: consenting again is a new row.
  if old.revoked_at is not null
     and (new.revoked_at is distinct from old.revoked_at or new.revoked_source is distinct from old.revoked_source) then
    raise exception 'a revoked consent stays revoked; record a new consent instead' using errcode = '42501';
  end if;
  if public.is_privileged() then
    return new;
  end if;
  if new.org_id <> old.org_id or new.phone_e164 <> old.phone_e164 or new.scope <> old.scope
     or new.person_id is distinct from old.person_id or new.source <> old.source
     or new.station_id is distinct from old.station_id or new.text_version <> old.text_version
     or new.consented_at <> old.consented_at then
    raise exception 'a consent record cannot be rewritten' using errcode = '42501';
  end if;
  if old.revoked_at is null and new.revoked_at is not null then
    new.revoked_at := now();
    new.revoked_source := 'admin';   -- only the SMS gateway (service role) records a STOP
  end if;
  return new;
end;
$$;
create trigger trg_contact_consents_protect before insert or update on public.contact_consents
  for each row execute function chms_private.protect_consent();

-- ------------------------------------------------------- scan keys --
create table public.checkin_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  household_id uuid,
  person_id uuid,
  kind text not null check (kind in ('qr', 'barcode', 'keytag')),
  value text not null check (length(value) between 4 and 200),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((household_id is null) <> (person_id is null)),
  foreign key (household_id, org_id) references public.households (id, org_id) on delete cascade,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade,
  unique (org_id, value)
);
alter table public.checkin_keys enable row level security;
create policy "Station users read keys" on public.checkin_keys for select
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.station'))::uuid[]));
create policy "Check-in managers issue keys" on public.checkin_keys for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers revoke keys" on public.checkin_keys for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

-- ------------------------------------------------------ domain events --
-- The platform bus (principle 4). Append-only. Payloads carry ids and the
-- names of changed fields, never values.
create table public.domain_events (
  seq bigint generated always as identity primary key,
  id uuid not null default chms_private.uuidv7() unique,
  org_id uuid not null references public.organizations(id) on delete restrict,
  type text not null check (type ~ '^[a-z_]+\.[a-z_]+$'),
  subject_type text not null check (length(subject_type) between 2 and 40),
  subject_id uuid,
  actor_person_id uuid,
  actor_kind text not null check (actor_kind in ('leader', 'admin', 'station', 'system')),
  station_id uuid,
  device_at timestamptz,
  recorded_at timestamptz not null default now(),
  payload jsonb not null default '{}'
);
create index idx_domain_events_org on public.domain_events (org_id, seq);
create index idx_domain_events_subject on public.domain_events (subject_type, subject_id, seq);
alter table public.domain_events enable row level security;
create policy "Church admins read events" on public.domain_events for select
  using (chms_private.is_church_admin(org_id));
create trigger trg_domain_events_append_only before update or delete on public.domain_events
  for each row execute function chms_private.deny_changes();
create trigger trg_domain_events_no_truncate before truncate on public.domain_events
  for each statement execute function chms_private.deny_changes();

create or replace function chms_private.emit_event(
  p_org_id uuid, p_type text, p_subject_type text, p_subject_id uuid,
  p_payload jsonb default '{}', p_device_at timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_seq bigint;
begin
  select * into a from chms_private.actor_for(p_org_id);
  insert into public.domain_events (org_id, type, subject_type, subject_id, actor_person_id, actor_kind, station_id, device_at, payload)
  values (p_org_id, p_type, p_subject_type, p_subject_id, a.person_id, a.kind, a.station_id, p_device_at, coalesce(p_payload, '{}'))
  returning seq into v_seq;
  perform chms_private.note_actor('domain_events', v_seq, a.person_id);
end;
$$;

-- Field names that changed between two row images, minus bookkeeping columns.
create or replace function chms_private.changed_fields(p_old jsonb, p_new jsonb)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(k order by k), '{}')
  from jsonb_object_keys(p_new) k
  where k not in ('updated_at', 'search_text', 'phone_e164') and p_new -> k is distinct from p_old -> k;
$$;

create or replace function chms_private.people_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changed text[];
begin
  if tg_op = 'INSERT' then
    perform chms_private.emit_event(new.org_id, 'person.created', 'person', new.id,
      jsonb_build_object('guest', 'guest' = any (new.tags)));
  else
    v_changed := chms_private.changed_fields(to_jsonb(old), to_jsonb(new));
    if cardinality(v_changed) = 0 then
      return null;
    end if;
    if old.archived_at is null and new.archived_at is not null then
      perform chms_private.emit_event(new.org_id, 'person.archived', 'person', new.id);
    elsif old.archived_at is not null and new.archived_at is null then
      perform chms_private.emit_event(new.org_id, 'person.restored', 'person', new.id);
    else
      perform chms_private.emit_event(new.org_id, 'person.updated', 'person', new.id, jsonb_build_object('changed', v_changed));
    end if;
  end if;
  return null;
end;
$$;
create trigger trg_people_events after insert or update on public.people
  for each row execute function chms_private.people_events();

create or replace function chms_private.household_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changed text[];
begin
  if tg_op = 'INSERT' then
    perform chms_private.emit_event(new.org_id, 'household.created', 'household', new.id);
  else
    v_changed := chms_private.changed_fields(to_jsonb(old), to_jsonb(new));
    if cardinality(v_changed) > 0 then
      perform chms_private.emit_event(new.org_id, 'household.updated', 'household', new.id, jsonb_build_object('changed', v_changed));
    end if;
  end if;
  return null;
end;
$$;
create trigger trg_household_events after insert or update on public.households
  for each row execute function chms_private.household_events();

create or replace function chms_private.household_member_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform chms_private.emit_event(new.org_id, 'household.member_added', 'household', new.household_id,
      jsonb_build_object('person_id', new.person_id, 'relationship', new.relationship));
  elsif old.ended_at is null and new.ended_at is not null then
    perform chms_private.emit_event(new.org_id, 'household.member_ended', 'household', new.household_id,
      jsonb_build_object('person_id', new.person_id));
  elsif old.ended_at is not null and new.ended_at is null then
    perform chms_private.emit_event(new.org_id, 'household.member_added', 'household', new.household_id,
      jsonb_build_object('person_id', new.person_id, 'relationship', new.relationship));
  elsif new.is_guardian is distinct from old.is_guardian or new.can_check_in is distinct from old.can_check_in
        or new.relationship is distinct from old.relationship then
    perform chms_private.emit_event(new.org_id, 'household.member_updated', 'household', new.household_id,
      jsonb_build_object('person_id', new.person_id, 'changed',
        chms_private.changed_fields(to_jsonb(old), to_jsonb(new))));
  end if;
  return null;
end;
$$;
create trigger trg_household_member_events after insert or update on public.household_members
  for each row execute function chms_private.household_member_events();

create or replace function chms_private.person_role_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform chms_private.emit_event(new.org_id, 'role.granted', 'person', new.person_id, jsonb_build_object('role_id', new.role_id));
    return null;
  end if;
  perform chms_private.emit_event(old.org_id, 'role.removed', 'person', old.person_id, jsonb_build_object('role_id', old.role_id));
  return null;
end;
$$;
create trigger trg_person_role_events after insert or delete on public.person_roles
  for each row execute function chms_private.person_role_events();

-- ------------------------------------------------------------ grants --
revoke execute on function public.get_child_care(uuid), public.set_child_care(uuid, text, text, text, text),
  public.child_care_summary(uuid), public.pickup_status(uuid, uuid)
  from public, anon;
grant execute on function public.get_child_care(uuid), public.set_child_care(uuid, text, text, text, text),
  public.child_care_summary(uuid), public.pickup_status(uuid, uuid)
  to authenticated, service_role;

-- Internal helpers that write or answer without a permission check are not
-- callable by API roles. (Policy helpers such as is_minor, all_permissions
-- and normalize_phone stay callable: policies, the CHECK constraint and the
-- generated column evaluate them as the caller.)
revoke execute on function
  chms_private.emit_event(uuid, text, text, uuid, jsonb, timestamptz), chms_private.actor_for(uuid),
  chms_private.current_station_id(), chms_private.changed_fields(jsonb, jsonb), chms_private.log_access(uuid, text, uuid, int, jsonb),
  chms_private.pickup_status(uuid, uuid), chms_private.credential_status(uuid, date), chms_private.local_today(uuid),
  chms_private.user_permissions(uuid, uuid), chms_private.audit_row(), chms_private.deny_changes(),
  chms_private.people_events(), chms_private.household_events(), chms_private.household_member_events(), chms_private.person_role_events(),
  chms_private.stamp_flag_actor(), chms_private.stamp_pickup_actor(), chms_private.stamp_document_actor(), chms_private.stamp_credential_actor(),
  chms_private.validate_checkin_settings(), chms_private.protect_consent(), chms_private.check_sensitive_subject(),
  chms_private.check_custom_keys(), chms_private.normalize_membership(), chms_private.note_actor(text, bigint, uuid)
  from public, anon, authenticated;
-- Helpers the public site never needs: signed-in users still evaluate them in
-- defaults, the generated phone column and the org_roles CHECK (is_minor stays
-- callable by anon because policies evaluate it as anon too).
revoke execute on function chms_private.uuidv7(), chms_private.normalize_phone(text), chms_private.all_permissions() from public, anon;
grant execute on function chms_private.uuidv7(), chms_private.normalize_phone(text), chms_private.all_permissions() to authenticated, service_role;

-- TRUNCATE skips row triggers and RLS; API roles never get it.
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate on tables from anon, authenticated;
