-- CaseLab: the book's own solution to a casebook case, written up in our own words, for a member who has done the case.
--
-- DESIGN
--
--   * library_case_solutions holds one write-up per library case: the question, the facts the interviewer gives, the book's structure, its
--     worked steps in order with its numbers, each exhibit rebuilt as a table of figures, the recommendation, risks and next steps. It is
--     a JSON document, in our own words (never the book's text or images), loaded by the library seed and kept out of git like the notes.
--
--   * It is locked away exactly like library_case_notes: RLS is on with no policy and the API roles get no privilege at all, so nobody can
--     read the table. library_solution_for() releases one write-up, only to a verified member who has logged that case themselves. Doing one
--     case never unlocks another, and a visitor or an unverified account gets nothing.
--
--   * Additive: one table and one function.

create table public.library_case_solutions (
  case_id    uuid primary key references public.library_cases (id) on delete cascade,
  solution   jsonb       not null check (jsonb_typeof(solution) = 'object'),
  updated_at timestamptz not null default now()
);

comment on table public.library_case_solutions is
  'Our own-words write-up of the book''s solution to each library case. No API role can read it: only library_solution_for() releases it, and only to a member who has logged that case.';

alter table public.library_case_solutions enable row level security;
revoke all on public.library_case_solutions from anon, authenticated;

create function public.library_solution_for(p_library_id uuid)
returns table (solution jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select s.solution
  from public.library_case_solutions s
  where s.case_id = p_library_id
    and (select public.is_member())
    -- Only for a member who has logged this case themselves: the function runs with elevated rights, so the check is explicit.
    and exists (
      select 1 from public.cases c
      where c.library_id = p_library_id and c.user_id = (select auth.uid())
    );
$$;

comment on function public.library_solution_for(uuid) is
  'Our write-up of the book''s solution to a library case, released only to a verified member who has logged that case (cases.library_id). Nobody else can read it.';

revoke all on function public.library_solution_for(uuid) from public, anon, authenticated;
grant execute on function public.library_solution_for(uuid) to authenticated;
