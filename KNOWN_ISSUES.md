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
- The Live case lines no longer say "a 35-minute case" (issue #82 sized the clock to how much the case has in it), but Learning mode,
  which has no clock at all, is still only covered in passing at lines 579-581.
- The Tests section does not describe tests for Learning mode.

## Library data pipeline (content lives outside git)

- **Source files are only on the owner's machine.** `private-data/` (about 14 MB: `casebooks/*.json` analyses, `solutions/*.json`
  full solutions) and the generated `supabase/seeds/library.sql` (about 13 MB) are git-ignored by design (`.gitignore` lines 32-33). No
  backup of the source files is known; the loaded copy exists in production. Losing the machine would lose the ability to regenerate
  the seed.
- **The tooling that produced the solutions is not in the repo.** The wave builder, assembler/format checker, overlap checker, seed
  splitter, render test and the instruction files for the reader agents sit in the assistant's temporary scratch folder
  (campaign notes in `CAMPAIGN.md` there). They may disappear when that folder is cleaned. Only `scripts/buildLibrarySeed.mjs`,
  `scripts/librarySeed.mjs` and `scripts/liveCaseAudit.mjs` (the live-case suitability report, issue #84) are in the repo.
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
  The per-exhibit caps are now `SOLUTION_EXHIBIT_LIMITS` and `LIVE_EXHIBIT_LIMITS` (40 columns / 400 rows / 400 chart points), both in that
  file; the live case passes the second to match `readExhibits` in `supabase/functions/_shared/liveCaseCoach.ts`. The two sets are
  kept in step by hand: change one and the other has to be changed with it, or a live exhibit is cut a second time on its way to the screen.
- **Two exhibits lose a chart panel to the 4-panel cap** (found by `npm run audit:live` on 2026-11-16): Lactose King (Fuqua 2025-26)
  exhibit 1 has 5 panels and Sueno Mattress (Booth MCG 2026-2027) exhibit 3 has 6, so the last ones are dropped without a word. Either
  raise the cap or split the exhibit. Nothing else in the 872 write-ups is over any cap.
- **The live-case audit and the dry run need Node 22.6 or newer** (`npm run audit:live`, `npm run dryrun:live`): they import the Edge
  Function's TypeScript with Node's type stripping and restart themselves with `--experimental-strip-types` when the Node they are
  started with has none. `package.json` still says Node 20.19 for the app, which is correct for everything else. Neither can run in CI,
  because `private-data/` is not in git.
- **Node's type stripping refuses some of the app's TypeScript**, so a script cannot import just anything: `src/data/liveCase.ts` uses
  constructor parameter properties in `LiveClient`, which strip-only mode rejects outright. That is why the in-memory live-case deps now
  live in `src/test/memoryLiveDeps.ts` (plain functions, strippable) and `src/test/memoryLive.ts` is only the `LiveClient` wrapper around
  them. Anything a script has to import must stay free of enums, namespaces and parameter properties, and nothing checks that but the
  script failing.
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
- **A busy case is squeezed by the 25-minute ceiling on the exhibit discussion** (`planTimes`, used by `buildPlan` in `supabase/functions/_shared/liveCase.ts`,
  issue #82). The ceiling is today's longest case, which the issue asked not to exceed, so from six beats up every extra beat makes the
  others shorter: 56 of the 847 eligible write-ups have six or more, and at twelve `beatBudget` works out at about two minutes each. If a
  longer case is ever acceptable, the ceiling is the one number to raise.

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

- Whether the "someone said yes" notification email arrives (the owner confirmed the sign-up email flow; whether the "asked you" request email was checked is not known).
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

## Bugs fixed that could come back

Each was found by a real play-through or a visual check and fixed; the risk is that a later change reintroduces it.
- **Live case showed the interviewer's sheet as an exhibit** (PR #70, first real run, "Phighting Phillies"): a table titled
  "Current Revenues and Costs (1 of 2): Revenues" was the interviewer's private sheet. Detection now also reads captions, headings and cells
  ("Keep Private", "interviewee", "the book's solution page", "(Answer ...)"). Risk: a new write-up whose interviewer sheet uses other
  wording will leak to the screen; the opposite error (hiding a candidate exhibit) was judged the safer way to be wrong. Files:
  `supabase/functions/_shared/liveCase.ts` and the live-case tests.
- **Live case hid the only candidate exhibit** (PR #74, "Retire on the House", Fuqua 2018): "Exhibit #1: Current solutions for retirees" was
  hidden because its title contains "solutions". Now "solutions" hides a table only when it is the book's answer. Same files.
- **No exhibit chart was ever drawn in a live case** (issue #81, found by reading the code and measuring the write-ups: 450 of 1,383
  candidate-facing exhibits carry a drawable chart). `ExhibitView` asked the whole-solution parser to normalise a one-exhibit stub with no
  recommendation and no steps, so the parser refused it and the chart silently vanished while the table carried on rendering from the raw
  fields. The exhibit is now read by `parseSolutionExhibit` in `src/domain/bookSolution.ts`. Risk: any future "normalise this fragment"
  call to `parseBookSolution` fails the same silent way. Regression tests in `src/features/live/liveParts.test.tsx`.
- **Hints arrived unprompted** (PR #70) and **Bucket answered "show me the data" with "what do you think?"** (PR #74). Bucket now speaks only
  after the member writes, and on the third stuck message it leads and reads out the data (never the conclusion).
- **The exhibit scrolled out of reach** (PR #70): it is now sticky beside the conversation. Its own PR said it was not checked at phone
  width; the Bucket/lane screens of PR #72 also say phone width was not checked. Not verified since.
- **Haiku replies in Live case may be weaker than Sonnet's** at judging whether a member is stuck and staying in character (PR #71 asks
  to watch for it). If replies degrade, set the `ANTHROPIC_COACH_MODEL` secret to `claude-sonnet-5-5` (no code change) and compare.
- **Bucket's first live run was rejected by the API because of the structured-output format** (README: "this is how a rejected answer format
  was found on the first live run"). Fixed. A change to the answer schema or prompt in `supabase/functions/_shared/feedbackInsights.ts` or
  `caseComparison.ts` should be run once against the real API (the unit tests use a fake model).
- **Parser truncation** cut Copier Co. (48 points), Sunshine Power (61 months) and Circle Bubble (40 rows) until the caps rose to 70 (PR #68).
  Regression tests are in `src/BookSolution.test.tsx` and `src/features/caselog/ExhibitChart.test.tsx`.
- **Chart renderer defects** fixed in PR #68 and PR #77: a line over a stack was stacked as a segment; monthly axis labels overlapped;
  scatter points were labelled "Contract N" and cluttered; long end-of-line labels and footnotes were clipped; sideways-bar category names
  were clipped on the left; clustered bars had no key; a crowded scatter x axis overlapped. All have unit tests in `ExhibitChart.test.tsx`.
- **A chart with a single unlabelled bar disappeared** (Burns Exhibits 2-4, LabCo Exhibit 3): the parser drops empty-string categories,
  so the whole chart was discarded. Give each such bar a short non-empty label.
- **Over-copied write-ups**: three cases (Mobilizing Your World and Mission Eternity at about 11% and 9%, and Digital Expansion / Prescott
  Publishing, whose figure was not recorded) first shared too many seven-word runs with the book; the checker flagged them and the readers
  reworded them to about 1% or less. Anything above about 8% should
  be sent back to be reworded.
- **A stalled or filtered sub-agent run** (stream watchdog, or "output blocked by content filtering policy") several times left complete
  files and once left a partial one (HVAC Service Provider had no `analysis` block and was missing two exhibits). Always validate files, not reports.
- **The library seed returned HTTP 413** when loaded whole; it must be split (see above).
- **The level was invisible to other members** because the share switch started off; it is now on by default (PR #54, #55), and a migration
  switched existing profiles on.
- **The first-login tour's highlight box overlapped the buttons** and the Warm-up and weekly-goal cards were visually broken after a
  restyle (owner reports, 2026-10-31); fixes followed in later PRs (not individually traced here). The tour ring is tested to follow a button that
  moves.
- **The Excel import call to action was shown twice back to back on the front page** ("now we are doing track with excel twice"); fixed
  by giving it one section (PR #9). Watch for repeated calls to action when editing `src/features/public/PublicSite.tsx`.

## Missing tests

- **No end-to-end coverage of Live case** (PR #79 says so: "E2E untouched (no live case coverage there)"). The live-case logic, handler and
  screens are covered by unit tests with a fake model and an in-memory backend, and `live_case_sessions` by PGlite tests, but nothing in
  `e2e/` starts a case against the real function. The Learning-mode screen was not exercised in a browser by its author.
  `npm run dryrun:live` (issue #91) now plays all 847 eligible write-ups from the prompt to the recommendation through the real
  `handleLive`, which closes the "does a case break in the middle?" half of this; what is still missing is a run against the **deployed**
  function with a **real** model, which is the only thing that can say whether Bucket's words nudge or solve.
- **The dry run's candidates are a model of a member, not a member.** They decide `assessment`, `beat_complete` and `direction_clear`
  from the turn kind and a count of their own messages, so every conclusion from the run is about the engine, never about the writing.
  Two harness numbers also shape its verdicts and are not the engine's: the off-track candidate gives up on a beat after 12 messages,
  and a run gives up after 400 turns.
- **Learning mode cannot be finished by a member who neither completes a beat nor presses "move on."** Found by the dry run: there is no
  clock (`isUntimed`) and `nudgeLevel` never reaches `advance` for a learner, so nothing but the member ends a beat. A silent member is
  left at the prompt and a stuck one on beat 1; both can still end the case from the screen. It is the design, so the dry run counts those
  1,694 runs as "open by design" and does not fail on them (`npm run dryrun:live` exits 0 today), but it names them, because whether a
  learner who stops engaging should be moved on is an open product question rather than a settled one.
- **No test calls a real model.** Prompts and answer schemas for Bucket, Compare and Live case are tested against fakes, which is how the
  first live Bucket run found a rejected format. Run a real call after changing a prompt or schema.
- **`e2e/deployed.e2e.test.ts` checks the database** (tables, columns, functions with the right arguments) **but not that the Edge Functions
  are deployed at the current version**; a merged function change that was never deployed (see CLAUDE.md) would not be caught.
- **No visual or snapshot tests** for charts or screens; charts were checked by eye from rendered SVGs.
- **Content is validated by scripts outside the repo**, not by tests: the solution parser (`src/domain/bookSolution.ts`) is tested, but
  whether a write-up is faithful to its book is not.
