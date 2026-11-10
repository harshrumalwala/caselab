-- CaseLab: remember Bucket's comparison of a member's feedback on a case with what a strong answer to that casebook case covers.
--
-- DESIGN
--
--   * Produced by the `compare-case` Edge Function, only when the member asks, only for a case THEY logged that is linked to a library case
--     we have analysed. It reads the member's own written feedback on that case, and our analysis of the case (released to the function
--     through `library_notes_for()` with the member's own token, so the rule "only a member who has logged the case" is enforced by the
--     database, not by the function), asks Claude what the member covered and missed, and stores the answer here.
--
--   * One row per case, replaced each time. `input_hash` is a fingerprint of exactly what was read, so asking again about unchanged
--     feedback returns the stored answer without paying for it twice; `updated_at` limits how often a changed case can be re-read.
--
--   * PRIVATE. A member reads only their own rows. Members can NOT write them (no insert, update or delete for the API roles), so nobody
--     can plant an answer or reset their own limit. Removed with the case or the account.
--
--   * The answer is Claude's comparison in its own words (what was covered, what was missed, one tip), not our analysis verbatim.
--
-- Additive: one table.

create table public.case_comparisons (
  case_id    uuid primary key references public.cases (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  input_hash text        not null check (length(input_hash) between 8 and 128),
  result     jsonb       not null,
  model      text        not null check (length(model) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index case_comparisons_user_idx on public.case_comparisons (user_id);

comment on table public.case_comparisons is
  'Claude''s comparison of a member''s feedback on one case with a strong answer to it. Private to the member; written only by the compare-case Edge Function.';

alter table public.case_comparisons enable row level security;

create policy "case_comparisons: select own" on public.case_comparisons
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.case_comparisons from anon, authenticated;
grant select on public.case_comparisons to authenticated;
