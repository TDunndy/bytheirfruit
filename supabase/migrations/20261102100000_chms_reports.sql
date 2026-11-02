-- ============================================================================
-- ChMS check-in 1c, reports: the §9 reports as gated, logged RPCs.
--
-- Every report is a SECURITY DEFINER function that checks `attendance.reports`
-- itself (plus `people.view` where adults are named and `kids.view` where
-- children are named), refuses stations, bounds its date range, and writes
-- one access_log row per call (report.<name>, subject_count = rows returned,
-- the filter in detail). CSV export in the app serialises what was read, so
-- the log row is the record of the read.
--
-- Merges are resolved at read time: `person_merges` (filled by the merge tool
-- in 1c-2) maps a merged record to the one kept, and every report folds a
-- person's history through chms_private.canonical_people(). The attendance
-- projection and the append-only log are never rewritten.
--
-- attendance_baselines gains `last_attended_on`, the family's last Subsplash
-- check-in, so a family that stopped coming before this system started can
-- still be counted as lapsed by the serve-policy report.
-- ============================================================================

alter table public.attendance_baselines add column last_attended_on date;

-- ---------------------------------------------------------- person_merges --
-- One row per merged record: who it became. Append-only; written by
-- merge_people() (1c-2) only.
create table public.person_merges (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kept_person_id uuid not null,
  merged_person_id uuid not null unique,
  merged_by_person_id uuid,
  merged_at timestamptz not null default now(),
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 8192),
  check (kept_person_id <> merged_person_id),
  foreign key (kept_person_id, org_id) references public.people (id, org_id) on delete restrict,
  foreign key (merged_person_id, org_id) references public.people (id, org_id) on delete restrict,
  foreign key (merged_by_person_id, org_id) references public.people (id, org_id) on delete set null (merged_by_person_id)
);
create index idx_person_merges_kept on public.person_merges (kept_person_id);
alter table public.person_merges enable row level security;
create policy "Viewers read merges" on public.person_merges for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.view'))::uuid[]));
create policy "Children's merges need kids.view" on public.person_merges as restrictive for select
  using (org_id = any ((select chms_private.orgs_with_permission('kids.view'))::uuid[])
      or not (chms_private.is_minor(kept_person_id) or chms_private.is_minor(merged_person_id)));
create trigger trg_person_merges_append_only before update or delete on public.person_merges
  for each row execute function chms_private.deny_changes();
create trigger trg_person_merges_no_truncate before truncate on public.person_merges
  for each statement execute function chms_private.deny_changes();

-- The whole alias map of a church, resolved once per query: a merged record
-- and the record it ended up as (chains are followed; a cycle is impossible
-- because a merged record can never be kept again, but the depth is capped).
create or replace function chms_private.canonical_people(p_org_id uuid)
returns table (person_id uuid, canonical_id uuid)
language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select m.merged_person_id as pid, m.kept_person_id as cid, 1 as depth
    from public.person_merges m where m.org_id = p_org_id
    union all
    select c.pid, m.kept_person_id, c.depth + 1
    from chain c join public.person_merges m on m.merged_person_id = c.cid and m.org_id = p_org_id
    where c.depth < 20
  )
  select distinct on (c.pid) c.pid, c.cid from chain c order by c.pid, c.depth desc;
$$;
revoke execute on function chms_private.canonical_people(uuid) from public, anon, authenticated;

create or replace function chms_private.resolve_person(p_person_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select cp.canonical_id
                   from chms_private.canonical_people((select p.org_id from public.people p where p.id = p_person_id)) cp
                   where cp.person_id = p_person_id), p_person_id);
