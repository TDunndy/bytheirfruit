-- ============================================================================
-- CHMS CHECK-IN, MIGRATION C (stays and scope): the second review round.
--
--   room_stays is computed over the whole log by a definer helper and then
--     filtered to the rooms the reader may see, so a reader never sees a stay
--     in another room, a stay never runs to the end of the service because
--     its closing event was invisible, and a child the projection has 'out'
--     is out (a stay whose only exit is a clock-skewed check-out ends there)
--   a room-scoped reader also sees a check-out when the projection has the
--     child leaving one of their rooms, even if the check-out arrived before
--     the move that put the child there
--   a void needs a target in the caller's rooms: an event with no room (a
--     label event) counts as being where the child is now, and nothing with
--     no room at all can be voided from a scoped device
--   from_room_id means something on a move only; any other event stores
--     none, so a scoped writer cannot plant an event into another room's feed
--   a code presented at check-out that did not match is not one of the
--     child's codes: only check-in codes count, so a wrong code never turns
--     into a matching one
--   the fold falls back to another event's pass only when no check-in exists;
--     a check-in without a pass keeps the row without one
--
-- Known and accepted: a station reads every column of the codes it
-- allocated, including bound_person_id once a manager binds one by hand.
-- That is an opaque id; a station reads no people.
-- ============================================================================

-- ------------------------------------------------------------ room stays --
-- Who was in which room when, from every event (the helper runs as the
-- owner), shown to a reader for the rooms they may see. A stay with no later
-- event ends when the projection says the child left, else at the service's
-- end; never before it began.
create or replace function chms_private.room_stays_visible()
returns table (org_id uuid, occurrence_id uuid, person_id uuid, role text, room_id uuid, from_at timestamptz, to_at timestamptz, event_id uuid)
language sql stable security definer set search_path = public as $$
  with live as (
    select ae.id, ae.org_id, ae.occurrence_id, ae.person_id, ae.role, ae.type, ae.room_id, ae.recorded_at,
           chms_private.effective_at(ae.device_at, ae.clock_offset_ms) as at
    from public.attendance_events ae
    where ae.type in ('check_in', 'move', 'check_out')
      and not exists (select 1 from public.attendance_events v where v.type = 'void' and v.target_event_id = ae.id)
  ), ordered as (
    select l.*, lead(l.at) over (partition by l.occurrence_id, l.person_id order by l.at, l.recorded_at, l.id) as next_at
    from live l
  ), stays as (
    select o.org_id, o.occurrence_id, o.person_id, o.role, o.room_id, o.at as from_at,
           greatest(o.at, coalesce(o.next_at,
                                   case when a.status = 'out' then a.checked_out_at end,
                                   occ.ends_at)) as to_at,
           o.id as event_id
    from ordered o
    join public.occurrences occ on occ.id = o.occurrence_id
    left join public.attendance a on a.occurrence_id = o.occurrence_id and a.person_id = o.person_id
    where o.type in ('check_in', 'move')
  )
  select s.org_id, s.occurrence_id, s.person_id, s.role, s.room_id, s.from_at, s.to_at, s.event_id
  from stays s
  where auth.uid() is not null and (
       s.org_id = any (chms_private.orgs_with_permission('checkin.manage'))
    or s.org_id = any (chms_private.orgs_with_permission('kids.view'))
    or s.org_id = any (chms_private.orgs_with_permission('attendance.reports'))
    or s.room_id = any (chms_private.station_room_ids())
    or s.room_id = any (chms_private.my_led_room_ids())
    or s.person_id = any (chms_private.my_person_ids()));
$$;
revoke execute on function chms_private.room_stays_visible() from public, anon;
grant execute on function chms_private.room_stays_visible() to authenticated, service_role;

create or replace view public.room_stays with (security_invoker = true) as
  select org_id, occurrence_id, person_id, role, room_id, from_at, to_at, event_id
  from chms_private.room_stays_visible();

-- A room-scoped reader sees a check-out when the projection has the child
-- leaving one of their rooms, whatever room the event itself carries.
alter policy "Attendance readers, stations, leaders and the person read event" on public.attendance_events
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
      or org_id = any ((select chms_private.orgs_with_permission('attendance.reports'))::uuid[])
      or room_id = any ((select chms_private.station_room_ids())::uuid[])
      or from_room_id = any ((select chms_private.station_room_ids())::uuid[])
      or room_id = any ((select chms_private.my_led_room_ids())::uuid[])
      or from_room_id = any ((select chms_private.my_led_room_ids())::uuid[])
      or person_id = any ((select chms_private.my_person_ids())::uuid[])
      or (type = 'check_out' and exists (
            select 1 from public.attendance a
            where a.check_out_event_id = attendance_events.id
              and (a.room_id = any ((select chms_private.station_room_ids())::uuid[])
                   or a.room_id = any ((select chms_private.my_led_room_ids())::uuid[])))));

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
      -- the child's codes are the ones issued at check-in
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
    end if;
  end loop;
  -- no check-in at all: fall back to the earliest event that named a pass
  if v_in_event is null then
    v_session := coalesce(v_session, v_first_session);
    v_station := coalesce(v_station, v_first_station);
  end if;

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
  v_target_room uuid;
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
    -- an origin room belongs to a move; no other event carries one
    v_from_room := case when v_type = 'move' then (c ->> 'from_room_id')::uuid end;
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
        -- the target is in the caller's rooms: its own room, or (an event
        -- with none, or a check-out that arrived before a move) the room the
        -- child is in now; nothing without a room can be voided from here
        select type, room_id, from_room_id into t from public.attendance_events where id = (c ->> 'target_event_id')::uuid;
        v_target_room := coalesce(t.room_id, t.from_room_id, v_current_room);
        if not found or v_target_room is null
           or not (v_target_room = any (p_scope)
                   or (t.type = 'check_out' and v_current_room is not null and v_current_room = any (p_scope))) then
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
      -- a presented code is checked here against the codes issued at check-in; without one the device's visual match stands
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
