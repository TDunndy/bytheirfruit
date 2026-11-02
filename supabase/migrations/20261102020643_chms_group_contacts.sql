-- ============================================================================
-- ChMS group messaging v1 (G4): the addresses behind a group's Email and
-- Text buttons. The church app opens the leader's own mail or Messages app
-- with them; church-sent messages, templates, delivery logs and STOP
-- handling come with Phase 3, which will use this same resolver.
--
-- group_contacts(): for the active members of one or more groups, the email
-- addresses or E.164 phone numbers, deduped. A minor never appears; their
-- household's guardians (adults who may check in) do instead. A number that
-- replied STOP is left out. Callable by the groups' leaders and co-leaders,
-- groups.manage and notify.broadcast; refused for a station. Each call logs
-- one access_log row per group (contacts.export).
-- ============================================================================

create or replace function public.group_contacts(p_group_ids uuid[], p_channel text)
returns table (person_id uuid, display_name text, value text, for_person_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  g record;
  v_org uuid;
begin
  if auth.uid() is null or public.is_station() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_channel not in ('email', 'sms') then
    raise exception 'channel is email or sms' using errcode = '22023';
  end if;
  if p_group_ids is null or cardinality(p_group_ids) = 0 or cardinality(p_group_ids) > 50 then
    raise exception 'name one to fifty groups' using errcode = '22023';
  end if;
  for g in select gr.id, gr.org_id from public.groups gr where gr.id = any (p_group_ids) and gr.archived_at is null loop
    if v_org is not null and v_org <> g.org_id then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    v_org := g.org_id;
    if not (public.has_org_permission(g.org_id, 'notify.broadcast') or public.has_org_permission(g.org_id, 'groups.manage') or chms_private.leads_group(g.id)) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end loop;
  if v_org is null or (select count(*) from public.groups gr where gr.id = any (p_group_ids) and gr.archived_at is null) <> cardinality(p_group_ids) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  with members as (
    select distinct gm.person_id from public.group_members gm where gm.group_id = any (p_group_ids) and gm.ended_at is null
  ), reach as (
    -- adults speak for themselves; a child's guardians speak for the child
    select m.person_id as contact_id, m.person_id as for_id
    from members m join public.people p on p.id = m.person_id and p.archived_at is null
    where not chms_private.is_minor(p.id, p.birthdate, p.org_id)
    union
    select hm2.person_id, m.person_id
    from members m
    join public.people p on p.id = m.person_id and p.archived_at is null
    join public.household_members hm on hm.person_id = m.person_id and hm.ended_at is null
    join public.household_members hm2 on hm2.household_id = hm.household_id and hm2.ended_at is null and hm2.relationship <> 'child' and hm2.can_check_in
    where chms_private.is_minor(p.id, p.birthdate, p.org_id)
  ), contacts as (
    select r.contact_id, r.for_id,
           case when p_channel = 'email' then lower(p.email) else p.phone_e164 end as v,
           p.first_name, p.last_name
    from reach r join public.people p on p.id = r.contact_id and p.archived_at is null and p.org_id = v_org
  )
  select distinct on (c.v) c.contact_id, chms_private.display_name(c.first_name, c.last_name), c.v, c.for_id
  from contacts c
  where c.v is not null
    and not (p_channel = 'sms' and exists (select 1 from public.contact_consents cc
                                           where cc.org_id = v_org and cc.phone_e164 = c.v and cc.revoked_source = 'stop'))
  order by c.v, (c.contact_id = c.for_id) desc;

  -- logged per group, as a bulk read of its members' contacts
  for g in select gr.id from public.groups gr where gr.id = any (p_group_ids) loop
    perform chms_private.log_access(v_org, 'contacts.export', null,
      (select count(*) from public.group_members gm where gm.group_id = g.id and gm.ended_at is null)::integer,
      jsonb_build_object('group_id', g.id, 'channel', p_channel));
  end loop;
end;
$$;
revoke execute on function public.group_contacts(uuid[], text) from public, anon;
grant execute on function public.group_contacts(uuid[], text) to authenticated, service_role;
