-- CaseLab public directory: let members choose to be visible to people WITHOUT an account.
--
-- DESIGN
--
--   * Opt-in, per member, off by default. `profiles.public_profile` decides it. Everyone who is already a member
--     stays members-only; nothing becomes public by this migration.
--
--   * Visitors (the database's `anon` role) read two SEPARATE tables that contain only public data:
--       public_profiles       name, class, and which parts the member shares
--       public_shared_cases   the shared cases of public members, without any free text
--     They are filled by triggers, like `shared_cases`. `anon` has NO privilege at all on `profiles`,
--     `shared_cases`, `cases` or `opportunities`, so there is nothing for a visitor to filter, count, sort or
--     estimate from: not even the planner's statistics describe data that isn't public.
--
--   * Free text is members-only, always: written feedback and learning notes are not copied into the public
--     tables. The private case id (`case_id`) is not readable by visitors either.
--
--   * The same sharing switches and per-case overrides decide which rows and values exist; this migration only
--     adds a second, narrower audience. Setting a case to 'private' hides it from everyone.
--
--   * Membership: the rule for who is a member now lives in one function, `is_member_id(uuid)`. Anyone who is
--     not a member can no longer re-list themselves or turn on public visibility. After tightening the rule
--     (for example to Booth addresses only), run `select public.revoke_nonmembers();` once as the database
--     owner (SQL editor): it unlists everyone who no longer qualifies and removes their shared data.
--
--   * Abuse limits: case title, source and industry get length limits, and the projected skill scores are limited
--     to the eight known skills with ratings of 1 to 5.
--
-- Do not add these tables to a Realtime publication: Realtime does not apply column privileges.
--
-- Additive and idempotent in effect: it adds a column, a constraint, two tables, functions, triggers and
-- policies, replaces a few functions, and re-projects existing rows (nothing is public yet).

-- ---------------------------------------------------------------------------------------
-- Membership rule in one place
-- ---------------------------------------------------------------------------------------
-- To restrict membership later, change ONLY this function (and then run revoke_nonmembers()).
create function public.is_member_id(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_user
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_member_id((select auth.uid()));
$$;

revoke all on function public.is_member_id(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- The setting
-- ---------------------------------------------------------------------------------------
alter table public.profiles
  add column public_profile boolean not null default false;

-- Being public means being listed.
alter table public.profiles
  add constraint profiles_public_requires_listed check (not public_profile or listed);

comment on column public.profiles.public_profile is
  'Also visible to people without an account (see public_profiles / public_shared_cases). Never includes free text.';

-- A member who no longer qualifies can still switch themselves OFF, but can not list themselves or go public.
alter policy "profiles: owner updates own" on public.profiles
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and ((select public.is_member()) or (not listed and not public_profile))
  );

-- ---------------------------------------------------------------------------------------
-- Length limits on what can be shown to others (checked for new and edited rows)
-- ---------------------------------------------------------------------------------------
alter table public.cases
  add constraint cases_title_length    check (char_length(title) <= 200) not valid,
  add constraint cases_source_length   check (source is null or char_length(source) <= 200) not valid,
  add constraint cases_industry_length check (industry is null or char_length(industry) <= 100) not valid;

-- Only the eight known skills, only ratings of 1 to 5. (Replaces the earlier, looser versions.)
create or replace function public._skill_scores(p_skills jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_object_agg(t.k, t.v -> 'rating')
  from jsonb_each(p_skills) as t(k, v)
  where t.k = any (array['behavioral1', 'behavioral2', 'prompt', 'framework', 'quant', 'exhibits', 'brainstorm', 'recommendation'])
    and jsonb_typeof(t.v -> 'rating') = 'number'
    and case when jsonb_typeof(t.v -> 'rating') = 'number' then (t.v ->> 'rating')::numeric between 1 and 5 end;
$$;

create or replace function public._feedback(p_overall text, p_skills jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select nullif(
    jsonb_strip_nulls(jsonb_build_object(
      'overall', nullif(btrim(coalesce(p_overall, '')), ''),
      'skills', (
        select jsonb_object_agg(t.k, btrim(t.v ->> 'feedback'))
               filter (where btrim(coalesce(t.v ->> 'feedback', '')) <> '')
        from jsonb_each(p_skills) as t(k, v)
        where t.k = any (array['behavioral1', 'behavioral2', 'prompt', 'framework', 'quant', 'exhibits', 'brainstorm', 'recommendation'])
      )
    )),
    '{}'::jsonb
  );
$$;

-- ---------------------------------------------------------------------------------------
-- Public tables: only public members, only public fields
-- ---------------------------------------------------------------------------------------
create table public.public_profiles (
  user_id           uuid primary key references public.profiles (user_id) on delete cascade,
  display_name      text not null,
  mba_class         text,
  -- Which parts they share (free text is never public, so there are no feedback/notes flags).
  share_cases       boolean not null,
  share_overall     boolean not null,
  share_skills      boolean not null,
  share_improvement boolean not null
);

comment on table public.public_profiles is 'Members who chose to be visible without an account. Written only by triggers.';

create table public.public_shared_cases (
  -- case_id ties the row to its source for the cascade; visitors are never granted this column.
  case_id          uuid primary key references public.shared_cases (case_id) on delete cascade,
  share_id         uuid not null unique,
  owner_id         uuid not null references public.public_profiles (user_id) on delete cascade,
  case_date        date not null,
  title            text not null,
  source           text,
  case_type        text not null,
  industry         text,
  overall          smallint,
  skill_scores     jsonb,
  improvement_area text
);

comment on table public.public_shared_cases is 'Shared cases of public members, without free text. Written only by triggers.';

create index public_shared_cases_owner_idx on public.public_shared_cases (owner_id, case_date desc);

alter table public.public_profiles enable row level security;
alter table public.public_shared_cases enable row level security;

-- Everything in these tables is public by construction.
create policy "public_profiles: anyone reads" on public.public_profiles
  for select to anon using (true);
create policy "public_shared_cases: anyone reads" on public.public_shared_cases
  for select to anon using (true);

-- Read-only for visitors, and only these columns; nothing at all for signed-in members (they use the member tables).
revoke all on public.public_profiles from anon, authenticated;
revoke all on public.public_shared_cases from anon, authenticated;
grant select on public.public_profiles to anon;
grant select (share_id, owner_id, case_date, title, source, case_type, industry, overall, skill_scores, improvement_area)
  on public.public_shared_cases to anon;

-- ---------------------------------------------------------------------------------------
-- Projection logic (internal; not callable through the API)
-- ---------------------------------------------------------------------------------------
-- Keep a member's public profile row in step with their profile. Removing it also removes all their public
-- cases (foreign key cascade), so switching off, unlisting, or losing membership takes effect at once.
create function public.sync_public_profile(p_user uuid)
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
    (user_id, display_name, mba_class, share_cases, share_overall, share_skills, share_improvement)
  values
    (p.user_id, p.display_name, p.mba_class, p.share_cases, p.share_overall, p.share_skills, p.share_improvement)
  on conflict (user_id) do update set
    display_name      = excluded.display_name,
    mba_class         = excluded.mba_class,
    share_cases       = excluded.share_cases,
    share_overall     = excluded.share_overall,
    share_skills      = excluded.share_skills,
    share_improvement = excluded.share_improvement;
end;
$$;

-- Recompute the shared row for one case from its owner's current profile and the case's own override, and
-- (for public members) its free-text-free public copy. (Replaces the earlier version.)
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
    (case_id, owner_id, case_date, title, source, case_type, industry,
     overall, skill_scores, feedback, improvement_area, notes)
  values (
    c.id, c.user_id, c.case_date, c.title, c.source, c.case_type, c.industry,
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
    case_type        = excluded.case_type,
    industry         = excluded.industry,
    overall          = excluded.overall,
    skill_scores     = excluded.skill_scores,
    feedback         = excluded.feedback,
    improvement_area = excluded.improvement_area,
    notes            = excluded.notes
  -- Only rewrite the row when something members can see actually changed.
  where (public.shared_cases.owner_id, public.shared_cases.case_date, public.shared_cases.title,
         public.shared_cases.source, public.shared_cases.case_type, public.shared_cases.industry,
         public.shared_cases.overall, public.shared_cases.skill_scores, public.shared_cases.feedback,
         public.shared_cases.improvement_area, public.shared_cases.notes)
        is distinct from
        (excluded.owner_id, excluded.case_date, excluded.title, excluded.source, excluded.case_type,
         excluded.industry, excluded.overall, excluded.skill_scores, excluded.feedback,
         excluded.improvement_area, excluded.notes);

  -- The public copy: only for public members, copied from the row above, with no free text.
  v_public := p.listed and p.public_profile
              and exists (select 1 from public.public_profiles pp where pp.user_id = c.user_id);
  if v_public then
    insert into public.public_shared_cases
      (case_id, share_id, owner_id, case_date, title, source, case_type, industry, overall, skill_scores, improvement_area)
    select s.case_id, s.share_id, s.owner_id, s.case_date, s.title, s.source, s.case_type, s.industry,
           s.overall, s.skill_scores, s.improvement_area
    from public.shared_cases s
    where s.case_id = c.id
    on conflict (case_id) do update set
      owner_id         = excluded.owner_id,
      case_date        = excluded.case_date,
      title            = excluded.title,
      source           = excluded.source,
      case_type        = excluded.case_type,
      industry         = excluded.industry,
      overall          = excluded.overall,
      skill_scores     = excluded.skill_scores,
      improvement_area = excluded.improvement_area
    where (public.public_shared_cases.owner_id, public.public_shared_cases.case_date, public.public_shared_cases.title,
           public.public_shared_cases.source, public.public_shared_cases.case_type, public.public_shared_cases.industry,
           public.public_shared_cases.overall, public.public_shared_cases.skill_scores,
           public.public_shared_cases.improvement_area)
          is distinct from
          (excluded.owner_id, excluded.case_date, excluded.title, excluded.source, excluded.case_type,
           excluded.industry, excluded.overall, excluded.skill_scores, excluded.improvement_area);
  else
    delete from public.public_shared_cases where case_id = c.id;
  end if;
end;
$$;

-- A profile change updates the public profile first, then every one of the owner's cases. (Replaces the earlier version.)
create or replace function public.trg_profiles_refresh_shared()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_public_profile(new.user_id);
  perform public.refresh_shared_for_owner(new.user_id);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Maintenance (database owner only; not callable through the API)
-- ---------------------------------------------------------------------------------------
-- Recompute everything from scratch, e.g. after changing the projection rules.
create function public.refresh_all_shared()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select user_id from public.profiles loop
    perform public.sync_public_profile(r.user_id);
    perform public.refresh_shared_for_owner(r.user_id);
  end loop;
end;
$$;

-- Run after tightening is_member_id(): unlists every profile whose owner no longer qualifies, which removes their
-- shared and public data through the triggers. Returns how many were unlisted.
create function public.revoke_nonmembers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.profiles
     set listed = false, public_profile = false
   where (listed or public_profile) and not public.is_member_id(user_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.sync_public_profile(uuid) from public, anon, authenticated;
revoke all on function public.refresh_all_shared() from public, anon, authenticated;
revoke all on function public.revoke_nonmembers() from public, anon, authenticated;

-- Existing members are not public, so this changes nothing visible; it applies the stricter projection rules.
select public.refresh_all_shared();
