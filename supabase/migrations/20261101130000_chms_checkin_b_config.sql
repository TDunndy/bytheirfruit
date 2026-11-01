-- ============================================================================
-- CHMS CHECK-IN, MIGRATION B: CONFIGURATION AND STATIONS (plan §3.2, §5)
--
--   areas, rooms       rooms carry typed criteria (chms_private.check_room_criteria)
--   area_leaders, room_leaders   routing targets for cases and alerts
--   schedules → occurrences      constrained recurrence; generate_occurrences()
--                      is DST-safe (local date + local time at the church's zone)
--   room_overrides     sticky per-child room with an optional end date
--   checkin_restrictions         staff-set; the station only ever shows "see staff"
--   volunteer_slots, volunteer_assignments   who is expected where (decision I)
--   printers, label_templates
--   stations           a paired device; chms_private.station_principals maps its
--                      auth user to the station, and my_station() never trusts
--                      the token's claim alone
--   staff PINs         chms_private.staff_pins; set by the holder, verified by a
--                      station, locked after five misses, every use logged
--   station wall       a station token cannot read or write the review site or
--                      the membership tables, cannot claim a church, and gets no
--                      profile row
--
-- Conventions (plan §2) as in migration A: org_id and set-based RLS on every
-- table, person ids never account ids, archive never delete, audit and
-- domain events on every mutable table.
--
-- Guardrail: nothing here joins people to reviews or profiles. The station
-- wall only adds deny rules to the public site's tables.
-- ============================================================================

-- ------------------------------------------------------------ criteria --
-- Room criteria, the same shape the TypeScript core validates:
--   { "match": "all" | "any", "manual_only": bool, "rules": [ rule, ... ] }
--   rule kinds: age_months | age_years | grade | birthdate (ranges: min/max,
--   each bound with its own *_inclusive flag; ages also say measured_on
--   "occurrence" or "cutoff"), gender, tag, custom_field.
-- Grades: -1 = pre-K, 0 = K, 1..12.
create or replace function chms_private.check_room_criteria(p jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  r jsonb;
  k text;
  v_min numeric;
  v_max numeric;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) key where key not in ('match', 'manual_only', 'rules')) then return false; end if;
  if p ? 'match' and (jsonb_typeof(p -> 'match') <> 'string' or (p ->> 'match') not in ('all', 'any')) then return false; end if;
  if p ? 'manual_only' and jsonb_typeof(p -> 'manual_only') <> 'boolean' then return false; end if;
  if not (p ? 'rules') or jsonb_typeof(p -> 'rules') <> 'array' then return false; end if;
  if jsonb_array_length(p -> 'rules') > 20 then return false; end if;
  -- A room with no rules must say so: it is filled by hand.
  if jsonb_array_length(p -> 'rules') = 0 and not coalesce((p ->> 'manual_only')::boolean, false) then return false; end if;

  for r in select * from jsonb_array_elements(p -> 'rules') loop
    if jsonb_typeof(r) <> 'object' then return false; end if;
    k := r ->> 'kind';
    if k in ('age_months', 'age_years', 'grade', 'birthdate') then
      if exists (select 1 from jsonb_object_keys(r) key
                 where key not in ('kind', 'min', 'max', 'min_inclusive', 'max_inclusive', 'measured_on')) then return false; end if;
      if not (r ? 'min' or r ? 'max') then return false; end if;
      -- Every bound states inclusive or exclusive.
      if (r ? 'min') <> (r ? 'min_inclusive') or (r ? 'max') <> (r ? 'max_inclusive') then return false; end if;
      if (r ? 'min_inclusive' and jsonb_typeof(r -> 'min_inclusive') <> 'boolean')
         or (r ? 'max_inclusive' and jsonb_typeof(r -> 'max_inclusive') <> 'boolean') then return false; end if;
      if k = 'birthdate' then
        if r ? 'measured_on' then return false; end if;
        if (r ? 'min' and (jsonb_typeof(r -> 'min') <> 'string' or (r ->> 'min') !~ '^\d{4}-\d{2}-\d{2}$'))
           or (r ? 'max' and (jsonb_typeof(r -> 'max') <> 'string' or (r ->> 'max') !~ '^\d{4}-\d{2}-\d{2}$')) then return false; end if;
        -- each bound must be a real date in a sane window (a bad one raises into the handler below)
        if r ? 'min' and (r ->> 'min')::date not between '1900-01-01' and '2100-12-31' then return false; end if;
        if r ? 'max' and (r ->> 'max')::date not between '1900-01-01' and '2100-12-31' then return false; end if;
        if r ? 'min' and r ? 'max' then
          if (r ->> 'min')::date > (r ->> 'max')::date then return false; end if;
          if (r ->> 'min')::date = (r ->> 'max')::date and not ((r -> 'min_inclusive')::boolean and (r -> 'max_inclusive')::boolean) then return false; end if;
        end if;
      else
        if (r ? 'min' and jsonb_typeof(r -> 'min') <> 'number') or (r ? 'max' and jsonb_typeof(r -> 'max') <> 'number') then return false; end if;
        v_min := (r ->> 'min')::numeric;
        v_max := (r ->> 'max')::numeric;
        if (v_min is not null and v_min <> trunc(v_min)) or (v_max is not null and v_max <> trunc(v_max)) then return false; end if;
        if v_min is not null and v_max is not null then
          if v_min > v_max then return false; end if;
          if v_min = v_max and not ((r -> 'min_inclusive')::boolean and (r -> 'max_inclusive')::boolean) then return false; end if;
        end if;
        if k = 'grade' then
          if r ? 'measured_on' then return false; end if;
          if coalesce(v_min, -1) not between -1 and 12 or coalesce(v_max, 12) not between -1 and 12 then return false; end if;
        else
          if not (r ? 'measured_on') or jsonb_typeof(r -> 'measured_on') <> 'string'
             or (r ->> 'measured_on') not in ('occurrence', 'cutoff') then return false; end if;
          if coalesce(v_min, 0) not between 0 and (case k when 'age_months' then 1500 else 125 end)
             or coalesce(v_max, 0) not between 0 and (case k when 'age_months' then 1500 else 125 end) then return false; end if;
        end if;
      end if;
    elsif k = 'gender' then
      if exists (select 1 from jsonb_object_keys(r) key where key not in ('kind', 'value')) then return false; end if;
      if jsonb_typeof(r -> 'value') <> 'string' or (r ->> 'value') not in ('male', 'female') then return false; end if;
    elsif k = 'tag' then
      if exists (select 1 from jsonb_object_keys(r) key where key not in ('kind', 'value')) then return false; end if;
      if jsonb_typeof(r -> 'value') <> 'string' or length(btrim(r ->> 'value')) not between 1 and 60 then return false; end if;
    elsif k = 'custom_field' then
      if exists (select 1 from jsonb_object_keys(r) key where key not in ('kind', 'key', 'value')) then return false; end if;
      if jsonb_typeof(r -> 'key') <> 'string' or length(btrim(r ->> 'key')) not between 1 and 60 then return false; end if;
      if jsonb_typeof(r -> 'value') not in ('string', 'number', 'boolean') then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;   -- an unparseable date or number is simply invalid
