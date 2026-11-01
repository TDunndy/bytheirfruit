-- ============================================================================
-- CHMS CHECK-IN, MIGRATION C: THE ATTENDANCE CORE (plan §3.3, §5)
--
--   checkin_sessions    one family pass at one station, covering several
--                       children and both services
--   security_codes      unique per church per day; blocks are allocated to
--                       stations ahead of time (allocate_codes)
--   attendance_events   the append-only log: check_in, move, check_out, void,
--                       label events; client UUIDv7 ids, device time + offset
--   attendance          the projection, one row per (occurrence, person),
--                       recomputed by folding every event for that key
--   room_stays          a view of who was in which room when
--   station_alerts      restricted pickup/check-in, credential block, ...
--   attendance_baselines   each family's year-to-date count typed in from the
--                       old system (decision A)
--   ingest(commands)    the one write path for stations and admins: every
--                       command runs in its own savepoint and answers
--                       accepted / duplicate / rejected(reason)
--   roster(occurrence, room)   first name + last initial, flags, code status
--
-- Conventions (plan §2) as in A and B. Events carry ids and codes, never
-- names or free text (pickup names go in a side table). Writes go through
-- ingest(); the API has no insert policy on any log table.
--
-- Guardrail: nothing here joins people to reviews or profiles.
-- ============================================================================

-- ---------------------------------------------------------- helpers --
-- The instant an event happened, in server time.
create or replace function chms_private.effective_at(p_device_at timestamptz, p_offset_ms integer)
returns timestamptz language sql immutable set search_path = public as $$
  select p_device_at + make_interval(secs => coalesce(p_offset_ms, 0) / 1000.0);
$$;

-- Rooms the caller leads through room_leaders (by person or by role).
create or replace function chms_private.my_led_room_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct rl.room_id), '{}')
  from public.room_leaders rl
  where rl.person_id = any (chms_private.my_person_ids())
     or rl.role_id in (select pr.role_id from public.person_roles pr where pr.person_id = any (chms_private.my_person_ids()));
$$;

-- May the caller see a room's roster? Managers and kids viewers see every
-- room of their church; a station sees its scope; a leader sees their rooms.
create or replace function chms_private.can_see_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rooms r
    where r.id = p_room_id
      and (r.org_id = any (chms_private.orgs_with_permission('checkin.manage'))
           or r.org_id = any (chms_private.orgs_with_permission('kids.view'))
           or r.id = any (chms_private.station_room_ids())
           or r.id = any (chms_private.my_led_room_ids())));
$$;

alter table public.pickup_people add constraint pickup_people_id_org_id_key unique (id, org_id);

-- ---------------------------------------------------------- sessions --
create table public.checkin_sessions (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  local_date date not null,
  household_id uuid,
  guardian_person_id uuid,
  station_id uuid,
  lookup_method text check (lookup_method is null or lookup_method in ('phone', 'last4', 'name', 'scan', 'pickup_code', 'manual')),
  lookup_last4 text check (lookup_last4 is null or lookup_last4 ~ '^\d{4}$'),
  queued_offline boolean not null default false,
  device_at timestamptz,
  clock_offset_ms integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  recorded_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (household_id, org_id) references public.households (id, org_id) on delete restrict,
  foreign key (guardian_person_id, org_id) references public.people (id, org_id) on delete restrict,
  foreign key (station_id, org_id) references public.stations (id, org_id) on delete restrict
);
create index idx_checkin_sessions_org_date on public.checkin_sessions (org_id, local_date);
create index idx_checkin_sessions_household on public.checkin_sessions (household_id);
alter table public.checkin_sessions enable row level security;

-- A session is written once; only completed_at is set later, once.
create or replace function chms_private.protect_session()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.completed_at is not null or to_jsonb(new) - 'completed_at' <> to_jsonb(old) - 'completed_at' then
    raise exception 'a check-in session is written once' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_checkin_sessions_protect before update on public.checkin_sessions
  for each row execute function chms_private.protect_session();
create trigger trg_checkin_sessions_no_delete before delete on public.checkin_sessions
  for each row execute function chms_private.deny_changes();
create trigger trg_checkin_sessions_no_truncate before truncate on public.checkin_sessions
  for each statement execute function chms_private.deny_changes();

-- ---------------------------------------------------- security codes --
create table public.security_codes (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  local_date date not null,
  code text not null check (code ~ '^[ACDEFHJKMNPRTUVWXY34679]{3,4}$'),
  station_id uuid,
  allocated_at timestamptz not null default now(),
  session_id uuid,
  issued_at timestamptz,
  unique (org_id, local_date, code),
  foreign key (station_id, org_id) references public.stations (id, org_id) on delete restrict,
  foreign key (session_id, org_id) references public.checkin_sessions (id, org_id) on delete restrict
);
create index idx_security_codes_session on public.security_codes (session_id);
create index idx_security_codes_station_day on public.security_codes (station_id, local_date) where session_id is null;
alter table public.security_codes enable row level security;

-- A code is bound to a session once; nothing else changes.
create or replace function chms_private.protect_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.session_id is not null
     or to_jsonb(new) - 'session_id' - 'issued_at' <> to_jsonb(old) - 'session_id' - 'issued_at' then
    raise exception 'a security code is bound once' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_security_codes_protect before update on public.security_codes
  for each row execute function chms_private.protect_code();
create trigger trg_security_codes_no_delete before delete on public.security_codes
  for each row execute function chms_private.deny_changes();
create trigger trg_security_codes_no_truncate before truncate on public.security_codes
  for each statement execute function chms_private.deny_changes();

-- A block of unused codes for one day, drawn for a station so it can issue
-- them offline. Alphabet ACDEFHJKMNPRTUVWXY34679 (no look-alikes). A station
-- holds at most 300 unissued codes per day, so one device cannot drain the
-- church's day.
create or replace function public.allocate_codes(p_local_date date default null, p_n integer default 50, p_station_id uuid default null)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_alphabet constant text := 'ACDEFHJKMNPRTUVWXY34679';
  v_cap constant integer := 300;
  v_station uuid := coalesce(chms_private.my_station(), p_station_id);
  v_org uuid;
  v_date date;
  v_held integer;
  v_want integer;
  v_codes text[] := '{}';
  v_code text;
  v_tries integer := 0;
