# PRODUCT.md: CaseLab

Written 2026-11-15 from the repo (README.md, git history, PR list) and the owner's conversation with the assistant. Where this file
says "not verified" it means the assistant did not see it work. `README.md` is the long-form feature documentation and is kept current
by the developers; this file is the product summary the PM and developer agents start from.

## What the app is

CaseLab is a case-interview practice tracker for MBA students preparing for management-consulting recruiting. It started as a personal
log built around the Booth Management Consulting Group (MCG) Excel case-log template (`MCG Case Log Template.xlsx` is in the repo
root as the reference) and grew into a small community plus an AI practice partner.

- **Live site:** https://caselab-booth.vercel.app (Vercel, static React app; Supabase for sign-in, database and edge functions).
- **Repo:** https://github.com/harshrumalwala/caselab (the owner's own repo; branch `main`).
- **Design goal (owner's words, original spec):** logging a finished case takes under two minutes. Only title, case type and industry
  are required.
- **Tone:** deliberately playful and light (colour, doodles, stickers, jokes, a mascot), not a "dull" corporate look. The owner asked
  for this explicitly and liked the result; copy that is "too serious or mechanical" has been softened on request.

## Who it is for

- **Primary users:** first-year ("1Y") Booth MBA students who are practising cases and want to track coverage, skills and progress.
- **Secondary users:** second-year ("2Y") students and firm representatives, who may not want to sign in every time. Since 2026-11-17
  they reach a member only through that member's own personal link, and see only what that member chose to make public. There is no
  public directory and no public search any more (issue #96): the owner's evidence was that people were not finding the directory
  helpful and that the personal link serves the need.
- **Owner/operator:** one person (the repo owner). There is no in-app admin; moderation, reports and operations happen in the Supabase
  dashboard and CLI.
- **Scale today:** a small group (the owner's consulting-prep circle, intended to grow to other Booth students). The README estimates
  costs for about 100 members; nothing in the repo shows how many real members exist now (not known).

## Roles

| Role | Can do |
|---|---|
| Visitor (no account) | Read the public front page; open **one** member at a time through that member's own profile link, if they switched "people with my link can see my profile" on, and see only what they made public. Cannot list, search or count members: since the migration of 2026-11-17 the `anon` role has no read at all on `public_profiles` or `public_shared_cases`, and the only way in is `public_person(id)` / `public_person_cases(id)` with an exact member id. |
| Member (verified email) | Everything personal (log, dashboard, goals, Warm-up, Bucket, live cases, library), plus the Community features, subject to each member's sharing switches. |
| Owner | Supabase dashboard (users, `message_reports` table, secrets, function deploys), Vercel, and approving every production change. |

## Main user flows

1. **Sign up and set up.** Email + password, verify the emailed link, choose a display name (and optional MBA class) and sharing
   preferences, optionally import an Excel log, take a three-note tour.
2. **Log a case (the core loop).** Press `N` or click Log Case. Type a title (the casebook library suggests matches and fills book,
   type and industry), pick case type and industry, optionally rate overall and eight skills with feedback, add notes, set sharing for
   this case. Saving shows XP, quests and stickers earned and weekly-goal progress.
3. **See progress.** Dashboard: totals, skill averages, trends, case-type and industry coverage, weekly history, "what to work on next",
   weekly goal ring and streak, level pill, quests, medals, stickers.
4. **Improve.** My Case Log → Improvement Areas: thin coverage, skills to sharpen, learning history, **Bucket** (AI coach that sorts your
   written feedback into strengths and fixes), casebook cases to try under each weak skill, and a weekly plan of three-ish cases.
5. **Review a past case against the book.** For a logged case linked to a casebook case: the **Full solution** (the book's own solution
   in our words, with exhibits redrawn and purple "Bucket's tips"), **From the book** (what a strong answer covers), and **Compare with
   the book** (Bucket checks your written feedback against it).
6. **Practise a whole case with Bucket (Live case tab).** Pick a mode and a lane (case type or industry) or "Surprise me"; type through
   the prompt, clarifying questions, framework, exhibits, brainstorm and recommendation; get feedback; the case is logged for you.
7. **Case with other members.** Community → Members: find someone, see only what they share, "Find a case for them" (cases you've done
   that they haven't shared, taking their burned books/cases into account), "Case with *name*?" sends a short request; Community →
   Inbox holds requests and private conversations; accepted requests open a message thread; emails go out for requests and acceptances.
8. **Warm-up.** Optional 30/60/120-second mental-math sprint across fifteen question kinds.
9. **Get data in and out.** Excel import (reads the MCG template, with a review step), Excel export (fills in the real MCG workbook),
   JSON backup/restore, CSV export, account deletion.

## Feature status

Status words: **done** (built, tested, deployed), **partial** (built but with a stated gap), **not started**. "Not verified" means the
assistant has no evidence it was checked by hand in production.

| Feature | Status | Notes |
|---|---|---|
| Case logging, edit, delete; MCG fields (8 skills with feedback), draft autosave | done | Deviations from the template: behavioral averages combine both fields; "past week" is the calendar week (Mon-Sun). |
| Dashboard, trends, coverage, suggestions, Improvement Areas | done | Plain deterministic code in `src/domain/`; no AI. |
| Accounts (sign-up with verified email, reset, delete account) | done | Open self-service sign-up. **CAPTCHA is not wired in** (recommended in README, not built). Custom SMTP via Resend is configured on the production project. |
| Profiles and per-switch privacy (members and visitors), per-case override, "only people with my link" | done | Privacy is enforced in the database (RLS plus projection tables), not in screens. |
| Public front page (hero loop, Meet Bucket section, sign-up calls to action) | done | Headline currently "Case with Bucket. Track your progress." The visitor directory and "Cased recently" were removed on 2026-11-17 (#96); the front page no longer promises a searchable public directory. A member's own link now also says what kind of case to give them next (#120, PR #123). |
| Community: Members, Find a case, Inbox | done | Five top-level tabs after merging People and Messages into Community. |
| Practice requests; private messages; block/report/mute/archive | done | Messages poll every 5 s (not live push); not end-to-end encrypted; reports have no in-app admin. |
| Email notifications for "asked you to case" and "said yes" | done / partly not verified | Resend sender; a one-time marker per request. The owner verified the sign-up emails; the "said yes" email path was left as a user-side check, and whether the "asked you" email was checked is not known. |
| Burned books and burned cases (solo practice that does not count) | done | Advice only (changes what "find a case" suggests). Optional visibility to visitors. |
| Interviewed cases (cases you ran as interviewer) | done | Separate table; never counted; optional sharing to members of the case list only. |
| Excel import, Excel export (real MCG workbook), JSON backup, CSV | done | |
| Casebook library: ~872 cases, search while logging, matching review, "cases to try next", weekly plan | done | Library content is private data, not in git (see below). |
| Full solutions (book's own, reworded) for all 872 library cases | done / partial | All 872 are loaded in production (verified 2026-11-13: 872 cases, 872 analyses, 872 solutions). Some write-ups are marked `partial` because the book prints little (about 11 in the last batch; total partial count across all batches not known). Partial cases are not offered in Live case. |
| Exhibits redrawn as charts | partial | Bar, stacked, 100% stack, line, bar+line, pie, scatter, multi-panel. Marimekko, bubble, waterfall, dual-axis, maps, flow diagrams, stacked area and scatter trend lines stay as exact tables. |
| Compare with the book (Claude via Edge Function) | done | |
| Bucket coach: feedback read (Claude via Edge Function) | done | Model `claude-sonnet-5-5` by default. Needs written feedback on at least 3 cases. |
| Live case: Practice, Interview and Learning modes | partial — it runs end to end and leaks no exhibit; the $2 pilot found that it gives too much away in words, and that a case with exhibits is missing part of itself | The audit of 2026-11-15 found four defects in how every case runs; all four shipped and are live (#81 charts drawn, #82 clock sized to the case, #83 interviewer data reachable, #85 soft words no longer hide a book exhibit). Since then: interview mode has its own nudge ladder (#94); no exhibit reaches a member cut and 10,164 scripted runs hand over 12,766 exhibits with zero interviewer-side leaks (#95); a learner can move on from an exhibit without writing first (#119, deployed 2026-11-17); and the picker's exhibits filter (#87/#118) was **reverted** at the owner's request (#124). Measured 2026-11-17: 847 of 872 cases are live-eligible, 285 conversation-only, 171 with a single beat. **The $2 pilot ran on 2026-11-17** (6 real starts, $0.1485) and answered the question a scripted harness cannot. Good: the coach refuses to do a calculation and reads the inputs aloud instead; #83's data handover works; no interviewer-only exhibit leaked; every exhibit arrived exactly as the write-up prints it, charts included. Not good, all now filed: a case with exhibits drops every analytical step that has no exhibit, which affects **502 of 847 cases** and makes the feedback mark members down for work they were never asked to do (#128); replies confirm a member's guess before they have earned it, so guessing works and interview reads much like practice (#130); a result pre-printed on the interviewer's sheet gets handed over as input data (#129); the brainstorm always runs last (#133); 17 prompts talk about the book to the member (#132). Three wording defects (#131) were fixed, deployed and verified on the real model the same day. Practice can pause and end early; Interview can do neither; Learning has no clock. Nobody has yet started a Learning case in a browser. |
| Levels, XP, weekly quests, skill medals, sticker book, level badge shown to members | done | Level shown to members is on by default; one setting hides all rewards. Warm-up earns no XP. |
| Weekly goal with streak | done | |
| Warm-up mental math | done | Fifteen question kinds, 30/60/120 s, bests synced to account. |
| First-login tour, keyboard shortcuts, installable app | done | No offline mode (no service worker). |
| Demo mode (16 sample cases, in memory only) | done | |
| "Free this week" badge on profiles | not started | Owner said "not now". Overlaps with scheduling; retire or reconsider. |
| Scheduling inside the community (meeting link, propose/confirm/counter/cancel, calendar invite emails) | not started | Proposed as issues #98-#102, phase 1 only (no calendar sign-in). None approved. |
| Remove the public member search; personal link as the only public way in | done (#96) | Shipped 2026-11-17: PR #116 merged and migration `20261124120000_link_only_profiles.sql` applied with the owner's approval. Verified on production that `anon` and `authenticated` have no table or column SELECT on `public_profiles` / `public_shared_cases`, RLS on with zero policies, and `public_person` / `public_person_cases` still executable by `anon`; `npm run test:e2e` passed 60 / 10 skipped afterwards. The two visitor settings collapsed into one, "People with my link can see my profile", off by default. "Reset my link" (#97) is still proposed. |
| Verified-Booth-only sign-up | not started | Designed so it needs no rebuild (see DECISIONS.md). |

## Data and privacy model (what must stay true)

- Everything is private by default. Other members only see what the owner of the data switched on.
- A member's own `cases` table is readable only by that member. Other members and visitors read separate projection tables that
  contain only shared fields.
- Library analyses and solutions are copyrighted third-party-derived material written in our own words. They are **not in git**, are
  unreadable by every API role, and are released only to a verified member who logged that case, one case at a time.
- Personal dashboards and totals never include other members' records; burned and interviewed cases never count in totals.
- No email address is ever shown to another member.

## Content policy for the casebook solutions

Rules the owner set, which apply to any new solution content:
- Part A is exactly the book's own solution, reworded (same meaning, order and numbers), with nothing of ours added; at most five
  clarifying questions; the framework is the book's first-level buckets with second-level points; only the book's own exhibits.
- Everything we add is "Bucket's tips" (purple), including a separate "Bucket's top 3 takeaways". No notes about slips in the book.
- Never host or redistribute the books' pages, text or images; charts are our own redrawing from the figures.

## Costs and external services

Supabase (database, auth, edge functions), Vercel (hosting), Resend (email), Anthropic API (Bucket, Compare, Live case). Live-case replies
use `claude-haiku-5-5`, feedback uses `claude-sonnet-5-5` — confirmed on the project on 2026-11-16: no `ANTHROPIC_MODEL`,
`ANTHROPIC_COACH_MODEL` or `ANTHROPIC_FEEDBACK_MODEL` secret is set, so the code defaults apply. **Real usage has now been read back**
(`live_case_sessions.state -> 'usage'`, by `npm run pilot:live`): a whole interview case from prompt to feedback costs about **3 cents**,
a third of the README's under-10-cents estimate, of which roughly 80% is the single Sonnet feedback call. The Bucket read estimate of
about 3 cents has still not been measured. What limits live-case use is not money but the function's own 4 starts per member per day.
