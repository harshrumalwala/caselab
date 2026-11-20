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
- **Proposed 2026-11-16, reversing the public directory: the personal link is the only public way to see a profile (issues #96, #97).**
  Owner: "remove global search from front page, people are not finding it that helpful instead they can share their personalized link
  with anyone whom they want but we still want the internal community reach and stuff open". The front page loses "Cased recently" and
  "Search all members". Hiding the screen is not enough, so a migration revokes the `anon` read on `public_profiles` and `public_shared_cases`
  (today's grants are in `20261021120000_public_directory.sql`); a single profile stays readable only through `public_person(id)` and
  `public_person_cases(id)`. The two visitor settings collapse into one, "people with my link can see my profile", default off, still
  confirmed when turned on; anyone currently listed publicly becomes link-only, which is a reduction in exposure. This reverses PRs #4, #6
  and #8 (the directory existed because 2Y students and firm reps do not want to sign in); the personal link now serves that need.
  Community (members only) is untouched. "Reset my link" (#97) is proposed because the link holds the permanent member ID and the only cut-off
  today is switching visibility off. Merge first, then apply the migration (the old front page would break if it were applied first).
  **Status: proposed, not approved; applying the migration is the owner's call.**
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

## Scheduling inside the community (proposed 2026-11-16, issues #98-#102; none approved)

- **Phase 1 only: no calendar sign-in.** Members save a preferred meeting link and a time zone (#98); a structured propose, confirm, counter and
  cancel flow replaces the free-text `when_text` (#99 database, #100 screens); confirming a time emails both people a calendar invite (#101); an
  optional reminder is a separate small issue (#102). Owner: schedule "directly within the community ... such that it can reflect on their
  calendar too ... set connectivity with their preferred virtual meeting apps". Why phase 1 this way: `.ics` invites reach Google, Outlook and
  Apple calendars with no OAuth, no refresh tokens and no platform review. Phase 2 (connected calendars) is deliberately not an issue; see
  ROADMAP R37.
- **The meeting link is shared only with the person scheduled with, and only once a time is confirmed.** It is never on a profile or in
  Community, and lives in a table with no API access, behind SECURITY DEFINER functions, like practice requests.
- **Invites never contain the other person's email address**, because an `.ics` attendee list would show it and the rule is that no email is
  ever shown to another member.
- **Emails widen from two events to five** (asked, said yes, plus time confirmed, changed, cancelled), governed by the same switch (the PM
  recommends this; owner to confirm). Declines and chat messages are still never emailed.
- **Open for the owner:** whose meeting link goes on the invite (suggested default: whoever asked hosts, the other person's link is the
  fallback, and if neither has one the invite says to agree a link in messages); whether the reminder (#102) is worth a scheduled job, which
  the app does not have today; whether the "Free this week" badge (ROADMAP R1) is retired.

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

## The interview rubric (2026-11-16): how a live case in interview mode must behave

The owner asked for dry runs of real cases in interview mode and for a rubric defining "how our interview algo should work correctly
and give as real exp as possible". Their three worries, in their words: a member should finish "end to end ... without worrying if the
case would work or break in the middle"; Bucket must "not give solutions at any point" and must not "answer something for the candidate
which they didn't need to know or didn't elude to"; and the metrics, rubric and timing must be defined correctly. This section is the
rubric. It is written to be built and tested against, not as advice: every clause is either already true in code (marked **is**) or a
change (marked **should**, with the issue that carries it).

**The first finding, before any dry run.** Interview mode is not an interview today. `supabase/functions/_shared/liveCase.ts` makes
`practice` and `interview` differ in exactly two things: `pause` and `end early` are refused in interview mode (lines 511, 554). Every
other behaviour — the hint ladder in `nudgeLevel`, the `HELP` directives in `liveCaseCoach.ts`, what the model may see, when Bucket
leads — is identical. `isUntimed` singles out `learning`; nothing singles out `interview`. So a member who picks "Interview" to test
themselves gets the practice coach with the escape hatches bolted shut. That is the gap behind the owner's request, and it is bigger
than any individual defect the exhibit audit found.

### 1. Help: a real interviewer redirects, it does not rescue

The ladder today is `process_hint` (rung 0, i.e. the member's **first** message on a beat), `directional_hint` (rung 1), `lead`
(rung 2), `advance` (rung 3+), where the rung is `max(hints, messages since progress)`. Each rung above `none` is model-gated on "if and
only if this message shows they are still stuck", which is a real safeguard but a soft one.

- **Help is never unprompted.** Bucket speaks only in reply to something the member wrote; no timer produces a hint. **Is** true
  (`nudgeLevel` returns `'none'` for `via: 'timer'`) and must stay true in every mode. Since issue #188 removed the timer-driven
  hint path, that guard is the whole of the enforcement — there is no action a client can send to ask for help — and
  `npm run dryrun:live` counts it on every step of every run and prints it. That figure is reported, not gated: it is not one of
  the two the run fails on, so it tells a reader who looks and stops nobody who does not.
- **In interview mode the first stuck message gets nothing.** A real interviewer lets you sit with it. The ladder **should** start one
  rung later: rung 0 `none`, rung 1 a process question, rung 2 a directional nudge, rung 3+ `advance`.
- **Interview mode has no `lead` rung.** `lead` tells the model to "stop asking open questions and lead them ... say plainly where to
  look or what to compare". That is a teaching move and it is right for practice and learning. In an interview, being stuck costs you
  the beat: the interviewer moves you on. **Should** change — interview goes from directional straight to `advance`, which already says
  one neutral sentence and explicitly does "NOT explain, solve or summarise".
- **A hint points; it never supplies.** A process hint names what *kind* of move to make ("what are you comparing these two against?").
  A directional hint names *where* to look ("the cost column is the one that moved"). Neither states a comparison's result, an
  implication, a conclusion, or a number the member could have computed. **Is** the stated intent of the directives; the dry runs exist
  to find out whether the model keeps to it.
- **Nothing the member did not ask for and did not point at.** The owner's "didn't elude to" clause. A reply answers the message in
  front of it; it does not volunteer the next step, the next exhibit, or an observation the member has not reached. **Is** partly
  enforced (a reply never sees the next exhibit or the recommendation); the rest is prompt discipline and is a dry-run question.

### 2. The line between data and the answer (this is how #83 is reconciled with "never make it easy")

#83 makes the interviewer's data reachable at any point in the case. The owner's "don't give solutions" worry looks like the opposite
instruction. They are not in conflict, and the line between them is the single most important rule in this rubric:

> **Inputs are given on request, in full, at any stage. Anything the member could derive from those inputs is theirs to produce, and is
> never given at any rung, in any mode but learning.**

- **Given, in full, whenever asked** (and never with "what do you think?" in place of an answer): a fact in the prompt or fact sheet; a
  figure printed in an exhibit the member has been shown; every input figure in a table the interviewer hands over when asked. Read out
  as written, every row, the way an interviewer reads a table aloud. Refusing a figure the case holds is a defect, not caution — that is
  what #83 fixes, and it is realistic: a real interviewer who is asked for the cost base reads out the cost base.
- **Never given**: the result of a calculation the member is there to do; a total, ratio, difference or growth rate derived from the
  inputs; what an exhibit means or implies; the hypothesis; the `because` lines; the recommendation; the book's framework buckets before
  the member has written their own. **Is** the existing rule in `referenceNotes` and `privateNotes`, backed by `leaks()`.
- **The test of the line, for a developer and for a test:** could the member have produced this from what they already hold? If yes it is
  an answer, whoever it came from. If it exists only on the interviewer's sheet and is not itself the thing being asked for, it is data.
- **A figure that is itself the answer to the open beat is not data.** "Profit per customer: $4.20" is an answer when the beat is to work
  out profit per customer, however input-shaped the row looks. **Should** be stated explicitly in the directives; today the rule is
  "never state a result from a reference table", which does not cover a result that has been pre-printed as a row.
- **Asking well is part of the case.** A member who asks for the right data and gets it has earned something; a member who asks for the
  conclusion is told, briefly, that it is theirs to make. Neither costs them a hint rung.

### 3. Completion: a case must survive to the end

The bar is the owner's: a member never loses a case half way. Measured, not asserted.

- Every live-eligible case, in every mode, reaches `stage: done` with `endReason: 'completed'` for a brisk candidate, a passive one who
  writes almost nothing, and an off-track one. A case that ends any other way is a defect with a case name attached.
- The closing stages are always protected: `closingNeeded` fits inside the limit at every beat count. **Is** true as of #82 by
  construction (a fixed 15 minutes around the discussion), with a test across 0-12 beats.
- No stage ends without the member having had a chance to write in it.
- A model failure (refusal, bad JSON, timeout) degrades to the deterministic fallback and the case continues. **Is** the design
  (`parseTurn` returns a fallback); the dry runs check it end to end rather than against a fake.

### 4. Timing

- The clock is sized from how much the case holds, not from a constant. **Is** true as of #82: 4 minutes to settle plus 4 a beat,
  floored at 8, capped at 25, inside a case of that plus a fixed 15.
- An interview does not stop. Pause and end-early stay refused in interview mode. **Is** true.
- Running a little over on a beat while the member is making progress is realistic and stays. Running over while stuck is not: that is
  what `advance` is for.

### 5. The metrics a dry run reports (per case, and summed)

Reached the end, or where it stopped. Beats completed `independent` / `hinted` / `coach_moved` / `timed_out`. Hints given and the
highest rung reached, per beat. Every request for data that was refused while the write-up held it (should be zero after #83). Every
reply that stated a derived result (should be zero; `leaks()` catches quoted conclusions, not paraphrased arithmetic, so this one needs
a judge). Time in each stage against the plan. Whether the recommendation stage was reached with time left.

**How the dry runs are done, and what they cost.** Two layers, because the expensive one answers only half the question. A scripted
harness over the real `liveCase.ts` and `liveCaseCoach.ts` with a stubbed model answers "does the case break?" for all 847 cases at no
API cost, and is the layer that can live in CI logic-wise (not in CI itself, since `private-data/` is not in git). It cannot answer
"does the reply nudge or solve", because that is the model's words. That question needs real runs against the deployed function, which
spend the owner's Anthropic credits — the README's estimate is under 10 cents a case, so a batch of a dozen is roughly a dollar, not
verified against real usage. The owner's instruction is newest cases first; **newest is defined as the newest book edition** (Booth MCG
2026-2027 and Fuqua 2025-26 before Darden 2018), because that is the content a member is most likely to meet and the content written
most recently. Live runs use the throwaway accounts in `.env.e2e.local`, never the owner's account.

**The pilot, as the owner scoped it on 2026-11-16.** Not the whole catalogue: "run a pilot on max 10 cases, take our learnings and
implement fixes we need in our code - both on data and engine side / and then we will take a call what we need to do after", with
**"I don't want us to spend more than 2$ on the pilot so cap to that"**. So: **10 real-model interview runs is a ceiling, not a target**,
`$2` is a hard cap on model spend, and the scripted harness — which costs nothing — is outside both and is run as wide as it is useful.
After the pilot and its fixes we stop and report; optimising the rest of the catalogue is the owner's call, not a continuation.
Spend is measured, not projected: `live_case_sessions.state -> 'usage'` already stores tokens per case, so the runner totals real usage
after every case, prints the running cost, and refuses to start another once the next case could cross the cap. If real usage cannot be
read back for some reason, the fallback is turns-times-tokens with the assumed per-token prices stated in the report, labelled as an
estimate. What was actually spent is reported, not what was projected.
**The owner's hypothesis, recorded so it can be disproved:** that the pilot will shake out most of the algorithm's shortcomings and
leave mostly data fixes, which cost nothing. Worth testing rather than assuming. If the engine problems turn out to be deeper than ten
cases can settle, or the data fixes need model runs of their own, that is the finding and it is said plainly.

## A member who is nearly there every time: the rulings on #184 (PM, 2026-11-17, on PR #198)

The pilot found a member scored `partial` on every message who was never moved on, because the hint and advance gates all required `stuck`. #184 closed it. The PM ruled on three choices the developer flagged and on the threshold, and this is where those reasons live; the rubric's sections 1 ("help is never unprompted") and 2 ("asking costs nothing") are what rulings 1 and 2 lean on. The PM's argument for acting at all was the asymmetry the pilot measured: three content-free messages cost a member the part in three turns, while six plausible-sounding wrong ones cost nothing, and nobody had chosen that.

1. **A circling member reaches the hint rungs, not only the move-on.** #94's decision is that an interview nudges rather than rescues. A directional nudge is the nudge, and no `lead` rung was added, so the interview register is unchanged. Being moved on with nothing in between would treat a member who is nearly there worse than one who says "I don't know", which no decision asked for. The cost is one extra sentence of help in an interview.
2. **A message that asked for data costs no part of the circling run.** "Asking costs nothing" is settled (section 2 above), and the two counters that measure messages that got nowhere (`asked` and the run) must not disagree about what a question is. `recordAssessment` adds one and `recordDataRequest` takes it back off, clamped at zero, so a question scored `partial` is a no-op rather than a discount. If this is ever wrong it shows as a member who asks their way out of the ladder, an exposure `asked` already has.
3. **`stuck` / `unclear` neither reset the run nor add to it.** The run means partials since the last clear step. A stuck message is not a clear step, so resetting would reward it; adding would double-count a message that already fires every gate by itself.

**The threshold is `CIRCLING_PARTIALS = 3`, and it is judgement, not data.** It comes from the ladder's own arithmetic: the third `partial` in a row puts the member at the rung a stuck member reaches on the same message count, so a circling member is not treated worse than one who said nothing. Two is left alone because two is a member closing in. Nobody has measured how often a real model says `partial`, so nobody knows how often this fires, and the number should not be defended as if somebody had. A single `partial` between two real steps is unaffected, because a clear step zeroes the run.

**Status.** Deployed: it shipped in `live-case` function version 24 on 2026-11-18 (together with #188's removal), verified by diffing the deployed source against the merged commit (ROADMAP, live-case row; the note on PR #198). **It was deployed on deterministic evidence only; nothing in it has been checked against a real model**, and that caveat is the part to carry forward. The caveats (unverified against a real model, the `partial` score unbounded by what the member wrote, `partial` still extending the clock) are in `KNOWN_ISSUES.md`, "A member who is nearly there every time (issue #184, 2026-11-18)"; they are not repeated here.

## The link-and-scheduling backlog (#96-#102), triaged 2026-11-16

The owner filed seven issues from another session on the same day as the live-case work: remove the public member search (#96), reset
my link (#97), a preferred meeting link and time zone (#98), database rules for proposing and confirming a practice time (#99), the
screens for it (#100), calendar-invite emails (#101) and reminder emails (#102). They asked the PM to "go through and fix them". The
issues are detailed and their acceptance criteria are already strong; what follows is the triage, not a rewrite.

- **Order: #96, #97, #98, #99, #100, #101, #102, and it is a chain, not a list.** Each one's criteria depend on the one before it
  (#97's token only matters once the link is the only public way in; #99's rules must exist before #100's screens; #101's `UID` and
  `SEQUENCE` are created by #99). Running them out of order means building against a floor that moves.
- **Four of the seven need a migration, and every one of them stops at the owner.** #96 revokes `anon` reads, #97 adds a share token,
  #98 adds a table with no API access, #99 adds the scheduling records. The developer builds up to the migration, says so in the PR, and
  does not apply it. They will be put to the owner as one request per finished piece, not four separate asks.
- **#96 reverses a recorded decision, and that is the point of recording this.** "A public front page that lets visitors browse members
  who opted in" (PRs #4, #6, #8) exists because 2Y students and firm reps will not sign in each time. The owner's new evidence is that
  "people are not finding it that helpful", and the personal link now serves that need. The reversal only ever reduces exposure: every
  member who was publicly listed becomes link-only, nobody becomes more visible, and the in-app Community is untouched. Accepted on
  that basis. The old reasoning stays in this file above, unedited, because the need it answered has not gone away — it is now answered
  by links.
- **Hiding the screen is not the deliverable; revoking `anon` is.** #96 is right to say so, and this is the clause not to trade away
  under time pressure: a member who is "removed from search" while `anon` still holds `SELECT` on `public_profiles` is still
  enumerable through the API, and we would have shipped a promise we did not keep.
- **#101 and #102 are built on a channel nobody has confirmed works.** KNOWN_ISSUES records that the "someone asked you to case" email
  has never been verified to arrive; only the sign-up flow was checked end to end. Stacking calendar invites and timed reminders on top
  of an unverified sender is how a feature ships that silently does nothing. **Decided: before #101 is built, the existing
  request-notification email is verified to arrive** (one throwaway account asking another, checking the inbox), and the result is
  written into KNOWN_ISSUES either way. That check costs nothing and is the owner's own instruction applied to email: never report
  something as working without checking it. **Answered on 2026-11-19: the owner has seen both emails arrive** (see "Email delivery is
  confirmed" below), so the condition this decision set is met and #101 is no longer held by it.
- **#102 needs something CaseLab does not have: a timer.** Every function today runs because a member did something. A reminder needs
  pg_cron or an external schedule, which is a new moving part and a new failure mode, and the issue itself says it is optional and
  larger than it looks. **Held, not approved**, until #101 is shipped and the owner has seen invites working; then it is a yes/no on
  one question — is a reminder worth a scheduler.
- **Sequenced after the live-case work, not before it.** The owner has said twice that interview mode is the thing they care about now,
  and #94 is an engine defect in front of members today. The scheduling chain is new capability; the live-case defects are a product
  that does not do what it says.

## Shipped on 2026-11-17, and what each one settled

Five pull requests landed in one stretch (#114, #115, #116, #117, #118), two Edge Function deploys and one migration. The PM merged and
deployed under the standing authority of 2026-11-15; the migration was the owner's own "yes", asked for and given. What is worth keeping
from them is the decisions, not the diffs.

- **#85 (PR #115): a soft word no longer hides a numbered book exhibit — and the gain was a third of what the issue predicted.**
  The title rule is now two lists: hard markers (`interviewer`, `guidance`, `guide`, `solution`, `performed by`, `answer key`,
  `keep private`, `not for the candidate`) hide a table wherever they appear; soft markers (`sample`, `approach`, `answer`, `brainstorm`,
  `expected`, `calculation`, `math`) hide it only when the title is not the book's own name for an exhibit. Measured on both sides of the
  merge by the PM: exhibits reaching the member 1,385 → 1,394, hidden 367 → 358, one-beat cases 172 → **171**. The issue predicted three
  cases would come off one beat. **Recorded because the shortfall is the finding:** two of the nine known false positives are hidden by
  their *caption*, which is wrong in `private-data/` rather than in the rule, and the other 99 soft-word hides really are the book's
  working. So the remaining thin cases are a content problem and a #82 problem, not a title-matching one. The durable fix stays an
  explicit `audience` field per exhibit, which needs a seed reload and so waits for the owner.
- **#95 (PR #117): a member is never shown a cut-down book exhibit, and the audit fails rather than the member being told.**
  The issue's own open question was whether truncation should fail loudly in the report or be surfaced to the member. **Both shipped, and
  that is the decision.** The report reads the write-ups on one machine while the app draws whatever the database holds, so the two can
  differ; a member quietly missing a column is worse off than one who knows. The note is deliberately vague ("part of it could not be
  shown here") and the counts stay in the report. If it ever appears in production it is a data incident to chase, not a feature working.
  Caps were raised to fit the real content (chart series 6 → 16, panels 4 → 8, text caps aligned with the live case), which took
  `cut_by_parser_cap` from 2 to 0; run against the **old** caps the new report found 12 exhibits in 9 cases not whole, including seven
  stacks silently losing segments that nobody had found. The by-hand rule that the two cap sets must agree is now a test, not a note.
- **#87 (PR #118): conversation-only cases are labelled from the engine, not from SQL.** The signal is `hasExhibitBeats()` running the
  same `readSolution` + `buildPlan` a case is started with, served by the `live-case` function, so the label cannot promise what the case
  does not do. SQL was rejected even though it was easiest, as DECISIONS said it would be: it duplicates `buildPlan` in a second language,
  the exact drift #84 exists to prevent. No migration; `live_case_catalog()` untouched, and a test now asserts no catalogue column
  mentions exhibits. 285 of 847 cases are conversation-only, measured today — **#85 did not change that number**, contrary to the
  prediction in #87's text. The copy says a discussion case is good practice, which is the product point: label, never hide.
- **#96 (PR #116): the public directory is gone and `anon` has lost the tables.** Merged, then
  `20261124120000_link_only_profiles.sql` applied to production with the owner's approval. Verified on the live database rather than
  assumed: `anon` and `authenticated` have no table or column SELECT on `public_profiles` or `public_shared_cases`, RLS is on with zero
  policies on each, `anon` still executes `public_person` / `public_person_cases`, and `npm run test:e2e` passed 60 / 10 skipped
  afterwards. **The order was merge first, apply second**, the reverse of this project's usual rule, because the old front page's search
  breaks the moment the grant goes; the only window in which the new settings copy ("You are never listed or searchable out there") was
  not yet true was the few minutes between the two, which is why they were done back to back rather than merged and left.
  **One irreversible part, recorded because it cannot be recovered later:** step 4's
  `update profiles set public_link_only = true where public_profile` loses which members were directory-visible. The revokes can be
  re-granted; that fact cannot. It only matters if a public directory is ever rebuilt, and then it means asking members again — which,
  for a visibility setting, is the right way round anyway.
- **A deploy is verified by content, never by a version number.** Both `live-case` deploys were checked by running
  `supabase functions download live-case` into a worktree checked out at the merged commit and confirming `git status` came back empty,
  so the deployed source is byte-identical to the merged code. A version bump and a fresh timestamp prove *a* deploy happened, not
  *which* code shipped; this project has been wrong about that once before.

### Learning mode: the dry run's finding is mostly a harness artefact, and the real gap is one disabled button (#119)

`npm run dryrun:live` counts 1,694 Learning runs as "open by design", and KNOWN_ISSUES reads that as a learner who goes passive never
being moved on. Investigated against the code on 2026-11-17, that is two different things wearing one description.

- **There is a member-facing way to move on, and it is visible**: "I'm done with this exhibit" / "Done with the exhibits", beside the
  chat input (`src/features/live/LiveSession.tsx`). A learner who writes anything at all already has it. The scripted candidate never
  presses a button, so the harness can never finish a Learning run however the engine behaves. That half is a model of a member, not a
  defect; the limitation is already recorded under "Missing tests".
- **The real gap is that the button is disabled until the member has written about the beat** (`saidSomething`), and the server refuses
  it too (`moveOn`: `if (b.userMessages < 1)`). In Practice and Interview that rule is right — it stops a stray click skipping an exhibit
  nobody looked at, and those modes assess. **Learning assesses nothing** (ratings are forced blank on the server), so the gate is a rule
  borrowed from modes with a different purpose, and it leaves a learner who wants to say "show me how this one works" with nothing but
  ending the case. That is #119.
- **Do not add a clock or an `advance` rung to Learning.** Adding `advance` to the ladder would change nothing anyway: its trigger needs
  `behindSchedule`, which cannot fire without a clock. More importantly, help is never unprompted in any mode, and Learning being untimed
  is a decision, not an oversight.

### The public profile link has to answer "what should I give them?" (#120, #121)

Owner, 2026-11-16: the shared link "lists just all past cases" and does not help someone without an account pick the next case. #96 makes
this sharper — the link is now the *whole* public face of a profile.

- **"Find a case for them" cannot be shown to visitors, and that is the crux.** It is computed from the *viewer's* log
  (`src/domain/pairing.ts`), and a visitor has none. The visitor answer must be built from what the member shared about themselves.
- **Nothing new is released.** Coverage, the member's own written improvement focus and the skill averages are all already in the rows
  `public_person_cases(id)` returns, governed by the member's existing switches. So both issues are browser-side arithmetic: no migration,
  no new switch, no widening of a surface narrowed on purpose hours earlier. **No model call**, because deterministic code decides
  numbers.
- **Split in two deliberately.** #120 (coverage plus their own stated focus) is uncontroversial and answers most of the request. #121
  (skills) is a judgment about a named person on a page anonymous people read.
- **The framing stance on #121, which is the PM's call and the owner may reverse it.** A per-case score in a list is data; "Weakest:
  Structuring" at the top of a public page is a verdict, and the readers most likely to open a link are 2Y students about to run you a
  case and firm representatives. So: at most three skills to sharpen and three strengths, the product's existing sharpening language, no
  ranking of all eight, no number presented as a grade, and **silent** below the existing minimum counts rather than saying "not enough
  data yet", which is itself a statement about the person. The counter-argument is recorded in the issue: consent to per-case scores is
  not consent to a summary judgment, and if the owner finds that persuasive the alternative is a separate off-by-default switch and a
  migration.

### The $2 interview pilot is deferred to the next usage window, by the owner's choice

Asked on 2026-11-17 whether to spend the remaining window clearing the queue or save room for the pilot, the owner chose **"finish the
queue"**. Nothing of the $2 has been spent. The pilot's scope is unchanged (max 10 real-model interview runs, newest books first,
nudge-versus-solve only, spend read from `live_case_sessions.state -> 'usage'` and stopped at $2); the free scripted harness is outside
that cap and was run repeatedly today at no cost. Recorded so nobody reads the delay as a change of plan. **It ran on 2026-11-17 in the next window; what it found is the section below.**

## What 2026-11-17 settled after the five PRs: a reversal, a copy rule, and a switch

### #118 was reversed the day it shipped (#124), and the reason is a product one

PR #118 shipped the live-case picker's **All cases / With exhibits / All discussion** filter, built on a new `exhibits` action in the
Edge Function (`hasExhibitBeats()` running the real `readSolution` + `buildPlan`, deliberately not SQL). Having seen it live, the owner
said: *"this is not needed when people are selecting cases, no one needs to know what internal case dynamics look like."* PR #124
reverted it, by `git revert` of #118's squash commit rather than by hand.

- **What went, and why the machinery went with the screen.** The filter, its paragraph, the per-tile suffix and its hold over lanes,
  search and both "Surprise me" buttons; and then the `exhibits` action and response, `hasExhibitBeats()`, the `eachCaseSolution` dep and
  the paged library read behind it, the kept signal and `EXHIBIT_SIGNAL_MS` (with it the only mutable module state in the shared Edge
  code), the client call and the domain helpers. A dead endpoint that hands out the structure of a case is worse than no endpoint: it is
  a surface nobody is maintaining that still answers questions about what a case holds.
- **The one thing kept from #118**, reworded: the PGlite assertion in `src/data/liveCase.db.test.ts` that `live_case_catalog()` releases
  no column whose name mentions exhibits. That is worth having whether or not a picker wants to know — the catalogue should stay quiet
  about what a case holds — so it outlived the feature it was written for.
- **Why it is recorded here rather than being left as a revert in the log.** #87 and #118 were argued carefully, measured on both sides
  and shipped with a test asserting the signal came from the engine and not from SQL. All of that was right, and the feature was still
  wrong, because the question it answered ("does this case have exhibits?") is ours and not the member's. Picking a case is about the
  business problem, the book and the lane. The cost of learning that was one day; recording it is how the next person does not rebuild
  it. **A member-facing control that exposes how a write-up happens to be built is the pattern to refuse**, not this one filter.
- One consequence to know about: **the catalogue can no longer say which cases are conversation-only.** The pilot runner (#125) needed
  that and did not get it; it prints a line saying there is no such signal and nothing was reimplemented. Choosing a case by what it
  holds means reading `reports/live-case-audit.md`, which is the right place for it — a report for us, not an endpoint for the browser.

### "Copy states the design, never a change": why the convention exists

The convention itself now lives in `CLAUDE.md` under Conventions, and `src/PublicSite.test.tsx` enforces it, so it does not need
restating here. What belongs here is **why**, because the rule reads like a style preference and is not one.

It came out of the front-page work for #96. Removing the public directory produced copy that defined the new design by the absence of
the old one — a line to the effect that there is nobody to browse, no list and no search. Every word of that was true, and a member
reading it had never seen the directory. To them it says only that something is missing: it advertises a hole where there is in fact a
deliberate design, the personal link. The fix was to say what the thing does — each member's own link is the way in.

So the rule is: **screen copy describes the product as it is, positively, on its own terms. It never defines a feature as the absence of
a previous one and never reads like a changelog.** Documentation is the exact opposite and *should* record what changed and when; that is
what `README.md`, `KNOWN_ISSUES.md` and this file are for. A test enforces the screen half because this is the kind of rule that is
obvious once stated and very easy to break while writing a diff, when the change is the thing you have in your head.

### #121: the owner chose a separate off-by-default switch, overruling the PM

The PM's recommendation on #121 (show what a member is sharpening, on their public profile link) was **no new switch**: `share_skills`
already governs the per-case scores the summary is computed from, the numbers are already returned by `public_person_cases(id)`, and a
second switch over already-released data protects nothing while costing a migration on a surface that had just been narrowed on purpose.

The owner chose the alternative the issue recorded as the counter-argument: **a separate switch, off by default**, which needs a
migration. Relayed to the PM at the start of the session of 2026-11-17.

The counter-argument is the reason, and it is a good one: **consent to per-case scores is not consent to a summary judgment.** A score
buried in a list of cases is data; "what this person is weakest at", at the top of a page that anonymous people open, is a verdict about a
named person — and since #96 the people most likely to open a link are 2Y students about to run them a case and firm representatives. A
member who switched `share_skills` on months ago agreed to the first thing and was never asked about the second. Off by default means
nobody is summarised until they ask to be.

What this does **not** change: the framing stance stays (at most three to sharpen and three strengths, the product's existing sharpening
language, no ranking of all eight, no number presented as a grade, silent below the minimum counts rather than saying "not enough data
yet"), the computation stays deterministic and in the browser, and there is still no model call. The switch decides whether the section
exists at all, not how it reads. **Applying the migration is the owner's call, as always**; it is in the batched request of 2026-11-17
alongside #97, #98 and #99.

### #97 is closed, not planned: one permanent link per member, and no way to take it back

Owner, 2026-11-17: *"why do we have #97, it's fine if we just have one static link for all users, no need to refresh or remove it."* So
#97 (reset my link) is closed as not planned. Read it the only way it sensibly can be: **each member keeps one permanent link that never
changes.** There is no reset, no rotation and no revoke. It does *not* mean one link shared across all members; nothing about per-member
isolation changes, and `public_person(id)` still answers for exactly one member.

Recorded as a decision with its cost, because the cost is real and someone will ask again:

- **The public link carries the member's own account id, permanently.** It is a v4 UUID, so it is unguessable and the exposure is low,
  but it is the real id and it is the same one for ever.
- **A link that gets out cannot be taken back.** The only lever a member has is switching "people with my link can see my profile" off,
  which removes them from everyone who holds the link, not only from whoever it reached. That is blunt, and it is what the project is
  accepting.
- Since #96 the link is the whole public face of a profile, which is what made #97 look necessary in the first place. The counter is that
  a profile only ever shows what the member switched on, so a stale link leaks nothing they had not already chosen to make public.
- It is a deliberate trade for simplicity, consistent with the owner's standing preference not to add security layers where simple
  behaviour will do ("let's be simple", first said about name suggestions).

If link rotation is asked for again, this is the entry that says it was weighed, what it would have bought, and on what grounds it was
declined — not that nobody thought of it.

### Engine before scheduling (2026-11-17)

Put to the owner after the pilot: where should developer time go, given defects that touch 502 of 847 cases. They chose **engine fixes
first** — #128, #130 and #129 — over doing both in parallel or starting the scheduling chain. The reason on the option they picked is the
one to keep: **members meet the live-case defects today, and scheduling is capability they do not have yet.** The #98 / #99 / #121
migrations are approved to be *written*, and they queue behind the engine work; applying any of them is still a separate yes, every time.

## The $2 interview pilot, run on 2026-11-17: what six real-model runs found

The pilot the owner scoped on 2026-11-16 ran on 2026-11-17 against the deployed `live-case` function, through a runner built for it
(#125, `npm run pilot:live`). **Six starts, $0.1485 of the $2.00 cap**, read from `live_case_sessions.state -> 'usage'` after every turn
and priced at the published Haiku 5.5 and Sonnet 5.5 rates. Four complete interview cases from the two newest books (Boothbucks Coffee,
Elena's Electronics, Chicken Pox Vaccine from Booth MCG 2026-2027; Swift Business from Fuqua 2025-26), one practice-against-interview A/B
on the same case and the same messages, and one verification run after the first fix shipped.

**The headline, and it disproves the owner's hypothesis.** The owner expected the pilot to shake out mostly data fixes. It did the
opposite: the largest findings are in the engine and in the prompt, and only one is content. That is worth more than a clean pass, and it
is why the pilot was worth running at all — the free harness had already said every case completes, and every one of these findings is
invisible to it.

**A cost finding first, because it changes what is affordable.** A whole interview case, prompt to Sonnet feedback, costs about **$0.03** —
a third of the README's estimate. The $2 cap was never the binding constraint; **4 live-case starts per account per day** was. Two
throwaway accounts give 8 starts a day, and a start is consumed by the row existing, not by the run finishing.

### What is working, and must survive any fix

- **Asked point blank for a calculation and its takeaway, the coach refuses and reads the inputs aloud instead.** On Boothbucks:
  *"I can read the exhibit's figures aloud: 2021 has 200 shops, $400MM revenue and $100MM profit..."* and then the question back. That is
  exactly the line the rubric draws, and it held every time it was tested directly.
- **The data handover of #83 works.** Asked for the cost base on Swift Business, the coach gave all three figures in full and no totals.
  Facts in the fact sheet come out on request, in words, without a hint rung being charged.
- **No interviewer-only exhibit was ever handed over as an artefact.** Across four cases with hidden tables — including Elena's
  Electronics, whose three hidden exhibits are literally the worked solution — no title, no caption and no chart reached the member.
- **Exhibit fidelity in the real flow is good.** Every exhibit arrived exactly as the write-up prints it: same columns, every row, the
  caption, the `approx` flag where the figures were read off a picture, and the chart spec present where there is one (a line chart and a
  bar chart were both delivered with their series).
- **The interview ladder itself is right.** On Chicken Pox Vaccine a member who wrote only "I don't know" / "No idea" / "Still nothing"
  climbed it properly and `advance` fired at rung 3, `outcome: coach_moved`.

### What the pilot found, in the order it matters (issues #128 to #134)

1. **A case with exhibits drops every analytical step that has no exhibit (#128).** `buildPlan` (`liveCase.ts` line 183) is
   `exhibitBeats.length > 0 ? exhibitBeats : stepBeats` — exhibits **or** steps, never both. Boothbucks lost its hardest step, the
   close-or-invest ROIC test, and then the feedback marked the member down for not doing it: *"You never tested the marketing option
   against the hurdle rate."* Measured over the library: **502 of 847 live-eligible cases lose at least one purely analytical step, 1,567
   steps in total.** This is the biggest live-case defect found since the exhibit audit, and the free harness cannot see it because a case
   that is missing a third of itself still completes.
2. **A reply confirms the member's guess before they have earned it (#130).** Every reply, at every rung including rung 0 where an
   interview is supposed to say nothing, opens by validating: *"You're right that profit is flat while revenue and store count climb,
   which is the core signal"* (first message on the beat, and it introduced the store count the member had not mentioned);
   *"You're on a good track by isolating the suburban group"* (said to a member who had simply guessed the answer). **Guessing works.**
   This is also why the ladder rarely engages: `asked` counts messages since the last progress and the model judges progress, so a
   plausible-sounding stuck message resets the counter — six messages, four openly stuck, gave `hints: 1, asked: 0`. The A/B against
   practice mode on the same case and the same three messages found the replies near-identical, with practice volunteering a derived
   figure (75%) that interview did not. **#94 changed the ladder's indices; it did not change the register of the replies.**
3. **A result pre-printed on the interviewer's sheet is handed over as data (#129), exactly as the rubric predicted.** On Swift Business,
   unprompted and before the exhibit was even shown: *"attendance is 80 million with an average ticket price of $100, which gives a market
   revenue of $8 billion"* — $8B is a row of a hidden "Interviewer guidance" table and the first step of the member's own task. On Elena's
   Electronics, while correctly refusing the totals: *"quantities per store are 200, 150 and 100 in 2016, and 100, 150 and 400 in 2017"* —
   the cells of a hidden table that prints them as `24,000/120 = 200`. **The failure mode is volunteering, not capitulating**, and
   `leaks()` cannot see either because both are paraphrased arithmetic.
4. **Three wording defects (#131), now fixed, deployed and verified on the real model.** A reply narrated its own instructions in the
   third person (*"The student has asked me to calculate the figures ... so I won't give it"*); every data answer was prefixed *"The case
   says ..."*; and `advance` summarised the exhibit it was abandoning. PR #136 fixed all three with a directive change *and* a check on the
   reply that comes back, because a prompt is a request and not a guarantee. Verified by re-running the same rung on the same case after
   the deploy: it now says, in full, *"Let's move on to the next piece."*
5. **The brainstorm always runs last (#133).** Boothbucks' brainstorm — *ways to categorise the new shops* — is step 3 in the book, asked
   before the exhibit that reveals the grouping. The engine asked it after, when the answer was already on the table. Swift Business has two
   brainstorms and only the first ran, labelled on screen as "Brainstorm: #1: Revenue factors".
6. **17 case prompts talk about the book instead of to the candidate (#132).** Swift Business opens the member's case with *"The book flags
   this as a hard, complex case meant for people already at ease with case interviews."* Two tell the member which method to use, two
   describe how the interviewer should behave, and two note a spelling slip in the book, which the owner's no-slips rule forbids outright.
   **This is the pilot's only content finding, and it needs a seed reload**, so it joins the group waiting on the owner.
7. **The pilot runner's own cap arithmetic (#134), found on first contact with production and fixed the same day (PR #135).** The running
   total built the report from the transcripts on disk, so a turn that had just happened fell into the unattributed bucket and was priced at
   Haiku — which understated a `finish` about twentyfold. It was a real safety bug, one turn deep: the next invocation reloads from disk and
   `spend` was never wrong.

### What the pilot settles about how to test this product

- **The free harness and the paid pilot answer different questions and neither substitutes for the other.** `audit:live` and `dryrun:live`
  proved every case completes and no exhibit leaks, over 10,164 runs, for nothing. Not one of findings 1 to 5 above is visible to them: a
  case missing a third of its content completes; a reply that validates a guess completes; a volunteered derived figure completes.
- **Six real runs were enough.** Every finding above appeared in the first four cases and repeated. The remaining budget is better spent
  verifying fixes than enlarging the sample, which is what the sixth run did.
- **The cheapest and most convincing verification is re-running the exact moment.** The #131 fix was confirmed by driving the same case to
  the same rung and reading the sentence. That cost one start and about three cents.

## The night of 2026-11-17: the pilot's findings turned into shipped code

The $2 pilot ran in the morning and found seven things (the section above). By the end of the day six of them were fixed, merged and deployed, two of them proved on the real model, and the library seed was reloaded once. What is worth keeping is not the list of pull requests but the handful of decisions and lessons inside them.

### The clock grew, deliberately, and these are the measured figures

#128 (PR #141) made a case plan hold both its candidate exhibits and its analytical steps, where before it held one kind or the other. The owner approved the change on a projected 39-minute median. **Measured after the second commit, which excluded the framework steps:**

| | before (`7010009`) | after (`fea666f`) |
|---|---|---|
| beats per case, mean / median / max | 2.98 / 3 / 10 | **4.86 / 5 / 14** |
| beats: exhibit + step | 1,396 + 1,128 | **1,396 + 2,723** |
| cases working through both kinds | 0 | **520** |
| cases with one beat | 171 | **10** |
| planned case length, mean / median | 30.6 / 31 min | **36.0 / 39 min** |
| at the 25-in-40 ceiling | 57 (6.7%) | **272 (32.1%)** |

The median landed exactly on the 39 minutes the owner approved. The ceiling came out at **272, not the 285 in the pull request body** — 285 was the estimate from the first commit, 272 is the measured figure after the framework steps were excluded. Both numbers are recorded because the difference is the kind of thing that otherwise becomes folklore.

**Why longer is right.** The alternative to a longer case is a shorter one that drops work. A case that has six things in it always was a 40-minute case; what was happening is that the member was given a 27-minute case and then judged on the 40-minute one. **What is still unknown is whether a member will sit through a 39-minute median**, which is a real-use question no harness answers, and it is in KNOWN_ISSUES rather than settled here.

### The proof that mattered was re-running the same case, not the test suite

Three fixes were confirmed against the real model by driving the exact moment that failed. This is now the pattern to use, because it costs about three cents and a few minutes and it is the only evidence that speaks to what a member sees.

- **#128.** Boothbucks Coffee opened at 3 beats and 31 minutes instead of 2 and 27, and the restored step reached the member in the coach's own words — the two options, closing or $500K a store of marketing, against the 20% ROIC target. Yesterday's feedback on the same case said *"You never tested the marketing option against the hurdle rate"* about work the product had skipped; today's says *"ran the close-or-invest test correctly against closing"* and rates the recommendation 4. **A member being marked down for a step the case never gave them is the clearest kind of defect, and the clearest kind of fix.**
- **#131.** The `advance` rung used to say *"That's fine, we can move on. Exhibit 1 shows the share infected by each age, and the vaccine matters to children who haven't yet been exposed."* It now says, in full, *"Let's move on to the next piece."*
- **#129.** The turn that used to volunteer *"which gives a market revenue of $8 billion"* — a computed row of a hidden interviewer table — now reads out only attendance and price and asks what the member would calculate. Asked outright for the total: *"You are asking for the total itself, and that is yours to work out."* And the #83 handover is not regressed: asked for the cost base it still gives all three figures in full.

### #130 was deployed without a real-model check, on purpose

#130 is the defect the owner cares most about — replies confirming the member's guess, so guessing works. It passed unit tests, the dry-run harness and CI, and it shipped. **It has not been checked against a real model**, because both throwaway accounts hit the function's own limit of 4 starts per rolling 24 hours and the next one frees at 03:05 UTC the following day.

Deploying anyway was a deliberate trade and is recorded as one: holding the fix for eighteen hours while members keep having their guesses confirmed is worse than shipping a change that every deterministic check passes. **The cost is that the register half is unproven**, and the honest position until it is run is "the half that can be measured deterministically is fixed; whether a plausible-sounding stuck member now climbs the ladder is unknown". The author wrote their prediction for the A/B into the pull request before it could be run, which is the right way round, and it will be reported line by line, including the parts they got wrong.

### The lesson about the harness, which is separate from the lesson about the engine

`npm run dryrun:live` has four scripted candidates: brisk, passive, off-track and asker. **None of them ever claims progress while stuck.** So when the pilot found that the ladder never climbs for a member who sounds plausible and is stuck, the harness that is supposed to measure the ladder could not have measured it — not because it was wrong, but because no candidate in it had that shape. The developer on #130 added a fifth, `plausible`, and every bit of movement in the rung distribution (none / process / directional / lead / advance, **4,235 / 4,235 / 1,694 / 847 / 1,694 → 3,388 / 2,541 / 1,694 / 1,694 / 3,388**) comes from its 2,541 runs.

The general lesson, worth more than the fix: **a harness measures the behaviours its model of a user can produce, and nothing else.** A green harness is evidence about the shapes it contains. When a real run finds something the harness missed, the first question is whether the harness *could* have found it — and if not, the candidate that would have found it is part of the fix. The same applies to the limitation already recorded elsewhere: the scripted candidate models messages and never presses a button, so it can never finish a Learning case.

### One seed reload done, a second batch already queued

The owner approved one library reload and it was done: regenerate, split into 20 parts under 700 KB at blank-line statement boundaries, each in its own transaction, non-solution statements first and the duplicate-folding block with `link_cases_to_library()` last, loaded in order with no errors. Counts came back **872 / 872 / 872**, unchanged as expected because the fixes rewrite text inside existing rows, and `npm run test:e2e` passed 60 / 10 skipped. It carried two captions that were hiding candidate exhibits and nine cut exhibit labels.

**Within hours a second batch had formed**, because the audit learned to see more than it could that morning: 17 case prompts that talk about the book (#132), three `belowRows` labels cut to length (#143), and one reference-line label (#151). The pattern is worth naming: **teach the measurement first, then measure, then fix the content once.** Two reloads of a 13 MB seed to save a day is a bad trade, so content fixes batch and wait.

### Three things found while looking for something else, and all three were filed rather than folded in

The developers on #133, #143 and #146 each found a defect outside their issue and wrote it up instead of fixing it: the progress strip never marking Recommendation in a case with no brainstorm (#150), a reference line's label cut in silence (#151), and the interviewer's own facts naming the book in 50 write-ups (#149). **That is the behaviour to keep.** A fix smuggled into an unrelated pull request is a fix nobody reviewed against an issue, and the next person cannot tell why it is there. #149 is also the one where the measurement comes first: facts are read out to a member on request, which is the same path the prompt took, but the engine's voice rules may already strip the phrase — and if they do, 65 files should not be rewritten.

## The interaction pass (2026-11-17), and why it had to happen

In about twelve hours nine pull requests went into the live-case engine — #141, #144, #145, #146, #147, #148, #152, #153, #155. Every one
was verified against the defect it fixed. **Nobody had looked at what they did to each other.** A read-only pass over the nine found four
defects, and the most important fact about them is that **no single PR's own verification could have caught any of them.**

**One of the four is a regression we introduced that day.** #141 made case plans longer (beats per case 2.98 → 4.86). `beatBudget`
divides the time to the discussion's *planned* end by the beats remaining, so once cases were long enough to reach that planned end with
beats left, every late-revealed beat got the 30-second floor, was "behind schedule" thirty seconds in, and the ladder skipped its
second-to-last rung — `lead` in practice, the only rung where Bucket stops asking open questions and says plainly where to look.
Measured against the pre-#141 engine as a control: **`advance`-by-skip went from 8.4% to 32.0% of all advance decisions**, runs with a
skipped rung from 6.8% to 32.5%. The fix (#164, PR #169) was one line — `d.soft` → `d.hard` — and took it to 5.0%, with `lead` given
rising from 2,510 to 3,371.

**Read that as the reason the pass had to happen, not as an incident.** Nine changes, each correct and each verified, and a third of all
advances quietly started skipping the rung that helps. The lesson is structural: **when several changes land fast in one subsystem, the
defects move into the gaps between them, and only a pass that looks at the gaps will find them.** The pre-#141 figure was a *control*,
not a target — there is no reason to think 8.4% was right either; it is simply what the old engine did when cases were too short for the
question to arise.

The other three: **#163**, a part with no exhibit has no name and #145's interview register forbids Bucket from supplying it (801 of 844
cases have a step beat; 281 are conversation-only, where it is the whole case); **#165**, at the `advance` rung a move-on that opens with
a verdict is stripped to nothing and replaced by "stay with it" — while the case moves on anyway; **#166**, the progress strip marks the
discussion finished while a mid-case brainstorm runs.

### The rule that comes out of it: a dry-run green is not verification of a model-facing change

The dry run reported 12,705 runs, 0 failures, 0 leaks, 0 time-outs on exactly the commit where all four defects were sitting. That report
is honest — and it is honest *about the stage machine, the clock and the plan*, which is where it found nothing because there was nothing
to find. It is not evidence about anything the model says, because **its stub emits one fixed sentence and hard-codes
`stopReason: 'end_turn'`.** Six of the nine PRs changed what the model is handed or what its reply may say, and **the harness cannot
execute a single line of that code**: every content filter in `parseTurn` is dead in it, `#144` is structurally unreachable, and no
candidate ever sets `data_request`, so the `asker` candidate is a fiction at the engine level.

The clearest single symptom: **`hinted` as a beat outcome has been 0 in every dry run ever run**, including before any of this work. A
`hinted` outcome needs a candidate that takes a hint and *then* completes the beat, and no candidate is modelled that way — `brisk` sets
`beat_complete` on its first message, before a hint can exist, and the others never set it at all. **The harness cannot tell us whether a
hint helps.** It was never able to, and nobody noticed because it had never been asked.

So, settled: **a PR that changes what the model is handed or what its reply may say ships marked "not verified", whatever the harness
says.** A green harness earns that phrase a sentence of explanation, not an exemption. The same applies to the three defects found by the
pass that the harness could not have seen (#163 and #165 among them) — and, in fairness, to the one it *did* see: #170's first cut leaked
an interviewer-side exhibit title into a step topic and `exhibitLeaks` caught it, 34 runs in 3 cases, on code written eighteen hours after
that check was built. **That is the argument for keeping #95's checks, and it is not one anyone would infer from the issue:** a book
heading a step with the title of the interviewer's own table is not a thing a person would think to look for, and the check found it
anyway, in code written long after the check. A leak check earns its keep on the changes nobody wrote it for.

### Measure before you ship a change to eight hundred cases

#163's fix hands the member a step's own title. The risk was obvious once stated and invisible until then: **some titles are the answer**
("Why the suburban shops lag"). The instruction was to count before shipping, and the count decided the design — 2,621 of 2,723 parts
(96.3%) now say what they are about; **70 are held back because the title holds the finding**, read by hand, one by one; 32 more are held
back for a class nobody predicted. A fix that reaches 96% of cases and makes none worse off is a different thing from a fix that reaches
100% and gives 70 members their own answer.

## #121 shipped: what the switch buys, and what it does not

The owner's separate off-by-default switch (DECISIONS above) is live: migration `20261125120000_share_sharpening.sql` applied on
2026-11-17, **0 of 9 members on**, nothing visible on apply.

The honest part is worth keeping in the owner's own terms, because it is the kind of claim a product is tempted to overstate. **The
switch does not stop anyone working the summary out.** `share_skills` already puts the per-case ratings in the rows a link holder reads;
the averages are arithmetic anybody could do by hand. What the switch buys is that **CaseLab does not do it for them** — no sentence about
a named person appears at the top of a page anonymous people open unless that person asked for it. Consent to per-case scores is not
consent to a summary judgment. If anyone later proposes "the switch protects the data", that is not what it is for and never was.

Three smaller calls recorded with it: **no check constraint tying the switch to `share_skills`** (a refused save would break honest
saving, and with no scores the card simply has nothing to say); the minimum is the **skills** minimum rather than the trends one, because
this is a skills statement; and the gate is necessarily in the browser, which is the reason the paragraph above has to be honest.

## An approval relayed is not the permission system saying yes (2026-11-17)

Worth recording because it will recur. The owner's approvals reach this PM through a coordinating session. For *product* decisions that
is exactly what it is for and it works. For the three production actions the owner reserved — migrations, the library seed load, secrets
— **the gate is the permission system, and the two came apart**: the seed reloads went through because the tooling allowed them, and
`npx supabase db push` for #121 was denied by the permission classifier even with the owner's yes relayed. The right response was to stop,
say so, and **not** ask another session to run it instead; the owner then ran it in a session where the gate was exercised by them.

The rule: a relayed approval tells the PM *what the owner wants*. It does not tell the PM *that the PM may do it*. When the two disagree,
the permission system wins and the PM says so plainly rather than finding a route around.

## Three rules about evidence, learned the hard way on 2026-11-17

These came out of the same two days as the live-case work and they generalise well past it. They are written as rules because each was learned by nearly getting it wrong.

### A new check proves nothing until you have seen it fail on the unfixed code

Three separate developers in one day caught a measurement they were about to believe:

- The **dry run** reported 12,705 clean runs on the exact commit where four real defects sat. Not a lie — it was honest about the stage machine and the clock, and silent about everything the model says, because its stub emitted one fixed sentence. When that was fixed (#181, PR #183), the developer **broke `leaks()` deliberately and ran it**: exit 1, 28 replies carrying the book's own answer to the member — *while every case still reached the end*, so the old bar would have been green.
- A developer measuring the progress strip at phone width found that **headless Chrome here will not make a window narrower than 484 px**, so `--window-size=390` was a 484 px page cropped and wrapped one pill too late. They forced a true viewport and re-verified the *pre-change* behaviour before trusting anything.
- A developer resolving a conflicting documentation line found that the **"each clause appears exactly once" assertion needs an exceptions list**, because a few short clauses legitimately occur twice — and the exceptions list is the hole a stutter slips through. The count-preserving rule (every clause appears the same number of times after as before) has no exceptions and caught two real mistakes while being written.

So: **a check you have not watched fail is not yet evidence.** Run the new test against the unfixed code. Break the thing the harness is supposed to catch and confirm it goes red. An assertion that is exempted into not failing is the same as no assertion, which is the general form of the harness problem.

### Before concluding something is unverifiable, read how the thing records what it did

`KNOWN_ISSUES` carried "nobody has confirmed the request-notification email arrives" for weeks. On 2026-11-17 it was answered by one read-only query and **no test, no secret, no dashboard and no new rows**.

`notify-request` **claims before it sends and rolls the claim back if the send throws**: it stamps `practice_requests.emailed_at` (or `answer_emailed_at`), then calls Resend, and a non-2xx throws and clears the stamp. So a surviving timestamp means Resend accepted the message. Production holds 2 requests from 2026-10-31 with `emailed_at` on both and `answer_emailed_at` on the one acceptance: **three sends, all accepted, by real members, through the code that is still running** (`git log` over `notify-request` since that date is empty).

The instrument was designed into the function and then never read. Caveats kept with the result: **n=3 from one day and one pair of members**, and the deployed `notify-request` has not been verified by content the way the live-case deploys are. And the limit on the claim: **Resend accepting is not Resend delivering** — a bounce, a spam placement or a suppression all happen after the 2xx, so #101 and #102 stayed held until someone looked at an inbox or the Resend dashboard. **Somebody has now looked: see "Email delivery is confirmed" below (2026-11-19).** The reasoning above keeps its value anyway, which is why it is left standing — reading an instrument the code already had turned "unverifiable without the owner" into "verified as far as Resend's API", for nothing, weeks before the owner could check the inbox half.

### What a harness can never tell you, however good it gets

Even after #183, two limits remain and no number of candidates fixes either:

- **The stub's reply shapes are fixtures worded the way the filters are written for.** So the harness can prove a filter *executes*; it cannot find the filter's blind spot. Only a real model can produce the phrasing nobody anticipated.
- **"A filter fired" is not "the member read something good."**

Which is why the standing rule stands: a change to what the model is handed or what its reply may say ships marked **"not verified"**, whatever the harness says.

## The copy rule the owner sharpened on 2026-11-17

The owner opened their own profile link on the live site and cut two blocks from the "what to give them next" card: a paragraph about their own stated focus, and a caveat line reading *"Only what Harsh chose to share, so this is exposure, not a verdict: a case type they haven't shared yet isn't a weakness."* Their words: *"too AIsh let's be not this mechanical while writing or displaying text on our app"*.

**The caveat was accurate and carefully written.** That is the point. The rule:

> Cut any sentence that tells the reader how to interpret what is above it, hedges against a misreading nobody has made, or restates in prose what the layout already shows. One short human line beats a correct explanatory paragraph.

It sits beside the existing convention (copy states the design as it is, never as a change) and catches a different failure. The older rule stops copy reading like a changelog; this one stops it reading like a machine defending itself. Note that *"named only: no numbers"* — written in good faith for #121 — breaks both: it describes the card by an absence, and the absence was not even true of the page, since Shared performance sits below it with the figures.

**One guard that came with it:** if removing an explanation leaves the remaining wording actively implying something untrue, say so rather than writing a better explanation. The instruction is to stop explaining.

**The rule does not reach list labels (PM, 2026-11-17, on PR #178).** The developer kept the "Nothing shared yet" / "Shared once" headings over the chips on the give-next card and flagged it rather than deciding alone. Ruling: keep them. The rule cuts *sentences that interpret*; a chip heading is the label a list needs to be readable, and the owner cut two blocks of prose, not labels. The guard decides it: shortening to "Not yet" would read as a claim about the person's practice ("they have not done profitability cases"), which the page does not know and never did — it knows only what they chose to share. The word *shared* is not explaining the chip, it is the chip's claim, stated accurately in three words.

## The interview register and clarifying questions (issue #185, 2026-11-17)

**The question.** `withoutVerdicts`, the interview-mode check that strips a reply confirming, denying or grading the member's reading (#130, PR #145), does not run on a reply to a clarifying question. Nobody had written down whether that was deliberate. It is.

**What the code does.** `withoutVerdicts` runs only when the mode is `interview` and the turn kind is `exhibit` or `direction` (`liveCaseCoach.ts`, in `parseTurn`). A `clarify` reply is never stripped, in any mode. This was a choice, not an accident: commit `ba5a310` (PR #145) says in its body that `clarify` is not touched at all, two code comments state the scope, and the README describes it as product behaviour ("Asking about a **fact** is a different thing and is answered as always").

**Why it was left alone.** The reason given was a protection, not an argument that a clarify stage deserves a different register. The verdict patterns must not damage a factual answer. `VERDICT` matches shapes like "which is the", so stripping could remove a figure the member asked for, and a reply emptied by stripping falls through to `FALLBACK`. A member who asks a factual question and gets the stand-in line has been failed worse than one who is told "good question" first.

**What still protects a clarify reply, in every mode.** `interviewerVoice`, `leaks` and `statesHeldResult` all run, so a book answer, an interviewer-only exhibit and a result held back are caught. The `INTERVIEW_REGISTER` system prompt also tells the model to add no driver and give no verdict. That last part is enforced by the prompt alone, with nothing in code behind it.

**The residual exposure, and how much is known about it.** The exposure is the model volunteering a driver the member has not raised ("good question, and that is the key driver here"). **Measured on 2026-11-17 against the two real-model pilot transcripts: 4 clarify replies, 0 matching the `VERDICT` patterns, and 0 volunteering a driver on reading.** n is 2 in the one run under the interview register, so this is an anecdote and not a rate. It is recorded as a watch-item in KNOWN_ISSUES.md.

**The conclusion.** Extending `withoutVerdicts` to clarify would add risk to factual answers, which is the protection above, and would **still not catch the real exposure**: a volunteered driver does not look like praise, so a verdict pattern does not see it. If a guard is ever built, it has to be `sharesSubstance`-shaped, flagging a clarify reply that introduces content words from the exhibit or the private notes that the member has not used. Nothing was built, nothing changes in the function, and nothing needs deploying. Practice and learning are unaffected either way; their register is encouraging by design.

## The part notices, and how far ahead practice may point (issue #194, 2026-11-18)

Two rulings from the same pilot observation, kept together because they are the same trade: how much of what is coming may a member be told?

**The member keeps receiving each part's own subject, one at a time (PM, 2026-11-18).** A pilot run showed that the topics #163 hands over, read in sequence, amount to an outline of the write-up's headings. Three options were weighed: leave it, have the engine rephrase each topic as a question, or replace it with a short neutral label. **Leave it.** The member is meant to work through these parts in this order, and the subject of a part is not the answer to it — the case already refuses a topic whose title holds the finding (`TITLE_IS_THE_ANSWER` in `liveCase.ts`), which is the guard that matters. Rephrasing would put the engine in the business of writing prose about content it is specifically not allowed to interpret, to defend against a worry no member has raised. What *is* a defect, and was fixed in this issue, is numbering surviving `STEP_HEAD` and reaching the member as a section title.

**A practice hint may point at a later part of the plan (owner, 2026-11-18).** In the same run a `directional_hint` named a driver that was the subject of the case's final beat, four minutes before that beat opened and before the member had used the word. This is allowed by design — #130's "add no driver they have not raised" rule binds at rung `none`, which practice does not reach during the discussion — and the owner has confirmed it should stay. Practice is the coaching mode; a hint that points ahead is real help, and the cost (that part's discovery is softened) is the trade practice mode exists to make. Interview mode is unaffected and keeps its stricter ladder.

## A hand-in is acknowledged, by the engine (issue #195, 2026-11-18)

Two live pilot runs on 2026-11-18, in different modes and different books, both showed a member handing in a brainstorm and getting nothing back: no model call, no line, straight on to the next part. The recommendation has the same gap, unobserved only because the debrief follows and covers the silence. The cause was in `submit`, which spoke for the framework and not for the other two, and the only record of intent was half a sentence in its docstring.

**The silence goes, for both, and the line comes from the engine rather than the model.** A member who writes for ninety seconds under a clock should be able to tell the work arrived, and the fact that it *is* read later, at feedback time, makes the silence worse rather than better: the system knows and does not say. A model turn was rejected on two grounds — it costs a call per hand-in on every case, and it puts the model one step from commenting on a list of ideas whose book version it is holding, which is the one thing a brainstorm reply must not do. A fixed line costs nothing and cannot leak.

**The line says only that the work arrived**: not that it was good, not that it was complete, and nothing of what the book's list holds. The brainstorm and the recommendation get different lines because what follows them differs — another part of the case in one, the debrief in the other.

**A draft the clock captured and a part the member moved on from are not acknowledged**, because nothing was handed in; telling someone their ideas arrived when the box was taken away would be false.

## Scheduling, settled on 2026-11-17

- **The asker hosts.** The member who sent the practice request hosts; their saved meeting link goes on the invite, the other person's is the fallback, and if neither has one the invite says to agree a link in messages. The owner chose this over proposer-chooses and over the literal reading of their own earlier brief — **the literal reading would have made the guest host their own interviewer.**
- **#98, #99 and #100 are built; #101 and #102 were held**, because KNOWN_ISSUES recorded that nobody had watched a `notify-request` email land. The evidence above moved that to "the app and Resend's API both work, delivery unconfirmed", which unblocked them on the app side and left the one inbox check with the owner. **That check came back on 2026-11-19 and #101 and #102 are no longer held** (see "Email delivery is confirmed" at the end of this file).
- **ROADMAP R1, the "free this week" badge, is retired.** It existed so people would stop negotiating times in messages, which is what this chain does properly.

## A block does not trap a settled time (PM, 2026-11-18, on PR #216)

Issue #99's criterion 5 said a block refuses every scheduling function in both directions, matching how practice requests behave. Built literally, that left two people who had blocked each other holding a confirmed practice time that neither could call off until the block was lifted: the block made the commitment permanent, which is the opposite of what blocking is for.

**`cancel_practice_meeting` is therefore allowed in both directions whatever block stands.** Proposing, confirming, countering, declining and moving a time are all still refused both ways. Cancelling sends nothing, reveals nothing and only removes an obligation, so there is no contact and no harassment surface in it; the record stays visible to both with no meeting link, as it already did.

This narrowing is the **PM's**, not the owner's — the owner approved #99 with the broader criterion in it, and this was decided while the migration was still unapplied and therefore still cheap to change. It is one argument in the database (`_my_meeting(p_id, p_allow_blocked)`, passed `true` by the one function) and one flag in the in-memory twin, so reversing it is a small, single-place change if the owner would rather have the literal rule.

## Spending the window: Sonnet for mechanical work, Opus for judgment (owner, 2026-11-17)

The owner asked that simple sub-agents run on a cheaper model so more work fits in a usage window, and that briefs be tightened so a developer is not rediscovering context the PM already holds.

The split in practice: **Opus where the value is noticing something** — measuring before fixing, deciding what a defect actually is, a product ruling, or catching an instrument that is about to lie. **Sonnet where the brief already says exactly what to do** and the job is to do it well: content rewrites, copy and label fixes, docs passes, test writing.

Calibration from the day it was set: #170 (measure 2,723 step titles before shipping them), #179 (find the 484 px browser floor) and #183 (coverage-measure the harness) each earned Opus. #171 and #174 (a documentation audit against evidence) did not. The signal to watch is a developer **guessing where it should have measured** — that is the class of work to move back.

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
- **Work interrupted in a worktree is committed and pushed before anything else is started (2026-11-17).** A PM session was stopped
  mid-flight and its three developer agents died with it, leaving one branch with commits and two worktrees holding 16 and 26 changed
  files that existed nowhere but one machine's disk. The rule now: the incoming PM reads each one, decides carry-forward or redo on the
  merits, and for anything carried forward **commits it as a checkpoint and pushes the branch before launching anything new** — the
  commit message saying plainly that it is unverified and that the next developer owns it. Both pieces turned out to be good work and
  shipped the same day as #116 and #117; redoing either would have thrown away hours for nothing. Two smaller lessons from the same
  episode: a checkpoint branch based on a stale `main` silently reverts whatever landed in between (it nearly dropped the colour-audit
  docs), so rebase before reading a diff; and a developer that will not force-push cannot reuse the checkpoint's branch name, so expect
  the final PR to come from a fresh branch.
- **Developers run in parallel, review and merge stay serial and stay with the PM (2026-11-17).** Up to three developer agents at once,
  each with its own git worktree, on issues that do not touch the same files. A developer sharing the primary working tree once switched
  its branch underneath a commit and cost a cherry-pick recovery, so isolation is not optional. Parallelism goes into writing code, never
  into deciding what lands.
- **A decision that something is deliberately not done in code gets a test that fails if someone does it (PM, 2026-11-17, on PR #199).**
  When a decision records an exemption or a deliberate omission, the suite gets an assertion that fails if the omission is undone, and
  that assertion's comment points at the decision. Otherwise a refactor can reverse the decision with every test green, and what was a
  ruling becomes an accident. The instance being built is #201 (the interview register's clarify scope, #185, was answered with a
  decision and no test, on the reading that a test was owed only if scope changed). Applies to every future decision of this kind, not
  only that one.

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

## Email delivery is confirmed (owner, 2026-11-19)

For weeks the project could say only that Resend's API had accepted three `notify-request` messages. Nobody had seen one arrive, and
"Resend accepted it" and "a member read it" are separated by bounces, spam placement and suppression lists. No agent can open the
Resend dashboard or a real inbox, so this was one of two things left in ROADMAP's "Waiting for the owner" table.

Asked which of the two notification emails they had actually seen land, the owner answered **both**: the "asked you to case" email and
the "said yes" acceptance email. **The channel works end to end.**

What that changes:

- **#101 (calendar invites with `.ics`) and #102 (reminder emails) are unblocked.** The decision recorded above — "before #101 is built,
  the existing request-notification email is verified to arrive" — set a condition, and the condition is met. Unblocked is not started:
  neither has been built and the owner has not asked for either. #102 additionally still needs the owner to decide a scheduled job is
  worth it.
- **PRODUCT.md's email-notifications row goes to plain `done`**, from "done / partly not verified".
- **The earlier database reasoning keeps its value and is left standing.** Reading `emailed_at` / `answer_emailed_at` — an instrument
  the function already had, claimed before the send and rolled back on failure — proved the app-and-API half for nothing, weeks before
  the owner could check the half only a human can see. The lesson it was written for ("before concluding something is unverifiable, read
  how the thing records what it did") is not weakened by the owner confirming the rest; it is the reason the remaining question was as
  small as one glance at an inbox.

The caveat that survives: the sending domain is the owner's own, and **which inbox was checked was not recorded** — the owner was asked
which of the two emails they had seen arrive, not where, so whether it was their own address, a throwaway or a classmate's is not known.
Deliverability to a school address, to Gmail's spam folder or to a tenant with strict filtering is therefore still an open question. That
is worth knowing before the first email goes to someone who is not the owner, but it is not a reason to hold #101.

## The profile link, looked at in a browser for the first time (2026-11-19)

Five PRs rebuilt the public profile page on 2026-11-19 (#228, #232, #233, #234, #236) and every one merged on a green suite. Then
somebody opened the page. **Three of the four findings were invisible to 1,226 tests**, and the reason is one sentence: jsdom has no
layout engine, so every width, box and clip it reports is zero. That is now in KNOWN_ISSUES as a standing limit rather than a surprise,
and each issue below says in its own body what its tests can and cannot prove.

How it was checked, because the method is reusable and the fixtures were not real: no real profile was to hand — the id being used at
the time was believed to be the owner's and was later found to match no profile at all (see the correction below) — so `window.fetch`
was patched in a `npm run dev` page to stub `public_person` and
`public_person_cases` with a fabricated member, and `#/people/<id>` was read signed out. **The data was invented; the rendering, the CSS
and the pixel measurements were real**, and no repository code was changed to take them.

**The bars stopped being a chart (issue #237, PR #241).** Every name longer than the gutter was cut off on the left at *every* window
width — "Healthcare / Pharmaceuticals" read as "lthcare / Pharmaceuticals" — because `ProfileBars` handed Recharts' `YAxis` a fixed
pixel `nameWidth` (142 in the lanes, 132 in the scores) inside an SVG with `overflow: hidden`. Measured identically at 375, 900, 1200,
1440 and 1600 px, and six of the real industry names are long enough to hit it, so it was the common case and not an edge case.

A wider gutter was rejected, and so was measuring the text at runtime: **at 375 px the card is about 343 px wide and one of those names
is about 155 px before its `n=` note, so any number big enough swallows half a phone screen and still fails on the next long name
anyone adds**. The rows are now plain DOM — a CSS grid whose name column is `auto`, so the browser measures the names and wraps them.
No pixel count is left in the file to be wrong. Recharts stays where there is a real chart; here it was being used as a layout engine,
and its `overflow: hidden` is precisely what turned a long name into a typo. There was no accessibility cost, because the block was
already `aria-hidden` with a correct `sr-only` list beside it.

**One line was cut rather than rewritten.** "A useful case to give *name* asks for what they're sharpening and leans on what's already
strong." was a garden-path sentence *and* a line telling the reader how to use two lists headed "Sharpening now" and "Strong already".
Worth recording: a test was asserting that the line existed, added when an earlier review called it the one line the card was allowed.
**A positive assertion on copy pins a judgement, not a behaviour**, so it has to be re-decided rather than obeyed; the negative
assertion beside it — the list of phrases the cards must never contain — is the one that was left untouched.

**What the switch pair does not say (issue #239, PR #240).** What sent anyone to look was a report that the owner's sharing was on
while `public_person` returned nothing for them — which turned out to rest on an id that matches no profile (see the correction
below), so it was never evidence of anything. **The two gates it led to are real all the same**, because they were found by reading
the code rather than by reproducing the symptom, and the dialog showed neither: "People with my link can see my profile" is unusable unless
"Appear in People search" is on, and turning People search off **silently withdraws a link already given to people**; and
`sync_public_profile` writes nothing unless `is_member_id()` is also true, which needs a verified email. Worse, the preview built to
catch exactly this decided "nobody can open your profile" from the *local switches* rather than from the RPC, so a published-but-empty
profile fell through to "No cases are visible to visitors. Your N cases are private." — **sending the member to fix the per-case
switches for a profile that was never published**. The preview now asks `public_person` itself, and only a successful answer of "no
row" counts; a pending or failed request stays a loading or error state, because telling someone their link is broken when it is fine
is worse than the original defect.

**Whether the link should depend on People search at all was left to the owner.** They are two audiences — classmates browsing, and a
named person holding a link — and someone may reasonably want the second without the first. The condition lives in
`sync_public_profile` as well as in the dialog, so decoupling needs a migration, and migrations are the owner's call every time. The PR
makes the existing rule visible and changes nothing about it.

## The second rejection of the profile page, and what replaces the layout (2026-11-19)

The owner, on the page #236 had just shipped: *"the design on the public profile page is not good at alllll.... it seems worse than the
intial one too, we just put cases on the right and that comes with lot of free space and only half screen occupied for halff of the
vertical page which seems weird ... currently you are not doing a good work."*

Measured at 1440, signed out, 14 shared cases: the summary column (`lg:col-span-7`, 710 px) ended at y=1672, the case list
(`lg:col-span-5`, 502 px) at y=3848, the page was 3968 px tall, and **2,176 px — 55% of it — was blank left gutter**. About 236 px per
case, so roughly 4 of 14 cases were on screen at once.

**The PM's first answer was wrong and is recorded as such.** #238 originally asked for the list to be capped with a "show all" control.
A cap shortens the page while keeping the shape the owner was objecting to, and "worse than the initial one" says the shape is the
complaint. The cap is superseded and the issue was rewritten.

**What replaces it: one full-width column above 1024 px, with the case history as a dense table.** The reasoning, in order:

- **A gutter is what you get whenever a short column sits beside a long one.** No cap, reorder or swap removes it; they move it. One
  column makes it structurally impossible.
- **This is not a revert of #236.** That PR's instruction was to use the width, and the width still gets used — *inside* each block,
  with the practice lanes two-across and the table spanning 1280 px, rather than by slicing the page into a thin list and an empty half.
  The sidebar was never the villain: GitHub's profile is a sidebar too, with pinned repos two-across and the contribution graph full
  width. **Fourteen comparable records stacked single-file in 502 px** was the villain.
- **The sources say table for this job.** Two pattern guides, read in full, rate card grids *weak* on cross-item comparison and on
  sorting and tables *strong* on both with high density; cards are for when visuals do decision-making work, and a shared case has no
  image. The visitor's job on this page is comparison — which case do I give this person. Mobile keeps the list, which the same guides
  rate strong there and tables weak, and the existing 1024 px tab seam is already where that switch lives.
- **The limits of that evidence, kept with it:** neither guide gives a numeric density threshold, so nothing here says "14 rows means a
  table"; neither says where summary content belongs relative to detail records, and the one article that does is a single practitioner
  post used as a reason, not a citation. Where the summary sits is therefore an open question in the issue rather than a ruling.

**The owner's two complaints pull against each other, and the issue says so.** "Weird empty space" and "too plain and traditional" have
opposite fixes: a table is *more* traditional than a card, not less. The ruling is that **the empty space is the defect and density is
the fix**, and the plainness is answered with the visual language the app already has — the `sticker` treatment, the score tone colours,
the chip colours — so the rows read as a compact colourful roster rather than a grey spreadsheet. Not with a second design system:
#235's rule against forking `Card`, `sticker` and the strip colours still stands.

The eight per-skill badges leave the default row for an expander. That is a deliberate trade — they are noise when the job is
comparison — and the criterion is that nothing visible today becomes unreachable, not that everything stays where it was.

### What the browser checks actually found, and one false alarm worth keeping

**#241 was verified in a real browser** on `1a59819`, signed out with the stubbed-RPC method, at 375 and 1440 in both themes: a
whole-document scan for any visible leaf element whose `scrollWidth` exceeds its `clientWidth`, plus a scan for painted boxes escaping
an `overflow: hidden` ancestor, returned **0 clipped elements and no horizontal scroll in all four combinations**. Five of the long
names render in full on one line at both widths, there are three `[data-profile-bars]` blocks and no SVG over 100 px, so Recharts is
genuinely out of that path.

**The false alarm is the part to remember.** The first dark-mode pass reported the labels as `rgb(28,26,24)` on `rgb(27,26,24)` —
black on black, invisible. It was the method, not the code: adding the `dark` class to `documentElement` in devtools flips Tailwind's
`dark:` CSS but never updates React state, so `useTheme()` still returned `isDark: false` and the inline `style={{ color: c.ink }}`
correctly used the light ink. A genuine dark load (set `caselab:v1:theme`, then reload so `index.html` applies it before paint) renders
correctly. **Any component that colours itself from `useTheme()` through inline styles will look broken to a reviewer who toggles the
class in devtools**, and the checker caught their own instrument before reporting it, which is the behaviour the three rules about
evidence ask for.

**The baseline moved while the work was in flight, and the direction is instructive.** Re-measured at 1440 on `1a59819`, the page was
**4,004 px** with a **2,331 px** gutter, not 3,968 and 2,176: cutting the explaining line in #241 took 120 px off the *short* column,
and a gutter is the difference between the two. **Anything that shortens the short column lengthens the gap** — the clearest available
demonstration that a cap on the long one was the wrong instrument.

**What the redesign measured (PR #242, 1440×950, 14 fabricated cases, every switch on):** page **2,459 px** against a 2,500 bar,
largest blank run beside content **20 px** against a 200 bar, and **14 of 14 cases on one screen** against a floor of 10 — from about
4. No horizontal scroll at 375, 900, 1024, 1100, 1280 or 1440. At 1024 the page is 2,513 px rather than 2,459; the criterion was
written at 1440 and 13 px over a bar that was chosen as a bar, not a cliff, was not worth trading row density for.

Two findings from that work worth keeping. **The table is only used where the page is one full-width column** (`visitor && wide`):
at the member's 727 px it is where five columns start wrapping badly, so the cards stay there, and that rule is pinned by a test
rather than left as a habit. And **summary before table** was kept after both were on screen together, on a measurement rather than on
the ordering the issue happened to suggest: the summary block is 985 px, so leading with the table would push "what to give them next"
past the first screen and demote the marketing #233 exists to protect, and the table is the only block whose height grows with the
member.

## The profile link stops depending on People search (owner, 2026-11-19; applied 2026-11-20)

The owner was asked whether "People with my link can see my profile" should depend on "Appear in People search" at all, and answered **"Yes, decouple"**. They are two audiences — classmates browsing the member directory, and one named person holding a link — and until now the second was impossible without the first. (An earlier draft of this entry gave the owner's own link returning nothing as the symptom; that was wrong, and the correction is at the end of this section. The decision rests on the two audiences, not on that symptom.)

**The owner approved the change, not the apply.** Those are separate every time: the migration went to the owner for approval as its own question, and the coordinating session ran it. The PM's standing authority to merge does not reach a PR that is inert until somebody applies a migration, so #246 sat green and unmerged until production was on the new rule.

### The rule lived in six places, and a four-place sweep of the SQL still missed two

The brief that reached the PM named one. Reading the migrations found four. **The last two were application reads, and no amount of reading the SQL would have found them**, because the policies they go through were already correct for the old rule:

1. `profiles_public_requires_listed` — `check (not public_profile or listed)`. **The database physically refused the new state.** Nothing else mattered until it was dropped.
2. `sync_public_profile(uuid)` — the headline guard.
3. `refresh_shared_case(uuid)` — **two** gates, and missing the first was the trap. One decides whether a row exists in `shared_cases` at all; the other gates the link-visible copy. The public copy is built by selecting *from* `shared_cases`, and `public_shared_cases.case_id` is a foreign key onto it `on delete cascade`, so fixing only the second ships a link-only member whose link opens their profile and shows **zero cases**.
4. `refresh_all_shared()`, to re-project.
5. `SupabaseCommunity.getPerson` reads `profiles` directly, under a policy requiring `listed`.
6. `SupabaseCommunity.getSharedCases` pages `shared_cases`, likewise.

5 and 6 together meant a link-only member would have been **visible to anonymous strangers and invisible to their own classmates, following the identical link**. The lesson: *a rule enforced in the database is not only in the database, because which code path reads it decides whether the rule applies at all.* Grepping the migrations finds the rule; it does not find the readers.

### Why the member path falls back instead of the policies widening

The obvious fix for 5 and 6 — widen the two policies to `listed or public_profile` — was rejected. **Row level security cannot distinguish `where user_id = $1` from an unfiltered scan**, so there is no way to widen a policy only for someone who already holds the link. Any verified member could then list every link-only profile in one query, leaving People search protected by the client-side `.eq('listed', true)` alone. That turns a database-enforced privacy rule into a screen-enforced one, and the link's whole value is that you need the link.

So a signed-in member reading a link-only profile **reads the link view**, through the anonymous reader the app already holds. The cost, accepted: a classmate with the link sees the public projection, not the richer member view. They published a link view; a link holder gets the link view. It needed no migration, no grant and no policy change, which is also why the migration did not have to be re-opened after the asymmetry was found.

The decision is carried on the profile as `viaLink` rather than as `listed`, because **whether that member is in People search is genuinely unknowable from `public_person`** — a screen asking `listed` would be asking a question the data cannot answer.

### What the shape of the fix cost, stated rather than buried

`refresh_shared_case`'s first gate became `not (p.listed or p.public_profile)`, so **an unlisted member's rows now exist in `shared_cases`**, where their absence used to be the belt and the policy `"shared_cases: members read"` the braces. Only the braces hold now. That policy's own comment anticipated it — *"even if a stale row were ever left behind, it could not be served"* — and every other reference to that table across every migration in the repo is a projection function, one of the two policies, or a column grant, so the policy really is the only path.

**The PM's stated reason for choosing that shape was wrong and the developer overturned it.** The alternative was framed as belt-versus-drift; it is in fact a schema change, because the `on delete cascade` makes a public row without a member-side row unrepresentable and `public_shared_cases.share_id` comes off a `gen_random_uuid()` default that lives on the member-side table alone. The conclusion survived; the argument did not. **The header records which argument is load-bearing**, so whoever re-opens this starts from the foreign key rather than from the PM's taste. Asking for evidence and then losing to it is the point of asking.

### Three operational things learned on the way

- **`npx supabase migration new` stamps the real clock**, which in this repo produces a filename sorting *before* four existing migrations — it would have been applied before the two that last define `sync_public_profile()` and `public_person()` and then silently overwritten by them. The file was renamed into the repo's own sequence. Anyone running that command here hits the same trap.
- **`npx supabase db push --remote` now refuses from an agent session** with `HostedMutationConsentRequiredError`, because it cannot show a confirmation prompt, and asks to be re-run with `--yes`. The operations cheat sheet in CLAUDE.md is therefore wrong as written. **`--yes` is how a specific approval is expressed, never a default**: nobody adds it to a documented command, and it is only ever used for a run the owner has already approved.
- **A migration header should not claim more than its guard checks.** This one asserts no row holds the new state before it runs, which is a check on *rows*; a constraint dropped by hand would pass that guard and then fail at the drop. Failing loudly on a hand-edited database is right, but the header must not be read as covering it. For the same reason it does not claim to be safe to run again: after it runs, a member may legitimately hold the state the guard refuses.

### Your own profile page when you are link-only (issue #250, 2026-11-20)

A member who leaves People search and keeps their link, opening **their own** profile, saw "No shared cases". Their own `profiles` row is readable on the member path — the policy's `auth.uid() = user_id` half always matches — so the page pages `shared_cases`, which still requires `listed`, and gets nothing.

The empty list is **accurate**: that page shows what other members see, and other members see nothing, which is what the member asked for. The defect is that there was no way to tell an accurate empty list from a broken link — and the obvious moment to open your own profile is to check the link works before handing it to a second-year, so this was the view most likely to be used as that check, failing it for the wrong reason. A member would then go and change sharing settings to repair something that was never broken: **the same failure #239 and #240 had just closed in the privacy dialog, reappearing one screen over.**

**Fix the silence, not the projection.** Serving the link view on your own page would assert something false in the other direction — that members can see those cases. And Profile & privacy → "What others see" already answers "what does my link show", from live `public_person` data since #240; a second answer on the profile page is a second thing that can disagree with the first.

So the empty state says one line and offers the way through to that preview. **The route is the half that actually answers the question the member came with**, and is the part most at risk of being trimmed as scope — a line explaining the emptiness without a way to *see* the link view is half a fix.

Two details worth keeping. The line is "You're not in People search, so members see nothing here. Your link is unaffected." — deliberately **not** "your link still shows your cases", which would be false for a member whose link is on and who shares nothing. And the preview opens on the visitors' tab, because the members' tab would only repeat what they have just read.

### Where the test double still disagrees with the database

Two gaps found in `src/data/memoryCommunity.ts` during this batch, both worth knowing because a twin that quietly disagrees with the database is how a green suite stops meaning anything.

**One was a real bug and is fixed.** `saveProfile` was still coercing `publicProfile = input.listed && input.publicProfile` — the pre-#244 rule, living on in the twin after production had moved. Left in, every test running against the twin would have disagreed with the real database about a state the owner had just asked for. Both developers working that day flagged it as the other's file rather than reaching across, which is why it was fixed once and properly rather than twice.

**One is recorded, not fixed:** the twin returns shared rows for your *own* unlisted profile, where the real `"shared_cases: members read"` policy returns none. Making the twin model that could move existing tests that rely on reading your own shared cases while unlisted, and nobody has checked which. #250's tests are honest in spite of it because they use the empty list production returns, but a future test written against the twin could pass while the same code shows an empty page in production.

### Correction: the link that "returned nothing" was one mistyped hex digit (2026-11-20)

For two days this file and two issue bodies — **#239** (its opening line and its Source note) and **#244** (its Problem section) — carried a statement of fact: the owner's profile link returns nothing,
`public_person(92dc76c1-78b3-464b-bd1e-ddbfdc4a4d6b)` gives `[]`. It was used as the opening symptom of #239, as the reason the browser
checks had to run on stubbed rows, and as supporting colour in the decoupling decision.

**It was false, and the reason is one character.** When the owner pasted their actual link, their id and the one in use differed at exactly one position:

```
theirs : 92dc76c1-78b3-464b-bd1e-ddbfdc4a7d6b
used   : 92dc76c1-78b3-464b-bd1e-ddbfdc4a4d6b
                                       ^ position 32: 7 against 4
```

A single mistyped hex digit, which is why nothing ever looked wrong: the result is a **well-formed UUID**, so the API took it, answered `200 OK`, and returned `[]` — the identical response a real member with their link switched off would produce. Nothing in the call looked like a failure, because nothing about it *was* a failure.

Counts queried against production on 2026-11-20, no personal rows read:

| query | result |
|---|---|
| `profiles where public_profile` | **3** |
| rows in `public_profiles` | **3** |
| `profiles where public_profile and not listed` | 0 |
| `profiles where public_profile and not is_member_id(user_id)` | 0 |
| `profiles where user_id = '92dc76c1-…'` | **0** |

**Three real links resolve in production**, and the projection is exactly consistent — the count of members with `public_profile` equals
the number of rows in `public_profiles`, which is `sync_public_profile` behaving correctly. The id everything rested on **matches no
profile**. It was carried forward from earlier in a session and never validated, so every "the owner's link is dark" reading was loading
a member who does not exist, and the page was correctly saying so — **the owner's link worked the whole time.**

**What this does and does not change.**

- **It changes nothing about the decoupling.** The owner decided People search and the profile link are two audiences and should be
  independent. That argument never depended on the symptom, and the migration is applied and correct.
- **It changes nothing about #239 and #240.** The two silent gates were real: they were found by **reading the dialog and
  `sync_public_profile`**, not by reproducing the symptom. A bad symptom pointed at a real defect, which is luck, not method.
- **It did not, on its own, mean the real-link check was done** — the counts prove the database side only. That check has since been
  run properly, with the owner's pasted link, and is recorded below.
- **Nobody is in the decoupled state yet**: `public_profile and not listed` is 0. Whatever the owner changed on their own account, it did
  not produce an unlisted-with-link row.

**The lesson, which is the reason this is written down rather than quietly edited out.** A mistyped identifier travelled through this
document, two issue bodies and a work item, and at every step it was repeated as a measurement because the thing it was attached to —
an RPC call with a real result — looked like evidence. **A one-character typo is the likely version of this, not a fabricated id**: it
survives every check a UUID normally gets, which is exactly what makes it dangerous. `public_person` returning `[]` for an id that does not exist is indistinguishable
from `public_person` returning `[]` for a member whose link is off. **A query that cannot fail tells you nothing**: the check that was
missing all along is one row, `select count(*) from profiles where user_id = …`, which separates "this member's link is off" from "this
is not a member". The same shape as the audit that reported a rule at 0 because the rule did not exist yet (see "A number this file and
#196 both carried was wrong"): both times an instrument answered confidently about something that was not there.

### The real-link check, finally run (2026-11-20)

For two days every browser measurement of the profile link was taken on **stubbed rows** — `window.fetch` patched in the page to answer
`public_person` and `public_person_cases` with a fabricated member — because no valid id was to hand. That limit is now lifted. The
owner pasted their actual link, and it was opened signed out, in a real browser, against the **production** database.

| | 1440 | 375 |
|---|---|---|
| profile resolves | yes — 19 cases | yes |
| clipped elements | 0 | 0 |
| boxes escaping an `overflow: hidden` ancestor | 0 | 0 |
| horizontal scroll | none | none |
| page height | 2,593 px | 2,323 px |
| width in use, sampled every 350 px down the page | 96, 96, 96, 96, 96 | — |
| case history | table, 19 rows at 53 px (17 fit a 910 px screen) | list, tabs present |

**No blank gutter anywhere** — 96% of the available width in use at every sample, against the 2,331 px of empty column the redesign was
written to remove — and all 19 cases reachable in one screen. **#237's fix is now proven on real data at the narrowest width**:
"Consumer Products / Retail" and "Prompt / Pre-framework n=18" both render in full at 375 px, which is the case the fixed pixel gutter
used to cut.

It also exercised a sharing combination no fixture had: real per-skill counts that differ from each other (`n=16` beside `n=18`) and a
case whose practice partner is "Bucket (AI coach)". Nothing broke on any of it.

**What it still does not cover, and the KNOWN_ISSUES entry says so rather than being deleted outright:** this was **one** profile,
**signed out**, through the **dev server** against the production database. Nobody has opened the deployed Vercel build itself, and no
signed-in member has followed a link — which is the path #249 built and the one least like anything a fixture tested.

### A third overturned reason, and the pattern across all three (2026-11-20)

The flake that turned `main` red on a documentation-only commit was diagnosed in issue #253, by the PM, as two judges reading the clock
at different moments and flipping a boundary-sensitive sample. **The developer pulled the failing run's log instead of implementing
it, and it was wrong.** Both disagreements read "You already have times waiting with this member.", on samples four minutes and a day
clear of the nearest rule — and clock drift only ever moves a time *closer* to now, so it can never make a too-far-ahead time
acceptable. The stated cause could not have produced the observed message.

The real mechanism: `my_practice_meetings()` orders by `updated_at desc` with **no tiebreaker**, PGlite's `now()` is millisecond
resolution, and a round trip is about a millisecond — so a cancel and the next insert could share a timestamp, the cancelled record
sorted first, the cancel cleared nothing, and the one-open-proposal-per-pair rule then refused every later sample. Five of fifteen
samples are accepted, so a tie at the third gives **exactly two** disagreements. That constant had been flagged in the issue as the
clue to start from, and then explained with a theory that could not account for it. The fix names records by the id the database
returned and makes the test's `one()` throw when ambiguous, which immediately surfaced three more instances of the same trap nobody had
asked for (PR #254). The underlying ordering question is #255, `proposed`, because it needs a migration.

**That is three times in two days a PM reason was overturned by someone who went and looked**: the migration's rejected alternative
being a schema change rather than a trade-off, the owner's link "returning nothing" being a mistyped hex digit, and this. The
conclusion survived all three; the argument survived none. Two things worth keeping from that.

**Each was caught by reading a primary source** — the schema, a count query, a CI log — rather than by thinking harder about the claim.
In every case the PM had reasoned from a plausible model and the model was wrong in a way no amount of further reasoning would have
exposed.

**And a brief should therefore state its reasoning as reasoning, so it can be contradicted.** All three issues said which argument was
the PM's and invited evidence against it; all three developers took the invitation. A brief that stated the same conclusions as fact
would have got the same code and a worse record — and in the flake's case, probably a fix for the wrong thing, since a widened
tolerance would have hidden the tie rather than removed it.
