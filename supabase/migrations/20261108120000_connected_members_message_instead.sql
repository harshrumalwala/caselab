-- CaseLab: once two members are connected, asking to case again is a message, not a new practice request.
--
-- A conversation opens when a practice request is accepted. From then on the two people can simply talk, so a second
-- "Case with …?" shouldn't create another request to accept or decline: the app now sends the new case details as a message in
-- the conversation (the other person sees it as new in their inbox). This migration makes the database agree, so a stale tab
-- or an older version of the app can't create the extra request either.
--
-- WHAT CHANGES
--
--   * `send_practice_request` refuses when the two members already have a conversation: "You're already connected with this
--     member. Send them a message instead." It is checked AFTER the generic refusal (unknown, unlisted, blocked, yourself), so
--     that refusal still reveals nothing about members you aren't connected to or who blocked you.
--
-- WHAT DOESN'T
--
--   * Requests that are already waiting or answered stay as they are, and can still be answered or cancelled.
--   * Two members who each asked the other before either was answered can both still be accepted: both accepts use the one
--     conversation for the pair.
--
-- Replaces one function; no table changes.

create or replace function public.send_practice_request(
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

  -- One message for every reason it can't go through (unknown, unlisted, blocked you, yourself), so it reveals nothing.
  if p_to is null
     or p_to = v_user
     or not exists (
       select 1 from public.profiles p
       where p.user_id = p_to and p.listed and public.is_member_id(p.user_id)
     )
     or exists (select 1 from public.practice_blocks b where b.blocker = p_to and b.blocked = v_user)
  then
    raise exception 'This member can''t be asked right now.' using errcode = 'P0001';
  end if;

  -- Already connected: talk in the conversation instead of starting another request.
  if exists (
    select 1 from public.conversations c
    where c.user_lo = least(v_user, p_to) and c.user_hi = greatest(v_user, p_to)
  ) then
    raise exception 'You''re already connected with this member. Send them a message instead.' using errcode = 'P0001';
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
