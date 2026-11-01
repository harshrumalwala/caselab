-- CaseLab: keep a Warm-up record for each ROUND LENGTH (30, 60 or 120 seconds), not one record for all.
--
-- A 2-minute round naturally scores more than a 30-second one, so a single "best" would let the longest round set a record
-- the others can never reach. Each length now has its own best score and its own longest streak.
--
-- DESIGN
--
--   * `warmup_best` gains a `seconds` column (30, 60 or 120; anything else is refused by a check) and its primary key becomes
--     (user_id, seconds): up to three rows per member. Every row that exists today was set in a 60-second round, so the column
--     defaults to 60 and nothing changes for anyone's existing record.
--
--   * Everything else about the record is unchanged: PRIVATE to the member (own rows only, not in the profile, not copied to the
--     public tables, no leaderboard); no direct writes (SELECT only); the only way to change a record is the function, which acts on
--     the signed-in member's own rows and can only ever RAISE a record; values clamped to 0..100000 and 0..1000; deleted with the
--     account.
--
--   * `record_warmup_best` takes the length as a third argument that DEFAULTS TO 60. So a browser still running the version of the
--     app from before this change, which sends two arguments, keeps working and keeps recording 60-second rounds. The old
--     two-argument function is dropped and replaced (a default is the only way to keep one name unambiguous for the API).
--
-- Changes one table and replaces one function; it deletes no data.

alter table public.warmup_best
  add column seconds smallint not null default 60 check (seconds in (30, 60, 120));

alter table public.warmup_best drop constraint warmup_best_pkey;
alter table public.warmup_best add primary key (user_id, seconds);

comment on column public.warmup_best.seconds is 'The round length this record was set in: 30, 60 or 120 seconds.';

drop function public.record_warmup_best(integer, integer);

create function public.record_warmup_best(p_score integer, p_streak integer, p_seconds integer default 60)
returns table (score integer, streak integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_seconds is null or p_seconds not in (30, 60, 120) then
    raise exception 'A Warm-up round is 30, 60 or 120 seconds.' using errcode = 'P0001';
  end if;

  return query
  insert into public.warmup_best as w (user_id, seconds, best_score, best_streak)
  values (v_user, p_seconds, least(greatest(coalesce(p_score, 0), 0), 100000), least(greatest(coalesce(p_streak, 0), 0), 1000))
  on conflict (user_id, seconds) do update
    set best_score  = greatest(w.best_score, excluded.best_score),
        best_streak = greatest(w.best_streak, excluded.best_streak),
        updated_at  = now()
  returning w.best_score, w.best_streak;
end;
$$;

-- Signed-in members only: visitors without an account get nothing.
revoke all on function public.record_warmup_best(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.record_warmup_best(integer, integer, integer) to authenticated;