begin
  if v_station is null then
    raise exception 'name a station' using errcode = '22023';
  end if;
  select org_id into v_org from public.stations where id = v_station and active and archived_at is null;
  if v_org is null then
    raise exception 'no such station' using errcode = '22023';
  end if;
  if chms_private.my_station() is null and (public.is_station() or not public.has_org_permission(v_org, 'checkin.manage')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_date := coalesce(p_local_date, chms_private.local_today(v_org));
  if p_n is null or p_n < 1 or p_n > v_cap then
    raise exception 'allocate between 1 and 300 codes' using errcode = '22023';
  end if;
  if v_date < chms_private.local_today(v_org) - 1 or v_date > chms_private.local_today(v_org) + 60 then
    raise exception 'codes are allocated for the next sixty days' using errcode = '22023';
  end if;
  select count(*) into v_held from public.security_codes
    where station_id = v_station and local_date = v_date and session_id is null;
  v_want := least(p_n, v_cap - v_held);
  if v_want <= 0 then
    raise exception 'this station already holds enough codes for that day' using errcode = '22023';
  end if;
  while cardinality(v_codes) < v_want and v_tries < v_want * 40 loop
    v_tries := v_tries + 1;
    v_code := substr(v_alphabet, 1 + floor(random() * 23)::int, 1)
           || substr(v_alphabet, 1 + floor(random() * 23)::int, 1)
           || substr(v_alphabet, 1 + floor(random() * 23)::int, 1);
    insert into public.security_codes (org_id, local_date, code, station_id)
    values (v_org, v_date, v_code, v_station)
    on conflict (org_id, local_date, code) do nothing;
    if found then
      v_codes := array_append(v_codes, v_code);
    end if;
  end loop;
  return v_codes;
end;
$$;

-- ---------------------------------------------------- the event log --
create table public.attendance_events (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  session_id uuid,
  occurrence_id uuid not null,
  person_id uuid not null,
  type text not null check (type in ('check_in', 'move', 'check_out', 'void', 'label_print_requested', 'label_printed', 'print_failed')),
  role text not null default 'child' check (role in ('child', 'volunteer', 'leader', 'attendee')),
  room_id uuid,
  from_room_id uuid,
  target_event_id uuid,
  code text check (code is null or code ~ '^[ACDEFHJKMNPRTUVWXY34679]{3,4}$'),
  picked_up_by_person_id uuid,
  picked_up_by_pickup_id uuid,
  pickup_status text check (pickup_status is null or pickup_status in ('guardian', 'authorized', 'restricted', 'named', 'unknown')),
  verified_by_person_id uuid,
  code_matched boolean,
  label_kind text check (label_kind is null or label_kind in ('child', 'pickup', 'volunteer')),
  printer_id uuid,
  station_id uuid,
  actor_person_id uuid,
  source text not null default 'station' check (source in ('station', 'admin', 'import')),
  external_id text check (external_id is null or length(external_id) between 1 and 200),
  device_at timestamptz not null,
  clock_offset_ms integer not null default 0 check (clock_offset_ms between -86400000 and 86400000),
  recorded_at timestamptz not null default now(),
  unique (id, org_id),
  check (type not in ('check_in', 'move') or room_id is not null),
  check (type <> 'move' or from_room_id is not null),
  check (type <> 'void' or target_event_id is not null),
  check (type not in ('label_print_requested', 'label_printed', 'print_failed') or label_kind is not null),
  foreign key (session_id, org_id) references public.checkin_sessions (id, org_id) on delete restrict,
  foreign key (occurrence_id, org_id) references public.occurrences (id, org_id) on delete restrict,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete restrict,
  foreign key (room_id, org_id) references public.rooms (id, org_id) on delete restrict,
  foreign key (from_room_id, org_id) references public.rooms (id, org_id) on delete restrict,
  foreign key (target_event_id, org_id) references public.attendance_events (id, org_id) on delete restrict,
  foreign key (picked_up_by_person_id, org_id) references public.people (id, org_id) on delete restrict,
  foreign key (picked_up_by_pickup_id, org_id) references public.pickup_people (id, org_id) on delete restrict,
  foreign key (verified_by_person_id, org_id) references public.people (id, org_id) on delete restrict,
  foreign key (printer_id, org_id) references public.printers (id, org_id) on delete restrict,
  foreign key (station_id, org_id) references public.stations (id, org_id) on delete restrict,
  foreign key (actor_person_id, org_id) references public.people (id, org_id) on delete restrict
);
create unique index idx_attendance_events_external on public.attendance_events (org_id, source, external_id) where external_id is not null;
create index idx_attendance_events_key on public.attendance_events (occurrence_id, person_id);
create index idx_attendance_events_session on public.attendance_events (session_id);
create index idx_attendance_events_org_recorded on public.attendance_events (org_id, recorded_at);
create index idx_attendance_events_target on public.attendance_events (target_event_id) where target_event_id is not null;
alter table public.attendance_events enable row level security;
create trigger trg_attendance_events_append_only before update or delete on public.attendance_events
  for each row execute function chms_private.deny_changes();
create trigger trg_attendance_events_no_truncate before truncate on public.attendance_events
  for each statement execute function chms_private.deny_changes();

-- Free-text pickup names stay out of the log.
create table public.attendance_pickup_names (
  event_id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  foreign key (event_id, org_id) references public.attendance_events (id, org_id) on delete restrict
);
alter table public.attendance_pickup_names enable row level security;
create trigger trg_attendance_pickup_names_append_only before update or delete on public.attendance_pickup_names
  for each row execute function chms_private.deny_changes();
create trigger trg_attendance_pickup_names_no_truncate before truncate on public.attendance_pickup_names
  for each statement execute function chms_private.deny_changes();

-- A void names an event of the same person and occurrence that nothing
-- later depends on; recorded_at is the server's clock, never the client's.
create or replace function chms_private.check_attendance_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  new.recorded_at := now();
  if new.type = 'void' then
    select type, occurrence_id, person_id, device_at, clock_offset_ms into t from public.attendance_events where id = new.target_event_id;
    if not found or t.occurrence_id <> new.occurrence_id or t.person_id <> new.person_id then
      raise exception 'a void names an event of the same person and occurrence' using errcode = '22023';
    end if;
    if t.type = 'void' then
      raise exception 'a void cannot be voided' using errcode = '22023';
    end if;
    if t.type = 'check_in' and exists (
      select 1 from public.attendance_events e
      where e.occurrence_id = new.occurrence_id and e.person_id = new.person_id and e.type in ('move', 'check_out')
        and chms_private.effective_at(e.device_at, e.clock_offset_ms) > chms_private.effective_at(t.device_at, t.clock_offset_ms)
        and not exists (select 1 from public.attendance_events v where v.type = 'void' and v.target_event_id = e.id)) then
      raise exception 'void the later move or check-out first' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_attendance_events_check before insert on public.attendance_events
  for each row execute function chms_private.check_attendance_event();

-- --------------------------------------------------- the projection --
create sequence chms_private.attendance_rev;

create table public.attendance (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  occurrence_id uuid not null,
  person_id uuid not null,
  role text not null default 'child',
  session_id uuid,
  household_id uuid,
  status text not null check (status in ('in', 'out', 'none')),
  first_room_id uuid,
  room_id uuid,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  check_in_event_id uuid,
  check_out_event_id uuid,
  picked_up_by_person_id uuid,
  pickup_status text,
  code_matched boolean,
  codes text[] not null default '{}',
  anomalies text[] not null default '{}',
  station_id uuid,
  punctuality text check (punctuality is null or punctuality in ('early', 'on_time', 'late')),
  minutes_vs_expected integer,
  event_count integer not null default 0,
  rev bigint not null,
  updated_at timestamptz not null default now(),
  unique (occurrence_id, person_id),
  unique (id, org_id),
  foreign key (occurrence_id, org_id) references public.occurrences (id, org_id) on delete restrict,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete restrict
);
create index idx_attendance_occurrence_room on public.attendance (occurrence_id, room_id);
create index idx_attendance_person on public.attendance (person_id, occurrence_id);
create index idx_attendance_org_rev on public.attendance (org_id, rev);
create index idx_attendance_household on public.attendance (household_id);
alter table public.attendance enable row level security;
create trigger trg_attendance_no_truncate before truncate on public.attendance
  for each statement execute function chms_private.deny_changes();

-- Recompute one (occurrence, person) row from every non-voided event, in
-- device order. Late and out-of-order events fold the same way.
create or replace function chms_private.fold_attendance(p_org_id uuid, p_occurrence_id uuid, p_person_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e record;
  v_at timestamptz;
  v_status text := 'none';
  v_role text := 'child';
  v_session uuid;
  v_household uuid;
  v_first_room uuid;
  v_room uuid;
  v_in_at timestamptz;
  v_out_at timestamptz;
  v_in_event uuid;
  v_out_event uuid;
  v_picker uuid;
  v_pickup_status text;
  v_matched boolean;
  v_codes text[] := '{}';
  v_anoms text[] := '{}';
  v_station uuid;
  v_n integer := 0;
  v_punct text;
  v_mins integer;
  v_expected timestamptz;
  v_grace integer;
  v_rev bigint;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_occurrence_id::text || p_person_id::text));
  for e in
    select ae.*, chms_private.effective_at(ae.device_at, ae.clock_offset_ms) as at
    from public.attendance_events ae
    where ae.occurrence_id = p_occurrence_id and ae.person_id = p_person_id
      and ae.type in ('check_in', 'move', 'check_out')
      and not exists (select 1 from public.attendance_events v where v.type = 'void' and v.target_event_id = ae.id)
    order by chms_private.effective_at(ae.device_at, ae.clock_offset_ms), ae.recorded_at, ae.id
  loop
    v_n := v_n + 1;
    v_at := e.at;
    v_session := coalesce(v_session, e.session_id);
    v_station := coalesce(v_station, e.station_id);
    if e.type = 'check_in' then
      if v_status = 'in' then
        v_anoms := array_append(v_anoms, 'double_check_in');
      elsif v_status = 'out' then
        v_anoms := array_append(v_anoms, 're_entry');
        v_out_at := null; v_out_event := null; v_picker := null; v_pickup_status := null; v_matched := null;
      end if;
      v_status := 'in';
      v_role := e.role;
      v_room := e.room_id;
      v_first_room := coalesce(v_first_room, e.room_id);
      v_in_at := coalesce(v_in_at, v_at);
      v_in_event := coalesce(v_in_event, e.id);
      if e.code is not null and not (e.code = any (v_codes)) then
        v_codes := array_append(v_codes, e.code);
      end if;
    elsif e.type = 'move' then
      if v_status = 'none' then
        v_anoms := array_append(v_anoms, 'move_before_check_in');
        v_first_room := coalesce(v_first_room, e.from_room_id);
      elsif v_status = 'out' then
        v_anoms := array_append(v_anoms, 'move_after_checkout');
      elsif e.from_room_id is distinct from v_room then
        v_anoms := array_append(v_anoms, 'move_from_mismatch');
      end if;
      v_room := e.room_id;
    else
      if v_status <> 'in' then
        v_anoms := array_append(v_anoms, 'checkout_before_checkin');
      end if;
      v_status := 'out';
      v_out_at := v_at;
      v_out_event := e.id;
      v_picker := e.picked_up_by_person_id;
      v_pickup_status := e.pickup_status;
      v_matched := e.code_matched;
      if e.code is not null and not (e.code = any (v_codes)) then
        v_codes := array_append(v_codes, e.code);
      end if;
    end if;
  end loop;

  if v_session is not null then
    select household_id into v_household from public.checkin_sessions where id = v_session;
  end if;

  -- Volunteers: early / on time / late against the slot's expected arrival.
  if v_in_at is not null and v_role in ('volunteer', 'leader') then
    select o.starts_at - make_interval(mins => s.arrive_minutes_before), coalesce(st.punctuality_grace_minutes, 10)
      into v_expected, v_grace
    from public.occurrences o
    join public.volunteer_assignments va on va.person_id = p_person_id and va.local_date = o.local_date and va.status <> 'declined'
    join public.volunteer_slots s on s.id = va.slot_id and s.archived_at is null
      and (s.occurrence_id = o.id or (s.occurrence_id is null and s.schedule_id = o.schedule_id))
    left join public.org_checkin_settings st on st.org_id = p_org_id
    where o.id = p_occurrence_id
    order by s.arrive_minutes_before desc
    limit 1;
    if v_expected is not null then
      v_mins := round(extract(epoch from (v_in_at - v_expected)) / 60)::integer;
      v_punct := case when v_mins < -v_grace then 'early' when v_mins > v_grace then 'late' else 'on_time' end;
    end if;
  end if;

  v_rev := nextval('chms_private.attendance_rev');
  insert into public.attendance (org_id, occurrence_id, person_id, role, session_id, household_id, status, first_room_id, room_id,
    checked_in_at, checked_out_at, check_in_event_id, check_out_event_id, picked_up_by_person_id, pickup_status, code_matched,
    codes, anomalies, station_id, punctuality, minutes_vs_expected, event_count, rev, updated_at)
  values (p_org_id, p_occurrence_id, p_person_id, v_role, v_session, v_household, v_status, v_first_room, v_room,
    v_in_at, v_out_at, v_in_event, v_out_event, v_picker, v_pickup_status, v_matched,
    v_codes, v_anoms, v_station, v_punct, v_mins, v_n, v_rev, now())
  on conflict (occurrence_id, person_id) do update set
    role = excluded.role, session_id = excluded.session_id, household_id = excluded.household_id, status = excluded.status,
    first_room_id = excluded.first_room_id, room_id = excluded.room_id, checked_in_at = excluded.checked_in_at,
    checked_out_at = excluded.checked_out_at, check_in_event_id = excluded.check_in_event_id,
    check_out_event_id = excluded.check_out_event_id, picked_up_by_person_id = excluded.picked_up_by_person_id,
    pickup_status = excluded.pickup_status, code_matched = excluded.code_matched, codes = excluded.codes,
    anomalies = excluded.anomalies, station_id = excluded.station_id, punctuality = excluded.punctuality,
    minutes_vs_expected = excluded.minutes_vs_expected, event_count = excluded.event_count, rev = excluded.rev, updated_at = now()
  returning id into v_id;

  -- Live rosters (Supabase Realtime, broadcast from the database); ids only.
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    execute 'select realtime.send($1, $2, $3, true)'
      using jsonb_build_object('attendance_id', v_id, 'occurrence_id', p_occurrence_id, 'person_id', p_person_id,
                               'room_id', v_room, 'status', v_status, 'rev', v_rev),
            'attendance', 'org:' || p_org_id::text || ':occ:' || p_occurrence_id::text;
  end if;
