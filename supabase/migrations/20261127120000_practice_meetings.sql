-- CaseLab: scheduling a practice time. Two members who have agreed to case settle one time between them: one of them
-- proposes up to three times with a length, the other picks one, counters with three of their own, or declines, and
-- either of them can cancel or ask to move a time that is already standing.
--
-- DESIGN
--
--   * A RECORD OF ITS OWN, BETWEEN EXACTLY TWO PEOPLE. `practice_meetings` is created from a practice request or from
--     a conversation and keeps the same `id` for its whole life, so the invite email (a later issue) can update one
--     calendar event instead of sending a second. `revision` goes up every time a confirmed time is changed or
--     cancelled, and is the number that email supersedes on. A record is not hung off the request, because the request
--     gets answered and closed while the time keeps moving.
--
--   * THE PROPOSAL IS A ROW, NOT A COLUMN. `practice_meeting_proposals` holds the one to three candidate times
--     (UTC instants) and whose turn it is. That is what makes "change a confirmed time" safe: the old time stays
--     standing on the record while a new proposal is open beside it, so there is never a gap where neither person has
--     a time. The pair is copied onto the proposal so that "one open proposal per pair" is a unique index rather than
--     a count two callers could pass at the same moment.
--
--   * ONE CONFIRMED TIME, EVEN IN A RACE. Confirming answers the proposal with a conditional update
--     (`where answered_at is null`) and then writes `practice_meeting_confirmations`, whose primary key is the
--     proposal and which is unique per (record, revision). Two confirmations arriving together therefore end with
--     exactly one: the second is refused by the database itself, not by the order the two callers read in, and both
--     people are told the same sentence.
--
--   * THE ASKER HOSTS (the owner, 2026-11-17, DECISIONS.md). The member who sent the practice request these two came
--     from is the host, and the host's saved meeting link goes on the invite; the other person's is the fallback.
--     The link is released by `my_practice_meetings()` ONLY when the record is confirmed and only to the two people on
--     it. Before that, to anyone else, and while either has blocked the other, it is not returned at all.
--
--   * A PROPOSAL LAPSES BY ARITHMETIC. When every proposed time has passed there is nothing left to accept: the read
--     reports it as `lapsed` and the next write closes it. Nothing is swept and no job runs.
--
--   * THE SAME WALLS AS REQUESTS AND MESSAGES. The three tables have NO direct access for the API roles at all;
--     everything goes through the `security definer` functions below, which act only on the caller's own records. A
--     block in either direction (`_blocked_between`) refuses every one of them, in both directions, with one sentence
--     that gives nothing away. Verified members only. Deleting either account removes the record (on delete cascade).
--
--   * LIMITS, in the same shape as practice requests: one open proposal per pair, 5 open proposals at a time, 20
--     proposals in any 24 hours. A counter and a change each count as a proposal, so negotiating cannot be used to
--     get round them.
--
--   * TIME RULES. One to three distinct times, each at least 10 minutes from now and within 60 days; a length of 30,
--     45, 60 or 90 minutes; a time that has passed cannot be picked and a confirmed time in the past cannot be moved.
--
-- Do not add these tables to a Realtime publication: they have no policies.
--
-- Additive: three tables, four helpers, seven functions.

-- ---------------------------------------------------------------------------------------
-- Helpers used by the table checks (immutable, so a constraint may call them)
-- ---------------------------------------------------------------------------------------

