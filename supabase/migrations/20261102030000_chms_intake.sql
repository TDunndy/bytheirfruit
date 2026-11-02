-- ============================================================================
-- ChMS intake (G3): the public "I'm new" form.
--
-- The intake edge function (no JWT; Turnstile when configured) calls
-- intake_first_visit() with the service role. It makes a guest household and
-- its people (tagged guest, visitors, never merged into existing records),
-- records the safety-text consent when given (source 'web'), opens the
-- first-visit task (source 'form', routed by the youngest child's age) and
-- logs the intake. The same phone number submitted again the same day comes
-- back to the same household instead of a second one. Nothing here is
-- callable by anon or a signed-in user.
-- ============================================================================

create or replace function public.intake_first_visit(p_org_slug text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_adult jsonb := p -> 'adult';
  v_kids jsonb := coalesce(p -> 'children', '[]'::jsonb);
  v_phone text;
  v_email text;
  v_household uuid;
  v_adult_id uuid;
  v_kid jsonb;
  v_kid_id uuid;
  v_task uuid;
  v_ids uuid[] := '{}';
  v_existing uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select id into v_org from public.organizations where slug = p_org_slug;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_church');
  end if;
  if jsonb_typeof(v_adult) <> 'object' or jsonb_typeof(v_kids) <> 'array' or jsonb_array_length(v_kids) > 10
     or length(btrim(coalesce(v_adult ->> 'first_name', ''))) = 0 or length(btrim(coalesce(v_adult ->> 'last_name', ''))) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_phone := chms_private.normalize_phone(v_adult ->> 'phone');
  v_email := nullif(lower(btrim(coalesce(v_adult ->> 'email', ''))), '');
  if v_phone is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'contact_required');
  end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  for v_kid in select * from jsonb_array_elements(v_kids) loop
    if jsonb_typeof(v_kid) <> 'object' or length(btrim(coalesce(v_kid ->> 'first_name', ''))) = 0
       or (v_kid ->> 'birthdate') is null or (v_kid ->> 'birthdate') !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_kid ->> 'birthdate')::date > chms_private.local_today(v_org) or (v_kid ->> 'birthdate')::date < chms_private.local_today(v_org) - interval '25 years' then
      return jsonb_build_object('ok', false, 'error', 'invalid_child');
    end if;
  end loop;

  -- the same number today: hand back the family already made, do not make another
  if v_phone is not null then
    select m.household_id into v_existing
    from public.people pp join public.household_members m on m.person_id = pp.id and m.ended_at is null
    where pp.org_id = v_org and pp.phone_e164 = v_phone and 'guest' = any (pp.tags)
      and pp.created_at > now() - interval '1 day'
      and exists (select 1 from public.access_log l where l.org_id = v_org and l.action = 'intake.web' and l.detail ->> 'household_id' = m.household_id::text)
    order by pp.created_at desc limit 1;
    if v_existing is not null then
      select id into v_task from public.tasks where org_id = v_org and dedupe_key = 'first_visit:' || v_existing::text;
      return jsonb_build_object('ok', true, 'household_id', v_existing, 'task_id', v_task, 'repeat', true);
    end if;
  end if;

  insert into public.households (org_id, name) values (v_org, left(btrim(v_adult ->> 'last_name'), 100) || ' family') returning id into v_household;
  insert into public.people (org_id, first_name, last_name, phone, email, membership_status, tags, first_visit_date)
  values (v_org, left(btrim(v_adult ->> 'first_name'), 100), left(btrim(v_adult ->> 'last_name'), 100), left(v_adult ->> 'phone', 40), v_email,
          'visitor', array['guest'], chms_private.local_today(v_org))
  returning id into v_adult_id;
  insert into public.household_members (household_id, person_id, org_id, relationship, is_guardian, can_check_in)
  values (v_household, v_adult_id, v_org, 'head', true, true);
  v_ids := array[v_adult_id];
  for v_kid in select * from jsonb_array_elements(v_kids) loop
    insert into public.people (org_id, first_name, last_name, birthdate, gender, membership_status, tags, first_visit_date)
    values (v_org, left(btrim(v_kid ->> 'first_name'), 100), left(btrim(coalesce(nullif(v_kid ->> 'last_name', ''), v_adult ->> 'last_name')), 100),
            (v_kid ->> 'birthdate')::date, case when v_kid ->> 'gender' in ('male', 'female') then v_kid ->> 'gender' end,
            'visitor', array['guest'], chms_private.local_today(v_org))
    returning id into v_kid_id;
    insert into public.household_members (household_id, person_id, org_id, relationship) values (v_household, v_kid_id, v_org, 'child');
    if length(btrim(coalesce(v_kid ->> 'allergies', ''))) > 0 then
      insert into public.child_care (person_id, org_id, allergies, allergy_short, has_allergy)
      values (v_kid_id, v_org, left(btrim(v_kid ->> 'allergies'), 2000), left(btrim(v_kid ->> 'allergies'), 40), true);
      perform chms_private.log_access(v_org, 'child_care.write', v_kid_id, 1, jsonb_build_object('via', 'intake'));
    end if;
    v_ids := array_append(v_ids, v_kid_id);
  end loop;
  if v_phone is not null and coalesce((p ->> 'sms_consent')::boolean, false) then
    insert into public.contact_consents (org_id, phone_e164, scope, person_id, source, text_version)
    values (v_org, v_phone, 'safety', v_adult_id, 'web', left(coalesce(p ->> 'consent_version', 'v1'), 40))
    on conflict (org_id, phone_e164, scope) where revoked_at is null do nothing;
  end if;
  v_task := chms_private.open_first_visit(v_org, v_household, null, null, 'form', jsonb_build_object('via', 'web'));
  perform chms_private.log_access(v_org, 'intake.web', null, cardinality(v_ids), jsonb_build_object('household_id', v_household, 'task_id', v_task));
  return jsonb_build_object('ok', true, 'household_id', v_household, 'task_id', v_task, 'repeat', false);
end;
$$;
revoke execute on function public.intake_first_visit(text, jsonb) from public, anon, authenticated;
grant execute on function public.intake_first_visit(text, jsonb) to service_role;

-- What the public form shows before anyone types: the church's name.
create or replace function public.intake_church(p_org_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.role() = 'service_role'
    then (select jsonb_build_object('name', o.name, 'slug', o.slug) from public.organizations o where o.slug = p_org_slug)
  end;
$$;
revoke execute on function public.intake_church(text) from public, anon, authenticated;
grant execute on function public.intake_church(text) to service_role;
