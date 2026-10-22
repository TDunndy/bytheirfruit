-- Hardening part 2a of 6 — applied to production 2026-10-22.
-- Pinned search_path on every SECURITY DEFINER function, internals no longer
-- callable through the API, admin-only RPC gated inside (current_user is
-- always the owner inside a definer body, so the gate reads the JWT).
set search_path = public, extensions;

alter function public.check_review_rate_limit()          set search_path = public;
alter function public.validate_review_content()          set search_path = public;
alter function public.increment_flag_count()             set search_path = public;
alter function public.recalculate_church_scores()        set search_path = public;
alter function public.recalculate_single_church_scores() set search_path = public;
alter function public.compute_regional_benchmarks()      set search_path = public;
alter function public.notify_new_review()                set search_path = public;
alter function public.soft_delete_review(uuid)           set search_path = public;

revoke execute on function public.handle_new_user()                 from public, anon, authenticated;
revoke execute on function public.sync_profile_email()              from public, anon, authenticated;
revoke execute on function public.check_review_rate_limit()         from public, anon, authenticated;
revoke execute on function public.validate_review_content()         from public, anon, authenticated;
revoke execute on function public.increment_flag_count()            from public, anon, authenticated;
revoke execute on function public.recalculate_single_church_scores() from public, anon, authenticated;
revoke execute on function public.update_church_score_snapshots()   from public, anon, authenticated;
revoke execute on function public.notify_new_review()               from public, anon, authenticated;
revoke execute on function public.protect_profile_columns()         from public, anon, authenticated;
revoke execute on function public.pin_review_columns()              from public, anon, authenticated;
revoke execute on function public.protect_church_columns()          from public, anon, authenticated;
revoke execute on function public.validate_review_flag()            from public, anon, authenticated;
revoke execute on function public.process_review_location()         from public, anon, authenticated;
revoke execute on function public.check_multi_state_activity()      from public, anon, authenticated;

create or replace function public.recalculate_church_scores()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_moderator() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  update churches c set
    score_teaching = sub.avg_teaching, score_welcome = sub.avg_welcome,
    score_community = sub.avg_community, score_worship = sub.avg_worship,
    score_prayer = sub.avg_prayer, score_kids = sub.avg_kids,
    score_youth = sub.avg_youth, score_leadership = sub.avg_leadership,
    score_service = sub.avg_service, score_finances = sub.avg_finances,
    score_overall = (
      coalesce(sub.avg_teaching,0) + coalesce(sub.avg_welcome,0) + coalesce(sub.avg_community,0) +
      coalesce(sub.avg_worship,0) + coalesce(sub.avg_prayer,0) + coalesce(sub.avg_kids,0) +
      coalesce(sub.avg_youth,0) + coalesce(sub.avg_leadership,0) + coalesce(sub.avg_service,0) +
      coalesce(sub.avg_finances,0)
    ) / nullif(
      (sub.avg_teaching is not null)::int + (sub.avg_welcome is not null)::int +
      (sub.avg_community is not null)::int + (sub.avg_worship is not null)::int +
      (sub.avg_prayer is not null)::int + (sub.avg_kids is not null)::int +
      (sub.avg_youth is not null)::int + (sub.avg_leadership is not null)::int +
      (sub.avg_service is not null)::int + (sub.avg_finances is not null)::int, 0),
    total_reviews = sub.cnt,
    scores_updated_at = now()
  from (
    select church_id, count(*) as cnt,
      avg(score_teaching) avg_teaching, avg(score_welcome) avg_welcome,
      avg(score_community) avg_community, avg(score_worship) avg_worship,
      avg(score_prayer) avg_prayer, avg(score_kids) avg_kids,
      avg(score_youth) avg_youth, avg(score_leadership) avg_leadership,
      avg(score_service) avg_service, avg(score_finances) avg_finances
    from reviews where status = 'published' group by church_id
  ) sub
  where c.id = sub.church_id;
end;
$$;
revoke execute on function public.recalculate_church_scores()   from public, anon;
revoke execute on function public.compute_regional_benchmarks() from public, anon, authenticated;
revoke execute on function public.soft_delete_review(uuid)      from public, anon;

-- notify_new_review must never block a review insert if pg_net is unhappy.
-- Optional shared secret: alter database postgres set app.settings.notify_webhook_secret = '<secret>';
create or replace function public.notify_new_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  church_name text; reviewer_name text;
begin
  begin
    select name into church_name from churches where id = new.church_id;
    select display_name into reviewer_name from profiles where id = new.user_id;
    perform net.http_post(
      url := 'https://ffqmbhftivmiubvtzhhr.supabase.co/functions/v1/notify-new-review',
      headers := jsonb_build_object('Content-Type', 'application/json')
        || case when coalesce(current_setting('app.settings.notify_webhook_secret', true), '') <> ''
             then jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.notify_webhook_secret', true))
             else '{}'::jsonb end,
      body := jsonb_build_object('record', jsonb_build_object(
        'id', new.id, 'church_id', new.church_id,
        'church_name', coalesce(church_name, 'Unknown Church'),
        'reviewer_name', coalesce(reviewer_name, 'Anonymous'),
        'text', coalesce(new.text, ''), 'status', new.status, 'created_at', new.created_at)));
  exception when others then
    raise warning 'notify_new_review failed: %', sqlerrm;
  end;
  return new;
end;
$$;
