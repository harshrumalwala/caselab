# ROADMAP.md

## Waiting for the owner (as of 2026-11-20)

One thing needs the owner, and it blocks no work in progress.

| # | What | Why it needs you | What happens when you say yes |
|---|---|---|---|
| 1 | **#149's remaining 28 sentences** — a decision, not an approval | A judgement about how far to go | 44 of the 72 interviewer facts that named the book are fixed. The other 28 are left because the engine's voice filter already strips them before the member sees anything. Leaving them is defensible and is what the issue asked for; rewriting them too is 28 more sentences on the same reload. Your call |
| 2 | **One line of CLAUDE.md's operations cheat sheet is now wrong** | `CLAUDE.md` is your operating rules; nobody else edits it | `npx supabase db push --remote` refuses from an agent session with `HostedMutationConsentRequiredError` — it cannot show a confirmation prompt — and asks to be re-run with `--yes`. Anyone following the cheat sheet literally hits a failure that reads like a failed push. The fix is a few words. **`--yes` must stay described as how one approved run is expressed, never as part of the command**, or the flag quietly becomes the default and your approval stops being asked for. This is already written up in DECISIONS.md; the cheat sheet itself is yours |

**The profile link no longer depends on People search, and row 2 of this table used to be that question (owner, 2026-11-19; applied 2026-11-20).** Asked whether the two switches should be independent, the owner said **"Yes, decouple"**. The rule turned out to live in six places, not one: a check constraint that physically refused the state, two projection functions (one with *two* gates), the re-projection, and — found last, and invisible to any search of the SQL — two application reads that went through policies which were already correct for the old rule. Shipped as **#246** (the migration, approved by the owner and applied by the coordinating session on 2026-11-20, then verified against the live database by query: constraint gone, both functions correct, and `select count(*) from profiles where not listed and public_profile` returning 0, so nobody's visibility changed), **#249** (a signed-in member following a link-only profile now reads the link view instead of "This member isn't available") and **#248** (the switches and the copy). The reasoning, including why the row level security policies were deliberately *not* widened, is in DECISIONS.md.

**Email delivery is confirmed, and this table is one row shorter for it (owner, 2026-11-19).** The second row used to read "Confirming email delivery", because no agent can see the Resend dashboard or a real inbox and Resend accepting a message is not Resend delivering it. Asked which of the two `notify-request` emails they had seen arrive, the owner answered **both**: the "asked you to case" email and the "said yes" acceptance email have each landed in a real inbox. That was the last unanswered question behind **#101** (calendar invites) and **#102** (reminder emails), so both are unblocked — which is not the same as started, and neither has been. The evidence that preceded it, and what it does and does not settle, is in DECISIONS.md.

