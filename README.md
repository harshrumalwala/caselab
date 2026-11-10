# CaseLab

A case interview practice tracker for Booth students, built on the MCG case log. Every member keeps a private case history and
dashboard, and can choose to share some of it with other members, or with anyone, to help each other find the right case to practice.

**Design goal: logging a finished case takes under two minutes.** Only a title, case type and industry are required.
Everything else (ratings, notes, sharing) is optional and one tap away.

- **Dashboard**: totals, skill averages, trends, case-type and industry coverage, next-practice suggestions, weekly history, milestones
- **My Case Log**: searchable, filterable list of your cases with full-detail view, edit and delete
- **Improvement Areas**: thin spots in your coverage, skills to sharpen, and a searchable history of what you've learned
- **A public front page**: anyone, with no account, can search the members who chose to be visible and read what they share
- **Warm-up**: an optional mental-math sprint of 30, 60 or 120 seconds for a break between cases, across fifteen kinds of quant question (your best score and streak for each length follow your account)
- **Community**: one tab with two views. **Members**: find a fellow member, see only what they've chosen to share, and work out which case to give them. **Inbox**: practice requests and your conversations together
- **Practice requests**: ask a member to case (with a proposed case and time), and answer when someone asks you. Open to every member, and short notes only
- **Messages**: once a request is accepted, a private conversation between the two of you, to settle a time, share a link or go over a case afterwards. It lives in the Community tab's Inbox, and the Dashboard tells you when something is waiting
- **Email notifications**: an email when someone asks you to case (with the case, casebook, time and their note, so you know what you're answering) and when someone says yes. On by default, one switch in Profile & privacy turns it off
- **Profile & privacy**: switches for what other members can see, a per-case override, and a live preview
- **Interviewed cases**: log the cases you ran as the interviewer, with what you told them and what it taught you. Kept apart from the cases you solved and private to you
- **Bucket** (the coach, with a bucket avatar): sorts the feedback you wrote on your own cases (the latest ten, or all) into what you are good at and what to work on, each area tied to a skill with one next step. Only when you ask, and only your own writing is used
- **Casebook library**: search practice cases from the casebooks (Booth MCG first) by name or book while logging a case, and the title, book, case type and industry fill themselves in. Members see only a case's name, book, type and industry until they have done it
- **Levels and rewards**: earn XP for logging well and for getting better, climb from Intern to Partner, finish weekly quests, earn skill medals and fill a sticker book. On by default, and one switch in Settings hides all of it
- **A weekly goal**: pick how many cases a week you want to log; a ring on the Dashboard fills as the week goes, and weeks in a row on target show as a streak. Private to you
- **Your data, on every device**: saved to your account in [Supabase](https://supabase.com) behind a login. JSON backup, CSV export, an Excel import that reads the MCG template, and an Excel export that fills in the real MCG workbook are built in
- **Find your way around**: a short tour for a new account, keyboard shortcuts (`?` lists them), and it can be installed on a phone or desktop like an app

---

## Set it up

CaseLab is a static React app. It needs a Supabase project for sign-in and storage. Setup takes about fifteen minutes, once.

### 1. Create the database tables (the migrations)

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

**Deleting your account.** Settings → Danger zone → **Delete my account…** removes your account and everything in it, for good, after you
type `DELETE`: your cases, lists, weekly goal and Warm-up record; your profile and anything you shared or made public; your practice
requests and blocks; every conversation you were in (so the other person loses it too); and your login, so the email can't sign in
again. It signs you out and clears what this browser remembered about you. Download a backup or an Excel copy first if you might want
your cases later: nothing is archived and it can't be undone. A report someone filed about a conversation with you is kept (the reason and
the messages as they were) but no longer points to you. It is separate from **Clear all data**, which empties your cases and lists but
keeps the account. Not available in demo mode. Under the hood it is one database function, `delete_my_account('DELETE')`, that deletes
only the caller's own login; everything else follows through "on delete cascade".

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
| **Interviewed cases** | The cases you ran as the interviewer (title, book, type, industry, date) and how many, to other members only (see below) |
| **Open everything** | Every detail of each case you share: scores, improvement focus, written feedback, learning notes and your Other notes (see below) |

Scores, feedback and notes only apply to cases that are shared, so they switch on after **Case history**.

**Visible without an account** is a separate, extra switch under "Who can see me", **off by default** (nobody who joined before
this existed is public). Turning it on asks you to confirm, because anyone on the internet could then see your name, class
and the case history, scores and improvement focus you've chosen to share. The same switches decide what: **written feedback,
learning notes and other notes are not shown to visitors unless you turn on Open everything** (below). A case set to "keep this case
private" is hidden from everyone; a case set to "share the case name only" or "share this case in full" is shown to visitors
too once your profile is public (a "full" case shows its scores and improvement focus, and its text only if you opened everything). Profile & privacy
previews each audience separately. Turning it off, or no longer appearing in People, withdraws you from the public page at once. Each switch saves the
moment you flip it, and **"What other members see"** at the bottom shows exactly what the database is serving about you.

**One-click private.** Any case can be hidden from every other member, whatever your profile shares: switch on **Keep this case
private** when you log or edit it, or click the lock on its row in the Case Log (or **Make private** in the case detail). A private case
shows a **Private** badge in your log, is removed from the shared copy straight away, and stays hidden from visitors too. Imported cases
can also start private (see the import options).

**Burned books.** If you have already worked through a casebook (for example on your own), add it under **Books I've burned** in Profile &
privacy, or tick **I've burned this book** when you log a case from it. When another member opens your profile and picks a case for you,
their suggestions skip their cases from those books, and say how many were left out. Your profile shows "Has burned ..." to members who can
see it. It is advice, not a lock (it only changes what that screen suggests), it only names casebooks you typed yourself, and it is never
shown to visitors without an account. Books are matched by name ignoring case and filler words ("Booth casebook" and "The Booth Casebook"
are the same book).

**Burned cases (solo practice).** For single cases you worked through on your own, open **Cases I've burned** in Profile & privacy (or
click "Practiced solo? Burn cases without logging them" on the Case Log), optionally name the book, and paste the titles, one per line.
They are **not practice cases**: they never appear in your Case Log or count in any total, rating or coverage. They only tell members who
are picking a case for you to skip those exact cases (matched by title, however it was typed). Like burned books, the list is visible only
to members who can see your profile and never to visitors. Use **I've finished this whole book** (when logging) or **Books I've burned**
only when you really did the entire book.

**Burned books and cases for visitors.** Members can always see what you've burned (on your profile, and in the "What others see"
preview). If you're visible without an account you can also switch on **Show burned books and cases to visitors**: it is off by default, and
while it is off the public copy is empty, so there is nothing to read. Visitors can't use "find a case for them", so for them it is display
only. They never count in your totals either way.

**Per case.** When you log or edit a case, an optional **Sharing for this case** section lets you override your defaults:
use your profile settings (the default), keep this case private, share only its name, or share it in full (its scores,
feedback and notes, even if your profile shares none of those). Nobody has to touch it when logging.

