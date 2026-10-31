-- CaseLab: practice requests (and so messages) are open to every member, with no switch to turn on.
--
-- Until now a member only received practice requests after switching on `profiles.open_to_requests`. That opt-in is
-- removed: any signed-in, verified member can ask any other verified member who appears in People (is "listed") to case.
--
-- WHAT STAYS THE SAME
--
--   * Members who have turned off "Appear in People search" still can't be asked: unlisting means disappearing, and a
--     member who can't be found shouldn't be reachable either.
--   * Blocking. A member can block anyone (declining with "don't let them ask again", blocking from a conversation, or
--     reporting with "also block"); the blocked member's requests and messages are refused with the same generic message
--     as every other refusal, so they can't tell.
--   * Every limit (one waiting request per pair, 5 waiting, 20 a day), the identical refusal message for every reason,
--     and a conversation only ever opening when a request is accepted.
--
-- HOW
--
--   * Only `send_practice_request` changes: the `open_to_requests` condition is dropped. Nothing else reads the column.
--   * The column itself is left in place, unused. Dropping it now would make any browser still running the previous version
--     of the app fail to save a profile until it reloads; a later migration can remove it once that version is gone.
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

comment on column public.profiles.open_to_requests is
  'No longer used: practice requests are open to every listed, verified member. Kept until the previous app version is gone.';
