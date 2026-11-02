-- ============================================================================
-- ChMS check-in D: device pairing, station lookups and pickups (Phase 1b).
--
-- Pairing. A check-in manager asks for a code for a station (eight characters
-- from the security-code alphabet, stored hashed, good for ten minutes, one
-- live code per station). The pair-station edge function creates the device's
-- auth user (app_metadata.kind = 'station') and claims the code with the
-- service role, which writes the pairing row; the device keeps a refresh
-- token and nothing else. Unpairing revokes the pairing row, so my_station()
-- is null at once, and the edge function bans the auth user so the refresh
-- token dies too (revoked_station_users / confirm_station_revocation).
--
-- Lookups. A station reads people only through the RPCs here: first names and
-- last initials, the fields room criteria need, care flags (never the text),
-- pickup lists for children in its own rooms, today's volunteers. Every call
-- is logged once as a bulk access. Kiosks look up by whole phone number or by
-- scan only; staffed stations may also use the last four digits or a name.
-- Twenty misses in ten minutes lock a station out, server side.
-- ============================================================================

-- --------------------------------------------------------- pairing codes --
create table chms_private.station_pairing_codes (
  id bigint generated always as identity primary key,
  station_id uuid not null,
  org_id uuid not null,
  code_hash text not null,
  created_by_person_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_user_id uuid,
  revoked_at timestamptz,
  foreign key (station_id, org_id) references public.stations (id, org_id) on delete cascade
);
create index idx_station_pairing_codes_live on chms_private.station_pairing_codes (code_hash) where used_at is null and revoked_at is null;
alter table chms_private.station_pairing_codes enable row level security;
revoke all on table chms_private.station_pairing_codes from anon, authenticated;

-- Set once the edge function has banned a revoked device's auth user.
alter table chms_private.station_principals add column tokens_revoked_at timestamptz;

