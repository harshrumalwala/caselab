-- CaseLab: let a member choose to show WHO CASED THEM (the practice partner or interviewer) on their shared cases.
--
-- DESIGN
--
--   * One new profile-wide switch, `share_partner`, OFF by default. Nobody's existing partner names become visible
--     by this migration: until a member turns the switch on, every `partner` column below stays empty.
--
--   * The partner is a third person who has not agreed to be listed, so this is its own switch rather than part
--     of "case history". When it is on, the partner name appears on every case of that member that is shared at
--     all (a case set to 'private', or any case of an unlisted member, still shows nothing), to signed-in members
--     and to visitors who can see the member. Written feedback and notes stay members-only, as before.
--
--   * The name is cut to 100 characters when projected, and the form limits it to the same length for new input.
--
--   * Where the case came from (`source`) was already shared with case history; nothing changes there.
--
-- Additive: adds one column to each of three tables, a length check, replaces two functions, and re-projects rows.

alter table public.profiles
  add column share_partner boolean not null default false;  -- who cased you, on each shared case

alter table public.cases
  add constraint cases_partner_length check (partner is null or char_length(partner) <= 100) not valid;

alter table public.shared_cases        add column partner text;
alter table public.public_shared_cases add column partner text;
alter table public.public_profiles     add column share_partner boolean not null default false;

-- Members (and visitors) may read the new columns; nothing else about their grants changes.
-- (profiles and public_profiles already grant whole-table select/insert/update as needed.)
grant select (partner) on public.shared_cases to authenticated;
grant select (partner) on public.public_shared_cases to anon;

-- ---------------------------------------------------------------------------------------
-- Projection logic: a public profile row also records whether the partner is shared
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
    (user_id, display_name, mba_class, share_cases, share_overall, share_skills, share_improvement, share_partner)
  values
    (p.user_id, p.display_name, p.mba_class, p.share_cases, p.share_overall, p.share_skills, p.share_improvement,
     p.share_partner)
  on conflict (user_id) do update set
    display_name      = excluded.display_name,
    mba_class         = excluded.mba_class,
    share_cases       = excluded.share_cases,
    share_overall     = excluded.share_overall,
    share_skills      = excluded.share_skills,
    share_improvement = excluded.share_improvement,
    share_partner     = excluded.share_partner;
end;
$$;

-- Recompute the shared row for one case (and the public copy). (Replaces the earlier version: adds `partner`.)
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
     overall, skill_scores, feedback, improvement_area, notes)
  values (
    c.id, c.user_id, c.case_date, left(c.title, 200), left(c.source, 200),
    case when p.share_partner then nullif(btrim(left(c.partner, 100)), '') end,
    c.case_type, left(c.industry, 100),
    case when v_full or (v_prof and p.share_overall)     then c.overall end,
    case when v_full or (v_prof and p.share_skills)      then public._skill_scores(c.skills) end,
    case when v_full or (v_prof and p.share_feedback)    then public._feedback(c.overall_feedback, c.skills) end,
    case when v_full or (v_prof and p.share_improvement) then c.improvement_area end,
    case when v_full or (v_prof and p.share_notes) then
      nullif(jsonb_strip_nulls(jsonb_build_object(
        'went_well',  nullif(btrim(coalesce(c.went_well, '')), ''),
        'struggled',  nullif(btrim(coalesce(c.struggled, '')), ''),
        'concepts',   nullif(btrim(coalesce(c.concepts, '')), ''),
        'next_focus', nullif(btrim(coalesce(c.next_focus, '')), '')
      )), '{}'::jsonb)
    end
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
    notes            = excluded.notes
  -- Only rewrite the row when something members can see actually changed.
  where (public.shared_cases.owner_id, public.shared_cases.case_date, public.shared_cases.title,
         public.shared_cases.source, public.shared_cases.partner, public.shared_cases.case_type,
         public.shared_cases.industry, public.shared_cases.overall, public.shared_cases.skill_scores,
         public.shared_cases.feedback, public.shared_cases.improvement_area, public.shared_cases.notes)
        is distinct from
        (excluded.owner_id, excluded.case_date, excluded.title, excluded.source, excluded.partner,
         excluded.case_type, excluded.industry, excluded.overall, excluded.skill_scores, excluded.feedback,
         excluded.improvement_area, excluded.notes);

  -- The public copy: only for public members, copied from the row above, with no written feedback or notes.
  v_public := p.listed and p.public_profile
              and public.is_member_id(c.user_id)
              and exists (select 1 from public.public_profiles pp where pp.user_id = c.user_id);
  if v_public then
    insert into public.public_shared_cases
      (case_id, share_id, owner_id, case_date, title, source, partner, case_type, industry, overall, skill_scores,
       improvement_area)
    select s.case_id, s.share_id, s.owner_id, s.case_date, s.title, s.source, s.partner, s.case_type, s.industry,
           s.overall, s.skill_scores, s.improvement_area
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
      improvement_area = excluded.improvement_area
    where (public.public_shared_cases.owner_id, public.public_shared_cases.case_date, public.public_shared_cases.title,
           public.public_shared_cases.source, public.public_shared_cases.partner, public.public_shared_cases.case_type,
           public.public_shared_cases.industry, public.public_shared_cases.overall,
           public.public_shared_cases.skill_scores, public.public_shared_cases.improvement_area)
          is distinct from
          (excluded.owner_id, excluded.case_date, excluded.title, excluded.source, excluded.partner,
           excluded.case_type, excluded.industry, excluded.overall, excluded.skill_scores, excluded.improvement_area);
  else
    delete from public.public_shared_cases where case_id = c.id;
  end if;
end;
$$;

-- `create or replace` keeps the earlier revokes, but state them again so this file is self-evidently safe.
revoke all on function public.sync_public_profile(uuid) from public, anon, authenticated;
revoke all on function public.refresh_shared_case(uuid) from public, anon, authenticated;

-- Applies the new projection to existing rows. The switch is off for everyone, so no partner name becomes visible.
select public.refresh_all_shared();
