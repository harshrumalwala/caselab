-- CaseLab: messages. Two members who have agreed to case (one accepted the other's practice request) can keep talking in a
-- private conversation: to settle a time, share a link, go over a case afterwards, or talk about drills.
--
-- DESIGN
--
--   * CONSENT FIRST. A conversation only ever starts when a practice request is accepted, so both people have already
--     opted in (the recipient switched on "Let members ask me to case" and said yes). There is no way to message
--     someone cold. The accepted request's note and reply become the first messages.
--
--   * EXACTLY TWO PEOPLE. One conversation per pair. Nobody else can read it: not other members, not visitors.
--
--   * NO DIRECT ACCESS. Like practice requests, the tables have no access at all for the API roles. Everything goes
--     through the functions below, which act only on the signed-in member's own conversations, so there is no policy
--     to get wrong and no way to list someone else's.
--
--   * CONTROLS. Each person can mute or archive a conversation (their own view only), delete their own messages (gone
--     for both), block the other person, or report the conversation. A block works both ways for messaging and also
--     stops practice requests; the other person is never told ("You can't message this member right now").
--     A new message from the other person brings an archived conversation back, unless blocked.
--
--   * REPORTS. A report keeps a snapshot of the last 30 messages as they were when it was sent, so deleting messages
--     afterwards doesn't erase what was reported. Reports can only be read by the database owner (Supabase dashboard
--     or SQL editor): there is no in-app admin. Reporting can also block in the same step.
--
--   * LIMITS. A message is 1 to 1000 characters; at most 30 messages in 10 minutes and 500 in 24 hours; at most 5
--     reports in 24 hours.
--
--   * HONEST ABOUT PRIVACY. Messages are not end-to-end encrypted: whoever administers the database could read them.
--     They are deleted with the accounts involved (on delete cascade). Nothing here stores or returns an email address.
--
-- Do not add these tables to a Realtime publication: they have no policies, and the app polls instead.
--
-- Additive, plus one replaced function (respond_practice_request, which now also opens the conversation on accept).

-- ---------------------------------------------------------------------------------------
-- Tables (closed to direct access)
-- ---------------------------------------------------------------------------------------
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  -- The pair, ordered so each pair has exactly one row.
  user_lo         uuid not null references auth.users (id) on delete cascade,
  user_hi         uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (user_lo < user_hi),
  unique (user_lo, user_hi)
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  muted           boolean not null default false,
  archived        boolean not null default false,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender          uuid not null references auth.users (id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now(),
  -- A deleted message keeps its place but loses its text.
  deleted_at      timestamptz,
  check ((deleted_at is not null and body = '') or (deleted_at is null and char_length(body) between 1 and 1000))
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index conversation_members_user_idx on public.conversation_members (user_id);

-- Kept even if the people involved later leave, so a report still means something.
create table public.message_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter        uuid references auth.users (id) on delete set null,
  reported        uuid references auth.users (id) on delete set null,
  conversation_id uuid,
  reason          text not null check (char_length(reason) between 1 and 500),
  snapshot        jsonb not null,
  created_at      timestamptz not null default now()
);

comment on table public.conversations is 'A private conversation between two members. No direct access for API roles; use the message functions.';
comment on table public.conversation_members is 'Each person''s view of a conversation (read marker, mute, archive). No direct access for API roles.';
comment on table public.messages is 'Messages in a conversation. No direct access for API roles; use the message functions.';
comment on table public.message_reports is 'Reports with a snapshot of the last messages. Readable only by the database owner.';

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reports enable row level security;

revoke all on public.conversations from anon, authenticated;
revoke all on public.conversation_members from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.message_reports from anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Internal helpers (not callable by the API roles)
-- ---------------------------------------------------------------------------------------
create function public._blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.practice_blocks b
    where (b.blocker = p_a and b.blocked = p_b) or (b.blocker = p_b and b.blocked = p_a)
  );
$$;