**Who cased me** is its own switch, **off by default**, because it names a third person who hasn't agreed to be listed. When on, the
partner name appears on every one of your cases that is shared at all, to members and (if your profile is public) to visitors; a case set to
"keep this case private" never shows it. The casebook or source of each case is part of **Case history**, so it is shown with it.

**Typing a name.** The "Interviewer / practice partner" box on a case, and "Who you interviewed" on an interviewed case, suggest the names you
used before and any community member whose name matches what you type (with their class beside it). It only suggests: anyone who isn't on CaseLab
can be typed in as plain text, and nothing is linked or stored except the name that ends up in the box. Suggestions are off in demo mode and quietly
absent if the member search fails.

**Interviewed cases** is its own switch, **off by default**, and it does not need Case history. When on, other *members* (never visitors) see how
many cases you have interviewed ("Has interviewed 7 cases") and a list of them on your profile, so they know whom to ask and which cases you
already know from the other side. Only the case itself is shown: its title, book, type, industry and date. **Who you interviewed, what you told
them and what you learned are never shared.** Turning the switch off, or unlisting yourself, hides the list at once. Members read it through one
function, `member_interviewed()`, which checks on every call that they are a verified member and that you are listed and have switched it on;
there is no copy of the data to go stale.

**Open everything** is one switch for people who want to show their whole log: every case you share (one that follows your profile,
or is set to "share in full") shows its scores, improvement focus, written feedback, learning notes and Other notes, to members and, if
your profile is visible without an account, to visitors. Visitors see the usual card first; a case that has detail gets a **See more
details** button that opens it. Turning it on while you are visible without an account asks you to confirm, because it changes what
visitors read. "Name only" and private cases stay as they were, "Who cased me" stays its own switch, and long text is cut to 2000
characters in the public copy.

**Only people with my link.** When you are visible without an account you can choose where visitors find you: **on the front page and in
search** (the default), or **only people with my link**. A link-only profile is not on the front page, in search, in "Cased recently" or in
any count, but anyone who has your profile address (it contains your member ID) can open it and sees exactly what visitors see. Profile &
privacy shows the address with a Copy link button. The ID is permanent, so the only way to cut off someone who has the link is to switch
visibility off. This is enforced in the database: visitors can read only the directory from the public tables, and open a single member
through two functions that need the exact ID.

**Never shared, whatever you choose:** your email address. Your Other notes stay private unless you turn on Open everything.

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
  switched public on and only the fields visitors may see (written feedback and notes only if the member opened everything, and never the private case id). Link-only members are left out of what these tables return: visitors reach one only through functions that take the exact ID. Because
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
| `profiles` | Name, optional MBA class, listed and public flags, the sharing switches, burned books and cases. No email | Verified members (listed profiles) |
| `practice_requests`, `practice_blocks` | Requests between two members (a proposed case, a time, a note and a reply, each short) and who you've stopped asking. No direct table access at all: only functions that act on your own requests | Only the two people involved |
| `conversations`, `conversation_members`, `messages` | A private conversation between two members (it starts when a request is accepted), each person's read marker, mute and archive, and the messages (1 to 1000 characters). No direct table access at all: only functions that act on your own conversations | Only the two people involved |
| `message_reports` | A report (a reason and a snapshot of the last 30 messages). Kept even if the people involved leave | Only the database owner |
| `warmup_best` | Your best Warm-up score and streak for each round length (one row per member and length: 30, 60 or 120 seconds). Read-only for you; changed only by `record_warmup_best()`, which can only raise it | Only you |
| `interviewed_cases` | Cases you ran as the interviewer: date, title, book, type, industry, who you interviewed, what you told them and what you learned. Same case-type list as `cases`, with length limits. Never joined to `cases`, so it can't reach a total, rating, trend or the weekly goal | Only you |
| `weekly_goal` | Your weekly goal in cases (one row per member, 1 to 14; no row means no goal). Progress and streak are worked out from your cases, so nothing else is stored | Only you |
| `shared_cases` | The owner-approved projection of cases (see above). Written only by triggers | Verified members |
| `public_profiles`, `public_shared_cases` | Copies for members who chose to be public (free text only if they opened everything; link-only members are excluded from table reads). Written only by triggers | Anyone, including visitors without an account |

Averages, coverage, trends, suggestions, learning history and custom industries are calculated in the browser from your own
rows, so they need no tables, and your personal dashboard can never include other members' records. Fields that are optional
in the form are nullable in the database; only title, case type and date are required, and the database also enforces ratings
of 1 to 5 and the 13 MCG case types.

**Access control.** Every personal row has a `user_id` that the database fills in from your login, and row level security
allows a signed-in user to read and change only their own rows.

**Saving is honest.** Nothing appears saved until Supabase confirms it. If a save, edit or delete fails, you see the
error (the Log Case form keeps everything you typed so you can retry), and if loading fails you get an error screen with
Retry rather than an empty dashboard that looks like lost data. The only things kept in the browser are the theme, a
half-written Log Case draft, a copy of your Warm-up record, and Supabase's own sign-in session; none of them hold saved cases.

**Two devices.** Changes show up on the other device when you come back to its tab (the app refreshes your cases then).

### Download, import and demo mode

| Action | Where | Notes |
| --- | --- | --- |
| Extra copy of everything | Settings → Download backup (JSON) | Every case, rating, feedback note, learning and list item, and each case's sharing setting |
| Restore a backup | Settings → Import backup (JSON) | **Merge** (adds cases, newer edit wins, deletes nothing) or **Replace everything**. Replace writes the file first and removes leftovers second, so a failure can't leave you with less than you started with |
| Excel file | Case Log (top right) or Settings → Export to Excel | Your cases filled into the real MCG workbook, ready to open in Excel and to import again. See "Exporting to Excel" below. Sharing choices and burned cases are not in it; the JSON backup is the complete copy |
| Spreadsheet view | Settings → Export cases (CSV) | One row per case, MCG column order plus CaseLab's additions |
| Bring in your MCG log | The Dashboard's Excel card (while empty), the Case Log header, or Settings → Import from Excel | A preview first, nothing saved until you confirm. See "Importing your Excel log" below |
| Wipe | Settings → Clear all data | Requires typing `DELETE`. Empties your cases and lists; keeps your account |
| Delete your account | Settings → Delete my account | Requires typing `DELETE`. Removes the account and everything in it, for good. See "Accounts" |
| Sign out | Settings → Sign out | |
| Demo | Settings → Try demo mode | 16 clearly labeled sample cases held only in this tab's memory. They are never sent to your account, never shared, and People is switched off while in demo mode |

The app starts with 0 cases and shows no scores, trends or suggestions until you log something.

---

## Importing your Excel log

Open **Import from Excel** from the Dashboard (the Excel card, while your log is empty), the Case Log header or Settings, then drop in your `.xlsx` file. If you chose **Create account and import** on the front page, the import opens by itself the first time your new account loads with no cases (the wish is kept in your browser for three days and used up once). CaseLab reads
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

## Bucket, the coach (Claude reads your feedback)

