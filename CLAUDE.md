# CLAUDE.md: how to work in CaseLab

Written 2026-11-15. For the product summary read `PRODUCT.md`; for open problems read `KNOWN_ISSUES.md`; for why things are the way
they are read `DECISIONS.md`. `README.md` (about 780 lines) is the detailed, maintained description of every feature, setting and
database rule, and is the best place to look before changing behaviour.

## Operating rules (the owner's, non-negotiable)

- **Production actions need the owner's explicit approval, each time:** applying migrations (`supabase db push`), loading the library
  seed, changing Supabase secrets. Approval for one does not carry to the next. Ask once per finished group ("apply migration Y, then
  load the seed") rather than step by step.
- **Standing exception, granted by the owner on 2026-11-15:** the **pm agent** may merge a pull request to `main` and deploy an edge
  function (`npx supabase functions deploy <name>`) on its own judgment, without asking — CI green and the acceptance criteria met.
  This is the pm agent's authority alone; everyone else still asks. The three actions above are still the owner's call every time.
- Never claim the owner approved something they did not. Never force-push or delete tests to make them pass, and never merge with a
  failing or unfinished CI run.
- Never put a secret, `service_role` key, database password or Anthropic key in a `VITE_` variable, in git, or in a PR. `VITE_*`
  values ship in the browser.
- Do not read other members' private data. Use throwaway test accounts for live checks.
- The library content (`private-data/`, `supabase/seeds/library.sql`) is git-ignored on purpose. Never commit it, paste it into a PR,
  or put the books' text, pages or images anywhere.
- The owner prefers: say plainly what is done / in progress / next, then keep going on safe steps. Do not stop mid-way to ask whether to
  continue.

## Install, run, test

Requires Node 20.19+ (CI uses 22). On Windows PowerShell, `npm.ps1` can be blocked by the execution policy (the owner hit this once);
use `cmd.exe` or relax the policy for the current user.

```bash
npm install
cp .env.example .env.local     # fill VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (public values only)
npm run dev                    # http://localhost:5173
```

| Command | Purpose |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | whole unit suite (`vitest run`): 89 files, 1,226 tests on 2026-11-13. See KNOWN_ISSUES for how long it takes and one flaky run |
| `npx vitest run <file>` | one file; use this while iterating |
| `npm run build` | typecheck plus `vite build` to `dist/` |
| `npm run test:e2e` | live checks against the real Supabase project in `.env.local`; needs git-ignored `.env.e2e.local` with throwaway accounts; creates rows titled `ZZ CaseLab e2e ...` and removes them. 58 tests pass, 10 skipped (2026-11-13) |
| `npm run pilot:live -- <command>` | **spends real money.** Drives one live case against the *deployed* `live-case` function as a throwaway account, reads the real spend from `live_case_sessions`, and stops before a call that would cross the cap (`--cap`, default $2.00). Transcripts land in git-ignored `reports/pilot/` and hold the book's own exhibits. Who may run it, and on what budget, is the owner's call; see README |

CI (`.github/workflows/ci.yml`, on every PR and push to `main`): `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. **There is no
lint script and no linter configured.** Vercel deploys `main` automatically and builds a preview for each PR.

## Architecture

Static React 19 + TypeScript + Vite + Tailwind v4 app (hash routing) talking to Supabase (Postgres with row-level security, Auth, Edge
Functions). Charts via Recharts (lazy loaded) and our own SVG renderer for casebook exhibits.

```
src/domain/      pure TypeScript: types, constants, all calculations and rules (stats, suggestions, improvement, progress/XP,
                 quests, medals, stickers, warmup, goal, weeklyPlan, library matching, bookSolution parser, meeting link and
                 time zone). No React, no database.
src/data/        persistence and I/O behind small interfaces: CaseLabRepository (Supabase and in-memory), CommunityRepository,
                 AuthApi; Excel import/export (read-excel-file, fflate), backup, CSV, live case, messages, requests, library.
                 Most *.db.test.ts files run the real migrations in PGlite (in-process Postgres).
src/state/       React context: auth, data (the only writer), toasts, theme, routing, game (levels).
src/features/    screens: dashboard, caselog, improvement, live, warmup, people, community, inbox, messages, requests, public (front
                 page), auth, logcase, settings, import, progress, help, tour.
src/components/  shared UI, layout, chart colours; ExhibitChart lives in src/features/caselog/ExhibitChart.tsx.
supabase/migrations/   schema, one timestamped file per change (20261019... to 20261123120000_live_case.sql so far)
supabase/functions/    Edge Functions: analyze-feedback (Bucket), compare-case, live-case, notify-request; _shared/ holds each
                 function's decisions as plain functions (feedbackInsights, caseComparison, liveCase, liveCaseCoach, notifyRequest)
supabase/seeds/        generated library.sql (git-ignored)
scripts/         buildLibrarySeed.mjs (+ librarySeed.mjs loader logic, tested by src/data/librarySeed.db.test.ts)
e2e/             live tests (app, repository, community, features, library, coach, deployed)
private-data/    git-ignored: casebooks/*.json (analyses), solutions/*.json (full solutions), SCHEMA.md
```

Key mechanics worth knowing:
- **Privacy is in the database.** `cases` is owner-only (RLS). Other members read `shared_cases` (a trigger-maintained projection of
  fields the owner chose to share); visitors read `public_profiles` / `public_shared_cases` only. Membership is the single function
  `public.is_member_id(uuid)` (verified email); changing who counts as a member means changing only that function.
- **Tables with no API access at all:** practice requests, conversations/messages, `live_case_sessions`, `library_case_notes`,
  `library_case_solutions`, `message_reports`, `meeting_prefs` (how a member likes to meet: a link and a time zone, readable by its
  owner alone). Access is through `SECURITY DEFINER` functions that act only on the caller's own rows, or
  through Edge Functions using the service role.
- **Library content flow.** Analyses and solutions are JSON in `private-data/`; `node scripts/buildLibrarySeed.mjs` turns them into
  `supabase/seeds/library.sql` (one transaction, safe to rerun; it folds duplicate case names, Booth MCG copy wins, then newest book;
  refuses a solution with no question, recommendation or steps). `src/domain/bookSolution.ts` is the parser/validator the app applies
  when it reads a solution; its caps (exhibits 12, columns 16, rows 70, chart points 70, structure buckets 8, clarifying questions 5,
  takeaways 3, chart series 16, panels 8, plus the character caps in `EXHIBIT_CAPS`) truncate anything larger, so keep content inside
  them. Truncation is no longer silent: `parseSolutionExhibit` records it on the exhibit (`cut` and `shortened`, measured by
  `src/domain/exhibitFidelity.ts`), the screen tells the member, and `npm run audit:live` fails on an exhibit that cannot be shown whole.
- **Edge Function auth.** `notify-request` and `live-case` have `verify_jwt = false` in `supabase/config.toml` because the gateway
  check cannot read this project's ES256 tokens; each function checks the caller itself with `auth.getUser`. Keep that check in place.
- **Live case.** `supabase/functions/_shared/liveCase.ts` holds the clock, stages, modes (`practice | interview | learning`), hint
  ladder and gating as plain tested functions; `liveCaseCoach.ts` builds what the model may see (a reply never sees the next exhibit or
  the recommendation) and validates feedback; the model only writes words. Replies use Haiku 5.5, feedback uses Sonnet 5.5.

## Conventions we have followed

- One PR per change; title style "Area: what changed" (for example "Live case: untimed learning mode"); PRs are not drafts; the owner
  merges or approves the merge. Commit messages explain what and why.
- Rules and calculations are plain functions in `src/domain/` (or `_shared/` for Edge Functions) with unit tests; screens stay thin.
- Every database rule has a PGlite test (`*.db.test.ts`) that attacks it as another member, a visitor and a signed-out caller would.
- Schema changes are new migration files only (`npx supabase migration new <name>`); never edit an applied migration. **Apply the
  migration before deploying the app version that needs it**; `e2e/deployed.e2e.test.ts` checks that the live database matches the code.
- Behaviour changes update `README.md` in the same PR. Add tests for each behaviour change; do not weaken tests to pass.
- Honest saving: nothing shows as saved until Supabase confirms; failures keep what the user typed.
- Copy is light and human, not corporate; the UI never names Claude or Anthropic (it says Bucket and a small "AI" tag).
- **Screen copy describes the product as it is, positively, on its own terms.** It never defines a feature as the absence of a previous
  one ("there is nobody to browse: no list and no search") and never reads like a changelog: a member has not seen the old version and
  should not be told what it was. Say what the thing does instead ("each member's own link is the way in"). Documentation (`README.md`,
  `KNOWN_ISSUES.md`, `DECISIONS.md`) is the opposite and *should* record what changed and when.
- **Copy stops explaining itself (owner, 2026-11-17).** Cut any sentence that tells the reader how to interpret what is above it, hedges
  against a misreading nobody has made, or restates in prose what the layout already shows; one short human line beats a correct
  explanatory paragraph. The guard: if cutting leaves wording that actively implies something untrue, say that instead of writing a
  better explanation. The instruction is to stop explaining. The worked example is in `DECISIONS.md`.
- **Dates in these documents are local, and a UTC instant says so.** A bare date ("the owner settled this on 2026-11-17") is the
  day it happened where the owner is. A time read off a log or the database is written with its zone ("loaded at 02:54 UTC"), which
  after about 18:00 local is the next day: writing that bare puts the record a day ahead of the git history of the same work.
- Deterministic code decides rules and numbers; the model only writes words and judges the member's writing (and a rating is kept only
  if the feedback quotes something the member wrote).

## Operations cheat sheet (all need owner approval first)

```bash
npx supabase db push                                     # apply new migrations (the CLI is already linked to production)
npx supabase functions deploy <name>                     # analyze-feedback | compare-case | live-case | notify-request
npx supabase secrets set ANTHROPIC_API_KEY=...           # also ANTHROPIC_MODEL, ANTHROPIC_COACH_MODEL, ANTHROPIC_FEEDBACK_MODEL,
                                                         # RESEND_API_KEY, EMAIL_FROM, APP_URL
node scripts/buildLibrarySeed.mjs                        # regenerate supabase/seeds/library.sql from private-data/
```

**Loading the library seed:** the generated file is about 13 MB and the database API rejects a request larger than about 1 MB
(HTTP 413), so `supabase db push --include-seed` (as the README still says) will not work at this size. The way it was loaded:
split `library.sql` at its blank-line statement boundaries into parts under about 700 KB, each wrapped in its own `begin; ... commit;`,
with all non-solution statements first and the solution inserts after, then run each part in order with
`npx supabase db query --linked --yes -f part-NN.sql`, stopping at the first error. The splitter script (`split_seed.py`) lives in the
assistant's scratch folder, not in the repo (see KNOWN_ISSUES). Afterwards verify counts with a query of `library_cases`,
`library_case_notes` and `library_case_solutions` (expected 872 each on 2026-11-13) and run `npm run test:e2e`.

## Things that must not break

1. Privacy invariants above, and the tests that prove them (`src/data/*.db.test.ts`, `e2e/community.e2e.test.ts`).
2. A member's dashboard, XP, goal and totals never include another member's rows; burned and interviewed cases never count.
3. `is_member_id()` stays the single definition of membership; `verified email` stays required.
4. No API role can read `library_case_notes`, `library_case_solutions` or `live_case_sessions`; release is only through the existing
   functions or the service role.
5. Live case cannot leak the answer: replies see only what the member has been shown so far; interviewer-only exhibit tables are hidden.
6. Part A of a casebook solution stays faithful to the book; additions stay labelled as Bucket's tips; no slip notes; no book text,
   pages or images stored or shipped.
7. Logging a case stays under two minutes: only title, case type and industry required.
8. The app refuses to start if the Supabase key looks like a secret, and never silently falls back to other storage.
9. Data safety: restore/replace writes new data first and removes leftovers second; account deletion removes only the caller's login
   and cascades the rest.
10. The weekly goal, levels and quests are computed from the log, not stored (the only stored level is the optional `profiles.level`
    badge, which is cleared when the share switch is off).

## The owner's "never" list (collected from the conversation)

Each of these came from something the owner said or a mistake that happened.
- Never reproduce, host or ship a casebook's text, pages or images; the solution is our own words, our own tables, our own charts. Part A
  stays exactly the book's meaning, order and numbers (rewording is fine), with nothing of ours added to it ("stick to what's in the
  book and don't add too much fluff").
- Never add notes about slips or inconsistencies in the book. Printed numbers that do not reconcile are reproduced as printed.
- Never add a derived exhibit or extra column to a book exhibit; only the book's own exhibits, laid out as printed.
- Never ask more than 4-5 clarifying questions in a solution; frameworks are the book's first-level buckets with second-level points.
- Never let anything we add look like the book: it is purple, labelled as Bucket's tips (not "Ours"), with a separate "top 3 takeaways".
- Never invent a verdict. If the book gives no recommendation, the recommendation field says so plainly (the loader refuses an empty one).
- Never count burned cases (solo practice) or interviewed cases in totals, ratings, coverage, XP or the weekly goal.
- Never show another member's email, and never add security options or layers to name suggestions ("let's be simple").
- Never name Claude or Anthropic on screen; Bucket is the coach and the screens only say "AI".
- Never send a case title, practice partner, source, other notes or anything about another member to the model for Bucket reads.
- Never route members' requests through the owner's personal or Enterprise Claude login (against Anthropic's terms, fragile, and exposes
  members' feedback to workplace admins). The Anthropic key is a server-side secret only.
- Never enable CAPTCHA in Supabase before the app sends the token (sign-up would fail), and never add tables to a Realtime publication
  (Realtime ignores column-level privileges).
- Never apply SQL by pasting it into the Supabase editor as well as `db push` (the migration history would disagree and the GitHub
  integration would try to re-run it). Never edit an applied migration.
- Never stop mid-task to ask whether to continue, and never make the owner ask for status. But **never report something as launched or
  done without checking it**: once a sub-agent launch silently failed at the concurrency cap and the assistant said it was running; the
  owner had to ask "isn't this done yet". Check the launch result and the output files, then report.
- Never present a guess as fact. Say "not verified" or "I'm not sure".

## Setup that is not obvious

- **Supabase** (project named `caselab`, linked to the owner's GitHub): `npx supabase login`, then `npx supabase link --project-ref <ref>`
  (asks for the database password). Auth needs Confirm email ON, Site URL and Redirect URLs set to the Vercel address and
  `http://localhost:5173/**`, and a **custom SMTP sender** (Resend, with the sending domain's DNS records verified): without it
  classmates never get the verification email because Supabase's built-in sender only reaches the project team. The owner checked the sign-up email flow end to
  end ("perfect the flow works"); the status of the request-notification emails is in KNOWN_ISSUES.md.
- **Secrets live in Supabase, not in Vercel or `.env`**: `ANTHROPIC_API_KEY` (created by the owner in the Anthropic Console),
  optionally `ANTHROPIC_MODEL`, `ANTHROPIC_COACH_MODEL`, `ANTHROPIC_FEEDBACK_MODEL`, and `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` for
  notify-request. Vercel only gets the two public `VITE_` values. The README's order for a new project is: set the secrets, then deploy
  the function.
- **Edge Function code does not ship with the web app.** Merging a PR deploys the website (Vercel) but not the functions. Any change
  to `supabase/functions/**` (live-case prompts, validation, modes) takes effect only after `npx supabase functions deploy <name>`,
  which needs owner approval. Live-case sessions already started keep their old plan, so test with a new case. The PRs for live-case
  changes (#74, #76, #79) each said this; for #79 the deployed function rejects `learning` until redeployed.
- **Vercel**: import the GitHub repo, framework Vite, defaults for build and output, two public env vars for Production and Preview.
  The owner had trouble at first seeing their repos in Vercel (not recorded how it was fixed) and renamed the auto-generated address to
  `caselab-booth.vercel.app` (the first attempt said "can't find domain"; it works now).
- **Live checks need throwaway accounts**: create two users in Supabase dashboard → Authentication → Users → Add user with Auto Confirm
  ticked, then put `CASELAB_E2E_EMAIL_A`, `CASELAB_E2E_PASSWORD_A`, `CASELAB_E2E_EMAIL_B`, `CASELAB_E2E_PASSWORD_B` (and optionally
  `CASELAB_E2E_EMAIL` / `CASELAB_E2E_PASSWORD` for the owner's own account) in git-ignored `.env.e2e.local`. If anyone signs in to the real
  app with them, untick "Let other members find me by name".
- **Windows quirks**: PowerShell blocks `npm.ps1` by default (use `cmd.exe` or relax the policy); Python on this machine defaults to a
  legacy console encoding, so always pass `encoding="utf-8"` when reading or writing files and set `PYTHONIOENCODING=utf8` when printing
  non-ASCII (a `UnicodeEncodeError` on `→` happened more than once). Git warns "LF will be replaced by CRLF" on new files; harmless.
- **The casebook PDFs** the solutions were written from came from the owner's Google Drive zips (`drive-download-*.zip` in their
  Downloads folder, extracted into the assistant's scratch folder; a few books are scans with no text layer and some are
  password-protected). They are not in the repo. The overlap checker needs `pdftotext` (poppler) and the page renders use PyMuPDF.
- **When fanning out sub-agents** (as the library campaign did): no more than 20 run at once, and a launch beyond the cap fails silently;
  a reader that "stalled" or died on an API error may still have written all its files, or may have left a partial file without the
  `analysis` block, so inspect the outputs before relaunching and always check every job has outputs before assembling.
