-- CaseLab: a private weekly practice goal ("3 cases a week"), kept with the member's account so it follows them to every
-- device.
--
-- DESIGN
--
--   * One row per member in `weekly_goal`: the number of cases they aim to log each week (1 to 14). No row means no goal.
--     The progress and the streak are worked out in the app from the cases they have already logged, so nothing else is
--     stored and nothing here can disagree with the log.
--
--   * PRIVATE. A member can read and change only their own row. It is not part of the profile, not copied to the public
--     tables, and not visible to other members or visitors. There is no comparison or leaderboard.
--
--   * Writes go straight to the table under row-level security: a member can insert, update or delete only a row that is
--     theirs, and the check constraint refuses anything outside 1 to 14.
--
--   * Deleted with the account (on delete cascade), like everything else the member owns.
--
-- Additive: one table.

create table public.weekly_goal (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  goal       smallint not null check (goal between 1 and 14),
  updated_at timestamptz not null default now()
);

comment on table public.weekly_goal is
  'A member''s weekly practice goal (cases per week). Private to the member; no row means no goal.';

alter table public.weekly_goal enable row level security;

create policy "weekly_goal: select own" on public.weekly_goal
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "weekly_goal: insert own" on public.weekly_goal
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "weekly_goal: update own" on public.weekly_goal
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "weekly_goal: delete own" on public.weekly_goal
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Signed-in members only: visitors without an account get nothing.
revoke all on public.weekly_goal from anon, authenticated;
grant select, insert, update, delete on public.weekly_goal to authenticated;
