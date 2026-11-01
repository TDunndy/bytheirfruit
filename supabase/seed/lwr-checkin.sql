-- ============================================================================
-- Lakewood Ranch Baptist Church: check-in configuration (plan §8, phase 1a)
--
-- Run once as the database owner after migrations A–C are applied; it is
-- idempotent (every insert skips rows that already exist by name). It holds
-- configuration only: areas, rooms and their criteria, the two services,
-- volunteer needs, label templates and stations. No people, no names.
--
-- Capacities and ratios are placeholders for the directors to adjust in
-- Check-in › Rooms. The K/5 rooms are a guess until Q3 (grades per room,
-- Move-Up Sunday) is answered; the Barn is per the spec and decisions B/B2.
-- ============================================================================
do $$
declare
  v_org uuid := '0de21bb0-63ae-5fdb-a2d9-fd78d8dda3e7';   -- the LRBC organization
  v_barn uuid;
  v_k5 uuid;
  v_desk uuid;
  v_first uuid;
  v_second uuid;
  v_cubs uuid;
  v_colts uuid;
  r record;
begin
  if not exists (select 1 from public.organizations where id = v_org) then
    raise exception 'organization % is not here; set v_org to the church''s id', v_org;
  end if;

  -- ---------------------------------------------------------- settings --
  insert into public.org_checkin_settings (org_id, time_zone, grade_cutoff_month, grade_cutoff_day, punctuality_grace_minutes)
  values (v_org, 'America/New_York', 8, 16, 10)
  on conflict (org_id) do nothing;

  -- ------------------------------------------------------------- areas --
  for r in select * from (values ('The Barn', 'kids', 10), ('K/5', 'kids', 20), ('Welcome desk', 'volunteer', 30)) as v(name, kind, sort_order) loop
    insert into public.areas (org_id, name, kind, sort_order)
    select v_org, r.name, r.kind, r.sort_order
    where not exists (select 1 from public.areas a where a.org_id = v_org and lower(a.name) = lower(r.name) and a.archived_at is null);
  end loop;
  select id into v_barn from public.areas where org_id = v_org and lower(name) = 'the barn' and archived_at is null;
  select id into v_k5 from public.areas where org_id = v_org and lower(name) = 'k/5' and archived_at is null;
  select id into v_desk from public.areas where org_id = v_org and lower(name) = 'welcome desk' and archived_at is null;

  -- ------------------------------------------------------------- rooms --
  -- Month-based rooms are measured on the service date; Cubs starts on the
  -- third birthday and Cubs/Colts/kindergarten entry use the Aug 16 cutoff.
  for r in select * from (values
    ('Little Lambs', v_barn, 8, 3, 10,
      '{"rules": [{"kind": "age_months", "min": 0, "min_inclusive": true, "max": 12, "max_inclusive": false, "measured_on": "occurrence"}]}'::jsonb),
    ('Piglets', v_barn, 10, 4, 20,
      '{"rules": [{"kind": "age_months", "min": 12, "min_inclusive": true, "max": 21, "max_inclusive": false, "measured_on": "occurrence"}]}'::jsonb),
    ('Chicklets', v_barn, 12, 4, 30,
      '{"rules": [{"kind": "age_months", "min": 21, "min_inclusive": true, "max": 30, "max_inclusive": false, "measured_on": "occurrence"}]}'::jsonb),
    ('Ducklings', v_barn, 12, 5, 40,
      '{"rules": [{"kind": "age_months", "min": 30, "min_inclusive": true, "max": 36, "max_inclusive": false, "measured_on": "occurrence"}]}'::jsonb),
    ('Cubs', v_barn, 16, 6, 50,
      '{"match": "all", "rules": [{"kind": "age_years", "min": 3, "min_inclusive": true, "measured_on": "occurrence"}, {"kind": "age_years", "max": 4, "max_inclusive": false, "measured_on": "cutoff"}]}'::jsonb),
    ('Colts', v_barn, 16, 6, 60,
      '{"match": "all", "rules": [{"kind": "age_years", "min": 4, "min_inclusive": true, "measured_on": "cutoff"}, {"kind": "grade", "max": -1, "max_inclusive": true}]}'::jsonb),
    ('Kindergarten', v_k5, 20, 8, 70,
      '{"rules": [{"kind": "grade", "min": 0, "min_inclusive": true, "max": 0, "max_inclusive": true}]}'::jsonb),
    ('1st & 2nd', v_k5, 24, 10, 80,
      '{"rules": [{"kind": "grade", "min": 1, "min_inclusive": true, "max": 2, "max_inclusive": true}]}'::jsonb),
    ('3rd to 5th', v_k5, 30, 12, 90,
      '{"rules": [{"kind": "grade", "min": 3, "min_inclusive": true, "max": 5, "max_inclusive": true}]}'::jsonb),
    ('Overflow', v_k5, null, null, 100, '{"manual_only": true, "rules": []}'::jsonb)
  ) as v(name, area_id, capacity, ratio, priority, criteria) loop
    insert into public.rooms (org_id, area_id, name, capacity, children_per_adult, priority, criteria)
    select v_org, r.area_id, r.name, r.capacity, r.ratio, r.priority, r.criteria
    where not exists (select 1 from public.rooms x where x.org_id = v_org and lower(x.name) = lower(r.name) and x.archived_at is null);
  end loop;
  select id into v_cubs from public.rooms where org_id = v_org and name = 'Cubs' and archived_at is null;
  select id into v_colts from public.rooms where org_id = v_org and name = 'Colts' and archived_at is null;
  update public.rooms set overflow_room_id = v_cubs where id = v_colts and overflow_room_id is null;

  -- --------------------------------------------------------- schedules --
  for r in select * from (values ('First service', '09:00'::time), ('Second service', '10:45'::time)) as v(name, local_time) loop
    insert into public.schedules (org_id, name, kind, local_time, duration_minutes, weekdays, interval_weeks, starts_on)
    select v_org, r.name, 'service', r.local_time, 90, '{0}', 1, '2026-11-01'
    where not exists (select 1 from public.schedules s where s.org_id = v_org and s.name = r.name and s.archived_at is null);
  end loop;
  select id into v_first from public.schedules where org_id = v_org and name = 'First service' and archived_at is null;
  select id into v_second from public.schedules where org_id = v_org and name = 'Second service' and archived_at is null;
  insert into public.schedule_rooms (org_id, schedule_id, room_id)
  select v_org, s.id, rm.id
  from public.schedules s
  cross join public.rooms rm
  where s.id in (v_first, v_second) and rm.org_id = v_org and rm.area_id in (v_barn, v_k5) and rm.archived_at is null
  on conflict (schedule_id, room_id) do nothing;

  -- --------------------------------------------------- volunteer needs --
  -- Two volunteers per room per service, arriving twenty minutes early;
  -- three in Little Lambs. Adjust in Check-in › Volunteers.
  insert into public.volunteer_slots (org_id, schedule_id, room_id, needed, arrive_minutes_before)
  select v_org, s.id, rm.id, case when rm.name = 'Little Lambs' then 3 else 2 end, 20
  from public.schedules s
  cross join public.rooms rm
  where s.id in (v_first, v_second) and rm.org_id = v_org and rm.area_id in (v_barn, v_k5) and rm.archived_at is null
    and rm.name <> 'Overflow'
    and not exists (select 1 from public.volunteer_slots vs where vs.schedule_id = s.id and vs.room_id = rm.id and vs.archived_at is null);

  -- ----------------------------------------------------------- labels --
  -- The defaults from packages/core (decision J). 62 mm continuous stock.
  insert into public.label_templates (org_id, name, kind, stock, width_mm, height_mm, is_default, layout)
  select v_org, 'Child label', 'child', 'DK-2205', 62, 29, true, '{"elements": [
      {"type": "text", "field": "full_name", "x": 2, "y": 1.5, "w": 46, "h": 9, "size": 20, "bold": true},
      {"type": "icons", "x": 49, "y": 2, "size": 5},
      {"type": "text", "field": "room", "x": 2, "y": 11, "w": 40, "h": 6, "size": 12},
      {"type": "text", "field": "allergy_short", "x": 2, "y": 17.5, "w": 40, "h": 5, "size": 9},
      {"type": "text", "field": "code", "x": 42, "y": 11, "w": 18, "h": 12, "size": 24, "bold": true, "align": "right"},
      {"type": "text", "field": "service", "x": 2, "y": 23, "w": 30, "h": 4.5, "size": 7},
      {"type": "text", "field": "date", "x": 32, "y": 23, "w": 28, "h": 4.5, "size": 7, "align": "right"}]}'::jsonb
  where not exists (select 1 from public.label_templates t where t.org_id = v_org and t.kind = 'child' and t.archived_at is null);
  insert into public.label_templates (org_id, name, kind, stock, width_mm, height_mm, is_default, layout)
  select v_org, 'Pickup tag', 'pickup', 'DK-2205', 62, 100, true, '{"elements": [
      {"type": "static", "text": "Pickup tag", "x": 2, "y": 2, "w": 58, "h": 6, "size": 10},
      {"type": "text", "field": "code", "x": 2, "y": 10, "w": 58, "h": 24, "size": 56, "bold": true, "align": "center"},
      {"type": "text", "field": "children_names", "x": 2, "y": 38, "w": 58, "h": 40, "size": 14},
      {"type": "text", "field": "service", "x": 2, "y": 84, "w": 58, "h": 5, "size": 9},
      {"type": "text", "field": "date", "x": 2, "y": 90, "w": 58, "h": 5, "size": 9}]}'::jsonb
  where not exists (select 1 from public.label_templates t where t.org_id = v_org and t.kind = 'pickup' and t.archived_at is null);
  insert into public.label_templates (org_id, name, kind, stock, width_mm, height_mm, is_default, layout)
  select v_org, 'Volunteer label', 'volunteer', 'DK-2205 (blue)', 62, 29, true, '{"elements": [
      {"type": "text", "field": "full_name", "x": 2, "y": 2, "w": 58, "h": 10, "size": 20, "bold": true},
      {"type": "text", "field": "role", "x": 2, "y": 13, "w": 58, "h": 7, "size": 12},
      {"type": "text", "field": "date", "x": 2, "y": 22, "w": 58, "h": 5, "size": 8}]}'::jsonb
  where not exists (select 1 from public.label_templates t where t.org_id = v_org and t.kind = 'volunteer' and t.archived_at is null);

  -- ---------------------------------------------------------- stations --
  -- Devices are paired to these in phase 1b. The front desk sees every
  -- room; the Barn roster device sees the Barn; the volunteer station
  -- prints on blue stock.
  for r in select * from (values
    ('Welcome desk kiosk', 'kiosk', null::text, null::uuid),
    ('Welcome desk staffed', 'staffed', null, null),
    ('Barn roster', 'roster', null, v_barn),
    ('Volunteer check-in', 'volunteer', 'DK-2205 (blue)', v_desk)
  ) as v(name, mode, label_stock, scope_area) loop
    insert into public.stations (org_id, name, mode, label_stock)
    select v_org, r.name, r.mode, r.label_stock
    where not exists (select 1 from public.stations s where s.org_id = v_org and s.name = r.name and s.archived_at is null);
    if r.scope_area is not null then
      insert into public.station_scopes (org_id, station_id, area_id)
      select v_org, s.id, r.scope_area from public.stations s where s.org_id = v_org and s.name = r.name and s.archived_at is null
      on conflict (station_id, area_id) do nothing;
    end if;
  end loop;

  -- The next eight weeks of services.
  perform public.generate_occurrences(v_org, chms_private.local_today(v_org) + 56);
end $$;
