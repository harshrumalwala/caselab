# CLAUDE.md: how to work in CaseLab

Written 2026-11-15. For the product summary read `PRODUCT.md`; for open problems read `KNOWN_ISSUES.md`; for why things are the way
they are read `DECISIONS.md`. `README.md` (about 780 lines) is the detailed, maintained description of every feature, setting and
database rule, and is the best place to look before changing behaviour.

## Operating rules (the owner's, non-negotiable)

- **Production actions need the owner's explicit approval, each time:** merging to `main`, applying migrations (`supabase db push`),
  loading the library seed, deploying edge functions, changing Supabase secrets. Approval for one does not carry to the next. Ask once
  per finished group ("merge PR X, apply migration Y, deploy function Z") rather than step by step.
- Never claim the owner approved something they did not. Never merge, force-push, or delete tests to make them pass.
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

CI (`.github/workflows/ci.yml`, on every PR and push to `main`): `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. **There is no
lint script and no linter configured.** Vercel deploys `main` automatically and builds a preview for each PR.

## Architecture

Static React 19 + TypeScript + Vite + Tailwind v4 app (hash routing) talking to Supabase (Postgres with row-level security, Auth, Edge
Functions). Charts via Recharts (lazy loaded) and our own SVG renderer for casebook exhibits.

```
src/domain/      pure TypeScript: types, constants, all calculations and rules (stats, suggestions, improvement, progress/XP,
                 quests, medals, stickers, warmup, goal, weeklyPlan, library matching, bookSolution parser). No React, no database.
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
  `library_case_solutions`, `message_reports`. Access is through `SECURITY DEFINER` functions that act only on the caller's own rows, or
  through Edge Functions using the service role.
- **Library content flow.** Analyses and solutions are JSON in `private-data/`; `node scripts/buildLibrarySeed.mjs` turns them into
  `supabase/seeds/library.sql` (one transaction, safe to rerun; it folds duplicate case names, Booth MCG copy wins, then newest book;
  refuses a solution with no question, recommendation or steps). `src/domain/bookSolution.ts` is the parser/validator the app applies
  when it reads a solution; its caps (exhibits 12, columns 16, rows 70, chart points 70, structure buckets 8, clarifying questions 5,
  takeaways 3, panels 4) silently truncate anything larger, so keep content inside them.
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