On **Improvement Areas**, a **Bucket** card (a coach with a bucket avatar and a small AI tag; "bucket" is consulting for a group in a structure, and Bucket sorts your feedback into two) asks Claude (behind the scenes: the screen says Bucket and AI, and never names Claude or Anthropic) to read the feedback and notes you have written on your own cases and give a short, honest read: a one or two sentence summary, up to three real strengths and up to three things to work on (most important first), each with the skill it belongs to and one concrete thing to try in your next case. Choose **Last 10 cases** or **All cases (latest 30)**; the button says **Bucket my feedback** (then **Re-bucket my feedback**).

- **What is sent.** Only your own writing: overall feedback, feedback on each skill (with its rating), what went well, what you struggled with, what you learned and what to focus on next, plus each case's date, type, industry, overall rating and improvement tag. **Never** the case title, the practice partner, the source, your "other" notes, or anything about another member. Text is cut to 600 characters a field and 30,000 in all, so one read is bounded in size.
- **Only when you click.** Nothing is sent on page load or in the background, and the card says in one line that it is private and uses only your own notes. The outside service that writes the read is named here, not on screen: your writing is processed by Anthropic's Claude API, so keep that in mind for your own privacy policy. It needs written feedback on at least 3 cases. Demo mode never shows it (sample data has no account behind it).
- **The key never reaches the browser.** The app calls an Edge Function (`supabase/functions/analyze-feedback`) with your own token. The function reads your cases through your token (so row level security means only your own can ever be read), builds the prompt itself from a fixed system prompt (it is not a general chat proxy: the client sends only a scope), asks Claude with structured output, checks the answer's shape, and stores it. It requires a verified email.
- **Kept, so it costs nothing to look again.** The last read is stored in `feedback_insights` (one row per member, replaced each time, private to the member, deleted with the account; members cannot write it, only the function can). A fingerprint of the exact text, scope, model and prompt version means clicking again with nothing changed returns the stored read without calling Claude; changed feedback can be re-read at most every five minutes.
- **Failure is quiet on screen and specific for whoever fixes it.** A refusal, a cut-off or malformed answer, or a network error leaves the previous read in place, and the card only says Bucket couldn't sort that just now. The function's reply carries a one-word reason for whoever is fixing it (`ask_failed` with the first part of the API's own message, `refused`, `cut_off`, `bad_answer`), never the member's text. This is how a rejected answer format was found on the first live run.
- **Model.** `claude-sonnet-5-5` by default (a good balance of sharp advice and cost: roughly 3 cents a read, so about $30 to $40 a month for 100 members reading daily, less since an unchanged log is never read twice); set the `ANTHROPIC_MODEL` secret to use another, for example `claude-haiku-5-5` to cut the cost about twentyfold or `claude-opus-5-5` for the most thorough reads. Refusal fallbacks are not enabled: a refusal just shows as a failed read.

To switch it on for a project (it stays off, with a polite message, until the secret exists):

```bash
supabase db push                                   # adds feedback_insights
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  # optionally ANTHROPIC_MODEL=...
supabase functions deploy analyze-feedback
```

The decisions (what is read, the prompt, the accepted answer, the stored-answer and rate-limit rules) are plain functions in `supabase/functions/_shared/feedbackInsights.ts`, tested without a network; the function file only plugs in the database and the Anthropic API.

---

## Casebook library (search a case while logging it)

A library of practice cases from the casebooks, so a member can find a case instead of typing it out. In **Log case**, the **Case title** field suggests casebook cases as you type it (it searches by case name, book, school or year: every word you type must match; exact and starting matches first, then the co-chairs' picks, then newer books). Pick a suggestion, with the mouse or with the arrow keys and Enter, and the **title**, the **book as the source**, the **case type** and the **industry** fill in; a small chip says what it was filled in from and can be removed. Enter never takes a suggestion you didn't choose with the arrows. It is a convenience: it finds nothing or fails without a word, and a title that isn't in any book is typed exactly as before. It is a plain title box when editing a case or in demo mode.

- **What members may know about a case they haven't done.** Only its name, book, school, year, case type and industry, and whether the co-chairs recommend it. That is all `library_cases` holds, and it is read-only for verified members.
- **Our analysis is locked away.** For each case we keep our own analysis (a summary, what a strong answer covers, common mistakes, the skills it tests, a difficulty, how confident the reading was) in `library_case_notes`. **No API role can read that table at all.** The function `library_notes_for(case)` releases it only to a verified member whose own log contains that case, for comparing their feedback with what a strong answer covers once they have done it. It is the member's own word that they did it (picking it from the search links the case), and doing one case never unlocks another.
- **The link is kept on the case.** `cases.library_id` remembers which library case a logged case came from. It is optional and private like the rest of the case, survives editing, and becomes empty if a library case is removed.
- **One entry per case name.** A case that appears in several casebooks is one library entry: the **Booth MCG copy wins**, otherwise the **newest book**, and the other books it appears in are kept as `also_in` ("Also in Kellogg Case Book 2020") and searched too, so someone who did it from another book still finds it. The same name ignoring case, punctuation and "Co." counts as the same case (generic names like "Shoe Co." may therefore merge two different cases, which is worth a look when more books are loaded). The choice is made when the library is loaded and never depends on the order of the files; a copy loaded by an earlier run that has since lost to a better one is folded in, and any case a member had linked to it is moved to the winner so no link is lost.
- **Listed or analysed.** A case can be in the library with only its name and book (enough to search and fill in the form), with the analysis added later. Cases that were only listed from a book's contents page carry `details_known = false` when the book gave no case type or industry: the library never shows or fills a made-up "Other", picking one fills only the title, the book and the link, and the member chooses the type and industry. A case whose details are known is ranked before one that isn't, and the review screen never suggests changing a type or industry to an unknown one. If the winning copy has no analysis but another copy does, it uses that one and says so in its notes.
- **What is in it.** The Booth MCG casebook and the co-chairs' recommended cases (read in full, with the confidence noted; charts that don't extract as text were re-read from the page images) are analysed. Every other case from 50 more casebooks across Kellogg, Ross, Darden, Fuqua, Stern, Wharton, Haas, HBS, Yale, Columbia, MIT and Tuck is listed by name, so the search covers them. Two books carry no year, so they are filed under the placeholder year 2000, and books that came in twice under different years are loaded once. IESE 2021 was not supplied.
- **Cases you already logged.** Matching is by name (the same title ignoring case, punctuation, "&" and "Co.") and the book you wrote as the source. When the library is loaded, the seed runs a **link-only backfill** (`link_cases_to_library()`): a case that has the same name and whose source names the book (or another book the case is in: "Booth casebook", "MCG" and "Kellogg 2020" all count) gets `library_id` set, and **nothing else about the case changes**, not its title, book, case type or industry. A case with the same name but no book, or a different one, is only a maybe and is never linked automatically, because generic names are reused across books. No API role can run the backfill.
- **Review your own matches.** When some of your cases look like casebook cases, the **My Case Log** page shows a banner ("3 of your cases look like casebook cases", **Review**). The review lists them with what would change (title, book, case type, industry) and lets you choose, per case, which to match: sure matches start ticked, maybes start unticked and say why. Choose **Update my cases to match the book** or **Just link them** (keep your own wording; they only count as done). Nothing changes until you press the button, and only for the cases left ticked. It reads only your own cases, through `match_my_cases()`, and only what any member may know about a library case.
- **Cases to try next.** Under each thing Bucket says to work on that belongs to a skill, the **Improvement** page lists up to three casebook cases that exercise that skill and that you haven't done (co-chair picks first, then newer books). It comes from `library_next_cases(skill)`, which reads the private skill tags inside the database and returns only the public columns (name, book, type, industry), so a member learns "this is good for your quant" and nothing about the case. A case counts as done when one of your cases is linked to it or has the same name. Only the analysed cases carry skill tags, so it starts with those and grows as more books are analysed. It is silent when there is nothing to suggest or the lookup fails. The migration `*_library_next_cases.sql` must be applied before the app that asks for it is deployed.
- **Where the analysis comes from.** Each case was read from the casebook and written up in our own words (never copied), with the book's case type and an industry mapped onto CaseLab's lists. Charts that don't extract as text are marked **partial confidence**: those analyses lean on the interviewer's solution pages. The case text itself isn't stored anywhere.
- **Loading it.** The analyses live in `private-data/casebooks/` and the generated seed in `supabase/seeds/`; both are **git-ignored**, so our write-ups of third-party books never enter git. To load or update the library:

```bash
node scripts/buildLibrarySeed.mjs
supabase db push --include-seed
```

The seed is one transaction and safe to run again (it updates by book and case name, and folds in duplicates as above). The migrations `*_case_library.sql`, `*_library_matching.sql` and `*_library_details_known.sql` must be applied (in that order) before the app that sends `library_id` is deployed, and before the seed is loaded.

The decisions are plain code with tests: the search (`src/domain/library.ts`, mirrored in the database function), the title field (`CaseTitleInput.tsx`), the database rules (`caseLibrary.db.test.ts`) and the loader (`librarySeed.db.test.ts`).

---

---

## Levels and XP

On the Dashboard, once you have a first case, a small **level pill** under the page title shows your level, job title, a thin bar for the way through the level and your XP (a big tile would compete with practising). Click it for the full story in one window with four tabs: **Level** (what is left, the next title, where your XP came from and what earns it), **Quests**, **Medals** and **Stickers**.
Titles run Intern (level 1), Analyst (4), Associate (8), Consultant (12), Engagement Manager (16) and Partner (20), each with a light joke; levels carry on to 30 after that. Reaching a new level shows a
**Promoted** (a new title) or **Level up** moment once, with confetti, and saving a case says how much XP it earned.

XP rewards how well you practise, not just how much:

| What | XP |
| --- | --- |
| A case with a title, type and industry | 20 |
| Rating it overall, and each skill rated | +5, and +2 each (up to eight) |
| Written feedback, a concept learned, an improvement tag, a next focus | +5, +5, +5, +3 |
| The first case in a new case type, and in a new industry | +30, +20 |
| A week (Monday to Sunday) with three or more cases | +25 |
| A skill that got better: your best run of five ratings beats your first five by half a point, and by a whole point | +50, and +50 more |
| Each weekly quest finished (see below) | +5 |

So a fully written-up case earns up to 59 against 20 for a bare one. Only the first three cases of a day earn in full, and later ones a quarter, so logging a pile at once doesn't pay.
A level takes more XP than the last. **Partner (level 20) is about 5,000 XP**, which is meant to take about a hundred cases for someone who logs them in the ordinary way
(a title, type, industry, an overall rating, a few skills and sometimes a note): roughly 65 to 75 cases if every case is written up in full, and a good deal more (about 140)
if you only ever log the bare minimum. The first dozen cases also earn the "something new" bonuses, so the early levels come quickly.

### Quests, medals and stickers

All three are worked out from the log like XP, so they can't drift, an import fills them in on arrival, and deleting cases takes back what those cases earned.

- **Weekly quests.** Each week (Monday to Sunday) offers three small things to try, from a list of thirteen: log 2 cases, log 3 cases, cases on 2 different days, rate 3 cases overall, try a case type you haven't practised, try an industry you haven't, rate every skill in one case, write down what you learned in 2 cases, tag what to improve on 2 cases, one full write-up, and three built from your own log: rate your weakest skill, try the case type you have done least, and case with a partner you haven't cased with before. Which three a week offers depends only on that week and on what you had practised before it, so the same week always offers the same quests, and a quest that doesn't make sense for you (a "new case type" once you have done every main type) is skipped. The weeks step through the list three at a time rather than drawing at random, so a quest never comes back the week after it was offered, each one comes round about every four weeks, and the same trio only returns after thirteen. A quest finished is worth 5 XP, which is deliberately small: quests point at good practice, they are not the way to level. A small **Quests 1/3** pill on the Your week card opens them.
- **Skill medals.** Bronze, silver and gold for each of the seven skills, from your best run of five ratings in a row: an average of 3 for bronze, 4 for silver and 4.6 for gold. It is your best run that counts, so a rough week never takes a medal back. Medals are for show and earn no XP (a skill getting better already does).
- **Sticker book.** About two dozen stickers to collect: your first case, 10, 25, 50 and 100 cases, every main case type, 5 and 10 industries, rating every skill in one case, a full write-up, lessons on 10 cases, a 5-case week, a run of 3 and of 8 weeks in a row, 5 different case partners, raising a skill by a whole point, a medal and a gold medal, finishing 3 and 15 quests, and one for each job title from Analyst to Partner. Earned stickers show in colour and the rest are locked with a hint. Saving a case says which quests it finished and which stickers it won.

- **Worked out from your log, never stored.** XP and levels come from your cases every time, so nothing can drift, nothing can be cheated, and an Excel import counts the moment it lands. The flip side is that deleting cases lowers your XP. The highest level seen in this browser is remembered only so a level is celebrated once: dropping a level takes nothing away and climbing back to it isn't celebrated again.
- **Not touched by the weekly goal**, so changing your goal can never change your XP. Burned cases and interviewed cases earn nothing. Warm-up doesn't earn XP either, for now.
- **Keep it simple.** **Settings → Levels and rewards → Show levels and XP** turns the pill, quests, medals, stickers, the XP line when you save and the celebrations off. It is a setting of this browser and nothing is stored on your account. It is on by default.
- **Demo mode** shows the pill for the sample data but never celebrates or remembers a level, and never shares one.
- **Showing your level to other members** is a separate switch: **Profile and privacy → Level**, **on by default** (new profiles start with it on, and the migration that made it the default switched existing profiles on too) and independent of case history. Switch it off at any time and your level is cleared in the same write. While it is on, other signed-in members see a small "Lv 8 · Associate" badge beside your name in People and on your profile. Only the level and its job title are shared: never your XP, cases, scores, medals or stickers, and never to visitors without an account. The app keeps one number on your profile (`profiles.level`) up to date from your cases while the switch is on (never from demo data). It is a self-reported badge, not proof: the database only checks that it is between 1 and 30, and a check constraint guarantees it is empty whenever the switch is off, so turning it off leaves nothing behind. This is the one place a level is stored rather than worked out; everything else still comes from your cases every time.
- The rules are pure code in `src/domain/progress.ts`, `quests.ts`, `medals.ts` and `stickers.ts`; the pill and its window (with the tabs), the level-up moment and the switch are in `src/features/progress/` and `src/state/game.tsx`.

## Weekly goal

Under **Your week** on the Dashboard, **Set a weekly goal** lets you pick 1 to 7 cases a week (the database accepts 1 to 14). A ring fills as the
week's cases add up, and the line beside it says how many are left. Saving a case shows where you stand, with confetti when that case is the
one that reaches the goal.

- **Streak**: the number of weeks in a row, ending now, that reached the goal. This week counts once it has; a week that is still going doesn't break the run. Only logged cases count (never burned ones), and the streak is always judged against the goal as it is now.
- **Private**: the goal is one row in `weekly_goal` that only you can read or change (row-level security), with a check for 1 to 14. It isn't in your profile or visible to anyone else, and there is no comparison. In demo mode it is kept for the visit only.

## Interviewed cases

Running a case teaches you a lot, so it gets a place in the log: **My Case Log → Interviewed**, then **Log a case you interviewed**. Only a title is
needed; the form also takes the date, case type, industry, book, who you interviewed, what you told them and what running it taught you.

- **Not on the scoreboard.** Interviewed cases are a separate list in a separate table (`interviewed_cases`). They never count in your case total, ratings, trends, coverage, suggestions or weekly goal, and the Case Log header says "N interviewed, not counted".
- **Private unless you choose.** Only you can read or change them (row-level security on all four commands). Other members see the cases themselves (never who you interviewed or your notes) only if you switch on **Interviewed cases** in Profile & privacy; visitors never do. They are not part of "Find a case". In demo mode they are kept for the visit only.
- **Edit, search and delete** work like the rest of the log; deleting asks first.

## Keyboard shortcuts, the tour and installing

- **Shortcuts** work anywhere you aren't typing in a box or in a window: `N` logs a case, `?` shows the list, and `G` then `D`, `L`, `I`, `C` or `W` jumps to Dashboard, Case Log, Improvement Areas, Community or Warm-up.
- **First-login tour**: a brand-new account (no cases yet) gets three notes pointing at **Log Case**, **Import** and **Community**, once. Skip it with a click or Escape; it never comes back, and it steps aside whenever a window is open.
- **Install**: CaseLab has a web manifest and icons, so a browser can offer to install it. Settings → Shortcuts and install shows an **Install CaseLab** button when the browser offers one; on an iPhone use Share → Add to Home Screen.

## Exporting to Excel (the real MCG workbook)

**Export to Excel** (on the Case Log and in Settings) fills in the actual MCG workbook, not a lookalike. The template's four tabs,
column order, merged skill headers, widths, frozen panes, the case-type dropdown, the date check, the Dashboard's formulas, pie chart
and logo are all kept exactly as MCG made them (the file is `src/data/mcg-case-log-template.xlsx`, a copy of the reference template, and
the export edits a copy of it in your browser: nothing is uploaded).

- **Log**: every case on its own row, oldest first, in the template's exact columns: `#`, Date (a real Excel date), Case Title, Case Source,
  Case Type, Interviewer, then **Overall** and each skill (Behavioral 1, Behavioral 2, Prompt / Pre-framework, Framework, Quant / Math,
  Exhibits & Charts, Brainstorm(s), Recommendation) as a rating column followed by its **feedback** column, then **Other**. Rows grow
  tall enough to show long feedback.
- **Extra columns to the right of "Other"**, for what CaseLab keeps and the template has no place for: **Industry**, **What went well**,
  **What I struggled with**, **Concepts I learned**, **Next focus**, **Improvement focus**. The template's own columns are untouched.
- **Dashboard**: your name beside "Name:", and the template's own formulas (total cases, cases in the past week, per-skill averages, count
  per case type, the pie chart) do their work on your cases. The file asks Excel to recalculate when it opens, and the current numbers are
  stored too so a previewer shows them. The formulas are the template's, so the Dashboard tab keeps its quirks (for example its Behavioral
  average reads Behavioral 1 only); CaseLab's own Dashboard combines both.