end;
$$;

-- ------------------------------------------------------ areas and rooms --
create table public.areas (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('kids', 'volunteer', 'event', 'group', 'general')),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id)
);
create unique index idx_areas_org_name on public.areas (org_id, lower(name)) where archived_at is null;
alter table public.areas enable row level security;

create table public.rooms (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  capacity smallint check (capacity is null or capacity between 1 and 2000),
  children_per_adult smallint check (children_per_adult is null or children_per_adult between 1 and 50),
  overflow_room_id uuid,
  priority smallint not null default 100,
  criteria jsonb not null default '{"manual_only": true, "rules": []}' check (chms_private.check_room_criteria(criteria)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id),
  check (overflow_room_id is null or overflow_room_id <> id),
  foreign key (area_id, org_id) references public.areas (id, org_id) on delete restrict,
  foreign key (overflow_room_id, org_id) references public.rooms (id, org_id) on delete restrict
);
create unique index idx_rooms_area_name on public.rooms (area_id, lower(name)) where archived_at is null;
create index idx_rooms_area on public.rooms (area_id);
alter table public.rooms enable row level security;

-- Overflow rooms never form a loop (A → B → A).
create or replace function chms_private.check_overflow()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_next uuid := new.overflow_room_id;
  v_steps integer := 0;
begin
  while v_next is not null and v_steps < 20 loop
    if v_next = new.id then
      raise exception 'overflow rooms cannot form a loop' using errcode = '22023';
    end if;
    select overflow_room_id into v_next from public.rooms where id = v_next;
    v_steps := v_steps + 1;
  end loop;
  return new;
end;
$$;
create trigger trg_rooms_overflow before insert or update of overflow_room_id on public.rooms
  for each row execute function chms_private.check_overflow();

-- Leaders: a person or a role, as director or leader of an area or a room.
create table public.area_leaders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid not null,
  person_id uuid,
  role_id uuid,
  kind text not null default 'leader' check (kind in ('director', 'leader')),
  created_at timestamptz not null default now(),
  check ((person_id is null) <> (role_id is null)),
  foreign key (area_id, org_id) references public.areas (id, org_id) on delete cascade,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (role_id, org_id) references public.org_roles (id, org_id) on delete cascade,
  unique (area_id, person_id),
  unique (area_id, role_id)
);
alter table public.area_leaders enable row level security;

create table public.room_leaders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  room_id uuid not null,
  person_id uuid,
  role_id uuid,
  kind text not null default 'leader' check (kind in ('director', 'leader')),
  created_at timestamptz not null default now(),
  check ((person_id is null) <> (role_id is null)),
  foreign key (room_id, org_id) references public.rooms (id, org_id) on delete cascade,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (role_id, org_id) references public.org_roles (id, org_id) on delete cascade,
  unique (room_id, person_id),
  unique (room_id, role_id)
);
alter table public.room_leaders enable row level security;

-- ------------------------------------------------ printers and labels --
create table public.printers (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  model text check (model is null or length(model) <= 80),
  connection text not null default 'wifi' check (connection in ('wifi', 'bluetooth', 'usb', 'system')),
  address text check (address is null or length(address) <= 200),
  stock text not null default 'DK-2205' check (length(stock) between 1 and 40),
  area_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id),
  foreign key (area_id, org_id) references public.areas (id, org_id) on delete restrict
);
alter table public.printers enable row level security;

create table public.label_templates (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('child', 'pickup', 'volunteer')),
  stock text not null default 'DK-2205' check (length(stock) between 1 and 40),
  width_mm smallint not null default 62 check (width_mm between 10 and 300),
  height_mm smallint not null default 29 check (height_mm between 10 and 300),
  layout jsonb not null default '{}' check (jsonb_typeof(layout) = 'object'),
  version integer not null default 1 check (version >= 1),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id)
);
create unique index idx_label_templates_default on public.label_templates (org_id, kind) where is_default and archived_at is null;
alter table public.label_templates enable row level security;

-- ------------------------------------------------------------ stations --
create table public.stations (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  mode text not null check (mode in ('kiosk', 'staffed', 'roster', 'volunteer')),
  printer_id uuid,
  label_stock text check (label_stock is null or length(label_stock) <= 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id),
  foreign key (printer_id, org_id) references public.printers (id, org_id) on delete restrict
);
alter table public.stations enable row level security;

-- Which rooms a station serves: whole areas or single rooms. No rows means
-- every room of the church (a front-desk kiosk).
create table public.station_scopes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null,
  area_id uuid,
  room_id uuid,
  created_at timestamptz not null default now(),
  check ((area_id is null) <> (room_id is null)),
  foreign key (station_id, org_id) references public.stations (id, org_id) on delete cascade,
  foreign key (area_id, org_id) references public.areas (id, org_id) on delete cascade,
  foreign key (room_id, org_id) references public.rooms (id, org_id) on delete cascade,
  unique (station_id, area_id),
  unique (station_id, room_id)
);
alter table public.station_scopes enable row level security;

