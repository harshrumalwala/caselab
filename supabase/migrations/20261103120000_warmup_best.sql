-- CaseLab: keep each member's best Warm-up score and streak with their account, so the record follows them to every
-- device instead of living in one browser.
--
-- DESIGN
--
--   * One row per member in `warmup_best`: the best score and the longest streak they have reached in the optional
--     Warm-up mental-math sprint. Nothing else about a round (questions, answers, times) is stored.
--
--   * PRIVATE. A member can read only their own row. It is not part of the profile, not copied to the public tables,
--     not visible to other members and not visible to visitors. There is no leaderboard.
--
--   * No direct writes. The table grants SELECT only; the one way to change a record is `record_warmup_best`, which acts
--     only on the signed-in member's own row and can only ever RAISE a record (greatest of old and new). So a bad round,
--     a stale browser tab or two devices finishing at once can never overwrite a better record.
--
--   * Sanity limits: values are clamped to 0..100000 (score) and 0..1000 (streak) so a hand-crafted request can't store
--     nonsense. They are a member's own private numbers, so this guards the data, not a game.
--
--   * Deleted with the account (on delete cascade), like everything else the member owns.
--
-- Additive: one table, one function.

create table public.warmup_best (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  best_score  integer not null default 0 check (best_score between 0 and 100000),
  best_streak integer not null default 0 check (best_streak between 0 and 1000),
  updated_at  timestamptz not null default now()
);

comment on table public.warmup_best is
  'Best Warm-up score and streak per member. Private to the member; written only through record_warmup_best().';

alter table public.warmup_best enable row level security;

create policy "warmup_best: select own" on public.warmup_best
  for select to authenticated using ((select auth.uid()) = user_id);

-- Writes go through the function below, which runs as its owner so the table itself can stay read-only for members.
create function public.record_warmup_best(p_score integer, p_streak integer)
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

  return query
  insert into public.warmup_best as w (user_id, best_score, best_streak)
  values (v_user, least(greatest(coalesce(p_score, 0), 0), 100000), least(greatest(coalesce(p_streak, 0), 0), 1000))
  on conflict (user_id) do update
    set best_score  = greatest(w.best_score, excluded.best_score),
        best_streak = greatest(w.best_streak, excluded.best_streak),
        updated_at  = now()
  returning w.best_score, w.best_streak;
end;
$$;

-- Signed-in members only: visitors without an account get nothing.
revoke all on public.warmup_best from anon, authenticated;
grant select on public.warmup_best to authenticated;
revoke all on function public.record_warmup_best(integer, integer) from public, anon, authenticated;
grant execute on function public.record_warmup_best(integer, integer) to authenticated;
