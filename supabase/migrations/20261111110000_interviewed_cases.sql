-- CaseLab: cases you ran as the INTERVIEWER, kept apart from the cases you solved.
--
-- Running a case teaches you a lot too, so it gets a place in the log. But it was not your practice, so it must never
-- sit among the cases you solved: it is a separate table, and nothing the app calculates from `cases` (totals, ratings,
-- trends, coverage, the weekly goal, suggestions) can see it.
--
-- DESIGN
--
--   * One row per case you interviewed: the date, the case (title, book, type, industry), who you interviewed, what you
--     told them, and what you learned from running it.
--
--   * PRIVATE. A member can read and change only their own rows (row-level security, all four commands). It is not part of
--     the profile, not copied to the public tables, never shared with members or visitors, and has no "who cased me" link.
--
--   * Same shape rules as `cases` (the case type list, a title that isn't blank), plus length limits so a hand-made request
--     can't store nonsense.
--
--   * Deleted with the account (on delete cascade), like everything else the member owns.
--
-- Additive: one table.

create table public.interviewed_cases (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,

  case_date  date not null default current_date,
  title      text not null check (length(btrim(title)) between 1 and 200),
  source     text check (length(source) <= 200),
  case_type  text not null check (case_type in (
               'Growth Strategy', 'Market Entry', 'Market Sizing', 'Profitability',
               'Mergers and Acquisitions', 'Revenue', 'Cost Reduction', 'Investment Decision',
               'Organizational Change', 'Operating Model', 'Non-traditional',
               'Sourcing / Outsourcing', 'Other')),
  industry   text check (length(industry) <= 100),
  partner    text check (length(partner) <= 100),   -- who you interviewed
  feedback   text check (length(feedback) <= 4000), -- what you told them
  learned    text check (length(learned) <= 4000),  -- what running it taught you

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.interviewed_cases is
  'Cases a member ran as the interviewer. Private to the member and never counted with the cases they solved.';

create index interviewed_cases_user_date_idx on public.interviewed_cases (user_id, case_date desc);

alter table public.interviewed_cases enable row level security;

create policy "interviewed_cases: select own" on public.interviewed_cases
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "interviewed_cases: insert own" on public.interviewed_cases
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "interviewed_cases: update own" on public.interviewed_cases
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "interviewed_cases: delete own" on public.interviewed_cases
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Signed-in members only: visitors without an account get nothing.
revoke all on public.interviewed_cases from anon, authenticated;
grant select, insert, update, delete on public.interviewed_cases to authenticated;
