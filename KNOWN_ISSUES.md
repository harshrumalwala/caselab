# KNOWN_ISSUES.md

Written 2026-11-15. Bugs, shortcuts, workarounds, missing tests and fragile spots, with the files involved. "Not verified" means the
assistant saw a claim (for example a build session's report) but did not check it itself. Items are not ranked.

## Documentation that has gone stale

`README.md` is detailed and mostly current, but these statements no longer match reality (line numbers rechecked on 2026-11-17; they
move whenever the file does, so the quoted words are the reliable part):
- Line 790: "about 170 tests". On 2026-11-13 the unit suite had 89 files and 1,226 tests.
- Line 412 (and the "Full solution" paragraph at line 417): says about 250 cases carry an analysis and that full solutions exist only
  for the Booth MCG casebook and the co-chairs' picks. As of 2026-11-13 production holds 872 cases, 872 analyses and 872 solutions.
- Line 667: "the 10 of 346 marked partial are left out" is an old count; the current one was not recomputed.
- Line 425: `supabase db push --include-seed` will not work for the current seed (see "Library data pipeline").

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
- **The parser's caps, and what they still cut** (issue #95 made every cut visible; no cap takes content out of the library today, and
  nothing is cut to length either since the four labels of issue #157 were rewritten). `src/domain/bookSolution.ts` caps: exhibits 12, columns 16, rows 70, chart
  points/categories 70, structure buckets 8, clarifying questions 5, takeaways 3, chart series 16, panels 8, and the character caps in
  `EXHIBIT_CAPS` (a cell or column heading 800, a title 400, a caption 3,000 — the live case's own numbers). Empty-string chart
  categories are dropped, so a single unlabelled bar needs a non-empty label or the chart disappears. **Content over a cap is no longer
  cut in silence**: `parseSolutionExhibit` records what it left behind on the exhibit's `cut` and `shortened` lists (`exhibitLoss` in
  `src/domain/exhibitFidelity.ts`), the screen says so on the exhibit, and `npm run audit:live` exits non-zero on any exhibit that cannot
  be shown whole. What is *still* cut, and cannot be helped by a bigger number: a chart heading (60 characters), an axis title (80), a
  footnote (240), a side note (60), the label of a row under the axis (40, issue #143) and a reference line's label (30, issue #151) are
  single lines inside a panel or on the chart, so a line longer than that is cut to length. Those are counted as `shortened`, not as
  content gone, and the fix is a shorter line in the write-up (a content change, the owner's call). **The 9 exhibits that had one were
  rewritten on 2026-11-17** (issue #139, across Avalon, Cosmetics Company, Grad-U-Date, Kellogg Capital, LabCo, Orange Yoga Studio and
  Take Your Pills!), so `npm run audit:live` reported 0 `exhibit_text_shortened` until #143 taught it to read the row labels as well and
  #151 the reference-line labels; it went to 4; issue #157 rewrote those four write-ups on 2026-11-17 and it is 0 again (the next two
  bullets). One side-note line that could not hold its two
  figures in 60 characters was split into further list items rather than shortened, which is why that chart now carries more side notes
  than before. The write-ups are fixed and **are in production**: the seed was reloaded on 2026-11-17 (see "What production holds" at
  the end of this section). The per-exhibit caps are `SOLUTION_EXHIBIT_LIMITS` and `LIVE_EXHIBIT_LIMITS` (40 columns / 400 rows / 400 chart points), both in that file;
  the live case passes the second to match `readExhibits` in `supabase/functions/_shared/liveCaseCoach.ts`. **They are no longer kept in
  step by hand**: `src/data/liveExhibitCaps.test.ts` sends an oversized exhibit through the real `readExhibits` and then through the
  screen's parser and fails if the screen cuts anything the Edge Function let through.
- **Three labels under a chart's axis are cut to length, and the audit now says so** (issue #143, 2026-11-17). `exhibitLoss` used to
  compare a `belowRows` row by how many values it has and never its label, so a label over the parser's 40-character cap was shortened
  with nothing recorded anywhere. It compares the label now, and the whole library was measured with it: **3 exhibits in 3 cases, out of
  1,792 compared** — News Co. (Darden 2023-24) Exhibit 1, FLC Sports League (Ross 2022) Exhibit 2 and Dealer Jack's (Fuqua 2017) Exhibit
  #1, the same three a person had found by reading, and no others. `npm run audit:live` therefore reports them as
  `exhibit_text_shortened` again (it was 0 after #139; it went to 4 with #151's reference line); each was one label too long for its
  row, every figure was still on screen, and the command still exited 0 on them. **The three labels were rewritten on 2026-11-17**
  (issue #157, in `private-data/solutions/*.json`): each is inside the 40-character cap with every figure and the meaning kept, and the
  wording that had to go is still on screen in the same exhibit's caption, footnote or column heading, none of which is near a cap.
  They reached production in the reload of 2026-11-17, with the #132, #139, #149, #151 and #157 rewrites (see "What production holds"
  at the end of this section).
- **One reference line's label is cut to length, and the audit now says so** (issue #151, 2026-11-17). `chartLoss` compared how many
  reference lines a chart has and never read their labels, so a label over the parser's 30-character cap was shortened with nothing
  recorded anywhere — the same defect #143 fixed for the row label, one field along. It compares the label now, matching the lines as the
  parser draws them (a line the write-up gives no number for is never drawn, and the count already reported that one), and the whole
  library was measured with it: **1 exhibit in 1 case, out of 1,792 compared** — Soap Co. (Booth MCG 2026-2027) Exhibit A, the one the
  field walk had named, and no others. `npm run audit:live` reported 4 `exhibit_text_shortened` as a result and still exited 0: every
  figure was on screen, one label did not fit the chart. **The label was rewritten on 2026-11-17** (issue #157, in
  `private-data/solutions/*.json`): it is inside the 30-character cap, keeps the band the book prints, and the whole sentence is still
  on screen in the exhibit's caption. It reached production in the reload of 2026-11-17, with the #132, #139, #143, #149 and #157
  rewrites (see "What production holds" at the end of this section). `exhibit_text_shortened` is 0 again.
- **Fields of an exhibit that `exhibitLoss` still does not compare** (walked field by field for issue #143; the full list with a yes or
  no on each is in that PR). The one of them that bit — a reference line's label — is compared since issue #151 and is the bullet above.
  The rest have nothing over a cap today: the chart's unit (12), a point label on a series (40), a series or reference-line colour (20),
  a value in a row under the axis (30, the count is compared but not the text), a side-note heading (60), an axis-end word (40), the
  exhibit's `howToRead` (700) and its takeaways (5 of 400). Dropped-outright cases nothing reports either: a row under the axis that has
  a label and no values, a highlight index outside the categories, an `xValue` that is not a number, and a `yMin`/`yMax`/`yStep` that is
  not a number. Booleans and `approx` cannot be cut at all, and a panel inside a panel (which the parser also drops) is already reported
  as a cut.
- **17 prompts talked about the book instead of to the candidate, and the rest of a write-up still does** (issue #132). The prompt is
  read to the member word for word as the opening of a live case, and 17 of the 872 ended with a sentence about the case rather than
  about the business: how hard or open-ended it is, what method to use, how the interviewer should behave, and two notes about a name
  the book misspells. All 17 were rewritten on 2026-11-17 in `private-data/solutions/*.json` (business situation and question
  untouched, the meta sentence dropped; every piece of it that matters to running the case was already held in `facts` or in the step
  notes, so nothing had to be moved). `npm run audit:live` now fails on a prompt that names the book or notes a printing oddity, so the
  next batch cannot reintroduce one. **The write-ups are fixed and are in production**: the seed was reloaded on 2026-11-17 (see "What
  production holds" at the end of this section). Two things were left. The first is closed: the audit also reported, without failing,
  **13 prompts that describe the case as a case** (how it is run, how the interviewer behaves, what kind it is), each needing a person
  to judge because an interviewer can be a character in the story. The PM judged all 13 for issue #157 on 2026-11-17 — 11 sentences
  dropped and 2 reworded, the two role plays being the ones kept, because a role play is the business situation the member is in while
  a stage direction is not. Every dropped sentence was checked against `facts` and the step notes first, and nothing had to be moved;
  `prompt_talks_about_the_case` is 0. The second is still open: the interviewer's side of a write-up speaks of the book
  (**50 write-ups have a fact that mentions it**, plus 18 clarifying answers; steps and recommendations mention it in hundreds, which is right for the Full solution
  screen but not for something a coach may read out mid-case). Neither was in scope for #132; the interviewer's side was measured and
  fixed by #149, the bullet below.
- **Five prompts read from outside the case, and no audit rule matches them** (issue #159, 2026-11-17). Both leftovers of #157, flagged
  there by the developer rather than acted on, and fixed together because one seed reload carries both. One prompt (MIT Sloan 2011) had
  its ask put back in the middle by #157 and two sentences after it still narrating the arc of the case — what gets discussed next and
  what the candidate then has to do. Four others (Ross 2010, Kellogg 2018, Columbia 2017, Ross 2009) carried the ask itself in the third
  person, speaking of "the candidate" as someone watched from outside. **The rule applied, which is the one worth keeping: does this
  sentence tell the member about the business, or about the case?** A role play stays, because it *is* the business situation; a sentence
  describing what the candidate will be asked to do, or how the case unfolds, goes. All five were rewritten on 2026-11-17 in
  `private-data/solutions/*.json`: two trailing sentences dropped from the first, and the ask turned to the second person in the other
  four with every fact and the question itself kept. Each dropped or reworded sentence was checked against `facts`, the clarifying
  answers and the step notes first, and all of it was already held there (the costs, growth and partnership arc of the first prompt is in
  its own `facts` entry and in four step notes), so nothing had to be moved. **No audit count moved, which is the point**: the whole
  report was byte-identical apart from its timestamp, because none of the five matched a rule before the change either. Widening
  `scripts/liveCaseAudit.mjs` to catch "the candidate" as the subject of the sentence carrying the ask is the obvious follow-up and was
  deliberately **not** done here (#156 was open in that file); nobody has measured how many of the 872 such a rule would flag, or how
  many of those would be role plays. **The write-ups are fixed; production only changes when the regenerated
  `supabase/seeds/library.sql` is loaded** (the owner's call; still not done — 13,223,152 bytes, 297 smaller, 872 / 872 / 872 rows).
  **This is the one library change the reload of 2026-11-17 did not carry**, because the seed was regenerated after that load had run:
  production still holds the five pre-#159 prompts (checked on 2026-11-17 by comparing the md5 of every prompt in production with the
  write-ups — 5 of 872 differ, and they are these five).
- **The interviewer's own facts named the book, and 44 sentences of them would have reached a member** (issue #149, 2026-11-17). A fact
  and a clarifying answer are never shown to the member, but the coach reads one out, in full, when they ask for it (#83), so they take
  the path the prompt took. Measured with the engine's own reply filter rather than with real model runs (which the issue did not
  authorise): **65 cases held one (50 a fact, 17 a clarifying answer; 63 live-eligible), 72 sentences in all**, and `interviewerVoice`
  cleaned only 28 of them. The 28 are the narrated shape — "the book says X" is read out as X — and the **44 others have the book as the
  subject of the sentence** ("the book labels this ...", "the book's reference figure is ..."), where there is no fact left once the
  book is taken out, so no filter can save them. Those 44, in 41 cases across 9 files, were rewritten on 2026-11-17 in
  `private-data/solutions/*.json`, keeping the meaning, the figures and the order. `npm run audit:live` now reports
  `interviewer_names_the_book` with both counts, so the second one cannot drift back above zero unnoticed; it is reported, never failed,
  because the filter genuinely handles the narrated shape. **The write-ups are fixed and are in production**: the seed was reloaded on
  2026-11-17 (see "What production holds" at the end of this section). Two things were left, and the first is closed: the voice
  filter's new source words (`casebook`, `case book`, `authors`) are in `supabase/functions/_shared/liveCaseCoach.ts` and are deployed
  (live-case version 23, 2026-11-17). The second is open — **16 of the 28 sentences left were dropped whole** by the reply filter
  rather than cleaned, because the same sentence also talks about "the candidate" — so a reply that was only that sentence became the
  stand-in line, and the member did not get the fact they asked for. That is the #132 pattern one layer in again, it is not about the book,
  and it became issue #156, which measured it over every fact rather than only the book-naming ones (286 sentences, not 16) and fixed it
  in the filter: see "A fact that mentions the candidate" below.
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
- **Generic case names can merge different cases** into one library entry (README line 410).
- **What production holds (checked on 2026-11-17).** 872 library cases, 872 analyses, 872 solutions. Every solution row was written
  between 13:36:49 and 13:38:02 UTC that day, so the whole library was last loaded in one pass then, after issue #157 merged. The
  content it carries was compared with `private-data/solutions/*.json` field by field: the md5 of every prompt matches except **5 of
  872**, which are #159's; and the counts of write-ups whose facts (30), clarifying answers (22), exhibits (166) or steps (680) name
  the book match exactly. So the #132, #139, #143, #149, #151 and #157 rewrites are live and **#159's five prompts are the only
  library change waiting on a reload**. Re-run that comparison after the next load rather than trusting this paragraph.

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
  the assistant's scratch folder, not in the repo. `src/features/caselog/ExhibitChart.test.tsx` covers specific behaviours only. **Issue #175 is
  what that costs**: a value label was drawn five pixels above its bar and so landed outside the panel whenever the bar reached the axis maximum
  (every 100% bar on a percentage chart), and nothing in the suite saw it, because the tests asked what a chart drew and never where it drew it.
  The tests added with the fix measure a label's position against the plot's own edges, which is the shape of test that would have caught it; the
  browser check behind that issue was still done by hand, at desktop width and at 390px.
- **What the label fix in #175 leaves rough** (2026-11-17, `src/features/caselog/ExhibitChart.tsx`). The placement arithmetic is estimates, not
  measured text: a size-10 numeral is assumed to reach 8px above its baseline and to be 5.6px wide per character (`LABEL_RISE`, `labelWidth`), the
  same way the rest of the file measures text, so an unusually long label inside a sideways bar can still sit closer to the bar's start than the
  estimate says. A bar needs 15px of depth to hold its label inside it; a shorter bar at the axis maximum has the label just under its top instead,
  over the plot rather than over the bar, which reads but is not pretty. And the labels **below** a mark were left alone: the label under the
  most-negative bar of a chart sits 12px under the axis, where the category names also sit, so the two can overlap. Nothing in the library has a
  negative bar deep enough to have been noticed; it was out of scope for #175, which was about figures leaving the panel.
- **A chart narrower than 420px scrolls rather than fits** (issue #175). The drawing has a size of its own (560px for a single panel), and the SVG
  scales to the card down to a floor of 420px, which keeps a 10px label at 7.5px. Below that the chart is swiped sideways and says so. Scaling the
  whole drawing into a phone card (320px inside the Full solution dialog at 390px) was tried in the browser and puts the axis numbers and the value
  labels at about 5.7px, which is why the floor is there. Laying a panel out at the card's own width instead — fewer pixels for the plot but the
  same 10px type — would fit a phone properly and is the real fix; it is a layout change across every chart kind, with no visual regression tests to
  catch what it breaks. The note says “swipe”, which is phone language: a desktop window narrow enough to show it is dragged or scrolled instead.
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
    `private-data/solutions/*.json`, and in production since the reload of 2026-11-17): Contagion Containment (Darden 2020)
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
- **The live-case opening prompt talks about "the candidate" across most of the library (found 2026-11-17, not triaged; the PM has not
  ruled on it).** Measured against production on 2026-11-17, after the seed reload, by string match on `solution->>'prompt'`: of 847
  live-eligible solutions, **560 prompts contain "the candidate"** and **345 contain the exact phrase "the candidate is asked"**; across
  all 872 solutions the figures are 577 and 351. `openingText()` in `supabase/functions/_shared/liveCaseCoach.ts` returns `s.prompt`
  word for word as the member's first screen, so "The candidate is asked to..." is the same break in the fiction that issue #157 was
  created to remove. Nothing caught it because `PROMPT_RULES` in `scripts/liveCaseAudit.mjs` has no pattern for the candidate: its rules
  cover naming the book, noting how a page prints something, saying how hard or open the case is, saying what kind of case it is, and
  saying how the case is run, so `prompt_talks_about_the_case` cannot see this class. Issue #159 predicted exactly that ("the audit's
  rules match one phrasing and these use another") while correctly putting rule changes out of scope. Scale against what was fixed:
  #157 removed 11 prompts' sentences and reworded 2, #159 fixed 5; sixteen, against roughly 560. **Caveats:** this is a string match,
  not a reading. Nobody has read these 560 prompts; some may be fine in context (a role play, for instance), and the real number only
  firms up once someone samples a few dozen. Fixing them is a content campaign plus a seed reload, not a code fix. This also answers
  the "nobody has measured" remark in the #159 paragraph under "Library data pipeline".

- **The third-person prompt rule: measured before and after the #196 campaign (issues #196, #200, 2026-11-18).** Before the campaign the
  rule `talks about the member in the third person` matched **521 of 577** prompts (the 577 are those that mention the member at all, not
  the 872 in the library). The campaign rewrote the prompts into the second person, the seed was reloaded into production on 2026-11-18
  (872 `library_cases`, 872 `library_case_notes`, 872 `library_case_solutions`), and the owner's closing comment on #196 reports
  `prompt_talks_about_the_case` 0 and `prompt_names_the_book` 0, with all 872 production prompts matched by md5 to the audited seed.
  **A re-run for #200 on 2026-11-18 did not reproduce the 0 for the third-person rule:** `npm run audit:live` over the 872 write-ups in
  `private-data/solutions/` (the `--dir` of the owner's checkout) reported `prompt_names_the_book` 0 and `prompt_talks_about_the_case`
  **15**, all 15 under the third-person label. Not reconciled: the likely causes are write-ups edited after the seed that was reloaded,
  or a different count of the same files, and neither was checked. The README no longer carries a figure; read the current one from the
  command, and compare it with production before quoting either.
- **The 560 figure above is slightly low, by at most 17 prompts known by name.** Some prompts frame the member in the third person
  without the word "candidate": "has hired the firm", a named consulting firm hired, a standalone "The task is to...", "the client sits
  in the role of...", and a mixed "we" / "our client" voice. The #196 waves listed these by name as they went, so a later pass can be
  scoped from that list instead of measured again from a regex. (The campaign's own closing tally of such framings was larger than 17,
  by a broader reading: 34 prompts with a hired firm and no member in the sentence, 16 narrating the case structure.) The rule's regex
  deliberately leaves them alone; widening it is out of scope of #200.

## Tests and CI

- **The full unit suite is slow and had one bad run.** On 2026-11-13 a full `npm test` run took about 950 seconds (86 workers) on the owner's
  machine. One full run reported 10 failed tests and 3 errors; a second full run passed all 1,226. The failures were not investigated;
  load-related timeouts are suspected, not confirmed. Heavy work running at the same time (a render test, other test runs) may have
  contributed. Use `npx vitest run <file>` for single files.
- **No linter** exists (`package.json` has no `lint` script); CI (`.github/workflows/ci.yml`) runs typecheck, tests and build only.
- **The #121 column is in production, so the live check that watched for it passes again.** "has every column the migrations add"
  in `e2e/deployed.e2e.test.ts` reads the `add column` statements straight out of `supabase/migrations/`, so it expected
  `profiles.share_sharpening` from the moment the migration file was committed and reported it missing until the owner applied it on
  2026-11-17. (`public_profiles.share_sharpening` is never reported either way: that table is closed to every API role, so the read
  fails on permission before it can fail on the column.) `npm run test:e2e` is not part of CI, so this was never a CI failure.
- **The #96 migration is applied, so the two live checks that waited on it have what they expect.** "cannot list, search, count or
  page through members at all" in `e2e/community.e2e.test.ts` and "are closed to visitors and to members, however the read is shaped"
  in `e2e/deployed.e2e.test.ts` both failed by design until `20261124120000_link_only_profiles.sql` was applied on 2026-11-17; each
  still carries a NOTE written for that wait. Production was queried on 2026-11-17 and holds exactly what they assert (no table or
  column `SELECT` for `anon` or `authenticated` on `public_profiles` / `public_shared_cases`, RLS on with zero policies); the suite
  itself was not re-run by this pass, and it is not part of CI either way.
- **`npm run test:e2e` talks to the real (production) Supabase project** in `.env.local` using accounts in the git-ignored
  `.env.e2e.local`. It creates and removes rows titled `ZZ CaseLab e2e ...`. It is not part of CI. It broke once because
  `e2e/app.e2e.test.tsx` looked for the old front-page headline ("Case smarter"); fixed in PR #78 to look for "Case with Bucket".
  Tests that match on marketing copy will break when copy changes.
- **Throwaway e2e accounts are listed while the suite runs** (a few minutes) and then unlisted. A check that no "E2E..." names appear in
  Community → Members was left to the owner and is not verified.
- `tsconfig.tsbuildinfo` shows as untracked in `git status` (not ignored).

## Production, security and operations

- **`live-case` and `notify-request` run with `verify_jwt = false`** (`supabase/config.toml`) and check the sign-in inside the function.
  If that check were removed, the functions would be open. Read back from production on 2026-11-17: `live-case` is version 23
  (deployed 19:06 UTC) and `notify-request` version 4, both still with `verify_jwt` off.
- **The deployed `live-case` is the code on `main`** (checked on 2026-11-17 with `npx supabase functions download live-case`, into a
  scratch folder rather than over the repo): `live-case/index.ts`, `_shared/liveCase.ts` and `_shared/liveCaseCoach.ts` came back
  byte-identical to the repository at `b2f40c4`, which carries every live-case change up to and including issue #163 (PR #170). So
  the "it does nothing until `npx supabase functions deploy live-case`" note that each live-case section below was written under no
  longer applies to any of them: they are live. What is still true of every one of them is that **no real model has been asked since**
  — the unit tests use a fake one and `npm run dryrun:live` stubs it — and that a session already running keeps the plan it started
  with, so a check needs a new case. Repeat the download after the next merge; nothing automated compares the two (see "Missing
  tests").
- **The Learning-mode change (PR #79) was merged and its Edge Function deployed by the session that built it.** That session's report
  said it had not started a Learning case on the live site and had not confirmed that Vercel deployed the merge. This documentation
  pass did not see the owner's approval for that merge and deploy (the report did not mention it). Not verified.
- **CAPTCHA is not wired in** for public sign-up; abuse protection is Supabase's built-in rate limits (README step 2 and Limitations).
- **The "What I'm sharpening" migration (issue #121) was applied on 2026-11-17, before its app half shipped**, which is the order
  CLAUDE.md asks for and the reason the PR was held open. `supabase/migrations/20261125120000_share_sharpening.sql` adds
  `profiles.share_sharpening`, carries it into `public_profiles` and returns it from `public_person(id)`. Checked on production
  afterwards (by the session that applied it): the column is on both tables, **0 members have it on and 9 have it off**, so nothing
  became visible on apply; `public_person(p_id uuid)` returns it; and its grantees are `anon`, `service_role` and `postgres`, with
  `authenticated` correctly absent. Had the app shipped first, `rowToProfile` would have read a column that did not exist and every
  profile save would have failed.
- **Whether a summary is shown is decided in the browser, not in the database**, and it has to be: the figures it is built from
  (`skill_scores`) are released by `share_skills`, which is a separate consent the member may have given long ago. So a determined
  link holder can still average those per-case scores by hand — that was the PM's original argument against the switch. What the
  switch buys is that *CaseLab* does not do it for them or put the result at the top of the page, which is the framing the owner
  chose to protect. If that ever needs enforcing in the database, the only way is to stop releasing per-case skill scores to
  visitors, which is a different (and larger) decision. **The switch's copy was rewritten on 2026-11-17** (issue #177) to say that
  much: it used to promise skills "named only: no numbers, no ranking", which is true of the card and false of the page, because
  **Shared performance** sits under it with the same skills as averages. The owner's ruling was to change the copy and leave the
  page: hiding a block `share_skills` already releases would take back a separate, earlier consent.
- **The "Shares ..." line now reads what rendered, and only for the sharpening summary** (issue #177, 2026-11-17). Every other switch
  shows something the moment it is on, so `sharingShown` (`src/domain/sharpening.ts`) corrects exactly one key and leaves the rest as
  the switches set them. Two small consequences: in the member's own preview the line is computed from an empty list while the rows are
  loading, so "and what they're sharpening" appears a moment after the rest of the sentence; and a reader who is a member never sees
  the summary offered, which is right today but would need revisiting if members were ever given the card.
- **`whatToGiveNext` still computes a `focus` and nothing reads it** (2026-11-17). The owner asked for the "*name*'s own focus"
  block to come off the profile link, so the screen dropped it; `src/domain/giveNext.ts` still returns the field and its unit tests
  still cover it, on the view that the rule is sound and may be wanted elsewhere. Delete it, or use it, rather than leaving it
  indefinitely.
- **The copy rule the owner gave on 2026-11-17 is not enforceable by a test, only sampled by one.** "Cut any sentence that tells the
  reader how to interpret what is above it, hedges against a misreading nobody has made, or restates in prose what the layout already
  shows." The new test in `src/PublicSite.test.tsx` ("the profile link says its piece and stops") matches the phrasings that were
  removed and the obvious neighbours; a fresh explanatory sentence worded some other way goes straight through. The rule itself is
  not written down in `CLAUDE.md` beside the "never a changelog" convention yet, which is where it belongs (the owner's call).
- **The two lists in the sharpening card wrap differently inside the preview** (noted by issue #173, out of scope for #177). The card's
  `sm:grid-cols-2` keys off the viewport, not the container, so in the narrow **What others see** panel "SHARPENING NOW" can wrap to two
  rows while "STRONG ALREADY" stays on one. Ragged, legible, and only in the preview.
- **The public directory is gone (issue #96) and the migration that enforces it is applied.** The app shipped in that PR has no
  front-page list or search, and `src/data/supabaseCommunity.ts` no longer reads the public tables;
  `supabase/migrations/20261124120000_link_only_profiles.sql` was applied with the owner's approval on 2026-11-17. Checked against
  production on 2026-11-17: `npx supabase migration list --linked` shows all 32 migrations `local == remote`, and a query of the
  catalogue shows **no table or column `SELECT` for `anon` or `authenticated`** on `public_profiles` or `public_shared_cases`, RLS on
  with zero policies, and `public_person` / `public_person_cases` still executable by `anon`. So a visitor can no longer list or
  scrape the members who switched visibility on; only an exact member id gets anything. What is left: a member's own link is still
  passable to anyone and the member ID in it is permanent, so "reset my link" (issue #97) is still worth doing.
- **Two historical columns stay in the schema with nothing reading them**: `profiles.public_link_only` (and its
  `profiles_link_only_requires_public` check) and `public_profiles.in_directory`. The migration leaves them, and the app keeps writing
  `public_link_only = public_profile` so the old check still holds for a browser running either version. Dropping them is a separate
  tidy-up that would have to re-create `sync_public_profile()` and `revoke_nonmembers()`.
- **Messages are not end-to-end encrypted**; reports sit in a table that only the Supabase dashboard can read, with no in-app admin.
- **Display names are not verified.**
- **Edits on two devices at once**: last save wins. The tour is remembered per browser. No offline mode.
- **The live-case cost has been read back; the Bucket read's has not.** The README's estimates are under 10 cents a live case and
  about 3 cents per Bucket read. `npm run pilot:live` read `live_case_sessions.state -> 'usage'` during the $2 pilot of 2026-11-17 and
  put a whole interview case at about 3 cents, roughly 80% of it the one Sonnet feedback call. Nobody has measured a Bucket read, and
  what limits live-case use is the function's own 4 starts per member per day rather than money.
- **Supabase CLI deprecation warnings**: `--linked` is deprecated (use `--remote`), and `supabase/config.toml` still uses
  `auth.email.enable_signup` and `auth.sms.enable_signup`, which the CLI says will be removed in v4.
- **Windows PowerShell blocks `npm`/`npx` scripts** by default execution policy (the owner hit this); use `cmd.exe` or change the policy.
- **A git worktree is not linked to Supabase, and the error does not say so.** Any Supabase CLI command that talks to the project
  (`npx supabase db push`, `migration list`, `db query`, `functions deploy`, `functions download`) fails from a worktree with
  `{"code":"ProjectRefNotLinkedError","message":"Cannot find project ref. Have you run supabase link?"}`, even though the primary
  checkout is linked and nothing is wrong with the login. The cause is that the CLI keeps its link state in `supabase/.temp/`
  (`project-ref`, `linked-project.json`, the pooler URL), which is git-ignored (`supabase/.gitignore` line 3), so a worktree is
  created without it. The error points at `supabase link`, which is the wrong fix: re-linking asks for the database password and
  writes the state again per checkout. **Workaround:** copy `supabase/.temp/` from the primary checkout into the worktree, or run the command from the
  primary checkout. It cost real time on 2026-11-17 while applying the #121 migration.
- **The same root cause stops a worktree running the live checks.** `.env.local` (the Supabase URL and publishable key) and
  `.env.e2e.local` (the throwaway accounts) are git-ignored too (`.gitignore` lines 10-12), so `npm run dev`, `npm run test:e2e` and
  `npm run pilot:live` all fail or skip in a fresh worktree until those two files are copied across as well. The three commands CI
  runs — `npm run typecheck`, `npm test`, `npm run build` — need none of them and work anywhere.
- **Migration order matters**: the app expects the newest tables, so a migration must be applied before the app version that needs it
  is deployed. `e2e/deployed.e2e.test.ts` checks that the live database matches the code.

## The interviewer's voice in a live reply (issue #131, 2026-11-17)

- **The wording change is unverified against a real model.** The directives in `supabase/functions/_shared/liveCaseCoach.ts` were rewritten
  to stop three tells the $2 pilot found (third person, "the case says ...", an `advance` reply that summarises the beat it leaves). Unit
  tests prove the code-side checks on the pilot's own replies; no real model has been asked since. It is deployed (live-case
  version 23, 2026-11-17).
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
  Since issue #165 that first sentence is also *kept* only when it says the case is moving on; see the section below.

## The move-on at the advance rung (issue #165, 2026-11-17)

- **What it was.** `movingOnOnly` (#136) kept the model's first sentence whatever it said. In an interview `withoutVerdicts` (#145)
  then dropped it as a verdict, the reply went empty, and the `!said` guard — which was not rung-aware — substituted `OVER_TO_YOU`
  ("Okay, stay with it ...") while `applyTurn` moved the case on regardless: the member was told to stay with the part at the moment
  it was taken away. In practice the same first sentence reached them as a bare verdict with no move-on in it. Both are fixed: the
  opening sentence is kept only when `saysMovingOn` matches it, and the `!said` guard and the whole-reply stand-in both hand back
  `MOVING_ON` at that rung instead of `OVER_TO_YOU` or `FALLBACK`.
- **Unverified against a real model**, like every other change under `supabase/functions/**`. It is deployed (live-case version 23,
  2026-11-17). The unit tests put the issue's three reproductions through the real `parseTurn`.
- **The dry run cannot see it at all.** `npm run dryrun:live` stubs the model with one fixed sentence, so no content filter in
  `parseTurn` executes in any of its 12,705 runs. Run before and after (847 cases, 12,705 runs, 0 that failed the bar, 2,541 open by
  design, both times): the two reports are **byte-identical apart from their timestamp line**, which is the expected null result and
  is not evidence for this fix. The unit tests over the real `parseTurn` are.
- **`saysMovingOn` is string-level, like the rest of the filter.** It matches the usual wordings (move on / move to / on to the next /
  next piece / leave that there / park that / come back to that / keep moving / press on). A genuine move-on worded some other way
  ("that is enough on this one") is replaced by `MOVING_ON`, which says the same thing — the cost is the model's own wording, not the
  member's understanding, which is why the rule errs this way.
- **An acknowledgement in front of the move-on is lost.** "Good. Let us move on." becomes `MOVING_ON`, because only the *first*
  sentence is examined and a later one is never promoted in its place (promoting one would reopen #131's risk of carrying the
  abandoned beat's substance). A model that puts the move-on second therefore reads a little flatter than it wrote.
- **Nothing ties the filter's test to the engine's** (half of it does since issue #184: the score half is `gettingNowhere`, called by
  both). `moving` in `parseTurn` re-derives the rest of `applyTurn`'s advance test (rung `advance`, no `beat_complete`, no
  `data_request`) and is a second copy of it that has to be changed with it.
  It is also one condition looser, as it was before #165: `applyTurn` only advances on an `exhibit` turn, while `moving` is true on a
  `direction` turn at that rung too. Nothing reaches that combination today — `nudgeLevel` returns `none` outside the `exhibits`
  stage, so a direction turn is always at the bottom rung — but if that ever changed, a direction reply would be replaced by
  `MOVING_ON` without the case moving anywhere. Which rung fires when was out of scope here (#164).

## A member who is nearly there every time (issue #184, 2026-11-18)

- **Unverified against a real model**, like every other change under `supabase/functions/**`, and this one turns on a score only a real
  model produces. The unit tests put the pilot's two shapes through the real `handleLive`; `npm run dryrun:live` scores `partial` from a
  script, not from reading anything. **It needs `npx supabase functions deploy live-case` to reach anybody.**
- **The threshold is judgement, not measurement.** `CIRCLING_PARTIALS = 3` in `supabase/functions/_shared/liveCase.ts`: the third
  `partial` in a row with no clear step between them counts as circling, which puts the member at the same rung a stuck member would be
  at after the same number of messages. Two is left alone because two is a member closing in. Nobody has measured how often a real model
  says `partial`, so nobody knows how often this fires: if it says it freely, a member is moved on at their fourth message on a part more
  often than the design intends; if it rarely says it, the fix costs nothing and buys nothing. The pilot run of 2026-11-18 is one case.
- **Nothing holds `partial` to what the member wrote.** `assessmentOf` / `madeAStep` (issue #130) only ever take `progress` away, so the
  floor under the score does not reach `partial` at all: a model that calls every message `partial` now moves the member on at their
  fourth, where it used to leave them there for ever. That is the intended direction, but it is still the model's word, and the obvious
  extension — holding `partial` to the same test, or down-scoring a `partial` that names nothing — was not done here.
- **`partial` still extends the clock, and that was left alone.** `recordAssessment` sets `lastProgressAt` on `partial` as well as on
  `progress`, and `stageEndsAt` reads it, so a member who is nearly there keeps the exhibit stage open longer — the competent-wrong
  member of the pilot was buying time by being wrong. With the move-on in place the buying stops at four messages, so the extension is
  bounded rather than removed. Taking it away would shorten the part for the member who really is closing in, which is the behaviour the
  issue asked not to punish.
- **The advance test is now one function, read from two places, but only half of it.** `gettingNowhere` is shared by `applyTurn` and by
  `moving` in `parseTurn` (which is what the entry two sections down says had to be changed in step), so the score half cannot drift
  again. The rest of `moving` — rung `advance`, no `beat_complete`, no `data_request` — is still a second copy of `applyTurn`'s
  conditions, and is still one condition looser (it is true on a `direction` turn at that rung, which nothing reaches today).
- **The counter is per beat and starts at zero for a session already running.** `BeatRecord.partials` is optional for the same reason
  `asked` is: a case saved before the deploy has no count, so its member starts the run again on their next message. Nothing migrates.
- **What the dry run can and cannot show.** The `circling` candidate (issue #181) writes half-answers and then presses "move on" itself,
  so what the change moves there is which of them ends the part, not whether the case finishes: its beats come out `coach_moved` where
  they were `member_moved`, and in learning mode nothing changes at all. A member who neither circles nor presses anything is not in the
  harness, because the harness has no such candidate.

## The timer-driven hint is gone, and the 30-minute hard stop is not (issue #188, 2026-11-18)

- **What went.** The whole timer-driven hint path, which no client could reach: `nextNudgeAt` (it returned null unconditionally), its
  field on `LiveView`, the `nudge` action (the entry in `LiveAction`, its dispatch in `handleLive`, the `case 'nudge'` in
  `supabase/functions/live-case/index.ts`'s `readAction`, and the `nudge()` handler), the `nudge_process` and `nudge_directional` turn
  kinds with their directive text, `LiveClient.nudge` and the `nudge` method on `LiveCaseRepository`, the client effect in
  `src/features/live/useLiveSession.ts`, the unreachable `// a hint` tail of `applyTurn`, the two lines of `kindOf` in
  `src/test/memoryLiveDeps.ts`, and the `--nudge` turn of `npm run pilot:live`. The owner ruled on it (issue #188, comment of
  2026-11-18): delete rather than document.
- **What deliberately stayed, because both look dead and are not.** `recordHint` is called by the message-path rungs in
  `liveCaseCoach.ts` (the `process_hint` / `directional_hint` gate and the `lead` gate); only its use in the `// a hint` tail went.
  `MOVING_ON` is the stand-in for an advance reply in `parseTurn` and in `movingOnOnly`; only its use in the timer-advance branch went.
- **The rule did not change.** "Help is never unprompted" (DECISIONS.md, section 1) is now held by there being no path rather than by a
  guard on one: the only thing that produces a coach reply is `converse`, which runs because the member wrote something. Nothing in the
  member's experience changes.
- **The guard stays, and it is now the whole of the enforcement** (the PM ruled on 2026-11-18). `nextNudgeAt` was dead in the strict
  sense: nothing called it and nothing could. `nudgeLevel(..., 'timer')` has a caller — the dry run's `unprompted` check asks it on
  every step — so it is exercised rather than merely unviolated, and it is the one place the rule is held. Resting the rule on the
  absence of a path instead would be true today and undone in silence by the first person to add one.
- **DECISIONS.md section 1 named `nextNudgeAt`; the PM has made the edit in this PR.** The parenthesis read "`nextNudgeAt` returns
  null, `nudgeLevel` returns `'none'` for `via: 'timer'`", and the first of those no longer exists. A developer may not edit
  `DECISIONS.md`, so the PM did it (commit `3c18912`). The parenthesis now names only the surviving `via: 'timer'` guard and says the
  rule rests on that guard plus there being no action a client can send to reach help, with `npm run dryrun:live` checking it on
  every step.
- **The dry run watches the rule a different way now.** `run.unprompted` used to count views whose `nextNudgeAt` was not null. With the
  field gone it asks the engine directly — `nudgeLevel(state, now, 'timer') !== 'none'` — so the summary line "replies the clock asked
  for unprompted (must be 0)" means the same thing and still reads 0. Had it been left alone it would have counted every step of every
  run, because a missing field is `undefined` and `undefined !== null`. **"Must be 0" is the report talking, not the bar:**
  `failedTheBar` is leaks, answers reached and runs that did not finish, so a non-zero count here would print and the run would
  still exit 0. It tells a reader who looks and stops nobody who does not.
- **The deploy order is safe either way, and only one of the two can happen.** Merging ships the website; the Edge Function ships on a
  separate `npx supabase functions deploy live-case`, which the owner has said will happen once after this merges, carrying #198 as
  well. Website first (what will happen): the new bundle has no nudge effect, so nothing sends the action, and the old function would
  have answered it with nothing anyway. Function first: a browser still running the old bundle has the effect, and the field it guards
  on is now missing — `undefined === null` is false, so the guard passes, and `now < undefined` is false too, so it would POST `nudge`.
  `readAction` rejects an unknown type with a 400 before `handleLive` sees it, the effect swallows the error, and its own `RETRY_MS`
  holds it to one attempt every four seconds while such a tab sits in the exhibit stage. No state changes, no model call, no money, and
  nothing on screen. It ends when the tab reloads.
- **`readAction` is the gate in that second order and is not unit-tested** (it lives in the Deno entry point, which the Vitest suite
  cannot import). That was true before this change; it matters a little more now.
- **The 30-minute hard stop is reachable, and the shape of the session that reaches it is known.** `settle` ends a stage on its own
  clock whenever that deadline falls *before* `hardEnd`, and only reaches the limit branch (`endReason: 'time_limit'`) when it does
  not. `deadlines()` clamps every stage's hard deadline to `end - laterPlanned(stage)`, so the only stage whose deadline can equal
  `hardEnd` is the closing one, the recommendation. Two things have to hold at once. First, **the stages before it have to have eaten
  the plan's flexible time**, so the recommendation's own window ends at `hardEnd` or within `WRITING_GRACE_MS` (30 s) of it: the
  flexible time is `limitMs` (the discussion's planned time plus `AROUND_EXHIBITS_MS`, 15:00) less what the stages actually plan for,
  which is **3:30 in a case with a brainstorm and 5:30 in one without**, because the 15:00 reserves a brainstorm's two minutes whether
  the case has one or not. The exhibit discussion is what normally eats it: its hard deadline is `hardEnd - closingNeeded` rather than
  its planned end, so a member with parts still open who is scored `progress` or `partial` within `PROGRESS_WINDOW_MS` (60 s) of that
  deadline keeps it open. Second, **the member has to still be writing the recommendation when its 90 seconds run out**, because the
  writing grace is what pushes that stage's deadline the last few seconds onto `hardEnd` (it is capped there), and because a member who
  hands in finishes the case `completed` instead. (If the slack is gone to the last second the writing window already ends on
  `hardEnd` and the typing does not matter, but that is the narrower case.) `src/data/liveCase.test.ts` has had a unit test of exactly that session since before
  this issue ("enforces the 30-minute limit when the clock is the thing that runs out"): progress at 26:40 holds the discussion open,
  the recommendation starts at 28:10, and a draft saved at 29:35 carries its deadline to 30:00. So the branch is covered by the suite
  even though no dry-run candidate produces it.
- **The issue's own guess was the wrong way round.** A member who pauses cannot reach it (`settle` returns the state unchanged while
  `pausedAt` is set), a learning case cannot (it is untimed), and a member who walks away cannot either: with no progress recorded,
  `stageEndsAt` holds the discussion to its *planned* end, every stage then runs out in turn and the case finishes `completed` with the
  slack unspent. It is the engaged member, not the absent one, who can reach the limit.
- **None of this is a measurement of real sessions.** It is the arithmetic of the plan read off the code, plus the dry run over the 847
  live-eligible cases, which reaches it in 0 of 27,951 runs with all eleven candidates in all three modes (measured for issue #181;
  repeatable with `npm run coverage:engine`, the reader PR #191 put in the repo for issue #186). Nobody has seen a real member reach
  it, and nothing here says how often it happens. The clock was not changed, which is what the issue asked.

## A fact that mentions the candidate (issue #156, 2026-11-17)

- **The defect was 18 times bigger than the issue said, and that is what chose the route.** #149 had counted only the sentences that
  *also* name the book (16 of 28). Measured here over every fact and clarifying answer of the 872 write-ups, with the engine's own
  `hasTell` imported rather than copied: **286 sentences in 201 write-ups were dropped by the reply filter, 198 of them the whole of a
  fact or a clarifying answer**, so the member who asked for one of those got the stand-in line (`FALLBACK`) and none of the figures.
  285 of the 286 were the third-person rule; 270 of those matched on the words "the candidate" alone. A content rewrite would have been
  ~198 sentences in ~200 cases and would reach members only at the next seed reload, which is not scheduled; the rule change needed
  nothing but a deploy of the function, which happened the same day. Hence the engine route.
- **What the rule now does.** `talksAboutThem` in `supabase/functions/_shared/liveCaseCoach.ts`: a sentence that names the member in the
  third person is a tell when it carries the model's own voice in the same breath (`I`, `me`, `my`), when it instructs them
  (`should`, `must`, `needs to`, `has to`, `is expected to`, ...), or when it holds no figure of the case — a pointer such as "Exhibit 1"
  does not count as a figure. Otherwise it is a fact and is read out **as written**. After the change the filter drops 246 sentences and
  165 whole facts or answers: **40 sentences in 35 cases reach the member who asks, 33 of them the whole of a fact or an answer.**
  Nothing that used to pass is dropped now (measured, 0 newly dropped).
- **Unverified against a real model**, like every other change under `supabase/functions/**`. It is deployed (live-case version 23,
  2026-11-17). The unit tests put the measured sentence shapes through the real `handleLive`; no model has been asked since.
- **The fact is read out in the write-up's words, stage direction and all.** A kept sentence is not rewritten into the second person, so
  a member can read the condition the write-up puts on a fact ("given only once the candidate asks for them") before the figures.
  Rewriting "the candidate" to "you" was tried on paper and dropped: a case about schools says "a student" and means a pupil (A-Plus
  School District, Quahog Public Schools), and an instruction to hand an exhibit over does not survive the substitution. The directives already ask the model for the second person; this
  filter is the net, not the author.
- **A sentence that both instructs the member and carries figures is still dropped**, and four of those are data rather than an
  inference: To Automate or Not, Bolsen Pharma, Fitness Startup Kiosks and Maldovian Coffins each hold one. The other seven of the
  eleven are the book's own conclusion told to the candidate with the figure that proves it, which is right to drop.
  Whether the four figures are reachable elsewhere in those write-ups was not checked.
- **150 of the sentences still dropped carry no figure**, and a few of them are facts rather than stage directions (a list of target
  regions, a brainstorm's named answers). Keeping them would mean a rule that cannot tell a qualitative fact from a stage direction;
  the figure test was chosen because it is the thing a member asks for and the thing #83 is about.
- **One book-naming sentence now reaches a member**: Chateau (Tuck Case Book 2009) has a clarifying answer that names the member, holds
  a figure and mentions "the book's estimate", so `npm run audit:live` reports `still naming it after the reply filter` as **1** where
  it was 0. It is a content fix of the #149 kind (reword the answer) for the next batch, not a filter fix: no filter can unsay a book
  the sentence is built around.
- **The neighbouring rule has a false positive nobody has fixed.** `INSTRUCTIONS` matches "the directive", so Donatella Co.'s one-sentence
  fact about an EU reporting directive is dropped whole and its two revenue thresholds never reach a member. Found while measuring #156;
  out of scope there (a different rule), and still open.
- **The rule is string-level, like the rest of the voice filter.** A model that talks about the member some other way ("one would
  usually start with ...") still goes through, and a model that writes a genuine tell with a figure in it and no instruction word
  ("the candidate is at $4M already") is now kept. The audit's two new counts are what would show drift.

## The interview's register, and the ladder's entry condition (issue #130, 2026-11-17)

- **The register half is unverified against a real model, and it is the half that matters.** The interview mode's system prompt, its
  exhibit and direction directives and its first-rung instruction in `supabase/functions/_shared/liveCaseCoach.ts` now say that a reply
  never confirms, denies or grades the member's reading and never introduces a driver they did not raise. No model has been asked since.
  The unit tests exercise the code-side checks on the pilot's own replies, and `npm run dryrun:live` stubs the model, so neither can say
  whether the register moved. It is deployed (live-case version 23, 2026-11-17).
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
- **A clarify reply in an interview is not checked for a volunteered driver, and only the prompt prevents one (issue #185).** The scope
  is deliberate (DECISIONS.md, "The interview register and clarifying questions"). Watch-item: **0 observed in 2 turns, not measured
  beyond that.** On 2026-11-17 the two real-model pilot transcripts held 4 clarify replies, none matching the `VERDICT` patterns and none
  volunteering a driver on reading; n is 2 in the one run under the interview register, an anecdote and not a rate. If a clarify reply
  is ever seen handing over a driver, the guard to build is `sharesSubstance`-shaped, not `withoutVerdicts`.
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
  tests only exercise the code-side check. It is deployed (live-case version 23, 2026-11-17).
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
  on a part that hands over no exhibit reads like an interviewer putting a question is unknown. It is deployed (live-case version
  23, 2026-11-17).
- **The clock grew, by design and by a lot.** Beats per case went from 2.98 to 4.86 and the median planned case from 31 to 39 minutes;
  272 of the 847 eligible cases now plan the full 25-in-40 ceiling, against 57 before. Nothing runs longer than the ceiling, but a
  14-beat case shares 25 minutes between 14 parts (about 1:45 each before the budget is reshared). Whether a 39-minute case is one a
  member will sit through is a product question the pilot and real use will answer.
- **What the clock does to the help ladder, not only to the length** (issue #164, found by the interaction pass of 2026-11-17 over the
  nine live-case PRs of that day, with the pre-#141 engine as the control, and fixed the same day). The entry above records the 1:45-a-beat
  arithmetic but not what a beat's budget is actually *for*: it is the only thing `behindSchedule` measures a beat against, and that
  decides whether the ladder skips its second-to-last rung — `lead` in practice (the one rung where Bucket stops asking open questions
  and says plainly where to look) and `directional_hint` in interview. `beatBudget` shared out the time to the discussion's **planned**
  end (`d.soft`), so once cases were long enough to reach it with beats still to come, every beat brought out in the flexible time was
  born with the 30-second floor and was behind schedule 30 seconds in. Measured the same way on both engines (844 live-eligible
  write-ups, practice and interview, 1,688 runs, a member message every 75 s, never completing a beat and never pressing "move on"):
  `advance` reached by the skip went from **412 of 4,894 `advance` decisions (8.4%)** before #141 to **2,354 of 7,358 (32.0%)** after it,
  548 of 1,688 runs and 274 of 844 cases. The fix shares out the time to the discussion's **latest** end (`d.hard`) instead, which is
  the time it really has: **354 of 7,080 (5.0%)**, 96 runs, 48 cases, 6 beats under a 2:00 budget (was 352) and none at the floor (was
  20, in 10 cases). The budget moves no stage end, so the 25-in-40 ceiling and the closing reserve are untouched; a stuck member now
  covers slightly fewer parts in the same time (7,614 beats revealed against 7,908), which is the rung being given back to them.
  **It is deployed** (live-case version 23, 2026-11-17).
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

## The brainstorm, where the book puts it (issue #133, 2026-11-17)

- **Nothing of this is verified against a real model or a real member.** `planBeats` now places a brainstorm among the parts of the
  case, the stage machine stops the discussion for it and picks the discussion up again afterwards, and the unit tests,
  `npm run audit:live` and `npm run dryrun:live` all agree the cases run (10,164 of 12,705 runs reach the end, exactly as before; the
  rest are the learning-mode stalls that are open by design). The dry run stubs the model, so whether a mid-case brainstorm *reads*
  right to a member — Bucket asking for ideas, then going back to an exhibit — is unknown. It is deployed (live-case version 23,
  2026-11-17).
- **Where a brainstorm sits is a guess wherever no step names an exhibit**, exactly as it is for an analytical step (issue #128). The
  brainstorm is placed by the same rule, so a write-up with no step naming an exhibit hands the exhibits over first and the brainstorm
  follows them, which is where it already was. Measured over the 847 eligible write-ups: 177 cases have a brainstorm, 196 brainstorm
  beats in all, and **118 of them in 110 cases now come before a later part of the case** (35 immediately before an exhibit). Swift
  Business (Fuqua 2025-26), one of the two cases in the issue, is a case in point: its steps name "Exhibit #1 ... #2 ... #3" but its
  exhibits are titled by subject and carry no label, so nothing links the two lists and both its brainstorms still run after all six
  exhibits. They do both run now, in the book's order; their position did not move. The durable fix is the same field in
  `private-data/` the #128 entry asks for.
- **A brainstorm is matched by the word anywhere in the step's title.** "Framework and brainstorm: leveraged versus decentralized",
  "Calculate NPV of each career and brainstorm other considerations" and "Sample answers to brainstorm X" (about 25 of the 196) become
  brainstorm beats whose topic is the whole title, because `brainstormTopic` only takes a heading off the front. Those steps were
  already treated as the case's brainstorm before this change (they set `hasBrainstorm`); what is new is that they are now asked in
  place, and that a step with analysis in it as well as a brainstorm is asked as a brainstorm only. Reading more of those titles means
  judging which part of a double-barrelled step is which, which the data does not say.
- **The brainstorm's own `BeatRecord` is bookkeeping.** It is what makes the case pick up where it left off, and it carries an outcome
  (`member_moved` when it is handed in, `timed_out` when the clock takes it) that means nothing about how the member did. It is left
  out of the feedback's "how each exhibit ended" line and out of the dry run's beat counts for that reason; anything else reading
  `state.beats` has to know it is there.
- **A second brainstorm shortens the discussion by two minutes** rather than making the case longer (40 minutes stays the ceiling of
  issue #82). It bites in 21 cases of 847, one of which (BankCo, Stern 2018) has three and loses four minutes of discussion. The first
  arrangement tried — letting the case run to 42 or 43 minutes — was dropped because it broke a case that used to complete: BankCo's
  passive dry run then ended at the time limit instead of finishing.
- **The progress strip was fixed in issue #150** (2026-11-17). It used to find the current step in the unfiltered `STEPS` list and
  compare that against the index of the *filtered* one, so in a case with no brainstorm (670 of the 847 eligible) the Recommendation
  pill was never marked and every pill before it looked finished. `caseSteps` in `src/domain/liveCase.ts` now builds the one list that
  is drawn and read, and a brainstorm the member has handed in stays filled in while the case goes back to the discussion. What is
  left: that "already handed in" test reads `view.submissions`, and a brainstorm the clock took with **nothing written** leaves no
  submission (`captureTimedOut` saves only non-empty text), so in that one case the Brainstorm pill shows as still to come while the
  discussion carries on. Telling it apart needs something the Edge Function does not send today.
- **The strip no longer calls the discussion finished while a mid-case brainstorm runs (issue #166, 2026-11-17).** An interaction
  between #148 and #152, not a bug in either: `caseSteps` filled a pill in when it was earlier in the list than the stage, which was
  the same as "finished" only while the brainstorm ran last. Since #148 it does not (100 of 844 live-eligible cases have a brainstorm
  that is not the last beat, 20 of them before any part of the discussion). The discussion now has a fourth look, `open` (a tint of the
  accent colour since issue #176, no mini Bucket), used while the case stands in a brainstorm with `beatsShown < beatsTotal`. What is
  left:
  - the view says how many parts of the plan the case has reached, not **which** ones. When the clock ends the discussion early the
    parts it did not reach are let go and the case goes to the brainstorm and then to the recommendation, so during that brainstorm
    the discussion is drawn as open although the case will not come back to it. The careful reading (open, not finished) was chosen
    over guessing; the pill is filled in as soon as the recommendation starts. The same happens in a session whose plan has no
    brainstorm beat of its own (a write-up whose brainstorm is only a table of ideas, or a case saved before #148), because entering
    the brainstorm pushes no `BeatRecord` there.
  - a case with two brainstorms still fills the Brainstorm pill in after the first one is handed in, which is #152's decision and
    unchanged: the view carries no count of the brainstorms a plan has left.

## What the browser pass of issue #176 saw, and what it could not (2026-11-17)

- **The four states were measured and redrawn, and the rules behind them are untouched.** `caseSteps` decides the same four states it
  decided before; only `ClockBar` changed. `done` is a flat grey fill with a tick, `open` a tint of the accent colour with a
  continuation mark, `current` the solid accent with the mini Bucket, `ahead` a dashed outline with no fill and no mark. The looks were
  checked in a browser at 1,280 px and at a real 390 px viewport, in light, in dark and under a `grayscale(1)` filter.
- **A part standing open is still drawn and read the same whether the member has worked part of it or has never been in it**, which was
  the sharper half of #176 and is **not** fixed, deliberately. The view says how many parts the case has reached (`beatsShown` against
  `beatsTotal`), not which, and the brainstorm beat is counted in that total in some plans and pushed as no beat at all in others, so
  "has a discussion beat been worked?" cannot be answered from it without guessing. What the state word says was chosen to fit both:
  "still open" claims nothing about progress, and the continuation mark says the part is not closed rather than that the member is part
  way through it. **The durable fix is a field on the view** that says which parts of the plan have been reached (an Edge Function
  change), which was out of scope here as it was in #152 and #167.
- **The state word reaches a screen reader as the list item's accessible name** (`aria-label` on the `<li>`, `STEP_STATE_WORD` in
  `src/domain/liveCase.ts`), because a visually hidden span would change the pill's `textContent` and #152's and #167's tests read
  that. **No screen reader was run.** Browsers expose the name, and the tests assert it, but NVDA in browse mode is known to read a
  list item's content rather than its name, so a member using that combination may hear "Prompt" without "finished". The visual marks
  (tick, continuation, mini Bucket) do not depend on it.
- **At 390 px the pills now wrap 3 + 2 where they wrapped 4 + 1.** Nothing about the wrapping changed — same `flex-wrap`, same gaps,
  same padding — but a tick or a continuation mark makes a pill about 18 px wider, and the first row had about 15 px of room. Measured
  at a 390 px viewport: the list is 358 px wide and the five pills are 82, 105, 86, 106 and 124 px. It still reads as a wrapped list,
  and the second row is no longer one lone pill. **The 390 px viewport had to be forced through the DevTools protocol**: headless
  Chrome on this machine will not make a window narrower than 484 px, so a `--window-size=390` screenshot is a 484 px page cropped to
  390 and wraps one pill too late. Any future phone check of this app should set the viewport with `Emulation.setDeviceMetricsOverride`
  rather than trust the window size.
- **Nothing was looked at inside a real live case.** The pass rendered `ClockBar` from fixtures against the app's own stylesheet, with
  no model call and no live-case start (the issue forbade spending one). The strip has no behaviour of its own beyond `caseSteps`,
  which the unit tests cover, but nobody has yet watched the states change as a real case moves.
- **`open` survives greyscale on its mark, not on its fill.** The accent tint is very light (`--accent-soft`), so under a greyscale
  filter it is nearly the page colour; the continuation mark and the darker text are what separate it from `ahead` there. The pair the
  issue ranked first, `done` against `ahead`, separates on fill, border and mark at once.

## Asking outright for the answer (issue #142, 2026-11-17)

- **Unverified against a real model.** `refusedTurn` in `supabase/functions/_shared/liveCaseCoach.ts` turns a `refusal` stop reason
  into the in-character line instead of the failure message; the unit tests stub the stop reason, and no real refusal has been seen
  since. It is deployed (live-case version 23, 2026-11-17).
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

## What a part with no exhibit says it is about (issue #163, 2026-11-17)

- **Unverified against a real model.** The topic comes from the engine, so the opening line itself is deterministic and tested; what a
  real Bucket then does with a member who has been handed the topic is not. The dry run's stub emits one fixed sentence, so nothing
  here says whether the register reads well mid-case. It is deployed (live-case version 23, 2026-11-17), and a case already running
  keeps the plan it started with, topics and all.
- **The test for "the title is the answer" is lexical.** `TITLE_IS_THE_ANSWER` in `supabase/functions/_shared/liveCase.ts` reads the
  words the books actually use ("why", "because", "driven by", "confirm", "lacks", "lags"), which covered 70 of the 2,723 parts talked
  through on 2026-11-17. A title that states a finding in plain words with none of those markers still passes: the one found by hand
  puts the finding in a trailing parenthesis. Nothing measures that class, and only a person reading a title can tell.
- **A topic can still carry the book's own cross-reference.** A step the book titles "... (Exhibit 4)" or "... (Q5-Q6)" keeps that
  parenthesis, and the exhibit it names may be one the member was never handed. About 30 titles in the library hold one. It was left
  alone to keep the rule small; a trailing-reference stripper is the obvious fix.
- **Bucket's line for a part that is talked through lives in the screen, not in `bucketLine`.** `LiveSession.tsx` swaps the stage's
  line for its own when nothing is on the table, and tells the two apart by the mood `bucketLine` returned, which is an indirect way
  of asking "is this the stage's generic line?". The tidier home is `bucketLine` in `src/domain/liveCase.ts`, which this change was
  asked to stay out of (#167 had just changed that file).
- **The 33 parts whose title names an interviewer-side table say nothing.** Dropping the topic is the safe side of the rule (the
  member is never told the name of a table they will not see, issue #95), but those parts are back to being unnamed. The write-ups
  could be retitled instead; nothing flags them. (It was 32 until issue #194 took the numbering off one more title, whose subject is
  then exactly a hidden table's name.)

## A case with no exhibits, run as the conversation it is (issue #193, 2026-11-18)

- **Unverified against a real model, and the part that most needs one is the part that is only a request.** Two of the three defects
  are code and are tested (the conversation the model reads no longer says an exhibit was shown for a part that handed nothing over;
  the stage it is told about is called Discussion when the plan has no exhibit beat). The third — Bucket offering to show data on a
  case with none — is answered by taking the promise out of the `direction` directive, and a directive is a request. Whether a real
  model stops offering data cannot be seen from here. `npm run dryrun:live` stubs the model with one fixed sentence, so no directive
  text influences any of its 27,951 runs, and the two reports (before and after, 847 cases, 0 that failed the bar, 2,541 open by
  design) are byte-identical apart from their timestamp — the expected null result, and not evidence for the fix. The unit tests over
  the real `handleLive`, `turnRequest`, `writtenRecord` and `parseTurn` are. **It needs `npx supabase functions deploy live-case` to
  reach anybody**, and a session already running keeps the plan it started with.
- **The message kind on the wire did not change, and that was the choice.** A part notice is still `kind: 'exhibit'` whatever kind of
  beat it opened; what changed is that `history()` and `writtenRecord` now read the beat behind it (`beatShown` / `showedAnExhibit` in
  `liveCaseCoach.ts`) instead of trusting the kind. Re-typing a step notice as `'notice'` would have been invisible on screen
  (`liveParts.tsx` draws the two identically) but would have dropped those notices out of the written record, which has an `'exhibit'`
  branch and none for `'notice'` — and a `'notice'` branch could not simply be added, because the same kind carries the opening prompt
  and the stage-change lines, which are deliberately not in the record. It would also have split sessions saved before the deploy from
  sessions saved after. The cost of the route taken: the kind no longer means what it says on its own, and a third reader of
  `Message.kind` has to know to ask the plan. Both readers that matter go through the one helper now.
- **`withoutDataPromise` is a string replace on one sentence of three directives.** `DIRECTIVES.direction`,
  `INTERVIEW_DIRECTIVES.direction` and `LEARNING_DIRECTIVES.direction` all contain "say you will show them some data"; reword any of
  them without rewording `DATA_PROMISE` and the replacement silently stops happening for that mode. The test asserts the *replacement*
  sentence is present on a no-exhibit case in all three modes, so a drift fails rather than passing in silence — that positive
  assertion is the whole of the protection.
- **The `exhibit` turn directive still opens "The student is working on the exhibit"** on a part that hands over nothing. That is true
  of every case with a talked-through part, not only of these 246, and the only thing correcting it is `beatContext`, which says "There
  is no exhibit here: you are discussing one part of the analysis with the student in conversation." on the same request. Rewording the
  directive per beat kind was out of scope here; it would change the prompt for every case in the library.
- **The debrief the member reads is still whatever the model writes.** `parseFeedback` takes `d.stage` straight from the model's JSON
  and nothing checks it against the stage names. Telling the model "Discussion" is the whole of the fix for the debrief heading; a model
  that writes "Exhibits and discussion" anyway is not caught. The member-facing strip and stage heading have never been the model's
  (`stageHeading` in `src/domain/liveCase.ts`), and are untouched.
- **"No exhibits" means no exhibit beat, not no data.** A case with no exhibit of its own can still hold the interviewer's reference
  tables and data given on request, and those are still read out when the member asks for them, at the same budget as before. Only the
  unprompted promise of data changed.
- **Two neighbours were left as they are.** `feedbackRequest` still lists the parts as "Exhibit/topic 1: ...", which covers both kinds;
  and the member-visible wording of the part notices is a separate issue (#194 took the book's numbering out of the topic).
- **The count of 246 of 847 is the issue's, measured on 2026-11-17** against the git-ignored write-ups. Nothing here re-measured it, and
  nothing in CI can: `private-data/` is not in git.

## The numbering `STEP_HEAD` takes off, and the numbering it leaves (issue #194, 2026-11-18)

- **Unverified against a real model**, like every change under `supabase/functions/**`. The evidence is the library measurement and
  the unit tests. **It needs `npx supabase functions deploy live-case` to reach anybody**, and a session already running keeps the
  plan it started with, topics and all.
- **The nouns are a list, and the list is what was measured.** `NUMBERED_NOUN` in `supabase/functions/_shared/liveCase.ts` holds the
  filing words the 872 write-ups actually use (phase, bucket, analysis, option, alternative, scenario, approach, idea, stream, data,
  decision, answer). A book that files its parts under a word nobody has used yet goes straight through, and nothing in CI can see
  it: the measurement needs `private-data/`, which is not in git. Re-run it after a batch of write-ups is added.
- **One word in front of the noun comes off with it.** That is what makes a two-word filing label work ("<word> question 2:"), and it
  means a one-word subject sitting in front of a numbered filing noun would be taken as well. Nothing in the library has that shape
  today; a negative test pins the shapes that do (a subject, then a comma, then the numbering; a framework whose name starts with a
  digit; a percentage; a filing word used as a verb).
- **Numbering that is not at the head is still handed over.** `STEP_HEAD` has only ever worked on the head, so a number inside or at
  the end of the phrase stays: **66 of the 2,620 topics** handed over hold one, most of them an exhibit, chart or slide the step
  names. That is the same class as the trailing-cross-reference bullet in the #163 section above (which counted the trailing
  parenthesis only, about 30), measured the wider way. Left alone deliberately: a named exhibit is a thing the member is shown, not
  the step's place in the write-up.
- **The first draft of the widened rule could be made exponential, and nothing but a hand-written stress check found it.** A head that
  chains numbers and then stops without the separator ("<noun> 1 and 1 and ... x") took seconds at 24 links, because the chain's
  `\s*#?\s*` is two optional runs of space around an optional character and the engine tried every way of splitting them. It is one
  character class now and the chain stops at four numbers; a test in `src/data/liveCase.test.ts` sends forty links through, so the
  suite hangs rather than passes if it ever comes back. **No other regex in `liveCase.ts` or `liveCaseCoach.ts` has been checked for
  the same shape**, and nothing in CI would catch one: every title the live case reads comes from our own write-ups, so the cost is a
  slow request rather than an opening for anybody.
- **A filing noun with no number keeps its word**, on purpose: those words are also ordinary words and what follows the colon can be
  the book's finding rather than its subject. So a part headed with one of them still opens with the filing word in front of its
  subject.
- **Two topics in one case name the book's own suggested answer as their subject.** `TITLE_IS_THE_ANSWER` does not match them (no
  "why", "because", "driven by"), and this change neither adds nor removes the exposure — the same words were already on screen,
  behind the numbering. It is the same lexical gap the #163 section records, found again from the other side.

## The thanks for a hand-in, and the engine lines a member never reads (issue #195, 2026-11-18)

- **Unverified against a real model**, like every change under `supabase/functions/**` — though nothing here asks a model anything:
  the line is fixed and the engine says it. **It needs `npx supabase functions deploy live-case` to reach anybody**, and the website
  half (the two screens that read the line back) ships with the merge, so for a while a browser may ask a function that never says it.
  Nothing breaks in that window: `handInLine` finds no message and the screens read exactly as they do today.
- **Most of what the engine says is never on screen, and this is the first change that had to care.** A `say` is shown only where a
  `Thread` is mounted: the prompt stage, the framework's "where would you start?" phase, and the exhibit discussion (filtered to that
  stage's own messages). The thinking stages, the writing stages and the end of the case mount none, and cover the engine's words with
  the screen's own copy, so a line said in the stage the member is leaving is recorded and never read. That is why the acknowledgement
  is said *inside* the stage it opens and why two screens read it back out of `view.messages` (`handInLine` in
  `src/domain/liveCase.ts`). Nothing stops the next engine line from being written into a stage nobody can see it in, and no test
  compares the two sides.
- **`handInLine` identifies the line by where it sits, not by a mark on it**: the first message of the current stage, from the coach,
  of kind `text`. Nothing else produces that shape today (every other stage opener is a `notice`, and an exhibit reveal is an
  `exhibit`), so it is exact — but a future engine line said first in a stage in Bucket's voice would be read as a thanks and put in
  front of a thinking stage's own line. A message kind of its own would settle it; it was not worth the churn through the view, the
  client types and the thread renderer for one line.
- **The thanks is in the written record the feedback model reads.** `writtenRecord` keeps coach messages of kind `text`, so the
  evidence now carries "[Discussion] Interviewer: Thanks, I have your ideas." in front of the member's handed-in answer. It is true,
  it is three words, and it says nothing about the work; a `notice` would have kept it out, at the cost of the line not reading as
  something Bucket says. The stage it is filed under is the stage it opens (the discussion, or the recommendation), not the one the
  member handed in from.
- **"Moved on" is not a path out of a writing stage, and the tests say so rather than exercising one.** `moveOn` needs the exhibit
  discussion and `ready` needs the prompt or a thinking stage, so the only ways out of the brainstorm or the recommendation box are
  handing in, the clock, and ending the case. The two "moved on by the member" tests assert the refusals and then end the case there.
  If a move-on is ever offered in a writing stage, it reaches `endStage` with `by: 'user'` from a writing stage, which is exactly the
  shape that today means "handed in": the `handIn` argument is passed from `submit` only, so the line itself stays correct, but
  `endStage`'s brainstorm branch would record the beat as `member_moved` either way.
- **Nobody has read the line on the live site.** The paths were walked through the real engine (a script in the assistant's scratch
  folder, not in the repo) and the two screens have unit tests; no live case has been run since.

## How a member likes to meet (issue #98, 2026-11-17)

- **The migration is written and tested but NOT APPLIED.** `supabase/migrations/20261126120000_meeting_prefs.sql` has only been run
  by PGlite (`src/data/meetingPrefs.db.test.ts`). Applying it is the owner's call, every time. **The app half must not be deployed
  before it is applied**: `ProfileSettingsDialog` calls `my_meeting_prefs()` on open, and without the function the section shows its
  error line (the rest of Profile & privacy is unaffected). `e2e/deployed.e2e.test.ts` fails on the new table and the two functions
  until it is applied, by design, as it did for #96 and #121.
- **The link rule exists twice, in TypeScript and in SQL**, because the database has to enforce it as well as the screen.
  `parseMeetingLink` in `src/domain/meeting.ts` and `public.is_meeting_link()` are kept in step by a test that runs 40 inputs through
  both (`meetingPrefs.db.test.ts`, "accepts and refuses exactly the same links"), so they cannot drift silently — but the patterns
  themselves are still two pieces of text, and POSIX and JavaScript regular expressions do not have the same syntax, so they can
  never be compared literally.
- **A phone number in brackets is refused.** `1 (773) 555-0134` is not accepted: the acceptance criteria named digits, an optional
  leading `+`, spaces and dashes, and the database enforces exactly that. The member is told what is allowed, but a US number pasted
  in its usual form is a rejection they did not expect. Widening both copies of the rule is one character class each.
- **The shape check on the time zone is shadowed by the trigger.** `meeting_prefs` has a `check` constraint for the zone's shape and
  a `before insert or update` trigger for membership of `pg_timezone_names`; a BEFORE trigger runs first, so a nonsense value is
  refused with the trigger's message and the constraint is only ever the second belt. The test accepts either message.
- **The zone list is whatever the browser knows.** `timeZoneChoices()` uses `Intl.supportedValuesOf('timeZone')`, with a 13-zone
  fallback for a browser that has none. Restoring a backup is strict about it: a zone this browser has never heard of is left behind
  rather than written back, so a file written on a machine with a newer time-zone database can lose that one field on an older one.
- **Nothing reads either value yet.** It is phase 1 of the scheduling split (#99-#102). Until the scheduling flow exists, the only
  thing a member can do with the section is fill it in, and no screen tells them when it will be used.
- **The save counter is a column, not a log.** 20 saves in a rolling 24 hours is counted by `saves` / `saves_since` on the row
  itself, so the limit is per member, survives clearing the fields, and leaves no history of what was saved when (by design: the
  values are the member's own and we keep no older copies).

## Unverified user-side checks left open

- Whether the "someone said yes" notification email arrives (the owner confirmed the sign-up email flow; whether the "asked you" request email was checked is not known).
- The first real Bucket read on the owner's own feedback (needs written feedback on at least three of their cases).
- Whether Learning mode works end to end on the live site (see above).

## Process

- **The PM and developer agent files are converted to GitHub** (`gh`, pull requests) and saved in `.claude/agents/pm.md` and
  `.claude/agents/developer.md`, but `.claude/` is git-ignored (`.gitignore` line 29), so they exist only on the owner's machine and are
  not in the repository.
- **Both workflow labels exist** (`gh label list`, rechecked 2026-11-17): `proposed` ("Proposed by the PM; waiting for the owner")
  and `approved` ("Approved by the PM agent for the developer to build"), beside GitHub's defaults. They were missing on 2026-11-15.
- **The developer file tells the developer to run "the lint command from CLAUDE.md"**, but there is no lint command (see Tests and CI).
- **Where the agents would find these documents**: `PRODUCT.md`, `ROADMAP.md`, `DECISIONS.md`, `KNOWN_ISSUES.md` and `CLAUDE.md` were
  created at the repo root on 2026-11-15 and committed the same day (`a947c28`); they are kept current in the PRs that change
  behaviour.

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
- **The "What I'm sharpening" card has been read by tests, not by eyes** (issue #121, 2026-11-17). `src/domain/sharpening.ts`, the
  visitor's card and the member's preview are covered by unit, screen and PGlite tests, but nobody has opened either in a browser, and
  phone width — where the two lists stack — is unchecked, the same gap #120's card has. Two edges left deliberately: the card names at
  most three skills a side with no way to see the rest (the point is a short answer, not a table), and the two lines that explain an
  empty preview (too few rated cases, or every skill in the middle band) are shown to the member only, so they have never been seen
  outside a test either.
- **The live case's progress strip has now been looked at, and its four states redrawn** (issues #150, #166, #173 and #176,
  2026-11-17). It was read in a browser for the first time on 2026-11-17 (#173) and four things it communicated badly became #176;
  all four were changed and looked at again at 1,280 px, at 390 px, in dark mode and in greyscale, against the real stylesheet. What
  is left is below ("What the browser pass of issue #176 saw, and what it could not"). The strip itself is no longer an unseen
  surface; the live-case screens around it still are.
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

## What the dry run can reach, and what it still cannot (issue #181, 2026-11-17)

- **The blind spots were measured, not guessed, and the measurement is not in the repo.** Before and after were V8's own coverage
  (`NODE_V8_COVERAGE` on a whole-catalogue `dryrun:live`, with a small script that reports every function and block of
  `liveCase.ts` and `liveCaseCoach.ts` that never executed). Over all 847 cases, before: **16 of the 155 functions the loader saw in
  `liveCaseCoach.ts`, and 9 of 109 in `liveCase.ts`, never ran once**, among them `refusedTurn`, `recordDataRequest`, `pause`,
  `continueCase`, `shiftTimes`, `endEarly`, `saveDraft` and `saveScratchpad`. After: **1 and 0** (the one is `nudge`, below), with 74
  functions and branches reached that never ran before. The reader is now in the repo as `npm run coverage:engine` (issue #186,
  `scripts/engineCoverage.mjs`), so the measurement can be repeated; the honest residue below is the part that was written down.
  **The one remaining unreachable function, `nudge`, was deleted in issue #188** (2026-11-18), so the count a fresh run should report
  is 0 and 0.
- **Still unreachable, and why.** Each of these is a branch the harness cannot execute. None is a defect on its own; the list is what
  a green dry run does *not* cover.
  - **The timer-driven hint**: gone since issue #188 (2026-11-18). It is no longer a blind spot, because there is no longer a path.
    See the section of its own below.
  - **The 30-minute hard stop** (`settle`'s limit branch, `endReason: 'time_limit'`): 0 runs of 27,951 reach it, in any mode, for any
    of the eleven candidates. Issue #188 reasoned out why; the section of its own below has the answer.
  - **Ending a case while a part of the discussion is still open** (`endEarly`'s `timed_out` on the open beat). `interrupted` ends
    the case in the recommendation stage, where no beat is open; ending it in the middle would cost the rest of that run's coverage.
  - **The guards against an action the screen cannot send**: empty text, the wrong stage, acting while the case is paused
    (`submit`, `userSays`, `ready`, `moveOn`'s paused branch, `saveScratchpad` outside the framework stages). The harness only sends
    what the screen can send.
  - **The caps and the collisions**: 4 starts a day, 12 a week, 3,000 actions, 90 coach replies, and every save-collision retry in
    `mutate` and `converse`. One run is one case, played alone, by one member.
  - **The `??` fallbacks for sessions saved before a field existed** (`b.asked`, `plan.limitMs`, `plan.exhibitMs`, `state.mode`): the
    harness only makes new sessions, so they are unreachable by construction.
  - **The second half of `questionIn`**: a verdict that ends in a question mark but has no question to keep.
  - **`SHOW_DATA`**, the stand-in for a direction turn in an interview whose reply was all verdict and whose direction was clear. The
    shape cycle lands an emptying shape on the first direction turn, where the direction is not clear yet, and a surviving one on the
    second: reaching it would need a twelfth candidate whose cycle sits at a different offset.
  - **Feedback that cannot be parsed** and the retry counter (`MAX_FEEDBACK_ATTEMPTS`): `blocked`'s model declines the feedback, which
    covers the "could not be written" path, but no candidate sends feedback that is malformed rather than refused.
- **Four things the improved harness showed about the engine. Nothing was changed for any of them** (issue #181 forbade it: a harness
  change and an engine fix in one pull request cannot be told apart afterwards).
  - **A member scored `partial` on every message is never moved on.** The advance rung only fires for `stuck` or `unclear`
    (`applyTurn`), and `partial` is neither, so in practice and in interview the only ways out of that part are the member's own
    "move on" and the clock. `circling` ends every part itself, in all three modes.
  - **In an interview, a verdict in reply to a clarifying question is not removed.** `withoutVerdicts` runs for the `exhibit` and
    `direction` turns only, so "You are exactly right" reaches the member whole when it answers a clarifying question. That may be
    the right scope — a clarifying answer is not a verdict on their reading of a part — but it was never a decision anyone wrote down.
  - **`hinted` was 0 in every dry run ever because of the harness, not the engine.** With a candidate that takes help and then closes
    the part it is 12,357 of 115,556 beat outcomes, and the engine's rule (`nextBeat`: `b.hints > 0 ? 'hinted' : 'independent'`)
    behaves as written in all three modes.
  - **Two stages now show as running over their planned time** (1,694 `framework_write`, 1,652 `exhibits`, 847 `recommend_write`, 354
    `brainstorm_write`), which is the writing grace and the discussion's flexible time doing their job. Both were invisible before
    because no candidate ever left a draft in the box or kept a part alive with `partial` scores.
- **What the shapes cannot do.** The stub writes fixtures: each shape is worded the way the filter it tests is written for. A
  paraphrase a filter misses is also a paraphrase the stub never writes, so **the harness cannot find a filter's blind spot** — only a
  real model can. "A filter fired" is also not "the member read something good": the harness reads whether the words changed, never
  whether they were any use.
- **The held-figure shape depends on the write-up.** It needs a figure the book worked out in a table the member cannot see and that
  appears nowhere they can look it up, so over the catalogue it was written 382 times against 3,709 attempts that found nothing to
  write and were counted as skipped. The private-note shape needs a recommendation sentence of 80 to 400 characters.
- **The run takes about twice as long**: 27,951 runs in about nine minutes, against 12,705 in about four. It is still free, still
  deterministic, and still not in CI (it needs `private-data/`).
- **`blocked` ends every case without feedback, on purpose**, because its model declines the feedback call as well as the turns. So
  "cases that ended with feedback written" is 22,869 of 25,410 finished runs, and the 2,541 missing are that candidate's.

## The pilot runner (`npm run pilot:live`, issue #125, added 2026-11-17)

- **The whole $2 pilot has run against production** (the owner, 2026-11-17: 8 real starts — there are 8 transcripts in the
  git-ignored `reports/pilot/` — for about $0.21 in all, the figure PRODUCT.md and DECISIONS.md record): the sign-in, the `live-case`
  call, the catalogue RPC and the per-turn usage read worked together on first contact. The one defect the first runs found in the runner itself was
  arithmetic: on a `finish` turn the running total priced the feedback call at the coach model, so it printed about twenty times less
  than that call cost and disagreed with `spend` (issue #134, fixed by building both totals from `spendReport` — `spendWithTurn` hands it the turn not yet on disk).
  **What the pilot is for, it did**: it found seven things about Bucket's words, six of which are fixed and live (#128, #129, #131,
  #133 and #142 in the deployed function, #132 in the reloaded library seed), and #128, #129 and #131 were each proved by re-running
  the exact case that failed. The seventh (#130, an interview reply confirming the member's guess) is deployed on deterministic
  evidence and still unproved against a real model, because the function allows 4 starts per account per day.
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
