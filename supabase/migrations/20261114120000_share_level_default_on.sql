-- CaseLab: show members' levels by default.
--
-- The level switch (share_level) was off by default. The decision is now that a member's level, with its job title, is shown to
-- other signed-in members unless they switch it off in Profile and privacy. The level itself is a small, low-sensitivity badge: it
-- never carries XP, cases, scores, medals or stickers, and it is never shown to visitors without an account.
--
--   * New profiles get share_level = true unless they say otherwise (onboarding also shows the switch, already on).
--   * Existing profiles are switched on too. Nobody could have chosen "off" before now apart from by leaving the default, and the
--     switch has been live for a day, so the one-off backfill is what "on for everyone" means.
--   * `level` stays null until each member's own app writes it (it is worked out from their cases there), so a badge only appears for
--     a member after they next open CaseLab. The existing check constraints are untouched: level is still null whenever the switch
--     is off, and still 1 to 30.
--
-- Anyone can still switch it off at any time, which clears their level in the same write.

alter table public.profiles alter column share_level set default true;

update public.profiles set share_level = true where not share_level;
