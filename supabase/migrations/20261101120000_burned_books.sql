-- CaseLab: "burned books". A member can list the casebooks they have already worked through (for example solo), so
-- other members picking a case for them can skip those books.
--
-- DESIGN
--
--   * `profiles.burned_books` is a list of casebook names, empty by default. Nothing is shared until a member adds a book.
--
--   * It is part of the profile, so exactly the people who can already read a member's profile can read it: verified
--     members, and only while the member is listed. It is NOT copied to the public tables, so visitors without an
--     account never see it (the "find a case for them" feature needs an account anyway).
--
--   * It is advice, not a lock. It only changes what the other member's "find a case for them" screen suggests. It does
--     not hide, remove or block anything, and it reveals nothing beyond casebook names the member typed themselves.
--
--   * Abuse limits: at most 40 books and 2000 characters in total (the app also trims, de-duplicates and cuts each
--     name to 100 characters before saving).
--
-- Additive: one column and one constraint.

alter table public.profiles
  add column burned_books text[] not null default '{}';

alter table public.profiles
  add constraint profiles_burned_books_size
  check (cardinality(burned_books) <= 40 and char_length(array_to_string(burned_books, ',')) <= 2000);

comment on column public.profiles.burned_books is
  'Casebook names this member has already burned. Read by members who can see the profile; never public.';
