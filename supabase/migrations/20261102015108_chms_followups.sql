-- ============================================================================
-- ChMS follow-ups (G2): a first-time family gets a task for the right person.
--
-- tasks is the case view the rules engine (Migration E) will write to later;
-- for now one built-in rule runs as a trigger: the first child check-in of a
-- new household (no baseline, no earlier check-in, created within thirty days
-- or made only of visitors) opens a first_visit task, routed by the room's
-- area to that area's director, or, without a room, by the youngest child's
-- age to the area whose age band holds it (areas.age_band, months), else to
-- the church's default assignee (org_checkin_settings.followup_*). Staff can
-- mark a family or person as first-time by hand; the intake form (G3) does the
-- same with source 'form'. One task per household (dedupe_key). A task is
-- read and closed by check-in managers, its assignee (person or role) and the
-- directors and leaders of its area; closed tasks are history.
-- ============================================================================

-- -------------------------------------------------------------- routing --
alter table public.areas add column age_band int4range
  check (age_band is null or (lower(age_band) >= 0 and upper(age_band) <= 300 and not isempty(age_band)));
alter table public.org_checkin_settings
  add column followup_role_id uuid,
  add column followup_person_id uuid,
  add constraint org_checkin_settings_followup_role_fkey foreign key (followup_role_id, org_id) references public.org_roles (id, org_id) on delete set null (followup_role_id),
  add constraint org_checkin_settings_followup_person_fkey foreign key (followup_person_id, org_id) references public.people (id, org_id) on delete set null (followup_person_id);

-- ------------------------------------------------------------------ tasks --
create table public.tasks (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('first_visit', 'manual')),
  title text check (title is null or length(title) <= 160),
  subject_household_id uuid,
  subject_person_id uuid,
  area_id uuid,
  assignee_role_id uuid,
  assignee_person_id uuid,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  source text not null check (source in ('checkin', 'form', 'staff', 'rule')),
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096),
  due_on date,
  opened_at timestamptz not null default now(),
  opened_by_person_id uuid,
  closed_at timestamptz,
  closed_by_person_id uuid,
  close_note text check (close_note is null or length(close_note) <= 2000),
  dedupe_key text check (dedupe_key is null or length(dedupe_key) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  check ((status = 'open') = (closed_at is null)),
  check (kind <> 'manual' or title is not null),
  foreign key (subject_household_id, org_id) references public.households (id, org_id) on delete set null (subject_household_id),
  foreign key (subject_person_id, org_id) references public.people (id, org_id) on delete set null (subject_person_id),
  foreign key (area_id, org_id) references public.areas (id, org_id) on delete set null (area_id),
  foreign key (assignee_role_id, org_id) references public.org_roles (id, org_id) on delete set null (assignee_role_id),
  foreign key (assignee_person_id, org_id) references public.people (id, org_id) on delete set null (assignee_person_id),
  foreign key (opened_by_person_id, org_id) references public.people (id, org_id) on delete set null (opened_by_person_id),
  foreign key (closed_by_person_id, org_id) references public.people (id, org_id) on delete set null (closed_by_person_id)
);
create unique index idx_tasks_dedupe on public.tasks (org_id, dedupe_key) where dedupe_key is not null;
create index idx_tasks_open on public.tasks (org_id, opened_at desc) where status = 'open';
create index idx_tasks_assignee_person on public.tasks (assignee_person_id) where status = 'open';
create index idx_tasks_assignee_role on public.tasks (assignee_role_id) where status = 'open';
create index idx_tasks_household on public.tasks (subject_household_id);
create index idx_tasks_person on public.tasks (subject_person_id);
alter table public.tasks enable row level security;

-- Who the caller is, for task visibility: their roles and the areas they lead.
create or replace function chms_private.my_role_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct pr.role_id), '{}') from public.person_roles pr where pr.person_id = any (chms_private.my_person_ids());
$$;
create or replace function chms_private.my_led_area_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct al.area_id), '{}') from public.area_leaders al
  where al.person_id = any (chms_private.my_person_ids()) or al.role_id = any (chms_private.my_role_ids());