create or replace function chms_private.hash_pairing_code(p_code text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');
$$;
revoke execute on function chms_private.hash_pairing_code(text) from public, anon, authenticated;

create or replace function chms_private.display_name(p_first text, p_last text)
returns text language sql immutable set search_path = public as $$
  select p_first || case when coalesce(p_last, '') = '' then '' else ' ' || left(p_last, 1) || '.' end;
$$;
revoke execute on function chms_private.display_name(text, text) from public, anon, authenticated;

-- A manager asks for a code; the station's previous unused code dies. The
-- code is returned once and only its hash is kept.
create or replace function public.create_pairing_code(p_station_id uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_alphabet constant text := 'ACDEFHJKMNPRTUVWXY34679';
  v_org uuid;
  v_code text := '';
  v_bytes bytea;
  v_i integer;
  v_b integer;
begin
  select org_id into v_org from public.stations where id = p_station_id and archived_at is null;
  if v_org is null then
    raise exception 'no such station' using errcode = '22023';
  end if;
  if auth.uid() is null or public.is_station() or not public.has_org_permission(v_org, 'checkin.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- eight characters without bias: bytes at or above 230 (10 × 23) are skipped
  while length(v_code) < 8 loop
    v_bytes := extensions.gen_random_bytes(16);
    for v_i in 0..15 loop
      v_b := get_byte(v_bytes, v_i);
      if v_b < 230 and length(v_code) < 8 then
        v_code := v_code || substr(v_alphabet, 1 + (v_b % 23), 1);
      end if;
    end loop;
  end loop;
  update chms_private.station_pairing_codes set revoked_at = now()
    where station_id = p_station_id and used_at is null and revoked_at is null;
  insert into chms_private.station_pairing_codes (station_id, org_id, code_hash, created_by_person_id, expires_at)
  values (p_station_id, v_org, chms_private.hash_pairing_code(v_code), chms_private.my_person_id(v_org), now() + interval '10 minutes');
  perform chms_private.log_access(v_org, 'station.pairing_code', null, 1, jsonb_build_object('station_id', p_station_id));
  perform chms_private.emit_event(v_org, 'station.pairing_started', 'station', p_station_id);
  return v_code;
end;
$$;

-- The pair-station edge function (service role only) claims a code for the
-- auth user it just created. A re-pair retires the device paired before.
create or replace function public.claim_pairing_code(p_code text, p_user_id uuid, p_platform text default null, p_app_version text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  c record;
  s record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'name the device''s user' using errcode = '22023';
  end if;
  select * into c from chms_private.station_pairing_codes
    where code_hash = chms_private.hash_pairing_code(p_code) and used_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'code_invalid');
  end if;
  select * into s from public.stations where id = c.station_id and active and archived_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'station_inactive');
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id and coalesce(u.raw_app_meta_data ->> 'kind', '') = 'station') then
    return jsonb_build_object('ok', false, 'error', 'not_a_station_user');
  end if;
  if exists (select 1 from chms_private.station_principals where user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'user_in_use');
  end if;
  update chms_private.station_pairing_codes set used_at = now(), used_by_user_id = p_user_id where id = c.id;
  update chms_private.station_principals set revoked_at = now() where station_id = c.station_id and revoked_at is null;
  insert into chms_private.station_principals (station_id, org_id, user_id, platform, app_version, last_seen_at)
  values (c.station_id, c.org_id, p_user_id, left(p_platform, 40), left(p_app_version, 40), now());
  perform chms_private.log_access(c.org_id, 'station.paired', null, 1, jsonb_build_object('station_id', c.station_id, 'platform', left(p_platform, 40)));
  perform chms_private.emit_event(c.org_id, 'station.paired', 'station', c.station_id);
  return jsonb_build_object('ok', true, 'station_id', c.station_id, 'org_id', c.org_id, 'name', s.name, 'mode', s.mode);
end;
$$;

-- Devices whose pairing was revoked and whose auth user is not yet banned;
-- the edge function bans each and confirms. Service role only.
create or replace function public.revoked_station_users()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select user_id from chms_private.station_principals where revoked_at is not null and tokens_revoked_at is null;
end;
$$;

create or replace function public.confirm_station_revocation(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update chms_private.station_principals set tokens_revoked_at = now()
    where user_id = p_user_id and revoked_at is not null and tokens_revoked_at is null;
end;
$$;

-- A manager unpairs a station: its device stops at once; the edge function
-- bans the auth user afterwards.
create or replace function public.unpair_station(p_station_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.stations where id = p_station_id;
  if v_org is null then
    raise exception 'no such station' using errcode = '22023';
  end if;
  if auth.uid() is null or public.is_station() or not public.has_org_permission(v_org, 'checkin.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update chms_private.station_principals set revoked_at = now() where station_id = p_station_id and revoked_at is null;
  update chms_private.station_pairing_codes set revoked_at = now() where station_id = p_station_id and used_at is null and revoked_at is null;
  perform chms_private.log_access(v_org, 'station.unpaired', null, 1, jsonb_build_object('station_id', p_station_id));
  perform chms_private.emit_event(v_org, 'station.unpaired', 'station', p_station_id);
end;
$$;

-- The device unpairs itself (behind a staff PIN on screen) and then signs
-- out everywhere, which revokes its own refresh token.
create or replace function public.station_unpair_self()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_station uuid := chms_private.my_station();
  v_org uuid := chms_private.my_station_org();
begin
  if v_station is null then
    raise exception 'stations only' using errcode = '42501';
  end if;
  perform chms_private.log_access(v_org, 'station.unpaired', null, 1, jsonb_build_object('station_id', v_station, 'by', 'device'));
  perform chms_private.emit_event(v_org, 'station.unpaired', 'station', v_station, jsonb_build_object('by', 'device'));
  update chms_private.station_principals set revoked_at = now() where user_id = auth.uid() and revoked_at is null;
end;
$$;

-- The device reports in (at boot and hourly).
create or replace function public.station_heartbeat(p_platform text default null, p_app_version text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if chms_private.my_station() is null then
    raise exception 'stations only' using errcode = '42501';
  end if;
  update chms_private.station_principals
    set last_seen_at = now(), platform = coalesce(left(p_platform, 40), platform), app_version = coalesce(left(p_app_version, 40), app_version)
    where user_id = auth.uid() and revoked_at is null;
end;
$$;

-- What the Stations screen shows: paired or not, last seen, a live code's
-- expiry. Never an account id.
create or replace function public.station_pairing_status(p_org_id uuid)
returns table (station_id uuid, paired_at timestamptz, last_seen_at timestamptz, platform text, app_version text, code_expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_station()
     or not (public.has_org_permission(p_org_id, 'checkin.manage') or public.has_org_permission(p_org_id, 'checkin.station')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select s.id, sp.paired_at, sp.last_seen_at, sp.platform, sp.app_version,
           (select max(c.expires_at) from chms_private.station_pairing_codes c
             where c.station_id = s.id and c.used_at is null and c.revoked_at is null and c.expires_at > now())
    from public.stations s
    left join chms_private.station_principals sp on sp.station_id = s.id and sp.revoked_at is null
    where s.org_id = p_org_id and s.archived_at is null;
end;
$$;

-- ------------------------------------------------------- station context --
-- Who is asking a station RPC: a paired device (its church, rooms and mode),
-- or a signed-in leader running the station app (checkin.manage: every room;
-- checkin.station: the rooms they lead). Raises for anyone else. A null scope
-- means every room; an empty one means none.
create or replace function chms_private.station_context(p_org_id uuid)
returns table (org_id uuid, station_id uuid, scope uuid[], mode text, actor_person_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  v_station uuid := chms_private.my_station();
begin
  if v_station is not null then
    return query select s.org_id, s.id, chms_private.station_room_ids(), s.mode, null::uuid from public.stations s where s.id = v_station;
    return;
  end if;
  if auth.uid() is null or public.is_station() or p_org_id is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if public.has_org_permission(p_org_id, 'checkin.manage') then
    return query select p_org_id, null::uuid, null::uuid[], 'staffed'::text, chms_private.my_person_id(p_org_id);
  elsif public.has_org_permission(p_org_id, 'checkin.station') then
    return query select p_org_id, null::uuid, chms_private.my_led_room_ids(), 'staffed'::text, chms_private.my_person_id(p_org_id);
  else
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function chms_private.station_context(uuid) from public, anon, authenticated;

-- --------------------------------------------------------------- lookup --
-- Families and people for a phone number (whole; last four digits on a
-- staffed station), a name (staffed) or a scanned key. First name and last
-- initial only (adults keep their last name for a volunteer label); the
-- number looked up is never logged.
create or replace function public.station_lookup(p_query text, p_method text, p_org_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_phone text;
  v_q text;
  v_people uuid[];
  v_misses integer;
  v_households jsonb;
  v_persons jsonb;
begin
  select * into v from chms_private.station_context(p_org_id);
  if p_method is null or p_method not in ('phone', 'last4', 'name', 'scan') then
    return jsonb_build_object('ok', false, 'error', 'invalid_method');
  end if;
  if v.mode = 'kiosk' and p_method in ('last4', 'name') then
    return jsonb_build_object('ok', false, 'error', 'method_not_allowed');
  end if;
  if v.station_id is not null then
    select count(*) into v_misses from public.access_log l
      where l.org_id = v.org_id and l.station_id = v.station_id and l.action = 'station.lookup'
        and (l.detail ->> 'found')::integer = 0 and l.at > now() - interval '10 minutes';
    if v_misses >= 20 then
      return jsonb_build_object('ok', false, 'error', 'locked');
    end if;
  end if;

  if p_method = 'phone' then
    v_phone := chms_private.normalize_phone(p_query);
    if v_phone is null then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    v_people := array(select p.id from public.people p where p.org_id = v.org_id and p.archived_at is null and p.phone_e164 = v_phone);
  elsif p_method = 'last4' then
    v_q := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
    if v_q !~ '^\d{4}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    v_people := array(select p.id from public.people p where p.org_id = v.org_id and p.archived_at is null and right(p.phone_e164, 4) = v_q
                      order by p.first_name, p.last_name limit 50);
  elsif p_method = 'name' then
    v_q := lower(btrim(coalesce(p_query, '')));
    if length(v_q) < 2 then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    v_people := array(select p.id from public.people p where p.org_id = v.org_id and p.archived_at is null
                        and (lower(p.first_name || ' ' || p.last_name) like '%' || v_q || '%' or lower(coalesce(p.preferred_name, '')) like v_q || '%')
                      order by p.first_name, p.last_name limit 30);
  else
    v_q := btrim(coalesce(p_query, ''));
    if length(v_q) < 4 then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    v_people := array(select distinct coalesce(k.person_id, m.person_id) from public.checkin_keys k
                      left join public.household_members m on m.household_id = k.household_id and m.ended_at is null
                      where k.org_id = v.org_id and k.value = v_q and k.revoked_at is null and coalesce(k.person_id, m.person_id) is not null);
  end if;

  select coalesce(jsonb_agg(h order by h ->> 'name'), '[]'::jsonb) into v_households
  from (
    select jsonb_build_object('id', hh.id, 'name', hh.name,
             'members', (select coalesce(jsonb_agg(jsonb_build_object(
                 'person_id', p.id, 'first_name', p.first_name, 'display_name', chms_private.display_name(p.first_name, p.last_name),
                 'relationship', m.relationship, 'is_guardian', m.is_guardian, 'can_check_in', m.can_check_in,
                 'is_child', m.relationship = 'child' or chms_private.is_minor(p.id, p.birthdate, p.org_id),
                 'matched', p.id = any (v_people))
                 order by m.relationship = 'child', p.birthdate nulls last, p.first_name), '[]'::jsonb)
               from public.household_members m join public.people p on p.id = m.person_id and p.archived_at is null
               where m.household_id = hh.id and m.ended_at is null)) as h
    from public.households hh
    where hh.org_id = v.org_id and hh.archived_at is null
      and exists (select 1 from public.household_members m where m.household_id = hh.id and m.ended_at is null and m.person_id = any (v_people))
  ) x;
  -- adults (volunteers at a walk-up) carry their last name for the label; children never do here
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('person_id', p.id, 'display_name', chms_private.display_name(p.first_name, p.last_name),
           'first_name', p.first_name, 'last_name', case when not chms_private.is_minor(p.id, p.birthdate, p.org_id) then p.last_name end,
           'is_child', chms_private.is_minor(p.id, p.birthdate, p.org_id),
           'in_household', exists (select 1 from public.household_members m where m.person_id = p.id and m.ended_at is null)))
           order by p.first_name, p.last_name), '[]'::jsonb)
    into v_persons
  from public.people p where p.id = any (v_people);

  perform chms_private.log_access(v.org_id, 'station.lookup', null, cardinality(v_people),
    jsonb_build_object('method', p_method, 'found', cardinality(v_people)));
  return jsonb_build_object('ok', true, 'found', cardinality(v_people), 'households', v_households, 'people', v_persons);
end;
$$;

-- One family for the check-in screen: who may check in, each child's room
-- criteria fields, care flags and short allergy text (never the notes),
-- "see staff" without its reason, and today's attendance so a second
-- service reuses the pass and code.
create or replace function public.station_household(p_household_id uuid, p_org_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record;
  h record;
  v_today date;
  v_members jsonb;
  v_attendance jsonb;
  v_n integer;
begin
  select * into v from chms_private.station_context(p_org_id);
  select * into h from public.households where id = p_household_id and org_id = v.org_id and archived_at is null;
  if not found then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_today := chms_private.local_today(v.org_id);
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'person_id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'display_name', chms_private.display_name(p.first_name, p.last_name),
      'relationship', m.relationship, 'is_guardian', m.is_guardian, 'can_check_in', m.can_check_in, 'is_child', k.is_child,
      'guest', 'guest' = any (p.tags),
      'birthdate', case when k.is_child then p.birthdate end,
      'gender', case when k.is_child then p.gender end,
      'tags', case when k.is_child then to_jsonb(p.tags) end,
      'custom', case when k.is_child then p.custom end,
      'grade_override', case when k.is_child then p.grade_override end,
      'grade_override_year', case when k.is_child then p.grade_override_year end,
      'flags', case when k.is_child then jsonb_build_object(
          'allergy', coalesce(cc.has_allergy, false), 'medical', coalesce(cc.has_medical, false), 'special_needs', coalesce(cc.has_special_needs, false),
          'custody', exists (select 1 from public.pickup_people pp where pp.child_person_id = p.id and pp.kind = 'restricted' and pp.archived_at is null
                               and (pp.valid_from is null or pp.valid_from <= v_today) and (pp.valid_to is null or pp.valid_to >= v_today))) end,
      'allergy_short', case when k.is_child then cc.allergy_short end,
      'see_staff', chms_private.active_restriction(p.id) is not null,
      'override_room_id', chms_private.active_room_override(p.id),
      'credential_status', case when not k.is_child then chms_private.credential_status(p.id, v_today) end,
      'sms_consent', case when not k.is_child and p.phone_e164 is not null then
          exists (select 1 from public.contact_consents c where c.org_id = v.org_id and c.phone_e164 = p.phone_e164 and c.scope = 'safety' and c.revoked_at is null) end
    )) order by k.is_child, p.birthdate nulls last, p.first_name), '[]'::jsonb), count(*)
  into v_members, v_n
  from public.household_members m
  join public.people p on p.id = m.person_id and p.archived_at is null
  left join public.child_care cc on cc.person_id = p.id
  cross join lateral (select (m.relationship = 'child' or chms_private.is_minor(p.id, p.birthdate, p.org_id)) as is_child) k
  where m.household_id = h.id and m.ended_at is null;

  select coalesce(jsonb_agg(jsonb_build_object('occurrence_id', a.occurrence_id, 'person_id', a.person_id, 'status', a.status, 'room_id', a.room_id,
           'codes', to_jsonb(a.codes), 'session_id', a.session_id, 'checked_in_at', a.checked_in_at, 'role', a.role)), '[]'::jsonb)
    into v_attendance
  from public.attendance a
  join public.occurrences o on o.id = a.occurrence_id
  where o.org_id = v.org_id and o.local_date = v_today and a.status <> 'none'
    and a.person_id in (select hm.person_id from public.household_members hm where hm.household_id = h.id and hm.ended_at is null);

  perform chms_private.log_access(v.org_id, 'station.household', null, v_n, jsonb_build_object('household_id', h.id));
  return jsonb_build_object('id', h.id, 'name', h.name, 'local_date', v_today, 'members', v_members, 'attendance', v_attendance);
end;
$$;

-- Who may pick a child up, for the check-out screen: guardians who can
-- check in, authorized pickups, and restricted people shown by name so the
-- volunteer recognises them (never the reason). Only for a child who is in
-- one of the caller's rooms now.
create or replace function public.station_pickups(p_person_id uuid, p_org_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_today date;
  v_guardians jsonb;
  v_authorized jsonb;
  v_restricted jsonb;
begin
  select * into v from chms_private.station_context(p_org_id);
  v_today := chms_private.local_today(v.org_id);
  if not exists (select 1 from public.people p where p.id = p_person_id and p.org_id = v.org_id and p.archived_at is null)
     or not exists (select 1 from public.attendance a join public.occurrences o on o.id = a.occurrence_id
                    where a.person_id = p_person_id and a.status = 'in' and o.local_date >= v_today - 1
                      and (v.scope is null or a.room_id = any (v.scope))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('person_id', g.id, 'display_name', chms_private.display_name(g.first_name, g.last_name), 'relationship', gm.relationship)
           order by g.first_name, g.last_name), '[]'::jsonb)
    into v_guardians
  from public.household_members cm
  join public.household_members gm on gm.household_id = cm.household_id and gm.ended_at is null and gm.relationship <> 'child' and gm.can_check_in
  join public.people g on g.id = gm.person_id and g.archived_at is null
  where cm.person_id = p_person_id and cm.ended_at is null and chms_private.pickup_status(p_person_id, g.id) = 'guardian';
  select coalesce(jsonb_agg(jsonb_build_object('pickup_id', pp.id, 'person_id', pp.person_id,
           'display_name', case when p.id is not null then chms_private.display_name(p.first_name, p.last_name) else pp.name end,
           'relationship', pp.relationship) order by coalesce(p.first_name, pp.name)), '[]'::jsonb)
    into v_authorized
  from public.pickup_people pp
  left join public.people p on p.id = pp.person_id and p.archived_at is null
  where pp.child_person_id = p_person_id and pp.kind = 'authorized' and pp.archived_at is null
    and (pp.valid_from is null or pp.valid_from <= v_today) and (pp.valid_to is null or pp.valid_to >= v_today)
    and (pp.person_id is null or chms_private.pickup_status(p_person_id, pp.person_id) <> 'restricted');
  select coalesce(jsonb_agg(jsonb_build_object('pickup_id', pp.id, 'person_id', pp.person_id,
           'display_name', chms_private.display_name(p.first_name, p.last_name)) order by p.first_name, p.last_name), '[]'::jsonb)
    into v_restricted
  from public.pickup_people pp
  join public.people p on p.id = pp.person_id
  where pp.child_person_id = p_person_id and pp.kind = 'restricted' and pp.archived_at is null
    and (pp.valid_from is null or pp.valid_from <= v_today) and (pp.valid_to is null or pp.valid_to >= v_today);
  perform chms_private.log_access(v.org_id, 'pickups.read', p_person_id, 1, jsonb_build_object('restricted', jsonb_array_length(v_restricted) > 0));
  return jsonb_build_object('guardians', v_guardians, 'authorized', v_authorized, 'restricted', v_restricted);
end;
$$;

-- Today's volunteer schedule for the volunteer station: who is expected
-- where and when, their background-check status, and whether they are in.
create or replace function public.station_volunteers(p_local_date date default null, p_org_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_date date;
  v_rows jsonb;
  v_n integer;
begin
  select * into v from chms_private.station_context(p_org_id);
  v_date := coalesce(p_local_date, chms_private.local_today(v.org_id));
  if v_date < chms_private.local_today(v.org_id) - 1 or v_date > chms_private.local_today(v.org_id) + 7 then
    raise exception 'the volunteer schedule is for the coming week' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'assignment_id', va.id, 'person_id', p.id, 'display_name', chms_private.display_name(p.first_name, p.last_name),
      'first_name', p.first_name, 'last_name', p.last_name,
      'slot_id', s.id, 'label', coalesce(s.label, r.name, ro.name), 'room_id', s.room_id, 'room_name', r.name, 'role_name', ro.name,
      'occurrence_id', o.id, 'starts_at', o.starts_at, 'ends_at', o.ends_at, 'arrive_minutes_before', s.arrive_minutes_before,
      'status', va.status, 'kids_area', coalesce(ar.kind = 'kids', false),
      'credential_status', chms_private.credential_status(p.id, v_date),
      'attendance_status', a.status, 'checked_in_at', a.checked_in_at, 'punctuality', a.punctuality, 'attendance_room_id', a.room_id
    )) order by o.starts_at nulls last, p.first_name, p.last_name), '[]'::jsonb), count(*)
  into v_rows, v_n
  from public.volunteer_assignments va
  join public.volunteer_slots s on s.id = va.slot_id and s.archived_at is null
  join public.people p on p.id = va.person_id and p.archived_at is null
  left join public.occurrences o on o.org_id = va.org_id and o.local_date = va.local_date and o.status <> 'cancelled'
                                 and (o.id = s.occurrence_id or o.schedule_id = s.schedule_id)
  left join public.rooms r on r.id = s.room_id
  left join public.areas ar on ar.id = r.area_id
  left join public.org_roles ro on ro.id = s.role_id
  left join public.attendance a on a.occurrence_id = o.id and a.person_id = p.id
  where va.org_id = v.org_id and va.local_date = v_date and va.status <> 'declined'
    and (v.scope is null or s.room_id is null or s.room_id = any (v.scope));
  perform chms_private.log_access(v.org_id, 'volunteers.read', null, v_n, jsonb_build_object('local_date', v_date));
  return jsonb_build_object('ok', true, 'local_date', v_date, 'volunteers', v_rows);
end;
$$;

-- --------------------------------------------------------------- grants --
revoke execute on function
  public.create_pairing_code(uuid), public.unpair_station(uuid), public.station_unpair_self(), public.station_heartbeat(text, text),
  public.station_pairing_status(uuid), public.station_lookup(text, text, uuid), public.station_household(uuid, uuid),
  public.station_pickups(uuid, uuid), public.station_volunteers(date, uuid)
  from public, anon;
grant execute on function
  public.create_pairing_code(uuid), public.unpair_station(uuid), public.station_unpair_self(), public.station_heartbeat(text, text),
  public.station_pairing_status(uuid), public.station_lookup(text, text, uuid), public.station_household(uuid, uuid),
  public.station_pickups(uuid, uuid), public.station_volunteers(date, uuid)
  to authenticated, service_role;
revoke execute on function
  public.claim_pairing_code(text, uuid, text, text), public.revoked_station_users(), public.confirm_station_revocation(uuid)
  from public, anon, authenticated;
grant execute on function
  public.claim_pairing_code(text, uuid, text, text), public.revoked_station_users(), public.confirm_station_revocation(uuid)
  to service_role;