-- The device's auth user. Lives in chms_private: no church user reads account
-- ids. A station is known only through this row, never through the token.
create table chms_private.station_principals (
  station_id uuid primary key,
  org_id uuid not null,
  user_id uuid not null unique,
  platform text check (platform is null or length(platform) <= 40),
  app_version text check (app_version is null or length(app_version) <= 40),
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  foreign key (station_id, org_id) references public.stations (id, org_id) on delete cascade
);
alter table chms_private.station_principals enable row level security;
revoke all on table chms_private.station_principals from anon, authenticated;

create or replace function chms_private.my_station()
returns uuid language sql stable security definer set search_path = public as $$
  select sp.station_id
  from chms_private.station_principals sp
  join public.stations s on s.id = sp.station_id
  where public.is_station() and sp.user_id = auth.uid() and sp.revoked_at is null
    and s.active and s.archived_at is null
  limit 1;
$$;

create or replace function chms_private.my_station_org()
returns uuid language sql stable security definer set search_path = public as $$
  select s.org_id from public.stations s where s.id = chms_private.my_station();
$$;

-- Migration A read the station id off the token; the pairing table is the
-- only source now.
create or replace function chms_private.current_station_id()
returns uuid language sql stable security definer set search_path = public as $$
  select chms_private.my_station();
$$;

-- Rooms in the calling station's scope (every room of its church when it has
-- no scope rows); empty for anyone who is not a station.
create or replace function chms_private.station_room_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  with st as (select chms_private.my_station() as id, chms_private.my_station_org() as org_id)
  select coalesce(array_agg(r.id), '{}')
  from st, public.rooms r
  join public.areas ar on ar.id = r.area_id and ar.archived_at is null
  where st.id is not null and r.org_id = st.org_id and r.archived_at is null and r.active
    and (not exists (select 1 from public.station_scopes sc where sc.station_id = st.id)
         or r.id in (select sc.room_id from public.station_scopes sc where sc.station_id = st.id and sc.room_id is not null)
         or r.area_id in (select sc.area_id from public.station_scopes sc where sc.station_id = st.id and sc.area_id is not null));
$$;

-- What a station learns about itself at boot: its church's settings and local
-- day too. A paired device that was unpaired, switched off or removed learns
-- only that (status), so it can tell the user why. Null for anyone else.
create or replace function public.station_self()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when chms_private.my_station() is not null then (
      select jsonb_build_object(
        'status', 'active',
        'station_id', s.id, 'org_id', s.org_id, 'org_name', o.name, 'name', s.name, 'mode', s.mode,
        'printer_id', s.printer_id, 'label_stock', s.label_stock,
        'room_ids', to_jsonb(chms_private.station_room_ids()),
        'local_today', chms_private.local_today(s.org_id),
        'settings', (select jsonb_build_object('time_zone', st.time_zone, 'grade_cutoff_month', st.grade_cutoff_month,
                       'grade_cutoff_day', st.grade_cutoff_day, 'promotion_date', st.promotion_date,
                       'punctuality_grace_minutes', st.punctuality_grace_minutes, 'label_defaults', st.label_defaults)
                     from public.org_checkin_settings st where st.org_id = s.org_id))
      from public.stations s
      join public.organizations o on o.id = s.org_id
      where s.id = chms_private.my_station())
    when public.is_station() then (
      select jsonb_build_object('status',
        case when sp.revoked_at is not null then 'unpaired' when s.archived_at is not null then 'removed'
             when not s.active then 'inactive' else 'unknown' end)
      from chms_private.station_principals sp
      join public.stations s on s.id = sp.station_id
      where sp.user_id = auth.uid())
    else null
  end;
$$;

-- ------------------------------------------------- configuration RLS --
-- A station reads its church's settings (time zone, cutoff, grace).
create policy "Stations read their church's check-in settings" on public.org_checkin_settings for select
  using (org_id = (select chms_private.my_station_org()));

-- Members read; check-in managers write; a station reads its own church's
-- configuration and only the rooms in its scope.
create policy "Members and stations read areas" on public.areas for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or org_id = (select chms_private.my_station_org()));
create policy "Check-in managers add areas" on public.areas for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit areas" on public.areas for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

create policy "Members read rooms; stations read their rooms" on public.rooms for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or id = any ((select chms_private.station_room_ids())::uuid[]));
create policy "Check-in managers add rooms" on public.rooms for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit rooms" on public.rooms for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

create policy "Members read area leaders" on public.area_leaders for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]));
create policy "Check-in managers add area leaders" on public.area_leaders for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers remove area leaders" on public.area_leaders for delete
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers change area leaders" on public.area_leaders for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Members read room leaders" on public.room_leaders for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]));
create policy "Check-in managers add room leaders" on public.room_leaders for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers remove room leaders" on public.room_leaders for delete
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers change room leaders" on public.room_leaders for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

-- Only a leader's kind changes; who and where are pinned.
create or replace function chms_private.pin_leader()
returns trigger language plpgsql set search_path = public as $$
begin
  new.org_id := old.org_id;
  new.person_id := old.person_id;
  new.role_id := old.role_id;
  if tg_table_name = 'area_leaders' then new.area_id := old.area_id; else new.room_id := old.room_id; end if;
  return new;
end;
$$;
create trigger trg_area_leaders_pin before update on public.area_leaders for each row execute function chms_private.pin_leader();
create trigger trg_room_leaders_pin before update on public.room_leaders for each row execute function chms_private.pin_leader();

create policy "Members and stations read printers" on public.printers for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or org_id = (select chms_private.my_station_org()));
create policy "Check-in managers add printers" on public.printers for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit printers" on public.printers for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

create policy "Members and stations read label templates" on public.label_templates for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or org_id = (select chms_private.my_station_org()));
create policy "Check-in managers add label templates" on public.label_templates for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit label templates" on public.label_templates for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

create policy "Members read stations; a station reads itself" on public.stations for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or id = (select chms_private.my_station()));
create policy "Check-in managers add stations" on public.stations for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit stations" on public.stations for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

