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
- **Secondary users:** second-year ("2Y") students and firm representatives, who may not want to sign in every time. They can browse
  the public member directory without an account, and see only what members chose to make public.
- **Owner/operator:** one person (the repo owner). There is no in-app admin; moderation, reports and operations happen in the Supabase
  dashboard and CLI.
- **Scale today:** a small group (the owner's consulting-prep circle, intended to grow to other Booth students). The README estimates
  costs for about 100 members; nothing in the repo shows how many real members exist now (not known).

## Roles

| Role | Can do |
|---|---|
| Visitor (no account) | Read the public front page; search and open members who chose "visible without an account" and see only what those members made public. Cannot see anything else. |
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
| Public front page with visitor directory, recent casers, hero loop, Meet Bucket section | done | Headline currently "Case with Bucket. Track your progress." |
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
| Live case: Practice, Interview and Learning modes | done / learning not verified | Practice can pause and end early; Interview has neither; Learning (merged 2026-11-15) has no clock and Bucket coaches. The session that built Learning reported it had not started a Learning case on the live site, and had not checked that Vercel had deployed. |
| Levels, XP, weekly quests, skill medals, sticker book, level badge shown to members | done | Level shown to members is on by default; one setting hides all rewards. Warm-up earns no XP. |
| Weekly goal with streak | done | |
| Warm-up mental math | done | Fifteen question kinds, 30/60/120 s, bests synced to account. |
| First-login tour, keyboard shortcuts, installable app | done | No offline mode (no service worker). |
| Demo mode (16 sample cases, in memory only) | done | |
| "Free this week" badge on profiles | not started | Owner said "not now". |
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
use `claude-haiku-5-5`, feedback uses `claude-sonnet-5-5`. The README estimates under 10 cents per live case and about 3 cents per
Bucket read; these are estimates, and real usage is stored per case (`live_case_sessions.state -> 'usage'`) but no one has reported
reading it back (not known).
