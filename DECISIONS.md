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