end;
$$;

-- After every event: fold, open the occurrence (live sources only), emit
-- the domain event with the corrected instant.
create or replace function chms_private.attendance_event_inserted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text;
begin
  if new.type in ('check_in', 'move', 'check_out', 'void') then
    perform chms_private.fold_attendance(new.org_id, new.occurrence_id, new.person_id);
    if new.source <> 'import' then
      update public.occurrences set status = 'open', opened_at = now()
        where id = new.occurrence_id and status = 'scheduled';
    end if;
  end if;
  v_type := case new.type
    when 'check_in' then 'checkin.created'
    when 'move' then 'checkin.moved'
    when 'check_out' then 'checkin.checked_out'
    when 'void' then 'checkin.voided'
    when 'label_print_requested' then 'label.requested'
    when 'label_printed' then 'label.printed'
    else 'label.failed' end;
  perform chms_private.emit_event(new.org_id, v_type, 'attendance_event', new.id,
    jsonb_build_object('occurrence_id', new.occurrence_id, 'person_id', new.person_id, 'role', new.role,
                       'room_id', new.room_id, 'from_room_id', new.from_room_id, 'session_id', new.session_id,
                       'target_event_id', new.target_event_id, 'source', new.source, 'clock_offset_ms', new.clock_offset_ms),
    chms_private.effective_at(new.device_at, new.clock_offset_ms));
  return null;
