# ROADMAP.md

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

## Front page and scheduling (proposed 2026-11-16: GitHub issues, none approved)

| Issue | Item | Status | Needs |
|---|---|---|---|
| #96 | Remove the front-page member search; revoke `anon` reads of the public tables; one "people with my link" switch | `proposed` | A migration (owner approves); merge first, then apply |
| #97 | Reset my link (random share token) | `proposed`; after #96 | A migration |
| #98 | Preferred meeting link and time zone in Profile | `proposed` | A migration |
| #99 | Database rules for proposing, confirming, countering and cancelling a practice time | `proposed` | A migration |
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
| #128 | A case with exhibits drops every analytical step that has no exhibit (`buildPlan` line 183 is exhibits **or** steps) | `proposed` — **the largest live-case defect found so far**: 502 of 847 cases, 1,567 steps, and the feedback then marks the member down for the step the case never ran |
| #130 | An interview reply confirms the member's guess before they have earned it | `proposed` — guessing works, and it is why the ladder rarely engages. An A/B found interview and practice replies near-identical at the rungs a candidate reaches |
| #129 | A result pre-printed on the interviewer's sheet is handed over as if it were data | `proposed` — predicted word for word by the rubric in DECISIONS.md; `leaks()` cannot see it, because it is paraphrased arithmetic |
| #133 | The brainstorm always runs last, and a second brainstorm never runs | `proposed`; sequence after #128, which decides the ordering rule |
| #132 | 17 case prompts talk about the book instead of to the candidate | `proposed` — **the pilot's only content finding**; needs a seed reload, so it joins the group waiting on the owner |
| #86 | A switch to take one case out of live practice | closed, not planned (see DECISIONS.md); the emergency exit is setting one row's `confidence` to `partial` |

**Content fixes waiting on one seed reload** (put to the owner as a single request on 2026-11-17): Contagion Containment and Bumpers R
Us are candidate exhibits hidden by captions that are wrong in `private-data/` rather than by the rule; seven cases carry an exhibit
label cut to length, which is a shorter line in the write-up and not a bigger cap (measured on a fresh `npm run audit:live`; an earlier
note counted nine labels across these); and #132's 17 prompts. ROADMAP R21-R23 still apply to the tooling and the backup.

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

