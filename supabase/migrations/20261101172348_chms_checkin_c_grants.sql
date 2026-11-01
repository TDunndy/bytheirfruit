-- ============================================================================
-- CHMS CHECK-IN, MIGRATION C (grants): the REVOKEs for migration C.
-- Kept apart because the Supabase connector prompts on every REVOKE; the
-- main migration then applies without a prompt. Final privileges are the
-- same as if these ran inline.
-- ============================================================================

-- The public site never reads room stays.
revoke select on public.room_stays from anon;

revoke execute on function
  public.ingest(jsonb), public.allocate_codes(date, integer, uuid), public.roster(uuid, uuid), public.close_occurrence(uuid),
  public.log_document_access(uuid)
  from public, anon;
-- effective_at is pure and the view needs it; my_led_room_ids and
-- can_see_room are policy helpers evaluated as the caller.
revoke execute on function
  chms_private.ingest_one(jsonb, uuid, uuid, uuid, uuid[]), chms_private.fold_attendance(uuid, uuid, uuid),
  chms_private.attendance_event_inserted(), chms_private.check_attendance_event(), chms_private.protect_session(),
  chms_private.protect_code(), chms_private.protect_alert()
  from public, anon, authenticated;