create policy "Members read station scopes; a station reads its own" on public.station_scopes for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or station_id = (select chms_private.my_station()));
create policy "Check-in managers add station scopes" on public.station_scopes for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers remove station scopes" on public.station_scopes for delete
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

-- ------------------------------------------------------- schedules --
-- Constrained recurrence: weekday list, every N weeks from starts_on, until,
-- excluded dates. Local times only; the church's time zone turns them into
-- instants when occurrences are generated.
create table public.schedules (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null default 'service' check (kind in ('service', 'class', 'event', 'group', 'other')),
  local_time time not null,
  duration_minutes smallint not null default 90 check (duration_minutes between 5 and 1440),
  weekdays smallint[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  interval_weeks smallint not null default 1 check (interval_weeks between 1 and 52),
  starts_on date not null,
  until date check (until is null or until >= starts_on),
  exdates date[] not null default '{}' check (cardinality(exdates) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id)
);
alter table public.schedules enable row level security;

create table public.schedule_rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  schedule_id uuid not null,
  room_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (schedule_id, org_id) references public.schedules (id, org_id) on delete cascade,
  foreign key (room_id, org_id) references public.rooms (id, org_id) on delete restrict,
  unique (schedule_id, room_id)
);
alter table public.schedule_rooms enable row level security;

create table public.occurrences (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  schedule_id uuid not null,
  local_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'closed', 'cancelled')),
  generated boolean not null default false,       -- made by generate_occurrences (schedule edits may move or cancel it)
  rule_cancelled boolean not null default false,  -- cancelled by the schedule's rules, so the rules may revive it
  opened_at timestamptz,
  closed_at timestamptz,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, local_date),
  unique (id, org_id),
  foreign key (schedule_id, org_id) references public.schedules (id, org_id) on delete restrict
);
create index idx_occurrences_org_date on public.occurrences (org_id, local_date);
alter table public.occurrences enable row level security;

-- API edits change status, times and the note; the system columns are pinned
-- and a manual cancel is never a rule cancel.
create or replace function chms_private.protect_occurrence()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.is_privileged() then
    new.schedule_id := old.schedule_id;
    new.local_date := old.local_date;
    new.generated := old.generated;
    new.opened_at := old.opened_at;
    new.closed_at := old.closed_at;
    new.rule_cancelled := false;
  end if;
  return new;
end;
$$;
create trigger trg_occurrences_protect before update on public.occurrences
  for each row execute function chms_private.protect_occurrence();

-- Does a schedule run on a date? Weeks count from the week of the first date
-- it runs on or after starts_on, so a biweekly schedule never skips its first
-- Sunday because starts_on was a Wednesday.
create or replace function chms_private.schedule_anchor(s public.schedules)
returns date language sql immutable set search_path = public as $$
  select f - extract(dow from f)::int
  from (select min(s.starts_on + ((w - extract(dow from s.starts_on)::int + 7) % 7)) as f from unnest(s.weekdays) w) x;
$$;
create or replace function chms_private.schedule_runs_on(s public.schedules, d date)
returns boolean language sql immutable set search_path = public as $$
  select s.active and s.archived_at is null
     and d >= s.starts_on and (s.until is null or d <= s.until)
     and extract(dow from d)::smallint = any (s.weekdays)
     and not (d = any (s.exdates))
     and (((d - chms_private.schedule_anchor(s)) / 7) % s.interval_weeks) = 0;
$$;

-- A schedule needs the church's time zone before any occurrence can exist.
create or replace function chms_private.require_time_zone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.org_checkin_settings where org_id = new.org_id) then
    raise exception 'set the church time zone in check-in settings first' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger trg_schedules_time_zone before insert on public.schedules
  for each row execute function chms_private.require_time_zone();

