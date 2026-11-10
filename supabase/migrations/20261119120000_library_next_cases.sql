-- CaseLab: suggest casebook cases that exercise a skill Bucket says to work on.
--
-- DESIGN
--
--   * library_next_cases(skill) returns library cases whose (private) analysis lists that skill, that the caller has not done yet. The skill
--     tags stay private: this function only reads library_case_notes inside the database and returns the same public columns as
--     search_library() (name, book, school, year, type, industry, co-chair pick). A member learns "this case is a good one for your quant"
--     from the suggestion itself, never what is in the case or how it is solved.
--   * "Not done yet": no case of the caller's is linked to it, and none has the same name (the library's name key). Only the caller's own
--     cases are looked at, and never returned.
--   * Verified members only, like the rest of the library. The skill must be one of the seven we tag; anything else returns nothing.
--   * Order: the co-chairs' picks first, then newer books, then name. It does not weigh difficulty yet.

create function public.library_next_cases(p_skill text, p_limit integer default 3)
returns table (
  id            uuid,
  name          text,
  book          text,
  school        text,
  year          smallint,
  case_type     text,
  industry      text,
  cochair_pick  boolean,
  also_in       text[],
  details_known boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.book, c.school, c.year, c.case_type, c.industry, c.cochair_pick, c.also_in, c.details_known
  from public.library_cases c
  join public.library_case_notes n on n.case_id = c.id
  where (select public.is_member())
    and p_skill in ('behavioral', 'prompt', 'framework', 'quant', 'exhibits', 'brainstorm', 'recommendation')
    and p_skill = any (n.skills)
    and not exists (
      select 1
      from public.cases mine
      where mine.user_id = (select auth.uid())
        and (mine.library_id = c.id or (c.name_key <> '' and public.library_name_key(mine.title) = c.name_key))
    )
  order by c.cochair_pick desc, c.year desc, c.name
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;

comment on function public.library_next_cases(text, integer) is
  'Library cases that exercise a skill and that the caller has not done. Verified members only; returns only the public columns, never our analysis.';

revoke all on function public.library_next_cases(text, integer) from public, anon, authenticated;
grant execute on function public.library_next_cases(text, integer) to authenticated;
