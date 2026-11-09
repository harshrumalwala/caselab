-- CaseLab: remember the last written read of a member's own case feedback (the "Coach's read" on Improvement Areas).
--
-- DESIGN
--
--   * The read is produced by the `analyze-feedback` Edge Function: it reads the signed-in member's OWN feedback text, sends it to
--     Claude, and stores the answer here. The Anthropic key lives only in that function's secrets, never in the browser.
--
--   * One row per member, replaced each time. It holds the answer (a small JSON document), which scope it covered (the latest
--     cases, or all of them), how many cases it read, a fingerprint of the exact text it read (`input_hash`) and when.
--     The fingerprint is what stops a repeat click from paying for the same answer twice: unchanged feedback gets the stored read back
--     without calling Claude. `updated_at` is what limits how often a changed log can be re-read.
--
--   * PRIVATE. A member can read only their own row. It is not part of the profile, not copied to the public tables and never visible
--     to other members or visitors.
--
--   * Members can NOT write it. The row is written only by the Edge Function (with the service role, which bypasses row level
--     security), so a member cannot plant an answer or reset their own rate limit. There is no insert, update or delete privilege
--     for the API roles at all.
--
--   * Deleted with the account (on delete cascade), like everything else the member owns.
--
-- Additive: one table.

create table public.feedback_insights (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  scope      text        not null check (scope in ('recent', 'all')),
  case_count smallint    not null check (case_count between 0 and 100),
  input_hash text        not null check (length(input_hash) between 8 and 128),
  result     jsonb       not null,
  model      text        not null check (length(model) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.feedback_insights is
  'The last Claude read of a member''s own feedback. Private to the member; written only by the analyze-feedback Edge Function.';

alter table public.feedback_insights enable row level security;

create policy "feedback_insights: select own" on public.feedback_insights
  for select to authenticated using ((select auth.uid()) = user_id);

-- Take everything back, then give back only what the app needs: reading your own row.
revoke all on public.feedback_insights from anon, authenticated;
grant select on public.feedback_insights to authenticated;