-- Local dates → instants. `(date + time) at time zone tz` follows the zone's
-- DST rules for each date, so a 9:00 service is 9:00 all year.
create or replace function public.generate_occurrences(p_org_id uuid, p_through date, p_from date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
  v_from date;
  v_n integer;
begin
  -- Church managers, the nightly job (no session) and the service role; never
  -- a station or an anonymous caller.
  if public.is_station() or (auth.uid() is null and current_user in ('anon', 'authenticated'))
     or (auth.uid() is not null and not public.has_org_permission(p_org_id, 'checkin.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select time_zone into v_tz from public.org_checkin_settings where org_id = p_org_id;
  if v_tz is null then
    raise exception 'set the church time zone in check-in settings first' using errcode = '22023';
  end if;
  v_from := coalesce(p_from, chms_private.local_today(p_org_id));
  if p_through is null or p_through < v_from or p_through > v_from + 366 then
    raise exception 'the through date must fall within a year of the start' using errcode = '22023';
  end if;

  with days as (
    select s.id as schedule_id, d::date as local_date, s.local_time, s.duration_minutes
    from public.schedules s
    cross join lateral generate_series(greatest(s.starts_on, v_from)::timestamp,
                                       least(coalesce(s.until, p_through), p_through)::timestamp, interval '1 day') d
    where s.org_id = p_org_id and chms_private.schedule_runs_on(s, d::date)
  )
  insert into public.occurrences (org_id, schedule_id, local_date, starts_at, ends_at, generated)
  select p_org_id, schedule_id, local_date,
         (local_date + local_time) at time zone v_tz,
         ((local_date + local_time) at time zone v_tz) + make_interval(mins => duration_minutes),
         true
  from days
  -- a date the rules had cancelled comes back; a manual cancel stays
  on conflict (schedule_id, local_date) do update set status = 'scheduled', rule_cancelled = false
    where public.occurrences.status = 'cancelled' and public.occurrences.rule_cancelled and public.occurrences.opened_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Nightly: eight weeks ahead for every church with a time zone (pg_cron).
create or replace function chms_private.generate_all_occurrences()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  for v_org in select org_id from public.org_checkin_settings loop
    perform public.generate_occurrences(v_org, chms_private.local_today(v_org) + 56);
  end loop;
end;
$$;

-- Editing a schedule moves its generated future occurrences that nobody has
-- used yet, cancels the ones its rules no longer produce and revives the ones
-- they produce again. Manual occurrences and manual cancels are left alone.
create or replace function chms_private.schedule_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
begin
  select time_zone into v_tz from public.org_checkin_settings where org_id = new.org_id;
  update public.occurrences o
    set starts_at = (o.local_date + new.local_time) at time zone v_tz,
        ends_at = ((o.local_date + new.local_time) at time zone v_tz) + make_interval(mins => new.duration_minutes),
        status = case when chms_private.schedule_runs_on(new, o.local_date) then 'scheduled' else 'cancelled' end,
        rule_cancelled = not chms_private.schedule_runs_on(new, o.local_date)
  where o.schedule_id = new.id and o.generated and o.opened_at is null
    and o.local_date >= chms_private.local_today(new.org_id)
    and (o.status = 'scheduled' or (o.status = 'cancelled' and o.rule_cancelled));
  return null;
end;
$$;

-- A new time zone moves every generated, unused future occurrence with it.
create or replace function chms_private.settings_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.time_zone is distinct from old.time_zone then
    update public.occurrences o
      set starts_at = (o.local_date + s.local_time) at time zone new.time_zone,
          ends_at = ((o.local_date + s.local_time) at time zone new.time_zone) + make_interval(mins => s.duration_minutes)
    from public.schedules s
    where s.id = o.schedule_id and o.org_id = new.org_id and o.generated and o.opened_at is null
      and o.local_date >= chms_private.local_today(new.org_id);
  end if;
  return null;
end;
$$;
create trigger trg_checkin_settings_changed after update of time_zone on public.org_checkin_settings
  for each row execute function chms_private.settings_changed();
create trigger trg_audit_checkin_settings after insert or update or delete on public.org_checkin_settings
  for each row execute function chms_private.audit_row();
create trigger trg_schedules_changed after update of local_time, duration_minutes, weekdays, interval_weeks, starts_on, until, exdates, active, archived_at
  on public.schedules for each row execute function chms_private.schedule_changed();

create policy "Members and stations read schedules" on public.schedules for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or org_id = (select chms_private.my_station_org()));
create policy "Check-in managers add schedules" on public.schedules for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit schedules" on public.schedules for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

create policy "Members read schedule rooms; stations read theirs" on public.schedule_rooms for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or room_id = any ((select chms_private.station_room_ids())::uuid[]));
create policy "Check-in managers add schedule rooms" on public.schedule_rooms for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers remove schedule rooms" on public.schedule_rooms for delete
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

create policy "Members and stations read occurrences" on public.occurrences for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or org_id = (select chms_private.my_station_org()));
create policy "Check-in managers add occurrences" on public.occurrences for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit occurrences" on public.occurrences for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

-- ---------------------------------------- overrides and restrictions --
create table public.room_overrides (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null,
  room_id uuid not null,
  ends_on date,
  note text check (note is null or length(note) <= 500),
  set_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (room_id, org_id) references public.rooms (id, org_id) on delete restrict,
  foreign key (set_by_person_id, org_id) references public.people (id, org_id) on delete set null (set_by_person_id)
);
create unique index idx_room_overrides_active on public.room_overrides (person_id) where archived_at is null;
alter table public.room_overrides enable row level security;
create policy "Kids viewers and check-in managers read room overrides" on public.room_overrides for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers add room overrides" on public.room_overrides for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit room overrides" on public.room_overrides for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

-- Staff-set only (spec §10). A station never sees the reason, only the kind.
create table public.checkin_restrictions (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null,
  kind text not null check (kind in ('no_checkin', 'see_staff')),
  note text check (note is null or length(note) <= 1000),
  starts_on date,
  ends_on date check (ends_on is null or starts_on is null or ends_on >= starts_on),
  set_by_person_id uuid,
  cleared_at timestamptz,
  cleared_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (set_by_person_id, org_id) references public.people (id, org_id) on delete set null (set_by_person_id),
  foreign key (cleared_by_person_id, org_id) references public.people (id, org_id) on delete set null (cleared_by_person_id)
);
create index idx_checkin_restrictions_person on public.checkin_restrictions (person_id) where cleared_at is null;
alter table public.checkin_restrictions enable row level security;
create policy "Care, custody and check-in managers read restrictions" on public.checkin_restrictions for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]));

-- The live override for a child, if any (archived or ended ones do not count).
create or replace function chms_private.active_room_override(p_person_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select o.room_id from public.room_overrides o
  where o.person_id = p_person_id and o.archived_at is null
    and (o.ends_on is null or o.ends_on >= chms_private.local_today(o.org_id))
  order by o.created_at desc limit 1;
$$;
create policy "Check-in and custody managers add restrictions" on public.checkin_restrictions for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
           or org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]));
create policy "Check-in and custody managers edit restrictions" on public.checkin_restrictions for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
           or org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]));

-- The kind of restriction in force today for a person, or null.
create or replace function chms_private.active_restriction(p_person_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select r.kind
  from public.checkin_restrictions r
  where r.person_id = p_person_id and r.cleared_at is null
    and (r.starts_on is null or r.starts_on <= chms_private.local_today(r.org_id))
    and (r.ends_on is null or r.ends_on >= chms_private.local_today(r.org_id))
  order by case r.kind when 'no_checkin' then 0 else 1 end
  limit 1;
$$;

-- ------------------------------------------------ volunteer scheduling --
create table public.volunteer_slots (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  schedule_id uuid,
  occurrence_id uuid,
  room_id uuid,
  role_id uuid,
  label text check (label is null or length(label) <= 80),
  needed smallint not null default 1 check (needed between 1 and 100),
  arrive_minutes_before smallint not null default 15 check (arrive_minutes_before between 0 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, org_id),
  check ((schedule_id is null) <> (occurrence_id is null)),
  check (room_id is null or role_id is null),
  foreign key (schedule_id, org_id) references public.schedules (id, org_id) on delete cascade,
  foreign key (occurrence_id, org_id) references public.occurrences (id, org_id) on delete cascade,
  foreign key (room_id, org_id) references public.rooms (id, org_id) on delete restrict,
  foreign key (role_id, org_id) references public.org_roles (id, org_id) on delete cascade
);
alter table public.volunteer_slots enable row level security;

create table public.volunteer_assignments (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  slot_id uuid not null,
  person_id uuid not null,
  local_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'declined')),
  note text check (note is null or length(note) <= 300),
  set_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (slot_id, org_id) references public.volunteer_slots (id, org_id) on delete cascade,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (set_by_person_id, org_id) references public.people (id, org_id) on delete set null (set_by_person_id),
  unique (slot_id, person_id, local_date)
);
create index idx_volunteer_assignments_date on public.volunteer_assignments (org_id, local_date);
alter table public.volunteer_assignments enable row level security;