- **Opportunity Areas**: your two lists under their headings. **Data Validation**: untouched.
- **Import reads it back**, including the extra columns, so a CaseLab export round-trips with nothing lost. (Sharing choices and burned
  cases are CaseLab-only and live in the JSON backup, which is still the complete copy.)

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
- Advice about **Quant / Math** also links to the Warm-up sprint (on the Dashboard and under Skills to improve).
- **Always**: case types you've never practiced (most common interview types first), industries you haven't practiced, and case types seen only once.

### Improvement Areas

- **Limited exposure** separates *no exposure* (never practiced) from *limited exposure* (practiced once). "Other" is never listed as a gap.
- **Skills to improve** needs 3 cases, then ranks skills by: low recent average (under 3.5), declining trend, and how often you tagged it as your main improvement area in your last 10 cases. Skills rated 3.5+ that aren't declining or tagged never appear.
- **Knowledge history** only contains what you typed under "Concepts I learned" (split by line or `;`), merged across cases and grouped by industry. Nothing is pre-populated.

### Practice requests: "Case with me?"

A small way to line up a case without a chat. On a member's profile, **Case with *name*?** sends them a short request: an
optional proposed case and casebook, a time ("tonight 8pm"), and a note of up to 280 characters. They accept or decline, with an
optional reply of up to 280 characters (a video link, how to reach them). Everything lives in **Community → Inbox**, and
the Community tab shows a count when something needs you (requests waiting for your answer, or answers you haven't seen yet; it
refreshes when you come back to the tab and once a minute while the app is open), and so does a "Needs you" strip at the top of
the Dashboard. **Find a case for them** also offers "Ask to case this" on each case you could give them.

