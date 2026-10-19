-- CaseLab community: profiles, member directory and user-controlled sharing.
--
-- DESIGN (read this first)
--
--   * `cases` stays exactly as private as before: only its owner can read or change a row.
--     No other member is ever granted access to it, so a direct API request for someone else's
--     case returns nothing, whatever that person's sharing settings are.
--
--   * Other members read `shared_cases` instead. It is a separate table that holds ONLY the
--     fields an owner has chosen to share, copied in by triggers the moment a case or a sharing
--     setting changes. Private values are not hidden in a view or by the UI: they are not in
--     that table at all, so there is nothing to leak through a query, filter, sort or count.
--
--   * Nothing is shared by default. A row appears in `shared_cases` only after the owner has
--     created a profile and opted in (profile-wide, or for one case). Existing cases stay private:
--     no profile exists yet, so nothing is projected by this migration.
--
--   * Email addresses are never copied anywhere outside auth.users.
--
-- This migration only adds objects (one column with a default, three tables, functions, triggers,
-- policies). It contains no destructive statements.

-- ---------------------------------------------------------------------------------------
-- Membership gate
-- ---------------------------------------------------------------------------------------
-- Every community policy asks this one question. Today a member is any signed-in user whose email
-- is verified. To restrict registration later (for example to Booth addresses), change only this
-- function, e.g.:
--     ... and u.email like '%@chicagobooth.edu'
-- or consult an allow-list table. No other policy, table or app code needs to change.
create function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
  );
$$;

-- ---------------------------------------------------------------------------------------
-- Per-case sharing override (default: follow the owner's profile settings)
-- ---------------------------------------------------------------------------------------
--   profile  follow the profile-wide switches            (default; existing rows stay private)
--   private  never visible to anyone else
--   history  case name/source/industry/type/date only; no scores, feedback or notes
--   full     history + scores + feedback + improvement tag + learning notes for this case
alter table public.cases
  add column share_mode text not null default 'profile'
  check (share_mode in ('profile', 'private', 'history', 'full'));

-- ---------------------------------------------------------------------------------------
-- profiles: who a member is and what they share. No email, ever.
-- ---------------------------------------------------------------------------------------
create table public.profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  display_name      text not null check (length(btrim(display_name)) between 1 and 80),
  mba_class         text check (mba_class is null or length(btrim(mba_class)) between 1 and 40),

  -- Appear in People search. When false, nothing about this member is visible to others.
  listed            boolean not null default true,

  -- Profile-wide sharing switches. All off until the member opts in.
  share_cases       boolean not null default false,  -- case name, source, industry, type, date
  share_overall     boolean not null default false,  -- overall score of each shared case
  share_skills      boolean not null default false,  -- per-skill scores of each shared case
  share_feedback    boolean not null default false,  -- written feedback received
  share_improvement boolean not null default false,  -- improvement-focus tag of each shared case
  share_notes       boolean not null default false,  -- went well / struggled / concepts / next focus

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is 'Member profile and sharing preferences. Visible to verified members when listed. Never holds an email.';

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------------------
-- shared_cases: the ONLY thing other members can read about someone's cases
-- ---------------------------------------------------------------------------------------
-- A row exists only if the case is shared. The score/feedback/notes columns are null unless the
-- owner shares them for that case. Maintained exclusively by the triggers below.
create table public.shared_cases (
  -- case_id links back to the private case for the triggers and the cascade; members are never
  -- granted access to this column, so they cannot learn (or probe) the private table's ids.
  case_id          uuid primary key references public.cases (id) on delete cascade,
  -- share_id is the random public handle members see for a shared case.
  share_id         uuid not null unique default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (user_id) on delete cascade,

  -- case history
  case_date        date not null,
  title            text not null,
  source           text,
  case_type        text not null,
  industry         text,

  -- optional, null unless shared
  overall          smallint,
  skill_scores     jsonb,   -- { "framework": 4, ... } ratings only
  feedback         jsonb,   -- { "overall": "...", "skills": { "framework": "..." } }
  improvement_area text,
  notes            jsonb    -- { "went_well": "...", "struggled": "...", "concepts": "...", "next_focus": "..." }
  -- Deliberately no timestamps: they would reveal when private fields were edited.
);

comment on table public.shared_cases is 'Owner-approved projection of cases for other members. Written only by triggers; never contains private fields.';

create index shared_cases_owner_idx on public.shared_cases (owner_id, case_date desc);

-- ---------------------------------------------------------------------------------------
-- Projection logic (internal; not callable through the API)
-- ---------------------------------------------------------------------------------------
create function public._skill_scores(p_skills jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_object_agg(t.k, t.v -> 'rating') filter (where jsonb_typeof(t.v -> 'rating') = 'number')
  from jsonb_each(p_skills) as t(k, v);
$$;

create function public._feedback(p_overall text, p_skills jsonb)
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
      )
    )),
    '{}'::jsonb
  );
