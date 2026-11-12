-- CaseLab: the live case ("practise a whole case with Bucket").
--
-- A member practises one casebook case in writing against a 30-minute clock, with Bucket (an AI interviewer) asking the questions. The
-- whole thing runs in the `live-case` Edge Function, which holds the case's write-up, asks the model, and keeps the session. This migration
-- adds what it needs from the database:
--
--   * live_case_sessions: one row per live case (its stage, clock, the member's answers and drafts, the coach's replies and the feedback,
--     as one JSON document). CLOSED to the API roles, like library_case_solutions: RLS on with no policy, and no privilege for anon or
--     authenticated. Only the Edge Function (the service role) reads and writes it, so a member cannot read or change a session by hand,
--     and the stage gating that keeps the book's answer from the screen cannot be bypassed.
--       - One ACTIVE session per member at a time (a partial unique index).
--       - Deleted with the account.
--
--   * live_case_catalog(): the casebook cases that have a write-up, so the member can pick one to practise. Names only (what search_library()
--     already shows any member), and whether this member has already logged the case. Verified members only. Releases nothing about the case.
--
--   * live_case_pick_for(user): a random case with a write-up that the user has not logged, for "surprise me". Callable only by the service
--     role.
--
-- Additive: one table and two functions (and one only the service role may call). Nothing existing changes.

create table public.live_case_sessions (
  id                uuid primary key,
  user_id           uuid        not null references auth.users (id) on delete cascade,
  library_id        uuid        not null references public.library_cases (id) on delete cascade,
  status            text        not null default 'active' check (status in ('active', 'done')),
  state             jsonb       not null check (jsonb_typeof(state) = 'object'),
  feedback          jsonb       check (feedback is null or jsonb_typeof(feedback) = 'object'),
  feedback_attempts smallint    not null default 0 check (feedback_attempts >= 0),
  logged_case_id    uuid        references public.cases (id) on delete set null,
  actions           integer     not null default 0 check (actions >= 0),
  llm_calls         integer     not null default 0 check (llm_calls >= 0),
  version           integer     not null default 0 check (version >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.live_case_sessions is
  'A member''s live practice case with Bucket: stage, clock, answers, drafts, coach replies and feedback. No API role can read or write it: only the live-case Edge Function (service role).';

create unique index live_case_one_active_per_member on public.live_case_sessions (user_id) where status = 'active';
create index live_case_sessions_user_idx on public.live_case_sessions (user_id, created_at desc);

alter table public.live_case_sessions enable row level security;
revoke all on public.live_case_sessions from anon, authenticated;

create function public.live_case_catalog()
returns table (
  id           uuid,
  name         text,
  book         text,
  school       text,
  year         smallint,
  case_type    text,
  industry     text,
  cochair_pick boolean,
  done         boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.book, c.school, c.year, c.case_type, c.industry, c.cochair_pick,
         exists (select 1 from public.cases m where m.library_id = c.id and m.user_id = (select auth.uid())) as done
  from public.library_cases c
  join public.library_case_solutions s on s.case_id = c.id
  where (select public.is_member())
  order by c.cochair_pick desc, c.year desc, c.name;
$$;

comment on function public.live_case_catalog() is
  'The library cases that can be practised live (those with a write-up), with whether the caller has logged each. Verified members only. Returns names only, nothing about the cases themselves.';

revoke all on function public.live_case_catalog() from public, anon, authenticated;
grant execute on function public.live_case_catalog() to authenticated;

create function public.live_case_pick_for(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.case_id
  from public.library_case_solutions s
  where not exists (select 1 from public.cases m where m.library_id = s.case_id and m.user_id = p_user)
  order by random()
  limit 1;
$$;

comment on function public.live_case_pick_for(uuid) is
  'A random library case with a write-up that the user has not logged. Only the live-case Edge Function (service role) may call it.';

revoke all on function public.live_case_pick_for(uuid) from public, anon, authenticated;
