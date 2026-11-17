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
  `private-data/solutions/*.json`. The two captions and nine labels of issue #139 (2026-11-17) were edited the same way.
  Re-assembling from the reader outputs would silently undo them.
- **`buildLibrarySeed.mjs` reads every `private-data/casebooks/*.json` except `*.index.json`** and every `private-data/solutions/*.json`;
  a file with the wrong name or shape is either picked up wrongly or ignored. The new-analysis files are named `solutions-waveN.json`.
- **The parser's caps, and what they still cut** (issue #95 made every cut visible; none of them bites the library today).
  `src/domain/bookSolution.ts` caps: exhibits 12, columns 16, rows 70, chart points/categories 70, structure buckets 8, clarifying
  questions 5, takeaways 3, chart series 16, panels 8, and the character caps in `EXHIBIT_CAPS` (a cell or column heading 800, a title
  400, a caption 3,000 — the live case's own numbers). Empty-string chart categories are dropped, so a single unlabelled bar needs a
  non-empty label or the chart disappears. **Content over a cap is no longer cut in silence**: `parseSolutionExhibit` records what it
  left behind on the exhibit's `cut` and `shortened` lists (`exhibitLoss` in `src/domain/exhibitFidelity.ts`), the screen says so on the
  exhibit, and `npm run audit:live` exits non-zero on any exhibit that cannot be shown whole. What is *still* cut, and cannot be
  helped by a bigger number: a chart heading (60 characters), an axis title (80), a footnote (240) and a side note (60) are single lines
  inside a panel, so a line longer than that is cut to length. Those are counted as `shortened`, not as content gone, and the fix is a
  shorter line in the write-up (a content change, the owner's call). **The 9 exhibits that had one were rewritten on 2026-11-17**
  (issue #139, across Avalon, Cosmetics Company, Grad-U-Date, Kellogg Capital, LabCo, Orange Yoga Studio and Take Your Pills!), so
  `npm run audit:live` now reports 0 `exhibit_text_shortened`. One side-note line that could not hold its two figures in 60 characters
  was split into further list items rather than shortened, which is why that chart now carries more side notes than before. The write-ups
  are fixed; **production only changes when the regenerated `supabase/seeds/library.sql` is loaded**.
  The per-exhibit caps are `SOLUTION_EXHIBIT_LIMITS` and `LIVE_EXHIBIT_LIMITS` (40 columns / 400 rows / 400 chart points), both in that
  file; the live case passes the second to match `readExhibits` in `supabase/functions/_shared/liveCaseCoach.ts`. **They are no longer
  kept in step by hand**: `src/data/liveExhibitCaps.test.ts` sends an oversized exhibit through the real `readExhibits` and then through
  the screen's parser and fails if the screen cuts anything the Edge Function let through.
- **Three labels under a chart's axis are cut to length and nothing reports it.** `exhibitLoss` compares a `belowRows` row by how many
  values it has, never its label, so a label over the parser's 40-character cap is shortened in silence: News Co. (Darden 2023-24)
  Exhibit 1, FLC Sports League (Ross 2022) Exhibit 2 and Dealer Jack's (Fuqua 2017) Exhibit #1, measured 2026-11-17. The audit cannot
  see them, so they were left alone (issue #139 covered the seven cases the audit flags). Either shorten those three labels in
  `private-data/solutions/*.json` at the next reload, or compare `belowRows` labels in `exhibitFidelity.ts` first so the audit finds any
  others.
- **17 prompts talked about the book instead of to the candidate, and the rest of a write-up still does** (issue #132). The prompt is
  read to the member word for word as the opening of a live case, and 17 of the 872 ended with a sentence about the case rather than
  about the business: how hard or open-ended it is, what method to use, how the interviewer should behave, and two notes about a name
  the book misspells. All 17 were rewritten on 2026-11-17 in `private-data/solutions/*.json` (business situation and question
  untouched, the meta sentence dropped; every piece of it that matters to running the case was already held in `facts` or in the step
  notes, so nothing had to be moved). `npm run audit:live` now fails on a prompt that names the book or notes a printing oddity, so the
  next batch cannot reintroduce one. **The write-ups are fixed; production only changes when the regenerated `supabase/seeds/library.sql`
  is loaded** (the owner's call; not done). Two things are left: the audit also reports, without failing, **13 prompts that describe the
  case as a case** (how it is run, how the interviewer behaves, what kind it is) — each needs a person to judge, because an interviewer
  can be a character in the story; and the interviewer's side of a write-up still speaks of the book (**50 write-ups have a fact that
  mentions it**, plus 18 clarifying answers; steps and recommendations mention it in hundreds, which is right for the Full solution
  screen but not for something a coach may read out mid-case). Neither was in scope for #132.
- **A chart kind we do not draw is not counted as a loss.** `exhibitLoss` ignores a chart whose kind is outside `DRAWN_KINDS` (marimekko,
  waterfall, bubble, dual axis, maps): the exhibit stays the book's own table, which is the settled trade (ROADMAP R15). No write-up
  carries such a chart today (measured: 0 of 1,792 exhibits on 2026-11-16), so the rule costs nothing; if one is ever added, the member
  is told nothing and only the audit's "a chart is in the write-up but cannot be drawn" line will show it.
- **The two exhibits that lost a chart panel are fixed** (they were Lactose King, Fuqua 2025-26 exhibit 1 with 5 panels, and Sueno
  Mattress, Booth MCG 2026-2027 exhibit 3 with 6, against a cap of 4). The cap is 8. The same re-measurement found ten stacked charts
  with more than six segments, which the old 6-series cap had been cutting without anyone noticing, and 60 cells in 33 exhibits over the
  old 120-character cell cap; the series cap is 16 and cells now match the live case's 800. On 2026-11-16 nothing in the 872 write-ups is
  over any cap.
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
  stack from top to bottom. **The grey ramp has six shades and now starts again past the sixth** (it used to stop on the darkest, so every
  segment after the sixth was the same colour); the ten stacks with 7 to 13 segments therefore repeat a grey further down, and only the
  key tells those two segments apart. Giving those stacks the book's own colours (issue #106) is the real fix.
  A stack with `segmentNames` gets no key, but a segment under 14 px tall prints no name, so a very thin segment in
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
  accepts that a candidate exhibit might be hidden (the "safer way to be wrong"). Issue #85 narrowed the title half of it (a soft word
  such as "calculation" no longer hides the book's own numbered exhibit on its own), which left three kinds of leftover, all measured on
  2026-11-16 over the 847 live-eligible write-ups:
  - **99 tables are still hidden by a soft word alone** and were read by hand: the titles are the book's working or answers
    ("Calculations", "Math working for Part 2", "Answer: Profit per Customer"). One is a false positive we chose not to chase —
    National Park Service "Question 2 - Math: figures", whose caption says the figures are given to the candidate but whose title is not
    the book's numbering of an exhibit. A title that starts "Question 2" cannot be exempted without exempting the many workings filed
    under the same wording.
  - **Two cases needed a content change, not a rule change, and both captions were rewritten on 2026-11-17** (issue #139, in
    `private-data/solutions/*.json`, so it reaches members only when the regenerated seed is loaded): Contagion Containment (Darden 2020)
    "Exhibit 1: IOC Revenues for Upcoming Olympics", whose caption tripped the solution-caption rule while saying where the amounts came
    from; and Bumpers R Us (Fuqua 2025-26) "Exhibit #2: Strategic initiatives", whose caption described what the interviewer does with the
    exhibit rather than what is in it. Both exhibits now reach the candidate and Bumpers R Us plans two beats. **Contagion Containment is
    now a one-beat case**: it has a single candidate exhibit, and `buildPlan` uses the book's steps as beats only when no exhibit reaches
    the candidate, so its three step beats gave way to one exhibit beat. That is the rule working as written (#81, #82); whether a case
    with one exhibit and several worked steps should keep both is an open product question. The sentence about how the interviewer hands
    the Bumpers exhibit over was dropped rather than moved to the interviewer-side table beside it: that table holds the book's chosen
    initiatives (the answer), and a caption about reading things out when asked would have flipped it from `reference` to `onRequest`
    under `givenOnRequest`, which is exactly the table that must never be read out.
  - **The durable fix is still an explicit `audience` field on each exhibit** in `private-data/` (same ask as the `givenOnRequest`
    entry below), with the regexes as the fallback for older content.
- **Whether a Live case table is "our transcription" is judged by reading the table** (`tableRepeatsChart`, `src/domain/liveExhibit.ts`, issue #105), because no exhibit in the data is flagged as a transcription or a book table. Measured on 2026-11-16 over the 450 charted exhibits a candidate sees: 354 lose their table, 96 keep it. The rule errs toward keeping, so some of the 96 are our own transcription left on screen (about 20 approximate exhibits with a cell the chart does not print, such as a derived total, and 4 that differ by a word) and 35 are kept only because the chart's rows of text under its axis (`belowRows`) do not count as the chart showing a figure. Hiding those 35 as well is one line (count `belowRows` in `collect`), but it would hide DigiBooks "Exhibit A: Market segments", which the owner asked to protect. The reverse error (a book table hidden) was looked for in the hidden set and not found, but the check is by reading figures, not against the books. Run it again after new write-ups are loaded.
- **Whether a hidden table is data or the book's working is also decided by a heuristic** (`givenOnRequest` in
  `liveCaseCoach.ts`, widened in issue #83: 17 of the 358 hidden tables in live-eligible cases are classed `onRequest`, up from 2 — it
  was 18 of 369 until issue #85 made one of them, Pur and Kleen "Exhibit 3: Typical Canterbury cost figures", an exhibit the member is
  shown instead).
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

## The interviewer's voice in a live reply (issue #131, 2026-11-17)

- **The wording change is unverified against a real model.** The directives in `supabase/functions/_shared/liveCaseCoach.ts` were rewritten
  to stop three tells the $2 pilot found (third person, "the case says ...", an `advance` reply that summarises the beat it leaves). Unit
  tests prove the code-side checks on the pilot's own replies; no real model has been asked since. It also only takes effect after
  `npx supabase functions deploy live-case`.
- **The checks are string-level, so they catch wording and not meaning.** `hasTell` matches the phrasings the pilot produced and the
  obvious variants ("the student", "the candidate", "my instructions", a refusal that names an answer); a model that talks about the member
  some other way ("one would usually start with ...") goes through. `withoutSourceNarration` strips a listed source plus a listed verb of
  saying at a sentence boundary; "that is what you are told at the start" does not match. `sharesSubstance` needs three content words of one
  private-note sentence to appear in the move-on reply, so a summary written in different words passes, and the first-sentence cut is what
  catches the common shape.
- **A refusal that the case genuinely cannot answer is kept by a carve-out** (`NOT_HELD`: "I do not have that figure"), so a model that
  refuses in that shape while really withholding an answer is not caught. Narrowing it would start dropping the honest reply.
- **An `advance` reply is cut to its first sentence.** If a model ever answered a question and moved on in the same breath at that rung
  (with `data_request` unset), the answer would be lost. The flag and `beat_complete` are both excluded from the cut for that reason.

## The interview's register, and the ladder's entry condition (issue #130, 2026-11-17)

- **The register half is unverified against a real model, and it is the half that matters.** The interview mode's system prompt, its
  exhibit and direction directives and its first-rung instruction in `supabase/functions/_shared/liveCaseCoach.ts` now say that a reply
  never confirms, denies or grades the member's reading and never introduces a driver they did not raise. No model has been asked since.
  The unit tests exercise the code-side checks on the pilot's own replies, and `npm run dryrun:live` stubs the model, so neither can say
  whether the register moved. Like every change under `supabase/functions/**` it does nothing until `npx supabase functions deploy live-case`.
- **The verdict check is string-level.** `gradesTheirReading` matches the pilot's phrasings and the obvious variants ("you're right",
  "good instinct", "that's the key insight", "exactly the right lens", "which is the heart of", "not quite right"). A verdict worded
  some other way ("I can see where that takes you", "most candidates stop there") goes through. A bare "Good." or "Nice." is deliberately
  **not** matched: it is the neutral acknowledgement the app's own opener uses, and matching it would drop the acknowledgement the
  directive asks for.
- **A sentence that grades is dropped whole, which can cost a fact.** If a model ever wrote "You're right, and the cost base is $4M." in
  an interview, the figure would go with the verdict. A verdict that ends in a question keeps the question (`questionIn`), but a verdict
  that carries a fact does not keep the fact. #136 chose sentence-level dropping for the same reason and this follows it.
- **"Introduces a driver they have not raised" is only checked at the first rung.** At rung `none` a reply that shares three content
  words of one sentence of the beat's private notes, none of them words the member has used, is replaced by `OVER_TO_YOU`. Above that
  rung the hint is allowed to point somewhere, so nothing checks it; and the check cannot tell a driver the member raised in their own
  words from one they never mentioned, beyond that word comparison.
- **The progress test reads words, not meaning.** `madeAStep` (in `liveCase.ts`) looks for a figure, a comparison or driver word, or a
  next move, and discounts a message that admits being stuck without naming a next move. A real step forward written without any of
  those words ("the new shops are the problem") is scored `unclear`, which costs the member a rung sooner than it should — the cost is a
  hint they did not need, in practice from the first message and in an interview from the second. The opposite error is likelier: a
  message full of comparison words that says nothing is still counted as a step. It is applied in **every** mode, because the ladder is.
- **A model that sets `beat_complete` on everything still ends beats early**, and nothing deterministic checks that flag. Only
  `assessment` is held to the member's writing; the issue asked for the progress judgment and that is what is in.
- **The dry run can only measure this through a candidate written for it.** The four old candidates never claim progress while stuck, so
  the change moves nothing for them (per-case lines byte-identical before and after). The new `plausible` candidate is the pilot's
  failure in scripted form; its numbers are the whole of the measured movement, and they are about the engine, not about words.

## A result the book worked out, handed over as data (issue #129, 2026-11-17)

- **The wording half is unverified against a real model.** `NOT_THE_ANSWER` and the notes on the interviewer's tables in
  `supabase/functions/_shared/liveCaseCoach.ts` now state the rubric's derivation test and forbid volunteering a derived figure; the unit
  tests only exercise the code-side check. Like every other change under `supabase/functions/**` it does nothing until
  `npx supabase functions deploy live-case`.
- **The code-side check is numbers only, and only for figures it can be sure of.** `heldResults` holds back a figure in an
  interviewer-side table when the cell shows its own arithmetic or when the figure is the product or sum of others in the same row or
  column (same scale, within 0.5%). It cannot see a figure restated in words ("about eight billion"), a rounded version of one, a figure
  the model derives for itself from inputs it has just read out, or a result nowhere written down as a cell. The marks in the prompt are
  the first line; this is the net.
- **The two thresholds are judgement, not measurement.** Nothing under 100 is called a result by the arithmetic check (3 x 4 = 12 happens
  by accident) and nothing under 10 at all; a year (1900-2100) is never one. Across the 872 write-ups the check holds back 556 figures in
  146 cases, 20 of them under 100 (all from cells that print their own working). A real per-unit answer below those thresholds is missed.
- **A false mark would withhold an input, which is the worse defect (#83).** The guard is that a figure the member can see anywhere else
  — the prompt, the facts, the clarifying answers, their own exhibits, the unmarked cells of the same hidden tables, or anything already
  said in the conversation — is never held back; measured over the library, no figure the member can see is ever held. What is not
  guarded: an input that appears *only* as an operand inside one of the book's worked cells is treated as part of the working.
- **A caught reply is replaced whole**, as a reply that quotes a private note is. A member who asked for data and got a reply mixing the
  inputs with the result therefore gets the fallback line instead of the inputs. Dropping only the offending sentence (the shape issue
  #131 used for its tells) would keep more of the reply; the issue asked for the `leaks` behaviour and that is what is in.
- **Learning mode is exempt by design**: `heldResults` returns nothing there, because the mode exists to teach the answer once the
  student has tried.
- The durable fix the issue names is still open: an `audience` field per exhibit in `private-data/`, which needs a seed reload.

## Exhibits and steps in one plan (issue #128, 2026-11-17)

- **Nothing of this is verified against a real model or a real member.** `buildPlan` now mixes the two kinds of beat, and the unit
  tests, `npm run audit:live` and `npm run dryrun:live` all agree the cases run; the dry run stubs the model, so whether Bucket's reply
  on a part that hands over no exhibit reads like an interviewer putting a question is unknown. Like every change under
  `supabase/functions/**` it does nothing until `npx supabase functions deploy live-case`.
- **The clock grew, by design and by a lot.** Beats per case went from 2.98 to 4.86 and the median planned case from 31 to 39 minutes;
  272 of the 847 eligible cases now plan the full 25-in-40 ceiling, against 57 before. Nothing runs longer than the ceiling, but a
  14-beat case shares 25 minutes between 14 parts (about 1:45 each before the budget is reshared). Whether a 39-minute case is one a
  member will sit through is a product question the pilot and real use will answer.
- **The order between an exhibit and a step is a guess wherever no step names an exhibit.** 230 of the 847 write-ups have at least one
  step that names its exhibit; in the rest the exhibits are handed over first and the steps follow, which is the order those cases
  already had. Nothing in the data says where the book meant a step to sit, so a case can work through an exhibit before the sizing step
  the book put first. The durable fix is a field in `private-data/` that says the order, which needs a seed reload.
- **The duplicate test is a title test, and 218 steps sit in its uncertain band.** A step is taken as an exhibit's own discussion when
  it carries the book's label for it ("Exhibit 2: ...", "Financial analysis: Exhibit 1") or shares at least 80% of the shorter title's
  content words: 297 steps match by label and 117 by words over the library. 217 steps in 163 cases share between half and 80% of their
  words with an exhibit and are kept as parts of their own; some of those may be a second run at an exhibit, and a step whose title says
  nothing of what it is about ("Part 2", "Question 4") would be missed by both tests. A label that is a letter has to be separated from
  the noun, so that "the exhibits" is not read as naming an exhibit "s"; 66 steps name an exhibit the member is never handed and keep
  their part.
- **The framework rule now reads the head of a title too (the PM's ruling on #128, after the first review).** `FRAMEWORK_STEP` is
  unchanged and `FRAMEWORK_HEAD` sits beside it: a title that *begins* with framework / structure / structuring / clarifying questions
  and then a connector is the framework stage's work and is not a part. 66 steps (51 distinct titles) are excluded this way. **The cost
  is real**: a few of them carry analysis as well as structure ("Framework and market sizing", "Framework and current ROIC", "Framework
  and first data request"), and that analysis is now in no part of the case. The exception is a title that goes on to name an exhibit
  ("Framework and Exhibit 1"), which keeps the exhibit's work.
- **37 steps (30 distinct titles) still mention a framework or a hypothesis and are parts of their own**, because they are not headed by
  one: "Pick the framework", "Build the framework", "Hypothesis and framework", "Initial framework", "Question 1: Framework", "Market
  entry framework", "Step 1: Develop a framework", "Opening and framework", "Scope and framework". A member meets those as a part after
  writing their framework. Reading the head is what keeps "Revisiting the framework after Exhibit 2" and "Profitability framework and
  the key issue", so widening the rule to any title whose subject is the framework would take those too; it is a judgement for the PM.
- **The recommendation rule reads the head of a title.** "Recommendation", "Final recommendation", "Synthesis", "Conclusion to the CEO",
  "Wrap-up", "Summary for the CEO", "Closing the case" and "Answer" (alone) are left to the recommendation stage. 73 conversation-only
  cases lost exactly one beat to the two head rules together (61 to the recommendation, 12 to the framework); no case with exhibits
  lost one. A closing step the books head some other way ("What should the client do about pricing?") is
  still a part of its own, and a genuine analysis step headed "Summary of profitability" is dropped.

## Asking outright for the answer (issue #142, 2026-11-17)

- **Unverified against a real model.** `refusedTurn` in `supabase/functions/_shared/liveCaseCoach.ts` turns a `refusal` stop reason
  into the in-character line instead of the failure message; the unit tests stub the stop reason, and no real refusal has been seen
  since. Like every change under `supabase/functions/**` it does nothing until `npx supabase functions deploy live-case`.
- **How often the model refuses is still not recorded anywhere.** Only token usage is kept in `live_case_sessions.state`, so there is
  no way to say whether this moment happens once a case or once a month. Counting it means a new field on the session state and a
  mutation to raise it, which is more than the one line issue #142 was willing to spend, so nothing was added.
- **Every refusal gets the same line, whatever caused it.** The stop reason does not say why the model declined, so a turn refused for
  some other reason (an off-topic or unpleasant message, say) is also answered with "That one is yours to work out" and also costs no
  rung of the help ladder. The alternative was an error message for a member who did nothing wrong, which is the defect this fixed.
- **It answers a refusal on any kind of beat.** Since issue #128 a part of a case may hand over no exhibit at all, and the line is the
  same there: the reply is built from the mode alone, and `recordDataRequest` acts on whichever beat is open (or on none, in the
  opening stages).
- **The nudge and feedback paths are untouched.** A refusal on a timer-driven nudge still leaves the screen as it was (no message, no
  failure), and a refused feedback call still shows the feedback failure. Both were out of scope.

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
- **Live case hid a numbered book exhibit over one soft word** (issue #85, found by measuring the write-ups: 108 of the hidden tables in
  live-eligible cases were hidden by `sample|approach|answer|brainstorm|expected|calculation|math` in the title with no other marker, and
  9 of those were exhibits the book numbers for the candidate, such as "Exhibit D – Expected Claims Per Years of Warranty"). A soft word
  now hides a table only when the title is not the book's own name for an exhibit. Risk both ways: a book working titled like an exhibit
  ("Exhibit 3: Annual cost calculation" is a candidate exhibit, "Exhibit 1: Answers" is not) is told apart by whether the title says what
  the table is about beyond the soft word, which is a judgement the data does not carry. Named regression tests for all of them are in
  `src/data/liveCase.test.ts` ("a soft word in the title of an exhibit the book numbers for the candidate").
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

- **The link holder's "What to give them next" section (issue #120) has been read by tests, not by eyes.** `src/domain/giveNext.ts`
  and the visitor's screen are covered by unit and screen tests, but nobody has opened the card in a browser, and phone width is
  unchecked (the same gap the live-case screens have). Two product edges were left deliberately and are worth revisiting: the member's
  own **What others see** preview in Profile & privacy does not include the section, so a member can only see what a link holder is
  told by opening their own link; and the card names at most three case types and three industries before "+ n more", with no way to
  see the rest.
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
- **In Learning mode nothing but the member ends a beat, so a member who presses nothing is never carried on.** Found by the dry run:
  there is no clock (`isUntimed`) and `nudgeLevel` never reaches `advance` for a learner. The harness finding stands; its reading has
  changed. Issue #119 removed the one part of it that was a real gap: "Move on" is now live from the moment the exhibit appears, written
  about or not (`moveOn` skips the "say something first" rule when `isUntimed`), so a learner who does not know how to start on an exhibit
  is no longer held there. What is left is a member who writes nothing *and* presses nothing, which is exactly what the dry run's scripted
  candidates do: they model messages, never clicks (see "The dry run's candidates are a model of a member, not a member" above). The run
  counts those 1,694 runs (847 cases x `passive` and `offtrack`) as "open by design" and does not fail on them (`npm run dryrun:live`
  exits 0). **Re-measured on 2026-11-17 after #119: 1,694 before and 1,694 after**, the two reports identical apart from the timestamp,
  which is the expected result and not a sign the change did nothing. The count cannot fall without teaching a candidate to press the
  button, and should not be tuned to make it fall. Whether a learner who stops engaging altogether should be moved on is still an open
  product question; a clock and an `advance` rung were both ruled out for Learning (issue #119, "Out of scope").
- **The dry run's "nothing of the interviewer's reached the member" is about the engine, not about Bucket's words** (issue #95). It
  checks every exhibit payload handed over against `isInterviewerSideExhibit` and looks for an interviewer-side title or caption written
  out whole in a message, over all 10,164 runs. The model is stubbed, so it cannot say whether a real Bucket would paraphrase a private
  table: that is `leaks()` plus the real-model pilot in DECISIONS.md. The title test also needs 8 characters and the caption 20, so a
  very short title would not be matched.
- **The note on a cut exhibit does not say what is missing.** `ExhibitNotWhole` says only that part of the exhibit could not be shown;
  the counts are in the report. It has never been seen in production (nothing in the library is cut), so how a member reads it is
  unverified, and so is how it looks: no one has viewed it on a phone.
- **No test calls a real model.** Prompts and answer schemas for Bucket, Compare and Live case are tested against fakes, which is how the
  first live Bucket run found a rejected format. Run a real call after changing a prompt or schema.
- **`e2e/deployed.e2e.test.ts` checks the database** (tables, columns, functions with the right arguments) **but not that the Edge Functions
  are deployed at the current version**; a merged function change that was never deployed (see CLAUDE.md) would not be caught.
- **No visual or snapshot tests** for charts or screens; charts were checked by eye from rendered SVGs.
- **Content is validated by scripts outside the repo**, not by tests: the solution parser (`src/domain/bookSolution.ts`) is tested, but
  whether a write-up is faithful to its book is not.

## The pilot runner (`npm run pilot:live`, issue #125, added 2026-11-17)

- **It has now run against production** (the owner, 2026-11-17, runs 1 to 4 of the $2 pilot, about $0.12 spent): the sign-in, the `live-case`
  call, the catalogue RPC and the per-turn usage read worked together on first contact. The one defect that run found was arithmetic: on a
  `finish` turn the running total priced the feedback call at the coach model, so it printed about twenty times less than that call cost and
  disagreed with `spend` (issue #134, fixed by building both totals from `spendReport` — `spendWithTurn` hands it the turn not yet on disk).
  What the pilot is for — whether Bucket's words nudge or solve — is still open.
- **Spend is attributed, not measured per call.** `state -> 'usage'` is one running total per session with no model and no per-call split, so
  the script prices every turn at the coach model and the single `finish` turn at the feedback model. A future change that made two kinds of
  call in one turn would be priced wrongly and nothing would say so.
- **The >100K Haiku tier cannot be told from a multi-call turn.** The threshold is about one prompt; a per-turn delta covering several calls
  can pass 100,000 tokens without any single prompt doing so. The script prices such a turn at the higher tier (the dearer way to be wrong,
  which keeps the cap honest) and prints "single-call turns only" beside the flag. `tierCertain` on the turn's cost records which it was.
- **Usage no transcript accounts for is priced at the cheaper model.** A session started by hand, or a call that lands after the last reading,
  shows up as "not in any transcript" and is priced at Haiku rates, so that part of a total can only be understated. `spend` names the figure.
- **The cap is a reserve, not a guarantee.** It stops the next call when `spent + reserve` would cross the cap, where the reserve is the
  dearest turn so far (floored at $0.05, or $0.25 for a `finish`). A single turn that costs more than every turn before it can still carry the
  total past the cap; nothing can stop that without a per-call limit the Edge Function does not offer.
- **The catalogue cannot say which cases are conversation-only.** PR #118 added that signal and PR #124 removed it again on purpose, so
  `catalog` prints a line saying there is none rather than reimplementing `buildPlan`. Choosing a case with exhibits for the pilot means
  reading `reports/live-case-audit.md`.
- **Which action belongs at which stage is written out twice.** `STAGES_FOR` in `scripts/liveCasePilot.mjs` encodes the same knowledge as
  `playCase` in `scripts/liveCaseDryRun.mjs`; they were kept apart deliberately (the free harness is not worth disturbing for a guard), so a
  change to the stage machine has to be made in both. In the pilot it only stops an unattended `play`; a hand-driven `turn` goes ahead and
  says so.
- **Transcripts are a new place the book's content sits on disk.** `reports/pilot/*.json` holds prompts and exhibits in full. `/reports/` is
  git-ignored and the script's header and every run say so, but nothing enforces it.
