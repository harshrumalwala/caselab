# ROADMAP.md

## Waiting for the owner (as of 2026-11-17, after the $2 pilot)

Four things need the owner and nothing has been started on any of them. Everything else from the pilot is shipped. Tick these off in
any order; none blocks another.

| # | What | Why it needs you | What happens when you say yes |
|---|---|---|---|
| 1 | **A second library seed reload** | A reload rewrites production content and is your call every time | The content is already fixed and waiting in `private-data/`: #132's 17 case prompts that talk about the book, #143's three row labels, #151's one reference-line label (Soap Co.), #149's 44 interviewer facts that name the book, and 13 further prompts that describe the case without naming the book. None of it reaches a member until a reload. The first reload (2026-11-17) ran clean in 20 parts, counts back at 872 / 872 / 872, `npm run test:e2e` 60 passed / 10 skipped |
| 2 | **The #98, #99 and #121 migrations** | `npx supabase db push` is your call every time | You approved the *shapes* to be written on 2026-11-17 and they queued behind the engine work, which is now done. A developer builds each up to its migration and stops; applying it is a separate yes, after the SQL exists and is tested |
| 3 | **A third throwaway test account** | It is a Supabase dashboard action, not something an agent can do | Dashboard → Authentication → Users → Add user with Auto Confirm, then `CASELAB_E2E_EMAIL_C` / `CASELAB_E2E_PASSWORD_C` in the git-ignored `.env.e2e.local`. Buys 4 more live-case starts a day. Not urgent, but it is the only thing between us and proving #130 on the same day rather than the next one |
| 4 | **#149's remaining 28 sentences** — a decision, not an approval | A judgement about how far to go | 44 of the 72 interviewer facts that named the book are fixed. The other 28 are left because the engine's voice filter already strips them before the member sees anything. Leaving them is defensible and is what the issue asked for; rewriting them too is 28 more sentences on the same reload. Your call |

**The one thing that is shipped but unproven: #130.** An interview reply no longer confirms the member's guess — deployed on 2026-11-17 on
unit tests, the dry-run harness and CI, with **no real-model check**, because both throwaway accounts hit the function's own limit of 4
starts per rolling 24 hours. The honest position until a start frees (2026-11-18 03:05 UTC) is: the half that can be measured
deterministically is fixed; whether a plausible-sounding stuck member now climbs the ladder is unknown. The developer's prediction for the
A/B is recorded in PR #145 and will be reported against line by line. #133, #142 and #150 are shipped and unproven for the same reason.


Written 2026-11-15. **Every item below is "proposed". The order is not a priority; the owner sets priorities.** Each item says where it
came from: **Owner** (the owner asked for it or said "later"), **Docs** (the README or code comments call it a possible later addition),
or **Assistant** (a logical next step the assistant noticed; the owner has not asked for it). Nothing here is built unless it says so.

## Features the owner asked for or deferred

| # | Item | Source | Notes |
|---|---|---|---|
| R1 | "Free this week" badge on profiles, so people do not negotiate times in messages | Owner (picked from an assistant list on 2026-10-31; later said "not now") | Not started. Would be a new profile field and a share switch; must respect the privacy model (member-only?). Open question for the PM: who sees it. Overlaps with scheduling (#98-#102, proposed 2026-11-16); retire or reconsider. |
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
| #86 | A switch to take one case out of live practice | `proposed` — **waiting on the owner** | A migration; deliberately sequenced last, and may prove unnecessary |
| #87 | Say which cases have no exhibits before the member picks one; 285 of 847 are conversation-only | `proposed` | May need a migration; sequence after #85 |

Related existing entries: **R15** (chart kinds we cannot draw) is unaffected — chart coverage measured good, and the live-case
problem was rendering, not coverage. **R34** (check live case at phone width, add an end-to-end test that starts a case) is still
open and still unverified; #81 adds unit coverage but nothing in `e2e/` starts a live case. **R20** (offer partial write-ups in
Learning mode) is unchanged; the 25 partial write-ups stay excluded.

## Front page and scheduling (proposed 2026-11-16)

**Order, set by the owner on 2026-11-17: engine fixes first.** The live-case defects the pilot found (#128, #130, #129) touch members
today; scheduling is capability they do not have yet. The whole chain below waits behind that work.

| Issue | Item | Status | Needs |
|---|---|---|---|
| #96 | Remove the front-page member search; revoke `anon` reads of the public tables; one "people with my link" switch | `proposed` | A migration (owner approves); merge first, then apply |
| #97 | Reset my link (random share token) | **closed, not planned** (owner, 2026-11-17). One permanent link per member, no reset and no revoke; the cost the project is accepting is in DECISIONS.md | — |
| #98 | Preferred meeting link and time zone in Profile | `proposed`; the migration **shape is approved to be written** (owner, 2026-11-17), queued behind the engine fixes. Applying it is still a separate yes | A migration |
| #99 | Database rules for proposing, confirming, countering and cancelling a practice time | `proposed`; same — shape approved to be written, queued behind the engine fixes | A migration |
| #100 | Screens: pick a time inside a request and a conversation; retire `when_text` | `proposed`; after #98, #99 | App only (a migration only if `when_text` is dropped) |
| #101 | Invite emails with `.ics` (stable UID, sequence number) on confirm, change, cancel | `proposed`; after #100 | `functions deploy notify-request`; possibly a migration |
| #102 | Optional reminder email shortly before | `proposed`; after #101; owner to decide it is worth a scheduled job | A scheduler, a migration, possibly a secret |

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
| #130 | An interview reply confirms the member's guess before they have earned it | **done and deployed** (PR #145), **real-model A/B pending** — both throwaway accounts are at 4 starts per 24 hours until 03:05 UTC. Deployed on deterministic evidence as a deliberate trade; see DECISIONS.md. The author's prediction is in the PR and will be reported line by line |
| #133 | The brainstorm always runs last, and a second brainstorm never runs | **done and deployed** (PR #148); 118 brainstorms in 110 cases were out of place, 21 cases have more than one. Unverified on the real model |
| #132 | 17 case prompts talk about the book instead of to the candidate | **fixed in `private-data/` and merged** (PR #146); the audit now fails on the condition. **Takes effect only on the next seed reload**, which is the owner's call |
| #143 #151 | Labels cut to length that the audit could not see (a `belowRows` row label; a reference line's label) | **measurement fixed** (PRs #147, #153). 3 exhibits and 1 exhibit respectively, out of 1,792; the content fixes join the reload batch |
| #149 | The interviewer's own facts name the book, in 50 write-ups (49 live-eligible) | `proposed` — **measure before rewriting**: facts are read out to a member on request, but the engine's voice rules may already strip the phrase |
| #150 | The progress strip never marks Recommendation in a case with no brainstorm | `approved`, in build |
| #86 | A switch to take one case out of live practice | closed, not planned (see DECISIONS.md); the emergency exit is setting one row's `confidence` to `partial` |

**One seed reload is done; a second batch is queued.** The owner approved a reload on 2026-11-17 and it was run: 20 parts, no errors,
counts back at 872 / 872 / 872, `npm run test:e2e` 60 passed / 10 skipped. It carried the Contagion Containment and Bumpers R Us captions
and nine cut exhibit labels.

**Waiting for the next reload, which needs the owner's approval:** #132's 17 case prompts, #143's three `belowRows` row labels, #151's one
reference-line label (Soap Co.), and the 13 further prompts that describe the case without naming the book. They batch on purpose —
teach the measurement first, then measure, then fix the content once; two reloads of a 13 MB seed to save a day is a bad trade.
ROADMAP R21-R23 still apply to the tooling and the backup.

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