end;
$$;
create trigger trg_attendance_events_inserted after insert on public.attendance_events
  for each row execute function chms_private.attendance_event_inserted();

-- Who was in which room when. A stay with no check-out ends at the
-- occurrence's end (or at the check-in, if that came later).
create view public.room_stays with (security_invoker = true) as
with live as (
  select ae.id, ae.org_id, ae.occurrence_id, ae.person_id, ae.role, ae.type, ae.room_id, ae.recorded_at,
         chms_private.effective_at(ae.device_at, ae.clock_offset_ms) as at
  from public.attendance_events ae
  where ae.type in ('check_in', 'move', 'check_out')
    and not exists (select 1 from public.attendance_events v where v.type = 'void' and v.target_event_id = ae.id)
), ordered as (
  select l.*, lead(l.at) over (partition by l.occurrence_id, l.person_id order by l.at, l.recorded_at, l.id) as next_at
  from live l
)
select o.org_id, o.occurrence_id, o.person_id, o.role, o.room_id, o.at as from_at,
       greatest(coalesce(o.next_at, occ.ends_at), o.at) as to_at, o.id as event_id
from ordered o
join public.occurrences occ on occ.id = o.occurrence_id
where o.type in ('check_in', 'move');

-- ------------------------------------------------------------ alerts --
create table public.station_alerts (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  station_id uuid,
  occurrence_id uuid,
  person_id uuid,
  kind text not null check (kind in ('restricted_pickup', 'restricted_checkin', 'credential_block', 'over_ratio', 'duplicate_code', 'unknown_child', 'other')),
  detail jsonb not null default '{}' check (pg_column_size(detail) <= 4096),
  device_at timestamptz,
  raised_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by_person_id uuid,
  unique (id, org_id),
  foreign key (station_id, org_id) references public.stations (id, org_id) on delete restrict,
  foreign key (occurrence_id, org_id) references public.occurrences (id, org_id) on delete restrict,
  foreign key (person_id, org_id) references public.people (id, org_id) on delete restrict,
  foreign key (acknowledged_by_person_id, org_id) references public.people (id, org_id) on delete restrict
);
create index idx_station_alerts_open on public.station_alerts (org_id, raised_at desc) where acknowledged_at is null;
-- One alert per refused command, however often the outbox replays it.
create unique index idx_station_alerts_event on public.station_alerts (org_id, kind, (detail ->> 'event_id')) where detail ? 'event_id';
alter table public.station_alerts enable row level security;

-- An alert is acknowledged once, by whoever does it; nothing else changes.
create or replace function chms_private.protect_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  if old.acknowledged_at is not null
     or to_jsonb(new) - 'acknowledged_at' - 'acknowledged_by_person_id' <> to_jsonb(old) - 'acknowledged_at' - 'acknowledged_by_person_id' then
    raise exception 'an alert is acknowledged once; nothing else changes' using errcode = '42501';
  end if;
  if new.acknowledged_at is not null then
    select * into a from chms_private.actor_for(new.org_id);
    new.acknowledged_at := now();
    new.acknowledged_by_person_id := a.person_id;
  else
    new.acknowledged_by_person_id := null;
  end if;
  return new;
end;
$$;
create trigger trg_station_alerts_protect before update on public.station_alerts
  for each row execute function chms_private.protect_alert();
create trigger trg_station_alerts_no_delete before delete on public.station_alerts
  for each row execute function chms_private.deny_changes();
create trigger trg_station_alerts_no_truncate before truncate on public.station_alerts
  for each statement execute function chms_private.deny_changes();

-- --------------------------------------------------------- baselines --
create table public.attendance_baselines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  household_id uuid not null,
  year smallint not null check (year between 2000 and 2100),
  count integer not null check (count between 0 and 10000),
  note text check (note is null or length(note) <= 300),
  set_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, year),
  foreign key (household_id, org_id) references public.households (id, org_id) on delete restrict,
  foreign key (set_by_person_id, org_id) references public.people (id, org_id) on delete set null (set_by_person_id)
);
alter table public.attendance_baselines enable row level security;
create trigger trg_attendance_baselines_actor before insert or update on public.attendance_baselines
  for each row execute function chms_private.stamp_set_by();
create trigger trg_attendance_baselines_touch before update on public.attendance_baselines
  for each row execute function public.chms_touch();
create trigger trg_attendance_baselines_no_delete before delete on public.attendance_baselines
  for each row execute function chms_private.deny_changes();
create trigger trg_attendance_baselines_no_truncate before truncate on public.attendance_baselines
  for each statement execute function chms_private.deny_changes();
create trigger trg_audit_attendance_baselines after insert or update or delete on public.attendance_baselines
  for each row execute function chms_private.audit_row();
create trigger trg_audit_station_alerts after insert or update or delete on public.station_alerts
  for each row execute function chms_private.audit_row();

-- ------------------------------------------------------------- RLS --
-- Reads: kids viewers, check-in managers and report readers see their
-- church; a station and a room leader see the rows in their rooms now (not
-- children who have moved on); a volunteer their own rows. Writes go
-- through ingest() and the RPCs below only.
create policy "Attendance readers, stations, leaders and the person read attendance" on public.attendance for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('attendance.reports'))::uuid[])
      or room_id = any ((select chms_private.station_room_ids())::uuid[])
      or room_id = any ((select chms_private.my_led_room_ids())::uuid[])
      or person_id = any ((select chms_private.my_person_ids())::uuid[]));

