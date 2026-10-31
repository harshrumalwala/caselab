-- CaseLab: let a member choose to show OTHER MEMBERS the cases they have interviewed, so people know whom to ask.
--
-- DESIGN
--
--   * One new profile-wide switch, `share_interviewed`, OFF by default. Nothing becomes visible by this migration: the
--     interviewed_cases table stays owner-only, and until a member turns the switch on, no one else can learn that
--     they interviewed anything.
--
--   * Members only. Visitors without an account get nothing (the switch is not copied to the public tables and the
--     function below refuses the `anon` role). The member must also be listed, exactly as for shared cases.
--
--   * What is shared is only the case itself: date, title, book, case type and industry. NOT who was interviewed
--     (a third person who never agreed to be listed), and NOT what the member told them or what they learned (private
--     reflection). Those columns are never selected, so they cannot leak through this function.
--
--   * No copy table and no triggers. Members read through one function that checks, on every call, that the caller is
--     a verified member, that the interviewer is listed and that their switch is on, so turning the switch off hides
--     everything immediately and there is nothing stale to clean up. The list is capped at 200 rows.
--
--   * The count is simply the number of rows returned; there is no separate counter to drift out of step.
--
-- Additive: one column and one function.

alter table public.profiles
  add column share_interviewed boolean not null default false;  -- show members the cases I have interviewed

create function public.member_interviewed(p_member uuid)
returns table (
  case_date date,
  title     text,
  source    text,
  case_type text,
  industry  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.case_date,
         left(i.title, 200),
         nullif(left(i.source, 200), ''),
         i.case_type,
         nullif(left(i.industry, 100), '')
  from public.interviewed_cases i
  join public.profiles p on p.user_id = i.user_id
  where i.user_id = p_member
    and p.listed
    and p.share_interviewed
    and (select public.is_member())
  order by i.case_date desc, i.created_at desc
  limit 200;
$$;

comment on function public.member_interviewed(uuid) is
  'The cases a member interviewed, for other verified members, only while their share_interviewed switch is on and they are listed. Never returns who they interviewed or their notes.';

-- Signed-in members only: visitors without an account cannot call it.
revoke all on function public.member_interviewed(uuid) from public, anon, authenticated;
grant execute on function public.member_interviewed(uuid) to authenticated;