$$;

-- Recompute the shared row for one case from its owner's current profile and the case's own override.
create function public.refresh_shared_case(p_case_id uuid)
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
begin
  select * into c from public.cases where id = p_case_id;
  if not found then
    delete from public.shared_cases where case_id = p_case_id;
    return;
  end if;

  -- Lock the profile row while we read it. A concurrent profile change (unlisting, a switch) and a case
  -- change then run one after the other, each seeing the other's committed result, so a stale shared
  -- row can't be left behind by a race.
  select * into p from public.profiles where user_id = c.user_id for share;
  v_has_profile := found;
  v_full := c.share_mode = 'full';
  v_prof := c.share_mode = 'profile';

  -- Visible at all? Needs a listed profile, and either a per-case opt-in or the profile-wide switch.
  if not v_has_profile
     or not p.listed
     or c.share_mode = 'private'
     or not (c.share_mode in ('history', 'full') or (v_prof and p.share_cases)) then
    delete from public.shared_cases where case_id = c.id;
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
end;
$$;

create function public.refresh_shared_for_owner(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select id from public.cases where user_id = p_user loop
    perform public.refresh_shared_case(r.id);
  end loop;
end;
$$;

create function public.trg_cases_refresh_shared()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_shared_case(new.id);
  return null;
end;
$$;

create function public.trg_profiles_refresh_shared()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_shared_for_owner(new.user_id);
  return null;
end;
$$;

-- Changing a case or a sharing preference updates what others can see in the same transaction.
-- (Deleting a case removes its shared row through the foreign key's ON DELETE CASCADE.)
create trigger cases_refresh_shared
  after insert or update on public.cases
  for each row execute function public.trg_cases_refresh_shared();

create trigger profiles_refresh_shared
  after insert or update on public.profiles
  for each row execute function public.trg_profiles_refresh_shared();

-- ---------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.shared_cases enable row level security;

-- profiles: verified members can see listed profiles (and you always see your own).
create policy "profiles: members read listed, owner reads own" on public.profiles
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or ((select public.is_member()) and listed)
  );
create policy "profiles: member creates own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_member()));
create policy "profiles: owner updates own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- shared_cases: read-only for verified members. No insert/update/delete policy or privilege exists,
-- so the only writer is the trigger code above.
-- The owner must also still be listed: even if a stale row were ever left behind, it could not be served.
create policy "shared_cases: members read" on public.shared_cases
  for select to authenticated
  using (
    (select public.is_member())
    and exists (
      select 1 from public.profiles p
      where p.user_id = shared_cases.owner_id and p.listed
    )
  );

-- ---------------------------------------------------------------------------------------
-- Privileges: least privilege, and nothing for the anonymous role
-- ---------------------------------------------------------------------------------------
-- Supabase grants every new table to the API roles by default (all privileges, including TRUNCATE),
-- leaving row level security as the only barrier. Take everything back first, then grant only what
-- the app needs, so a missing policy can never be the only thing standing between members and a write.
revoke all on public.profiles from anon, authenticated;
revoke all on public.shared_cases from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;   -- no delete: profile goes with the account
-- Read-only, and only these columns: not case_id (the private table's id).
grant select (share_id, owner_id, case_date, title, source, case_type, industry,
              overall, skill_scores, feedback, improvement_area, notes)
  on public.shared_cases to authenticated;

-- Same tightening for the personal tables created earlier (privileges only; no data or policy changes).
revoke all on public.cases from authenticated;
revoke all on public.opportunities from authenticated;
grant select, insert, update, delete on public.cases to authenticated;
grant select, insert, update, delete on public.opportunities to authenticated;

-- Internal functions must not be callable through the API (they run with elevated rights).
revoke all on function public._skill_scores(jsonb) from public, anon, authenticated;
revoke all on function public._feedback(text, jsonb) from public, anon, authenticated;
revoke all on function public.refresh_shared_case(uuid) from public, anon, authenticated;
revoke all on function public.refresh_shared_for_owner(uuid) from public, anon, authenticated;
revoke all on function public.trg_cases_refresh_shared() from public, anon, authenticated;
revoke all on function public.trg_profiles_refresh_shared() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- is_member() is used inside policies, so signed-in users need to be able to run it.
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