-- An assignment to a single-occurrence slot is for that occurrence's date.
create or replace function chms_private.check_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_date date;
  v_schedule uuid;
begin
  select o.local_date, s.schedule_id into v_date, v_schedule
  from public.volunteer_slots s left join public.occurrences o on o.id = s.occurrence_id
  where s.id = new.slot_id;
  if v_date is not null and v_date <> new.local_date then
    raise exception 'the assignment date must match the occurrence' using errcode = '22023';
  end if;
  if v_date is null and not exists (select 1 from public.occurrences o
                                    where o.schedule_id = v_schedule and o.local_date = new.local_date and o.status <> 'cancelled') then
    raise exception 'no service runs on that date' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger trg_volunteer_assignments_check before insert or update on public.volunteer_assignments
  for each row execute function chms_private.check_assignment();

create policy "Members read volunteer slots" on public.volunteer_slots for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or org_id = (select chms_private.my_station_org()));
create policy "Check-in managers add volunteer slots" on public.volunteer_slots for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit volunteer slots" on public.volunteer_slots for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

-- Assignments carry person ids only; names need people.view as usual. The
-- volunteer station lists today's assignments by id.
create policy "Members and stations read volunteer assignments" on public.volunteer_assignments for select
  using (org_id = any ((select chms_private.my_orgs())::uuid[]) or org_id = (select chms_private.my_station_org()));
create policy "Check-in managers add volunteer assignments" on public.volunteer_assignments for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit volunteer assignments" on public.volunteer_assignments for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

-- --------------------------------------------- actor stamps (pinned) --
-- set_by / cleared_by are always the caller's own person record; a client
-- cannot name someone else, and the value never changes afterwards.
create or replace function chms_private.stamp_set_by()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  select * into a from chms_private.actor_for(new.org_id);
  if tg_op = 'INSERT' then
    new.set_by_person_id := a.person_id;
    new.created_at := now();
  else
    new.org_id := old.org_id;
    new.created_at := old.created_at;
    new.set_by_person_id := case when tg_table_name = 'attendance_baselines' then a.person_id else old.set_by_person_id end;
  end if;
  if tg_table_name = 'checkin_restrictions' then
    if tg_op = 'INSERT' then
      new.starts_on := coalesce(new.starts_on, chms_private.local_today(new.org_id));
      new.cleared_at := null;
      new.cleared_by_person_id := null;
    else
      -- the subject, the kind and the start never change
      new.person_id := old.person_id;
      new.kind := old.kind;
      new.starts_on := old.starts_on;
      if old.cleared_at is not null then
        -- clearing is final: a cleared restriction is history (its note may still be corrected)
        if new.ends_on is distinct from old.ends_on then
          raise exception 'a cleared restriction cannot be changed' using errcode = '42501';
        end if;
        new.cleared_at := old.cleared_at;
        new.cleared_by_person_id := old.cleared_by_person_id;
      elsif new.cleared_at is not null then
        new.cleared_at := now();
        new.cleared_by_person_id := a.person_id;
      else
        new.cleared_by_person_id := null;
      end if;
    end if;
  elsif tg_table_name = 'room_overrides' then
    if tg_op = 'INSERT' then
      -- an override whose end has passed makes way for the next one
      update public.room_overrides set archived_at = now()
        where person_id = new.person_id and archived_at is null
          and ends_on is not null and ends_on < chms_private.local_today(new.org_id);
    else
      new.person_id := old.person_id;
    end if;
  elsif tg_table_name = 'volunteer_assignments' and tg_op = 'UPDATE' then
    new.person_id := old.person_id;
  end if;
  return new;
end;
$$;
create trigger trg_room_overrides_actor before insert or update on public.room_overrides
  for each row execute function chms_private.stamp_set_by();
create trigger trg_checkin_restrictions_actor before insert or update on public.checkin_restrictions
  for each row execute function chms_private.stamp_set_by();
create trigger trg_volunteer_assignments_actor before insert or update on public.volunteer_assignments
  for each row execute function chms_private.stamp_set_by();

-- ------------------------------------------------------- staff PINs --
-- A PIN belongs to a person who may run a station. A station verifies it
-- against the server (the per-station offline verifier arrives with sync in
-- 1b); five misses lock the PIN for fifteen minutes; every use is logged.
create table chms_private.staff_pins (
  person_id uuid primary key,
  org_id uuid not null,
  pin_hash text not null,
  set_at timestamptz not null default now(),
  failed_count smallint not null default 0,
  locked_until timestamptz,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete cascade
);
alter table chms_private.staff_pins enable row level security;
revoke all on table chms_private.staff_pins from anon, authenticated;

