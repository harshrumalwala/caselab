-- CaseLab: two more ways to choose who sees what.
--
-- 1. LINK ONLY. A member who is visible without an account can choose NOT to appear on the front page, in search or in
--    "Cased recently", while anyone who has their exact profile address (it contains their user id, which is a random
--    128-bit value nobody can guess) can still open it and see exactly what visitors see today.
--
-- 2. OPEN EVERYTHING. A new profile-wide switch, `share_details`, off by default. When on, every case the member shares
--    (a case that follows the profile settings, or is set to "full") shows ALL its detail to everyone who can see the
--    profile: scores, improvement focus, written feedback, learning notes and the "Other notes" field. Visitors only
--    get this when the profile is also visible without an account. The practice partner stays its own switch.
--    Until a member turns the switch on, nothing about text visibility changes.
--
-- HOW LINK ONLY IS ENFORCED (not just hidden in the page)
--   * public_profiles gets `in_directory`. The tables the front page lists and searches only ever return rows where it is
--     true (row level security), so a link-only member cannot be found, listed, counted or enumerated through the API.
--   * Two functions, public_person(id) and public_person_cases(id), return one member by exact id, directory or not.
--     Visitors have no other way to read a link-only member, and an exact random id is the only key.
--
-- Written feedback, learning notes and other notes are copied into the public tables ONLY for members whose
-- `share_details` is on, and long text is cut to 2000 characters there.
--
-- Additive: adds columns, a constraint, two functions, replaces functions and policies, and re-projects rows.

-- ---------------------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------------------
alter table public.profiles
  add column public_link_only boolean not null default false,   -- visible without an account, but only by link
  add column share_details    boolean not null default false;   -- open everything about each shared case

alter table public.profiles
  add constraint profiles_link_only_requires_public check (not public_link_only or public_profile);

comment on column public.profiles.public_link_only is
  'With public_profile: reachable by profile address only; not listed, searched or counted for visitors.';
comment on column public.profiles.share_details is
  'Show all detail (scores, feedback, learning notes, other notes) on every shared case to everyone who can see the profile.';

-- ---------------------------------------------------------------------------------------
-- Columns the projections need
-- ---------------------------------------------------------------------------------------
alter table public.shared_cases        add column other_notes text;
alter table public.public_shared_cases add column feedback jsonb, add column notes jsonb, add column other_notes text;
alter table public.public_profiles
  add column in_directory   boolean not null default true,
  add column share_details  boolean not null default false;

grant select (other_notes) on public.shared_cases to authenticated;
grant select (feedback, notes, other_notes) on public.public_shared_cases to anon;

-- Cuts every string inside a JSON value to at most n characters (public copies of free text).
create function public._clip_strings(j jsonb, n integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  r jsonb;
  k text;
  v jsonb;
begin
  if j is null then
    return null;
  end if;
  if jsonb_typeof(j) = 'string' then
    return to_jsonb(left(j #>> '{}', n));
  elsif jsonb_typeof(j) = 'object' then
    r := '{}'::jsonb;
    for k, v in select key, value from jsonb_each(j) loop
      r := r || jsonb_build_object(k, public._clip_strings(v, n));
    end loop;
    return r;
  end if;
  return j;
end;
$$;

revoke all on function public._clip_strings(jsonb, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Who can read the public tables: only members who are in the directory
-- ---------------------------------------------------------------------------------------
alter policy "public_profiles: anyone reads" on public.public_profiles
  using (in_directory);

-- A case is readable only if its owner's public profile is (the subquery is itself subject to the policy above).
alter policy "public_shared_cases: anyone reads" on public.public_shared_cases
  using (exists (select 1 from public.public_profiles p where p.user_id = owner_id));

-- ---------------------------------------------------------------------------------------
-- Reading ONE member by exact id (directory or link only). Returns nothing for anyone who isn't public.
-- ---------------------------------------------------------------------------------------
create function public.public_person(p_id uuid)
returns table (
  user_id uuid, display_name text, mba_class text,
  share_cases boolean, share_overall boolean, share_skills boolean, share_improvement boolean,
  share_partner boolean, share_details boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.display_name, p.mba_class,
         p.share_cases, p.share_overall, p.share_skills, p.share_improvement,
         p.share_partner, p.share_details
  from public.public_profiles p
  where p.user_id = p_id;
$$;

create function public.public_person_cases(p_id uuid)
returns table (
  share_id uuid, owner_id uuid, case_date date, title text, source text, partner text, case_type text,
  industry text, overall smallint, skill_scores jsonb, improvement_area text,
  feedback jsonb, notes jsonb, other_notes text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.share_id, c.owner_id, c.case_date, c.title, c.source, c.partner, c.case_type,
         c.industry, c.overall, c.skill_scores, c.improvement_area,
         c.feedback, c.notes, c.other_notes
  from public.public_shared_cases c
  where c.owner_id = p_id
  order by c.case_date desc, c.share_id
  limit 1000;
$$;

revoke all on function public.public_person(uuid) from public, anon, authenticated;
revoke all on function public.public_person_cases(uuid) from public, anon, authenticated;
grant execute on function public.public_person(uuid) to anon;
grant execute on function public.public_person_cases(uuid) to anon;

-- ---------------------------------------------------------------------------------------
-- Projection logic. (Replaces the earlier versions.)
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
     share_details, in_directory)
  values
    (p.user_id, p.display_name, p.mba_class, p.share_cases, p.share_overall, p.share_skills, p.share_improvement,
     p.share_partner, p.share_details, not p.public_link_only)
  on conflict (user_id) do update set
    display_name      = excluded.display_name,
    mba_class         = excluded.mba_class,
    share_cases       = excluded.share_cases,
    share_overall     = excluded.share_overall,
    share_skills      = excluded.share_skills,
    share_improvement = excluded.share_improvement,
    share_partner     = excluded.share_partner,
    share_details     = excluded.share_details,
    in_directory      = excluded.in_directory;
end;
$$;

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

  -- Visible at all? Needs a listed profile, and either a per-case opt-in or the profile-wide switch.
  if not v_has_profile
     or not p.listed
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
  v_public := p.listed and p.public_profile
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

-- A member who no longer qualifies is taken off every audience, including link only. (Replaces the earlier version.)
create or replace function public.revoke_nonmembers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.profiles
     set listed = false, public_profile = false, public_link_only = false
   where (listed or public_profile) and not public.is_member_id(user_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.sync_public_profile(uuid) from public, anon, authenticated;
revoke all on function public.refresh_shared_case(uuid) from public, anon, authenticated;
revoke all on function public.revoke_nonmembers() from public, anon, authenticated;

-- Applies the new projection to existing rows. Both new switches are off for everyone, so nothing becomes visible,
-- and every existing public member stays in the directory exactly as before.
select public.refresh_all_shared();
