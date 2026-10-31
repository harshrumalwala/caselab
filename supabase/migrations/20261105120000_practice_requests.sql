-- CaseLab: practice requests. A member can ask another member to case ("Case with me?"), optionally proposing a case and a
-- time, and the other member accepts or declines with a short reply (for example a video link, or how to reach them).
--
-- DESIGN
--
--   * OPT-IN. A member only receives requests after switching on `profiles.open_to_requests` ("Let members ask me to
--     case"). It is off by default, like every sharing switch, and it only matters to listed, verified members.
--
--   * SHORT AND STRUCTURED. A request is a proposed case title and casebook, a free-text "when", and a note, each with a
--     hard length limit (the note and the reply are 280 characters). It is a nudge, not a conversation: the reply is the
--     only answer. (A later step can turn an accepted request into a thread.)
--
--   * PRIVATE TO THE TWO PEOPLE. Nobody else can read a request: not other members, not visitors. The table has NO
--     direct access for the API roles at all. Everything goes through the functions below, which act only on the
--     signed-in member's own requests, so there is no policy to get wrong and no way to list someone else's.
--
--   * NO EMAILS. Nothing here stores or returns an email address. The other person's name is looked up when you read your
--     requests, so it is always their current display name.
--
--   * ABUSE LIMITS. At most 5 requests waiting at a time, 20 sent in any 24 hours, and one waiting request per person.
--     Declining can also block that member ("don't let them ask again"): their next request is refused with the same
--     message as any other refusal, so they can't tell they were blocked. Blocks are listed and can be undone.
--
--   * Deleted with the accounts involved (on delete cascade).
--
-- Additive: one column, two tables, functions.

alter table public.profiles
  add column open_to_requests boolean not null default false;

comment on column public.profiles.open_to_requests is
  'When true, verified members can send this member a practice request. Off by default.';

-- ---------------------------------------------------------------------------------------
-- practice_requests: closed to direct access. Reads and writes go through the functions below.
-- ---------------------------------------------------------------------------------------
create table public.practice_requests (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references auth.users (id) on delete cascade,
  to_user      uuid not null references auth.users (id) on delete cascade,
  case_title   text check (case_title is null or char_length(case_title) between 1 and 200),
  case_book    text check (case_book is null or char_length(case_book) between 1 and 100),
  when_text    text check (when_text is null or char_length(when_text) between 1 and 80),
  message      text check (message is null or char_length(message) between 1 and 280),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  reply        text check (reply is null or char_length(reply) between 1 and 280),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  -- When the sender first saw the answer (drives the "new answer" badge); null until then.
  from_seen_at timestamptz,
  check (from_user <> to_user)
);

comment on table public.practice_requests is
  'Practice requests between two members. No direct access for API roles; use the practice request functions.';

create index practice_requests_from_idx on public.practice_requests (from_user, created_at desc);
create index practice_requests_to_idx on public.practice_requests (to_user, created_at desc);
-- One waiting request per pair, enforced even if two requests race.
create unique index practice_requests_one_pending_idx on public.practice_requests (from_user, to_user) where status = 'pending';

create table public.practice_blocks (
  blocker    uuid not null references auth.users (id) on delete cascade,
  blocked    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

comment on table public.practice_blocks is
  'Members a member does not want requests from. No direct access for API roles; use the practice request functions.';

alter table public.practice_requests enable row level security;
alter table public.practice_blocks enable row level security;

revoke all on public.practice_requests from anon, authenticated;
revoke all on public.practice_blocks from anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Functions (run as their owner, always on behalf of auth.uid())
-- ---------------------------------------------------------------------------------------

-- Text from the app: trimmed, and empty means "not given".
create function public._clean(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(coalesce(p_text, '')), '');
$$;

create function public.send_practice_request(
  p_to         uuid,
  p_case_title text,
  p_case_book  text,
  p_when       text,
  p_message    text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not public.is_member_id(v_user) then
    raise exception 'Only verified members can send requests.' using errcode = '42501';
  end if;
  -- You need a profile so they can see who is asking.
  if not exists (select 1 from public.profiles where user_id = v_user) then
    raise exception 'Set up your profile before sending requests.' using errcode = 'P0001';
  end if;

  -- One message for every reason it can't go through (unknown, unlisted, not taking requests, blocked you), so it reveals nothing.
  if p_to is null
     or p_to = v_user
     or not exists (
       select 1 from public.profiles p
       where p.user_id = p_to and p.listed and p.open_to_requests and public.is_member_id(p.user_id)
     )
     or exists (select 1 from public.practice_blocks b where b.blocker = p_to and b.blocked = v_user)
  then
    raise exception 'This member can''t be asked right now.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.practice_requests r where r.from_user = v_user and r.to_user = p_to and r.status = 'pending') then
    raise exception 'You already have a request waiting with this member.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.practice_requests r where r.from_user = v_user and r.status = 'pending') >= 5 then
    raise exception 'You have 5 requests waiting. Wait for answers or cancel one first.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.practice_requests r where r.from_user = v_user and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'That is a lot of requests for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.practice_requests (from_user, to_user, case_title, case_book, when_text, message)
  values (v_user, p_to, public._clean(p_case_title), public._clean(p_case_book), public._clean(p_when), public._clean(p_message))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.respond_practice_request(p_id uuid, p_accept boolean, p_reply text, p_block boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := (select auth.uid());
  v_sender uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  update public.practice_requests r
     set status = case when p_accept then 'accepted' else 'declined' end,
         reply = public._clean(p_reply),
         responded_at = now()
   where r.id = p_id and r.to_user = v_user and r.status = 'pending'
  returning r.from_user into v_sender;

  if not found then
    raise exception 'That request is no longer waiting.' using errcode = 'P0001';
  end if;

  if not p_accept and coalesce(p_block, false) then
    insert into public.practice_blocks (blocker, blocked) values (v_user, v_sender) on conflict do nothing;
  end if;
end;
$$;

create function public.cancel_practice_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  update public.practice_requests r
     set status = 'cancelled', responded_at = now()
   where r.id = p_id and r.from_user = v_user and r.status = 'pending';
  if not found then
    raise exception 'That request is no longer waiting.' using errcode = 'P0001';
  end if;
end;
$$;

-- Your requests, both ways, newest first, with the other member's current name.
create function public.my_practice_requests()
returns table (
  id           uuid,
  direction    text,
  other_id     uuid,
  other_name   text,
  case_title   text,
  case_book    text,
  when_text    text,
  message      text,
  status       text,
  reply        text,
  created_at   timestamptz,
  responded_at timestamptz,
  from_seen_at timestamptz
)
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
  select r.id,
         case when r.from_user = v_user then 'sent' else 'received' end,
         case when r.from_user = v_user then r.to_user else r.from_user end,
         p.display_name,
         r.case_title, r.case_book, r.when_text, r.message, r.status, r.reply,
         r.created_at, r.responded_at, r.from_seen_at
    from public.practice_requests r
    left join public.profiles p
      on p.user_id = case when r.from_user = v_user then r.to_user else r.from_user end
   where r.from_user = v_user or r.to_user = v_user
   order by r.created_at desc
   limit 100;
end;
$$;

-- The sender has now seen the answers that have come in.
create function public.mark_practice_answers_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  update public.practice_requests r
     set from_seen_at = now()
   where r.from_user = v_user and r.status in ('accepted', 'declined') and r.from_seen_at is null;
end;
$$;

create function public.my_practice_blocks()
returns table (user_id uuid, display_name text, created_at timestamptz)
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
  select b.blocked, p.display_name, b.created_at
    from public.practice_blocks b
    left join public.profiles p on p.user_id = b.blocked
   where b.blocker = v_user
   order by b.created_at desc;
end;
$$;

create function public.unblock_practice_asker(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  delete from public.practice_blocks b where b.blocker = v_user and b.blocked = p_user;
end;
$$;

-- Signed-in members only. The helper is internal.
revoke all on function public._clean(text) from public, anon, authenticated;
revoke all on function public.send_practice_request(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.respond_practice_request(uuid, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.cancel_practice_request(uuid) from public, anon, authenticated;
revoke all on function public.my_practice_requests() from public, anon, authenticated;
revoke all on function public.mark_practice_answers_seen() from public, anon, authenticated;
revoke all on function public.my_practice_blocks() from public, anon, authenticated;
revoke all on function public.unblock_practice_asker(uuid) from public, anon, authenticated;
grant execute on function public.send_practice_request(uuid, text, text, text, text) to authenticated;
grant execute on function public.respond_practice_request(uuid, boolean, text, boolean) to authenticated;
grant execute on function public.cancel_practice_request(uuid) to authenticated;
grant execute on function public.my_practice_requests() to authenticated;
grant execute on function public.mark_practice_answers_seen() to authenticated;
grant execute on function public.my_practice_blocks() to authenticated;
grant execute on function public.unblock_practice_asker(uuid) to authenticated;