create or replace function public.set_my_staff_pin(p_org_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_person uuid;
begin
  if auth.uid() is null or public.is_station() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if not (public.has_org_permission(p_org_id, 'checkin.station') or public.has_org_permission(p_org_id, 'checkin.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_person := chms_private.my_person_id(p_org_id);
  if v_person is null then
    raise exception 'your login is not linked to a person at this church' using errcode = '42501';
  end if;
  if p_pin !~ '^\d{4,8}$' or p_pin ~ '^(\d)\1+$'
     or position(p_pin in '0123456789') > 0 or position(p_pin in '9876543210') > 0 then
    raise exception 'choose 4 to 8 digits that are not all the same or in sequence' using errcode = '22023';
  end if;
  insert into chms_private.staff_pins (person_id, org_id, pin_hash)
  values (v_person, p_org_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (person_id) do update
    set pin_hash = excluded.pin_hash, set_at = now(), failed_count = 0, locked_until = null;
  perform chms_private.log_access(p_org_id, 'staff_pin.set', v_person, 1, '{}'::jsonb);
end;
$$;

-- Who a station may offer in its staff picker: people of its church with a
-- PIN who still hold a check-in permission. First name and last initial only.
create or replace function public.station_staff()
returns table (person_id uuid, display_name text) language sql stable security definer set search_path = public as $$
  select p.id, p.first_name || case when coalesce(p.last_name, '') = '' then '' else ' ' || left(p.last_name, 1) || '.' end
  from chms_private.staff_pins sp
  join public.people p on p.id = sp.person_id and p.archived_at is null
  where sp.org_id = chms_private.my_station_org()
    and (chms_private.person_is_church_admin(p.id)
         or chms_private.person_role_permissions(p.id) && array['checkin.station', 'checkin.manage'])
  order by p.first_name, p.last_name;
$$;

create or replace function public.verify_staff_pin(p_person_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_org uuid := chms_private.my_station_org();
  v_row chms_private.staff_pins%rowtype;
  v_ok boolean := false;
  v_perms text[];
  v_fails smallint;
  v_subject uuid;
begin
  if v_org is null then
    raise exception 'stations only' using errcode = '42501';
  end if;
  -- the subject is logged only when it is one of this church's people
  select p.id into v_subject from public.people p where p.id = p_person_id and p.org_id = v_org and p.archived_at is null;
  select * into v_row from chms_private.staff_pins where person_id = p_person_id and org_id = v_org for update;
  if v_subject is null or not found then
    perform chms_private.log_access(v_org, 'staff_pin.verify', v_subject, 1, jsonb_build_object('ok', false, 'reason', 'unknown'));
    return jsonb_build_object('ok', false, 'error', 'PIN not accepted.');
  end if;
  if v_row.locked_until is not null and v_row.locked_until > now() then
    perform chms_private.log_access(v_org, 'staff_pin.verify', p_person_id, 1, jsonb_build_object('ok', false, 'reason', 'locked'));
    return jsonb_build_object('ok', false, 'error', 'Too many tries. Try again in a few minutes.', 'locked_until', v_row.locked_until);
  end if;
  v_ok := p_pin ~ '^\d{4,8}$' and extensions.crypt(p_pin, v_row.pin_hash) = v_row.pin_hash;
  if v_ok then
    v_perms := case when chms_private.person_is_church_admin(p_person_id) then chms_private.all_permissions()
                    else chms_private.person_role_permissions(p_person_id) end;
    -- a PIN outlives a role; the permission does not
    if not (v_perms && array['checkin.station', 'checkin.manage']) then
      perform chms_private.log_access(v_org, 'staff_pin.verify', p_person_id, 1, jsonb_build_object('ok', false, 'reason', 'no_permission'));
      return jsonb_build_object('ok', false, 'error', 'PIN not accepted.');
    end if;
    update chms_private.staff_pins set failed_count = 0, locked_until = null where person_id = p_person_id;
    perform chms_private.log_access(v_org, 'staff_pin.verify', p_person_id, 1, jsonb_build_object('ok', true));
    return jsonb_build_object('ok', true, 'person_id', p_person_id,
      'permissions', to_jsonb(array(select x from unnest(v_perms) x
                                    where x in ('checkin.station', 'checkin.manage', 'kids.view', 'kids.care', 'custody.manage'))));
  end if;
  -- an expired lock starts a fresh window of five tries
  v_fails := case when v_row.locked_until is not null then 1 else v_row.failed_count + 1 end;
  update chms_private.staff_pins
    set failed_count = v_fails,
        locked_until = case when v_fails >= 5 then now() + interval '15 minutes' else null end
    where person_id = p_person_id;
  perform chms_private.log_access(v_org, 'staff_pin.verify', p_person_id, 1, jsonb_build_object('ok', false, 'reason', 'mismatch'));
  return jsonb_build_object('ok', false, 'error', 'PIN not accepted.');
end;
$$;

-- --------------------------------------------------------- station wall --
-- A station token is an authenticated session, so every rule that only says
-- "signed in" would let it through. It gets no profile, cannot touch the
-- review site or the membership tables, and cannot claim a church.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'kind', '') = 'station' then
    return new;   -- paired devices are not people
  end if;
  insert into public.profiles (id, display_name, provider, phone, address, zip_code, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_app_meta_data->>'provider', 'email'),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'address', ''),
    nullif(new.raw_user_meta_data->>'zip_code', ''),
    new.email
  );
  return new;
end;
$$;

-- GoTrue inserts the auth row before some flows write app_metadata: a profile
-- made for a user that later turns out to be a station is dropped.
create or replace function public.drop_station_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'kind', '') = 'station' then
    delete from public.profiles where id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.drop_station_profile() from public, anon, authenticated;
drop trigger if exists on_auth_user_station on auth.users;
create trigger on_auth_user_station after update of raw_app_meta_data on auth.users
  for each row execute function public.drop_station_profile();

-- Membership is never derived for a station token, whatever org_members holds.
create or replace function chms_private.my_orgs()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(org_id), '{}') from public.org_members where user_id = auth.uid() and not public.is_station();
$$;
create or replace function chms_private.my_person_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(pl.person_id), '{}')
  from public.person_logins pl
  join public.people p on p.id = pl.person_id and p.archived_at is null
  join public.org_members m on m.org_id = pl.org_id and m.user_id = pl.user_id
  where pl.user_id = auth.uid() and not public.is_station();
$$;
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
  ) s
  where not public.is_station();
$$;
create or replace function chms_private.user_permissions(p_org_id uuid, p_user_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when p_user_id is null or public.is_station() then '{}'::text[]
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
create or replace function public.is_org_member(p_org_id uuid, p_min_role text default 'volunteer')
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_station() and exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
      and public.org_role_rank(m.role) >= public.org_role_rank(p_min_role)
  );
$$;

