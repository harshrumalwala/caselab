# KNOWN_ISSUES.md

Written 2026-11-15. Bugs, shortcuts, workarounds, missing tests and fragile spots, with the files involved. "Not verified" means the
assistant saw a claim (for example a build session's report) but did not check it itself. Items are not ranked.

## Documentation that has gone stale

`README.md` is detailed and mostly current, but these statements no longer match reality:
- Line 702: "about 170 tests". On 2026-11-13 the unit suite had 89 files and 1,226 tests.
- Line 358 (and the "Full solution" paragraph near line 363): says about 250 cases carry an analysis and that full solutions exist only
  for the Booth MCG casebook and the co-chairs' picks. As of 2026-11-13 production holds 872 cases, 872 analyses and 872 solutions.
- Line 596: "the 10 of 346 marked partial are left out" and "36 of 336" are old counts; current counts were not recomputed.
- Line 371: `supabase db push --include-seed` will not work for the current seed (see "Library data pipeline").
- Lines 9 and 577 describe Live case as a timed 35-minute case; Learning mode (merged later in PR #79) has no clock. Line 579-581 cover it.
- The Tests section does not describe tests for Learning mode.

## Library data pipeline (content lives outside git)

- **Source files are only on the owner's machine.** `private-data/` (about 14 MB: `casebooks/*.json` analyses, `solutions/*.json`
  full solutions) and the generated `supabase/seeds/library.sql` (about 13 MB) are git-ignored by design (`.gitignore` lines 32-33). No
  backup of the source files is known; the loaded copy exists in production. Losing the machine would lose the ability to regenerate
  the seed.
- **The tooling that produced the solutions is not in the repo.** The wave builder, assembler/format checker, overlap checker, seed
  splitter, render test and the instruction files for the reader agents sit in the assistant's temporary scratch folder
  (campaign notes in `CAMPAIGN.md` there). They may disappear when that folder is cleaned. Only `scripts/buildLibrarySeed.mjs` and
  `scripts/librarySeed.mjs` are in the repo.
- **The seed is too large for one request.** The database API rejects requests above about 1 MB (HTTP 413). The seed has to be split and
  loaded part by part; the README does not say so. Ordering matters: non-solution statements first, solution inserts after.
- **Manual data patches exist only in the assembled files.** For example `pointLabels: false` was set by hand on the Copier Co. scatter and
  on the Paterno Mutual "Figure 2" scatter, and one Part B takeaway in Electric Battery Manufacturer was reworded, directly in
  `private-data/solutions/*.json`. Re-assembling from the reader outputs would silently undo them.
- **`buildLibrarySeed.mjs` reads every `private-data/casebooks/*.json` except `*.index.json`** and every `private-data/solutions/*.json`;
  a file with the wrong name or shape is either picked up wrongly or ignored. The new-analysis files are named `solutions-waveN.json`.
- **The parser silently truncates oversized content.** `src/domain/bookSolution.ts` caps: exhibits 12, columns 16, rows 70, chart
  points/categories 70, structure buckets 8, clarifying questions 5, takeaways 3, panels 4. Empty-string chart categories are dropped, so a
  single unlabelled bar needs a non-empty label or the chart disappears. Content over the caps is cut without an error.
- **One case name in the work list had no PDF** (806 of 807 were assigned). Production shows 872 solutions for 872 cases, so it may have
  been a duplicate, but which entry it was has not been checked.
- **Generic case names can merge different cases** into one library entry (README line 356).

## Content quality and policy risks

- **About 11 write-ups in the last batch are marked `partial`** because the book prints only an approach, a situation or open questions
  (for example Telekenesis Inc., Roane & Hickey, Super-Regional Bank Commercial Case Study, Consulting Firm (2), Castor Manufacturer,
  Skyscraper, Stopped at the 3-Yard Line, and several Fuqua 2002 short cases). The total across all batches was not counted. Partial cases
  are excluded from Live case.
- **Scanned books were read from page images.** Fuqua 2002 and some older books have no usable text layer, so for those the "own words"
  overlap check (7-word runs) was run against a reader's own transcription, not the book's text. The reader agents' reports say so; the
  check is only as complete as the transcription. The overlap threshold also changed: the checker flagged above 8% throughout, while the
  reader prompt asked for under 3% only in later batches (the exact batch was not recorded). Earlier batches were not re-checked at the
  stricter level.
- **Printed figures that do not reconcile are reproduced as printed** (owner's no-slips rule), so members can see numbers in Part A that
  look wrong (reported examples: Blood Bank "nearly 100%" for a $17.50 rise on a $100 price; Cash Rich energy company "6% of $2M" against
  a stated 1%; State Social Services $12,000 against its own $12,500; All-Mart 14.24B against 11.34B + 3B). These are deliberate.
- **Chart values are approximate where the book prints none** (flagged `approx` and shown as approximate), read from page images.
- **Chart cosmetics not fixed** (all in `src/features/caselog/ExhibitChart.tsx` or the data): a Brazil scatter whose x axis runs the
  opposite way to the book's inverted axis (a footnote says so); a LabCo panel heading cut at 60 characters; Biopharma-style secondary-axis
  lines drawn on the left scale; crowded category labels on the Giant Bank "Rating" bar-and-line chart; an end label ("New York")
  overlapping the 80% value labels on the EasyNAV utilization line chart; FormCo Exhibit 2, whose stack order differs by column in the book
  but is drawn in one order; an orange line drawn yellow because the allowed palette lacks orange.
- **Exhibit chart kinds we cannot draw** stay as tables: marimekko, bubble size, waterfall, dual axis, maps, flow diagrams, stacked area,
  scatter trend lines, stacked horizontal bars.
- **No visual regression tests for charts.** The render check (a temporary test that draws every chart to SVG, then a contact sheet) lives in
  the assistant's scratch folder, not in the repo. `src/features/caselog/ExhibitChart.test.tsx` covers specific behaviours only.
- **Live case hides interviewer-only tables by heuristic** (titles and wording in `supabase/functions/_shared/liveCase*.ts`); the README
  accepts that a candidate exhibit might be hidden (the "safer way to be wrong").

## Tests and CI

- **The full unit suite is slow and had one bad run.** On 2026-11-13 a full `npm test` run took about 950 seconds (86 workers) on the owner's
  machine. One full run reported 10 failed tests and 3 errors; a second full run passed all 1,226. The failures were not investigated;
  load-related timeouts are suspected, not confirmed. Heavy work running at the same time (a render test, other test runs) may have
  contributed. Use `npx vitest run <file>` for single files.
- **No linter** exists (`package.json` has no `lint` script); CI (`.github/workflows/ci.yml`) runs typecheck, tests and build only.
- **`npm run test:e2e` talks to the real (production) Supabase project** in `.env.local` using accounts in the git-ignored
  `.env.e2e.local`. It creates and removes rows titled `ZZ CaseLab e2e ...`. It is not part of CI. It broke once because
  `e2e/app.e2e.test.tsx` looked for the old front-page headline ("Case smarter"); fixed in PR #78 to look for "Case with Bucket".
  Tests that match on marketing copy will break when copy changes.
- **Throwaway e2e accounts are listed while the suite runs** (a few minutes) and then unlisted. A check that no "E2E..." names appear in
  Community → Members was left to the owner and is not verified.
- `tsconfig.tsbuildinfo` shows as untracked in `git status` (not ignored).

## Production, security and operations

- **`live-case` and `notify-request` run with `verify_jwt = false`** (`supabase/config.toml`) and check the sign-in inside the function.
  If that check were removed, the functions would be open. `live-case` was reported (by the session that built the "move on" change) as
  deployed as version 6 with the check still off; later versions were deployed too. The deployed state versus the repo was not
  checked by this documentation pass.
- **The Learning-mode change (PR #79) was merged and its Edge Function deployed by the session that built it.** That session's report
  said it had not started a Learning case on the live site and had not confirmed that Vercel deployed the merge. This documentation
  pass did not see the owner's approval for that merge and deploy (the report did not mention it). Not verified.
- **CAPTCHA is not wired in** for public sign-up; abuse protection is Supabase's built-in rate limits (README step 2 and Limitations).
- **Public directory has no rate limit** beyond Supabase's own; anything a member makes public can be scraped.
- **Messages are not end-to-end encrypted**; reports sit in a table that only the Supabase dashboard can read, with no in-app admin.
- **Display names are not verified.**
- **Edits on two devices at once**: last save wins. The tour is remembered per browser. No offline mode.
- **Live-case and Bucket costs are estimates** (README: under 10 cents a live case, about 3 cents per Bucket read). Real usage is
  stored per live case but no one has reported reading it back.
- **Supabase CLI deprecation warnings**: `--linked` is deprecated (use `--remote`), and `supabase/config.toml` still uses
  `auth.email.enable_signup` and `auth.sms.enable_signup`, which the CLI says will be removed in v4.
- **Windows PowerShell blocks `npm`/`npx` scripts** by default execution policy (the owner hit this); use `cmd.exe` or change the policy.
- **Migration order matters**: the app expects the newest tables, so a migration must be applied before the app version that needs it
  is deployed. `e2e/deployed.e2e.test.ts` checks that the live database matches the code.

## Unverified user-side checks left open

- Whether the "someone said yes" notification email arrives (the "asked you" email path and sign-up email were checked by the owner).
- The first real Bucket read on the owner's own feedback (needs written feedback on at least three of their cases).
- Whether Learning mode works end to end on the live site (see above).

## Process

- **The PM and developer agent files are converted to GitHub** (`gh`, pull requests) and saved in `.claude/agents/pm.md` and
  `.claude/agents/developer.md`, but `.claude/` is git-ignored (`.gitignore` line 29), so they exist only on the owner's machine and are
  not in the repository.
- **The labels the workflow depends on do not exist yet.** `gh label list` (2026-11-15) shows only GitHub's default labels, with no
  `proposed` or `approved`. The PM file tells the PM to create `proposed` if it is missing; `approved` is the owner's label and someone has
  to create it.
- **The developer file tells the developer to run "the lint command from CLAUDE.md"**, but there is no lint command (see Tests and CI).
- **Where the agents would find these documents**: `PRODUCT.md`, `ROADMAP.md`, `DECISIONS.md`, `KNOWN_ISSUES.md` and `CLAUDE.md` were
  created at the repo root on 2026-11-15 and are not yet committed.