- **Open to every member, with no switch.** Any signed-in, verified member can ask any other verified member who appears in People. Members who turn off "Appear in People search" can't be asked: unlisting means disappearing. To stop someone, decline with "don't let them ask again", or block them from a conversation.
- **Private to the two people.** The tables have no direct access for the API roles at all; reads and writes go through database functions that act only on your own requests. Nobody else, and no visitor, can read one. No email address is stored or shown anywhere.
- **Limits.** One waiting request per person, at most 5 waiting at a time and 20 sent in 24 hours. Declining can also stop that person asking again; their next request is refused with the same message as any other refusal, so they can't tell. You can undo that under "Blocked members".
- **Once you're connected, asking again is a message.** After a request is accepted you have a conversation, so "Case with …?" becomes **Case again with …?** and sends the new case details (case, book, time and note) into that conversation as a message. There is nothing to accept: it shows up as new in their inbox and they reply in the conversation. The database enforces it too: a new request between two connected members is refused ("You're already connected with this member. Send them a message instead."). Requests already waiting are unaffected.
- **Emails for the two moments that matter.** The count and the list come from `my_practice_requests()`, and two events also send an email: someone asks you to case, and someone says yes to your request (see Email notifications). Accepting a request opens a conversation (see Messages).
- Requests are not available in demo mode.

### Email notifications