$$;
revoke execute on function chms_private.my_role_ids(), chms_private.my_led_area_ids() from public, anon;
grant execute on function chms_private.my_role_ids(), chms_private.my_led_area_ids() to authenticated, service_role;

-- A task keeps its subject, kind and source; a closed task is history. The
-- close stamps who did it from the login, never from the row.
create or replace function chms_private.protect_task()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a record;
begin
  if old.status <> 'open' then
    raise exception 'a closed task is history' using errcode = '42501';
  end if;
  new.org_id := old.org_id;
  new.kind := old.kind;
  new.source := old.source;
  new.subject_household_id := old.subject_household_id;
  new.subject_person_id := old.subject_person_id;
  new.dedupe_key := old.dedupe_key;
  new.opened_at := old.opened_at;
  new.opened_by_person_id := old.opened_by_person_id;
  new.created_at := old.created_at;
  if new.status <> 'open' then
    select * into a from chms_private.actor_for(new.org_id);
    new.closed_at := now();
    new.closed_by_person_id := a.person_id;
  else
    new.closed_at := null;
    new.closed_by_person_id := null;
  end if;
  return new;
end;
$$;
revoke execute on function chms_private.protect_task() from public, anon, authenticated;
create trigger trg_tasks_protect before update on public.tasks for each row execute function chms_private.protect_task();
create trigger trg_tasks_touch before update on public.tasks for each row execute function public.chms_touch();
create trigger trg_tasks_no_delete before delete on public.tasks for each row execute function chms_private.deny_changes();

create or replace function chms_private.task_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_payload jsonb := jsonb_build_object('kind', new.kind, 'source', new.source, 'status', new.status, 'area_id', new.area_id,
    'assignee_person_id', new.assignee_person_id, 'assignee_role_id', new.assignee_role_id,
    'subject_household_id', new.subject_household_id, 'subject_person_id', new.subject_person_id);
begin
  if tg_op = 'INSERT' then
    perform chms_private.emit_event(new.org_id, 'task.created', 'task', new.id, v_payload);
  elsif new.status <> old.status then
    perform chms_private.emit_event(new.org_id, 'task.closed', 'task', new.id, v_payload);
  elsif new.assignee_person_id is distinct from old.assignee_person_id or new.assignee_role_id is distinct from old.assignee_role_id then
    perform chms_private.emit_event(new.org_id, 'task.reassigned', 'task', new.id, v_payload);
  end if;
  return null;
end;
$$;
revoke execute on function chms_private.task_events() from public, anon, authenticated;
create trigger trg_tasks_events after insert or update on public.tasks for each row execute function chms_private.task_events();
create trigger trg_audit_tasks after insert or update or delete on public.tasks for each row execute function chms_private.audit_row();
create policy "Task audit follows checkin.manage" on public.chms_audit for select
  using (table_name = 'tasks' and org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));

