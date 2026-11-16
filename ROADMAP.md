# ROADMAP.md

Written 2026-11-15. **Every item below is "proposed". The order is not a priority; the owner sets priorities.** Each item says where it
came from: **Owner** (the owner asked for it or said "later"), **Docs** (the README or code comments call it a possible later addition),
or **Assistant** (a logical next step the assistant noticed; the owner has not asked for it). Nothing here is built unless it says so.

## Features the owner asked for or deferred

| # | Item | Source | Notes |
|---|---|---|---|
| R1 | "Free this week" badge on profiles, so people do not negotiate times in messages | Owner (picked from an assistant list on 2026-10-31; later said "not now") | Not started. Would be a new profile field and a share switch; must respect the privacy model (member-only?). Open question for the PM: who sees it. |
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
