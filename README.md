# CaseLab

A personal practice tracker for consulting case interviews. It keeps the simplicity and evaluation framework of Booth MCG's
case log spreadsheet and adds what a spreadsheet can't do well: instant dashboards, coverage maps, and a short list of
what to practice next.

**Design goal: logging a finished case takes under two minutes.** Only a title, case type and industry are required.
Everything else (ratings, notes) is optional and one tap away.

- **Dashboard**: totals, skill averages, trends, case-type and industry coverage, next-practice suggestions, weekly history, milestones
- **Case Log**: searchable, filterable list of every case with full-detail view, edit and delete
- **Improvement Areas**: thin spots in your coverage, skills to sharpen, and a searchable history of what you've learned
- **Data stays yours**: saved in your browser, with JSON backup/restore, CSV export and MCG Excel import

No backend, no account, no API keys.

---

## Run it

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

## Where your data lives (read this)

CaseLab stores everything in **your browser's local storage**, on this device only.

- It survives refreshes, restarts and updates to the app.
- It does **not** sync between your laptop, phone, or different browsers. Each has its own separate data.
- Clearing site data, using a private window, or switching browsers means starting empty.

So treat **Settings → Export backup (JSON)** as your save game. It contains every case, rating, feedback note, learning
note and list item, and restoring it loses nothing. To move to a new device: export on the old one, import on the new one.
The footer shows the date of your last backup.

If you have a few weeks of cases in there, export a backup now and then.

### Import and export

| Action | Where | Notes |
| --- | --- | --- |
| Export everything | Settings → Export backup (JSON) | Lossless. Includes lists and custom industries |
| Restore a backup | Settings → Import backup (JSON) | Choose **Merge** (adds cases, newer edit wins, deletes nothing) or **Replace everything** |
| Spreadsheet view | Settings → Export cases (CSV) | One row per case, MCG column order plus CaseLab's additions. Opens in Excel with accents intact |
| Bring in your MCG log | Settings → Import MCG Excel log | Reads the `Log` sheet by header names. Skips duplicates (same date + title). Imported cases have no industry; open one to add it |
| Wipe | Settings → Clear all data | Requires typing `DELETE` |

### Demo mode

Settings → **Try demo mode** loads 16 clearly labeled sample cases so you can see a populated dashboard. Demo data lives
under a separate storage key and is never mixed with your real cases. Exit demo mode and your real data is exactly as you
left it. The app otherwise starts with 0 cases and no scores, trends or suggestions.

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

## Deploy it

`npm run build` produces a static site in `dist/`. It uses relative asset paths and hash-based navigation, so it works at
a domain root or any sub-path on any static host, with no server rules or redirects needed.

**Vercel / Netlify / Cloudflare Pages** (easiest): import the GitHub repo.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 20.19+ (22 recommended) |

**GitHub Pages**: the repo includes `.github/workflows/deploy-pages.yml`, run manually from the *Actions* tab. First enable
Pages (*Settings → Pages → Source: GitHub Actions*). Note that Pages for **private** repositories requires a paid GitHub
plan; otherwise use one of the hosts above.

**Any file server**: upload the contents of `dist/`.

Remember that data is per browser **and per web address**: if you move the site to a new URL, export a backup first and
import it at the new address.

### Continuous integration

`.github/workflows/ci.yml` runs typecheck, tests and build on every pull request and push to `main`.

---

## Project structure

```
src/
  domain/      Pure TypeScript: types, constants, and all calculations (stats, suggestions,
               improvement areas, knowledge, milestones, filters). No React, no storage.
  data/        Persistence and I/O: storage adapter, JSON backup/merge, CSV, MCG Excel import, demo data
  state/       React context: data provider (the only writer), toasts, theme, routing
  features/    The three screens (dashboard, caselog, improvement), plus logcase and settings dialogs
  components/  Shared UI primitives, layout, chart colors
  test/        Test setup, builders, fixtures
```

**Adding cloud sync or login later** doesn't require rewriting the app. All persistence goes through the small
`CaseLabStorage` interface in `src/data/storage.ts` (`load`, `save`, `clear`). Implement it against Supabase, Firebase or
your own API and pass it to `<DataProvider realStorage={...} />`. The domain logic, UI and backup format don't change.

**Tech**: React 19, TypeScript, Vite, Tailwind CSS v4, Recharts (lazy-loaded), `read-excel-file` (loaded only when you import
an Excel file), Vitest + Testing Library.

---

## Tests

`npm test` runs 68 tests covering:

- Calculations: week boundaries, averages that ignore missing ratings, behavioral combining, recent/trend/first-vs-latest windows, case-type / industry / matrix coverage, weekly history
- Rules: milestones, suggestions (including "stays silent with too little data"), improvement areas, knowledge filtering, case-log search / filter / sort
- Persistence: refresh survival, corrupted-data rescue, schema-version warning, demo isolation
- Backup: lossless JSON round-trip, merge semantics, CSV quoting, MCG Excel import (against a populated sample workbook and the empty template)
- The app end to end: empty state, logging, dashboard updates, validation, edit, delete-with-confirmation, filtering, demo mode, clear-all, and export-then-restore of a JSON backup through the real UI

## Limitations

- Data is local to one browser (see above), so back it up.
- The MCG import can't know industries, so imported cases show "–" until you edit them.
- Weeks start on Monday.
