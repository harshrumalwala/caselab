-- CaseLab: how a member likes to meet. One meeting link (a video room or a phone number) and one time zone, saved once,
-- so that scheduling a case with someone can later put the right address and the right local time on the invite.
--
-- DESIGN
--
--   * READABLE BY EXACTLY ONE PERSON: its owner. A personal Zoom room or a phone number is not a sharing switch away
--     from being public, it is a detail that must not leak at all. It is in no projection (`shared_cases`,
--     `public_profiles`, `public_shared_cases`), in no profile row, and in no function another member or a visitor may
--     call. When scheduling is built (a later issue), the one person scheduled with gets it through that flow and
--     through nothing else.
--
--   * A TABLE OF ITS OWN WITH NO DIRECT ACCESS, not columns on `profiles`. `profiles` is read whole by other members
--     and is copied into `public_profiles` by a trigger, so keeping a secret in it would mean getting a column grant and
--     a projection right, every time either changes. Here there is nothing to get right: the API roles hold no
--     privilege on the table at all, and the only ways in are the two functions below, which act on `auth.uid()`'s own
--     row and take no user id.
--
--   * THE SAME RULE AS THE SCREEN, ENFORCED AGAIN HERE. `is_meeting_link()` is the pair of patterns in
--     `src/domain/meeting.ts`: an `https://` address with a real host and no whitespace, or 7 to 15 digits with an
--     optional leading `+` and spaces or dashes between them. `javascript:`, `data:`, `http:`, a relative path and
--     plain text are all refused. The time zone must be a name Postgres itself knows (`pg_timezone_names`).
--     `src/data/meetingPrefs.db.test.ts` runs the same inputs through the function and through this file and fails if
--     the two ever disagree.
--
--   * ABUSE LIMIT. 20 saves in any 24 hours per member. The counter lives on the row and is not reset by clearing the
--     values, so emptying and refilling the fields cannot be used to hammer the database.
--
--   * Deleted with the account (on delete cascade), so `delete_my_account` already removes it.
--
-- Additive: one table, three functions, one trigger.

-- ---------------------------------------------------------------------------------------
-- meeting_prefs: closed to direct access. Reads and writes go through the functions below.
-- ---------------------------------------------------------------------------------------

-- An address we would hand to the person you are scheduled with, or a phone number. Immutable, so a check can use it.
create function public.is_meeting_link(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text is not null
     and char_length(p_text) between 1 and 300
     and (
       p_text ~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
       or (
         p_text ~ '^\+?[0-9]([0-9 -]*[0-9])?$'
         and char_length(regexp_replace(p_text, '[^0-9]', '', 'g')) between 7 and 15
       )
     );
$$;

comment on function public.is_meeting_link(text) is
  'True for an https:// meeting address or a plain phone number. The same rule as parseMeetingLink in src/domain/meeting.ts.';

create table public.meeting_prefs (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- Null means "not given". Both fields are optional, separately.
  meeting_link text check (meeting_link is null or public.is_meeting_link(meeting_link)),
  time_zone    text check (
                 time_zone is null
                 or (char_length(time_zone) <= 60
                     and time_zone ~ '^(UTC|[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)+)$')
               ),
  -- The 24-hour save window: when it started and how many saves are in it.
  saves        integer not null default 0 check (saves >= 0),
  saves_since  timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.meeting_prefs is
  'How each member likes to meet: a meeting link or phone number and a time zone. Readable by its owner alone. No direct access for API roles; use my_meeting_prefs() and save_my_meeting_prefs().';

alter table public.meeting_prefs enable row level security;
revoke all on public.meeting_prefs from anon, authenticated;

-- A time zone has to be one Postgres itself knows, which a check constraint cannot ask (the catalogue is not immutable).
create function public.meeting_prefs_zone_known()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.time_zone is not null and not exists (
    select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone
  ) then
    raise exception 'Pick a time zone from the list (for example America/Chicago).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger meeting_prefs_zone_known
  before insert or update on public.meeting_prefs
  for each row execute function public.meeting_prefs_zone_known();

-- ---------------------------------------------------------------------------------------
-- Functions (run as their owner, always on behalf of auth.uid(), never on anyone else's row)
-- ---------------------------------------------------------------------------------------

create function public.my_meeting_prefs()
returns table (meeting_link text, time_zone text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  return query
  select m.meeting_link, m.time_zone, m.updated_at
    from public.meeting_prefs m
   where m.user_id = v_user;
end;
$$;

-- Saves both fields together and hands back what was stored, so the screen only ever shows what the database confirmed.
create function public.save_my_meeting_prefs(p_link text, p_zone text)
returns table (meeting_link text, time_zone text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_link  text := public._clean(p_link);
  v_zone  text := public._clean(p_zone);
  v_saves integer;
  v_since timestamptz;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not public.is_member_id(v_user) then
    raise exception 'Verify your email before saving how you like to meet.' using errcode = '42501';
  end if;
  if v_link is not null and not public.is_meeting_link(v_link) then
    raise exception 'Paste a link starting with https://, or a phone number.' using errcode = 'P0001';
  end if;
  if v_zone is not null and (char_length(v_zone) > 60 or v_zone !~ '^(UTC|[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)+)$') then
    raise exception 'Pick a time zone from the list (for example America/Chicago).' using errcode = 'P0001';
  end if;

  select m.saves, m.saves_since into v_saves, v_since
    from public.meeting_prefs m where m.user_id = v_user;
  if v_since is null or v_since < now() - interval '24 hours' then
    v_saves := 0;
    v_since := now();
  elsif v_saves >= 20 then
    raise exception 'That is a lot of changes for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.meeting_prefs as m (user_id, meeting_link, time_zone, saves, saves_since, updated_at)
  values (v_user, v_link, v_zone, v_saves + 1, v_since, now())
  on conflict (user_id) do update
     set meeting_link = excluded.meeting_link,
         time_zone    = excluded.time_zone,
         saves        = excluded.saves,
         saves_since  = excluded.saves_since,
         updated_at   = excluded.updated_at;

  return query
  select m.meeting_link, m.time_zone, m.updated_at
    from public.meeting_prefs m
   where m.user_id = v_user;
end;
$$;

-- Signed-in members only; the pattern check and the trigger helper are internal.
revoke all on function public.is_meeting_link(text) from public, anon, authenticated;
revoke all on function public.meeting_prefs_zone_known() from public, anon, authenticated;
revoke all on function public.my_meeting_prefs() from public, anon, authenticated;
revoke all on function public.save_my_meeting_prefs(text, text) from public, anon, authenticated;
grant execute on function public.my_meeting_prefs() to authenticated;
grant execute on function public.save_my_meeting_prefs(text, text) to authenticated;