$$;
revoke execute on function chms_private.resolve_person(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ gates --
create or replace function chms_private.require_report(p_org_id uuid, p_also text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_station() or p_org_id is null
     or not public.has_org_permission(p_org_id, 'attendance.reports')
     or exists (select 1 from unnest(p_also) x where not public.has_org_permission(p_org_id, x)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function chms_private.require_report(uuid, text[]) from public, anon, authenticated;

create or replace function chms_private.check_range(p_from date, p_to date)
returns void language plpgsql immutable set search_path = public as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 400 then
    raise exception 'a date range of up to 400 days is required' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function chms_private.check_range(date, date) from public, anon, authenticated;

-- One occurrence's room stays, unfiltered: the twin of room_stays_visible()
-- (20261102..._chms_checkin_c_stays_and_scope). Change the two together.
create or replace function chms_private.occurrence_stays(p_occurrence_id uuid)
returns table (person_id uuid, role text, room_id uuid, from_at timestamptz, to_at timestamptz)
language sql stable security definer set search_path = public as $$
  with live as (
    select ae.id, ae.person_id, ae.role, ae.type, ae.room_id, ae.recorded_at,
           chms_private.effective_at(ae.device_at, ae.clock_offset_ms) as at
    from public.attendance_events ae
    where ae.occurrence_id = p_occurrence_id
      and ae.type in ('check_in', 'move', 'check_out')
      and not exists (select 1 from public.attendance_events v where v.type = 'void' and v.target_event_id = ae.id)
  ), ordered as (
    select l.*, lead(l.at) over (partition by l.person_id order by l.at, l.recorded_at, l.id) as next_at
    from live l
  )
  select o.person_id, o.role, o.room_id, o.at,
         greatest(o.at, coalesce(o.next_at, case when a.status = 'out' then a.checked_out_at end, occ.ends_at))
  from ordered o
  join public.occurrences occ on occ.id = p_occurrence_id
  left join public.attendance a on a.occurrence_id = p_occurrence_id and a.person_id = o.person_id
  where o.type in ('check_in', 'move');
$$;
revoke execute on function chms_private.occurrence_stays(uuid) from public, anon, authenticated;

-- ------------------------------------------------------- per occurrence --
-- One row per service and room: children, volunteers, first-timers (a
-- child's first check-in ever, unless the family came with a baseline) and
-- anomalies, counted by the room the child ended the service in.
create or replace function public.report_occurrences(p_org_id uuid, p_from date, p_to date)
returns table (occurrence_id uuid, local_date date, schedule_name text, starts_at timestamptz, status text,
               room_id uuid, room_name text, area_id uuid, area_name text, area_kind text,
               children integer, volunteers integer, attendees integer, first_timers integer, anomalies integer)
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  perform chms_private.require_report(p_org_id);
  perform chms_private.check_range(p_from, p_to);
  return query
  with cp as (select c.person_id as pid, c.canonical_id as cid from chms_private.canonical_people(p_org_id) c),
  occ as (
    select o.id, o.local_date, o.starts_at, o.status, s.name
    from public.occurrences o join public.schedules s on s.id = o.schedule_id
    where o.org_id = p_org_id and o.local_date between p_from and p_to and o.status <> 'cancelled'
  ), firsts as (
    select x.pid, x.occ_id from (
      select coalesce(cp.cid, a.person_id) as pid, a.occurrence_id as occ_id,
             row_number() over (partition by coalesce(cp.cid, a.person_id) order by o.local_date, o.starts_at, a.checked_in_at) as rn
      from public.attendance a
      join public.occurrences o on o.id = a.occurrence_id
      left join cp on cp.pid = a.person_id
      where a.org_id = p_org_id and a.role = 'child' and a.check_in_event_id is not null and o.status <> 'cancelled') x
    where x.rn = 1
      and not exists (select 1 from public.household_members hm
                      join public.attendance_baselines b on b.household_id = hm.household_id
                      where hm.person_id = x.pid and hm.ended_at is null)
  ), att as (
    select a.occurrence_id as occ_id, a.room_id as rid, a.role as arole, a.anomalies as anom,
           coalesce(cp.cid, a.person_id) as pid,
           exists (select 1 from firsts f where f.pid = coalesce(cp.cid, a.person_id) and f.occ_id = a.occurrence_id) as is_first
    from public.attendance a
    left join cp on cp.pid = a.person_id
    where a.org_id = p_org_id and a.check_in_event_id is not null and a.occurrence_id in (select x.id from occ x)
  )
  select occ.id, occ.local_date, occ.name, occ.starts_at, occ.status,
         r.id, r.name, ar.id, ar.name, ar.kind,
         count(att.pid) filter (where att.arole = 'child')::integer,
         count(att.pid) filter (where att.arole in ('volunteer', 'leader'))::integer,
         count(att.pid) filter (where att.arole = 'attendee')::integer,
         count(att.pid) filter (where att.arole = 'child' and att.is_first)::integer,
         count(att.pid) filter (where cardinality(att.anom) > 0)::integer
  from occ
  left join att on att.occ_id = occ.id
  left join public.rooms r on r.id = att.rid
  left join public.areas ar on ar.id = r.area_id
  group by occ.id, occ.local_date, occ.name, occ.starts_at, occ.status, r.id, r.name, ar.id, ar.name, ar.kind, ar.sort_order
  order by occ.local_date, occ.starts_at, ar.sort_order nulls last, r.name;
  get diagnostics v_n = row_count;
  perform chms_private.log_access(p_org_id, 'report.occurrences', null, v_n, jsonb_build_object('from', p_from, 'to', p_to));
end;
$$;

-- Children and adults in each room through the service, in steps of a few
-- minutes, so the ratio can be seen as it moved.
create or replace function public.report_occurrence_timeline(p_occurrence_id uuid, p_step_minutes integer default 5)
returns table (at timestamptz, room_id uuid, room_name text, children integer, adults integer)
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_step interval;
  v_n integer;
begin
  select o.org_id, o.starts_at, o.ends_at into v_org, v_start, v_end from public.occurrences o where o.id = p_occurrence_id;
  if v_org is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform chms_private.require_report(v_org);
  if p_step_minutes is null or p_step_minutes < 1 or p_step_minutes > 60 then
    raise exception 'step is 1 to 60 minutes' using errcode = '22023';
  end if;
  v_step := make_interval(mins => p_step_minutes);
  return query
  with st as (select s.person_id as pid, s.role as srole, s.room_id as rid, s.from_at, s.to_at from chms_private.occurrence_stays(p_occurrence_id) s),
  span as (
    select date_bin(v_step, least(v_start - interval '60 minutes', coalesce((select min(x.from_at) from st x), v_start)), timestamptz 'epoch') as lo,
           greatest(v_end, coalesce((select max(x.to_at) from st x), v_end)) as hi
  ), ticks as (select g.t from span sp, generate_series(sp.lo, sp.hi, v_step) g(t)),
  rms as (select distinct x.rid from st x)
  select t.t, r.id, r.name,
         count(st.pid) filter (where st.srole = 'child')::integer,
         count(st.pid) filter (where st.srole in ('volunteer', 'leader'))::integer
  from ticks t
  cross join rms
  join public.rooms r on r.id = rms.rid
  left join st on st.rid = r.id and st.from_at <= t.t and st.to_at > t.t
  group by t.t, r.id, r.name
  order by t.t, r.name;
  get diagnostics v_n = row_count;
  perform chms_private.log_access(v_org, 'report.occurrence_timeline', null, v_n, jsonb_build_object('occurrence_id', p_occurrence_id, 'step', p_step_minutes));
end;
$$;

-- --------------------------------------------------------------- per child --
-- Every child of the church (and anyone who checked in as a child in the
-- range): check-ins in the range by month, first and last attended ever, the
-- last room, and how many services of their own schedules they have missed
-- in a row (services that actually ran, up to today).
create or replace function public.report_children(p_org_id uuid, p_from date, p_to date)
returns table (person_id uuid, first_name text, last_name text, preferred_name text, birthdate date, gender text,
               tags text[], custom jsonb, grade_override smallint, grade_override_year smallint,
               household_id uuid, household_name text,
               attended integer, by_month jsonb, first_attended date, last_attended date,
               last_room_id uuid, last_room_name text, consecutive_absences integer)
language plpgsql security definer set search_path = public as $$
declare
  v_today date;
  v_n integer;
begin
  perform chms_private.require_report(p_org_id, array['kids.view']);
  perform chms_private.check_range(p_from, p_to);
  v_today := chms_private.local_today(p_org_id);
  return query
  with cp as (select c.person_id as pid, c.canonical_id as cid from chms_private.canonical_people(p_org_id) c),
  att as (
    select coalesce(cp.cid, a.person_id) as pid, a.occurrence_id as occ_id, o.local_date as d, o.schedule_id as sid, o.starts_at as st,
           a.room_id as rid, a.checked_in_at as cin
    from public.attendance a
    join public.occurrences o on o.id = a.occurrence_id
    left join cp on cp.pid = a.person_id
    where a.org_id = p_org_id and a.role = 'child' and a.check_in_event_id is not null and o.status <> 'cancelled'
  ), kids as (
    select p.id
    from public.people p
    where p.org_id = p_org_id and p.archived_at is null
      and (chms_private.is_minor(p.id, p.birthdate, p.org_id)
           or exists (select 1 from att x where x.pid = p.id and x.d between p_from and p_to))
  ), agg as (
    select k.id, count(x.occ_id) filter (where x.d between p_from and p_to)::integer as attended, min(x.d) as first_d, max(x.d) as last_d
    from kids k left join att x on x.pid = k.id
    group by k.id
  ), months as (
    select y.pid, jsonb_object_agg(y.m, y.n) as by_month
    from (select x.pid, to_char(x.d, 'YYYY-MM') as m, count(*) as n from att x where x.d between p_from and p_to group by x.pid, to_char(x.d, 'YYYY-MM')) y
    group by y.pid
  ), last_room as (
    select distinct on (x.pid) x.pid, x.rid from att x order by x.pid, x.d desc, x.st desc, x.cin desc nulls last
  ), absences as (
    select k.id, count(distinct o.local_date)::integer as n
    from kids k
    join agg g on g.id = k.id
    join public.occurrences o on o.org_id = p_org_id and o.status <> 'cancelled'
      and o.local_date > g.last_d and o.local_date <= least(p_to, v_today)
      and o.schedule_id in (select distinct x.sid from att x where x.pid = k.id)
      and exists (select 1 from public.attendance a2 where a2.occurrence_id = o.id and a2.role = 'child' and a2.check_in_event_id is not null)
    group by k.id
  ), hh as (
    select distinct on (hm.person_id) hm.person_id as pid, h.id as hid, h.name as hname
    from public.household_members hm
    join public.households h on h.id = hm.household_id and h.archived_at is null
    where hm.org_id = p_org_id and hm.ended_at is null
    order by hm.person_id, hm.created_at, h.created_at, h.id
  )
  select p.id, p.first_name, p.last_name, p.preferred_name, p.birthdate, p.gender, p.tags, p.custom, p.grade_override, p.grade_override_year,
         hh.hid, hh.hname, coalesce(g.attended, 0), coalesce(m.by_month, '{}'::jsonb), g.first_d, g.last_d, lr.rid, r.name, coalesce(ab.n, 0)
  from kids k
  join public.people p on p.id = k.id
  left join agg g on g.id = k.id
  left join months m on m.pid = k.id
  left join last_room lr on lr.pid = k.id
  left join public.rooms r on r.id = lr.rid
  left join absences ab on ab.id = k.id
  left join hh on hh.pid = k.id
  order by p.last_name, p.first_name, p.id;
  get diagnostics v_n = row_count;
  perform chms_private.log_access(p_org_id, 'report.children', null, v_n, jsonb_build_object('from', p_from, 'to', p_to));
end;
$$;

-- One child's services, newest first, through every record they were merged from.
create or replace function public.report_child_history(p_person_id uuid)
returns table (occurrence_id uuid, local_date date, schedule_name text, role text, first_room_name text, room_name text,
               checked_in_at timestamptz, checked_out_at timestamptz, status text, pickup_status text, anomalies text[])
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_canon uuid;
  v_n integer;
begin
  select p.org_id into v_org from public.people p where p.id = p_person_id;
  if v_org is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform chms_private.require_report(v_org, array['kids.view']);
  v_canon := chms_private.resolve_person(p_person_id);
  return query
  select a.occurrence_id, o.local_date, s.name, a.role, r1.name, r2.name, a.checked_in_at, a.checked_out_at, a.status, a.pickup_status, a.anomalies
  from public.attendance a
  join public.occurrences o on o.id = a.occurrence_id
  join public.schedules s on s.id = o.schedule_id
  left join public.rooms r1 on r1.id = a.first_room_id
  left join public.rooms r2 on r2.id = a.room_id
  where a.org_id = v_org and a.check_in_event_id is not null and o.status <> 'cancelled'
    and (a.person_id = v_canon
         or a.person_id in (select c.person_id from chms_private.canonical_people(v_org) c where c.canonical_id = v_canon))
  order by o.local_date desc, o.starts_at desc;
  get diagnostics v_n = row_count;
  perform chms_private.log_access(v_org, 'report.child_history', v_canon, v_n, '{}');
end;
$$;

-- -------------------------------------------------------------- per family --
-- The serve-policy report (the Monday numbers): each family's child check-ins
-- in kids rooms this year, one per child per service, plus its baseline; who
-- served; the flags; the area with most of its check-ins (ties to the area
-- with the youngest band); and why the family is excluded, if it is.
--
-- A check-in counts toward the family whose pass it was made with, while the
-- child still belongs to that family; otherwise toward every family the child
-- belongs to (an admin check-in, or a guest family that was merged away).
create or replace function public.report_families(p_org_id uuid, p_year integer, p_as_of date default null, p_threshold integer default 10)
returns table (household_id uuid, household_name text, parents text[], children jsonb,
               checkins integer, baseline integer, total integer, last_seen date,
               serves_ytd integer, serving_adult boolean, flags text[], area_id uuid, area_name text,
               exclusion text, over_threshold boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_as_of date;
  v_from date;
  v_n integer;
begin
  perform chms_private.require_report(p_org_id, array['people.view', 'kids.view']);
  v_as_of := coalesce(p_as_of, chms_private.local_today(p_org_id));
  if p_year is null or p_year < 2000 or p_year > 2100 or extract(year from v_as_of) <> p_year then
    raise exception 'the as-of date must fall in the year' using errcode = '22023';
  end if;
  if p_threshold is null or p_threshold < 1 or p_threshold > 1000 then
    raise exception 'threshold is 1 to 1000' using errcode = '22023';
  end if;
  v_from := make_date(p_year, 1, 1);
  return query
  with cp as (select c.person_id as pid, c.canonical_id as cid from chms_private.canonical_people(p_org_id) c),
  kids_rooms as (
    select r.id, r.area_id from public.rooms r join public.areas ar on ar.id = r.area_id
    where r.org_id = p_org_id and ar.kind = 'kids'
  ), chk as (
    select a.occurrence_id as occ_id, coalesce(cp.cid, a.person_id) as child_id, a.household_id as sess_hh, o.local_date as d, a.room_id as rid, kr.area_id as aid
    from public.attendance a
    join public.occurrences o on o.id = a.occurrence_id
    join kids_rooms kr on kr.id = a.room_id
    left join cp on cp.pid = a.person_id
    where a.org_id = p_org_id and a.role = 'child' and a.check_in_event_id is not null
      and o.status <> 'cancelled' and o.local_date between v_from and v_as_of
  ), chk2 as (
    select c.*, exists (select 1 from public.household_members hm join public.households h on h.id = hm.household_id
                        where hm.household_id = c.sess_hh and hm.person_id = c.child_id and hm.ended_at is null and h.archived_at is null) as sess_ok
    from chk c
  ), attributed as (
    select distinct c.occ_id, c.child_id, c.d, c.aid, c.rid, case when c.sess_ok then c.sess_hh else hm.household_id end as hid
    from chk2 c
    left join public.household_members hm on not c.sess_ok and hm.person_id = c.child_id and hm.ended_at is null
    left join public.households h on h.id = hm.household_id
    where c.sess_ok or (hm.household_id is not null and h.archived_at is null)
  ), hh as (
    select h.id, h.name from public.households h where h.org_id = p_org_id and h.archived_at is null
  ), counts as (
    select t.hid, count(*)::integer as n, max(t.d) as last_d from attributed t group by t.hid
  ), base as (
    select b.household_id as hid, b.count as n, b.last_attended_on as lad
    from public.attendance_baselines b where b.org_id = p_org_id and b.year = p_year
  ), adults as (
    select hm.household_id as hid, hm.person_id as pid
    from public.household_members hm
    join public.people p on p.id = hm.person_id and p.archived_at is null
    where hm.org_id = p_org_id and hm.ended_at is null and hm.relationship <> 'child'
      and not chms_private.is_minor(p.id, p.birthdate, p.org_id)
  ), serves as (
    select ad.hid,
           count(*) filter (where o.local_date >= v_from)::integer as ytd,
           bool_or(o.local_date >= v_as_of - 90) as recent
    from adults ad
    join (select a.occurrence_id as occ_id, a.room_id as rid, coalesce(cp.cid, a.person_id) as pid
          from public.attendance a left join cp on cp.pid = a.person_id
          where a.org_id = p_org_id and a.role in ('volunteer', 'leader') and a.check_in_event_id is not null) sv on sv.pid = ad.pid
    join public.occurrences o on o.id = sv.occ_id
    where sv.rid in (select kr.id from kids_rooms kr) and o.status <> 'cancelled'
      and o.local_date between least(v_from, v_as_of - 90) and v_as_of
    group by ad.hid
  ), flg as (
    select f.household_id as hid, array_agg(f.flag order by f.flag) as flags
    from public.household_flags f where f.org_id = p_org_id and f.cleared_at is null
    group by f.household_id
  ), area_pick as (
    select distinct on (x.hid) x.hid, x.aid
    from (select t.hid, t.aid, count(*) as n from attributed t group by t.hid, t.aid) x
    join public.areas ar on ar.id = x.aid
    order by x.hid, x.n desc, lower(ar.age_band) nulls last, ar.sort_order, ar.name
  ), members as (
    select hm.household_id as hid,
      array_agg(p.first_name || ' ' || p.last_name order by hm.relationship, p.first_name)
        filter (where hm.relationship <> 'child' and not chms_private.is_minor(p.id, p.birthdate, p.org_id)) as parents,
      jsonb_agg(jsonb_build_object('person_id', p.id, 'name', p.first_name || ' ' || p.last_name,
                  'room_name', (select r.name from attributed t join public.rooms r on r.id = t.rid
                                where t.child_id = p.id and t.hid = hm.household_id order by t.d desc limit 1))
                order by p.birthdate, p.first_name)
        filter (where hm.relationship = 'child' or chms_private.is_minor(p.id, p.birthdate, p.org_id)) as children
    from public.household_members hm
    join public.people p on p.id = hm.person_id and p.archived_at is null
    where hm.org_id = p_org_id and hm.ended_at is null
    group by hm.household_id
  )
  select hh.id, hh.name, coalesce(m.parents, '{}'::text[]), coalesce(m.children, '[]'::jsonb),
         coalesce(c.n, 0), coalesce(b.n, 0), coalesce(c.n, 0) + coalesce(b.n, 0),
         greatest(c.last_d, b.lad), coalesce(s.ytd, 0), coalesce(s.recent, false), coalesce(f.flags, '{}'::text[]),
         ap.aid, ar.name,
         case when f.flags && array['pastoral_hold', 'exempt', 'joining_team', 'serving_elsewhere', 'no_longer_attending']
                then (select x from unnest(array['pastoral_hold', 'exempt', 'joining_team', 'serving_elsewhere', 'no_longer_attending']) x
                      where x = any (f.flags) limit 1)
              when coalesce(s.recent, false) then 'serving'
              when greatest(c.last_d, b.lad) < v_as_of - interval '3 months' then 'lapsed'
         end,
         coalesce(c.n, 0) + coalesce(b.n, 0) >= p_threshold
  from hh
  left join counts c on c.hid = hh.id
  left join base b on b.hid = hh.id
  left join serves s on s.hid = hh.id
  left join flg f on f.hid = hh.id
  left join members m on m.hid = hh.id
  left join area_pick ap on ap.hid = hh.id
  left join public.areas ar on ar.id = ap.aid
  where coalesce(c.n, 0) + coalesce(b.n, 0) > 0
  order by (coalesce(c.n, 0) + coalesce(b.n, 0)) desc, hh.name;
  get diagnostics v_n = row_count;
  perform chms_private.log_access(p_org_id, 'report.families', null, v_n,
    jsonb_build_object('year', p_year, 'as_of', v_as_of, 'threshold', p_threshold));
end;
$$;

-- ------------------------------------------------------------- volunteers --
-- One row per scheduled need and per unscheduled serve: who was expected,
-- who came, and early / on time / late / no-show / unscheduled.
create or replace function public.report_volunteers(p_org_id uuid, p_from date, p_to date)
returns table (local_date date, occurrence_id uuid, schedule_name text, person_id uuid, name text,
               room_id uuid, room_name text, slot_label text, role_name text,
               scheduled boolean, assignment_status text, attended boolean, checked_in_at timestamptz,
               punctuality text, minutes_vs_expected integer)
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  perform chms_private.require_report(p_org_id, array['people.view']);
  perform chms_private.check_range(p_from, p_to);
  return query
  with cp as (select c.person_id as pid, c.canonical_id as cid from chms_private.canonical_people(p_org_id) c),
  occ as (
    select o.id, o.local_date, o.starts_at, o.ends_at, o.schedule_id, s.name
    from public.occurrences o join public.schedules s on s.id = o.schedule_id
    where o.org_id = p_org_id and o.local_date between p_from and p_to and o.status <> 'cancelled'
  ), assigned as (
    select va.id as aid, coalesce(cp.cid, va.person_id) as pid, va.status as st, sl.room_id as rid, sl.label as lbl, sl.role_id as role_id, o.id as occ_id
    from public.volunteer_assignments va
    join public.volunteer_slots sl on sl.id = va.slot_id and sl.archived_at is null
    left join cp on cp.pid = va.person_id
    join occ o on o.local_date = va.local_date and (sl.occurrence_id = o.id or (sl.occurrence_id is null and sl.schedule_id = o.schedule_id))
    where va.org_id = p_org_id and va.local_date between p_from and p_to
  ), served as (
    select coalesce(cp.cid, a.person_id) as pid, a.occurrence_id as occ_id, a.room_id as rid, a.checked_in_at as cin,
           a.punctuality as punct, a.minutes_vs_expected as mins
    from public.attendance a
    left join cp on cp.pid = a.person_id
    where a.org_id = p_org_id and a.role in ('volunteer', 'leader') and a.check_in_event_id is not null
      and a.occurrence_id in (select x.id from occ x)
  )
  select o.local_date, o.id, o.name, p.id, p.first_name || ' ' || p.last_name,
         coalesce(asg.rid, sv.rid), r.name, asg.lbl, orl.name,
         asg.aid is not null, asg.st, sv.pid is not null, sv.cin,
         case when sv.pid is not null and (asg.aid is null or asg.st = 'declined') then 'unscheduled'
              when sv.pid is not null then sv.punct
              when asg.st = 'declined' then 'declined'
              when o.ends_at < now() then 'no_show'
         end,
         sv.mins
  from assigned asg
  full outer join served sv on sv.pid = asg.pid and sv.occ_id = asg.occ_id
  join occ o on o.id = coalesce(asg.occ_id, sv.occ_id)
  join public.people p on p.id = coalesce(asg.pid, sv.pid)
  left join public.rooms r on r.id = coalesce(asg.rid, sv.rid)
  left join public.org_roles orl on orl.id = asg.role_id
  order by o.local_date, o.starts_at, p.last_name, p.first_name, asg.lbl;
  get diagnostics v_n = row_count;
  perform chms_private.log_access(p_org_id, 'report.volunteers', null, v_n, jsonb_build_object('from', p_from, 'to', p_to));
end;
$$;

-- -------------------------------------------------------------------- ops --
-- Per day: passes and how long they took, check-ins, labels (first prints,
-- reprints, failures), events that reached the server late, passes queued
-- offline, anomalies, alerts and the stations in use.
create or replace function public.report_ops(p_org_id uuid, p_from date, p_to date)
returns table (local_date date, sessions integer, completed_sessions integer, avg_session_seconds integer, checkins integer,
               prints integer, reprints integer, print_failures integer, delayed_events integer, offline_sessions integer,
               anomalies integer, alerts integer, stations_used integer)
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  perform chms_private.require_report(p_org_id);
  perform chms_private.check_range(p_from, p_to);
  return query
  with days as (select g.ts::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g(ts)),
  sess as (
    select cs.local_date as d, count(*)::integer as n,
           count(*) filter (where cs.completed_at is not null)::integer as done,
           avg(extract(epoch from (cs.completed_at - coalesce(cs.device_at, cs.started_at))))
             filter (where cs.completed_at is not null
                       and cs.completed_at - coalesce(cs.device_at, cs.started_at) between interval '0' and interval '1 hour') as avg_s,
           count(*) filter (where cs.queued_offline)::integer as offline
    from public.checkin_sessions cs
    where cs.org_id = p_org_id and cs.local_date between p_from and p_to
    group by cs.local_date
  ), ev as (
    select o.local_date as d,
           count(*) filter (where ae.type = 'check_in')::integer as cin,
           count(*) filter (where ae.type = 'label_print_requested' and ae.session_id is not null)::integer as prints,
           count(*) filter (where ae.type = 'label_print_requested' and ae.session_id is null)::integer as reprints,
           count(*) filter (where ae.type = 'print_failed')::integer as failed,
           count(*) filter (where ae.recorded_at - chms_private.effective_at(ae.device_at, ae.clock_offset_ms) > interval '2 minutes')::integer as delayed
    from public.attendance_events ae
    join public.occurrences o on o.id = ae.occurrence_id
    where ae.org_id = p_org_id and o.local_date between p_from and p_to
    group by o.local_date
  ), anom as (
    select o.local_date as d, count(*)::integer as n
    from public.attendance a join public.occurrences o on o.id = a.occurrence_id
    where a.org_id = p_org_id and o.local_date between p_from and p_to and cardinality(a.anomalies) > 0
    group by o.local_date
  ), al as (
    select x.d, count(*)::integer as n from (
      select coalesce(o.local_date, (sa.raised_at at time zone coalesce(st.time_zone, 'UTC'))::date) as d
      from public.station_alerts sa
      left join public.occurrences o on o.id = sa.occurrence_id
      left join public.org_checkin_settings st on st.org_id = sa.org_id
      where sa.org_id = p_org_id) x
    where x.d between p_from and p_to
    group by x.d
  ), stn as (
    select y.d, count(distinct y.sid)::integer as n from (
      select cs.local_date as d, cs.station_id as sid from public.checkin_sessions cs
      where cs.org_id = p_org_id and cs.local_date between p_from and p_to and cs.station_id is not null
      union
      select o.local_date, ae.station_id from public.attendance_events ae join public.occurrences o on o.id = ae.occurrence_id
      where ae.org_id = p_org_id and o.local_date between p_from and p_to and ae.station_id is not null) y
    group by y.d
  )
  select dd.d, coalesce(s.n, 0), coalesce(s.done, 0), round(s.avg_s)::integer, coalesce(e.cin, 0),
         coalesce(e.prints, 0), coalesce(e.reprints, 0), coalesce(e.failed, 0), coalesce(e.delayed, 0), coalesce(s.offline, 0),
         coalesce(an.n, 0), coalesce(al.n, 0), coalesce(stn.n, 0)
  from days dd
  left join sess s on s.d = dd.d
  left join ev e on e.d = dd.d
  left join anom an on an.d = dd.d
  left join al on al.d = dd.d
  left join stn on stn.d = dd.d
  where s.n is not null or e.d is not null or al.n is not null
  order by dd.d;
  get diagnostics v_n = row_count;
  perform chms_private.log_access(p_org_id, 'report.ops', null, v_n, jsonb_build_object('from', p_from, 'to', p_to));
end;
$$;

-- Arrivals through one day, per station, in steps of a few minutes.
create or replace function public.report_arrivals(p_org_id uuid, p_local_date date, p_step_minutes integer default 5)
returns table (at timestamptz, station_id uuid, station_name text, sessions integer, checkins integer)
language plpgsql security definer set search_path = public as $$
declare
  v_step interval;
  v_n integer;
begin
  perform chms_private.require_report(p_org_id);
  if p_local_date is null then
    raise exception 'a date is required' using errcode = '22023';
  end if;
  if p_step_minutes is null or p_step_minutes < 1 or p_step_minutes > 60 then
    raise exception 'step is 1 to 60 minutes' using errcode = '22023';
  end if;
  v_step := make_interval(mins => p_step_minutes);
  return query
  with s as (
    select date_bin(v_step, coalesce(cs.device_at, cs.started_at), timestamptz 'epoch') as t, cs.station_id as sid, count(*)::integer as n
    from public.checkin_sessions cs
    where cs.org_id = p_org_id and cs.local_date = p_local_date
    group by 1, 2
  ), e as (
    select date_bin(v_step, chms_private.effective_at(ae.device_at, ae.clock_offset_ms), timestamptz 'epoch') as t, ae.station_id as sid, count(*)::integer as n
    from public.attendance_events ae
    join public.occurrences o on o.id = ae.occurrence_id
    where ae.org_id = p_org_id and o.local_date = p_local_date and ae.type = 'check_in'
    group by 1, 2
  )
  select coalesce(s.t, e.t), coalesce(s.sid, e.sid), st.name, coalesce(s.n, 0), coalesce(e.n, 0)
  from s
  full outer join e on e.t = s.t and e.sid is not distinct from s.sid
  left join public.stations st on st.id = coalesce(s.sid, e.sid)
  order by 1, 3 nulls last;
  get diagnostics v_n = row_count;
  perform chms_private.log_access(p_org_id, 'report.arrivals', null, v_n, jsonb_build_object('local_date', p_local_date, 'step', p_step_minutes));
end;
$$;

-- ----------------------------------------------------------------- grants --
revoke execute on function
  public.report_occurrences(uuid, date, date), public.report_occurrence_timeline(uuid, integer),
  public.report_children(uuid, date, date), public.report_child_history(uuid),
  public.report_families(uuid, integer, date, integer), public.report_volunteers(uuid, date, date),
  public.report_ops(uuid, date, date), public.report_arrivals(uuid, date, integer)
  from public, anon;
grant execute on function
  public.report_occurrences(uuid, date, date), public.report_occurrence_timeline(uuid, integer),
  public.report_children(uuid, date, date), public.report_child_history(uuid),
  public.report_families(uuid, integer, date, integer), public.report_volunteers(uuid, date, date),
  public.report_ops(uuid, date, date), public.report_arrivals(uuid, date, integer)
  to authenticated, service_role;
