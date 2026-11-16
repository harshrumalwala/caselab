# DECISIONS.md

Written 2026-11-15. Each entry says what was decided, why, and where the evidence is. "Owner" is the repo owner who directs the
project in short messages. PR numbers refer to https://github.com/harshrumalwala/caselab. Where the reason was not stated in
the conversation the assistant could see, the entry says "reason not recorded" instead of guessing. Earlier parts of the conversation
survive only as a summary plus the owner's message log, so a few early technical reasons are inferred from the code and README (marked
"inferred").

## Product scope and positioning

- **Built on the MCG template, not a spreadsheet clone.** The original spec made the MCG Excel workbook the primary reference
  (tabs, 13 case types, eight skill categories, opportunity areas) but asked for a modern interactive site, not Excel in a browser.
  Why: keep MCG's evaluation framework and simplicity, make tracking enjoyable. Deviations kept on purpose: behavioral average
  combines Behavioral 1 and 2 (the template reads only 1); "past week" is the calendar week Mon-Sun (template: rolling 7.5 days).
  (README "How it maps to the MCG template".)
- **Under two minutes to log a case; only title, case type and industry required.** Owner's "biggest requirement" in the first spec.
- **Started local-only, then moved to Supabase on the owner's instruction.** The first spec said browser storage with JSON
  import/export and no backend or auth. Once the frontend existed, the owner created a Supabase project named `caselab`, and asked for
  persistent storage and authentication "before we merge the application into `main` and deploy it to Vercel" (PR #2). The owner did not
  prescribe a schema: "don't add unnecessary tables or fields just because they might be useful someday". The assistant's schema
  choices: one `cases` row per case mirroring the form with only title, case type and date required; the eight skill ratings and
  feedback in a single `skills` jsonb column (so adding a skill later needs no migration); an `opportunities` table for the hand-edited
  lists; no other tables, with averages, coverage and trends computed in the browser so a personal dashboard cannot include other
  members' rows; row-level security on `user_id = auth.uid()` with no anonymous access.
- **From personal tracker to community platform, without rebuilding.** The owner asked that everyone keeps their own history and
  dashboard but can discover other students, with control over what is shared ("not restrict everyone to sharing case history alone").
  Existing functionality was to stay largely unchanged.
- **Open self-service sign-up with verified email, restrictable later without a rebuild.** Membership is one database function,
  `is_member_id()`, so restricting to Booth addresses later means editing that function and running `revoke_nonmembers()`. No SSO, no
  admin approval. (Spec; README step 2.)
- **A public front page that lets visitors browse members who opted in.** The owner pointed out that firm reps and 2Y casers will not
  want to sign in each time; only 1Y students doing cases need accounts. Moved the search to the landing page; members still choose
  what to show. (PR #4.) Later additions: show who cased the member and the casebook (PR #5, owner: "those are also important
  details"); front page shows the last five casers by last-cased date, with search for more (PR #6); "only people with my link"
  profiles (PR #8).
- **Considered, deferred: a verified-email "guest tier".** Owner said "I'll consider a verified-email guest tier later." Not built.
- **Excel import is a headline feature, then made easier to find.** Owner asked for migration from an MCG-style Excel with as much
  detail as possible (PR #7); said the front-page call to action "seems hidden", so it was moved up and the import opens right after
  sign-up (PR #34, #35). Owner also asked for a dummy MCG-style workbook to test with.
- **Export fills the real MCG workbook** rather than a lookalike (PR #36), so a round trip loses nothing. Sharing choices and burned
  cases are CaseLab-only and live in the JSON backup.

## Privacy and sharing

- **Private by default; enforced in the database, not the screens.** Owner-only `cases` under RLS; separate trigger-maintained
  projection tables for members (`shared_cases`) and visitors (`public_*`) so private values are not merely hidden but absent.
  Why: so no query, filter, sort or count can leak hidden data. (README "How privacy is enforced"; extensively tested.)
- **Granular switches plus per-case override.** The owner asked that members control which parts of performance and feedback they
  share. Switches include case history, scores, skills, written feedback, improvement focus, notes, who cased me, interviewed cases,
  level, and "open everything". "Who cased me" is off by default because it names a third person who has not agreed.
- **Visitor visibility is a separate, extra, off-by-default switch with a confirmation.** Free text (feedback, notes) is not shown to
  visitors unless the member opens everything. Why: anything public can be scraped and cannot be recalled.
- **One-click private cases** (owner request, PR #10), shown with a Private badge and removed from the shared copy at once.
- **Burned books and burned cases.** Owner's intent: other casers should not give you a case from books you have already worked
  through solo. Burning is advice for the "find a case" screen, not a lock. When the assistant proposed that a single burned case
  would be logged like a normal case (counting toward totals), the owner rejected it: burned cases should be "just for yourself" and
  not increase the count of cases solved. So burned cases are a title list that never touches the Case Log, totals, ratings or
  coverage (PR #14). Owner then asked that others can see what you burned (when you log it, it is just not counted), and that visitors
  can too if the member opts in (PR titles #16 and #18; the README's current text says burned cases never appear in the Case Log
  list or any total and shows them on the profile, with a link from the Case Log).
- **Interviewed cases are a separate list, never counted.** Owner asked for logging cases you ran as interviewer, kept apart from the
  solved count (PR #39). Sharing is off by default, members only, and never includes who you interviewed or your notes.
- **Level shown to members is on by default.** Initially opt-in; the owner said they could not see other people's levels and that
  "that setting should be on by default for everyone" (PR #54, #55; a migration switched existing profiles on too).
- **Name suggestions are kept simple.** For "who cased you" boxes, the assistant proposed suggesting community members plus free text.
  Owner: keep it simple, no extra security or options around it. Suggestions only; nothing is linked or stored except the typed
  name (PR #45).
- **No email address is ever shown to another member.** Messaging only exists between two people who agreed to case (an accepted
  request); no group chats, no social feed. Messages are not end-to-end encrypted (stated in README).
- **Practice requests are open to every listed, verified member with no switch.** Unlisting means disappearing. Limits: one waiting
  per pair, 5 waiting, 20 sent per day. Between connected members a new request becomes a message instead (PR #27).

## Accounts, email and infrastructure

- **Hosting: Vercel + Supabase.** The owner asked to rename the auto-generated Vercel URL ("too rubbish"); `caselab-booth.vercel.app`
  was chosen.
- **Real sign-up email needs custom SMTP.** Supabase's built-in sender only reaches the project team and is rate limited. The owner
  set up Resend on a domain they own (DNS at their registrar), checked the flow end to end, and plans to forward the sender address to
  their school mailbox. Reason: classmates must actually receive verification mail.
- **Account deletion is one database function** that deletes only the caller's login and cascades the rest, behind typing `DELETE`
  (PR #40). Nothing is archived.
- **Email notifications only for two events** (someone asks you to case, someone says yes), on by default with one switch, sent at
  most once per request, best effort. Declines and chat messages are never emailed. (PR #41.)
- **Live-test accounts are kept out of the Community list** (PR #44); e2e uses throwaway accounts that are left unlisted.
- **CAPTCHA is recommended but not wired in.** Wiring it needs a small app change, and the README says to tell the developer before
  switching it on in Supabase (otherwise sign-up would fail). Reason it was not done: not recorded.
- **Edge Functions `notify-request` and `live-case` run with `verify_jwt = false`** and check sign-in themselves, because the gateway's
  check cannot read this project's ES256 tokens and would refuse every app call. (Comment in `supabase/config.toml`; first made for
  notify-request in PR #43.)

## Design and tone

- **Playful personality instead of a "common, dull" look.** Owner: the first design looked like generic AI-built websites; asked for
  colour, background images, quotes and humour (PR #11, #12). Later: "some of the text is still very serious / mechanical", so copy
  was lightened, "but let's not overdo it". Owner also asked for many daily jokes so they rarely repeat (PR #21), motion (confetti,
  LOGGED stamp, counting numbers; PR #24), sticker-style cards and a doodle sign-in (PR #28-31).
- **Front page language.** Removed the line "Fewer spreadsheets, more offers." (owner request). Owner also asked to use something other than
  "quant / MECE" in one decoration because those words were already on the front screen and felt repetitive (which decoration and what
  replaced it is not recorded here). Headline now leads with Bucket again: "Case with Bucket. Track your progress." (commit b87c294).
- **Link preview for sharing** (WhatsApp snippets) added after the owner noticed a bare link (PR #33).
- **Levels: a small pill, not a big tile.** Owner: a big level tile in the middle of the dashboard "takes away from actual case
  practice". The assistant first made a smaller tile; the owner then disliked the pill as easy to miss and asked to brainstorm; the
  shipped design is a small pill under the page title that opens a window with Level, Quests, Medals and Stickers tabs.
  (Brainstorm options discussed are not recorded beyond the shipped result.)

## Gamification

- **XP rewards how well you practise, not how much.** Fully written-up cases earn more than bare ones; only the first three cases per
  day earn full XP. Computed from the log every time, never stored (so nothing drifts or can be cheated; deleting cases lowers XP).
- **Calibration: Partner is roughly 100 ordinary cases.** Owner asked whether levels were realistic ("someone might be able to do at max
  100 cases and that should be partner") and asked that all levels be updated accordingly.
- **Quests are small (5 XP) and deterministic per week, stepping through a list of thirteen** so a quest never repeats the next week
  (owner asked whether quests would start repeating). Medals are for show and earn no XP. Warm-up earns no XP "for now".
- **Gamification is optional:** one setting hides pill, quests, medals, stickers and celebrations.
- **Warm-up: 30/60/120 s and fifteen question kinds** (owner asked for more depth on quant topics and lengths; branding that said
  "60s" was updated). Bests are kept per length, only ever raised, and are private. No leaderboard.

## Bucket (AI features)

- **Keep the AI quiet in the UI.** Owner: do not be verbose about Claude or AI; the coach should just help with detailed feedback.
  Screens say Bucket and a small "AI" tag and never name Claude or Anthropic; the README and privacy statement do.
- **Name: Bucket.** Considered "CaseCoach AI" (owner disliked "get my coaching"); "Casey" was rejected because BCG already uses it;
  owner asked for a catchy, trendy but unique name with an avatar and chose "Bucket" (a "bucket" is consulting for a group in a
  structure, and Bucket sorts feedback into two). PR #56.
- **Bucket reads only the member's own writing, only on click, never titles, partners, sources or other members' data.** The model is
  reached through an Edge Function so the API key never reaches the browser; stored answers are reused when nothing changed; failures are
  quiet on screen and specific in the function's reply.
- **Model: Sonnet by default.** The owner asked about cost for 100 users once a day and whether Haiku was much worse; decided "sonnet
  for now and we will figure out the rest later". Estimate in README: about 3 cents per read.
- **Members' requests are NOT routed through the owner's Claude Enterprise login (2026-11-09).** The owner asked to "mimic as if I
  am using my Claude Enterprise account through my app" so they would not pay for the API. The assistant declined to build it: Anthropic's
  terms do not let a personal or Enterprise seat power a product other people use (risking the account the owner's day-to-day work
  depends on); it only works while a seat session is signed in and would hit the seat's limits; and it would send members' private
  feedback through the Enterprise account, where workplace admins have visibility. The owner accepted ("ok let's do sonnet for now").
  Result: `ANTHROPIC_API_KEY` is a Supabase secret created and set by the owner from the Anthropic Console, and Bucket is metered
  there. Suggested safeguards (a monthly spend limit in the Console, optional per-member monthly read limits, checking whether the
  Enterprise deal includes API credits) were offered; whether the owner set a spend limit is not known. The assistant also considered
  **identity federation** (short-lived tokens instead of an API key; the owner pasted Anthropic's docs) and judged it a poor fit: it
  replaces the key, not the bill, and Supabase Edge Functions cannot obtain an identity token to exchange; it might be possible if the
  server code moved to Vercel (not verified). It is worth revisiting only if the server code moves or static keys become a concern.
- **The Enterprise seat is used legitimately for one-off preparation work, not at runtime.** Reading casebooks and writing the analyses
  and full solutions was done by the assistant in the owner's own sessions (with sub-agents), so it costs seat usage rather than API
  fees. That is why the library campaign was paced around the 5-hour usage window. The assistant also cautioned that only our own
  words and tags are stored, never case text, and that the owner should read their school's terms on sharing casebooks; whether the owner
  did is not known.
- **Haiku versus Sonnet for Bucket.** The assistant's cost estimates (its own, not measured): per typical read about 5.6 cents on Opus,
  2.8 on Sonnet, 0.14 on Haiku; for 100 members reading daily roughly $28-42 a month on Sonnet and $1.50-2 on Haiku. It suggested
  starting on Haiku and comparing real reads, but the owner chose Sonnet "for now" because specific advice is the whole value of
  Bucket. The side-by-side comparison with Haiku was deferred until there are real reads and has not been run.
- **Rules are deterministic code; the model only writes words.** Which stage a live case is in, clocks, hints, next exhibit, and what
  each reply may see are plain tested functions; a rating is kept only if the feedback quotes the member's own writing; behavioural
  skills are never rated from text.

## Casebook library and solutions

- **One library entry per case name.** Booth MCG copy wins, otherwise the newest book; other books are kept as "also in". Done at load
  time, independent of file order. Generic names (for example "Shoe Co.") may merge two different cases (accepted risk, noted in README).
- **Search by autocomplete on the case title, not a separate feature.** The assistant proposed a separate casebook search; the owner
  asked why not just attach it to autocomplete when filling the title, and that is what shipped (PR #57). Likewise the owner rejected
  an optional "review matches" flow as "just additional functionality", asking instead to update existing entries directly; the review
  still exists but the data was backfilled by the link-only function and a data update that the owner approved.
- **Members only see a case's name, book, type and industry until they have done it.** Analysis and solutions are locked away from every
  API role and released one case at a time only to a verified member who logged that case.
- **Library content stays out of git.** `private-data/` and `supabase/seeds/` are git-ignored so third-party-derived write-ups never enter
  the repository.
- **Full solutions: the book's own, in our words.** Sequence: the assistant first produced high-level "strong answer" analysis; the owner
  said it "doesn't help" and wanted full answers to refer to anytime, and suggested using the direct casebook pages instead of parsing
  them. The assistant did not host the pages; the rule applied throughout was "never use the books' pictures, pages or text" (own words,
  own tables, redrawn charts). Reason: copyright and redistribution (recorded in the campaign notes, not as an owner quote).
- **Fidelity rules set by the owner.** Stick to what is in the book and "don't add too much fluff"; at most 4-5 clarifying questions;
  framework with first- and second-level points matching the book; full solution "exactly as given in the book" with rewording that does
  not change meaning; no notes about slips in the book; anything we add goes in a visually separate section; the label became "tips from
  Bucket" (purple), not "Ours", so it feels personal; plus a separate "top 3 takeaways" (PR #63, #64).
- **Exhibits drawn like the book's.** Owner feedback: charts should look "ditto" as in the book. Result: our own SVG renderer for bar,
  stacked, 100%, line, combos, pie, scatter and multi-panel charts with printed labels, totals, side notes (PR #65, #66, #68, #77);
  exact tables stay beside every chart. Values the book does not print are read off the picture and marked approximate.
- **Faithful printed numbers.** When a book's figures do not reconcile, the figures are reproduced as printed with no commentary (the
  owner's no-slips rule). Where the book gives no recommendation, the recommendation field says so plainly instead of inventing one;
  the seed loader refuses an empty recommendation.
- **Pace: all cases, in waves.** Owner: "do it for the rest of the batches". About 70 cases per wave via parallel Claude Sonnet readers,
  each wave checked (format checker, overlap check of 7-word runs against the book text) then loaded after the owner's approval;
  two waves per 5-hour usage window. Pause threshold set by the owner and raised over time: 85%, 90%, 95%, then 97% (2026-11-13).
  The campaign finished 2026-11-13 with 872 of 872 cases having a solution in production.
- **Seed loading in pieces.** The seed (now ~13 MB) exceeds what the database API accepts per request (about 1 MB, HTTP 413), so it is
  split into parts under ~700 KB and loaded in order (the owner approved each load).
- **Parser caps raised** to keep long exhibits whole: columns 16, exhibits 12, rows and chart points 70 (PR #66, #68), after
  real cases (48-61 points, long tables) were being cut.

## Live case (practise with Bucket)

(Built mostly in separate assistant sessions; the reasons below come from the README and PR titles, not from owner quotes the
assistant saw. Treat as inferred.)
- **Typed, timed, one continuous clock**, with stages and protected thinking time that mimic a real interview. The first version
  (PR #69) was 30 minutes; after the first real run the owner asked for more time, giving 35 minutes (40 with more than four exhibits,
  25 minutes for exhibits in that case) in PR #70. The member drives and Bucket never speaks unprompted; hints answer what you write;
  Bucket leads after three stuck messages; interviewer-only tables are hidden. (PR #69-#74.) Each of PR #70, #74 came from a real play-through
  (Phighting Phillies, Retire on the House) that exposed a defect; see KNOWN_ISSUES.md "Bugs fixed that could come back".
- **Practice, Interview and Learning modes.** Practice can pause and end early; Interview cannot (server refuses both); Learning has no
  clock and Bucket coaches. The owner's last request was for an untimed learning option "along with the 2 options we already have, or
  modify the one we have for pause so it looks like a practice version"; the building session chose a third mode (PR #79). Reason (from
  the PR): reworking Practice would not make it untimed, because the whole case is clock-driven (stages end by themselves, hints and
  moving on depend on the clock) and pause only freezes that clock; Practice members who want a timed run with breaks would lose it. A
  separate mode keeps Practice and Interview exactly as they were. Learning forces ratings blank on the server whatever the model sends,
  and Bucket never moves a stuck learner on by itself.
- **Cost control.** Short replies on Haiku 5.5, one longer feedback call on Sonnet 5.5; usage kept per case; limits of 4 cases/day,
  12/week, 90 replies and 3 feedback attempts per case. (PR #71.)
- **Only complete write-ups are offered** (confidence high with a prompt, a recommendation and exhibits or steps); partial ones are
  excluded.
- **Pick a lane** (case type or industry) instead of one long list (PR #72). **Own tab**, Dashboard banner, tour stop, front-page
  "Meet Bucket" (PR #73).

## Live-case exhibit audit (2026-11-15)

The owner asked for a review of every exhibit chart for live-case suitability, saying live case "seems to work on very limited cases",
that the hinting "might not work out best", that the case "might not end as we expect", and asking whether an interviewer-only table is
explained in words while a candidate exhibit is shown in full. The PM agent measured all 872 write-ups in `private-data/solutions/`
against the production rules (`isInterviewerSideExhibit` and `buildPlan` in `supabase/functions/_shared/liveCase.ts`, `readSolution`
and `isFullSolution` in `liveCaseCoach.ts`, `parseBookSolution` in `src/domain/bookSolution.ts`). Issues #81-#87 came out of it.

- **The catalogue is not the constraint; quality within it is.** 847 of 872 cases are already live-eligible (25 are `partial` and
  correctly excluded). So the owner's "works on very limited cases" is not about how many cases are offered. Recorded because it
  reverses the obvious fix: **hiding cases makes an adequate catalogue smaller without making any case better.** Hiding is the last
  lever, not the first. The order agreed: fix the defects (#81, #82, #83, #85), re-run the audit (#84), and build the hide switch (#86)
  only for whatever genuinely remains — possibly nothing.
- **Charts were never the problem; rendering them was.** 450 of the 1,383 candidate-facing exhibits carry a chart of a kind we draw,
  and only about 10 of the book's bar, line and pie exhibits lack one, so chart coverage is good. But `ExhibitView` in
  `src/features/live/liveParts.tsx` calls `parseBookSolution` with no `recommendation` and no `steps`, and that parser's final guard
  returns `null` without them — so in a live case **no chart has ever been drawn** and every exhibit appears as a bare table (#81).
  Recorded because the owner's premise was that some charts are unsuitable for live case; the measurement says the opposite.
- **An interviewer-only table is not described in words today, and that is only half wrong.** Such a table is dropped from the plan
  and never mentioned. The right split is not "describe them all": many are literally the answer key and must stay invisible and
  undescribed. The rule is **the book's working and answers stay private; data the interviewer hands over when asked must be readable
  out in full, in words, at any point in the case.** That split exists in code (`reference` vs `onRequest`) but catches only 2 of 369
  tables, and neither kind is reachable outside an open exhibit beat, so a member asking for a number during clarifying questions is
  told we do not have it (#83).
- **"Hidden from live case" means invisible, not explained.** A hidden case simply does not appear in the live catalogue and is never
  picked by "Surprise me". No greyed-out row, no badge, no reason on screen: the reason is our own data quality, not something the
  member needs, and explaining it case by case would invite a question we do not want. Hiding is live-case-only — the case keeps its
  library entry, Full solution, "cases to try next" and weekly-plan slots — a member already in a session finishes it, and every hidden
  case stores a written reason so the list does not become a graveyard (#86).
- **Conversation-only cases are labelled, not removed.** 285 of the 847 eligible cases (34%) have no candidate-facing exhibit and run
  entirely on the book's steps with nothing on screen. That is a legitimate case (market sizing and judgement cases really do run that
  way), and several are the library's best quant practice, so removing them would be wrong. The member should be told before they pick,
  rather than discovering it (#87).
- **"Safer to hide" stays the default, with one exemption.** The recorded trade from PR #70 — hiding a candidate exhibit is the safer
  way to be wrong than leaking the interviewer's sheet — stands. But six soft words (`expected`, `calculation`, `math`, `sample`,
  `approach`, `answer`) hide 103 exhibits on their own, including titles the book numbers for the candidate, which costs a whole beat
  each and is a direct cause of the one-beat cases. A numbered book exhibit should not be hidden by a soft word alone, only by a hard
  marker (#85).
- **Time should match how much the case has in it.** Every case is planned at 20 minutes of exhibits in 35 (25 in 40 above four beats),
  but 172 of 847 cases (20%) have exactly one thing to work through. Nothing prompts a silent member (hints only answer what they
  write, by design), so a one-beat case either ends far early or leaves the member alone with one exhibit for 20 minutes (#82).
- **The audit must be a command, not a one-off.** The checkers that built the library live outside the repo and are already at risk
  (KNOWN_ISSUES, ROADMAP R21). A suitability report that imports the real production rules rather than copying them is what makes
  "flag the bad ones" repeatable and keeps the report from drifting from what the case will actually do (#84).

### Decided 2026-11-15, after the audit: no hide switch (#86 closed), label the conversation-only cases (#87 approved)

The audit's own recommendation was to hold #86 and #87 until #84 had been re-run after the defect fixes, so the owner would be asked
for a migration only if the data still justified one. The owner was asked and chose **"decide now"** instead: make the call on the
evidence in hand. Both were therefore settled on 2026-11-15 without waiting for the re-run. The owner's answer was about *when to
decide*, not about migrations: `npx supabase db push` remains their call every time.

- **#86, a switch to take one case out of live practice: closed, not planned.** The owner's original words were "flag those cases and
  **maybe** we can just **temporarily** hide them". The flagging half is #84 and is being built; the hiding half was always conditional
  on there being cases that cannot run, and there are none. 847 of 872 cases are live-eligible and the 25 that are not are `partial`
  write-ups the existing rule already excludes. The audit found no unrunnable case — it found four defects in how every case runs.
  Against an empty list, the cost is the largest in the batch: a migration the owner must apply, a `live-case` redeploy, a PGlite test
  attacking the new rule from three directions, a test proving the SQL rule and `isFullSolution` cannot disagree, and a change to
  `e2e/deployed.e2e.test.ts`. Asking the owner for a migration for a hypothetical is the wrong thing to ask them for.
  **There is already an emergency exit**, recorded here so nobody rediscovers it under pressure: live eligibility is
  `library_solution_is_full(jsonb)` reading the stored solution, so setting one row's `confidence` to `partial` removes that case from
  the live catalogue at once — no code, no migration, no reseed — and leaves its Full solution, search, matching, cases-to-try and
  weekly plan untouched, which is exactly the blast radius #86 specified. Its two flaws: it conflates "the book prints too little" with
  "we chose to pull this one", so no reason is written down; and a seed reload puts the case back. Good enough for one case in an
  emergency, which is all the evidence supports. **Reopen #86 if** the re-run of #84 flags more than one or two genuinely unrunnable
  cases, or the owner wants a case pulled *with a recorded reason*, or several must be pulled at once. The product decisions inside the
  issue (invisible to the member, live-case-only, a running session finishes, every hidden case carries a reason) are settled and stay
  right; it is only the need that is missing.
- **#87, say which cases have no exhibits before the member picks one: approved, queued after #85.** The two issues looked alike and
  are not. #86 removes cases from a catalogue measurement says is fine; #87 tells the member something true about a third of it. 285 of
  847 eligible cases run with nothing on screen, "Surprise me" picks one at random, and the picker says nothing, so a member who wanted
  exhibit practice reads a conversation case as the product being broken. Labelling is the fix; removing is not (several of these are
  the library's best market-sizing practice). The evidence does not depend on any defect fix landing.
  **One constraint added to the issue:** prefer the path that needs no migration. Serving the signal from the `live-case` Edge Function
  is first choice — it already runs `buildPlan` with the service role, so the signal comes from the real rule by construction and costs
  a deploy rather than a migration. A stored value refreshed at library load is worse (a migration *and* freshness tied to a 13 MB
  reseed). **Computing the beats in SQL is rejected on product grounds even though it is easiest**: it duplicates `buildPlan` in a
  second language, which is the exact drift #84 exists to prevent. If the only good path turns out to need a migration, the developer
  stops before applying it and writes the request up as one thing the owner can answer in a single read. Sequenced after #85 because
  #85 moves some of the 39 all-interviewer-side cases back to the candidate, so the 285 will drop before this ships.

## Process decisions

- **The owner approves every production action.** Migrations, library loads, function deploys and merges wait for an explicit "yes" or
  "merge when green". The assistant batches approvals into one question per finished group.
- **One PR per change**; the owner's usual instructions are "Commit and open PR", "Apply and check", "Merge when green".
- **Drive the work.** After repeated frustration ("why are you stopping in the middle", "please drive the development"), the owner
  wants done / in progress / next stated plainly and safe steps continued without prompting.
- **README is kept as the long-form spec** and refreshed when behaviour changes (PR #37, #61).
- **Splitting into a PM agent and a developer agent** (2026-11-15). The owner supplied two role files (`pm.md`, `developer.md`) written
  for GitLab (`glab`, merge requests). The owner confirmed the repo is on GitHub and asked for them to be converted: `gh` instead of
  `glab`, "pull request"/"PR" and `#N` instead of "merge request"/"MR" and `!N`, everything else unchanged (roles, the `proposed` and
  `approved` labels, boundaries, `claude/issue-<n>-<slug>` branches). The converted files are in `.claude/agents/pm.md` and
  `.claude/agents/developer.md`. The PM writes issues and PR verdicts; the developer works only on issues the owner has labelled
  `approved`; the PM may only edit PRODUCT.md, ROADMAP.md and DECISIONS.md.
- **The PM's remit widened (2026-11-15), keeping three actions with the owner.** Owner: "give PM agent to spawn other agents, and let
  PM merge it when it feels appropriate, don't need my permission for everything". The PM may now spawn the developer agent, label
  issues `approved`, `gh pr merge` to `main`, and `npx supabase functions deploy <name>` — on conditions that CI is green, every
  acceptance criterion is met and README is updated when behaviour changed; never merging on a failing or unfinished run, never
  force-pushing, never deleting tests to get green. **Still the owner's call every time, ask and wait: applying migrations
  (`supabase db push`), loading the library seed, changing Supabase secrets.** Why the split: merges and function deploys are
  reversible and visible in the PR; a migration changes production data shape and the seed load is a 13 MB hand process, so both stay
  with the person who owns the database. Note for anyone reading a PR from around this date: a merge no longer implies the owner saw it.

## Decisions whose reasons live only in the README (collected here so a new agent finds them)

- **The library never shows a made-up "Other".** Cases listed only from a casebook's contents page carry `details_known = false`; picking one
  fills only title, book and link, and the member chooses type and industry. The review screen never suggests changing a type or industry
  to an unknown one.
- **Matching a logged case to a library case is conservative.** The backfill links only when the name matches and the source names the book
  (or another book the case is in); it changes nothing else about the case. Same name with a different or no book is only a "maybe"
  because generic names are reused across books; maybes start unticked in the review screen.
- **Unpracticed industries are shown in neutral grey on purpose**, since not having seen one yet is not a weakness; "Other" is never listed as
  a coverage gap; exposure measures practice, not mastery.
- **Advice stays silent without enough data**: suggestions, trends and skill rankings need minimum counts (for example a trend arrow needs
  8 ratings, progress over time needs 10) so the app never claims what the data cannot support.
- **Restore and replace write the new data first and remove leftovers second**, so a failure cannot leave a member with less than they
  started with. Saving is honest: nothing shows as saved until Supabase confirms.
- **Weeks start on Monday** (weekly goal, streak and quests), and a week still in progress never breaks a streak.
- **Levels and quests are computed from the log, never stored**, so they cannot drift or be cheated; the one stored value is the optional
  shared level badge, which a database check forces empty when sharing is off.
- **Messages are polled, not pushed**, and tables are never added to a Realtime publication, because Realtime does not apply column-level
  privileges.