-- One to three real, distinct instants.
create function public._meeting_slots_ok(p_slots timestamptz[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_slots is not null
     and array_ndims(p_slots) = 1
     and array_length(p_slots, 1) between 1 and 3
     and (select count(*) from unnest(p_slots) s where s is null) = 0
     and (select count(distinct s) from unnest(p_slots) s) = array_length(p_slots, 1);
$$;

comment on function public._meeting_slots_ok(timestamptz[]) is
  'True for one to three distinct, non-null candidate times. The same rule as checkSlots in src/domain/scheduling.ts.';

-- The last of the proposed times: once it has passed, the proposal has lapsed.
create function public._meeting_last_slot(p_slots timestamptz[])
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select max(s) from unnest(p_slots) s;
$$;

-- ---------------------------------------------------------------------------------------
-- Tables (closed to direct access)
-- ---------------------------------------------------------------------------------------
create table public.practice_meetings (
  id               uuid primary key default gen_random_uuid(),
  -- The pair, ordered, as conversations are.
  user_lo          uuid not null references auth.users (id) on delete cascade,
  user_hi          uuid not null references auth.users (id) on delete cascade,
  -- The asker: the member who sent the practice request these two came from. Their link goes on the invite.
  host             uuid not null references auth.users (id) on delete cascade,
  created_by       uuid not null references auth.users (id) on delete cascade,
  -- Where it started. Either may be null; the record outlives both.
  request_id       uuid references public.practice_requests (id) on delete set null,
  conversation_id  uuid references public.conversations (id) on delete set null,
  status           text not null default 'proposed' check (status in ('proposed', 'confirmed', 'declined', 'cancelled')),
  duration_minutes integer not null check (duration_minutes in (30, 45, 60, 90)),
  -- The confirmed start, kept after a cancellation so the invite can be called off by the right time.
  starts_at        timestamptz,
  -- 0 until the first confirmation, then one up for every change or cancellation of a confirmed time.
  revision         integer not null default 0 check (revision >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (user_lo < user_hi),
  check (host = user_lo or host = user_hi),
  check (created_by = user_lo or created_by = user_hi),
  -- Confirmed means there is a time; waiting or declined means there never was one.
  check (status <> 'confirmed' or starts_at is not null),
  check (status not in ('proposed', 'declined') or starts_at is null),
  check (starts_at is null or revision >= 1)
);

comment on table public.practice_meetings is
  'A practice time being settled between two members. No direct access for API roles; use the scheduling functions.';

create index practice_meetings_lo_idx on public.practice_meetings (user_lo, updated_at desc);
create index practice_meetings_hi_idx on public.practice_meetings (user_hi, updated_at desc);

create table public.practice_meeting_proposals (
  id               uuid primary key default gen_random_uuid(),
  meeting_id       uuid not null references public.practice_meetings (id) on delete cascade,
  -- The pair again, so one open proposal per pair is a unique index and not a count that two callers could pass together.
  user_lo          uuid not null references auth.users (id) on delete cascade,
  user_hi          uuid not null references auth.users (id) on delete cascade,
  proposed_by      uuid not null references auth.users (id) on delete cascade,
  slots            timestamptz[] not null check (public._meeting_slots_ok(slots)),
  last_slot_at     timestamptz not null generated always as (public._meeting_last_slot(slots)) stored,
  duration_minutes integer not null check (duration_minutes in (30, 45, 60, 90)),
  -- True when this asks to move a time that is already standing.
  is_change        boolean not null default false,
  created_at       timestamptz not null default now(),
  answered_at      timestamptz,
  outcome          text check (outcome in ('confirmed', 'declined', 'countered', 'cancelled', 'lapsed')),
  check ((answered_at is null) = (outcome is null)),
  check (user_lo < user_hi),
  check (proposed_by = user_lo or proposed_by = user_hi)
);

comment on table public.practice_meeting_proposals is
  'The times one member put to the other, and how they were answered. No direct access for API roles.';

-- One unanswered proposal per pair, enforced even if two proposals race.
create unique index practice_meeting_proposals_one_open_idx
  on public.practice_meeting_proposals (user_lo, user_hi) where answered_at is null;
create index practice_meeting_proposals_meeting_idx on public.practice_meeting_proposals (meeting_id, created_at desc);
create index practice_meeting_proposals_by_idx on public.practice_meeting_proposals (proposed_by, created_at desc);

create table public.practice_meeting_confirmations (
  -- A proposal can be confirmed exactly once, and a record can be confirmed once per revision: a second confirmation
  -- racing the first is refused here, whatever the two callers read a moment earlier.
  proposal_id      uuid primary key references public.practice_meeting_proposals (id) on delete cascade,
  meeting_id       uuid not null references public.practice_meetings (id) on delete cascade,
  revision         integer not null check (revision >= 1),
  starts_at        timestamptz not null,
  duration_minutes integer not null,
  confirmed_by     uuid not null references auth.users (id) on delete cascade,
  confirmed_at     timestamptz not null default now(),
  unique (meeting_id, revision)
);

comment on table public.practice_meeting_confirmations is
  'One row per settled time: the proposal that settled it and the revision it became. No direct access for API roles.';

alter table public.practice_meetings enable row level security;
alter table public.practice_meeting_proposals enable row level security;
alter table public.practice_meeting_confirmations enable row level security;

revoke all on public.practice_meetings from anon, authenticated;
revoke all on public.practice_meeting_proposals from anon, authenticated;
revoke all on public.practice_meeting_confirmations from anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Internal helpers (not callable by the API roles)
-- ---------------------------------------------------------------------------------------

-- The time rules, in one place, with the sentences the screens show.
create function public._check_meeting_times(p_slots timestamptz[], p_duration integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_duration is null or p_duration not in (30, 45, 60, 90) then
    raise exception 'Pick a length of 30, 45, 60 or 90 minutes.' using errcode = 'P0001';
  end if;
  if p_slots is null
     or coalesce(array_ndims(p_slots), 0) <> 1
     or coalesce(array_length(p_slots, 1), 0) not between 1 and 3
     or exists (select 1 from unnest(p_slots) s where s is null) then
    raise exception 'Propose one, two or three times.' using errcode = 'P0001';
  end if;
  if (select count(distinct s) from unnest(p_slots) s) <> array_length(p_slots, 1) then
    raise exception 'Those times are the same. Propose different ones.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_slots) s where s < now() + interval '10 minutes') then
    raise exception 'Propose times at least ten minutes from now.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_slots) s where s > now() + interval '60 days') then
    raise exception 'Propose times within the next 60 days.' using errcode = 'P0001';
  end if;
end;
$$;

-- A proposal whose times have all passed is dead by arithmetic. Reads report it; the next write closes it.
create function public._close_lapsed_proposals(p_lo uuid, p_hi uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.practice_meeting_proposals p
     set answered_at = now(), outcome = 'lapsed'
   where p.user_lo = p_lo and p.user_hi = p_hi and p.answered_at is null and p.last_slot_at <= now();
end;
$$;

-- The proposer's own limits: 5 open proposals at a time (a lapsed one does not count) and 20 in any 24 hours.
create function public._check_meeting_limits(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.practice_meeting_proposals p
       where p.proposed_by = p_user and p.answered_at is null and p.last_slot_at > now()) >= 5 then
    raise exception 'You have times waiting with 5 members. Wait for an answer or cancel one first.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.practice_meeting_proposals p
       where p.proposed_by = p_user and p.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'That is a lot of times proposed for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;
end;
$$;

-- The caller's own record, with the other person and whether scheduling is off between them. Raises if it is not theirs.
create function public._my_meeting(p_id uuid)
returns public.practice_meetings
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_meeting public.practice_meetings;
begin
  select m.* into v_meeting
    from public.practice_meetings m
   where m.id = p_id and (m.user_lo = v_user or m.user_hi = v_user);
  if not found then
    raise exception 'That time isn''t available.' using errcode = 'P0001';
  end if;
  -- One sentence for every reason it can't go through (blocked either way, or they are no longer a member).
  if not public.is_member_id(v_user)
     or not public.is_member_id(case when v_meeting.user_lo = v_user then v_meeting.user_hi else v_meeting.user_lo end)
     or public._blocked_between(v_meeting.user_lo, v_meeting.user_hi) then
    raise exception 'You can''t schedule with this member right now.' using errcode = 'P0001';
  end if;
  return v_meeting;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Proposing
-- ---------------------------------------------------------------------------------------

-- Starts a record with the first proposal and hands back its id, which never changes afterwards.
create function public.propose_practice_meeting(
  p_other        uuid,
  p_slots        timestamptz[],
  p_duration     integer,
  p_request      uuid default null,
  p_conversation uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_lo      uuid;
  v_hi      uuid;
  v_request uuid;
  v_conv    uuid;
  v_host    uuid;
  v_id      uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not public.is_member_id(v_user) then
    raise exception 'Verify your email before scheduling a case.' using errcode = '42501';
  end if;

  -- One sentence for every reason it can't go through (unknown, not a member, blocked either way), so it reveals nothing.
  if p_other is null
     or p_other = v_user
     or not public.is_member_id(p_other)
     or public._blocked_between(v_user, p_other) then
    raise exception 'You can''t schedule with this member right now.' using errcode = 'P0001';
  end if;

  v_lo := least(v_user, p_other);
  v_hi := greatest(v_user, p_other);

  -- Consent first, as with messages: there has to be a request between them, or a conversation they are both in.
  select r.id, r.from_user into v_request, v_host
    from public.practice_requests r
   where ((r.from_user = v_user and r.to_user = p_other) or (r.from_user = p_other and r.to_user = v_user))
     and r.status in ('accepted', 'pending')
     and (p_request is null or r.id = p_request)
   order by (r.status = 'accepted') desc, r.created_at
   limit 1;

  select c.id into v_conv
    from public.conversations c
   where c.user_lo = v_lo and c.user_hi = v_hi
     and (p_conversation is null or c.id = p_conversation);

  if v_request is null and v_conv is null then
    raise exception 'You can''t schedule with this member right now.' using errcode = 'P0001';
  end if;

  -- The asker hosts. If the request has gone (a conversation that outlived it), the member setting this up does.
  if v_host is null then
    select r.from_user into v_host
      from public.practice_requests r
     where (r.from_user = v_user and r.to_user = p_other) or (r.from_user = p_other and r.to_user = v_user)
     order by (r.status = 'accepted') desc, r.created_at
     limit 1;
  end if;
  v_host := coalesce(v_host, v_user);

  perform public._check_meeting_times(p_slots, p_duration);
  perform public._close_lapsed_proposals(v_lo, v_hi);
  if exists (select 1 from public.practice_meeting_proposals p
              where p.user_lo = v_lo and p.user_hi = v_hi and p.answered_at is null) then
    raise exception 'You already have times waiting with this member.' using errcode = 'P0001';
  end if;
  perform public._check_meeting_limits(v_user);

  insert into public.practice_meetings (user_lo, user_hi, host, created_by, request_id, conversation_id, duration_minutes)
  values (v_lo, v_hi, v_host, v_user, v_request, v_conv, p_duration)
  returning id into v_id;

  insert into public.practice_meeting_proposals (meeting_id, user_lo, user_hi, proposed_by, slots, duration_minutes)
  values (v_id, v_lo, v_hi, v_user, p_slots, p_duration);

  return v_id;
exception
  when unique_violation then
    raise exception 'You already have times waiting with this member.' using errcode = 'P0001';
end;
$$;

-- Asks to move a time that is already standing. The old time stays confirmed until the new one is picked.
create function public.change_practice_meeting(p_meeting uuid, p_slots timestamptz[], p_duration integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_meeting public.practice_meetings;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  v_meeting := public._my_meeting(p_meeting);

  if v_meeting.status <> 'confirmed' then
    raise exception 'There is no time to move yet.' using errcode = 'P0001';
  end if;
  if v_meeting.starts_at <= now() then
    raise exception 'That case has already happened.' using errcode = 'P0001';
  end if;

  perform public._check_meeting_times(p_slots, p_duration);
  perform public._close_lapsed_proposals(v_meeting.user_lo, v_meeting.user_hi);
  if exists (select 1 from public.practice_meeting_proposals p
              where p.user_lo = v_meeting.user_lo and p.user_hi = v_meeting.user_hi and p.answered_at is null) then
    raise exception 'You already have times waiting with this member.' using errcode = 'P0001';
  end if;
  perform public._check_meeting_limits(v_user);

  insert into public.practice_meeting_proposals (meeting_id, user_lo, user_hi, proposed_by, slots, duration_minutes, is_change)
  values (p_meeting, v_meeting.user_lo, v_meeting.user_hi, v_user, p_slots, p_duration, true);

  update public.practice_meetings m set updated_at = now() where m.id = p_meeting;
exception
  when unique_violation then
    raise exception 'You already have times waiting with this member.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Answering (the turn rule: you answer their proposal, never your own)
-- ---------------------------------------------------------------------------------------

-- The open proposal on this record that it is the caller's turn to answer.
create function public._open_proposal_for_me(p_meeting uuid, p_user uuid)
returns public.practice_meeting_proposals
language plpgsql
set search_path = ''
as $$
declare
  v_proposal public.practice_meeting_proposals;
begin
  select p.* into v_proposal
    from public.practice_meeting_proposals p
   where p.meeting_id = p_meeting and p.answered_at is null;
  if not found then
    raise exception 'There are no times waiting for your answer.' using errcode = 'P0001';
  end if;
  if v_proposal.proposed_by = p_user then
    raise exception 'You proposed those times. It''s their turn.' using errcode = 'P0001';
  end if;
  -- Lapsed by arithmetic. Nothing is written here (the raise would roll it back anyway); the next proposal closes it.
  if v_proposal.last_slot_at <= now() then
    raise exception 'Those times have all passed.' using errcode = 'P0001';
  end if;
  return v_proposal;
end;
$$;

-- Picks one of the times they proposed. Exactly one of two confirmations arriving together takes effect.
create function public.confirm_practice_meeting(p_meeting uuid, p_slot timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_meeting  public.practice_meetings;
  v_proposal public.practice_meeting_proposals;
  v_revision integer;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  v_meeting := public._my_meeting(p_meeting);
  if v_meeting.status in ('cancelled', 'declined') then
    raise exception 'That time isn''t available.' using errcode = 'P0001';
  end if;
  v_proposal := public._open_proposal_for_me(p_meeting, v_user);

  if p_slot is null or not (p_slot = any (v_proposal.slots)) then
    raise exception 'Pick one of the times they proposed.' using errcode = 'P0001';
  end if;
  if p_slot <= now() then
    raise exception 'That time has passed. Ask for another one.' using errcode = 'P0001';
  end if;

  -- Whoever gets here first answers the proposal; a second caller matches no row and is told so.
  update public.practice_meeting_proposals p
     set answered_at = now(), outcome = 'confirmed'
   where p.id = v_proposal.id and p.answered_at is null;
  if not found then
    raise exception 'That time has just been settled. Open it again to see it.' using errcode = 'P0001';
  end if;

  update public.practice_meetings m
     set status = 'confirmed',
         starts_at = p_slot,
         duration_minutes = v_proposal.duration_minutes,
         revision = m.revision + 1,
         updated_at = now()
   where m.id = p_meeting and m.revision = v_meeting.revision
  returning m.revision into v_revision;
  if not found then
    raise exception 'That time has just been settled. Open it again to see it.' using errcode = 'P0001';
  end if;

  -- The second belt, and the ledger the invite email reads: one row per proposal, one per revision of the record.
  insert into public.practice_meeting_confirmations (proposal_id, meeting_id, revision, starts_at, duration_minutes, confirmed_by)
  values (v_proposal.id, p_meeting, v_revision, p_slot, v_proposal.duration_minutes, v_user);
exception
  when unique_violation then
    raise exception 'That time has just been settled. Open it again to see it.' using errcode = 'P0001';
end;
$$;

-- Replaces their proposal with times of your own, which hands the turn back to them.
create function public.counter_practice_meeting(p_meeting uuid, p_slots timestamptz[], p_duration integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_meeting  public.practice_meetings;
  v_proposal public.practice_meeting_proposals;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  v_meeting := public._my_meeting(p_meeting);
  if v_meeting.status in ('cancelled', 'declined') then
    raise exception 'That time isn''t available.' using errcode = 'P0001';
  end if;
  v_proposal := public._open_proposal_for_me(p_meeting, v_user);
  perform public._check_meeting_times(p_slots, p_duration);
  perform public._check_meeting_limits(v_user);

  update public.practice_meeting_proposals p
     set answered_at = now(), outcome = 'countered'
   where p.id = v_proposal.id and p.answered_at is null;
  if not found then
    raise exception 'Those times have already been answered.' using errcode = 'P0001';
  end if;

  insert into public.practice_meeting_proposals (meeting_id, user_lo, user_hi, proposed_by, slots, duration_minutes, is_change)
  values (p_meeting, v_meeting.user_lo, v_meeting.user_hi, v_user, p_slots, p_duration, v_proposal.is_change);

  update public.practice_meetings m set duration_minutes = p_duration, updated_at = now() where m.id = p_meeting;
end;
$$;

-- Says no to their proposal. A first proposal ends the record; a proposed change leaves the standing time alone.
create function public.decline_practice_meeting(p_meeting uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_meeting  public.practice_meetings;
  v_proposal public.practice_meeting_proposals;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  v_meeting := public._my_meeting(p_meeting);
  if v_meeting.status in ('cancelled', 'declined') then
    raise exception 'That time isn''t available.' using errcode = 'P0001';
  end if;
  v_proposal := public._open_proposal_for_me(p_meeting, v_user);

  update public.practice_meeting_proposals p
     set answered_at = now(), outcome = 'declined'
   where p.id = v_proposal.id and p.answered_at is null;
  if not found then
    raise exception 'Those times have already been answered.' using errcode = 'P0001';
  end if;

  update public.practice_meetings m
     set status = case when m.status = 'confirmed' then 'confirmed' else 'declined' end,
         updated_at = now()
   where m.id = p_meeting;
end;
$$;

-- Calls the whole thing off, from either side, whether or not a time was settled.
create function public.cancel_practice_meeting(p_meeting uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := (select auth.uid());
  v_meeting    public.practice_meetings;
  v_was_timed  boolean;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  v_meeting := public._my_meeting(p_meeting);
  if v_meeting.status in ('cancelled', 'declined') then
    raise exception 'That time isn''t available.' using errcode = 'P0001';
  end if;
  if v_meeting.starts_at is not null and v_meeting.starts_at <= now() then
    raise exception 'That case has already happened.' using errcode = 'P0001';
  end if;
  v_was_timed := v_meeting.status = 'confirmed';

  update public.practice_meeting_proposals p
     set answered_at = now(), outcome = 'cancelled'
   where p.meeting_id = p_meeting and p.answered_at is null;

  -- Cancelling a settled time is a new revision, so the invite email can call that event off rather than send another.
  update public.practice_meetings m
     set status = 'cancelled',
         revision = case when v_was_timed then m.revision + 1 else m.revision end,
         updated_at = now()
   where m.id = p_meeting and m.status = v_meeting.status;
  if not found then
    raise exception 'That time isn''t available.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Reading: the caller's own records only
-- ---------------------------------------------------------------------------------------
create function public.my_practice_meetings()
returns table (
  id                 uuid,
  other_id           uuid,
  other_name         text,
  -- Their time zone, so the times can be shown in both. Only ever inside a record the two of them share.
  other_time_zone    text,
  host_id            uuid,
  i_host             boolean,
  state              text,
  starts_at          timestamptz,
  duration_minutes   integer,
  revision           integer,
  -- The host's saved link, or the other person's if the host saved none. Only once the time is confirmed.
  meeting_link       text,
  meeting_link_from  text,
  request_id         uuid,
  conversation_id    uuid,
  proposal_id        uuid,
  proposed_by        uuid,
  proposed_slots     timestamptz[],
  proposed_duration  integer,
  proposed_is_change boolean,
  proposed_at        timestamptz,
  my_turn            boolean,
  blocked            boolean,
  created_at         timestamptz,
  updated_at         timestamptz
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
  with mine as (
    select m.*,
           case when m.user_lo = v_user then m.user_hi else m.user_lo end as other,
           public._blocked_between(m.user_lo, m.user_hi) as is_blocked
      from public.practice_meetings m
     where m.user_lo = v_user or m.user_hi = v_user
  ),
  joined as (
    select mine.*,
           op.id          as open_id,
           op.proposed_by as open_by,
           op.slots       as open_slots,
           op.duration_minutes as open_duration,
           op.is_change   as open_is_change,
           op.created_at  as open_at,
           op.last_slot_at as open_last,
           case
             when mine.status = 'cancelled' then 'cancelled'
             when mine.status = 'declined' then 'declined'
             when mine.status = 'confirmed' then 'confirmed'
             when op.id is not null and op.last_slot_at > now() then 'proposed'
             else 'lapsed'
           end as derived_state
      from mine
      left join lateral (
        select p.* from public.practice_meeting_proposals p
         where p.meeting_id = mine.id and p.answered_at is null
         limit 1
      ) op on true
  )
  select j.id,
         j.other,
         prof.display_name,
         zone.time_zone,
         j.host,
         j.host = v_user,
         j.derived_state,
         j.starts_at,
         j.duration_minutes,
         j.revision,
         -- The link is released only on a confirmed record, only to these two people, and never while blocked.
         case when j.derived_state = 'confirmed' and not j.is_blocked then coalesce(hostlink.meeting_link, otherlink.meeting_link) end,
         case
           when j.derived_state <> 'confirmed' or j.is_blocked then null
           when hostlink.meeting_link is not null then 'host'
           when otherlink.meeting_link is not null then 'guest'
         end,
         j.request_id,
         j.conversation_id,
         j.open_id,
         j.open_by,
         j.open_slots,
         j.open_duration,
         j.open_is_change,
         j.open_at,
         coalesce(j.open_id is not null and j.open_by <> v_user and j.open_last > now(), false),
         j.is_blocked,
         j.created_at,
         j.updated_at
    from joined j
    left join public.profiles prof on prof.user_id = j.other
    left join public.meeting_prefs zone on zone.user_id = j.other
    left join public.meeting_prefs hostlink on hostlink.user_id = j.host
    left join public.meeting_prefs otherlink on otherlink.user_id = case when j.host = j.other then v_user else j.other end
   order by j.updated_at desc
   limit 100;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Who can call what: signed-in members only. The helpers are internal.
-- ---------------------------------------------------------------------------------------
revoke all on function public._meeting_slots_ok(timestamptz[]) from public, anon, authenticated;
revoke all on function public._meeting_last_slot(timestamptz[]) from public, anon, authenticated;
revoke all on function public._check_meeting_times(timestamptz[], integer) from public, anon, authenticated;
revoke all on function public._close_lapsed_proposals(uuid, uuid) from public, anon, authenticated;
revoke all on function public._check_meeting_limits(uuid) from public, anon, authenticated;
revoke all on function public._my_meeting(uuid) from public, anon, authenticated;
revoke all on function public._open_proposal_for_me(uuid, uuid) from public, anon, authenticated;
revoke all on function public.propose_practice_meeting(uuid, timestamptz[], integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.change_practice_meeting(uuid, timestamptz[], integer) from public, anon, authenticated;
revoke all on function public.confirm_practice_meeting(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.counter_practice_meeting(uuid, timestamptz[], integer) from public, anon, authenticated;
revoke all on function public.decline_practice_meeting(uuid) from public, anon, authenticated;
revoke all on function public.cancel_practice_meeting(uuid) from public, anon, authenticated;
revoke all on function public.my_practice_meetings() from public, anon, authenticated;

grant execute on function public.propose_practice_meeting(uuid, timestamptz[], integer, uuid, uuid) to authenticated;
grant execute on function public.change_practice_meeting(uuid, timestamptz[], integer) to authenticated;
grant execute on function public.confirm_practice_meeting(uuid, timestamptz) to authenticated;
grant execute on function public.counter_practice_meeting(uuid, timestamptz[], integer) to authenticated;
grant execute on function public.decline_practice_meeting(uuid) to authenticated;
grant execute on function public.cancel_practice_meeting(uuid) to authenticated;
grant execute on function public.my_practice_meetings() to authenticated;