Two events send an email, from the same sender as the sign-up emails (Resend):

| Event | Who is emailed | What it says |
|---|---|---|
| Someone asks you to case | The member asked | Who asked, and the whole request: case, casebook, time and their note, with an **Answer in CaseLab** button |
| Someone accepts your request | The member who asked | Who said yes, what it was about and what they wrote back, with a **Say hello in CaseLab** button |

Declines are never emailed, and neither are chat messages. The emails are branded, have a plain-text version, are readable on
a phone, and use no images or remote files. Everything a member typed is shown as plain text (web addresses become links; nothing
else does).

- **A switch, on by default.** **Profile & privacy → Email me about requests**. The choice lives in its own table (`notification_settings`), private to you, and is not part of your profile, so nobody else can see whether you have emails on. No row means on. It goes with the account when you delete it.
- **The sender never learns whether an email went out.** The app asks the function to send after a request is sent or accepted; the function always answers "ok", whatever it decided.
- **Sent once, to the right person, soon after.** The function (`supabase/functions/notify-request`) checks the caller's sign-in: only the sender can trigger the "asked you" email and only the recipient the "said yes" one; the request must still be waiting (or accepted) and under an hour old; and an atomic marker on the request (`emailed_at`, `answer_emailed_at`, invisible to members) means it is sent at most once however often it is called. If sending fails the marker is released so a later call can try again. Only your own verified address is used, and it is never shown to anyone.
- **Best effort.** If the function isn't deployed or the email service is down, the request still works; the member just isn't emailed.
- **No unsubscribe link yet.** Each email says how to turn them off (the switch above). A one-click unsubscribe endpoint is a possible later addition.

To switch it on for your own project:

1. Apply the migration `supabase/migrations/20261111130000_email_notifications.sql` (`npx supabase db push --linked`).
2. Set the secrets: `npx supabase secrets set RESEND_API_KEY=... EMAIL_FROM="CaseLab <hello@yourdomain>" APP_URL=https://your-app.example` (the sender domain must be verified in Resend, as for sign-up emails; without `RESEND_API_KEY` the function sends nothing).
3. Deploy the function: `npx supabase functions deploy notify-request`.

### Messages

Accepting a practice request opens a private conversation between the two people: the request's proposal and note, and the reply, are
its first messages. From then on either of you can write, from **Community → Inbox**, from the accepted request, or from the other
person's profile (**Message *name***). There is no way to message someone you haven't agreed to case with, and no group chats.

- **Two people, private.** One conversation per pair, readable only by them. The tables have no direct access for the API roles at all; reads and writes go through database functions that act only on your own conversations. No email address is stored or shown.
- **Not live, and no email.** Messages arrive by polling: an open conversation looks for new ones every 5 seconds, and the count on the Community tab refreshes when you come back to the tab and once a minute. Messages are not emailed or pushed (only requests and acceptances are; see Email notifications).
- **Count.** The Community tab and its Inbox view show one number: requests that need you plus *conversations* with new messages (not messages), not including muted or archived ones. The Dashboard's "Needs you" strip shows the two parts separately. Opening a conversation reads it.
- **Controls.** **Mute** (no count), **Archive** (a new message brings it back), **Delete** your own messages (gone for both of you), **Block**, **Report**. Mute and archive affect only your own view.
- **Blocking** stops messages and practice requests between you in both directions. The other person is never told: they just get "You can't message this member right now". Undo it under **Community → Inbox → Blocked members**.
- **Reporting.** A report keeps your reason and a snapshot of the last 30 messages, even if messages are deleted afterwards, and can optionally block as well. Reports go to a table only the database owner can read (Supabase dashboard → Table editor → `message_reports`); there is no in-app admin, so whoever runs CaseLab needs to check it.
- **Limits.** A message is 1 to 1000 characters; at most 30 messages in 10 minutes and 500 in 24 hours; at most 5 reports in 24 hours.
- **Honest about privacy.** Messages are **not end-to-end encrypted**: whoever administers the Supabase project could read them. They are deleted with the accounts involved. Messages are not available in demo mode.

### Warm-up: a mental-math sprint

An optional extra, in the menu as **Warm-up** (`#/warmup`, signed-in members only). Quant is the skill most people rate lowest,
so this turns the "short daily mental-math drills" habit into a game: case-style sums against the clock, as many as you can.

- **Pick a length: 30 seconds, 1 minute or 2 minutes** (one minute to start; the app remembers your last choice in this browser). After a round, **Change length** takes you back to the start screen.
- **Fifteen kinds of question**, from the basics to the ones that come up in case maths:
  percentages of a number, growth over a few years, break-even units, market sizing (like 40M × 12% × $85), profit margin, percentage change,
  discounts (forwards and backwards), market share, payback (in years, or months for a customer), price and volume together, doubling
  time and the growth needed to double (the rule of 72), conversion funnels, capacity (seats, flights and fares; rooms and occupancy),
  weighted average price, and cost savings. Each has a couple of wordings and starts easy, getting harder as you get more right. The same kind never comes up
  twice in a row, and a question is not repeated until twelve others have gone by.
- **Estimating counts.** An answer within 5% of the exact one is right. Type `36`, `4.8k`, `408M`, `25%`, `8 years` or `18 months`; a bare number means the unit the question asks for.
- **Score**: 10 points, plus 5 per difficulty level, plus 2 for each answer in your current streak (up to 10). A miss or a skip breaks the streak. The clock never stops, so a 30-second round really is 30 seconds: at the end you get a review of every miss and skip, with what you said, the answer and the quick way to do it. The line at the end judges your pace, so ten right in two minutes is not graded like ten right in thirty seconds.
- **A best for each length.** A 2-minute round naturally scores more than a 30-second one, so the three are never compared: each length has its own best score and its own longest streak, shown on the start screen and in the result.
- **Your bests are saved with your account**, so they follow you to any device. They are private: only you can read them, they are not part of your profile, and there is no leaderboard. The table is `warmup_best` (one row per member **and round length**, deleted with the account); it can only be changed through `record_warmup_best(score, streak, seconds)`, which only ever *raises* a record, so a bad round or a stale tab can't overwrite a better one. The length defaults to 60, so a browser still running an older version of the app keeps working.
- **This browser keeps a copy** (`localStorage`) so the page works offline: the 60-second record is stored exactly as it was before there were lengths, and the others sit beside it. When you open Warm-up the two are merged (the better of each, length by length) and anything the account is missing is sent up. A record saved in this browser before records moved to accounts is claimed once, by the first member who opens Warm-up here. In demo mode nothing touches your account.
- The game rules (question generation from a seedable random source, answer checking, scoring) are pure code in `src/domain/warmup.ts`; the screen is `src/features/warmup/`.

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
               JSON backup/merge, CSV, MCG Excel import and export, weekly goal, demo data, in-memory repository
  state/       React context: auth, data (the only writer), toasts, theme, routing
  features/    The screens: dashboard, caselog, improvement, warmup, people (directory, profiles, find a case),
               plus auth (sign in / sign up / reset), community (onboarding, profile & privacy), logcase, settings,
               import, help (keyboard shortcuts) and tour (the first-login walkthrough)
  components/  Shared UI primitives, layout, chart colors
  test/        Test setup, builders, fixtures, fake Supabase / fake backend
