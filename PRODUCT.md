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
| Profiles and per-switch privacy (members and visitors), per-case override, "only people with my link" | done | Privacy is enforced in the database (RLS plus projection tables), not in screens. Since 2026-11-19 (#240) the Profile & privacy dialog also **says what the rules are doing to you**: the visitors preview asks `public_person` itself rather than trusting the local switches, so a profile that is switched on but publishes nothing (an unverified email leaves `is_member_id()` false) says so instead of blaming the per-case sharing. **The two switches became independent on 2026-11-20** (#244): the owner decided People search and the profile link are two audiences, the migration was applied to production with their approval, and a member can now be reachable by link without putting their name in front of every classmate. Shipped across four PRs — #246 (the database rule), #249 (a signed-in member following a link-only profile reads the link view rather than "This member isn't available"), #248 (the switches and the copy #240 had shipped, which the new rule made false) and #251 (your own page no longer reads as a broken link when the member audience is correctly empty). **Row level security was deliberately not widened**: it cannot tell `where user_id = $1` from an unfiltered scan, so widening it would have made every link-only profile enumerable by any member. Reasons in DECISIONS.md. |
| Public front page (hero loop, Meet Bucket section, sign-up calls to action) | done | Headline currently "Case with Bucket. Track your progress." The visitor directory and "Cased recently" were removed on 2026-11-17 (#96); the front page no longer promises a searchable public directory. A member's own link now also says what kind of case to give them next (#120, PR #123). **The link page was opened in a browser for the first time on 2026-11-19**, the day after five PRs rebuilt it on a green suite, and three real defects came out that no test could see — jsdom reports every width and box as zero. Fixed the same day: **#241** (bar labels were cut off at every width by a fixed pixel gutter inside an `overflow: hidden` SVG; the bars are now plain DOM, verified in a real browser at 375 and 1440 in both themes, 0 clipped elements) and **#242** (the owner rejected the two-column layout twice — above 1024 px the page is now one full-width column ending in a dense sortable table, measured at 4,004 px → 2,459 page height, 2,331 px → 20 px blank gutter, about 4 → 14 of 14 cases on one screen; below 1024 px it is unchanged). Every one of those readings is on **stubbed rows**: nobody has opened a real profile link against the real database. |
| Community: Members, Find a case, Inbox | done | Five top-level tabs after merging People and Messages into Community. |
| Practice requests; private messages; block/report/mute/archive | done | Messages poll every 5 s (not live push); not end-to-end encrypted; reports have no in-app admin. |
| Email notifications for "asked you to case" and "said yes" | done | Resend sender; a one-time marker per request. The owner verified the sign-up emails, and on 2026-11-19 confirmed that **both** notification emails have landed in a real inbox — the "asked you to case" one and the "said yes" acceptance. That answered the last open question behind #101 and #102. |
| Burned books and burned cases (solo practice that does not count) | done | Advice only (changes what "find a case" suggests). Optional visibility to visitors. |
| Interviewed cases (cases you ran as interviewer) | done | Separate table; never counted; optional sharing to members of the case list only. |
| Excel import, Excel export (real MCG workbook), JSON backup, CSV | done | |
| Casebook library: ~872 cases, search while logging, matching review, "cases to try next", weekly plan | done | Library content is private data, not in git (see below). |
| Full solutions (book's own, reworded) for all 872 library cases | done / partial | All 872 are loaded in production (verified 2026-11-13: 872 cases, 872 analyses, 872 solutions). Some write-ups are marked `partial` because the book prints little (about 11 in the last batch; total partial count across all batches not known). Partial cases are not offered in Live case. |
| Exhibits redrawn as charts | partial | Bar, stacked, 100% stack, line, bar+line, pie, scatter, multi-panel. Marimekko, bubble, waterfall, dual-axis, maps, flow diagrams, stacked area and scatter trend lines stay as exact tables. |
| Compare with the book (Claude via Edge Function) | done | |
| Bucket coach: feedback read (Claude via Edge Function) | done | Model `claude-sonnet-5-5` by default. Needs written feedback on at least 3 cases. |
| Live case: Practice, Interview and Learning modes | partial — the two 2026-11-18 pilot runs are fixed and deployed; what is open is what Bucket writes, not whether the engine works | The exhibit audit's four defects shipped earlier (#81 charts drawn, #82 clock sized to the case, #83 interviewer data reachable, #85 soft words no longer hide a book exhibit), as did the interview ladder (#94), no-cut/no-leak exhibits (#95) and a learner's move-on (#119). The picker's exhibits filter (#87/#118) was **reverted** at the owner's request (#124). **The $2 pilot ran on 2026-11-17** — 8 real starts, $0.21 — and found seven things, six of them now shipped: a case with exhibits no longer drops its analytical steps (#128; beats per case 2.98 → 4.86, one-beat cases 171 → 10, planned median 31 → 39 minutes), a result pre-printed on the interviewer's sheet is no longer handed over as data (#129), three wording defects are gone (#131), asking outright for the answer is answered rather than shown as a failure (#142), the brainstorm runs where the book asks (#133), and 17 case prompts no longer talk about the book (#132, live only after the next seed reload). **#128, #129 and #131 were each proved by re-running the exact case that failed**: Boothbucks' close-or-invest step now reaches the member and the feedback no longer marks them down for skipping it. **Not yet proved: #130** (an interview reply confirming the member's guess) — it is deployed on deterministic evidence, and the real-model A/B waits on the function's own limit of 4 starts per account per day. Open: whether a member will sit through a 39-minute median case. Nobody has yet started a Learning case in a browser. **A second pair of pilot runs on 2026-11-18** (5 cents, one interview case with exhibits and one conversation-only case in practice) settled #130 the way the deterministic evidence predicted: across 16 interview replies nothing confirmed a guess, revealed an exhibit early or stated the recommendation, and the interviewer-only table never surfaced. They also reached the feedback turn for the first time — 4 of 5 overall, every rated skill quoting the member verbatim, so the rule that keeps a rating only when the feedback quotes their own writing held against a real model. And they found the one real engine defect of the night: a member scored `partial` every message was never moved on, because the hint and advance gates all required `stuck` and the interview ladder has no `lead` rung (#184). **Deployed 2026-11-18 as function version 24**, with #188 removing the timer-nudge machinery in the same deploy; both verified by downloading the deployed source and diffing it against the merged commit (zero lines). Still open and now better specified: the overall feedback rating is not itself checked against the member's words (#192), a case with no exhibits is handled as if it had them (#193), the part notices read the write-up's own headings aloud (#194), and a handed-in brainstorm or recommendation draws no reply (#195). **The four engine issues the 2026-11-18 pilots found are fixed, merged and deployed** (function deploy from `5036fca`, verified by downloading the deployed source and diffing it against the merged commit: zero differing lines on all three files). **#192** — the overall rating no longer rests on one quote: it survives only when more than half of the skill ratings the model actually claimed are grounded in the member's own words, where the denominator is what the model claimed rather than a fixed six, so a short case is not punished for being short. **#193** — a case with no exhibits is no longer handled as if it had them: the model is told an exhibit was shown only where one really was, the stage is called a discussion when there are none, and the one sentence in every mode's direction directive that told Bucket to *"say you will show them some data"* is swapped on those cases, which turned out to be the deterministic cause of a pilot run promising data that did not exist. **#194** — the book's own numbering no longer survives into a part notice: 101 of 2,621 handed-over topics carried it before, 3 after, all three false positives of a deliberately broad detector. **#195** — a handed-in brainstorm or recommendation is acknowledged by a fixed engine line rather than met with silence; the implementation had to move where the line is said, because a `say` only reaches the screen where a conversation thread is mounted and the thinking and end-of-case screens mount none, so the obvious version would have been written into the transcript and read by nobody. All four are marked **not verified against a real model**: none has been seen in a live case. |
| Levels, XP, weekly quests, skill medals, sticker book, level badge shown to members | done | Level shown to members is on by default; one setting hides all rewards. Warm-up earns no XP. |
| Weekly goal with streak | done | |
| Warm-up mental math | done | Fifteen question kinds, 30/60/120 s, bests synced to account. |
| First-login tour, keyboard shortcuts, installable app | done | No offline mode (no service worker). |
| Demo mode (16 sample cases, in memory only) | done | |
| "Free this week" badge on profiles | not started | Owner said "not now". Overlaps with scheduling; retire or reconsider. |
| Scheduling inside the community (meeting link, propose/confirm/counter/cancel) | done / the success path not verified | The owner approved #98, #99 and #100 and applied both migrations personally: `20261126120000_meeting_prefs.sql` (how a member likes to meet) on 2026-11-18 at 02:51 UTC, and `20261127120000_practice_meetings.sql` (#99: three tables and seven member-callable functions for proposing, confirming, countering, declining, cancelling and moving a practice time) later the same day. Both verified in production by query: RLS on, zero policies, no table grant to `anon` or `authenticated`, internal helpers executable by nobody, member functions by `authenticated` only; `e2e/deployed.e2e.test.ts` passes 12 of 12 against the live schema. **The asker hosts** and their saved meeting link is released only once a time is confirmed and only to the two people on it. One rule was narrowed by the PM rather than the owner: a blocked pair can still *cancel* a settled time, because a block otherwise makes the commitment permanent; everything else is refused in both directions. **#100 (the screens) merged on 2026-11-19 as PR #218** and is live on Vercel: propose up to three times with a length when you ask someone to case, or from a thread; pick one, suggest others, move a settled time or call it off; every instant is stored as UTC and read in each member's own saved zone, with the other person's reading beside it. No migration came with it — `when_text` is kept and no longer written. **One gap worth knowing:** the screens were proved against the in-memory twin and jsdom, not against the live database. A live `npm run test:e2e` on 2026-11-19 (`main` at `5da170a`: 6 files passed / 1 skipped, 60 tests passed / 10 skipped, exit 0) confirms the seven RPCs exist in production, are callable by `authenticated` and refuse bad input, and that the three tables refuse every direct read and write as a member and as a visitor. It calls each RPC only with a non-existent meeting or empty slots, so it does **not** exercise a propose → confirm → counter → cancel round trip: the success path, and the row shapes these screens read, are still unproven. #101 (invite emails with `.ics`) and #102 (reminders) stay `proposed` behind the one unanswered question of whether a `notify-request` email has ever actually landed in an inbox. |
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