-- Holds inside SECURITY DEFINER functions too, where row policies do not.
create or replace function chms_private.deny_station_writes()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.is_station() then
    raise exception 'a station cannot change %', tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'reviews', 'review_photos', 'review_likes', 'review_flags', 'review_locations',
    'church_claims', 'claim_requests', 'churches', 'church_responses', 'church_reports', 'abuse_reports',
    'favorites', 'profiles', 'newsletter_subscribers', 'payments', 'subscriptions',
    'organizations', 'org_members', 'org_invitations', 'person_logins', 'org_roles', 'person_roles', 'person_overseers']
  loop
    execute format('create policy "Stations are walled off" on public.%I as restrictive for all using (not public.is_station()) with check (not public.is_station())', t);
    execute format('create trigger trg_station_wall before insert or update or delete on public.%I for each row execute function chms_private.deny_station_writes()', t);
  end loop;
end $$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute $p$create policy "Stations never write storage" on storage.objects as restrictive for insert with check (not public.is_station())$p$;
    execute $p$create policy "Stations never update storage" on storage.objects as restrictive for update using (not public.is_station())$p$;
    execute $p$create policy "Stations never delete storage" on storage.objects as restrictive for delete using (not public.is_station())$p$;
  end if;
end $$;

-- verify_claim_code: same body as 20261031041359, plus the station guard.
create or replace function public.verify_claim_code(p_church_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.church_claims%rowtype;
  v_hash text;
begin
  if v_uid is null or public.is_station() then
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

-- ------------------------------------------- audit, events, touch --
create or replace function chms_private.config_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_subject text := tg_argv[0];
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_type text;
  v_payload jsonb := '{}';
begin
  if tg_op = 'INSERT' then
    v_type := v_subject || '.created';
  elsif (v_new ? 'archived_at') and v_new ->> 'archived_at' is not null and v_old ->> 'archived_at' is null then
    v_type := v_subject || '.archived';
  elsif (v_new ? 'status') and v_new ->> 'status' is distinct from v_old ->> 'status' then
    v_type := v_subject || '.' || (v_new ->> 'status');
  elsif (v_new ? 'cleared_at') and v_new ->> 'cleared_at' is not null and v_old ->> 'cleared_at' is null then
    v_type := v_subject || '.cleared';
  else
    v_payload := jsonb_build_object('fields', to_jsonb(chms_private.changed_fields(v_old, v_new)));
    if v_payload -> 'fields' = '[]'::jsonb then return null; end if;
    v_type := v_subject || '.updated';
  end if;
  perform chms_private.emit_event(new.org_id, v_type, v_subject, new.id, v_payload);
  return null;
end;
$$;

do $$
declare
  t record;
  v_tbl text;
begin
  for t in select * from (values
      ('areas', 'area'), ('rooms', 'room'), ('schedules', 'schedule'), ('occurrences', 'occurrence'),
      ('stations', 'station'), ('printers', 'printer'), ('label_templates', 'label_template'),
      ('room_overrides', 'room_override'), ('checkin_restrictions', 'checkin_restriction'),
      ('volunteer_slots', 'volunteer_slot'), ('volunteer_assignments', 'volunteer_assignment')) v(tbl, subject)
  loop
    execute format('create trigger trg_%s_events after insert or update on public.%I for each row execute function chms_private.config_events(%L)', t.tbl, t.tbl, t.subject);
    execute format('create trigger trg_%s_touch before update on public.%I for each row execute function public.chms_touch()', t.tbl, t.tbl);
    execute format('create trigger trg_audit_%s after insert or update or delete on public.%I for each row execute function chms_private.audit_row()', t.tbl, t.tbl);
  end loop;
  foreach v_tbl in array array['area_leaders', 'room_leaders', 'schedule_rooms', 'station_scopes'] loop
    execute format('create trigger trg_audit_%s after insert or update or delete on public.%I for each row execute function chms_private.audit_row()', v_tbl, v_tbl);
  end loop;
end $$;

-- The audit of configuration follows checkin.manage; overrides follow
-- kids.view and restrictions kids.care (policies are OR-ed with migration A's).
create policy "Configuration audit follows check-in permissions" on public.chms_audit for select
  using (
    (table_name in ('areas', 'rooms', 'area_leaders', 'room_leaders', 'schedules', 'schedule_rooms', 'occurrences',
                    'printers', 'label_templates', 'stations', 'station_scopes', 'volunteer_slots', 'volunteer_assignments')
       and org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
    or (table_name = 'room_overrides' and org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[]))
    or (table_name = 'org_checkin_settings' and org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
    or (table_name = 'checkin_restrictions' and (org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[])
                                                 or org_id = any ((select chms_private.orgs_with_permission('custody.manage'))::uuid[]))));

-- ------------------------------------------------------------ grants --
revoke execute on function
  public.generate_occurrences(uuid, date, date), public.set_my_staff_pin(uuid, text), public.station_staff(),
  public.verify_staff_pin(uuid, text), public.station_self()
  from public, anon;
grant execute on function
  public.generate_occurrences(uuid, date, date), public.set_my_staff_pin(uuid, text), public.station_staff(),
  public.verify_staff_pin(uuid, text), public.station_self()
  to authenticated, service_role;

-- Policy helpers (my_station, my_station_org, station_room_ids,
-- check_room_criteria) are evaluated as the caller and stay callable.
revoke execute on function
  chms_private.generate_all_occurrences(), chms_private.schedule_changed(), chms_private.settings_changed(), chms_private.require_time_zone(),
  chms_private.config_events(), chms_private.stamp_set_by(), chms_private.check_assignment(), chms_private.check_overflow(),
  chms_private.pin_leader(), chms_private.protect_occurrence(), chms_private.deny_station_writes(),
  chms_private.active_restriction(uuid), chms_private.active_room_override(uuid)
  from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ------------------------------------------------------------- cron --
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $x$
      select cron.schedule('chms-generate-occurrences', '20 4 * * *', $job$select chms_private.generate_all_occurrences()$job$)
      where not exists (select 1 from cron.job where jobname = 'chms-generate-occurrences')
    $x$;
  end if;
end $$;
