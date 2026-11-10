-- CaseLab: let the library list a case before we know its case type and industry.
--
-- DESIGN
--
--   * Most of the casebooks are only listed for now: we know the case's name, book and year (enough to find it while typing a title and to
--     mark it as done), but not yet its case type or industry. Those cases are stored with `details_known = false`. Their case_type and
--     industry hold "Other" as a placeholder that is never shown or filled in anywhere: picking one fills in the title and the book and
--     leaves the case type and industry for the member to choose, instead of putting in a guess.
--
--   * Everything about privacy is unchanged: this only adds one boolean a member may read, the same as the other public columns.
--
-- Changes: one column, and search_library() and match_my_cases() also return it (and the review only offers to change a case's type or
-- industry when the library really knows them).

alter table public.library_cases
  add column details_known boolean not null default true;

grant select (details_known) on public.library_cases to authenticated;

drop function public.search_library(text, integer);

create function public.search_library(p_query text, p_limit integer default 8)
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
  with q as (select lower(trim(coalesce(p_query, ''))) as s)
  select c.id, c.name, c.book, c.school, c.year, c.case_type, c.industry, c.cochair_pick, c.also_in, c.details_known
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
           c.details_known desc,
           c.year desc,
           c.name
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

comment on function public.search_library(text, integer) is
  'Search the library by name, book (including the other books a case appears in), school or year. Verified members only. Returns only what a member who has not done the case may see.';

revoke all on function public.search_library(text, integer) from public, anon, authenticated;
grant execute on function public.search_library(text, integer) to authenticated;

drop function public.match_my_cases();

create function public.match_my_cases()
returns table (
  case_id            uuid,
  title              text,
  source             text,
  case_type          text,
  industry           text,
  linked             boolean,
  sure               boolean,
  library_id         uuid,
  lib_name           text,
  lib_book           text,
  lib_school         text,
  lib_year           smallint,
  lib_case_type      text,
  lib_industry       text,
  lib_cochair        boolean,
  lib_also_in        text[],
  lib_details_known  boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.case_id, m.title, m.source, m.case_type, m.industry, m.linked, m.sure, m.library_id,
         m.lib_name, m.lib_book, m.lib_school, m.lib_year, m.lib_case_type, m.lib_industry, m.lib_cochair, m.lib_also_in, m.lib_details_known
  from (
    select distinct on (c.id)
           c.id as case_id, c.title, coalesce(c.source, '') as source, c.case_type, coalesce(c.industry, '') as industry,
           (c.library_id is not null) as linked,
           public.library_source_matches(c.source, l.book, l.also_in) as sure,
           l.id as library_id, l.name as lib_name, l.book as lib_book, l.school as lib_school, l.year as lib_year,
           l.case_type as lib_case_type, l.industry as lib_industry, l.cochair_pick as lib_cochair, l.also_in as lib_also_in,
           l.details_known as lib_details_known
    from public.cases c
    join public.library_cases l
      on (c.library_id is not null and l.id = c.library_id)
      or (c.library_id is null and l.name_key <> '' and l.name_key = public.library_name_key(c.title))
    where c.user_id = (select auth.uid())
      and (select public.is_member())
    order by c.id, l.cochair_pick desc, l.year desc, l.name
  ) m
  where not m.linked
     or m.title is distinct from m.lib_name
     or m.source is distinct from m.lib_book
     or (m.lib_details_known and (m.case_type is distinct from m.lib_case_type or m.industry is distinct from m.lib_industry))
  order by m.title
  limit 200;
$$;

comment on function public.match_my_cases() is
  'The caller''s own cases that match a library case but are not linked yet, or are linked and differ from it. Verified members only; never returns our analysis.';

revoke all on function public.match_my_cases() from public, anon, authenticated;
grant execute on function public.match_my_cases() to authenticated;