create policy "Attendance readers, stations, leaders and the person read events" on public.attendance_events for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('attendance.reports'))::uuid[])
      or room_id = any ((select chms_private.station_room_ids())::uuid[])
      or from_room_id = any ((select chms_private.station_room_ids())::uuid[])
      or room_id = any ((select chms_private.my_led_room_ids())::uuid[])
      or from_room_id = any ((select chms_private.my_led_room_ids())::uuid[])
      or person_id = any ((select chms_private.my_person_ids())::uuid[]));

create policy "Kids viewers read pickup names" on public.attendance_pickup_names for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

create policy "Attendance readers, the station and the guardian read sessions" on public.checkin_sessions for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('attendance.reports'))::uuid[])
      or station_id = (select chms_private.my_station())
      or guardian_person_id = any ((select chms_private.my_person_ids())::uuid[]));

create policy "Stations read their codes; managers read all" on public.security_codes for select
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
      or station_id = (select chms_private.my_station()));

create policy "Care holders, managers and the station read alerts" on public.station_alerts for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
      or station_id = (select chms_private.my_station()));
create policy "Care holders and managers acknowledge alerts" on public.station_alerts for update
  using (org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[])
           or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

create policy "Report readers and managers read baselines" on public.attendance_baselines for select
  using (org_id = any ((select chms_private.orgs_with_permission('attendance.reports'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers add baselines" on public.attendance_baselines for insert
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Check-in managers edit baselines" on public.attendance_baselines for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

create policy "Attendance audit follows its tables" on public.chms_audit for select
  using ((table_name = 'station_alerts' and org_id = any ((select chms_private.orgs_with_permission('kids.care'))::uuid[]))
      or (table_name = 'attendance_baselines' and org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])));

-- ------------------------------------------------------------ ingest --
-- One command. Raises to reject (the caller's savepoint rolls it back) or
-- returns accepted / duplicate / rejected with a reason.
create or replace function chms_private.ingest_one(c jsonb, p_org_id uuid, p_station_id uuid, p_actor_person_id uuid, p_scope uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_op text := c ->> 'op';
  v_id uuid := (c ->> 'id')::uuid;
  v_type text;
  v_role text;
  v_person uuid;
  v_room uuid;
  v_from_room uuid;
  v_current_room uuid;
  v_current_status text;
  v_session uuid;
  v_code text;
  v_bound uuid;
  v_bound_household uuid;
  v_picker uuid;
  v_pickup uuid;
  v_pickup_status text;
  v_restriction text;
  v_actor uuid;
  v_source text;
  v_device_at timestamptz;
  v_offset integer;
  v_at timestamptz;
  v_tz text;
  v_alerts text[] := '{}';
  v_ids uuid[];
  o record;
  s record;
  t record;
  p jsonb;
  v_rel text;
  v_local_date date;
begin
  if v_id is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'missing_id');
  end if;
  v_device_at := (c ->> 'device_at')::timestamptz;
  v_offset := case when v_device_at is null then 0 else coalesce((c ->> 'clock_offset_ms')::integer, 0) end;
  v_at := chms_private.effective_at(coalesce(v_device_at, now()), v_offset);

  if v_op = 'guest.create' then
    v_ids := array(select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(c -> 'people', '[]'::jsonb)) x);
    if jsonb_typeof(coalesce(c -> 'people', '[]'::jsonb)) <> 'array' or cardinality(v_ids) > 20
       or jsonb_array_length(coalesce(c -> 'care', '[]'::jsonb)) > 20 or (c -> 'household' ->> 'id') is null then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid');
    end if;
    if exists (select 1 from public.households where id = (c -> 'household' ->> 'id')::uuid and org_id = p_org_id) then
      return jsonb_build_object('status', 'duplicate');
    end if;
    if exists (select 1 from public.households where id = (c -> 'household' ->> 'id')::uuid)
       or exists (select 1 from public.people where id = any (v_ids)) then
      -- a guest family is new people: existing records are never grafted onto a kiosk's household
      return jsonb_build_object('status', 'rejected', 'reason', 'existing_person');
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(c -> 'care', '[]'::jsonb)) x where not ((x ->> 'person_id')::uuid = any (v_ids)))
       or (c ? 'consent' and (c -> 'consent' ->> 'person_id') is not null and not ((c -> 'consent' ->> 'person_id')::uuid = any (v_ids))) then
      return jsonb_build_object('status', 'rejected', 'reason', 'existing_person');
    end if;
    insert into public.households (id, org_id, name)
    values ((c -> 'household' ->> 'id')::uuid, p_org_id, left(coalesce(c -> 'household' ->> 'name', 'New family'), 120));
    for p in select * from jsonb_array_elements(coalesce(c -> 'people', '[]'::jsonb)) loop
      v_rel := coalesce(p ->> 'relationship', 'other');
      insert into public.people (id, org_id, first_name, last_name, birthdate, phone, gender, membership_status, tags)
      values ((p ->> 'id')::uuid, p_org_id, left(p ->> 'first_name', 100), left(coalesce(p ->> 'last_name', ''), 100),
              (p ->> 'birthdate')::date, left(p ->> 'phone', 40), p ->> 'gender', 'visitor', array['guest']);
      insert into public.household_members (household_id, person_id, org_id, relationship, is_guardian, can_check_in)
      values ((c -> 'household' ->> 'id')::uuid, (p ->> 'id')::uuid, p_org_id, v_rel, v_rel in ('head', 'spouse'), v_rel in ('head', 'spouse'));
    end loop;
    for p in select * from jsonb_array_elements(coalesce(c -> 'care', '[]'::jsonb)) loop
      insert into public.child_care (person_id, org_id, allergies, allergy_short, medical, special_needs, has_allergy, has_medical, has_special_needs)
      values ((p ->> 'person_id')::uuid, p_org_id, left(p ->> 'allergies', 2000), left(p ->> 'allergy_short', 40),
              left(p ->> 'medical', 4000), left(p ->> 'special_needs', 4000),
              coalesce(p ->> 'allergies', '') <> '', coalesce(p ->> 'medical', '') <> '', coalesce(p ->> 'special_needs', '') <> '')
      on conflict (person_id) do nothing;
      perform chms_private.log_access(p_org_id, 'child_care.write', (p ->> 'person_id')::uuid, 1, jsonb_build_object('via', 'ingest'));
    end loop;
    if c ? 'consent' then
      insert into public.contact_consents (org_id, phone_e164, scope, person_id, source, station_id, text_version)
      values (p_org_id, chms_private.normalize_phone(c -> 'consent' ->> 'phone'), coalesce(c -> 'consent' ->> 'scope', 'safety'),
              (c -> 'consent' ->> 'person_id')::uuid, case when p_station_id is null then 'admin' else 'station' end, p_station_id,
              left(coalesce(c -> 'consent' ->> 'text_version', 'v1'), 40))
      on conflict (org_id, phone_e164, scope) where revoked_at is null do nothing;
    end if;
    return jsonb_build_object('status', 'accepted');

  elsif v_op = 'session.start' then
    if exists (select 1 from public.checkin_sessions where id = v_id and org_id = p_org_id) then
      return jsonb_build_object('status', 'duplicate');
    end if;
    if exists (select 1 from public.checkin_sessions where id = v_id) then
      return jsonb_build_object('status', 'rejected', 'reason', 'id_in_use');
    end if;
    select time_zone into v_tz from public.org_checkin_settings where org_id = p_org_id;
    -- the pass is dated by the device's moment in the church's day, not by when it synced
    v_local_date := coalesce((c ->> 'local_date')::date,
                             case when v_device_at is not null and v_tz is not null then (v_at at time zone v_tz)::date end,
                             chms_private.local_today(p_org_id));
    -- the device's clock must sit within a day of the pass's date
    if v_device_at is not null and v_tz is not null
       and (v_at < (v_local_date::timestamp - interval '1 day') at time zone v_tz or v_at > (v_local_date::timestamp + interval '2 days') at time zone v_tz) then
      return jsonb_build_object('status', 'rejected', 'reason', 'device_time_out_of_range');
    end if;
    insert into public.checkin_sessions (id, org_id, local_date, household_id, guardian_person_id, station_id,
      lookup_method, lookup_last4, queued_offline, device_at, clock_offset_ms)
    values (v_id, p_org_id, v_local_date, (c ->> 'household_id')::uuid, (c ->> 'guardian_person_id')::uuid, p_station_id,
      c ->> 'lookup_method', c ->> 'lookup_last4', coalesce((c ->> 'queued_offline')::boolean, false), v_device_at, v_offset);
    return jsonb_build_object('status', 'accepted');

  elsif v_op = 'session.complete' then
    if not exists (select 1 from public.checkin_sessions where id = v_id and org_id = p_org_id
                   and (p_station_id is null or station_id = p_station_id)) then
      return jsonb_build_object('status', 'rejected', 'reason', 'unknown_session');
    end if;
    update public.checkin_sessions set completed_at = least(now(), coalesce((c ->> 'completed_at')::timestamptz, now()))
      where id = v_id and completed_at is null;
    return jsonb_build_object('status', case when found then 'accepted' else 'duplicate' end);

  elsif v_op = 'alert.raise' then
    if exists (select 1 from public.station_alerts where id = v_id and org_id = p_org_id) then
      return jsonb_build_object('status', 'duplicate');
    end if;
    if (c ->> 'kind') not in ('over_ratio', 'unknown_child', 'duplicate_code', 'restricted_pickup', 'restricted_checkin', 'credential_block', 'other')
       or (c ? 'detail' and (jsonb_typeof(c -> 'detail') <> 'object' or pg_column_size(c -> 'detail') > 4096)) then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid');
    end if;
    if p_scope is not null and c ? 'person_id' and (c ->> 'person_id') is not null
       and not exists (select 1 from public.attendance a
                       where a.person_id = (c ->> 'person_id')::uuid and a.room_id = any (p_scope)
                         and a.occurrence_id = coalesce((c ->> 'occurrence_id')::uuid, a.occurrence_id)) then
      return jsonb_build_object('status', 'rejected', 'reason', 'room_out_of_scope');
    end if;
    insert into public.station_alerts (id, org_id, station_id, occurrence_id, person_id, kind, detail, device_at)
    values (v_id, p_org_id, p_station_id, (c ->> 'occurrence_id')::uuid, (c ->> 'person_id')::uuid, c ->> 'kind',
            coalesce(c -> 'detail', '{}'::jsonb), v_device_at);
    return jsonb_build_object('status', 'accepted');

  elsif v_op = 'event' then
    if exists (select 1 from public.attendance_events where id = v_id and org_id = p_org_id) then
      return jsonb_build_object('status', 'duplicate');
    end if;
    if exists (select 1 from public.attendance_events where id = v_id) then
      return jsonb_build_object('status', 'rejected', 'reason', 'id_in_use');
    end if;
    v_type := c ->> 'type';
    v_role := coalesce(c ->> 'role', 'child');
    v_person := (c ->> 'person_id')::uuid;
    v_room := (c ->> 'room_id')::uuid;
    v_from_room := (c ->> 'from_room_id')::uuid;
    v_session := (c ->> 'session_id')::uuid;
    v_code := c ->> 'code';
    v_source := case when p_station_id is not null then 'station' when c ->> 'source' = 'import' then 'import' else 'admin' end;
    if v_source = 'import' and not public.has_org_permission(p_org_id, 'checkin.manage') then
      return jsonb_build_object('status', 'rejected', 'reason', 'import_needs_manage');
    end if;
    if c ? 'external_id' and exists (select 1 from public.attendance_events e
                                     where e.org_id = p_org_id and e.source = v_source and e.external_id = c ->> 'external_id') then
      return jsonb_build_object('status', 'duplicate');
    end if;
    select * into o from public.occurrences where id = (c ->> 'occurrence_id')::uuid and org_id = p_org_id;
    if not found then
      return jsonb_build_object('status', 'rejected', 'reason', 'unknown_occurrence');
    end if;
    if o.status = 'cancelled' then
      return jsonb_build_object('status', 'rejected', 'reason', 'occurrence_cancelled');
    end if;
    -- the device's clock must sit within a day of the service
    if v_at < o.starts_at - interval '1 day' or v_at > o.ends_at + interval '1 day' then
      return jsonb_build_object('status', 'rejected', 'reason', 'device_time_out_of_range');
    end if;
    if o.status = 'closed' and v_at > o.closed_at + interval '1 hour' and v_type in ('check_in', 'move') then
      return jsonb_build_object('status', 'rejected', 'reason', 'occurrence_closed');
    end if;
    if v_room is not null and not exists (select 1 from public.rooms r where r.id = v_room and r.org_id = p_org_id and r.archived_at is null) then
      return jsonb_build_object('status', 'rejected', 'reason', 'unknown_room');
    end if;
    if not exists (select 1 from public.people where id = v_person and org_id = p_org_id and archived_at is null) then
      return jsonb_build_object('status', 'rejected', 'reason', 'unknown_person');
    end if;
    -- where the person is now, for moves, check-outs and voids
    select a.room_id, a.status into v_current_room, v_current_status
      from public.attendance a where a.occurrence_id = o.id and a.person_id = v_person;
    if v_type in ('move', 'check_out') and v_current_status is distinct from 'in' and v_current_status is distinct from 'out' then
      return jsonb_build_object('status', 'rejected', 'reason', 'not_checked_in');
    end if;
    -- room scope: the destination, the origin and the current room must all be the caller's
    if p_scope is not null then
      if v_room is not null and not (v_room = any (p_scope)) then
        return jsonb_build_object('status', 'rejected', 'reason', 'room_out_of_scope');
      end if;
      if v_type = 'move' and (v_from_room is null or not (v_from_room = any (p_scope))) then
        return jsonb_build_object('status', 'rejected', 'reason', 'room_out_of_scope');
      end if;
      if v_type in ('move', 'check_out') and v_current_room is not null and not (v_current_room = any (p_scope)) then
        return jsonb_build_object('status', 'rejected', 'reason', 'room_out_of_scope');
      end if;
      if v_type = 'void' then
        select room_id, from_room_id into t from public.attendance_events where id = (c ->> 'target_event_id')::uuid;
        if not found or not (coalesce(t.room_id, t.from_room_id) = any (p_scope)) then
          return jsonb_build_object('status', 'rejected', 'reason', 'room_out_of_scope');
        end if;
      end if;
    end if;
    -- the family pass this event belongs to, when one is named, is this church's (and this station's)
    if v_session is not null then
      select * into s from public.checkin_sessions where id = v_session and org_id = p_org_id;
      if not found or (p_station_id is not null and s.station_id is distinct from p_station_id) then
        return jsonb_build_object('status', 'rejected', 'reason', 'unknown_session');
      end if;
      if s.local_date <> o.local_date then
        return jsonb_build_object('status', 'rejected', 'reason', 'session_date_mismatch');
      end if;
    elsif p_station_id is not null and v_type = 'check_in' and v_role = 'child' then
      return jsonb_build_object('status', 'rejected', 'reason', 'missing_session');
    end if;
    -- the actor is a PIN holder only when a PIN was verified at this station recently
    v_actor := coalesce(p_actor_person_id,
      (select pv.person_id from chms_private.pin_verifications pv
       where pv.station_id = p_station_id and pv.person_id = (c ->> 'actor_person_id')::uuid and pv.verified_at > now() - interval '30 minutes'
       order by pv.verified_at desc limit 1));

    if v_type = 'check_in' then
      v_restriction := chms_private.active_restriction(v_person);
      if v_restriction is not null then
        insert into public.station_alerts (org_id, station_id, occurrence_id, person_id, kind, detail, device_at)
        values (p_org_id, p_station_id, o.id, v_person, 'restricted_checkin', jsonb_build_object('restriction', v_restriction, 'event_id', v_id), v_device_at)
        on conflict do nothing;
        return jsonb_build_object('status', 'rejected', 'reason', 'see_staff');
      end if;
      if v_role in ('volunteer', 'leader')
         and exists (select 1 from public.rooms r join public.areas a on a.id = r.area_id where r.id = v_room and a.kind = 'kids')
         and chms_private.credential_status(v_person, o.local_date) <> 'cleared' then
        v_alerts := array_append(v_alerts, 'credential_block');
      end if;
      if v_code is not null then
        select sc.session_id, cs.household_id into v_bound, v_bound_household
          from public.security_codes sc left join public.checkin_sessions cs on cs.id = sc.session_id
          where sc.org_id = p_org_id and sc.local_date = o.local_date and sc.code = v_code for update of sc;
        if not found then
          insert into public.security_codes (org_id, local_date, code, station_id, session_id, issued_at)
          values (p_org_id, o.local_date, v_code, p_station_id, v_session, now());
        elsif v_bound is null and v_session is not null then
          update public.security_codes set session_id = v_session, issued_at = now()
            where org_id = p_org_id and local_date = o.local_date and code = v_code;
        elsif v_bound is not null and (v_session is null or v_bound <> v_session)
              and (s.household_id is null or v_bound_household is null or s.household_id <> v_bound_household) then
          v_alerts := array_append(v_alerts, 'duplicate_code');
        end if;
      end if;
    elsif v_type = 'check_out' then
      v_picker := (c ->> 'picked_up_by_person_id')::uuid;
      v_pickup := (c ->> 'picked_up_by_pickup_id')::uuid;
      if v_picker is not null then
        v_pickup_status := chms_private.pickup_status(v_person, v_picker);
      elsif v_pickup is not null then
        -- a pickup row: a directory person goes through the full check; a name-only row by its own dates
        select case when pp.person_id is not null then chms_private.pickup_status(v_person, pp.person_id)
                    when pp.kind = 'restricted' then 'restricted'
                    when (pp.valid_from is not null and pp.valid_from > o.local_date) or (pp.valid_to is not null and pp.valid_to < o.local_date) then 'unknown'
                    else 'authorized' end
          into v_pickup_status
          from public.pickup_people pp where pp.id = v_pickup and pp.child_person_id = v_person and pp.org_id = p_org_id and pp.archived_at is null;
        if v_pickup_status is null then
          return jsonb_build_object('status', 'rejected', 'reason', 'unknown_pickup');
        end if;
      elsif c ? 'picked_up_by_name' then
        v_pickup_status := 'named';
      else
        v_pickup_status := 'unknown';
      end if;
      if v_pickup_status = 'restricted' then
        insert into public.station_alerts (org_id, station_id, occurrence_id, person_id, kind, detail, device_at)
        values (p_org_id, p_station_id, o.id, v_person, 'restricted_pickup',
                jsonb_build_object('picked_up_by_person_id', v_picker, 'picked_up_by_pickup_id', v_pickup, 'event_id', v_id), v_device_at)
        on conflict do nothing;
        return jsonb_build_object('status', 'rejected', 'reason', 'see_staff');
      end if;
    end if;

    insert into public.attendance_events (id, org_id, session_id, occurrence_id, person_id, type, role, room_id, from_room_id,
      target_event_id, code, picked_up_by_person_id, picked_up_by_pickup_id, pickup_status, verified_by_person_id, code_matched,
      label_kind, printer_id, station_id, actor_person_id, source, external_id, device_at, clock_offset_ms)
    values (v_id, p_org_id, v_session, o.id, v_person, v_type, v_role, v_room, v_from_room,
      (c ->> 'target_event_id')::uuid, v_code, v_picker, v_pickup, v_pickup_status, (c ->> 'verified_by_person_id')::uuid,
      -- a presented code is checked here; without one the device's visual match stands
      case when v_type = 'check_out' and v_code is not null
           then exists (select 1 from public.attendance a where a.occurrence_id = o.id and a.person_id = v_person and v_code = any (a.codes))
           else (c ->> 'code_matched')::boolean end,
      c ->> 'label_kind', (c ->> 'printer_id')::uuid, p_station_id, v_actor, v_source,
      c ->> 'external_id', coalesce(v_device_at, now()), v_offset);
    if c ? 'picked_up_by_name' then
      insert into public.attendance_pickup_names (event_id, org_id, name) values (v_id, p_org_id, left(c ->> 'picked_up_by_name', 120));
    end if;
    if cardinality(v_alerts) > 0 then
      insert into public.station_alerts (org_id, station_id, occurrence_id, person_id, kind, detail, device_at)
      select p_org_id, p_station_id, o.id, v_person, k, jsonb_build_object('event_id', v_id), v_device_at
      from unnest(v_alerts) k
      on conflict do nothing;
    end if;
    return jsonb_build_object('status', 'accepted', 'alerts', to_jsonb(v_alerts));
  end if;

  return jsonb_build_object('status', 'rejected', 'reason', 'unknown_op');