public/
  hero/        The looping illustration on the front page (loop.mp4, about 1 MB, no sound) and its still picture (poster.jpg)
supabase/
  migrations/  The database schema, versioned with the code
  config.toml  Supabase CLI configuration
```

Your own data goes through the small `CaseLabRepository` interface in `src/data/repository.ts` (`SupabaseRepository` for real
data, `createMemoryRepository` for demo mode and tests), the community through `CommunityRepository`
(`src/data/community.ts`), and sign-in through `AuthApi` (`src/data/auth.ts`). The domain logic (including case matching in
`src/domain/pairing.ts`) and the screens don't know Supabase exists.

The front page shows a short looping illustration of students casing (`src/components/ui/HeroVideo.tsx`). It is decorative:
silent, no controls and hidden from screen readers. People who prefer reduced motion or are saving data, and anyone whose browser
can't load it, see the still picture instead, and it pauses while scrolled out of view. To change it, replace the two files in
`public/hero/`: keep the video small (a 9-second, 960-pixel-wide H.264 loop with the audio removed is about 1 MB) and make its
last frame flow into its first so the loop doesn't jump.

There is no group administration, group chat or social feed: members, profiles, sharing, practice requests, and private conversations between two members who agreed to case are all there is.

**Tech**: React 19, TypeScript, Vite, Tailwind CSS v4, Supabase (`@supabase/supabase-js`), Recharts (lazy-loaded),
`read-excel-file` (loaded only when you import an Excel file), `fflate` (loaded only when you export one: it opens and re-packs the template), Vitest + Testing Library, PGlite for the database tests.

---

## Tests

`npm test` runs the whole fast suite (about 170 tests) covering:

- **Database**: the real migrations run in Postgres (PGlite): required vs optional columns, rating and case-type rules, and row level security for personal data (own rows only, no cross-user read/update/delete/insert, no anonymous access, signed-out writes refused, cascade on user delete)
- **Public visitors**: the `anon` role tried as a scraper would: nothing public by default, opt-in only, free text only for members who opened everything (cut to 2000 characters), link-only members unlistable and unsearchable but reachable by exact id, private cases hidden, no access to any member or personal table (so no filters, counts or planner estimates over hidden data), no writes or function calls, length and skill-name limits, and former members removed by `revoke_nonmembers()`
- **Privacy**: three verified members and one unverified, tried as an attacker would with direct queries: nothing shared by default; each switch reveals only its own field; scores need case history; per-case overrides (private, name only, full); changes apply immediately and leave no stale data; unlisted members vanish; `other_notes` never appears and the partner only with its own switch; another member can't read, edit or delete your cases or profile, write the shared table, or call the internal functions; filters, sorting and counts can't reveal hidden values; unverified and anonymous users get nothing; least-privilege table grants
- **Community logic**: loose case-title matching, pairing (what to offer, what to avoid, thin areas) and the filters
- **Accounts**: sign-up, verification, resend, expired links, password reset, onboarding with everything off by default
- **Supabase layer**: row mapping that round-trips every field, a repository run against a fake Supabase (paging past 1000 rows, chunked upserts, replace-without-data-loss, errors surfaced), friendly error messages, configuration checks
- **Calculations**: week boundaries, averages that ignore missing ratings, behavioral combining, trend windows, coverage, matrix, weekly history
- **Email notifications**: the setting and the once-only markers in Postgres (private, on by default, own row only, no deletes or anonymous access, cascade on account delete, not part of any profile), the email logic with no live service (who is emailed and who isn't, callers who aren't a party, stale or replayed calls, simultaneous calls, a failed send that can be retried, the details, subjects, plain-text twin and escaping of everything a member typed), the app side (the background call, the setting) and the Profile & privacy switch
- **Messages**: in Postgres (a conversation only opens when a request is accepted, seeded with the proposal, note and reply; one per pair; no direct table access; nobody else can read, write, mark, mute, archive or report; trimming and length limits; unread counts; mute and archive per person and a new message bringing one back; deleting only your own; silent blocks in both directions that also stop requests; the 30-in-10-minutes and 500-a-day limits; reports with a snapshot that survives deletions and can't be read by members or visitors; cascade on user delete; no email columns), the Supabase wrapper, the in-memory twin, and the screens (list, count, opening and reading, Enter and Shift+Enter, errors that keep what you typed, new messages on returning to the tab, delete, mute, archive, block, report, entry points, demo mode)
- **Finding it**: five tabs in both navigation bars with people and messages together under Community (Members and Inbox views, the older `#/requests` and `#/messages` addresses still working), one count on the tab, and the Dashboard's "Needs you" strip (not shown in demo mode)
- **Connected members**: a new request between two members with a conversation is refused by the database (both directions, after the generic refusal, leaving waiting requests alone), and in the app "Case again with …?" sends the case details as a message instead (from the profile and from Find a case; errors keep what you typed; a normal request to someone you aren't connected to is unchanged)
- **Practice requests**: in Postgres (open to every listed, verified member and no one else, private to the two people, no direct table access, one waiting per pair, the 5-waiting and 20-a-day limits, silent blocks that can be undone, length limits, nothing readable by visitors, cascade on user delete), the Supabase wrapper, and the screens (nothing to switch on, asking, prefilled from Find a case, answering with a reply, declining and blocking, the badge, cancelling, errors, demo mode)
- **Delete account**: in Postgres (a member with data in every table is removed completely: login, profile and public copies, cases, lists, goal, Warm-up record, requests, blocks, conversations, messages; everyone else untouched; the other person loses the conversation; a report stays but no longer points at the person; the confirmation word is required, a member can only delete themselves, visitors and signed-out callers can't, and a second call is harmless), the Supabase wrapper (asks the database, then ends only this browser's session; a failure changes nothing), and the screen (the Danger zone, what is listed before you confirm, typing `DELETE`, signing out to the public page, forgetting the member on this device but keeping the theme, a failed deletion keeping everything and allowing a retry, off in demo mode)
- **Warm-up**: question generation for all fifteen kinds (seeded, so repeatable; each answer is recomputed from its own wording, the rule-of-72 answers are accepted, and no question repeats too soon), answer reading and the 5% tolerance (including `%`, years and months), scoring, the three round lengths and a best for each (including how an older single record is read); the record in Postgres (own row only, no direct writes, raise-only, no visitor access, cascade on user delete); syncing between the account and this device (offline, first sign-in on a shared browser, demo mode); and the screen (timer, streaks, tips after a miss, end of round)
- **Rules**: milestones, suggestions (including "stays silent with too little data"), improvement areas, knowledge filtering, case-log search / filter / sort
- **Bucket**: what is sent (writing only, newest first, never titles, partners or other notes, cut to length, bounded in total), the prompt, what is accepted back (right shape, at most three of each, an unknown skill dropped, anything else refused), the whole request (stored answer returned without asking, a few-minutes limit on changed feedback, a refusal or cut-off or bad answer or network error leaving the stored read alone), the stored table's database rules (own row only, no writes by members, one row each, goes with the account), and the card (what it says it sends, nothing until you click, the scope choice, a stored read shown on return with a note when cases changed, each way a read can fail, hidden in demo mode)
- **Casebook library**: the search (every word must match, exact then starting matches then co-chair picks then newer books, capped), what picking a case fills in, the screen (suggestions on the title as you type it, nothing until you type, keyboard picking, no surprise pick or submit on Enter, Escape closing only the list, nothing for one letter or no match or a failed lookup, not suggesting a title you just picked, removing the link, a plain box when editing or in demo mode), the link kept on a case, the library database rules (verified members only, the analysis table unreadable by every role, our analysis released only to a member who logged the case and never because someone else did, not writable, the link cleared when a case is removed) the matching (`libraryMatching.db.test.ts`, `libraryMatch.test.ts`, `MatchCases.test.tsx`: the name key agreeing across the database, the loader and the app; the source rules; the backfill linking only sure matches and changing nothing else; the review listing only your own cases and never our analysis; the banner, the sure and maybe defaults, updating or only linking, cancelling) and the loader (apostrophes, running again, all or nothing, one entry per name with Booth first then the newest book whatever the file order, listed-only cases, a half-written analysis refused, an earlier copy folded in with the link moved across)
- **Levels and XP**: what one case earns (every rating, note and lesson, with a bare log earning the base), the daily limit on full XP, the bonuses for new case types and industries and for solid weeks, skill improvement measured on your best five ratings (and never taken back by a bad run), the level curve and the job titles (with the climb calibrated: Partner in about a hundred ordinary cases, sooner for full write-ups, later for bare logs, and never in the first fifty), how much saving a case earned; sharing your level (the switch, on by default for new profiles and by the backfill, the level kept in step with your cases, cleared when switched off, never from demo data, shown to members only, and the database rules in `levelShare.db.test.ts`); the weekly quests (always the same three for a week, each kind finished the way it says, a new case type never offered once all are done), the skill medals (five ratings needed, bronze, silver and gold on the edge, a bad run never taking one back) and the sticker book (each sticker, runs of weeks, ranks, what a saved case won); and the screens (the pill, the window and its tabs, how XP is explained, the switch and its memory, a level celebrated once, the first look only noting where you are, dropping a level, demo mode, interviewed cases earning nothing)
- **Weekly goal**: the Monday-to-Sunday count, passing the goal, the streak (an unfinished week neither counts nor breaks it), the table in Postgres (own row only, 1 to 14, nothing for visitors, cascade), and the screens (set, change, remove, a failed save keeping the old goal, demo mode never writing, the saved panel's cheer)
- **Interviewed cases**: the rules (tidying, limits, newest first, search), the table in Postgres (own rows only, the case-type list and length limits, never mixed into `cases`, nothing for visitors, cascade), the screens (log, edit, search, delete after confirming, a failed save keeping the form, demo mode never writing, solved totals untouched), and sharing (off by default; members only; only while listed and switched on; never who you interviewed, your feedback or what you learned; hidden again when switched off; never fetched for visitors; the count, list and chip on the profile and member list; the switch in Profile & privacy)
- **First run**: the import wish after sign-up (kept, used once, expires, ignored when the account has cases), the tour (once, skippable, Escape, steps aside for windows, its ring following a button that moves), the shortcuts, the install button and the Warm-up nudge
- **Excel export**: fills the real MCG template (all four tabs, charts, logo, dropdowns, merged headers, widths and panes kept byte for byte where untouched), the exact column layout, a real date, every skill's rating and feedback, the extra columns, rows tall enough for long text, oldest first, Dashboard name and numbers (and formulas stretched past 997 cases), Opportunity Areas, awkward text (accents, ampersands, line breaks, leading spaces, forbidden characters, the 32,767-character cell limit), well-formed XML, the template left unchanged, and a lossless round trip through the importer; opened and checked with an independent parser too
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

The two-account run covers the privacy of everything that is shared or kept private: cases and profiles, and also the weekly goal (saved,
limited to 1 to 14, invisible to other members and visitors), the cases you interviewed (the same shape rules as cases, private to their owner,
never mixed into the cases you solved) and showing them to members (off by default, only while listed and switched on, only the five case columns
and never who you interviewed or your notes, hidden the moment it is switched off, and nothing for visitors).

The same two accounts also check that **the database that is actually live is the one the code expects** (`e2e/deployed.e2e.test.ts`). It reads
the migration files and confirms every table and every added column exists live, and that each function the app calls exists with the arguments the
app sends, so deploying the app before applying its migration is caught at once. It also confirms the tables behind requests, conversations,
messages and reports refuse direct reads and writes (for a member and a visitor), the Warm-up record only goes up and is private, the email choice is
private to its owner, and account deletion refuses anything but the exact word. It sends no messages or requests and never deletes an account.

Use throwaway accounts for A and B: the tests create their profiles and flip their sharing switches, then leave them **unlisted** with
nothing shared, so they never appear in the Community list or search for real members. They are listed only while the suite runs (the
directory checks need that), which is a few minutes. (A member can delete their whole account from Settings; the live checks don't use that,
so the throwaway accounts stay.)

To create a throwaway account without sending any email: Supabase dashboard → Authentication → Users → Add user → Create new user, with an
address like `e2e-a@example.com`, any password, and **Auto Confirm User** ticked. Do the same for B, then put the four values in
`.env.e2e.local`. If you ever sign in to the real app with one of these accounts, untick **Let other members find me by name** when it asks you
to set up a profile (or turn off listing later in Profile & privacy). To check nobody test-like is visible, open **Community → Members** and look
for names starting "E2E".

## Limitations

- Weeks start on Monday, for the weekly goal and its streak as well. A week that is still going never breaks a streak, and burned cases never count toward it.
- The tour is remembered in the browser it was finished in, so a new browser or device shows it again for an empty account. Installing CaseLab as an app does not add offline use: there is no service worker, so nothing is cached and a new version is never stale.
- The MCG template has no industry column. The import suggests one from the case title where the words are clear (an airline, a hospital) and you confirm or change it on the review screen; anything left unset shows "–" until you edit the case.
- Edits made on two devices at the same moment aren't merged: the last save wins (fine for one person).
- Case matching is by title only, so very different spellings of the same case can be missed, and different cases that share
  most of their words can be flagged as "might overlap". It never decides for you.
- Member names aren't verified: anyone with a verified email can choose any display name, and no email is shown to check it. Restricting sign-up to Booth addresses (see Set it up, step 2) is the fix if impersonation becomes a concern.
- Anything a member makes public can be read, copied and scraped by anyone, and can't be recalled once copied. That is why it is opt-in, off by default, confirmed, and excludes written text. Visitors can page through the public members and their cases; there is no rate limit beyond Supabase's own.
- Per-case settings other than "private" (name only, full) also apply to visitors once a profile is public; "private" is the only per-case way to hide a case from everyone.
- The People directory shows listed members alphabetically (first 50 per search); there is no pagination or profile photo.
- CAPTCHA is recommended for public sign-up but isn't wired in yet (see Set it up, step 2).
