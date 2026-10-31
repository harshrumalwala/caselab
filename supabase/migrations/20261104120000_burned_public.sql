-- CaseLab: let a member show their burned books and cases to visitors without an account too.
--
-- DESIGN
--
--   * Burned books and cases (profiles.burned_books / profiles.burned_cases) are visible to verified members who can see
--     the profile. That does not change. This adds ONE opt-in switch, `share_burned`, OFF for everyone, that also shows
--     them to visitors when the member is visible without an account.
--
--   * Same pattern as everything else visitors can see: the data is copied into `public_profiles` by the trigger code
--     ONLY while the member is public AND has switched this on. While it is off the public copy is empty, so nothing is
--     there to read, filter or count. Turning it off, going private or unlisting empties the copy at once.
--
--   * Link-only members are still served only through `public_person(id)`, which now also returns these fields (empty
--     unless they opted in).
--
-- Additive, plus replacing two functions. Nothing becomes visible by applying it: the switch is off for everyone.

alter table public.profiles
  add column share_burned boolean not null default false;

comment on column public.profiles.share_burned is
  'Also show burned books and cases to visitors without an account (needs public_profile). Off by default.';

alter table public.public_profiles
  add column share_burned  boolean not null default false,
  add column burned_books  text[] not null default '{}',
  add column burned_cases  jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------------------
-- A public member's row now carries the burned lists, but only when they opted in. (Replaces the earlier version.)
-- ---------------------------------------------------------------------------------------
create or replace function public.sync_public_profile(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles%rowtype;
begin
  select * into p from public.profiles where user_id = p_user for share;
  if not found or not p.listed or not p.public_profile or not public.is_member_id(p_user) then
    delete from public.public_profiles where user_id = p_user;
    return;
  end if;

  insert into public.public_profiles
    (user_id, display_name, mba_class, share_cases, share_overall, share_skills, share_improvement, share_partner,
     share_details, in_directory, share_burned, burned_books, burned_cases)
  values
    (p.user_id, p.display_name, p.mba_class, p.share_cases, p.share_overall, p.share_skills, p.share_improvement,
     p.share_partner, p.share_details, not p.public_link_only, p.share_burned,
     case when p.share_burned then p.burned_books else '{}'::text[] end,
     case when p.share_burned then p.burned_cases else '[]'::jsonb end)
  on conflict (user_id) do update set
    display_name      = excluded.display_name,
    mba_class         = excluded.mba_class,
    share_cases       = excluded.share_cases,
    share_overall     = excluded.share_overall,
    share_skills      = excluded.share_skills,
    share_improvement = excluded.share_improvement,
    share_partner     = excluded.share_partner,
    share_details     = excluded.share_details,
    in_directory      = excluded.in_directory,
    share_burned      = excluded.share_burned,
    burned_books      = excluded.burned_books,
    burned_cases      = excluded.burned_cases;
end;
$$;

revoke all on function public.sync_public_profile(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Reading ONE member by exact id (directory or link only). The return shape changes, so the function is recreated.
-- ---------------------------------------------------------------------------------------
drop function public.public_person(uuid);

create function public.public_person(p_id uuid)
returns table (
  user_id uuid, display_name text, mba_class text,
  share_cases boolean, share_overall boolean, share_skills boolean, share_improvement boolean,
  share_partner boolean, share_details boolean,
  share_burned boolean, burned_books text[], burned_cases jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.display_name, p.mba_class,
         p.share_cases, p.share_overall, p.share_skills, p.share_improvement,
         p.share_partner, p.share_details,
         p.share_burned, p.burned_books, p.burned_cases
  from public.public_profiles p
  where p.user_id = p_id;
$$;

revoke all on function public.public_person(uuid) from public, anon, authenticated;
grant execute on function public.public_person(uuid) to anon;

-- Re-project everyone. The switch is off for all, so every public copy of the lists stays empty.
select public.refresh_all_shared();
