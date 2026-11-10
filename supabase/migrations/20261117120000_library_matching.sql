-- CaseLab: match cases members already logged to the casebook library, so "cases you've done" is accurate.
--
-- DESIGN
--
--   * Matching is by name: the same case title ignoring case, punctuation, "&" and "Co."/"Inc." (library_name_key). A match is "sure"
--     when the member's source also names the book (or one of the other books the case is also in): "Booth casebook", "MCG" and
--     "Kellogg 2020" all do. A title that matches with a blank or unrelated source is only a maybe, because generic names such as
--     "Shoe Co." are reused by different casebooks.
--
--   * link_cases_to_library() is the one-off backfill. It ONLY adds the link (cases.library_id) and ONLY for sure matches that are not
--     linked yet. It changes nothing else about a case: not the title, source, case type or industry. It is for the project owner to run
--     when the library is loaded (the seed does); no API role can call it.
--
--   * match_my_cases() is what a member's own review screen reads: their own cases that match a library case but are not linked yet, or
--     are linked and differ from the library in title, book, case type or industry, with the library's details beside them so the member
--     can choose to update. It only ever returns the caller's own cases, to verified members, and only what any member may know about
--     a library case (never our analysis).
--
-- Additive: one column, one index, four functions.

create function public.library_name_key(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(lower(coalesce(p_name, '')), '&', ' and ', 'g'),
               '[^a-z0-9 ]', ' ', 'g'),
             '\m(co|inc|corp|company|corporation|llc|ltd)\M', ' ', 'g'),
           '\s+', ' ', 'g'));
$$;

alter table public.library_cases
  add column name_key text generated always as (public.library_name_key(name)) stored;

create index library_cases_name_key_idx on public.library_cases (name_key);

-- Does a member's free-text source name this book or one of the other books the case is also in? The first word of a book is its school
-- ("Booth MCG 2026-2027" -> booth), and "MCG" counts for the Booth book.
create function public.library_source_matches(p_source text, p_book text, p_also_in text[])
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(bool_or(
           (t.school ~ '^[a-z]+$' and lower(coalesce(p_source, '')) ~ ('\m' || t.school || '\M'))
           or (lower(t.book) like '%mcg%' and lower(coalesce(p_source, '')) ~ '\mmcg\M')
         ), false)
  from (
    select b as book, split_part(trim(lower(b)), ' ', 1) as school
    from unnest(array[p_book] || coalesce(p_also_in, '{}'::text[])) as b
  ) t;
$$;

create function public.link_cases_to_library()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  linked integer;
begin
  update public.cases c
     set library_id = l.id
    from public.library_cases l
   where c.library_id is null
     and l.name_key = public.library_name_key(c.title)
     and l.name_key <> ''
     and public.library_source_matches(c.source, l.book, l.also_in);
  get diagnostics linked = row_count;
  return linked;
end;
$$;

comment on function public.link_cases_to_library() is
  'One-off backfill: link logged cases to the library case they match by name AND book. Adds the link only; changes nothing else. Owner only.';

create function public.match_my_cases()
returns table (
  case_id         uuid,
  title           text,
  source          text,
  case_type       text,
  industry        text,
  linked          boolean,
  sure            boolean,
  library_id      uuid,
  lib_name        text,
  lib_book        text,
  lib_school      text,
  lib_year        smallint,
  lib_case_type   text,
  lib_industry    text,
  lib_cochair     boolean,
  lib_also_in     text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.case_id, m.title, m.source, m.case_type, m.industry, m.linked, m.sure, m.library_id,
         m.lib_name, m.lib_book, m.lib_school, m.lib_year, m.lib_case_type, m.lib_industry, m.lib_cochair, m.lib_also_in
  from (
    select distinct on (c.id)
           c.id as case_id, c.title, coalesce(c.source, '') as source, c.case_type, coalesce(c.industry, '') as industry,
           (c.library_id is not null) as linked,
           public.library_source_matches(c.source, l.book, l.also_in) as sure,
           l.id as library_id, l.name as lib_name, l.book as lib_book, l.school as lib_school, l.year as lib_year,
           l.case_type as lib_case_type, l.industry as lib_industry, l.cochair_pick as lib_cochair, l.also_in as lib_also_in
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
     or m.case_type is distinct from m.lib_case_type
     or m.industry is distinct from m.lib_industry
  order by m.title
  limit 200;
$$;

comment on function public.match_my_cases() is
  'The caller''s own cases that match a library case but are not linked yet, or are linked and differ from it. Verified members only; never returns our analysis.';

revoke all on function public.library_name_key(text) from public, anon, authenticated;
revoke all on function public.library_source_matches(text, text, text[]) from public, anon, authenticated;
revoke all on function public.link_cases_to_library() from public, anon, authenticated;
revoke all on function public.match_my_cases() from public, anon, authenticated;
grant execute on function public.match_my_cases() to authenticated;