**The profile link was opened in a browser for the first time on 2026-11-19, and three real defects came out of it.** Five PRs had
rebuilt that page the same day (#228, #232, #233, #234, #236), every one merged on a green suite, and **none of the three was visible
to any test** — jsdom reports every width and every box as zero, so the suite cannot see a clipped label, a blank gutter or a page
height. What shipped since: **#241** (issue #237) replaced the profile bars with plain DOM, because a fixed pixel gutter inside an
`overflow: hidden` SVG cut the first letters off six of the real industry names at *every* window width, and cut one line of copy that
told the reader how to read the card above it; verified afterwards in a real browser at 375 and 1440 in both themes, 0 clipped
elements. **#240** (issue #239) made the privacy dialog say why the profile-link switch is unavailable, warn before People search
takes a live link with it, and check `public_person` itself rather than trusting the local switches. **#242** (issue #238) is the
restructure the owner asked for twice — one full-width column above 1024 px with the case history as a dense sortable table — and it
is the one with numbers: page 4,004 px → 2,459, blank gutter 2,331 px → 20, cases on one screen about 4 → 14. The reasoning for all
three, and the pattern research behind the table with its caveats, is in DECISIONS.md.

**Both scheduling migrations are now applied.** `20261126120000_meeting_prefs.sql` (#98) went in on 2026-11-18 at 02:51 UTC and `20261127120000_practice_meetings.sql` (#99) later the same day, each with the owner's explicit approval. #99's was verified in production by query rather than by the CLI's word: three tables present, RLS on all three, **zero policies**, `information_schema.role_table_grants` returning no rows for `anon`, `authenticated` or `public`, all seven internal helpers not executable by either role, all seven member functions executable by `authenticated` only, and the migration row present in `supabase_migrations.schema_migrations`. `e2e/deployed.e2e.test.ts` then passed 12 of 12 against the live database — that file exists to catch the live schema disagreeing with the code, and it was red by design until the apply.

**One operational correction, because the cheat sheet is now wrong.** The newer Supabase CLI **defaults to the local stack**: a bare `npx supabase db push` tries `127.0.0.1:54322` and fails with `DbConnectError` instead of touching production. It needs `--remote` (`--linked` still works but warns it goes away in v4). It fails safe, but the error reads like a failed push, and anyone retrying blind from CLAUDE.md's operations cheat sheet would be working from a line that no longer does what it says.

**Done on 2026-11-18.** Eleven pull requests merged. The four live-case engine issues the owner chose as a batch — #192 (the overall rating is kept only when more than half the skill ratings the model actually claimed are grounded), #193 (a case with no exhibits is no longer told to the model as if it had them, and no longer promises data it does not have), #194 (the book's own numbering no longer survives into a part notice) and #195 (a handed-in brainstorm or recommendation is acknowledged) — merged as PRs #206, #207, #208 and #209, then shipped in one `npx supabase functions deploy live-case` from `5036fca`. **The deploy was verified by content, not by the CLI**: the deployed source was downloaded and diffed against the merged commit with line endings normalised, giving zero differing lines on `index.ts`, `_shared/liveCase.ts` and `_shared/liveCaseCoach.ts`. Also merged: #204, #210 and #211 (records), #212 (the coach live check no longer assumes it owns a shared throwaway account), #215 (the interview register's clarify exemption is pinned by a test), #216 (#99's scheduling rules) and #217.

**A number this file and #196 both carried was wrong, and the reason is worth keeping.** #196 was closed recording the audit's third-person prompt rule at **0**. The real figure is **15**. The original measurement had been taken from a checkout eight commits behind main, on which PR #190 — the commit that *added* that detector — did not exist; the flag name was already in the criteria list, so the report printed the line with a 0 beside it. **A rule that does not exist yet reports zero rather than failing**, so a stale tree turns "not measured" into "measured clean". It was caught only because a developer re-ran the audit, got 15, and declined to write the published number down. The figures are reconciled — all 15 sit on cases flagged `not_live_eligible`, so across the 847 live-eligible write-ups the campaign's count really is 0, down from 521 of 577 — and both numbers, with their populations, are now in KNOWN_ISSUES. Issue **#214** proposes printing the commit sha into the audit and dry-run report headers so a report states its own provenance.

Written 2026-11-15. **Every item below is "proposed". The order is not a priority; the owner sets priorities.** Each item says where it
came from: **Owner** (the owner asked for it or said "later"), **Docs** (the README or code comments call it a possible later addition),
or **Assistant** (a logical next step the assistant noticed; the owner has not asked for it). Nothing here is built unless it says so.

## Features the owner asked for or deferred

| # | Item | Source | Notes |
|---|---|---|---|
| R1 | ~~"Free this week" badge on profiles~~ **Retired (owner, 2026-11-17).** It existed so people would stop negotiating times in messages, which is what the scheduling chain (#98-#100) does properly. | Owner | Retired, not deferred: the need is met. |
| R2 | A verified-email "guest tier" between visitor and full member | Owner (2026-10-20: "I'll consider a verified-email guest tier later") | Not started. Membership is defined only by `public.is_member_id()`, so a tier would need a design decision about what a guest can see. |
| R3 | Verify the learning mode of Live case on the live site | Assistant | The session that built it (PR #79) said it had not started a Learning case on production nor confirmed Vercel had deployed. Whether the owner has tried it is not known. |

## Items the docs already describe as possible later work

| # | Item | Source | Notes |
|---|---|---|---|
| R4 | Restrict sign-up to Booth email addresses (or approved domains) | Docs (README step 2) and original spec ("keep the architecture flexible") | Change `is_member_id()` and run `revoke_nonmembers()` once; to stop other-domain sign-ups at creation add a Supabase "Before user created" hook (plan-dependent) or turn sign-ups off. |
| R5 | Wire in CAPTCHA for public sign-up | Docs (README step 2 and Limitations) | Needs a small app change to send the token; the README says to tell the developer before enabling it in Supabase. |
| R6 | One-click unsubscribe endpoint for request emails | Docs (README "No unsubscribe link yet") | Today each email explains the Profile switch. |
| R7 | Warm-up earns XP | Docs (README: "Warm-up doesn't earn XP either, for now") | Would need a calibration decision against the Partner-in-about-100-cases target. |
| R8 | People directory pagination and profile photos | Docs (README Limitations: first 50 per search, no photos) | |
| R9 | Offline use / service worker | Docs (README Limitations) | The README notes installing as an app does not add offline use. |
| R10 | Merge edits made on two devices at once | Docs (README Limitations: last save wins) | Fine for one person; matters if usage spreads. |
| R11 | A rate limit on visitor reads of the public directory | Docs (README Limitations: only Supabase's own limits) | |
| R12 | Member name verification / impersonation protection | Docs (README Limitations) | Restricting sign-up (R4) is the README's suggested fix. |
| R13 | In-app way to review message reports | Docs (README: reports go to a table only the owner can read; "no in-app admin") | |
| R14 | Live (push) messages instead of 5-second polling | Docs (README "Not live") | The README warns never to put these tables in a Realtime publication because Realtime ignores column-level privileges, so this needs a design that avoids that. |

## Casebook content and charts

| # | Item | Source | Notes |
|---|---|---|---|
| R15 | Draw more exhibit chart kinds: marimekko, bubble size, waterfall, dual axis (secondary-scale lines), stacked area, scatter trend lines, maps, flow diagrams; also stacked-horizontal bars | Docs (README lists marimekko, bell curves, flow diagrams, maps as tables) and the assistant's campaign notes | They currently stay as exact tables. Several exhibits across the batches hit this (the exact number was not counted). |
| R16 | Chart cosmetics: crowded category labels on some bar charts, mirrored axis on one scatter, an overlapping end label on one line chart, secondary-axis lines drawn on the left scale | Assistant (found while checking renders) | See KNOWN_ISSUES.md for the specific cases. |
| R17 | Write up the second, unnamed bank case in the Haas casebook's "Types of Cases" section | Assistant (a reader reported it was not written up) | Whether it is a distinct library case is unknown. |
| R18 | Find out which one entry in the assistant's list of 807 cases still needing solutions had no PDF, and cover or retire it | Assistant | Production already shows 872 solutions for 872 cases, so the gap may be a duplicate entry; not investigated. |
| R19 | A process for new casebooks each recruiting year (for example 2027 books) and for the IESE 2021 book that was never supplied | Docs (README: "IESE 2021 was not supplied"); Assistant for the yearly process | |
| R20 | Offer partial write-ups in Learning mode (they are excluded from Live case) | Assistant | Partial write-ups hold only an approach or a situation; a learning conversation might still be useful. This is an idea, not a request. |

## Engineering and process next steps (assistant-proposed)

| # | Item | Source | Notes |
|---|---|---|---|
| R21 | Put the casebook-solution tooling under version control (split-seed script, wave builder, assembler/checkers, instruction files) | Assistant | Today these live in a scratch folder outside the repo. |
| R22 | Make the library seed loadable with one command (split and load in order) instead of a hand process | Assistant | The README's `supabase db push --include-seed` no longer works at the current ~13 MB size. |
| R23 | Back up `private-data/` | Assistant | It is git-ignored, 14 MB on the owner's machine; production holds the loaded copy but no other copy of the source files is known. |
| R24 | Refresh README numbers and claims that went stale (test count, library coverage, live case partial counts) | Assistant | Listed in KNOWN_ISSUES.md. |
| R25 | Add a linter and a `lint` script to CI | Assistant | None exists; the developer role file mentions running lint. |
| R26 | Speed up or split the unit suite | Assistant | See KNOWN_ISSUES.md (about 15 minutes locally; one run had 10 failures that passed on rerun). |
| R27 | Create the `proposed` and `approved` labels on the GitHub repo and decide whether to commit the agent files | Assistant | The agent files now use `gh`, but the repo has neither label yet (only GitHub's defaults), and `.claude/` is git-ignored. See KNOWN_ISSUES.md "Process". |
| R28 | Read back real live-case costs and compare with the README estimate (under 10 cents a case; about 3 cents per Bucket read) | Assistant | Usage is stored per case but no one has reported reading it. |
| R29 | Review the sticker icons and symbols | Owner asked on 2026-11-02 "did we use correct symbols/icons for all the stickers or is there something we could do better?" | The assistant's answer and any change are not recorded in what it could see; unsure whether anything changed. |
| R30 | Untracked `tsconfig.tsbuildinfo` is showing in `git status` | Assistant | Either ignore or stop generating it. |

## Added after re-reading the docs (all proposed; none requested unless the source says so)

| # | Item | Source | Notes |
|---|---|---|---|
| R31 | Compare Bucket reads on Haiku 5.5 and Sonnet 5.5 side by side using real feedback, then decide the default | Owner discussion 2026-11-09 (the assistant offered to write the script; the owner chose Sonnet "for now") | Estimated cost on Haiku is about 20 times lower. Not run. |
| R32 | An optional per-member monthly limit on Bucket reads, shown on the card ("3 coaching reads left this month") | Assistant, offered to the owner 2026-11-09; no decision recorded | A cost cap that does not depend on the Console spend limit. |
| R33 | Confirm a monthly spend limit is set in the Anthropic Console | Assistant, recommended 2026-11-09 | Owner action; whether it was done is not known. |
| R34 | Check the Live case screens at phone width and add an end-to-end test that starts a case | Assistant (PR #70, #72, #79 each say phone width or the live path was not checked) | |
| R35 | Read the school's terms on sharing casebooks | Assistant caution to the owner 2026-11-09 | Owner action; the library stores only our own write-ups. Outcome not known. |
| R36 | Add an automated check that the deployed Edge Functions match the repo | Assistant | See KNOWN_ISSUES.md "Missing tests". |

## Live-case exhibit audit (2026-11-15): now tracked as GitHub issues

The owner asked for a review of every exhibit for live-case suitability. The PM agent measured all 872 write-ups against the
production rules; the findings and the reasoning are in DECISIONS.md under "Live-case exhibit audit". These replace vague roadmap
entries with issues, in the order they should be done.

| Issue | Item | Status | Needs |
|---|---|---|---|
| #81 | Live case never draws a chart (`ExhibitView` calls `parseBookSolution` without a recommendation or steps, so it always returns `null`); 450 candidate exhibits carry a drawable chart | `approved` | App only; Vercel deploys on merge |
| #82 | Time the case to how much it has in it; 172 of 847 cases have one beat but a 20-minute exhibit stage | `approved` | `functions deploy live-case` |
| #83 | The interviewer's data is unreachable outside an open exhibit beat, and only 2 of 369 hidden tables are classed as data to hand over | `approved` | `functions deploy live-case` |
| #84 | A repeatable live-case suitability report that imports the real production rules (partly covers R21) | `approved` | Script only |
| #85 | Numbered book exhibits hidden by a single soft word (`expected`, `calculation`, `math`, `sample`, `approach`, `answer`); 103 exhibits affected | `approved` | `functions deploy live-case` |
| #192 | The overall rating is not checked against the member's own words | **done and deployed** (PR #206); kept only when more than half the skill ratings the model actually claimed are grounded. Unverified against a real model |
| #193 | A case with no exhibits is handled as if it had them | **done and deployed** (PR #208); the model is told an exhibit was shown only where one was, the stage reads as a discussion, and the directive sentence that told Bucket to say it would show data is swapped on those 246 cases. Unverified against a real model |
| #194 | The part notices hand over the write-up's headings with the book's numbering | **done and deployed** (PR #207); 101 of 2,621 handed-over topics carried numbering before, 3 after, all three false positives of a broad detector. The cumulative-outline question was ruled "leave it" and is in DECISIONS.md |
| #195 | A handed-in brainstorm or recommendation draws no reply | **done and deployed** (PR #209); a fixed engine line, no model call. Unverified against a real model |
| #86 | A switch to take one case out of live practice | `proposed` — **waiting on the owner** | A migration; deliberately sequenced last, and may prove unnecessary |

All four shipped in one `npx supabase functions deploy live-case` from `5036fca`, verified by downloading the deployed source and diffing it against the merged commit (zero differing lines on `index.ts`, `_shared/liveCase.ts` and `_shared/liveCaseCoach.ts`).
| #87 | Say which cases have no exhibits before the member picks one; 285 of 847 are conversation-only | `proposed` | May need a migration; sequence after #85 |

Related existing entries: **R15** (chart kinds we cannot draw) is unaffected — chart coverage measured good, and the live-case
problem was rendering, not coverage. **R34** (check live case at phone width, add an end-to-end test that starts a case) is still
open and still unverified; #81 adds unit coverage but nothing in `e2e/` starts a live case. **R20** (offer partial write-ups in
Learning mode) is unchanged; the 25 partial write-ups stay excluded.

## Front page and scheduling (proposed 2026-11-16)

**Order, set by the owner on 2026-11-17: engine fixes first.** The live-case defects the pilot found (#128, #130, #129) touch members
today; scheduling was capability they did not have yet. That order has now run its course: the engine fixes shipped, and #98, #99 and
#100 shipped behind them, so a member can agree a practice time in the app as of 2026-11-19. What is left of the chain is #101 and #102.

| Issue | Item | Status | Needs |
|---|---|---|---|
| #96 | Remove the front-page member search; revoke `anon` reads of the public tables; one "people with my link" switch | done — merged 2026-11-17 (PR #116); migration 20261124120000 applied with the owner's approval. Detail in the PRODUCT.md feature table | A migration (owner approves); merge first, then apply |
| #97 | Reset my link (random share token) | **closed, not planned** (owner, 2026-11-17). One permanent link per member, no reset and no revoke; the cost the project is accepting is in DECISIONS.md | — |
| #98 | Preferred meeting link and time zone in Profile | done — merged (PR #182); migration 20261126120000 applied by the owner on 2026-11-18 at 02:51 UTC. Nothing further is waiting on the owner for this row | A migration |
| #99 | Database rules for proposing, confirming, countering and cancelling a practice time | built and merged (PR #216); migration 20261127120000 applied by the owner on 2026-11-18 and verified in production | A migration |
| #100 | Screens: pick a time inside a request and a conversation; retire `when_text` | done — merged 2026-11-19 (PR #218), closed COMPLETED. No migration: `when_text` is kept and simply no longer written, and rows that still have one show it read-only. The screens themselves are proved against the in-memory twin and jsdom only. A live `npm run test:e2e` on 2026-11-19 (`main` at `5da170a`, 60 passed / 10 skipped, exit 0) confirms the seven RPCs exist in production, are callable by `authenticated` and refuse bad input, and that the three tables stay closed — but it calls them only with a non-existent meeting or empty slots, so a real propose → confirm → counter → cancel round trip, and the row shapes the screens read, are **still unproven** | App only (a migration only if `when_text` is dropped) |
| #101 | Invite emails with `.ics` (stable UID, sequence number) on confirm, change, cancel | `proposed`; after #100. **Unblocked on 2026-11-19**: the email-delivery question it was held behind is answered, so no owner decision stands between this and being started. Not started, and if it turns out to need a migration that apply is still the owner's call | `functions deploy notify-request`; possibly a migration |
| #102 | Optional reminder email shortly before | `proposed`; after #101. **Unblocked on 2026-11-19** for the same reason; the owner still has to decide it is worth a scheduled job. Not started | A scheduler, a migration, possibly a secret |

| # | Item | Source | Notes |
|---|---|---|---|
| R37 | **Phase 2: connect Google and Microsoft calendars** (free/busy, availability, automatic event and Meet/Teams link creation) | Assistant, following the owner's request of 2026-11-16 ("reflect on their calendar"). **Deliberately not an issue yet.** | Needs the phase-1 results first. Open questions, each needing a check of the **current** platform documentation before anyone commits (the statements below are not verified): (1) Google OAuth verification: calendar scopes are, I believe, sensitive and may need app verification and a privacy review, and an unverified app may be limited to test users; (2) Microsoft school tenants often block third-party consent unless an admin approves, and whether Booth's tenant would is not known; (3) secure storage of refresh tokens, a new class of secret the project has none of (encrypted in the database or Supabase Vault, deleted with the account, revocable); (4) the availability UI (showing free/busy to a partner without exposing event details); (5) time zones, daylight-saving boundaries and recurring events; (6) the testing cost: real Google and Microsoft accounts and tenants, no CI coverage possible, and the privacy review. Revisit only if phase 1 proves people actually schedule in the app. |


## Live-case programme: where it stands after the $2 pilot (2026-11-17)

Every defect the exhibit audit found is shipped and deployed, and the real-model pilot has now run. The pilot found more than the audit
did, and in a different place: the engine and the prompt, not the data. What remains is listed here so the next session starts from the
state of the world rather than from the audit's original list. The evidence for every pilot row is in DECISIONS.md, "The $2 interview
pilot, run on 2026-11-17".

| Issue | Item | Status |
|---|---|---|
| #81 #82 #83 #85 | The four audit defects (charts never drawn, one-size clock, unreachable interviewer data, soft-word hiding) | **done and deployed**; #85 deployed 2026-11-17 and verified by downloading the deployed source and diffing it against the merged commit |
| #84 #91 | The suitability report and the scripted dry run | **done**; both run free, both were re-run on both sides of every change today |
| #94 | Interview mode nudges rather than rescues (its own ladder, no `lead` rung) | **done and live** in function version 11 |
| #95 | No exhibit reaches a member cut; no interviewer artefact ever reaches them | **done** (PR #117): 1,792 exhibits compared write-up to screen, 0 cut; 10,164 runs, 12,766 exhibits, 0 leaks |
| #87 | Conversation-only cases are labelled before the member picks | **shipped (PR #118) and then reverted the same day (PR #124)**, at the owner's request: how a write-up is built is not the member's concern when picking a case. The `exhibits` action and `hasExhibitBeats()` went with the screen. See DECISIONS.md |
| #119 | A learner who writes nothing cannot move on (one disabled button, both ends) | **done and deployed** (PR #127): "Move on" is live from the moment the exhibit appears in learning mode, and the server accepts it |
| #125 | A runner for real-model pilot cases, with the spend read from the database and a hard cap | **done** (PR #126), `npm run pilot:live`. One defect found on first contact with production and fixed the same day (#134, PR #135) |
| the $2 pilot | Real-model interview runs: does Bucket nudge or solve? | **done, 2026-11-17: 6 starts, $0.1485 of the $2.00.** Four complete interview cases from the two newest books, one practice/interview A/B, one verification run. Findings are #128-#134 below |
| #131 | Three wording defects in Bucket's replies (third person, "the case says", `advance` summarising) | **done, deployed and verified on the real model** (PR #136): the same rung on the same case now says only "Let's move on to the next piece." |
| #128 | A case with exhibits drops every analytical step that has no exhibit | **done, deployed and proved on the real model** (PR #141). Beats per case 2.98 → 4.86, one-beat cases 171 → 10, planned median 31 → 39 min. Boothbucks' close-or-invest step reaches the member and the feedback no longer marks them down for skipping it |
| #129 | A result pre-printed on the interviewer's sheet is handed over as if it were data | **done, deployed and proved on the real model** (PR #138). The turn that volunteered a computed $8B now reads out only the inputs; #83's handover is not regressed |
| #131 | Three wording defects in Bucket's replies | **done, deployed and proved on the real model** (PR #136). `advance` now says only "Let's move on to the next piece." |
| #142 | Asking outright for the answer showed the failure message | **done and deployed** (PR #144); unverified on the real model |
| #130 | An interview reply confirms the member's guess before they have earned it | **done and deployed** (PR #145); deployed on deterministic evidence as a deliberate trade (see DECISIONS.md), then **settled on the real model by the 2026-11-18 pilot runs**: across 16 interview replies nothing confirmed a guess |
| #133 | The brainstorm always runs last, and a second brainstorm never runs | **done and deployed** (PR #148); 118 brainstorms in 110 cases were out of place, 21 cases have more than one. Unverified on the real model |
| #132 | 17 case prompts talk about the book instead of to the candidate | **done and live** (PR #146); the audit now fails on the condition. The content has been in production since a reload that preceded the second one |
| #143 #151 | Labels cut to length that the audit could not see (a `belowRows` row label; a reference line's label) | **done and live**: measurement fixed (PRs #147, #153), 3 exhibits and 1 exhibit respectively out of 1,792, and the content fixes are in production |
| #149 | The interviewer's own facts name the book, in 50 write-ups (49 live-eligible) | **closed**; measured first, 44 of 72 sentences rewritten and live. The other 28 are left because the voice filter already strips them; whether to rewrite those too is item 2 in "Waiting for the owner" at the top |
| #150 | The progress strip never marks Recommendation in a case with no brainstorm | **done** (PR #152) |
| #86 | A switch to take one case out of live practice | closed, not planned (see DECISIONS.md); the emergency exit is setting one row's `confidence` to `partial` |

**Both seed reloads have run.** Production holds 872 `library_cases` / 872 `library_case_notes` / 872 `library_case_solutions`, and the
content the issues above produced (#132, #143, #151, #149 and the 13 further prompts) is live. Nothing in this section is waiting for a
reload; what is still waiting for the owner is the table at the top of the file. ROADMAP R21-R23 still apply to the tooling and the backup.

**What the pilot cost, for anyone planning the next one.** A whole interview case, prompt to Sonnet feedback, is about **$0.03** — a
third of the README's estimate. The binding constraint is not money but **4 live-case starts per account per day** (`MAX_STARTS_PER_DAY`),
counted by the row existing rather than by the run finishing, so a crashed run still costs a start. Two throwaway accounts give 8 a day.
Two starts and $1.85 of the pilot's budget are unspent.

## The public profile link (added 2026-11-17; both proposed)

| # | Item | Source | Notes |
|---|---|---|---|
| #120 | Tell a visitor what kind of case to give this person next: coverage plus the member's own written improvement focus | Owner, 2026-11-16 | Browser-side arithmetic over rows `public_person_cases(id)` already returns. No migration, no new switch, no model call. Uncontroversial half of the request |
| #121 | Show what a member is sharpening, and their strengths, from the scores they already share | Owner, 2026-11-16 | #120 shipped (PR #123). The contentious half: a judgment about a named person on a page anonymous people read. **The owner chose a separate off-by-default switch**, overruling the PM's "no new switch", so this now needs a migration and is in the batched approval request of 2026-11-17. The framing stance and the reason are in DECISIONS.md |

## Added after the colour audit (2026-11-16; all proposed)

| # | Item | Source | Notes |
|---|---|---|---|
| R38 | Draw striped, hatched and dotted fills as the book does (instead of one plain colour) | Assistant, from the colour audit (Salty Sole Shoe, Health Coaches, Kid Country, MedTrans, Small Drug Manufacturer) | Needs an SVG pattern per fill and a spec field for it. |
| R39 | Add the book's missing line series (a teal Capacity line on Run of the Mill, a crimson viewership line on News Co) and a band for Soap Co's 10-15% leader share | Assistant, from the colour audit | Data additions plus, for the band, a renderer feature. |
| R40 | Check the clustered-bar, line, pie and scatter charts for colours, highlights and lines against the book, as was done for the stacked charts | Assistant | About 450 further chart panels; same reader pipeline. |