end;
$$;

-- The write path. A station writes within its church and room scope; a
-- signed-in user with checkin.manage writes anywhere in the church named
-- by the commands, one with checkin.station only in the rooms they lead.
-- Each command runs in its own savepoint.
create or replace function public.ingest(p_commands jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_station uuid := chms_private.my_station();
  v_org uuid;
  v_actor uuid;
  v_scope uuid[];
  c jsonb;
  r jsonb;
  v_results jsonb := '[]';
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_commands is null or jsonb_typeof(p_commands) <> 'array' or jsonb_array_length(p_commands) > 200 then
    raise exception 'commands must be an array of at most 200' using errcode = '22023';
  end if;
  if v_station is not null then
    v_org := chms_private.my_station_org();
    v_scope := chms_private.station_room_ids();
  else
    if public.is_station() or (p_commands -> 0 ->> 'org_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    v_org := (p_commands -> 0 ->> 'org_id')::uuid;
    if public.has_org_permission(v_org, 'checkin.manage') then
      v_scope := null;
    elsif public.has_org_permission(v_org, 'checkin.station') then
      v_scope := chms_private.my_led_room_ids();
    else
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    v_actor := chms_private.my_person_id(v_org);
  end if;

  for c in select * from jsonb_array_elements(p_commands) loop
    begin
      if v_station is null and (c ->> 'org_id')::uuid is distinct from v_org then
        r := jsonb_build_object('status', 'rejected', 'reason', 'org_mismatch');
      else
        r := chms_private.ingest_one(c, v_org, v_station, v_actor, v_scope);
      end if;
    exception when others then
      r := jsonb_build_object('status', 'rejected',
        'reason', case sqlstate when '23503' then 'unknown_reference' when '23505' then 'duplicate_key'
                                when '23514' then 'invalid' when '22P02' then 'invalid' when '22007' then 'invalid' when '22008' then 'invalid'
                                else sqlstate end,
        'detail', left(sqlerrm, 200));
    end;
    v_results := v_results || (jsonb_build_object('id', c ->> 'id', 'op', c ->> 'op') || r);
  end loop;
  return jsonb_build_object('results', v_results,
    'rev', (select coalesce(max(a.rev), 0) from public.attendance a where a.org_id = v_org));
end;
$$;

-- ------------------------------------------------------------ roster --
-- What a room device or leader sees: first name + last initial, flags,
-- code status. Logged once per read as a bulk access.
create or replace function public.roster(p_occurrence_id uuid, p_room_id uuid)
returns table (
  person_id uuid, display_name text, photo_path text, role text, status text, room_id uuid,
  checked_in_at timestamptz, checked_out_at timestamptz, codes text[], anomalies text[], punctuality text,
  has_allergy boolean, has_medical boolean, has_special_needs boolean, allergy_short text,
  restriction text, guardian_first_name text
) language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_n integer;
begin
  select o.org_id into v_org from public.occurrences o join public.rooms r on r.org_id = o.org_id
    where o.id = p_occurrence_id and r.id = p_room_id;
  if v_org is null or auth.uid() is null or not chms_private.can_see_room(p_room_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select count(*) into v_n from public.attendance a where a.occurrence_id = p_occurrence_id and a.room_id = p_room_id and a.status <> 'none';
  perform chms_private.log_access(v_org, 'roster.read', null, v_n, jsonb_build_object('occurrence_id', p_occurrence_id, 'room_id', p_room_id));
  return query
    select a.person_id,
           p.first_name || case when coalesce(p.last_name, '') = '' then '' else ' ' || left(p.last_name, 1) || '.' end,
           p.photo_path, a.role, a.status, a.room_id, a.checked_in_at, a.checked_out_at, a.codes, a.anomalies, a.punctuality,
           coalesce(cc.has_allergy, false), coalesce(cc.has_medical, false), coalesce(cc.has_special_needs, false), cc.allergy_short,
           chms_private.active_restriction(a.person_id),
           g.first_name
    from public.attendance a
    join public.people p on p.id = a.person_id
    left join public.child_care cc on cc.person_id = a.person_id
    left join public.checkin_sessions s on s.id = a.session_id
    left join public.people g on g.id = s.guardian_person_id
    where a.occurrence_id = p_occurrence_id and a.room_id = p_room_id and a.status <> 'none'
    order by p.first_name, p.last_name;
end;
$$;

-- Close an occurrence (no more check-ins expected; stays without a check-out
-- end at ends_at). Reopening is an edit of the occurrence by a manager.
create or replace function public.close_occurrence(p_occurrence_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.occurrences where id = p_occurrence_id;
  if v_org is null then
    raise exception 'no such occurrence' using errcode = '22023';
  end if;
  if auth.uid() is null or public.is_station() or not public.has_org_permission(v_org, 'checkin.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.occurrences set status = 'closed', closed_at = now()
    where id = p_occurrence_id and status in ('scheduled', 'open');
end;
$$;

-- ------------------------------------------------------- documents --
-- The documents bucket has no SELECT policy for the API: the document-url
-- edge function calls this as the reader, which checks the permission and
-- logs the read, then signs a short-lived URL with the service role.
create or replace function public.log_document_access(p_document_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  d record;
begin
  select org_id, person_id, kind, storage_path into d from public.person_documents where id = p_document_id and archived_at is null;
  if not found or auth.uid() is null or public.is_station()
     or not public.has_org_permission(d.org_id, case when d.kind = 'custody' then 'custody.manage' else 'kids.care' end) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform chms_private.log_access(d.org_id, 'document.read', d.person_id, 1, jsonb_build_object('document_id', p_document_id, 'kind', d.kind));
  return d.storage_path;
end;
$$;

-- -------------------------------------------------- realtime (guarded) --
-- Broadcast topics are org:<org_id>:occ:<occurrence_id>; attendance readers
-- and the church's stations may subscribe. Payloads carry ids and a rev only.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$create policy "Attendance readers and stations read attendance broadcasts" on realtime.messages for select
      using (realtime.messages.extension = 'broadcast'
             and split_part(realtime.topic(), ':', 1) = 'org'
             and split_part(realtime.topic(), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and (split_part(realtime.topic(), ':', 2)::uuid = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
                  or split_part(realtime.topic(), ':', 2)::uuid = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
                  or split_part(realtime.topic(), ':', 2)::uuid = any ((select chms_private.orgs_with_permission('attendance.reports'))::uuid[])
                  or split_part(realtime.topic(), ':', 2)::uuid = (select chms_private.my_station_org())))$p$;
  end if;
end $$;

-- ------------------------------------------------------------ grants --
grant execute on function
  public.ingest(jsonb), public.allocate_codes(date, integer, uuid), public.roster(uuid, uuid), public.close_occurrence(uuid),
  public.log_document_access(uuid)
  to authenticated, service_role;