create function public._start_conversation(p_a uuid, p_b uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.conversations (user_lo, user_hi)
  values (least(p_a, p_b), greatest(p_a, p_b))
  on conflict (user_lo, user_hi) do nothing;

  select c.id into v_id from public.conversations c where c.user_lo = least(p_a, p_b) and c.user_hi = greatest(p_a, p_b);

  insert into public.conversation_members (conversation_id, user_id)
  values (v_id, p_a), (v_id, p_b)
  on conflict do nothing;
  return v_id;
end;
$$;

-- Accepting now also opens the conversation, seeded with the request's note and the reply.
create or replace function public.respond_practice_request(p_id uuid, p_accept boolean, p_reply text, p_block boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_req      public.practice_requests;
  v_conv     uuid;
  v_proposal text;
  v_first    text;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  update public.practice_requests r
     set status = case when p_accept then 'accepted' else 'declined' end,
         reply = public._clean(p_reply),
         responded_at = now()
   where r.id = p_id and r.to_user = v_user and r.status = 'pending'
  returning r.* into v_req;

  if not found then
    raise exception 'That request is no longer waiting.' using errcode = 'P0001';
  end if;

  if not p_accept and coalesce(p_block, false) then
    insert into public.practice_blocks (blocker, blocked) values (v_user, v_req.from_user) on conflict do nothing;
  end if;

  if p_accept and not public._blocked_between(v_user, v_req.from_user) then
    v_conv := public._start_conversation(v_user, v_req.from_user);

    v_proposal := nullif(concat_ws(
      ' · ',
      case
        when v_req.case_title is not null then v_req.case_title || coalesce(' (' || v_req.case_book || ')', '')
        when v_req.case_book is not null then 'A case from ' || v_req.case_book
      end,
      v_req.when_text
    ), '');
    v_first := nullif(concat_ws(E'\n', v_proposal, v_req.message), '');

    if v_first is not null then
      insert into public.messages (conversation_id, sender, body, created_at)
      values (v_conv, v_req.from_user, left(v_first, 1000), v_req.created_at);
    end if;
    if v_req.reply is not null then
      insert into public.messages (conversation_id, sender, body, created_at)
      values (v_conv, v_user, v_req.reply, v_req.responded_at);
    end if;

    update public.conversations c set last_message_at = now() where c.id = v_conv;
    -- The person who asked has not read the reply yet; the person who accepted wrote it.
    update public.conversation_members m set last_read_at = now() where m.conversation_id = v_conv and m.user_id = v_user;
    update public.conversation_members m set last_read_at = v_req.created_at, archived = false where m.conversation_id = v_conv and m.user_id = v_req.from_user;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------------------
create function public.my_conversations()
returns table (
  id           uuid,
  other_id     uuid,
  other_name   text,
  last_body    text,
  last_deleted boolean,
  last_mine    boolean,
  last_at      timestamptz,
  unread       integer,
  muted        boolean,
  archived     boolean,
  blocked      boolean
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
  select c.id,
         case when c.user_lo = v_user then c.user_hi else c.user_lo end,
         p.display_name,
         lm.body,
         coalesce(lm.deleted_at is not null, false),
         coalesce(lm.sender = v_user, false),
         coalesce(lm.created_at, c.created_at),
         (select count(*)::integer from public.messages m
           where m.conversation_id = c.id and m.sender <> v_user and m.deleted_at is null and m.created_at > me.last_read_at),
         me.muted,
         me.archived,
         public._blocked_between(c.user_lo, c.user_hi)
    from public.conversations c
    join public.conversation_members me on me.conversation_id = c.id and me.user_id = v_user
    left join public.profiles p on p.user_id = case when c.user_lo = v_user then c.user_hi else c.user_lo end
    left join lateral (
      select m.body, m.deleted_at, m.sender, m.created_at
        from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1
    ) lm on true
   order by coalesce(lm.created_at, c.created_at) desc
   limit 100;
end;
$$;

-- The latest 200 messages, oldest first.
create function public.conversation_messages(p_conversation uuid)
returns table (id uuid, mine boolean, body text, created_at timestamptz, deleted boolean)
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
  if not exists (select 1 from public.conversation_members me where me.conversation_id = p_conversation and me.user_id = v_user) then
    raise exception 'That conversation isn''t available.' using errcode = 'P0001';
  end if;
  return query
  select t.id, t.sender = v_user, t.body, t.created_at, t.deleted_at is not null
    from (
      select m.* from public.messages m where m.conversation_id = p_conversation order by m.created_at desc, m.id limit 200
    ) t
   order by t.created_at asc, t.id;
end;
$$;

create function public.mark_conversation_read(p_conversation uuid)
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
  update public.conversation_members me set last_read_at = now()
   where me.conversation_id = p_conversation and me.user_id = v_user;
  if not found then
    raise exception 'That conversation isn''t available.' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------------------
create function public.send_message(p_conversation uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_other uuid;
  v_body  text := public._clean(p_body);
  v_id    uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select case when c.user_lo = v_user then c.user_hi else c.user_lo end into v_other
    from public.conversations c
    join public.conversation_members me on me.conversation_id = c.id and me.user_id = v_user
   where c.id = p_conversation;
  if v_other is null then
    raise exception 'That conversation isn''t available.' using errcode = 'P0001';
  end if;

  if v_body is null then
    raise exception 'Write a message first.' using errcode = 'P0001';
  end if;

  -- One message for every reason it can't go through (blocked either way, or they are no longer a member).
  if not public.is_member_id(v_user) or not public.is_member_id(v_other) or public._blocked_between(v_user, v_other) then
    raise exception 'You can''t message this member right now.' using errcode = 'P0001';
  end if;

  if (select count(*) from public.messages m where m.sender = v_user and m.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'You''re sending messages very quickly. Try again in a few minutes.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages m where m.sender = v_user and m.created_at > now() - interval '24 hours') >= 500 then
    raise exception 'That''s a lot of messages for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender, body) values (p_conversation, v_user, v_body) returning messages.id into v_id;
  update public.conversations c set last_message_at = now() where c.id = p_conversation;
  -- Sending reads everything so far; the other person's archived copy comes back.
  update public.conversation_members me set last_read_at = now() where me.conversation_id = p_conversation and me.user_id = v_user;
  update public.conversation_members me set archived = false where me.conversation_id = p_conversation and me.user_id = v_other;
  return v_id;
end;
$$;

create function public.delete_message(p_id uuid)
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
  update public.messages m set body = '', deleted_at = now()
   where m.id = p_id and m.sender = v_user and m.deleted_at is null;
  if not found then
    raise exception 'That message can''t be deleted.' using errcode = 'P0001';
  end if;
end;
$$;

create function public.set_conversation_muted(p_conversation uuid, p_muted boolean)
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
  update public.conversation_members me set muted = coalesce(p_muted, false)
   where me.conversation_id = p_conversation and me.user_id = v_user;
  if not found then
    raise exception 'That conversation isn''t available.' using errcode = 'P0001';
  end if;
end;
$$;

create function public.set_conversation_archived(p_conversation uuid, p_archived boolean)
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
  update public.conversation_members me set archived = coalesce(p_archived, false)
   where me.conversation_id = p_conversation and me.user_id = v_user;
  if not found then
    raise exception 'That conversation isn''t available.' using errcode = 'P0001';
  end if;
end;
$$;

-- Stops practice requests and messages in both directions, silently. Undo it with unblock_practice_asker.
create function public.block_member(p_user uuid)
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
  if p_user is null or p_user = v_user then
    raise exception 'That member can''t be blocked.' using errcode = 'P0001';
  end if;
  insert into public.practice_blocks (blocker, blocked) values (v_user, p_user) on conflict do nothing;
end;
$$;

create function public.report_conversation(p_conversation uuid, p_reason text, p_block boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := (select auth.uid());
  v_other  uuid;
  v_reason text := public._clean(p_reason);
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select case when c.user_lo = v_user then c.user_hi else c.user_lo end into v_other
    from public.conversations c
    join public.conversation_members me on me.conversation_id = c.id and me.user_id = v_user
   where c.id = p_conversation;
  if v_other is null then
    raise exception 'That conversation isn''t available.' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Tell us briefly what happened.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.message_reports r where r.reporter = v_user and r.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'You''ve already sent several reports today.' using errcode = 'P0001';
  end if;

  insert into public.message_reports (reporter, reported, conversation_id, reason, snapshot)
  values (
    v_user, v_other, p_conversation, left(v_reason, 500),
    coalesce((
      select jsonb_agg(
               jsonb_build_object('at', t.created_at, 'from', case when t.sender = v_user then 'reporter' else 'reported' end, 'body', t.body, 'deleted', t.deleted_at is not null)
               order by t.created_at, t.id)
        from (select m.* from public.messages m where m.conversation_id = p_conversation order by m.created_at desc, m.id limit 30) t
    ), '[]'::jsonb)
  );

  if coalesce(p_block, false) then
    insert into public.practice_blocks (blocker, blocked) values (v_user, v_other) on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Who can call what: signed-in members only. The helpers are internal.
-- ---------------------------------------------------------------------------------------
revoke all on function public._blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public._start_conversation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.my_conversations() from public, anon, authenticated;
revoke all on function public.conversation_messages(uuid) from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid) from public, anon, authenticated;
revoke all on function public.send_message(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_message(uuid) from public, anon, authenticated;
revoke all on function public.set_conversation_muted(uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_conversation_archived(uuid, boolean) from public, anon, authenticated;
revoke all on function public.block_member(uuid) from public, anon, authenticated;
revoke all on function public.report_conversation(uuid, text, boolean) from public, anon, authenticated;
-- create or replace keeps the existing grants on respond_practice_request.

grant execute on function public.my_conversations() to authenticated;
grant execute on function public.conversation_messages(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.set_conversation_muted(uuid, boolean) to authenticated;
grant execute on function public.set_conversation_archived(uuid, boolean) to authenticated;
grant execute on function public.block_member(uuid) to authenticated;
grant execute on function public.report_conversation(uuid, text, boolean) to authenticated;
