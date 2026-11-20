-- CaseLab: a member's profile link stops depending on People search (issue #244).
--
-- WHY
--   "Appear in People search" and "People with my link can see my profile" are two audiences: classmates browsing
--   the member directory, and one named person holding a link. Until now the second was impossible without the
--   first, because `listed` gated both. A member who wanted to hand their link to a second-year or a firm
--   representative had to put their name in front of every classmate as the price. The owner decided on 2026-11-19
--   to separate them.
--
-- WHAT CHANGES (three objects, named exactly)
--
--   1. The check constraint `profiles_public_requires_listed` on `public.profiles` is DROPPED. While it stands the
--      database physically refuses `listed = false, public_profile = true`, so nothing else here could be reached.
--   2. `public.sync_public_profile(uuid)` no longer requires `listed`. Its guard keeps `public_profile` and
--      `public.is_member_id(p_user)`; only `not p.listed` is removed. (Replaces the version in 20261125120000.)
--   3. `public.refresh_shared_case(uuid)` is corrected at BOTH of its gates on `listed`, not one. (Replaces the
--      version in 20261030120000.)
--        * the first gate decides whether a row exists in `public.shared_cases` at all;
--        * the second (`v_public`) decides whether the link-visible copy in `public.public_shared_cases` is written.
--      The public copy is built by `select ... from public.shared_cases s`, and `public_shared_cases.case_id` is a
--      foreign key onto `public.shared_cases (case_id) on delete cascade`, so the public row cannot exist without
--      its member-side row. Changing only the second gate would give a link-only member a profile that opens and
--      shows zero cases.
--
--   Then `public.refresh_all_shared()` runs, so every existing row is re-projected under the new rule.
--
-- WHICH SHAPE THE FIRST GATE TAKES, AND WHY (the open question in issue #244)
--
--   The first gate becomes `not (p.listed or p.public_profile)`: one source table, and `public.shared_cases` stays
--   the single definition of "what of this case is shareable". The alternative was to build `public_shared_cases`
--   from `public.cases` directly, keeping the member-side row absent for an unlisted member. That was rejected on
--   two pieces of evidence in the schema, not on taste:
--     * `public.public_shared_cases.case_id references public.shared_cases (case_id) on delete cascade`
--       (20261021120000:152). A public row with no member-side row is not representable, so building from
--       `public.cases` would mean dropping that foreign key, which is also what removes the public copy when a case
--       is deleted or unshared. The cascade would have to be rebuilt by hand.
--     * `public.public_shared_cases.share_id` is `not null unique` and is copied from `shared_cases.share_id`,
--       whose `default gen_random_uuid()` lives on the member-side table alone (20261020120000:107). A second
--       projection would have to invent or re-find that handle, and a case's public handle must not change.
--   The cost of this shape is real and is stated here: an unlisted member's rows now EXIST in
--   `public.shared_cases`, where their absence used to be the belt and row level security the braces. Only the
--   braces hold now — the policy `"shared_cases: members read"` (20261020120000:314), whose own comment says
--   "even if a stale row were ever left behind, it could not be served". `src/data/profileLink.db.test.ts` reads
--   that table as another member, as a visitor and as a signed-out caller, and proves it is still closed.
--   Nothing else reads `public.shared_cases`: every other reference to it in the migrations is one of the
--   projection functions, one of the two policies, or a column grant.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
--
--   * `public.is_member_id(uuid)` stays in every condition it is in today. Only `listed` is removed. A verified
--     email is still required, and `is_member_id()` is still the single definition of membership.
--   * An unlisted member still does not appear in People search, and two independent things keep it that way,
--     neither touched here: the policy `"profiles: members read listed, owner reads own"` on `public.profiles`
--     (20261020120000:297), whose `using` clause is
--     `(select auth.uid()) = user_id or ((select public.is_member()) and listed)`; and the client query in
--     `src/data/supabaseCommunity.ts`, `from('profiles').select('*').eq('listed', true)`.
--   * An unlisted member's cases stay unreadable by other members: the policy `"shared_cases: members read"` on
--     `public.shared_cases` (20261020120000:314) still requires `exists (select 1 from public.profiles p where
--     p.user_id = shared_cases.owner_id and p.listed)`.
--   * Everything else that requires `listed` keeps requiring it: `public.member_interviewed(uuid)`
--     (20261111120000:48), practice requests (20261108120000:54) and `public.revoke_nonmembers()`
--     (20261030120000:303), which still clears both switches for anyone who stops being a member.
--   * Release stays through the existing functions only: `public.public_profiles` and `public.public_shared_cases`
--     are granted to no API role (20261124120000:37-38), and `public.public_person(uuid)` /
--     `public.public_person_cases(uuid)` remain the only way out, `anon`-executable, by exact member id.
--   * `public.profiles.public_link_only`, its check `profiles_link_only_requires_public`, and
--     `public.public_profiles.in_directory` are vestigial since issue #96 and are left exactly as they are.
--
-- WHAT IT MEANS FOR EXISTING ROWS
--
--   Nobody becomes more or less visible. `profiles_public_requires_listed` has made `listed = false,
--   public_profile = true` unrepresentable since 20261021120000, so no stored row can change audience under the
--   new rule. The query that demonstrates it, which is also run as a guard below:
--
--       select count(*) from public.profiles where not listed and public_profile;   -- expected: 0
--
--   The re-projection at the end therefore rewrites nothing. The new state becomes reachable only once a member
--   can save it, which is the app half (issue #245) and is deliberately not in this migration: the database
--   becomes permissive first and the app stays restrictive, so applying this on its own changes nothing for
--   anybody.
--
-- Drops one constraint, replaces two functions, re-projects every row. It is written for the state before it runs
-- and is meant to run once: the guard below asserts that state, and after this migration a member may legitimately
-- hold it.

-- ---------------------------------------------------------------------------------------
-- 0. The count this migration claims, as a guard. It can only be non-zero if the constraint below had already been
--    removed by hand, which is a state a person should look at rather than a migration walk past.
-- ---------------------------------------------------------------------------------------
do $$
declare
  n integer;
begin
  select count(*) into n from public.profiles where not listed and public_profile;
  if n <> 0 then
    raise exception 'Expected no profile with listed = false and public_profile = true before this migration, found %', n;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- 1. Being reachable by link no longer means being in People search
-- ---------------------------------------------------------------------------------------
alter table public.profiles
  drop constraint profiles_public_requires_listed;

comment on column public.profiles.public_profile is
  'People holding this member''s own profile link can open it without an account (see public_profiles / public_shared_cases). Independent of `listed`: a member can be reachable by link without appearing in People search. Never includes free text.';

-- ---------------------------------------------------------------------------------------
-- 2. The link-visible profile: public_profile and membership, no longer listing.
--    (Replaces the version in 20261125120000_share_sharpening.sql: that body, with `not p.listed` removed.)
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
  if not found or not p.public_profile or not public.is_member_id(p_user) then
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
-- 3. The two projections of a case, both gates corrected.
--    (Replaces the version in 20261030120000_link_only_profiles_and_open_details.sql: that body, with the first
--    gate widened to `not (p.listed or p.public_profile)` and `p.listed and` removed from `v_public`.)
-- ---------------------------------------------------------------------------------------
create or replace function public.refresh_shared_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cases%rowtype;
  p public.profiles%rowtype;
  v_has_profile boolean;
  v_full boolean;
  v_prof boolean;
  v_public boolean;
begin
  select * into c from public.cases where id = p_case_id;
  if not found then
    delete from public.shared_cases where case_id = p_case_id;  -- cascades to the public copy
    return;
  end if;

  -- Lock the profile row while we read it, so a concurrent profile change and a case change run one after
  -- the other and a stale shared row can't be left behind by a race.
  select * into p from public.profiles where user_id = c.user_id for share;
  v_has_profile := found;
  v_full := c.share_mode = 'full';
  v_prof := c.share_mode = 'profile';

  -- Visible at all? Needs a profile with an audience — People search, a profile link, or both — and either a
  -- per-case opt-in or the profile-wide switch. A row here is read by other members only through the policy
  -- "shared_cases: members read", which still requires the owner to be listed, so an unlisted member's row exists
  -- for the link's sake and reaches nobody else.
  if not v_has_profile
     or not (p.listed or p.public_profile)
     or c.share_mode = 'private'
     or not (c.share_mode in ('history', 'full') or (v_prof and p.share_cases)) then
    delete from public.shared_cases where case_id = c.id;  -- cascades to the public copy
    return;
  end if;

  insert into public.shared_cases
    (case_id, owner_id, case_date, title, source, partner, case_type, industry,
     overall, skill_scores, feedback, improvement_area, notes, other_notes)
  values (
    c.id, c.user_id, c.case_date, left(c.title, 200), left(c.source, 200),
    case when p.share_partner then nullif(btrim(left(c.partner, 100)), '') end,
    c.case_type, left(c.industry, 100),
    case when v_full or (v_prof and (p.share_overall or p.share_details))     then c.overall end,
    case when v_full or (v_prof and (p.share_skills or p.share_details))      then public._skill_scores(c.skills) end,
    case when v_full or (v_prof and (p.share_feedback or p.share_details))    then public._feedback(c.overall_feedback, c.skills) end,
    case when v_full or (v_prof and (p.share_improvement or p.share_details)) then c.improvement_area end,
    case when v_full or (v_prof and (p.share_notes or p.share_details)) then
      nullif(jsonb_strip_nulls(jsonb_build_object(
        'went_well',  nullif(btrim(coalesce(c.went_well, '')), ''),
        'struggled',  nullif(btrim(coalesce(c.struggled, '')), ''),
        'concepts',   nullif(btrim(coalesce(c.concepts, '')), ''),
        'next_focus', nullif(btrim(coalesce(c.next_focus, '')), '')
      )), '{}'::jsonb)
    end,
    -- "Other notes" are shared only when the member opens everything.
    case when p.share_details and (v_full or v_prof) then nullif(btrim(left(c.other_notes, 4000)), '') end
  )
  on conflict (case_id) do update set
    owner_id         = excluded.owner_id,
    case_date        = excluded.case_date,
    title            = excluded.title,
    source           = excluded.source,
    partner          = excluded.partner,
    case_type        = excluded.case_type,
    industry         = excluded.industry,
    overall          = excluded.overall,
    skill_scores     = excluded.skill_scores,
    feedback         = excluded.feedback,
    improvement_area = excluded.improvement_area,
    notes            = excluded.notes,
    other_notes      = excluded.other_notes
  -- Only rewrite the row when something members can see actually changed.
  where (public.shared_cases.owner_id, public.shared_cases.case_date, public.shared_cases.title,
         public.shared_cases.source, public.shared_cases.partner, public.shared_cases.case_type,
         public.shared_cases.industry, public.shared_cases.overall, public.shared_cases.skill_scores,
         public.shared_cases.feedback, public.shared_cases.improvement_area, public.shared_cases.notes,
         public.shared_cases.other_notes)
        is distinct from
        (excluded.owner_id, excluded.case_date, excluded.title, excluded.source, excluded.partner,
         excluded.case_type, excluded.industry, excluded.overall, excluded.skill_scores, excluded.feedback,
         excluded.improvement_area, excluded.notes, excluded.other_notes);

  -- The public copy: only for public members. Written feedback, learning notes and other notes are copied only
  -- when the member has opened everything, and cut to 2000 characters.
  v_public := p.public_profile
              and public.is_member_id(c.user_id)
              and exists (select 1 from public.public_profiles pp where pp.user_id = c.user_id);
  if v_public then
    insert into public.public_shared_cases
      (case_id, share_id, owner_id, case_date, title, source, partner, case_type, industry, overall, skill_scores,
       improvement_area, feedback, notes, other_notes)
    select s.case_id, s.share_id, s.owner_id, s.case_date, s.title, s.source, s.partner, s.case_type, s.industry,
           s.overall, s.skill_scores, s.improvement_area,
           case when p.share_details then public._clip_strings(s.feedback, 2000) end,
           case when p.share_details then public._clip_strings(s.notes, 2000) end,
           case when p.share_details then left(s.other_notes, 2000) end
    from public.shared_cases s
    where s.case_id = c.id
    on conflict (case_id) do update set
      owner_id         = excluded.owner_id,
      case_date        = excluded.case_date,
      title            = excluded.title,
      source           = excluded.source,
      partner          = excluded.partner,
      case_type        = excluded.case_type,
      industry         = excluded.industry,
      overall          = excluded.overall,
      skill_scores     = excluded.skill_scores,
      improvement_area = excluded.improvement_area,
      feedback         = excluded.feedback,
      notes            = excluded.notes,
      other_notes      = excluded.other_notes
    where (public.public_shared_cases.owner_id, public.public_shared_cases.case_date, public.public_shared_cases.title,
           public.public_shared_cases.source, public.public_shared_cases.partner, public.public_shared_cases.case_type,
           public.public_shared_cases.industry, public.public_shared_cases.overall,
           public.public_shared_cases.skill_scores, public.public_shared_cases.improvement_area,
           public.public_shared_cases.feedback, public.public_shared_cases.notes, public.public_shared_cases.other_notes)
          is distinct from
          (excluded.owner_id, excluded.case_date, excluded.title, excluded.source, excluded.partner,
           excluded.case_type, excluded.industry, excluded.overall, excluded.skill_scores, excluded.improvement_area,
           excluded.feedback, excluded.notes, excluded.other_notes);
  else
    delete from public.public_shared_cases where case_id = c.id;
  end if;
end;
$$;

revoke all on function public.refresh_shared_case(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 4. Re-project every row under the new rule. The constraint dropped above made the state that changes
--    unrepresentable, so this rewrites nothing; it runs so that the data can never disagree with the rule.
-- ---------------------------------------------------------------------------------------
select public.refresh_all_shared();
