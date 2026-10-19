# CaseLab

A personal practice tracker for consulting case interviews. It keeps the simplicity and evaluation framework of Booth MCG's
case log spreadsheet and adds what a spreadsheet can't do well: instant dashboards, coverage maps, and a short list of
what to practice next.

**Design goal: logging a finished case takes under two minutes.** Only a title, case type and industry are required.
Everything else (ratings, notes) is optional and one tap away.

- **Dashboard**: totals, skill averages, trends, case-type and industry coverage, next-practice suggestions, weekly history, milestones
- **Case Log**: searchable, filterable list of every case with full-detail view, edit and delete
- **Improvement Areas**: thin spots in your coverage, skills to sharpen, and a searchable history of what you've learned
- **Your data, on every device**: saved to your own account in [Supabase](https://supabase.com) behind a login, so your laptop and phone show the same cases. JSON backup, CSV export and MCG Excel import are built in

---

## Set it up

CaseLab is a static React app. It needs a Supabase project for sign-in and storage. Setup takes about ten minutes, once.

### 1. Create the database tables (one migration)

The schema lives in [`supabase/migrations/`](supabase/migrations) and is tracked with the code. Apply it **one way only**:

```bash
npx supabase login                                   # opens your browser
npx supabase link --project-ref <your-project-ref>   # the xxxx in https://xxxx.supabase.co; asks for the database password
npx supabase db push                                 # applies any migration not yet applied
```

`db push` records each migration's version in the project, so a migration is never applied twice. If you also use
Supabase's GitHub integration (Project Settings → Integrations → GitHub, with the Supabase directory set to `supabase`),
it reads the same history and will treat the migration as already applied. Don't paste the SQL into the SQL editor as
well: that applies it without recording it, and the integration would then try to run it again and fail.

Future schema changes are new files in `supabase/migrations/` (`npx supabase migration new <name>`), applied the same way.

### 2. Create your login and lock the door

CaseLab has no sign-up screen. In the Supabase dashboard:

1. **Authentication → Users → Add user → Create new user**: enter your email and a password, and tick *Auto Confirm User*.
2. **Authentication → Sign In / Providers → turn off "Allow new users to sign up"** so nobody else can create an account.

Even if sign-ups were left open, row level security (below) means a new account could only ever see its own, empty data.

### 3. Add your project's two public settings

Copy `.env.example` to `.env.local` and fill in both values (Supabase dashboard → Project Settings → API):

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

These two values are public by design: they ship in the browser. **Never** put a secret key, `service_role` key or
database password in a `VITE_` variable (the app refuses to start if the key looks like a secret). If the settings are
missing, CaseLab says so on screen; it never quietly switches to some other storage.

### 4. Run it

Requires Node.js 20.19+ (22 recommended).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Run the automated tests once |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build locally |

Press **N** anywhere in the app (outside a text field) to open the Log Case form.

---

## How your data is stored and protected

| Table | Holds |
| --- | --- |
| `cases` | One row per case: date, title, source, case type, industry, partner, overall rating and feedback, the eight MCG skill ratings with feedback (one `skills` JSON column), the takeaway fields, improvement tag, other notes |
| `opportunities` | The hand-edited lists from the MCG "Opportunity Areas" tab |

Everything else (averages, coverage, trends, suggestions, learning history, custom industries) is calculated in the browser
from those rows, so it needs no tables. Fields that are optional in the form are nullable in the database; only title, case
type and date are required, and the database also enforces ratings of 1 to 5 and the 13 MCG case types.

**Access control.** Every row has a `user_id` that the database fills in from your login. Row level security allows a
signed-in user to read and change only rows where `user_id` is theirs, and the anonymous role has no access at all. The
migration is tested against a real Postgres in `src/data/migration.test.ts`, including "another user can't see, edit or
delete your cases" and "signed-out requests are refused".

**Saving is honest.** Nothing appears saved until Supabase confirms it. If a save, edit or delete fails, you see the
error (the Log Case form keeps everything you typed so you can retry), and if loading fails you get an error screen with
Retry rather than an empty dashboard that looks like lost data. The only things kept in the browser are the theme, a
half-written Log Case draft, and Supabase's own sign-in session; none of them hold saved cases.

**Two devices.** Changes show up on the other device when you come back to its tab (the app refreshes your cases then).

### Download, import and demo mode

| Action | Where | Notes |
| --- | --- | --- |
| Extra copy of everything | Settings → Download backup (JSON) | Every case, rating, feedback note, learning and list item |
| Restore a backup | Settings → Import backup (JSON) | **Merge** (adds cases, newer edit wins, deletes nothing) or **Replace everything**. Replace writes the file first and removes leftovers second, so a failure can't leave you with less than you started with |
| Spreadsheet view | Settings → Export cases (CSV) | One row per case, MCG column order plus CaseLab's additions |
| Bring in your MCG log | Settings → Import MCG Excel log | Reads the `Log` sheet by header names, skips duplicates (same date + title). Imported cases have no industry; open one to add it |
| Wipe | Settings → Clear all data | Requires typing `DELETE` |
| Sign out | Settings → Sign out | |
| Demo | Settings → Try demo mode | 16 clearly labeled sample cases held only in this tab's memory. They are never sent to your account or mixed with real cases |

The app starts with 0 cases and shows no scores, trends or suggestions until you log something.

---

## How it maps to the MCG template

The MCG workbook (`MCG Case Log Template.xlsx`, kept in this repo as the reference) has four tabs:

| Tab | What it contains | In CaseLab |
| --- | --- | --- |
| **Log** | One row per case: Date, Case Title, Case Source, Case Type, Interviewer, then **Overall**, **Behavioral 1**, **Behavioral 2**, **Prompt / Pre-framework**, **Framework**, **Quant / Math**, **Exhibits & Charts**, **Brainstorm(s)**, **Recommendation** (each a rating column plus a feedback column), and **Other** | Every field kept, including both behavioral fields and a feedback note on each skill |
| **Dashboard** | Total cases, cases in the past 7.5 days, per-skill averages, count per case type + pie chart | Rebuilt as the Dashboard (see below for what changed) |
| **Opportunity Areas** | Two empty headings: "Cases/Concepts with No Exposure" and "Skillsets to Improve Upon" | Improvement Areas, computed automatically, with the same two hand-edited lists |
| **Data Validation** | The 13 case types | Used verbatim, in the same order |

**Added** (not in the template, and why):

- **Industry** (13 common sectors plus custom): needed for industry coverage and the industry × case-type map.
- **What went well / What I struggled with / Concepts I learned / What to practice next**: capture lessons while fresh. "Concepts I learned" feeds the learning history.
- **Main thing to improve** (optional one-tap tag): a reliable signal for "frequent improvement themes" without parsing free text.
- **Draft autosave** for the Log form, so closing it by accident doesn't lose a half-written case.

**Changed deliberately:**

- The template's Behavioral average only reads Behavioral 1 and ignores Behavioral 2. CaseLab combines both.
- "Cases in the past week" in the template is a rolling 7.5 days. CaseLab uses the **calendar week (Monday to Sunday)**.

---

## How the numbers are calculated

Everything is plain, deterministic code in `src/domain/` with no AI and no hidden weights.

- **Averages ignore unrated skills.** A skill you didn't rate is excluded, never counted as zero. A skill with no ratings shows "not rated".
- **Behavioral** = per case, the mean of whichever of Behavioral 1 / 2 you rated, so each case counts once.
- **Last 5** = mean of your five most recent *ratings* of that skill (by case date). Shown once a skill has five ratings.
- **Trend arrow** = last 5 minus all earlier ratings, shown with at least 8 ratings. Within ±0.3 it reads "steady".
- **Progress over time** = first five ratings vs latest five, shown with at least 10 ratings so the groups never overlap.
- **Overall trend chart** appears after 3 rated cases; the dashed line is a 5-case rolling average.
- **Exposure** counts cases per case type, with three levels: not practiced (0), practiced once (1), practiced multiple times (2+). It measures exposure, not mastery.
- **Case types covered** counts distinct types out of 13. "Every main case type" (a milestone) means the 12 types other than "Other".
- **Colors**: green strong (4+), amber developing (3), red needs attention (under 3). Unpracticed *industries* are shown in neutral gray on purpose, since not having seen one yet isn't a weakness.

### "What should I work on next?"

Up to three suggestions, chosen by fixed rules that stay silent when there isn't enough data:

- **Fewer than 5 cases**: only coverage gaps and the next-focus note you wrote on your latest case. No trend claims.
- **5+ cases** adds: your weakest skill (last-5 average of 3.0 or lower), a skill that's declining, and over-concentration (your last three cases share a case type, or one type is 40%+ of 10+ cases).
- **Always**: case types you've never practiced (most common interview types first), industries you haven't practiced, and case types seen only once.

### Improvement Areas

- **Limited exposure** separates *no exposure* (never practiced) from *limited exposure* (practiced once). "Other" is never listed as a gap.
- **Skills to improve** needs 3 cases, then ranks skills by: low recent average (under 3.5), declining trend, and how often you tagged it as your main improvement area in your last 10 cases. Skills rated 3.5+ that aren't declining or tagged never appear.
- **Knowledge history** only contains what you typed under "Concepts I learned" (split by line or `;`), merged across cases and grouped by industry. Nothing is pre-populated.

---

## Deploy to Vercel

`npm run build` produces a static site in `dist/`; Vercel detects Vite automatically. No server rules are needed (the app
uses hash navigation and relative asset paths).

1. Merge to `main` (or deploy any branch as a preview), then **Add New → Project → import the GitHub repo**.
2. Framework preset **Vite**. Build command `npm run build`, output directory `dist` (the defaults).
3. Under **Settings → Environment Variables**, add these two for **Production and Preview**:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL from Supabase → Project Settings → API |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | The **publishable** key (`sb_publishable_...`) |

4. Deploy. Nothing else is needed: password sign-in doesn't use redirect URLs, and the publishable key is meant for browsers.

Never add the secret key, the `service_role` key or the database password to Vercel for this app. `VITE_` variables are
embedded in the public JavaScript. Environment variables are read at build time, so redeploy after changing them.

`.github/workflows/ci.yml` runs typecheck, tests and build on every pull request and push to `main` (no Supabase credentials
are needed: tests use fakes and an in-process Postgres). `.github/workflows/deploy-pages.yml` is an optional manual GitHub Pages
deploy, but it would need the same two variables as repository variables, so Vercel is the simpler path.

---

## Project structure

```
src/
  domain/      Pure TypeScript: types, constants, and all calculations (stats, suggestions,
               improvement areas, knowledge, milestones, filters). No React, no database.
  data/        Persistence and I/O: Supabase client + repository, auth, row mapping, error messages,
               JSON backup/merge, CSV, MCG Excel import, demo data, in-memory repository
  state/       React context: auth, data (the only writer), toasts, theme, routing
  features/    The three screens (dashboard, caselog, improvement), plus auth, logcase and settings
  components/  Shared UI primitives, layout, chart colors
  test/        Test setup, builders, fixtures, fake Supabase / fake backend
supabase/
  migrations/  The database schema, versioned with the code
  config.toml  Supabase CLI configuration
```

All persistence goes through the small `CaseLabRepository` interface in `src/data/repository.ts` (`SupabaseRepository` for
real data, `createMemoryRepository` for demo mode and tests), and sign-in goes through `AuthApi` in `src/data/auth.ts`. The
domain logic and screens don't know Supabase exists.

**Multi-user later.** The schema is already per-user (`user_id` + row level security), so allowing other people to sign up is
a Supabase setting plus a sign-up form; no migration or data rework. Nothing for sharing or administration is built.

**Tech**: React 19, TypeScript, Vite, Tailwind CSS v4, Supabase (`@supabase/supabase-js`), Recharts (lazy-loaded),
`read-excel-file` (loaded only when you import an Excel file), Vitest + Testing Library, PGlite for the database tests.

---

## Tests

`npm test` runs 102 tests covering:

- **Database**: the real migration run in Postgres (PGlite): required vs optional columns, rating and case-type rules, and row level security (own rows only, no cross-user read/update/delete/insert, no anonymous access, signed-out writes refused, cascade on user delete)
- **Supabase layer**: row mapping that round-trips every field, a repository run against a fake Supabase (paging past 1000 rows, chunked upserts, replace-without-data-loss, errors surfaced), friendly error messages, configuration checks
- **Calculations**: week boundaries, averages that ignore missing ratings, behavioral combining, trend windows, coverage, matrix, weekly history
- **Rules**: milestones, suggestions (including "stays silent with too little data"), improvement areas, knowledge filtering, case-log search / filter / sort
- **Backup**: lossless JSON round trip, merge semantics, CSV quoting, MCG Excel import (a populated sample workbook and the empty template)
- **The app end to end** against a fake Supabase: sign-in and sign-out, nothing requested before sign-in, create / edit / delete with confirmation, data surviving a refresh, a failed save keeping what you typed, a failed delete, a failed load with Retry, a missing-tables message, demo mode never touching the database, export then restore, clear-all

## Limitations

- Weeks start on Monday.
- The MCG import can't know industries, so imported cases show "–" until you edit them.
- Edits made on two devices at the same moment aren't merged: the last save wins (fine for one person).
