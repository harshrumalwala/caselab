-- CaseLab: a separate, off-by-default switch for the "what I'm sharpening" summary on a member's profile link.
--
-- WHY A SWITCH OF ITS OWN (issue #121; the owner's decision, recorded in DECISIONS.md)
--
--   `share_skills` already puts a member's per-case skill ratings in the rows a link holder reads, so the summary
--   releases no new figure: it is arithmetic anyone could do by hand. What it adds is a sentence about the person
--   at the top of a page anonymous people open, and since the personal link became the whole public face of a
--   profile the people most likely to open one are second-year students about to run them a case and firm
--   representatives. Consent to per-case scores is not consent to a summary judgment, so the summary is asked for
--   separately and nobody is summarised until they ask.
--
-- WHAT THIS MIGRATION DOES
--
--   * profiles.share_sharpening          boolean, OFF by default. Every existing member starts off; nothing becomes
--                                        visible by applying this.
--   * public_profiles.share_sharpening   the same flag in the link-visible copy, so the browser holding the link
--                                        knows whether the member asked for the summary.
--   * public_person(id)                  returns it, alongside the other switches it already returns.
--
--   There is no stored summary and no new data of any kind: the skills, the averages and the wording are worked out
--   in the browser from the `skill_scores` that `public_person_cases(id)` already returns under `share_skills`. This
--   flag is the member's answer to "may this be said about me", and nothing else.
--
-- GRANTS
--   `profiles` is granted to `authenticated` at table level (20261020120000), so the new column is covered by that
--   grant and needs no new one: another member can read the flag on a listed profile exactly as they can read
--   share_skills or share_level. `public_profiles` is granted to NO API role at all since 20261124120000, so the new
--   column there is unreadable except through the function below, which is the only way out.
--
-- NO CONSTRAINT TYING IT TO share_skills on purpose: a member who turns skill scores off should not have a save
-- refused, and with no scores the summary simply has nothing to say and does not appear.
--
-- Additive: two columns, two replaced functions, one re-projection.

alter table public.profiles
  add column share_sharpening boolean not null default false;

comment on column public.profiles.share_sharpening is
  'The member chose to show, on their profile link, a short summary of the skills they are sharpening and the ones they are strong in, worked out from the scores they already share. Off by default.';

alter table public.public_profiles
  add column share_sharpening boolean not null default false;

-- ---------------------------------------------------------------------------------------
-- The link-visible copy carries the flag. (Replaces the version in 20261104120000.)
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
     share_details, in_directory, share_burned, burned_books, burned_cases, share_sharpening)
  values
    (p.user_id, p.display_name, p.mba_class, p.share_cases, p.share_overall, p.share_skills, p.share_improvement,
     p.share_partner, p.share_details, not p.public_link_only, p.share_burned,
     case when p.share_burned then p.burned_books else '{}'::text[] end,
     case when p.share_burned then p.burned_cases else '[]'::jsonb end,
     p.share_sharpening)
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
    burned_cases      = excluded.burned_cases,
    share_sharpening  = excluded.share_sharpening;
end;
$$;

revoke all on function public.sync_public_profile(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- One member by exact id, now saying whether they asked for the summary. (Replaces 20261104120000's version.)
-- ---------------------------------------------------------------------------------------
drop function public.public_person(uuid);

create function public.public_person(p_id uuid)
returns table (
  user_id uuid, display_name text, mba_class text,
  share_cases boolean, share_overall boolean, share_skills boolean, share_improvement boolean,
  share_partner boolean, share_details boolean,
  share_burned boolean, burned_books text[], burned_cases jsonb,
  share_sharpening boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.display_name, p.mba_class,
         p.share_cases, p.share_overall, p.share_skills, p.share_improvement,
         p.share_partner, p.share_details,
         p.share_burned, p.burned_books, p.burned_cases,
         p.share_sharpening
  from public.public_profiles p
  where p.user_id = p_id;
$$;

revoke all on function public.public_person(uuid) from public, anon, authenticated;
grant execute on function public.public_person(uuid) to anon;

-- Re-project everyone, so each public copy carries the new column. The switch is off for all of them, so nothing
-- about anybody becomes visible.
select public.refresh_all_shared();
