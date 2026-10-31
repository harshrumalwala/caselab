-- CaseLab: a member can delete their own account.
--
-- Until now the only way to remove an account was for the project owner to delete the user by hand in the Supabase dashboard.
-- This adds `delete_my_account`, which deletes the signed-in member's login. Everything a member owns hangs off that login with
-- "on delete cascade", so one delete removes all of it: their profile (and with it everything shared or public about them), cases,
-- lists, weekly goal, Warm-up record, practice requests they sent or received, who they blocked or were blocked by, and every
-- conversation they were in (so the other person loses that conversation too).
--
-- DESIGN
--
--   * A member can only delete THEMSELVES: the function acts on `auth.uid()` and takes no user id.
--
--   * A confirmation word is required by the database as well as the app (`p_confirm` must be exactly DELETE), so a stray or scripted
--     call can't remove an account by accident.
--
--   * Reports about a conversation are kept even when the reporter or the reported member deletes their account, but they no longer
--     point at that person (the link becomes empty). The reason and the snapshot of the messages stay, so a report still means something.
--
--   * Only signed-in members can call it; visitors cannot. It runs with the owner's privileges, because deleting a login is not
--     something the API roles can do directly, and it is limited to the caller's own row.
--
--   * Irreversible. Nothing is archived: the app tells members to download a backup first.
--
-- Additive: one function.

create function public.delete_my_account(p_confirm text)
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
  if p_confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm.' using errcode = 'P0001';
  end if;

  delete from auth.users where id = v_user;
end;
$$;

revoke all on function public.delete_my_account(text) from public, anon, authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
