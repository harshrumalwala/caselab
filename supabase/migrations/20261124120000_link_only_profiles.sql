-- CaseLab: a member's personal link becomes the ONLY way to see them without an account.
--
-- WHY
--   The front page's "Cased recently" list and "Search all members" are gone (issue #96). Hiding the screen is not
--   enough: while `anon` holds SELECT on public_profiles and public_shared_cases, anyone can still list, search,
--   count and page through every visible member straight through the API, with no CaseLab page involved. This
--   migration takes that read away, so "nobody can browse or search for me" is true in the database and not only
--   in the app.
--
-- WHAT STAYS EXACTLY AS IT IS
--   * public_person(uuid) and public_person_cases(uuid) (SECURITY DEFINER, granted to `anon`) become the only way to
--     read a profile or its cases without an account. They answer on an exact member id, which is the random value
--     inside the member's own profile link, and return the same fields as before.
--   * Every projection rule: the same triggers keep public_profiles and public_shared_cases in step, and the same
--     sharing switches and per-case overrides decide what is in them. Signed-in members never read these tables
--     (they read profiles and shared_cases), so nothing changes for them.
--
-- WHAT IT MEANS FOR EXISTING ROWS
--   * A member who was "on the front page and in search" and a member who was "only people with my link" both end up
--     link-visible: their profile opens from their exact link and from nowhere else, and their existing link keeps
--     working. A member who was not visible without an account stays not visible. Nobody becomes more visible.
--   * `profiles.public_profile` stays the single switch. `profiles.public_link_only` and `public_profiles.in_directory`
--     are deliberately LEFT IN PLACE and stop meaning anything: nothing reads them once there is no directory. Keeping
--     them means this migration does not have to re-create sync_public_profile(), revoke_nonmembers() or the
--     `profiles_link_only_requires_public` constraint (three later migrations already replace those functions), and a
--     browser still running the previous version of the app can keep saving a profile. Every visible profile is set
--     link-only below, so the stored data says what is now true.
--
-- Only revokes, policy drops, comments and one idempotent update: safe to run again.

-- ---------------------------------------------------------------------------------------
-- 1. No privilege at all for the API roles on either public table
-- ---------------------------------------------------------------------------------------
-- Revoking the table privilege also revokes the column privileges granted in
-- 20261021120000_public_directory.sql, 20261025120000_share_partner.sql and
-- 20261030120000_link_only_profiles_and_open_details.sql.
revoke all on public.public_profiles from anon, authenticated;
revoke all on public.public_shared_cases from anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 2. And no policy either
-- ---------------------------------------------------------------------------------------
-- Row level security stays on with nothing to match, so even if a privilege were granted again by mistake (Supabase
-- grants new tables to the API roles by default), a direct read would still return no rows. The SECURITY DEFINER
-- functions below are owned by the table owner, so they are unaffected.
drop policy if exists "public_profiles: anyone reads" on public.public_profiles;
drop policy if exists "public_shared_cases: anyone reads" on public.public_shared_cases;

-- ---------------------------------------------------------------------------------------
-- 3. Say in the schema what these tables and columns are for now
-- ---------------------------------------------------------------------------------------
comment on table public.public_profiles is
  'Members who can be opened by their profile link. No API role may read it: public_person(id) is the only way out.';
comment on table public.public_shared_cases is
  'The public copies of those members'' shared cases. No API role may read it: public_person_cases(id) is the only way out.';
comment on column public.profiles.public_link_only is
  'Historical. Every profile visible without an account is link-only now; nothing reads this column.';
comment on column public.public_profiles.in_directory is
  'Historical: there is no visitor directory any more; nothing reads this column.';

-- ---------------------------------------------------------------------------------------
-- 4. Existing rows: everyone visible without an account is link-only from now on
-- ---------------------------------------------------------------------------------------
-- This can only take someone out of a list that no longer exists, so no one becomes more visible. The profile
-- trigger re-projects each row (in_directory becomes false), which nothing reads either way.
update public.profiles set public_link_only = true where public_profile and not public_link_only;

-- ---------------------------------------------------------------------------------------
-- 5. The exact-id functions are the whole of what visitors get
-- ---------------------------------------------------------------------------------------
revoke all on function public.public_person(uuid) from public, anon, authenticated;
revoke all on function public.public_person_cases(uuid) from public, anon, authenticated;
grant execute on function public.public_person(uuid) to anon;
grant execute on function public.public_person_cases(uuid) to anon;
