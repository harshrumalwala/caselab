-- CaseLab: a library of practice cases from the casebooks, to search while logging a case and (later) to recommend from.
--
-- DESIGN
--
--   * One entry per case name, however many casebooks it appears in: the Booth MCG copy wins, otherwise the newest book (decided when
--     the library is loaded). `also_in` lists the other books it appears in, so a member who did it from another book finds it too.
--
--   * Two tables, kept apart on purpose.
--       library_cases       the part every member may see: the case's name, book, school, year, case type and industry, and whether
--                           the co-chairs recommend it. This is all a member who has NOT done a case may learn about it.
--       library_case_notes  our own analysis of the case (a summary, what a strong answer covers, common mistakes, the skills it
--                           tests, its difficulty). This is the part that would spoil a case, so NOTHING can read it directly: the API
--                           roles have no privilege on it at all.
--
--   * The analysis is released through one function, library_notes_for(), and only to a member who has logged that case (their
--     own `cases` row points at it through cases.library_id). It is for comparing their feedback with what a strong answer covers,
--     once they have done it. Everyone else, including a member who has not done the case, gets nothing.
--
--   * Searching goes through search_library(): signed-in, verified members only; every word you type must appear in the name,
--     book, school or year; the co-chairs' picks and newer books come first.
--
--   * Nothing here is writable by a member or a visitor. The library is loaded by the project owner (see supabase/seeds).
--
--   * cases.library_id remembers which library case a logged case came from (set when the member picks it from the search). It is
--     optional, private to the member like the rest of the case, and becomes null if a library case is ever removed.
--
-- Additive: two tables, one column, two functions.

create table public.library_cases (
  id           uuid primary key default gen_random_uuid(),
  book         text        not null check (length(book) between 1 and 120),
  school       text        not null check (length(school) between 1 and 60),
  year         smallint    not null check (year between 1990 and 2100),
  number       smallint    check (number is null or number > 0),
  name         text        not null check (length(name) between 1 and 160),
  firm         text        check (firm is null or length(firm) <= 80),
  case_type    text        not null check (case_type in (
                 'Growth Strategy', 'Market Entry', 'Market Sizing', 'Profitability', 'Mergers and Acquisitions', 'Revenue',
                 'Cost Reduction', 'Investment Decision', 'Organizational Change', 'Operating Model', 'Non-traditional',
                 'Sourcing / Outsourcing', 'Other')),
  industry     text        not null check (length(industry) between 1 and 100),
  cochair_pick boolean     not null default false,
  also_in      text[]      not null default '{}',
  created_at   timestamptz not null default now(),
  unique (book, name)
);

comment on table public.library_cases is
  'Practice cases from the casebooks: name, book, type and industry only (what a member who has not done the case may see). Read-only for verified members.';

create table public.library_case_notes (
  case_id      uuid primary key references public.library_cases (id) on delete cascade,
  difficulty   smallint    not null check (difficulty between 1 and 5),
  skills       text[]      not null,
  concepts     text[]      not null,
  summary      text        not null,
  strong_answer text       not null,
  pitfalls     text[]      not null,
  confidence   text        not null check (confidence in ('high', 'partial')),
  notes        text        not null default '',
  updated_at   timestamptz not null default now()
);

comment on table public.library_case_notes is
  'Our analysis of each library case. No API role can read it: only library_notes_for() releases it, and only to a member who has logged that case.';

alter table public.library_cases enable row level security;
alter table public.library_case_notes enable row level security;

create policy "library_cases: members read" on public.library_cases
  for select to authenticated using ((select public.is_member()));

-- Take everything back, then give back only what is needed. The analysis table gets nothing at all.
revoke all on public.library_cases from anon, authenticated;
revoke all on public.library_case_notes from anon, authenticated;
grant select (id, book, school, year, number, name, firm, case_type, industry, cochair_pick, also_in) on public.library_cases to authenticated;

-- Which library case a logged case came from.
alter table public.cases
  add column library_id uuid references public.library_cases (id) on delete set null;

create index cases_library_id_idx on public.cases (library_id) where library_id is not null;

create function public.search_library(p_query text, p_limit integer default 8)
returns table (
  id           uuid,
  name         text,
  book         text,
  school       text,
  year         smallint,
  case_type    text,
  industry     text,
  cochair_pick boolean,
  also_in      text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select lower(trim(coalesce(p_query, ''))) as s)
  select c.id, c.name, c.book, c.school, c.year, c.case_type, c.industry, c.cochair_pick, c.also_in
  from public.library_cases c, q
  where (select public.is_member())
    and length(q.s) >= 2
    and not exists (
      select 1
      from unnest(string_to_array(q.s, ' ')) as w
      where w <> '' and position(w in lower(c.name || ' ' || c.book || ' ' || c.school || ' ' || c.year::text || ' ' || array_to_string(c.also_in, ' '))) = 0
    )
  order by (lower(c.name) = q.s) desc,
           (lower(c.name) like q.s || '%') desc,
           c.cochair_pick desc,
           c.year desc,
           c.name
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

comment on function public.search_library(text, integer) is
  'Search the library by name, book (including the other books a case appears in), school or year. Verified members only. Returns only what a member who has not done the case may see.';

create function public.library_notes_for(p_library_id uuid)
returns table (
  difficulty    smallint,
  skills        text[],
  concepts      text[],
  summary       text,
  strong_answer text,
  pitfalls      text[],
  confidence    text
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.difficulty, n.skills, n.concepts, n.summary, n.strong_answer, n.pitfalls, n.confidence
  from public.library_case_notes n
  where n.case_id = p_library_id
    and (select public.is_member())
    -- Only for a member who has logged this case themselves: the function runs with elevated rights, so the check is explicit.
    and exists (
      select 1 from public.cases c
      where c.library_id = p_library_id and c.user_id = (select auth.uid())
    );
$$;

comment on function public.library_notes_for(uuid) is
  'Our analysis of a library case, released only to a verified member who has logged that case (cases.library_id). Nobody else can read it.';

revoke all on function public.search_library(text, integer) from public, anon, authenticated;
revoke all on function public.library_notes_for(uuid) from public, anon, authenticated;
grant execute on function public.search_library(text, integer) to authenticated;
grant execute on function public.library_notes_for(uuid) to authenticated;
