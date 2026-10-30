# CaseLab

A case interview practice tracker for Booth students, built on the MCG case log. Every member keeps a private case history and
dashboard, and can choose to share some of it with other members, or with anyone, to help each other find the right case to practice.

**Design goal: logging a finished case takes under two minutes.** Only a title, case type and industry are required.
Everything else (ratings, notes, sharing) is optional and one tap away.

- **Dashboard**: totals, skill averages, trends, case-type and industry coverage, next-practice suggestions, weekly history, milestones
- **My Case Log**: searchable, filterable list of your cases with full-detail view, edit and delete
- **Improvement Areas**: thin spots in your coverage, skills to sharpen, and a searchable history of what you've learned
- **A public front page**: anyone, with no account, can search the members who chose to be visible and read what they share
- **People**: find a fellow member, see only what they've chosen to share, and work out which case to give them
- **Profile & privacy**: switches for what other members can see, a per-case override, and a live preview
- **Your data, on every device**: saved to your account in [Supabase](https://supabase.com) behind a login. JSON backup, CSV export and an Excel import that reads the MCG template are built in

---

## Set it up

CaseLab is a static React app. It needs a Supabase project for sign-in and storage. Setup takes about fifteen minutes, once.

### 1. Create the database tables (three migrations)

The schema lives in [`supabase/migrations/`](supabase/migrations) and is tracked with the code. Apply it **one way only**, and
**before** deploying the matching version of the app (the app expects the newest tables):

```bash
npx supabase login                                   # opens your browser
npx supabase link --project-ref <your-project-ref>   # the xxxx in https://xxxx.supabase.co; asks for the database password
npx supabase db push                                 # applies any migration not yet applied
```

`db push` records each migration's version in the project, so a migration is never applied twice. If you also use
Supabase's GitHub integration (Project Settings → Integrations → GitHub, with the Supabase directory set to `supabase`),
it reads the same history and will treat applied migrations as done. Don't paste the SQL into the SQL editor as well: that
applies it without recording it, and the integration would then try to run it again and fail.

Future schema changes are new files in `supabase/migrations/` (`npx supabase migration new <name>`), applied the same way.
The community migration only adds objects (and tightens table privileges); it never drops or rewrites data, and it shares
nothing until a member opts in.

### 2. Configure sign-up, email and abuse protection in Supabase

Anyone can create an account on the website, and must verify their email before they get in. For that to work reliably in
production, set these in the Supabase dashboard:

| Where | Setting | Why |
| --- | --- | --- |
| Authentication → Sign In / Providers → Email | **Allow new users to sign up: on. Confirm email: ON (required).** | Open registration with verified addresses. "Verified" is only meaningful with Confirm email on: with it off, Supabase marks every new address as confirmed immediately and anyone could join |
| Authentication → URL Configuration | **Site URL** = your deployed address. **Redirect URLs** add `https://<your-domain>/**` and `http://localhost:5173/**` | Verification and password-reset links return to the app. Wrong values give "link invalid" errors |
| Authentication → Emails → **SMTP Settings** | **A custom SMTP sender** (Resend, Postmark, SendGrid, Amazon SES...), with your sending domain's DNS records set up | **The important one.** Supabase's built-in email sender is for testing: it only delivers to members of your own Supabase team and is heavily rate-limited, so real classmates would never receive their verification email |
| Authentication → Emails → Templates | Optional: customise the *Confirm signup* and *Reset password* wording | Friendlier emails |
| Authentication → Rate Limits | Review "emails sent per hour" and sign-in/sign-up limits for your expected group size | Limits abuse and accidental floods |
| Authentication → Attack Protection | **Enable CAPTCHA** (Cloudflare Turnstile or hCaptcha), and leaked-password protection if your plan has it | The standard defence against bot sign-ups. Tell me before you switch CAPTCHA on: the app needs a small addition to send the CAPTCHA token, and sign-up would fail until it has it |
| Authentication → Sign In / Providers | Minimum password length 8 or more | The app already asks for 8 |

**Restricting sign-up later** (for example to Booth addresses only) needs no rebuild. Who counts as a member is decided by
one database function, `public.is_member_id(uuid)`; changing it to also require, say, `email like '%@chicagobooth.edu'`
and then running `select public.revoke_nonmembers();` once (Supabase SQL editor) unlists everyone who no longer qualifies and
removes their shared and public data. To stop people *creating* accounts from other domains at all, add a Supabase "Before
user created" auth hook (availability depends on your Supabase plan) or turn sign-ups off and invite people. Never add
CaseLab's tables to a Supabase Realtime publication: Realtime doesn't apply column-level privileges.

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
| `npm run test:e2e` | Optional live checks against your Supabase project (see Tests) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build locally |

Press **N** anywhere in the app (outside a text field) to open the Log Case form.

---

## Accounts

**Browsing needs no account.** The front page shows the People search to anyone who isn't signed in, but only for members who
chose to be visible (see below). **Creating an account** takes four steps: email and password, verify the emailed link, choose a name (and optionally your MBA
class) and sharing preferences, then start logging. **Signing in** is unchanged. **Forgot password?** emails a reset link that
asks for a new password. The forms never reveal whether an email already has an account.

---

## Community: what other members can see

Everything is **private by default**. Other members can only see what you explicitly share, and only if they are signed in
with a verified email. Open **Profile & privacy** (the person icon in the header). There are two audiences: **signed-in
members** (the default once you appear in People) and, only if you switch it on, **visitors without an account**.

| Setting | Shares |
| --- | --- |
| **Appear in People search** | Your name and MBA class. Turn it off to disappear completely |
| **Case history** | Case name, source (casebook), industry, case type and date |
| **Overall scores** | The overall 1-5 rating of each shared case |
| **Skill scores** | The framework, quant, exhibits, brainstorm and other skill ratings |
| **Written feedback** | Feedback you received (overall and per skill) |
| **Improvement focus** | The "main thing to improve" tag on each shared case |
| **Learning notes** | What went well, what you struggled with, concepts learned, next focus |
| **Who cased me** | The name you entered as your practice partner or interviewer, shown on each shared case (see below) |

Scores, feedback and notes only apply to cases that are shared, so they switch on after **Case history**.

**Visible without an account** is a separate, extra switch under "Who can see me", **off by default** (nobody who joined before
this existed is public). Turning it on asks you to confirm, because anyone on the internet could then see your name, class
and the case history, scores and improvement focus you've chosen to share. The same switches decide what: **written feedback
and learning notes are never shown to visitors**, even if you share them with members. A case set to "keep this case
private" is hidden from everyone; a case set to "share the case name only" or "share this case in full" is shown to visitors
too once your profile is public (a "full" case shows its scores and improvement focus, never its text). Profile & privacy
previews each audience separately. Turning it off, or no longer appearing in People, withdraws you from the public page at once. Each switch saves the
moment you flip it, and **"What other members see"** at the bottom shows exactly what the database is serving about you.

**Per case.** When you log or edit a case, an optional **Sharing for this case** section lets you override your defaults:
use your profile settings (the default), keep this case private, share only its name, or share it in full (its scores,
feedback and notes, even if your profile shares none of those). Nobody has to touch it when logging.

**Who cased me** is its own switch, **off by default**, because it names a third person who hasn't agreed to be listed. When on, the
partner name appears on every one of your cases that is shared at all, to members and (if your profile is public) to visitors; a case set to
"keep this case private" never shows it. The casebook or source of each case is part of **Case history**, so it is shown with it.

**Never shared, whatever you choose:** your email address and the "Other notes" field.

### Find a case for someone

Open **People**, pick a member, and **Find a case for them** shows:

1. **Cases you've done that they haven't shared**: the best candidates to give them.
2. **Might overlap**: your cases that look similar to one of theirs (matching is by title: it ignores punctuation, filler words and plurals, so "Airline profit case" matches "Airline profitability"). Check these first.
3. **Where their shared history is thin**: case types and industries they've shared little or nothing in, with how many you could offer. Tap one to narrow your list.
4. **Cases they've shared**, marking the ones you've done too.

You can filter by name, casebook, industry and case type. It uses **only** your cases and what they chose to share, so it
never claims a case is definitely new to them: cases they keep private or haven't logged don't appear, and the page says so.
If someone shares no case history, it says it can't tell what they've done. CaseLab stores case metadata only (names,
sources, industry, type); it doesn't host casebook content, exhibits or answer keys.

### How privacy is enforced

Privacy is enforced in the database, not in the screens:

- Other members can **never read your `cases` table**. It stays readable only by you (row level security), so a direct API
  request for someone else's case returns nothing, whatever their settings are.
- They read a separate **`shared_cases`** table. It contains only the fields you chose to share, and database triggers keep it
  up to date in the same transaction as any change to a case or a switch. Private values aren't hidden there: they aren't in it
  at all, so no query, filter, sort or count can leak them. Turning a switch off removes the data immediately.
- It's read-only for members, internal functions can't be called through the API, and signed-in users get only the privileges
  they need.
- **Visitors without an account** (the database's `anon` role) have **no privilege at all** on `cases`, `profiles` or
  `shared_cases`. They read two separate tables, `public_profiles` and `public_shared_cases`, which hold only members who
  switched public on and only the fields visitors may see (no written feedback or notes, and not the private case id). Because
  those are the only tables they can touch, they can't filter, sort, count or even estimate their way to anything that isn't
  public, and the tables are filled by the same triggers, so changes apply at once.
- Membership (`is_member_id()`) requires a verified email and is the single place to change who counts as a member.

These rules are tested directly against a real Postgres (see Tests), including attempts to bypass the interface.

---

## How your data is stored and protected

| Table | Holds | Who can read it |
| --- | --- | --- |
| `cases` | Your cases: date, title, source, case type, industry, partner, overall rating and feedback, the eight MCG skill ratings with feedback (one `skills` JSON column), takeaways, improvement tag, other notes, sharing override | Only you |
| `opportunities` | Your hand-edited lists from the MCG "Opportunity Areas" tab | Only you |
| `profiles` | Name, optional MBA class, listed and public flags, the sharing switches. No email | Verified members (listed profiles) |
| `shared_cases` | The owner-approved projection of cases (see above). Written only by triggers | Verified members |
| `public_profiles`, `public_shared_cases` | Copies for members who chose to be public, without free text. Written only by triggers | Anyone, including visitors without an account |

Averages, coverage, trends, suggestions, learning history and custom industries are calculated in the browser from your own
rows, so they need no tables, and your personal dashboard can never include other members' records. Fields that are optional
in the form are nullable in the database; only title, case type and date are required, and the database also enforces ratings
of 1 to 5 and the 13 MCG case types.

**Access control.** Every personal row has a `user_id` that the database fills in from your login, and row level security
allows a signed-in user to read and change only their own rows.

**Saving is honest.** Nothing appears saved until Supabase confirms it. If a save, edit or delete fails, you see the
error (the Log Case form keeps everything you typed so you can retry), and if loading fails you get an error screen with
Retry rather than an empty dashboard that looks like lost data. The only things kept in the browser are the theme, a
half-written Log Case draft, and Supabase's own sign-in session; none of them hold saved cases.

**Two devices.** Changes show up on the other device when you come back to its tab (the app refreshes your cases then).

### Download, import and demo mode

| Action | Where | Notes |
| --- | --- | --- |
| Extra copy of everything | Settings → Download backup (JSON) | Every case, rating, feedback note, learning and list item, and each case's sharing setting |
| Restore a backup | Settings → Import backup (JSON) | **Merge** (adds cases, newer edit wins, deletes nothing) or **Replace everything**. Replace writes the file first and removes leftovers second, so a failure can't leave you with less than you started with |
| Spreadsheet view | Settings → Export cases (CSV) | One row per case, MCG column order plus CaseLab's additions |
| Bring in your MCG log | Dashboard or Case Log (empty state), or Settings → Import from Excel | A preview first, nothing saved until you confirm. See "Importing your Excel log" below |
| Wipe | Settings → Clear all data | Requires typing `DELETE` |
| Sign out | Settings → Sign out | |
| Demo | Settings → Try demo mode | 16 clearly labeled sample cases held only in this tab's memory. They are never sent to your account, never shared, and People is switched off while in demo mode |

The app starts with 0 cases and shows no scores, trends or suggestions until you log something.

---

## Importing your Excel log

Open **Import from Excel** from the Dashboard or Case Log (when empty) or from Settings, then drop in your `.xlsx` file. CaseLab reads
it in your browser and shows a review screen first; **nothing is saved until you press Import**.

| From the workbook | In CaseLab |
| --- | --- |
| **Log** tab: date, title, source, case type, interviewer, overall, all eight skills with their feedback, Other | The same fields on each case |
| **Opportunity Areas** tab (the two lists you typed beneath the headings) | The two lists on Improvement Areas |
| An **Industry** column, if you added one | The case's industry |
| Any other columns you added (for example "Duration") | Kept in the case's private "Other notes" as `Header: value` |

How it copes with real spreadsheets:

- Columns are found by heading, so reordered or renamed ones ("Partner", "Casebook", "Structure", "Math") still work.
- Case types are matched loosely ("M&A", "org change", "Market entry (pharma)"). Anything it can't place becomes Other, with your original wording kept in the case's notes.
- Ratings like `4/5` are read as 4, decimals are rounded, and text such as "seven" is left blank. Each of these is listed under the case.
- Day-first dates (25/10/2026) are understood when the month would otherwise be impossible.
- Industries are suggested from the case title where the words are clear, and you can change any of them before importing.
- Cases already in your log (same date and title) and list entries you already have are skipped, so importing twice is safe.
- **Imported cases are private by default.** You can instead choose to have them follow your Profile & privacy settings, which is how a case you log normally behaves.

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

4. In Supabase → Authentication → URL Configuration, set **Site URL** to your Vercel address and add it (plus
   `http://localhost:5173/**` and, if you want working verification links on preview deployments, your preview URL pattern)
   to **Redirect URLs**. Email verification and password-reset links return to those addresses.
5. Deploy. **Apply the database migrations first** (Set it up, step 1): the app expects the newest tables.

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
  features/    The screens: dashboard, caselog, improvement, people (directory, profiles, find a case),
               plus auth (sign in / sign up / reset), community (onboarding, profile & privacy), logcase, settings
  components/  Shared UI primitives, layout, chart colors
  test/        Test setup, builders, fixtures, fake Supabase / fake backend
supabase/
  migrations/  The database schema, versioned with the code
  config.toml  Supabase CLI configuration
```

Your own data goes through the small `CaseLabRepository` interface in `src/data/repository.ts` (`SupabaseRepository` for real
data, `createMemoryRepository` for demo mode and tests), the community through `CommunityRepository`
(`src/data/community.ts`), and sign-in through `AuthApi` (`src/data/auth.ts`). The domain logic (including case matching in
`src/domain/pairing.ts`) and the screens don't know Supabase exists.

There is no group administration, messaging or social feed: members, profiles and sharing are all there is.

**Tech**: React 19, TypeScript, Vite, Tailwind CSS v4, Supabase (`@supabase/supabase-js`), Recharts (lazy-loaded),
`read-excel-file` (loaded only when you import an Excel file), Vitest + Testing Library, PGlite for the database tests.

---

## Tests

`npm test` runs the whole fast suite (about 170 tests) covering:

- **Database**: the real migrations run in Postgres (PGlite): required vs optional columns, rating and case-type rules, and row level security for personal data (own rows only, no cross-user read/update/delete/insert, no anonymous access, signed-out writes refused, cascade on user delete)
- **Public visitors**: the `anon` role tried as a scraper would: nothing public by default, opt-in only, no free text (the columns don't exist in the public tables), private cases hidden, no access to any member or personal table (so no filters, counts or planner estimates over hidden data), no writes or function calls, length and skill-name limits, and former members removed by `revoke_nonmembers()`
- **Privacy**: three verified members and one unverified, tried as an attacker would with direct queries: nothing shared by default; each switch reveals only its own field; scores need case history; per-case overrides (private, name only, full); changes apply immediately and leave no stale data; unlisted members vanish; `other_notes` never appears and the partner only with its own switch; another member can't read, edit or delete your cases or profile, write the shared table, or call the internal functions; filters, sorting and counts can't reveal hidden values; unverified and anonymous users get nothing; least-privilege table grants
- **Community logic**: loose case-title matching, pairing (what to offer, what to avoid, thin areas) and the filters
- **Accounts**: sign-up, verification, resend, expired links, password reset, onboarding with everything off by default
- **Supabase layer**: row mapping that round-trips every field, a repository run against a fake Supabase (paging past 1000 rows, chunked upserts, replace-without-data-loss, errors surfaced), friendly error messages, configuration checks
- **Calculations**: week boundaries, averages that ignore missing ratings, behavioral combining, trend windows, coverage, matrix, weekly history
- **Rules**: milestones, suggestions (including "stays silent with too little data"), improvement areas, knowledge filtering, case-log search / filter / sort
- **Backup and import**: lossless JSON round trip, merge semantics, CSV quoting; Excel import (a populated sample, a richer workbook with an Industry column, extra columns and filled-in Opportunity Areas, and the empty template), header and case-type matching, industry suggestions, and the review screen end to end
- **The app end to end** against a fake Supabase: sign-in and sign-out, nothing requested before sign-in, create / edit / delete with confirmation, data surviving a refresh, a failed save keeping what you typed, a failed delete, a failed load with Retry, a missing-tables message, demo mode never touching the database, export then restore, clear-all

### Live checks against your real Supabase project (optional)

`npm run test:e2e` runs against the real database in three parts. It only creates rows titled `ZZ CaseLab e2e ...` and removes
them afterwards. Put credentials in a git-ignored `.env.e2e.local` in the project root; any part without credentials is skipped:

```
# Your account: personal-data checks only (read-back, constraints, row level security). Never creates a profile.
CASELAB_E2E_EMAIL=you@example.com
CASELAB_E2E_PASSWORD=your-password

# Two THROWAWAY accounts (Supabase dashboard -> Authentication -> Users -> Add user, tick Auto Confirm):
# the full app flow, and privacy between two real accounts with direct API requests.
CASELAB_E2E_EMAIL_A=e2e-a@example.com
CASELAB_E2E_PASSWORD_A=...
CASELAB_E2E_EMAIL_B=e2e-b@example.com
CASELAB_E2E_PASSWORD_B=...
```

Use throwaway accounts for A and B: the tests create their profiles (which can't be deleted through the API) and flip their
sharing switches, then restore them to listed with nothing shared.

## Limitations

- Weeks start on Monday.
- The MCG template has no industry column. The import suggests one from the case title where the words are clear (an airline, a hospital) and you confirm or change it on the review screen; anything left unset shows "–" until you edit the case.
- Edits made on two devices at the same moment aren't merged: the last save wins (fine for one person).
- Case matching is by title only, so very different spellings of the same case can be missed, and different cases that share
  most of their words can be flagged as "might overlap". It never decides for you.
- Member names aren't verified: anyone with a verified email can choose any display name, and no email is shown to check it. Restricting sign-up to Booth addresses (see Set it up, step 2) is the fix if impersonation becomes a concern.
- Anything a member makes public can be read, copied and scraped by anyone, and can't be recalled once copied. That is why it is opt-in, off by default, confirmed, and excludes written text. Visitors can page through the public members and their cases; there is no rate limit beyond Supabase's own.
- Per-case settings other than "private" (name only, full) also apply to visitors once a profile is public; "private" is the only per-case way to hide a case from everyone.
- The People directory shows listed members alphabetically (first 50 per search); there is no pagination or profile photo.
- CAPTCHA is recommended for public sign-up but isn't wired in yet (see Set it up, step 2).
