-- CaseLab: "burned cases". A member can list individual cases they have worked through on their own (for example
-- from a casebook), so other members picking a case for them can skip those exact cases.
--
-- DESIGN
--
--   * These are NOT practice cases. They are not rows in `cases`, so they never count toward a member's totals, coverage,
--     ratings or trends. They are just a list of {title, book} on the profile, like `burned_books`.
--
--   * It is part of the profile, so exactly the people who can already read a member's profile can read it: verified
--     members, and only while the member is listed. It is NOT copied to the public tables, so visitors never see it.
--
--   * Advice, not a lock: it only changes what another member's "find a case for them" screen suggests, and it reveals
--     nothing beyond case and casebook names the member typed themselves.
--
--   * Abuse limits: an array of at most 300 entries and 40 000 characters in total (the app also trims, de-duplicates
--     and cuts each title to 200 and each book to 100 characters before saving).
--
-- Additive: one column and one constraint.

alter table public.profiles
  add column burned_cases jsonb not null default '[]'::jsonb;

alter table public.profiles
  add constraint profiles_burned_cases_size
  check (
    jsonb_typeof(burned_cases) = 'array'
    and jsonb_array_length(burned_cases) <= 300
    and octet_length(burned_cases::text) <= 40000
  );

comment on column public.profiles.burned_cases is
  'Individual cases this member has already burned, as [{"title": "...", "book": "..."}]. Not practice cases; read by members who can see the profile; never public.';
