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
- **Book chart features we still do not draw.** Dashed reference lines (`referenceLines`) and highlighted bars (`highlight`) exist since the
  PR that added them, but they are set by hand per chart: only Circle Bubble (80% line, top 25 customers in orange), Swagger Llamas (average
  line) and Thrill Park (average line) use them so far. Charts whose notes mention a line we cannot place: Soap Co. (a 10-15% band),
  Yarmouth Yachts (two dashed vertical lines marking a period), the dotted "performance" line in the Tacotle charts (drawn as a plain line),
  and the trend line in Bio-Product Growth. **No one has compared all ~480 charted exhibits with the book pages**, so other differences
  (colours, highlighted bars, lines that our notes never mention) are likely. Those patches are made directly in `private-data/solutions/*.json`
  and would be undone by re-assembling from the reader outputs.
- **Series colours are drawn but almost none are set** (issue #106). Bars and stack segments now take the `color` on their series, and stacks and
  clustered bars get a key, but across the 872 write-ups only 9 bar or stack series carry a colour (DrugStop Co. Exhibit 1, Global Health
  diarrhoeal disease, Polar Bear Pool Float Exhibit 1), so nearly every chart is still in greys. Circle Bubble Exhibit 2 has none yet: it gets
  its key now, and its orange / navy / teal once the main session patches `private-data/solutions/*.json` (palette names accepted: red, blue,
  yellow, green, black, gray, orange, purple, navy, teal, or a hex value). The key lists series left to right and is not ordered to match a
  stack from top to bottom. A stack with `segmentNames` gets no key, but a segment under 14 px tall prints no name, so a very thin segment in
  such a stack is unnamed (not checked across the data). The pie slices and scatter points ignore series colours.
- **Colour audit of stacked charts (2026-11-16; owner approved; loaded to production).** Readers compared 102 exhibits (114 stacked panels) with the
  book pages and recorded series colours: 97 panels in 69 cases now carry them. What is still not right: (1) where the book uses two or more shades
  of one hue (26 panels, for example light and dark blue), the repeat got a lighter tint chosen by rule, not matched to the book, so a pair can be
  the wrong way round; (2) striped, hatched or patterned fills (Salty Sole Shoe, Health Coaches, Kid Country and others) are drawn as plain
  colours or greys; (3) 15 panels are greyscale in the book and stay grey; Busch's Barber Shop panel 1 (the book colours by bar, not by series) and
  Green Dreamz Exhibit 1 (five purple shades, low confidence) were skipped; (4) two line series the book draws are not in our data: a teal Capacity
  line on Run of the Mill and a crimson viewership line on News Co; Soap Co's dashed 10-15% leader line is a band we cannot draw; (5) the colour
  names are our palette's nearest match (for example a periwinkle recorded as purple). Only the 102 exhibits with uncoloured, unnamed stacked
  panels were checked: clustered-bar and other charts were not compared with the book. The readers' category counts in their notes compared the
  book with a job file that listed only the first eight categories, so ignore their "our list stops at ..." remarks.
- **Exhibit chart kinds we cannot draw** stay as tables: marimekko, bubble size, waterfall, dual axis, maps, flow diagrams, stacked area,
  scatter trend lines, stacked horizontal bars.
- **No visual regression tests for charts.** The render check (a temporary test that draws every chart to SVG, then a contact sheet) lives in
  the assistant's scratch folder, not in the repo. `src/features/caselog/ExhibitChart.test.tsx` covers specific behaviours only.
- **Live case hides interviewer-only tables by heuristic** (titles and wording in `supabase/functions/_shared/liveCase*.ts`); the README
  accepts that a candidate exhibit might be hidden (the "safer way to be wrong").
- **Whether a Live case table is "our transcription" is judged by reading the table** (`tableRepeatsChart`, `src/domain/liveExhibit.ts`, issue #105), because no exhibit in the data is flagged as a transcription or a book table. Measured on 2026-11-16 over the 450 charted exhibits a candidate sees: 354 lose their table, 96 keep it. The rule errs toward keeping, so some of the 96 are our own transcription left on screen (about 20 approximate exhibits with a cell the chart does not print, such as a derived total, and 4 that differ by a word) and 35 are kept only because the chart's rows of text under its axis (`belowRows`) do not count as the chart showing a figure. Hiding those 35 as well is one line (count `belowRows` in `collect`), but it would hide DigiBooks "Exhibit A: Market segments", which the owner asked to protect. The reverse error (a book table hidden) was looked for in the hidden set and not found, but the check is by reading figures, not against the books. Run it again after new write-ups are loaded.
- **Whether a hidden table is data or the book's working is also decided by a heuristic** (`givenOnRequest` in
  `liveCaseCoach.ts`, widened in issue #83: 18 of the 369 hidden tables in live-eligible cases are classed `onRequest`, up from 2).
  It reads the title and the caption for who hands what over and when, and refuses anything that also calls itself a solution, a
  working, a calculation or a completed table, or that shows the book's arithmetic in a cell. **The middle it cannot settle** is the
  table that is plainly input data but is described as "printed on the book's solution page" (measured example: the "Market Size
  (2023-2026)" chart table in the AI case). Those stay `reference`, where the input figures are still read out on request and a result
  never is, so the cost of being wrong is small — but an explicit `audience` field on each exhibit in `private-data/` would settle it
  properly, at the price of regenerating and reloading the 13 MB seed (the owner's call; not done).
- **"Never read out the row that is the answer to the open beat" is prompt-only.** Nothing in code can tell that "Profit per customer:
  $4.20" is the answer while the open beat is profit per customer, so the rule lives in the directive and in the notes around each
  table (`NOT_THE_ANSWER` in `liveCaseCoach.ts`). `leaks()` catches a repeated sentence of the private notes, not a figure read off a
  reference table. Only a run against a real model can say whether Bucket keeps to it; that is the pilot in DECISIONS.md.
- **The early stages carry the interviewer's tables inside a 2,500-character budget** (`EARLY_DATA_CHARS`). Measured over the 235
  live-eligible cases that have such tables, 232 fit whole; 3 are cut (the largest holds about 4,000 characters), so a member asking
  for a figure in the last table of one of those three may still be told it is not there.
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
- **Two live checks fail until the #96 migration is applied** (they are the check that the live database matches the code, so this is
  the intended failure, not a bug): "cannot list, search, count or page through members at all" in `e2e/community.e2e.test.ts` and
  "are closed to visitors and to members, however the read is shaped" in `e2e/deployed.e2e.test.ts`. Both have a NOTE saying so.
  `npm run test:e2e` is not part of CI, so CI stays green either way.
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
- **The public directory is gone (issue #96), but the migration that enforces it is not applied yet.** The app shipped in that PR has no
  front-page list or search, and `src/data/supabaseCommunity.ts` no longer reads the public tables. Until the owner runs
  `npx supabase db push` for `supabase/migrations/20261124120000_link_only_profiles.sql`, **production `anon` still holds `SELECT` on
  `public_profiles` and `public_shared_cases`**, so every member who switched visibility on is still listable and scrapeable straight
  through the API. Two e2e tests are written for the post-migration world and fail until then (see Tests and CI). Once applied, a
  member's own link is still passable to anyone and the member ID in it is permanent: "reset my link" is issue #97.
- **Two historical columns stay in the schema with nothing reading them**: `profiles.public_link_only` (and its
  `profiles_link_only_requires_public` check) and `public_profiles.in_directory`. The migration leaves them, and the app keeps writing
  `public_link_only = public_profile` so the old check still holds for a browser running either version. Dropping them is a separate
  tidy-up that would have to re-create `sync_public_profile()` and `revoke_nonmembers()`.
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
- **The dry run never exercises `data_request`.** The rule that a message asking for data costs no rung of help (issue #94) depends on
  the model setting `data_request` on the turn, and the harness's stub never sets it — not even for the `asker` candidate, which asks for
  data by name. So the rule is covered by unit tests only, and the dry run's rung numbers are the ladder's alone. Two consequences worth
  keeping in mind: a model that never sets the flag leaves the ladder exactly as it was (the fallback is the old behaviour, which is the
  safe way round), and a model that sets it on everything would stop the ladder climbing at all. The real-model pilot is the place to
  measure how often it is set, and `asker` could be taught to send it once that is known.
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
