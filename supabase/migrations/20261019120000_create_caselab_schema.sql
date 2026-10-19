-- CaseLab schema, version 1.
--
-- Two tables, both owned by a user and protected by row level security:
--   cases          one row per practice case (mirrors the Log Case form / MCG case log)
--   opportunities  the hand-edited lists from the MCG "Opportunity Areas" tab
--
-- Everything else the app shows (averages, coverage, trends, suggestions, knowledge history,
-- custom industries) is computed in the browser from these rows, so it needs no tables.
--
-- This migration only creates new objects; it contains no destructive statements.

-- ---------------------------------------------------------------------------------------
-- cases
-- ---------------------------------------------------------------------------------------
create table public.cases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,

  case_date        date not null default current_date,
  title            text not null check (length(btrim(title)) > 0),
  source           text,
  case_type        text not null check (case_type in (
                     'Growth Strategy', 'Market Entry', 'Market Sizing', 'Profitability',
                     'Mergers and Acquisitions', 'Revenue', 'Cost Reduction', 'Investment Decision',
                     'Organizational Change', 'Operating Model', 'Non-traditional',
                     'Sourcing / Outsourcing', 'Other')),
  industry         text,                                   -- null for cases imported from the MCG sheet
  partner          text,                                   -- interviewer / practice partner

  overall          smallint check (overall between 1 and 5),
  overall_feedback text,

  -- { "framework": { "rating": 4, "feedback": "..." }, ... } for the eight MCG skills
  -- (behavioral1, behavioral2, prompt, framework, quant, exhibits, brainstorm, recommendation).
  -- Every rating is optional. Kept as one column so adding a skill never needs a migration.
  skills           jsonb not null default '{}'::jsonb check (jsonb_typeof(skills) = 'object'),

  went_well        text,
  struggled        text,
  concepts         text,                                   -- "Concepts I learned": feeds the learning history
  next_focus       text,
  improvement_area text check (improvement_area in (
                     'behavioral', 'prompt', 'framework', 'quant', 'exhibits', 'brainstorm', 'recommendation')),
  other_notes      text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.cases is 'One row per CaseLab practice case. Owned by user_id; see row level security policies.';

create index cases_user_date_idx on public.cases (user_id, case_date desc);

-- ---------------------------------------------------------------------------------------
-- opportunities
-- ---------------------------------------------------------------------------------------
create table public.opportunities (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('exposure', 'skill')),
  text       text not null check (length(btrim(text)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.opportunities is 'Hand-edited improvement lists (cases/concepts to explore, skills to work on).';

create index opportunities_user_idx on public.opportunities (user_id);

-- ---------------------------------------------------------------------------------------
-- Row level security: a signed-in user can only ever touch their own rows.
-- ---------------------------------------------------------------------------------------
alter table public.cases enable row level security;
alter table public.opportunities enable row level security;

-- (select auth.uid()) is evaluated once per statement rather than once per row.
create policy "cases: select own" on public.cases
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "cases: insert own" on public.cases
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "cases: update own" on public.cases
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cases: delete own" on public.cases
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "opportunities: select own" on public.opportunities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "opportunities: insert own" on public.opportunities
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "opportunities: update own" on public.opportunities
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "opportunities: delete own" on public.opportunities
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Table privileges: signed-in users only. The anonymous role gets nothing at all.
revoke all on public.cases from anon;
revoke all on public.opportunities from anon;
grant select, insert, update, delete on public.cases to authenticated;
grant select, insert, update, delete on public.opportunities to authenticated;
