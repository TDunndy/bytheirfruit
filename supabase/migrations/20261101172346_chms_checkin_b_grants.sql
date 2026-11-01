-- ============================================================================
-- CHMS CHECK-IN, MIGRATION B (grants): the REVOKEs for migration B.
-- Kept apart because the Supabase connector prompts on every REVOKE; the
-- main migration then applies without a prompt. Final privileges are the
-- same as if these ran inline.
-- ============================================================================

-- No church user or station reads account ids, PIN hashes or PIN checks.
revoke all on table chms_private.station_principals from anon, authenticated;
revoke all on table chms_private.staff_pins from anon, authenticated;
revoke all on table chms_private.pin_verifications from anon, authenticated;

-- Trigger functions and internal helpers are not callable by API roles.
revoke execute on function public.drop_station_profile() from public, anon, authenticated;
revoke execute on function
  public.generate_occurrences(uuid, date, date), public.set_my_staff_pin(uuid, text), public.station_staff(),
  public.verify_staff_pin(uuid, text), public.station_self()
  from public, anon;

-- Policy helpers (my_station, my_station_org, station_room_ids,
-- check_room_criteria) are evaluated as the caller and stay callable.
revoke execute on function
  chms_private.generate_all_occurrences(), chms_private.schedule_changed(), chms_private.settings_changed(), chms_private.require_time_zone(),
  chms_private.config_events(), chms_private.stamp_set_by(), chms_private.check_assignment(), chms_private.check_overflow(),
  chms_private.pin_leader(), chms_private.protect_occurrence(), chms_private.deny_station_writes(),
  chms_private.active_restriction(uuid), chms_private.active_room_override(uuid)
  from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