-- Where a first visit goes: the room's area, else the area whose age band
-- holds the child (the youngest child of the family when none is named; the
-- older band wins an overlap), then the area's director (a person before a
-- role), else the church's default.
create or replace function chms_private.route_first_visit(p_org_id uuid, p_household_id uuid, p_person_id uuid, p_room_id uuid,
  out o_area_id uuid, out o_assignee_role_id uuid, out o_assignee_person_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  v_birth date;
  v_today date := chms_private.local_today(p_org_id);
  v_months integer;
begin
  if p_room_id is not null then
    select r.area_id into o_area_id from public.rooms r where r.id = p_room_id and r.org_id = p_org_id;
  end if;
  if o_area_id is null then
    if p_person_id is not null then
      select p.birthdate into v_birth from public.people p where p.id = p_person_id and p.org_id = p_org_id;
    elsif p_household_id is not null then
      select p.birthdate into v_birth
      from public.household_members m join public.people p on p.id = m.person_id and p.archived_at is null
      where m.household_id = p_household_id and m.ended_at is null and m.relationship = 'child' and p.birthdate is not null
      order by p.birthdate desc limit 1;
    end if;
    if v_birth is not null then
      v_months := (extract(year from age(v_today, v_birth)) * 12 + extract(month from age(v_today, v_birth)))::integer;
      select a.id into o_area_id from public.areas a
      where a.org_id = p_org_id and a.archived_at is null and a.kind = 'kids' and a.age_band is not null and a.age_band @> v_months
      order by lower(a.age_band) desc limit 1;
    end if;
  end if;
  if o_area_id is not null then
    select al.person_id, al.role_id into o_assignee_person_id, o_assignee_role_id
    from public.area_leaders al where al.area_id = o_area_id and al.kind = 'director'
    order by al.person_id nulls last, al.created_at limit 1;
  end if;
  if o_assignee_person_id is null and o_assignee_role_id is null then
    select s.followup_person_id, s.followup_role_id into o_assignee_person_id, o_assignee_role_id
    from public.org_checkin_settings s where s.org_id = p_org_id;
    if o_assignee_person_id is not null then o_assignee_role_id := null; end if;
  end if;
end;
$$;
revoke execute on function chms_private.route_first_visit(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- New to the church: made in the last thirty days, or every adult is still a
-- visitor with no joining date.
create or replace function chms_private.household_is_new(p_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.households h where h.id = p_household_id and h.created_at > now() - interval '30 days')
      or (exists (select 1 from public.household_members m where m.household_id = p_household_id and m.ended_at is null)
          and not exists (select 1 from public.household_members m join public.people p on p.id = m.person_id
                          where m.household_id = p_household_id and m.ended_at is null and m.relationship <> 'child'
                            and (p.membership_status <> 'visitor' or p.joined_date is not null)));
$$;
revoke execute on function chms_private.household_is_new(uuid) from public, anon, authenticated;

-- Opens the task once per household (or per person with no family).
create or replace function chms_private.open_first_visit(p_org_id uuid, p_household_id uuid, p_person_id uuid, p_room_id uuid, p_source text, p_detail jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r record;
  a record;
  v_id uuid;
  v_key text := case when p_household_id is not null then 'first_visit:' || p_household_id::text else 'first_visit:person:' || p_person_id::text end;
begin
  if p_household_id is null and p_person_id is null then
    return null;
  end if;
  select * into r from chms_private.route_first_visit(p_org_id, p_household_id, p_person_id, p_room_id);
  select * into a from chms_private.actor_for(p_org_id);
  insert into public.tasks (org_id, kind, subject_household_id, subject_person_id, area_id, assignee_role_id, assignee_person_id,
                            source, detail, due_on, opened_by_person_id, dedupe_key)
  values (p_org_id, 'first_visit', p_household_id, p_person_id, r.o_area_id, r.o_assignee_role_id, r.o_assignee_person_id,
          p_source, coalesce(p_detail, '{}'::jsonb), chms_private.local_today(p_org_id) + 3, a.person_id, v_key)
  on conflict (org_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function chms_private.open_first_visit(uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;

-- The built-in rule: a new family's first child check-in.
create or replace function chms_private.first_visit_on_check_in()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_date date;
begin
  if new.type <> 'check_in' or new.role <> 'child' or new.source = 'import' then
    return null;
  end if;
  select s.household_id into v_household from public.checkin_sessions s where s.id = new.session_id;
  if v_household is null then
    select m.household_id into v_household from public.household_members m
    where m.person_id = new.person_id and m.ended_at is null order by m.created_at limit 1;
  end if;
  select o.local_date into v_date from public.occurrences o where o.id = new.occurrence_id;
  if v_household is null then
    -- a child with no family on file: the task names the child
    if exists (select 1 from public.attendance_events e join public.occurrences o on o.id = e.occurrence_id
               where e.person_id = new.person_id and e.type = 'check_in' and e.id <> new.id and o.local_date < v_date) then
      return null;
    end if;
    perform chms_private.open_first_visit(new.org_id, null, new.person_id, new.room_id, 'checkin',
      jsonb_build_object('occurrence_id', new.occurrence_id, 'room_id', new.room_id, 'station_id', new.station_id, 'event_id', new.id));
    return null;
  end if;
  if exists (select 1 from public.attendance_baselines b where b.household_id = v_household)
     or not chms_private.household_is_new(v_household)
     or exists (select 1 from public.attendance_events e
                join public.occurrences o on o.id = e.occurrence_id
                join public.household_members m on m.person_id = e.person_id and m.household_id = v_household
                where e.type = 'check_in' and e.id <> new.id and o.local_date < v_date) then
    return null;
  end if;
  perform chms_private.open_first_visit(new.org_id, v_household, new.person_id, new.room_id, 'checkin',
    jsonb_build_object('occurrence_id', new.occurrence_id, 'room_id', new.room_id, 'station_id', new.station_id, 'event_id', new.id));
  return null;
end;
$$;
revoke execute on function chms_private.first_visit_on_check_in() from public, anon, authenticated;
create trigger trg_attendance_events_first_visit after insert on public.attendance_events
  for each row execute function chms_private.first_visit_on_check_in();

-- Staff mark a family (or a person with no family) as first-time by hand;
-- the existing task comes back when there is one.
create or replace function public.mark_first_visit(p_household_id uuid default null, p_person_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if p_household_id is not null then
    select org_id into v_org from public.households where id = p_household_id and archived_at is null;
  elsif p_person_id is not null then
    select org_id into v_org from public.people where id = p_person_id and archived_at is null;
  end if;
  if v_org is null then
    raise exception 'no such family' using errcode = '22023';
  end if;
  if auth.uid() is null or public.is_station()
     or not (public.has_org_permission(v_org, 'checkin.manage') or public.has_org_permission(v_org, 'people.edit')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_id := chms_private.open_first_visit(v_org, p_household_id, case when p_household_id is null then p_person_id end, null, 'staff', '{}'::jsonb);
  if v_id is null then
    select id into v_id from public.tasks
    where org_id = v_org and dedupe_key = case when p_household_id is not null then 'first_visit:' || p_household_id::text else 'first_visit:person:' || p_person_id::text end;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.mark_first_visit(uuid, uuid) from public, anon;
grant execute on function public.mark_first_visit(uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------------------------- RLS --
create policy "Managers, assignees and area leaders read tasks" on public.tasks for select
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
         or assignee_person_id = any ((select chms_private.my_person_ids())::uuid[])
         or assignee_role_id = any ((select chms_private.my_role_ids())::uuid[])
         or (area_id is not null and area_id = any ((select chms_private.my_led_area_ids())::uuid[])));
create policy "Managers add manual tasks" on public.tasks for insert
  with check (kind = 'manual' and org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[]));
create policy "Managers, assignees and area leaders work tasks" on public.tasks for update
  using (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
         or assignee_person_id = any ((select chms_private.my_person_ids())::uuid[])
         or assignee_role_id = any ((select chms_private.my_role_ids())::uuid[])
         or (area_id is not null and area_id = any ((select chms_private.my_led_area_ids())::uuid[])))
  with check (org_id = any ((select chms_private.orgs_with_permission('checkin.manage'))::uuid[])
              or assignee_person_id = any ((select chms_private.my_person_ids())::uuid[])
              or assignee_role_id = any ((select chms_private.my_role_ids())::uuid[])
              or (area_id is not null and area_id = any ((select chms_private.my_led_area_ids())::uuid[])));
create policy "Tasks close, never delete" on public.tasks as restrictive for delete to anon, authenticated using (false);
