-- ============================================================================
-- CHMS CHECK-IN, MIGRATION C (review fixes): what the adversarial review of
-- the attendance core found after C shipped.
--
--   voids and check-outs carry the room they act on, so a room-scoped
--     reader (a station, a room leader) sees them and room_stays never shows
--     a stay that was cancelled or had ended
--   a code used without a family pass binds to the person who used it;
--     reuse by another household raises duplicate_code (before, such a code
--     never bound and anyone could share it)
--   ingest() retries a command that hit a deadlock or a lock timeout and,
--     if it keeps failing, answers `retry` instead of `rejected`, so the
--     outbox resends it rather than dropping a check-in
--   the fold takes session, household and station from the check-in (not
--     from whatever event happened to carry the earliest device time), keeps
--     a check-out that clock skew put before the only check-in, and names a
--     second check-out double_check_out
--   a check-in bringing a code already bound to another pass used to fail
--     with 55000 on the admin path (an unassigned record); it now alerts
-- ============================================================================

-- ------------------------------------------------ rooms on voids and exits --
-- A void acts on the rooms of the event it cancels; a check-out on the room
-- the child is leaving. Readers scoped to those rooms then see both.
create or replace function chms_private.check_attendance_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  new.recorded_at := now();
  if new.type = 'void' then
    select type, occurrence_id, person_id, device_at, clock_offset_ms, room_id, from_room_id into t
      from public.attendance_events where id = new.target_event_id;
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
    new.room_id := t.room_id;
    new.from_room_id := t.from_room_id;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------- codes bind to a person --
alter table public.security_codes add column bound_person_id uuid;
alter table public.security_codes add constraint security_codes_bound_person_id_org_id_fkey
  foreign key (bound_person_id, org_id) references public.people (id, org_id) on delete restrict;

create or replace function chms_private.protect_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.session_id is not null or old.bound_person_id is not null
     or to_jsonb(new) - 'session_id' - 'issued_at' - 'bound_person_id' <> to_jsonb(old) - 'session_id' - 'issued_at' - 'bound_person_id' then
    raise exception 'a security code is bound once' using errcode = '42501';
  end if;
  return new;
end;
$$;

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
  -- unissued: no pass and no person yet (a person-bound code has no session but is issued)
  select count(*) into v_held from public.security_codes
    where station_id = v_station and local_date = v_date and session_id is null and issued_at is null;
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

-- ----------------------------------------------------------------- fold --
create or replace function chms_private.fold_attendance(p_org_id uuid, p_occurrence_id uuid, p_person_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e record;
  v_at timestamptz;
  v_status text := 'none';
  v_role text := 'child';
  v_session uuid;
  v_first_session uuid;
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
  v_first_station uuid;
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
    v_first_session := coalesce(v_first_session, e.session_id);
    v_first_station := coalesce(v_first_station, e.station_id);
    if e.type = 'check_in' then
      if v_in_event is null then
        -- the pass that checked the child in decides session, household and station
        v_session := e.session_id;
        v_station := e.station_id;
      end if;
      if v_status = 'in' then
        v_anoms := array_append(v_anoms, 'double_check_in');
        v_status := 'in';
      elsif v_status = 'out' and v_in_event is not null then
        v_anoms := array_append(v_anoms, 're_entry');
        v_out_at := null; v_out_event := null; v_picker := null; v_pickup_status := null; v_matched := null;
        v_status := 'in';
      elsif v_status = 'out' then
        -- the only check-out landed before this check-in (clock skew): the
        -- child has gone home; keep the pickup, flagged by the check-out
        null;
      else
        v_status := 'in';
      end if;
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
      if v_status = 'out' then
        v_anoms := array_append(v_anoms, 'double_check_out');
      elsif v_status = 'none' then
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
  -- no check-in at all: fall back to the earliest event that named a pass
  v_session := coalesce(v_session, v_first_session);
  v_station := coalesce(v_station, v_first_station);

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

-- --------------------------------------------------------------- ingest --
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
  v_session_household uuid;
  v_code text;
  v_bound uuid;
  v_bound_person uuid;
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
    -- a check-out leaves the room the child is in; the event says so, so room-scoped readers see it
    if v_type = 'check_out' then
      v_room := v_current_room;
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
      v_session_household := s.household_id;
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
        -- A code binds on first use: to the family pass, or to the person
        -- when there is none. Later use by the same pass, household or
        -- person is fine; anyone else is a duplicate.
        select sc.session_id, sc.bound_person_id, cs.household_id into v_bound, v_bound_person, v_bound_household
          from public.security_codes sc left join public.checkin_sessions cs on cs.id = sc.session_id
          where sc.org_id = p_org_id and sc.local_date = o.local_date and sc.code = v_code for update of sc;
        if not found then
          insert into public.security_codes (org_id, local_date, code, station_id, session_id, bound_person_id, issued_at)
          values (p_org_id, o.local_date, v_code, p_station_id, v_session, case when v_session is null then v_person end, now());
        elsif v_bound is null and v_bound_person is null then
          update public.security_codes
            set session_id = v_session, bound_person_id = case when v_session is null then v_person end, issued_at = coalesce(issued_at, now())
            where org_id = p_org_id and local_date = o.local_date and code = v_code;
        elsif not (
             (v_bound is not null and v_session is not null and v_bound = v_session)
          or (v_bound_household is not null and v_session_household is not null and v_bound_household = v_session_household)
          or (v_bound_household is not null and exists (select 1 from public.household_members m
                                                        where m.household_id = v_bound_household and m.person_id = v_person and m.ended_at is null))
          or (v_bound_person is not null and (v_bound_person = v_person
                or exists (select 1 from public.household_members a
                           join public.household_members b on b.household_id = a.household_id
                           where a.person_id = v_bound_person and b.person_id = v_person and a.ended_at is null and b.ended_at is null)))) then
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

-- A deadlock or a lock timeout is a timing accident, not a bad command: the
-- command is retried, and if it keeps failing the answer is `retry` so the
-- outbox resends it. Every other error is still `rejected`.
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
  v_try integer;
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
    v_try := 0;
    loop
      v_try := v_try + 1;
      begin
        if v_station is null and (c ->> 'org_id')::uuid is distinct from v_org then
          r := jsonb_build_object('status', 'rejected', 'reason', 'org_mismatch');
        else
          r := chms_private.ingest_one(c, v_org, v_station, v_actor, v_scope);
        end if;
        exit;
      exception
        when deadlock_detected or serialization_failure or lock_not_available then
          if v_try < 3 then
            perform pg_sleep(0.05 * v_try);
            continue;
          end if;
          r := jsonb_build_object('status', 'retry', 'reason', sqlstate, 'detail', left(sqlerrm, 200));
          exit;
        when others then
          r := jsonb_build_object('status', 'rejected',
            'reason', case sqlstate when '23503' then 'unknown_reference' when '23505' then 'duplicate_key'
                                    when '23514' then 'invalid' when '22P02' then 'invalid' when '22007' then 'invalid' when '22008' then 'invalid'
                                    else sqlstate end,
            'detail', left(sqlerrm, 200));
          exit;
      end;
    end loop;
    v_results := v_results || (jsonb_build_object('id', c ->> 'id', 'op', c ->> 'op') || r);
  end loop;
  return jsonb_build_object('results', v_results,
    'rev', (select coalesce(max(a.rev), 0) from public.attendance a where a.org_id = v_org));
end;
$$;
