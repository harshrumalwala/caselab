-- CaseLab: casebook cases that fill a gap in a member's practice (a case type or industry they have done little or none of).
--
-- DESIGN
--
--   * library_gap_cases(types, industries) returns library cases whose case type is one of the given types, or whose industry is one of the
--     given industries, that the caller has not done yet. The member's own coverage is worked out in the app from their own cases; this
--     function only finds unseen cases for the gaps they name, and returns the same public columns as search_library().
--   * Cases whose type and industry are not known yet are left out (they cannot fill a named gap), and cases we have analysed come first,
--     so the member can read the takeaways after doing them. Whether a case is analysed is never returned, only used to order the list.
--   * "Not done yet" is the same rule as library_next_cases(): no case of the caller's is linked to it, and none has the same name.
--   * Verified members only. The lists are capped, so a call cannot be used to read the library out.

create function public.library_gap_cases(p_types text[], p_industries text[], p_limit integer default 12)
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
  left join public.library_case_notes n on n.case_id = c.id
  where (select public.is_member())
    and c.details_known
    and (
      c.case_type = any ((coalesce(p_types, array[]::text[]))[1:15])
      or c.industry = any ((coalesce(p_industries, array[]::text[]))[1:15])
    )
    and not exists (
      select 1
      from public.cases mine
      where mine.user_id = (select auth.uid())
        and (mine.library_id = c.id or (c.name_key <> '' and public.library_name_key(mine.title) = c.name_key))
    )
  order by (n.case_id is not null) desc, c.cochair_pick desc, c.year desc, c.name
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;

comment on function public.library_gap_cases(text[], text[], integer) is
  'Library cases of the given case types or industries that the caller has not done. Verified members only; returns only the public columns, never our analysis.';

revoke all on function public.library_gap_cases(text[], text[], integer) from public, anon, authenticated;
grant execute on function public.library_gap_cases(text[], text[], integer) to authenticated;
