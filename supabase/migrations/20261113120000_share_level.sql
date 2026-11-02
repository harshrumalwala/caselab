-- CaseLab: let a member choose to show OTHER MEMBERS their level, so people can see how far along someone is.
--
-- DESIGN
--
--   * A level is worked out in the app from a member's cases and is never stored with the cases. To show it to others the app
--     keeps ONE small number on the member's profile, and only while they have switched sharing on. That number is a
--     self-reported badge, not proof of anything: the database checks that it is a sane level (1 to 30) and nothing more.
--
--   * Two new profile columns:
--       share_level  boolean  OFF by default. Nothing becomes visible by this migration.
--       level        smallint the level to show; null whenever sharing is off.
--
--   * "Null whenever sharing is off" is a database rule (a check constraint), not just something the app remembers to do.
--     Members can read every column of a listed profile, so this is what guarantees that turning the switch off, or never
--     turning it on, leaves no level for anyone else to read.
--
--   * Members only. The level is not copied to the public tables, so visitors without an account never see it.
--
--   * Only the level is ever shared: no XP, no cases, no scores, no medals, no stickers.
--
-- Additive: two columns and two constraints.

alter table public.profiles
  add column share_level boolean  not null default false,  -- show members my level and job title
  add column level       smallint;                         -- the level to show (null while not sharing)

alter table public.profiles
  add constraint profiles_level_range check (level is null or level between 1 and 30),
  add constraint profiles_level_needs_sharing check (level is null or share_level);

comment on column public.profiles.share_level is
  'The member chose to show other verified members their level and job title. Off by default.';
comment on column public.profiles.level is
  'The level shown to other members. A self-reported badge, 1 to 30, and null unless share_level is on.';
