-- ============================================================================
-- ChMS check-in 1c, duplicates and merge: the possible-duplicates queue and
-- the merge tool for guest records that fork an existing family.
--
-- possible_duplicates(org): pairs of active records that share a phone, an
-- email, or a name with the same birthdate (or no birthdate), minus the pairs
-- staff marked as separate. Needs people.edit; pairs with a child need
-- kids.view. One access_log row per call (duplicates.read).
-- keep_separate(a, b): records that two records are not the same person.
-- merge_people(keep, drop, fields, options): keeps one record, archives the
-- other and carries everything that can move. History (attendance, sessions,
-- codes, alerts, audit, events) keeps the dropped id and is resolved at read
-- time through person_merges (1c-1). Needs people.edit; kids.view when either
-- is a child; a church admin when either has a login, a role, or is over the
-- caller. Refused when both have logins, when the dropped record has custody
-- or medical documents, or when one is a child and the other an adult.
-- ============================================================================

-- ------------------------------------------------------ duplicate_decisions --
create table public.duplicate_decisions (
  id uuid primary key default chms_private.uuidv7(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  person_a_id uuid not null,
  person_b_id uuid not null,
  decision text not null check (decision in ('separate')),
  decided_by_person_id uuid,
  decided_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 300),
  check (person_a_id < person_b_id),
  unique (person_a_id, person_b_id),
  foreign key (person_a_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (person_b_id, org_id) references public.people (id, org_id) on delete cascade,
  foreign key (decided_by_person_id, org_id) references public.people (id, org_id) on delete set null (decided_by_person_id)
);
alter table public.duplicate_decisions enable row level security;
create policy "Editors read duplicate decisions" on public.duplicate_decisions for select
  using (org_id = any ((select chms_private.orgs_with_permission('people.edit'))::uuid[]));
create trigger trg_duplicate_decisions_append_only before update or delete on public.duplicate_decisions
  for each row execute function chms_private.deny_changes();
create trigger trg_duplicate_decisions_no_truncate before truncate on public.duplicate_decisions
  for each statement execute function chms_private.deny_changes();

-- ------------------------------------------------------ possible_duplicates --
create or replace function public.possible_duplicates(p_org_id uuid)
returns table (person_a_id uuid, person_b_id uuid, reasons text[],
               a_name text, b_name text, a_guest boolean, b_guest boolean,
               a_household text, b_household text, a_minor boolean, b_minor boolean,
               a_created timestamptz, b_created timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_kids boolean;
  v_n integer;
begin
  if auth.uid() is null or public.is_station() or p_org_id is null or not public.has_org_permission(p_org_id, 'people.edit') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_kids := public.has_org_permission(p_org_id, 'kids.view');
  return query
  with ppl as (
    select p.id, p.first_name, p.last_name, p.birthdate, p.phone_e164, lower(p.email) as email, p.tags, p.created_at,
           chms_private.is_minor(p.id, p.birthdate, p.org_id) as minor,
           (select h.name from public.household_members hm join public.households h on h.id = hm.household_id and h.archived_at is null
            where hm.person_id = p.id and hm.ended_at is null order by hm.created_at, h.created_at limit 1) as household,
           (select array_agg(hm.household_id) from public.household_members hm where hm.person_id = p.id and hm.ended_at is null) as households
    from public.people p
    where p.org_id = p_org_id and p.archived_at is null
  ), pairs as (
    select a.id as aid, b.id as bid,
           array_remove(array[
             case when a.phone_e164 is not null and a.phone_e164 = b.phone_e164 and not (a.households && b.households) then 'phone' end,
             case when a.email is not null and a.email = b.email then 'email' end,
             case when a.last_name <> '' and lower(a.first_name) = lower(b.first_name) and lower(a.last_name) = lower(b.last_name)
                       and a.birthdate is not null and a.birthdate = b.birthdate then 'name_birthdate' end,
             case when a.last_name <> '' and lower(a.first_name) = lower(b.first_name) and lower(a.last_name) = lower(b.last_name)
                       and (a.birthdate is null or b.birthdate is null) then 'name' end
           ], null) as why,
           a.first_name || ' ' || a.last_name as an, b.first_name || ' ' || b.last_name as bn,
           'guest' = any (a.tags) as ag, 'guest' = any (b.tags) as bg,
           a.household as ah, b.household as bh, a.minor as am, b.minor as bm, a.created_at as ac, b.created_at as bc, a.last_name as al
    from ppl a join ppl b on b.id > a.id
  )
  select x.aid, x.bid, x.why, x.an, x.bn, x.ag, x.bg, x.ah, x.bh, x.am, x.bm, x.ac, x.bc
  from pairs x
  where cardinality(x.why) > 0
    and (v_kids or not (x.am or x.bm))
    and not exists (select 1 from public.duplicate_decisions d where d.person_a_id = x.aid and d.person_b_id = x.bid)
  order by (x.ag or x.bg) desc, cardinality(x.why) desc, x.al, x.an
  limit 200;
  get diagnostics v_n = row_count;
  perform chms_private.log_access(p_org_id, 'duplicates.read', null, v_n, '{}');
end;
$$;
revoke execute on function public.possible_duplicates(uuid) from public, anon;
grant execute on function public.possible_duplicates(uuid) to authenticated, service_role;

-- ------------------------------------------------------------ keep_separate --
create or replace function public.keep_separate(p_a uuid, p_b uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_lo uuid;
  v_hi uuid;
begin
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'two different records are needed' using errcode = '22023';
  end if;
  select p.org_id into v_org from public.people p where p.id = p_a and p.archived_at is null;
  if v_org is null or not exists (select 1 from public.people p where p.id = p_b and p.org_id = v_org and p.archived_at is null) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if auth.uid() is null or public.is_station() or not public.has_org_permission(v_org, 'people.edit') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_lo := least(p_a, p_b);
  v_hi := greatest(p_a, p_b);
  insert into public.duplicate_decisions (org_id, person_a_id, person_b_id, decision, decided_by_person_id)
  values (v_org, v_lo, v_hi, 'separate', chms_private.my_person_id(v_org))
  on conflict (person_a_id, person_b_id) do nothing;
  if found then
    perform chms_private.emit_event(v_org, 'person.kept_separate', 'person', v_lo, jsonb_build_object('other_person_id', v_hi));
  end if;
end;
$$;
revoke execute on function public.keep_separate(uuid, uuid) from public, anon;
grant execute on function public.keep_separate(uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------------------- merge_people --
create or replace function public.merge_people(p_keep uuid, p_drop uuid, p_fields jsonb default '{}', p_options jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k public.people%rowtype;
  d public.people%rowtype;
  v_org uuid;
  v_today date;
  v_me uuid;
  v_keep_minor boolean;
  v_drop_minor boolean;
  v_join boolean := coalesce((p_options ->> 'join_households')::boolean, false);
  v_keep_has_home boolean;
  v_home uuid;
  v_detail jsonb := '{}';
  v_n integer;
  v_m integer;
  v_archived uuid[] := '{}';
  v_left uuid[] := '{}';
  v_skipped integer := 0;
  r record;
  pick text;
  cols text[] := array['first_name', 'last_name', 'preferred_name', 'title', 'email', 'phone', 'birthdate', 'gender',
                       'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'photo_path', 'photo_url'];
  c text;
  v_sql text := '';
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'two different records are needed' using errcode = '22023';
  end if;
  select * into k from public.people where id = p_keep for update;
  select * into d from public.people where id = p_drop for update;
  if k.id is null or d.id is null or k.org_id <> d.org_id then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_org := k.org_id;
  if auth.uid() is null or public.is_station() or not public.has_org_permission(v_org, 'people.edit') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if k.archived_at is not null or d.archived_at is not null
     or exists (select 1 from public.person_merges m where m.merged_person_id in (p_keep, p_drop)) then
    raise exception 'an archived or merged record cannot be merged' using errcode = '22023';
  end if;
  v_keep_minor := chms_private.is_minor(k.id, k.birthdate, v_org);
  v_drop_minor := chms_private.is_minor(d.id, d.birthdate, v_org);
  if v_keep_minor <> v_drop_minor then
    raise exception 'one record is a child and the other an adult' using errcode = '22023';
  end if;
  if (v_keep_minor or v_drop_minor) and not public.has_org_permission(v_org, 'kids.view') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if (exists (select 1 from public.person_logins pl where pl.person_id in (p_keep, p_drop))
      or exists (select 1 from public.person_roles pr where pr.person_id in (p_keep, p_drop))
      or chms_private.is_over_me(v_org, p_keep) or chms_private.is_over_me(v_org, p_drop))
     and not chms_private.is_church_admin(v_org) then
    raise exception 'only a church admin can merge a record that signs in or holds a role' using errcode = '42501';
  end if;
  if exists (select 1 from public.person_logins pl where pl.person_id = p_keep)
     and exists (select 1 from public.person_logins pl where pl.person_id = p_drop) then
    raise exception 'both records have a login; unlink one first' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.person_documents pd where pd.person_id = p_drop and pd.archived_at is null) then
    raise exception 'the record being merged has custody or medical documents; keep that record instead' using errcode = 'P0001';
  end if;
  v_today := chms_private.local_today(v_org);
  v_me := chms_private.my_person_id(v_org);

  -- (a) the kept record: each field from the record staff chose, else the kept one unless empty
  foreach c in array cols loop
    pick := p_fields ->> c;
    if pick = 'drop' then
      v_sql := v_sql || format('%I = $2.%I, ', c, c);
    else
      v_sql := v_sql || format('%I = coalesce($1.%I, $2.%I), ', c, c, c);
    end if;
  end loop;
  execute 'update public.people set ' || v_sql ||
    ' tags = (select coalesce(array_agg(distinct t), ''{}'') from unnest($1.tags || array_remove($2.tags, ''guest'')) t),' ||
    ' custom = $2.custom || $1.custom,' ||
    ' membership_status = case when $3 ->> ''membership_status'' = ''drop'' then $2.membership_status' ||
    '   when array_position(array[''inactive'',''visitor'',''regular'',''member''], $2.membership_status)' ||
    '      > array_position(array[''inactive'',''visitor'',''regular'',''member''], $1.membership_status) then $2.membership_status' ||
    '   else $1.membership_status end,' ||
    ' first_visit_date = least($1.first_visit_date, $2.first_visit_date),' ||
    ' joined_date = least($1.joined_date, $2.joined_date),' ||
    ' grade_override = coalesce($1.grade_override, $2.grade_override),' ||
    ' grade_override_year = case when $1.grade_override is null then $2.grade_override_year else $1.grade_override_year end' ||
    ' where id = $1.id'
    using k, d, p_fields;
  if d.external_source is not null and k.external_source is null then
    update public.people set external_source = null, external_id = null where id = p_drop;
    update public.people set external_source = d.external_source, external_id = d.external_id where id = p_keep;
  end if;

  -- (b) rows that simply point at the person
  update public.person_notes set person_id = p_keep where person_id = p_drop;
  get diagnostics v_n = row_count; v_detail := v_detail || jsonb_build_object('notes', v_n);
  update public.org_invitations set person_id = p_keep where person_id = p_drop;
  get diagnostics v_n = row_count; v_detail := v_detail || jsonb_build_object('invitations', v_n);
  update public.checkin_keys set person_id = p_keep where person_id = p_drop;
  get diagnostics v_n = row_count; v_detail := v_detail || jsonb_build_object('keys', v_n);
  update public.contact_consents set person_id = p_keep where person_id = p_drop;
  get diagnostics v_n = row_count; v_detail := v_detail || jsonb_build_object('consents', v_n);
  update public.pickup_people set person_id = p_keep where person_id = p_drop and child_person_id <> p_keep;
  get diagnostics v_n = row_count; v_detail := v_detail || jsonb_build_object('pickups_as_adult', v_n);
  update public.custom_field_values_sensitive s set subject_id = p_keep
    where s.subject_id = p_drop and not exists (select 1 from public.custom_field_values_sensitive t where t.field_id = s.field_id and t.subject_id = p_keep);
  delete from public.custom_field_values_sensitive where subject_id = p_drop;
  insert into public.person_roles (person_id, role_id, org_id)
    select p_keep, pr.role_id, pr.org_id from public.person_roles pr where pr.person_id = p_drop
    on conflict (person_id, role_id) do nothing;
  delete from public.person_roles where person_id = p_drop;
  get diagnostics v_n = row_count; v_detail := v_detail || jsonb_build_object('roles', v_n);
  delete from public.person_overseers where (person_id = p_drop and overseer_person_id = p_keep) or (person_id = p_keep and overseer_person_id = p_drop);
  insert into public.person_overseers (org_id, person_id, overseer_person_id, overseer_role_id)
    select o.org_id, p_keep, o.overseer_person_id, o.overseer_role_id from public.person_overseers o
    where o.person_id = p_drop
      and not exists (select 1 from public.person_overseers x where x.person_id = p_keep
                      and x.overseer_person_id is not distinct from o.overseer_person_id and x.overseer_role_id is not distinct from o.overseer_role_id);
  delete from public.person_overseers where person_id = p_drop;
  update public.person_overseers o set overseer_person_id = p_keep
    where o.overseer_person_id = p_drop
      and not exists (select 1 from public.person_overseers x where x.person_id = o.person_id and x.overseer_person_id = p_keep);
  delete from public.person_overseers where overseer_person_id = p_drop;
  if exists (select 1 from public.person_logins where person_id = p_drop) then
    update public.person_logins set person_id = p_keep where person_id = p_drop;
    v_detail := v_detail || jsonb_build_object('login', 'moved');
  end if;
  if exists (select 1 from chms_private.staff_pins where person_id = p_drop)
     and not exists (select 1 from chms_private.staff_pins where person_id = p_keep) then
    update chms_private.staff_pins set person_id = p_keep where person_id = p_drop;
    v_detail := v_detail || jsonb_build_object('staff_pin', 'moved');
  end if;

  -- (c) rows whose person is pinned: end the old, add the new
  v_keep_has_home := exists (select 1 from public.household_members hm where hm.person_id = p_keep and hm.ended_at is null);
  v_m := 0;
  for r in select hm.household_id, hm.relationship, hm.is_guardian, hm.can_check_in
           from public.household_members hm where hm.person_id = p_drop and hm.ended_at is null loop
    update public.household_members set ended_at = now() where household_id = r.household_id and person_id = p_drop;
    if v_join or not v_keep_has_home then
      if exists (select 1 from public.household_members hm where hm.household_id = r.household_id and hm.person_id = p_keep) then
        update public.household_members set ended_at = null, relationship = r.relationship, is_guardian = r.is_guardian, can_check_in = r.can_check_in
          where household_id = r.household_id and person_id = p_keep and ended_at is not null;
      else
        insert into public.household_members (household_id, person_id, org_id, relationship, is_guardian, can_check_in)
          values (r.household_id, p_keep, v_org, r.relationship, r.is_guardian, r.can_check_in);
      end if;
      v_m := v_m + 1;
    end if;
  end loop;
  get diagnostics v_n = row_count;
  v_detail := v_detail || jsonb_build_object('households', jsonb_build_object('ended', (select count(*) from public.household_members hm where hm.person_id = p_drop), 'joined', v_m));

  v_m := 0;
  for r in select gm.id, gm.group_id, gm.role from public.group_members gm where gm.person_id = p_drop and gm.ended_at is null loop
    update public.group_members set ended_at = now() where id = r.id;
    if not exists (select 1 from public.group_members gm where gm.group_id = r.group_id and gm.person_id = p_keep and gm.ended_at is null) then
      insert into public.group_members (group_id, person_id, org_id, role) values (r.group_id, p_keep, v_org, r.role);
      v_m := v_m + 1;
    end if;
  end loop;
  v_detail := v_detail || jsonb_build_object('groups', v_m);

  v_m := 0;
  for r in select * from public.pickup_people pp where pp.child_person_id = p_drop and pp.archived_at is null loop
    update public.pickup_people set archived_at = now() where id = r.id;
    if r.person_id is distinct from p_keep then
      insert into public.pickup_people (org_id, child_person_id, person_id, name, phone, relationship, kind, note, valid_from, valid_to)
        values (v_org, p_keep, r.person_id, r.name, r.phone, r.relationship, r.kind, r.note, r.valid_from, r.valid_to);
      v_m := v_m + 1;
    end if;
  end loop;
  v_detail := v_detail || jsonb_build_object('pickups', v_m);

  v_m := 0;
  for r in select * from public.person_credentials pc where pc.person_id = p_drop and pc.archived_at is null loop
    update public.person_credentials set archived_at = now() where id = r.id;
    insert into public.person_credentials (org_id, person_id, kind, completed_on, expires_on, provider, reference, note)
      values (v_org, p_keep, r.kind, r.completed_on, r.expires_on, r.provider, r.reference, left(coalesce(r.note || ' ', '') || '(merged from ' || p_drop::text || ')', 1000));
    v_m := v_m + 1;
  end loop;
  v_detail := v_detail || jsonb_build_object('credentials', v_m);

  v_m := 0;
  for r in select * from public.checkin_restrictions cr where cr.person_id = p_drop and cr.cleared_at is null loop
    insert into public.checkin_restrictions (org_id, person_id, kind, note, starts_on, ends_on)
      values (v_org, p_keep, r.kind, r.note, r.starts_on, r.ends_on);
    update public.checkin_restrictions set cleared_at = now() where id = r.id;
    v_m := v_m + 1;
  end loop;
  v_detail := v_detail || jsonb_build_object('restrictions', v_m);

  v_m := 0;
  for r in select * from public.room_overrides ro where ro.person_id = p_drop and ro.archived_at is null loop
    if not exists (select 1 from public.room_overrides x where x.person_id = p_keep and x.archived_at is null) then
      insert into public.room_overrides (org_id, person_id, room_id, ends_on, note) values (v_org, p_keep, r.room_id, r.ends_on, r.note);
      v_m := v_m + 1;
    end if;
    update public.room_overrides set archived_at = now() where id = r.id;
  end loop;
  v_detail := v_detail || jsonb_build_object('overrides', v_m);

  v_m := 0;
  for r in select * from public.volunteer_assignments va where va.person_id = p_drop and va.local_date >= v_today and va.status <> 'declined' loop
    begin
      insert into public.volunteer_assignments (org_id, slot_id, person_id, local_date, status, note)
        values (v_org, r.slot_id, p_keep, r.local_date, r.status, r.note)
        on conflict (slot_id, person_id, local_date) do nothing;
      update public.volunteer_assignments set status = 'declined', note = left(coalesce(r.note || ' ', '') || '(merged)', 300) where id = r.id;
      v_m := v_m + 1;
    exception when sqlstate '22023' then
      v_skipped := v_skipped + 1;
    end;
  end loop;
  v_detail := v_detail || jsonb_build_object('assignments', v_m, 'assignments_skipped', v_skipped);

  insert into public.area_leaders (org_id, area_id, person_id, kind)
    select al.org_id, al.area_id, p_keep, al.kind from public.area_leaders al where al.person_id = p_drop
    on conflict (area_id, person_id) do nothing;
  delete from public.area_leaders where person_id = p_drop;
  insert into public.room_leaders (org_id, room_id, person_id, kind)
    select rl.org_id, rl.room_id, p_keep, rl.kind from public.room_leaders rl where rl.person_id = p_drop
    on conflict (room_id, person_id) do nothing;
  delete from public.room_leaders where person_id = p_drop;

  -- (d) care notes: copy, or fill in what the kept record lacks
  if exists (select 1 from public.child_care cc where cc.person_id = p_drop) then
    if not exists (select 1 from public.child_care cc where cc.person_id = p_keep) then
      insert into public.child_care (person_id, org_id, allergies, allergy_short, medical, special_needs, has_allergy, has_medical, has_special_needs)
        select p_keep, cc.org_id, cc.allergies, cc.allergy_short, cc.medical, cc.special_needs, cc.has_allergy, cc.has_medical, cc.has_special_needs
        from public.child_care cc where cc.person_id = p_drop;
      v_detail := v_detail || jsonb_build_object('child_care', 'copied');
    else
      update public.child_care kc set
        allergies = left(case when dc.allergies is null or kc.allergies = dc.allergies then kc.allergies
                              when kc.allergies is null then dc.allergies else kc.allergies || E'\n' || dc.allergies end, 2000),
        allergy_short = coalesce(kc.allergy_short, dc.allergy_short),
        medical = left(case when dc.medical is null or kc.medical = dc.medical then kc.medical
                            when kc.medical is null then dc.medical else kc.medical || E'\n' || dc.medical end, 4000),
        special_needs = left(case when dc.special_needs is null or kc.special_needs = dc.special_needs then kc.special_needs
                                  when kc.special_needs is null then dc.special_needs else kc.special_needs || E'\n' || dc.special_needs end, 4000),
        has_allergy = kc.has_allergy or dc.has_allergy, has_medical = kc.has_medical or dc.has_medical,
        has_special_needs = kc.has_special_needs or dc.has_special_needs, updated_at = now()
      from public.child_care dc where kc.person_id = p_keep and dc.person_id = p_drop;
      v_detail := v_detail || jsonb_build_object('child_care', 'merged');
    end if;
    perform chms_private.log_access(v_org, 'child_care.write', p_keep, 1, jsonb_build_object('via', 'merge'));
  end if;

  -- (e) a family left empty is archived; its carried-over counts and open tasks follow the kept record
  select hm.household_id into v_home from public.household_members hm
    join public.households h on h.id = hm.household_id and h.archived_at is null
    where hm.person_id = p_keep and hm.ended_at is null
    order by hm.created_at, h.created_at limit 1;
  if (select count(*) from public.household_members hm join public.households h on h.id = hm.household_id and h.archived_at is null
      where hm.person_id = p_keep and hm.ended_at is null) <> 1 then
    v_home := null;
  end if;
  for r in select distinct hm.household_id from public.household_members hm join public.households h on h.id = hm.household_id and h.archived_at is null
           where hm.person_id = p_drop
             and not exists (select 1 from public.household_members x where x.household_id = hm.household_id and x.ended_at is null) loop
    update public.households set archived_at = now() where id = r.household_id;
    v_archived := v_archived || r.household_id;
    if v_home is not null then
      insert into public.attendance_baselines (org_id, household_id, year, count, last_attended_on, note)
        select b.org_id, v_home, b.year, b.count, b.last_attended_on, left('merged from ' || h.name || ': ' || b.count, 300)
        from public.attendance_baselines b join public.households h on h.id = b.household_id
        where b.household_id = r.household_id
      on conflict (household_id, year) do update set
        count = greatest(public.attendance_baselines.count, excluded.count),
        last_attended_on = greatest(public.attendance_baselines.last_attended_on, excluded.last_attended_on),
        note = left(coalesce(public.attendance_baselines.note || '; ', '') || excluded.note, 300);
    elsif exists (select 1 from public.attendance_baselines b where b.household_id = r.household_id) then
      v_left := v_left || r.household_id;
    end if;
  end loop;
  update public.tasks set status = 'dismissed', close_note = 'Merged into another record'
    where status = 'open' and (subject_person_id = p_drop or subject_household_id = any (v_archived));
  get diagnostics v_n = row_count;
  v_detail := v_detail || jsonb_build_object('households_archived', to_jsonb(v_archived), 'baselines_left', to_jsonb(v_left), 'tasks_dismissed', v_n);

  -- (f) the dropped record becomes history
  update public.people set archived_at = now(), tags = (select coalesce(array_agg(distinct t), '{}') from unnest(d.tags || '{merged}') t) where id = p_drop;
  insert into public.person_merges (org_id, kept_person_id, merged_person_id, merged_by_person_id, detail)
    values (v_org, p_keep, p_drop, v_me, v_detail);
  perform chms_private.emit_event(v_org, 'person.merged', 'person', p_keep, jsonb_build_object('merged_person_id', p_drop));
  return v_detail;
end;
$$;
revoke execute on function public.merge_people(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.merge_people(uuid, uuid, jsonb, jsonb) to authenticated, service_role;

-- ------------------------------------------------- counting merged records --
-- A child checked in under two records at one service is one child: the
-- services and children reports count distinct people and services after
-- the alias fold (the families report already did).
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
         count(distinct att.pid) filter (where att.arole = 'child')::integer,
         count(distinct att.pid) filter (where att.arole in ('volunteer', 'leader'))::integer,
         count(distinct att.pid) filter (where att.arole = 'attendee')::integer,
         count(distinct att.pid) filter (where att.arole = 'child' and att.is_first)::integer,
         count(distinct att.pid) filter (where cardinality(att.anom) > 0)::integer
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
    select k.id, count(distinct x.occ_id) filter (where x.d between p_from and p_to)::integer as attended, min(x.d) as first_d, max(x.d) as last_d
    from kids k left join att x on x.pid = k.id
    group by k.id
  ), months as (
    select y.pid, jsonb_object_agg(y.m, y.n) as by_month
    from (select x.pid, to_char(x.d, 'YYYY-MM') as m, count(distinct x.occ_id) as n from att x where x.d between p_from and p_to group by x.pid, to_char(x.d, 'YYYY-MM')) y
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
