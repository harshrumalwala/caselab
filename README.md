# CaseLab

A case interview practice tracker for Booth students, built on the MCG case log. Every member keeps a private case history and
dashboard, and can choose to share some of it with other members, or with anyone, to help each other find the right case to practice.

**Design goal: logging a finished case takes under two minutes.** Only a title, case type and industry are required.
Everything else (ratings, notes, sharing) is optional and one tap away.

- **Live case with Bucket**: the headline feature, with a tab of its own (and the banner at the top of the Dashboard). Practise a whole casebook case in writing against one clock, as long as the case has in it (23 to 40 minutes), with Bucket (an AI interviewer) giving the prompt, answering clarifying questions, showing the exhibits and keeping the case moving; feedback at the end, and the case is logged for you
- **Dashboard**: totals, skill averages, trends, case-type and industry coverage, next-practice suggestions, weekly history, milestones
- **My Case Log**: searchable, filterable list of your cases with full-detail view, edit and delete. It has a second view, **Improvement Areas** (thin spots in your coverage, skills to sharpen, and a searchable history of what you've learned), so the top bar needs one tab for both
- **A public front page**: leads with Bucket (the headline, a "Meet Bucket" section with a picture of a case in progress, and a Live case link in the top bar). There is nobody to browse out there: no member list and no search. The only profile anyone can open without an account is one whose owner gave them their personal link
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

**A profile link needs no account.** The front page itself shows nothing about anybody: there is no member list and no search for
people who aren't signed in. A member who switches their link on can hand it out, and anyone holding it opens that one profile and
sees what that member shares (see below). Finding people, and being found by them, happens inside Community, which needs an account.
**Creating an account** takes four steps: email and password, verify the emailed link, choose a name (and optionally your MBA
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
members** (the default once you appear in People) and, only if you switch it on, **people you give your profile link to**, who
need no account.

| Setting | Shares |
| --- | --- |
| **Appear in People search** | Your name and MBA class. Turn it off to disappear completely |
| **Case history** | Case name, source (casebook), industry, case type and date |
| **Overall scores** | The overall 1-5 rating of each shared case |
| **Skill scores** | The framework, quant, exhibits, brainstorm and other skill ratings |
| **What I'm sharpening** | On your profile link only: whether CaseLab sums up the skill scores above, naming up to three skills you're sharpening and up to three you're strong in. The summary itself carries no figures; the scores beside each case stay with **Skill scores** (see below) |
| **Written feedback** | Feedback you received (overall and per skill) |
| **Improvement focus** | The "main thing to improve" tag on each shared case |
| **Learning notes** | What went well, what you struggled with, concepts learned, next focus |
| **Who cased me** | The name you entered as your practice partner or interviewer, shown on each shared case (see below) |
| **Interviewed cases** | The cases you ran as the interviewer (title, book, type, industry, date) and how many, to other members only (see below) |
| **Open everything** | Every detail of each case you share: scores, improvement focus, written feedback, learning notes and your Other notes (see below) |

Scores, feedback and notes only apply to cases that are shared, so they switch on after **Case history**.

**People with my link can see my profile** is a separate, extra switch under "Who can see me", **off by default**. Turning it on
asks you to confirm, because anyone you hand the address to — and anyone they pass it on to — can then see your name, class and the
case history, scores and improvement focus you've chosen to share, with no account. Nobody can find you any other way: there is no
public list, search or count, and that is enforced in the database, not just left off the page (see "How privacy is enforced").
The same switches decide what is shown: **written feedback, learning notes and other notes are not shown unless you turn on Open
everything** (below). A case set to "keep this case private" is hidden from everyone; a case set to "share the case name only" or
"share this case in full" is shown through your link too (a "full" case shows its scores and improvement focus, and its text only if
you opened everything). Profile & privacy previews each audience separately and shows the address with a **Copy link** button while
the switch is on. Turning it off, or no longer appearing in People, closes the link at once. Each switch saves the
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
preview). If your profile link is on you can also switch on **Show burned books and cases to visitors**: it is off by default, and
while it is off the public copy is empty, so there is nothing to read. Visitors can't use "find a case for them", so for them it is display
only. They never count in your totals either way.

**Per case.** When you log or edit a case, an optional **Sharing for this case** section lets you override your defaults:
use your profile settings (the default), keep this case private, share only its name, or share it in full (its scores,
feedback and notes, even if your profile shares none of those). Nobody has to touch it when logging.

**Who cased me** is its own switch, **off by default**, because it names a third person who hasn't agreed to be listed. When on, the
partner name appears on every one of your cases that is shared at all, to members and (if your profile link is on) to anyone holding it; a case set to
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
your profile link is on, to anyone holding it. They see the usual card first; a case that has detail gets a **See more
details** button that opens it. Turning it on while your link is on asks you to confirm, because it changes what people without an
account read. "Name only" and private cases stay as they were, "Who cased me" stays its own switch, and long text is cut to 2000
characters in the public copy.

**Your profile link.** The address is `…/#/people/<your member ID>`; the ID is a random 128-bit value nobody can guess. While the
switch is on, anyone who has the address opens your profile without signing in and sees exactly what the preview shows, plus a short
**What to give them next** summary worked out in their browser from those same shared cases, and — if you switched that on too — **What
*you* are sharpening** (both below). The ID is
permanent and a link can be passed on, so the only way to cut it off is to switch the link off again. This is enforced in the
database: no API role can read the public tables at all, with any filter, order, count or range, and the only way in is two functions
that answer on one exact ID.

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

### What to give someone next (opening a profile by its link)

"Find a case for them" is built from **your own** log, so it is no use to someone without an account. A profile opened by its link
therefore leads with **What to give *name* next**, a short section above the case list, worked out in the browser from the rows the
link already hands out. Nothing new is released: no extra column, function, grant or switch, and no request that opening the profile
didn't already make.

- **Coverage.** The case types and industries they have **never shared**, and those they have **shared once**, the ones interviews
  use most first, at most three names each and then "+ n more". The catch-all "Other" is never named as something to practise.
- **Silence when the rows can't support it.** A member who shares no case history gets no section at all. Below five shared cases
  (`MIN_CASES_FOR_TRENDS`, the same minimum the Dashboard's suggestions use) it shows only what is in those cases and suggests nothing.
- **Unpracticed is neutral.** A case type nobody has shared is new ground, not a weakness — the same stance as the Dashboard's grey
  unpracticed industries. The chips carry that in their own words ("Nothing shared yet"), and since 2026-11-17 no sentence underneath
  explains it: the owner's instruction was that a card which tells the reader how to read itself reads as machine-written. Burned cases
  and interviewed cases are not part of a case log, so they can't reach any of these counts.
- **The reader is not told how to read it** (2026-11-17, issue #177's PR, at the owner's request after opening their own link). The
  section is the two lanes of chips and one line of provenance. The member's own **Improvement focus** tag ("*name*'s own focus:
  Framework, tagged on 4 of the 15 cases they share") was removed, because it did not help anyone decide what case to give; so was the
  caveat under the lists. `whatToGiveNext` still returns `focus`; nothing reads it (see KNOWN_ISSUES).

Signed-in members are unchanged: **Find a case for them** stays their first tab, because overlap with a real log is the better
answer, and they don't see this section. The rules are plain functions in `src/domain/giveNext.ts` with unit tests, and like every
other number in CaseLab they are worked out deterministically: no AI is involved.

### What I'm sharpening (a switch of its own, off by default)

A profile link can also carry a short **What *name* is sharpening** card: up to three skills they are sharpening, up to three they are
strong in, and nothing else. It is the product's own reading of their skill scores — the same rule the Improvement Areas screen applies
to a member's own log (`skillsToImprove`) for the first list, and the Dashboard's strong band (an average of 4 or better over the last
up-to-five ratings) for the second — worked out in the browser from the `skill_scores` the link already hands out.

- **Its own switch, off by default.** **Profile & privacy → What I'm sharpening**. Sharing a score beside each case and having a
  sentence about what you are weaker at on a page anyone with your link can open are two different things, so they are asked
  separately, and nobody is summarised until they ask. Existing members all start off. The switch is a flag on the profile
  (`profiles.share_sharpening`, carried to the link-visible copy and returned by `public_person(id)`); no summary is stored anywhere.
- **Names only.** The skills are named and nothing else: no average, no position, no ranking of all eight, and no superlative. A skill
  is on one list, the other, or neither. The switch decides whether CaseLab writes that summary, not whether figures are on the page:
  the per-case scores and the **Shared performance** averages under the card belong to **Skill scores**, which the member switched on
  separately. Since 2026-11-17 the switch's own line says what it writes ("Whether CaseLab sums up the skill scores you already
  share ...") instead of promising "no numbers, no ranking", which was true of the card and false of the page below it.
- **The line at the top says what the page carries.** The "Shares ..." sentence under a member's name reads the summary the same way
  the card does (`sharingShown` in `src/domain/sharpening.ts`), so it offers "what they're sharpening" only where the summary is
  really there: not below the minimum, not without shared skill scores, and not on the page another member sees, which never carries
  the card. Every other switch speaks for itself the moment it is on and is untouched.
- **Silent below the minimum.** A skill needs scores on at least three shared cases before it is named at all, and a member needs three
  rated shared cases before there is a card (`MIN_CASES_FOR_SKILL_INSIGHTS`, the same minimum the Improvement Areas screen uses). Below
  it there is no card and no explanation: "not enough data yet" would itself be a sentence about the person. A member who does not share
  **Skill scores** has nothing here either.
- **See it before you show it.** The **What others see → Visitors without an account** preview renders the same card from the same rows
  the link hands out, whether the switch is on or off, with a line saying which. Deciding whether to be summarised means reading the
  summary first.
- **The usual exclusions.** Burned and interviewed cases are not part of a case log, so they reach none of it; the two behavioral fields
  are read as one skill, as everywhere else; nothing is read out of written feedback; and no model is involved. The rules are plain
  functions in `src/domain/sharpening.ts` with unit tests.

### How I like to meet (your own, not a sharing switch)

**Profile & privacy → How I like to meet** holds two optional details: one **meeting link or phone number** (a Zoom personal room,
Google Meet, Teams, a school or firm tool, or a phone number) and one **time zone**. They are groundwork for scheduling a case
inside CaseLab (issue #98); nothing in the app reads them yet, and when scheduling arrives the link goes to the one person a case
is scheduled with.

- **Readable by exactly one person: you.** This is not a sharing switch. The link is in no profile, in no projection another member
  or a link holder reads, in no message or email, and in nobody else's backup. `meeting_prefs` has **no API access at all** for
  `anon` or `authenticated`: `my_meeting_prefs()` and `save_my_meeting_prefs(link, zone)` are `SECURITY DEFINER` functions that act
  on the caller's own row and take no user id. It goes with the account when you delete it.
- **What a link may be.** An address starting with `https://`, or a phone number (digits, spaces and dashes, with an optional `+`),
  up to 300 characters. `javascript:`, `data:`, `http:`, a relative path and plain text are refused with a sentence saying what to do
  instead. Any `https` address is fine — school and firm tools vary — and the common rooms are named back to you (Zoom, Google Meet,
  Microsoft Teams, Phone) so you can see the right one was pasted. The rule is `parseMeetingLink` in `src/domain/meeting.ts` and the
  database enforces the same rule again in `is_meeting_link()`.
- **The time zone** is a real IANA name (`America/Chicago`), offered from your browser's own list the first time and chosen from a
  list after that. The database checks it against the zones Postgres itself knows.
- **Saving is honest**, like everywhere else: nothing shows as saved until the database confirms it, a failure keeps what you typed,
  and the fields show what was stored rather than what was sent. At most 20 changes a day.
- **Your own backup carries them** and a restore puts them back; see "Download, import and demo mode". In demo mode the section is
  not shown, because there is nothing to save it to.

### How privacy is enforced

Privacy is enforced in the database, not in the screens:

- Other members can **never read your `cases` table**. It stays readable only by you (row level security), so a direct API
  request for someone else's case returns nothing, whatever their settings are.
- They read a separate **`shared_cases`** table. It contains only the fields you chose to share, and database triggers keep it
  up to date in the same transaction as any change to a case or a switch. Private values aren't hidden there: they aren't in it
  at all, so no query, filter, sort or count can leak them. Turning a switch off removes the data immediately.
- It's read-only for members, internal functions can't be called through the API, and signed-in users get only the privileges
  they need.
- **People without an account** (the database's `anon` role) have **no privilege at all** on `cases`, `profiles`,
  `shared_cases` — or on `public_profiles` and `public_shared_cases`. Those two tables still exist and are still filled by the
  same triggers for members who switched their link on (with free text only if the member opened everything, and never the private
  case id), but no API role may read them: every direct request is refused, whatever the filter, order, count or range, so there is
  no list to page through and nothing to enumerate. The only way out is `public_person(id)` and `public_person_cases(id)`,
  `SECURITY DEFINER` functions granted to `anon` that answer on one exact member ID — the value in that member's own profile link —
  and return nothing for anyone who has not switched their link on. Changes apply at once, as before.
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
| `meeting_prefs` | How you like to meet: a meeting link or phone number and a time zone, with the count behind the 20-a-day save limit. No direct table access at all: only `my_meeting_prefs()` and `save_my_meeting_prefs()`, which act on your own row | Only you |
| `warmup_best` | Your best Warm-up score and streak for each round length (one row per member and length: 30, 60 or 120 seconds). Read-only for you; changed only by `record_warmup_best()`, which can only raise it | Only you |
| `interviewed_cases` | Cases you ran as the interviewer: date, title, book, type, industry, who you interviewed, what you told them and what you learned. Same case-type list as `cases`, with length limits. Never joined to `cases`, so it can't reach a total, rating, trend or the weekly goal | Only you |
| `weekly_goal` | Your weekly goal in cases (one row per member, 1 to 14; no row means no goal). Progress and streak are worked out from your cases, so nothing else is stored | Only you |
| `shared_cases` | The owner-approved projection of cases (see above). Written only by triggers | Verified members |
| `public_profiles`, `public_shared_cases` | Copies for members who switched their profile link on (free text only if they opened everything). Written only by triggers | No API role at all: only `public_person(id)` / `public_person_cases(id)`, by exact member ID |

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
| Extra copy of everything | Settings → Download backup (JSON) | Every case, rating, feedback note, learning and list item, each case's sharing setting, and your own meeting link and time zone (never another member's: nobody else's is readable) |
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
- **What is in it.** About 870 distinct cases from 58 casebooks. The Booth MCG casebook, the co-chairs' recommended cases and the newest books (Kellogg 2023-24, Darden 2020 and 2022-24, Fuqua 2019 and 2025-26, Ross 2019, 2022 and 2024, Stern 2021 and 2023-24, Wharton 2017) are analysed in full, with the confidence noted (charts that don't extract as text were re-read from the page images, and a few with unreadable exhibits are marked **partial**); roughly 250 distinct cases carry an analysis and skill tags. Every other case from the remaining casebooks (Kellogg, Ross, Darden, Fuqua, Stern, Wharton, Haas, HBS, Yale, Columbia, MIT and Tuck) is listed by name, so the search covers them. Two books carry no year, so they are filed under the placeholder year 2000, and books that came in twice under different years are loaded once. IESE 2021 was not supplied. Analysed cases of the same name in several books are one entry (see above), so the counts of cases and analyses are lower than the sum of the books.
- **Cases you already logged.** Matching is by name (the same title ignoring case, punctuation, "&" and "Co.") and the book you wrote as the source. When the library is loaded, the seed runs a **link-only backfill** (`link_cases_to_library()`): a case that has the same name and whose source names the book (or another book the case is in: "Booth casebook", "MCG" and "Kellogg 2020" all count) gets `library_id` set, and **nothing else about the case changes**, not its title, book, case type or industry. A case with the same name but no book, or a different one, is only a maybe and is never linked automatically, because generic names are reused across books. No API role can run the backfill.
- **Review your own matches.** When some of your cases look like casebook cases, the **My Case Log** page shows a banner ("3 of your cases look like casebook cases", **Review**). The review lists them with what would change (title, book, case type, industry) and lets you choose, per case, which to match: sure matches start ticked, maybes start unticked and say why. Choose **Update my cases to match the book** or **Just link them** (keep your own wording; they only count as done). Nothing changes until you press the button, and only for the cases left ticked. It reads only your own cases, through `match_my_cases()`, and only what any member may know about a library case.
- **Cases to try next.** Under each thing Bucket says to work on that belongs to a skill, the **Improvement** page lists up to three casebook cases that exercise that skill and that you haven't done (co-chair picks first, then newer books). It comes from `library_next_cases(skill)`, which reads the private skill tags inside the database and returns only the public columns (name, book, type, industry), so a member learns "this is good for your quant" and nothing about the case. A case counts as done when one of your cases is linked to it or has the same name. Only the analysed cases carry skill tags, so it starts with those and grows as more books are analysed. It is silent when there is nothing to suggest or the lookup fails. The migration `*_library_next_cases.sql` must be applied before the app that asks for it is deployed.
- **This week's plan.** On **Improvement Areas**, under Bucket, a short plan of casebook cases: first a case for the skill Bucket says to work on (preferring one that also fills a gap), then cases that fill the biggest gaps in the case types and industries you have practised (none before once, never filling the same gap twice). It is sized by your weekly goal (between two and five cases, three with no goal), each case says why it is there ("Practises Quant / Math", "Your first Market Entry case") and has a **Log it** button that opens the log with the title, book, type and industry filled in. The ranking is plain code (`src/domain/weeklyPlan.ts`); no model is asked anything, and only the case's name, book, type and industry are shown. Gap cases come from `library_gap_cases(types, industries)` (verified members only, public columns only, cases you haven't done, analysed ones first); skill cases come from `library_next_cases`. It is silent when there is nothing real to suggest, the casebook can't be reached, or in demo mode. The migration `*_library_gap_cases.sql` must be applied before the app that asks for it is deployed.
- **Full solution (the book's own, in our words).** For the cases people practise first (the Booth MCG casebook and the co-chairs' picks), a case you logged has a **Full solution** section, closed until you open it. The book's own solution is plain text, reworded with the same meaning and the same order and numbers, and nothing of ours added: the question, what the interviewer gives you, up to five clarifying questions, the hypothesis, the framework's first-level buckets with their second-level points, the book's own exhibits rebuilt as tables laid out as printed, with the exhibit drawn the way the book draws it wherever the book draws a chart (bar, stacked bar, 100% stack, line, bar-and-line combination, pie or scatter, with dashed reference lines such as an "80%" line, bars picked out in a colour as the book does, a key (swatch and name) for clustered bars and for stacks whose segments do not carry their own names, the colours the book gives a series (red, blue, yellow, green, black, grey, orange, purple, navy and teal; an unknown name or no colour keeps the grey shades), the labels the book prints on the bars, the totals above the stacks, the segment names inside them, rows of text under the axis, notes beside the chart such as a CAGR column, wrapped category names, and several charts side by side). The chart is our own drawing from the figures the book plots (read off the picture, and marked approximate, where the book prints none), never the book's image, and the exact table stays beside it. **Every figure the chart prints stays on the chart.** A value that lands on the axis maximum — a 100% bar on a percentage chart, a bar, a line's point or a scatter point at the top of the axis, the longest sideways bar and the last number on its axis — has its label kept inside the drawing: above the mark when the whole of it fits there, and otherwise inside the bar in ink that reads on the fill, or just under the mark when the bar is too short to hold it. On a screen narrower than the drawing the chart keeps its readable size and can be swiped sideways, and it says so (“Swipe across to see the rest of this chart.”) until the member reaches the right-hand end, so a category past the edge is never missed in silence; the drawing itself scales down to fit any card at least 420px wide. Drawings we can't draw yet (marimekko charts, bell curves, flow diagrams, maps) stay as exact tables, the steps with the working, the recommendation, risks and next steps. It is written in our own words and uses our own tables: **never the book's text, pages or images**. Slips in the book are not shown. **Anything we add is purple and labelled as Bucket's tip**, so it is never mistaken for the book: how to read an exhibit fast, what to notice at a step, a model delivery, a **check yourself** list per step (tick what you did; what you leave unticked is listed as where your attempt differed), and a separate **Bucket's top 3 takeaways** section (from the prompt, the exhibits and the brainstorm). Those tips are written only where they add something specific to the case. It is stored in `library_case_solutions`, which no API role can read; `library_solution_for()` releases it only to a verified member who logged that case, the same rule as our analysis. It is loaded by the seed from `private-data/solutions/*.json` (git-ignored, like the analyses): each write-up is attached to the entry that won for that case name, and the loader refuses one with no question, recommendation or steps. The section is not there for a case with no link or no write-up yet, when the lookup fails, or in demo mode. The migration `*_library_case_solutions.sql` must be applied before the app that asks for it is deployed.
- **From the book (in your own cases).** Open a case you logged that is linked to a casebook case we have analysed and the case view has a **From the book** section: what the case asks, what a strong answer covers, the ideas it tests, the common mistakes, a difficulty and the skills it tests, so you don't need to go back to the casebook. It is our own write-up in our own words (never the book's text), read with `library_notes_for()`, which releases it only to a member who logged that case, and shown only to you. Nothing is shown for a case with no link, one we haven't analysed, a failed lookup, or in demo mode. A case marked partial says some charts couldn't be read.
- **Compare with the book.** Open a case you logged that is linked to a casebook case we have analysed, and **Compare with the book** has Bucket check the feedback you wrote against what a strong answer covers: what you covered, what a strong answer also covers that your notes don't show, and one thing to try next time. It is the `compare-case` Edge Function (same secrets as `analyze-feedback`): it reads your case through your own token and our analysis through `library_notes_for()` with that same token, so the database's rule "only a member who logged the case" decides what it may see; Claude is told to describe each point in its own words and not to recite the solution or its numbers. The answer is stored in `case_comparisons` (readable only by its owner, written only by the function), unchanged feedback gets the stored answer back without paying again, and a changed case can be compared again after two minutes. Only the case's own writing is sent (never the title, partner or other cases). It is not offered for a case with no link or no writing, or in demo mode. Deploy with `npx supabase functions deploy compare-case` after applying `*_case_comparisons.sql`.
- **Where the analysis comes from.** Each case was read from the casebook and written up in our own words (never copied), with the book's case type and an industry mapped onto CaseLab's lists. Charts that don't extract as text are marked **partial confidence**: those analyses lean on the interviewer's solution pages. The case text itself isn't stored anywhere.
- **Loading it.** The analyses live in `private-data/casebooks/` and the generated seed in `supabase/seeds/`; both are **git-ignored**, so our write-ups of third-party books never enter git. To load or update the library:

```bash
node scripts/buildLibrarySeed.mjs
supabase db push --include-seed
```

The seed is one transaction and safe to run again (it updates by book and case name, and folds in duplicates as above). The migrations `*_case_library.sql`, `*_library_matching.sql` and `*_library_details_known.sql` must be applied (in that order) before the app that sends `library_id` is deployed, and before the seed is loaded.

The decisions are plain code with tests: the search (`src/domain/library.ts`, mirrored in the database function), the title field (`CaseTitleInput.tsx`), the database rules (`caseLibrary.db.test.ts`) and the loader (`librarySeed.db.test.ts`).

- **Checking the write-ups for live practice.** `npm run audit:live` reads every write-up in `private-data/solutions/`, folds duplicate case names the way the seed does, and writes `reports/live-case-audit.md`: per case, whether it is live-eligible and why, how many beats it has and how many of them are exhibits and how many are steps talked through, which exhibits the candidate is shown and which are hidden (and by which part of the rule, and whether they are the interviewer's reference or data given on request), whether a chart will be drawn and of what kind, and anything a parser cap cuts. **It also compares every exhibit with what is drawn from it** — chart kind, series count and names, panel count, point count, the column list, the row count and their order, and every line of text drawn around the chart, the labels of the rows under its axis and of its reference lines included — on both screens that draw one, and names every exhibit that loses anything (`exhibitLoss` in `src/domain/exhibitFidelity.ts`, the same function the screens read, so the report and the screen cannot disagree). Text cut to length (a panel heading too long for its panel, a row label too long for its row under the axis, a reference line's label too long for the chart) is told apart from content that is gone and reported separately, because the exhibit still holds every figure. **This is write-up to render, not book to render**: the casebook pages are not in the repository, so the check cannot say whether a write-up is faithful to the printed page, only that nothing is lost after the write-up. It ends with a summary (eligible cases, cases with no candidate exhibit, beats of each kind and cases that have both, beats per case, exhibits hidden by each rule, charts drawn, exhibits that do not reach the member whole) that is meant to be diffed between two runs and is safe to paste into an issue: the report holds case names, book names, exhibit titles, counts and verdicts only, never a prompt, a figure or a line of a solution. Every rule is **imported** from the files production runs (`isInterviewerSideExhibit` and `buildPlan` in `supabase/functions/_shared/liveCase.ts`, `readSolution`, `isFullSolution` and `givenOnRequest` in `liveCaseCoach.ts`, `parseBookSolution` and `parseSolutionExhibit` in `src/domain/bookSolution.ts`) and the parser's caps are measured from the parser itself, so the report cannot drift from what a live case will do. **It also reads every prompt**, because the prompt opens a live case word for word (`openingText`): a prompt holds the business situation and the question put to the candidate and nothing else, so the report names any prompt that says where the case came from or notes how the page prints something, and any that describes the case as a case (how hard it is, what kind it is, how it is run, how the interviewer behaves, how the candidate should answer), and any that talks about the member in the third person ("the candidate", "the interviewee": it is read to the member, so it should speak to them). That last rule is reported and never failed, and `npm run audit:live` prints the current count of prompts it matches. Only the rule label is reported, never the sentence. **It reads the interviewer's own side too**: a fact and a clarifying answer are never shown to the member, but the coach reads one out, in full, when they ask for it, so a sentence there that names the book, the casebook or the authors can reach a member mid-case the way a prompt can. The report names every case that holds one, counts the sentences, and counts separately the ones `interviewerVoice` cannot take the book out of — the engine drops a narrator in front of a fact by itself ("the book says X" is read out as X), so the second count is the one that needs the write-up changed. It counts the same side a second way (issue #156): how many of its sentences the reply filter drops, and how many facts or clarifying answers it drops **whole**, which is the count that matters, because a fact is read out whole or not at all and a member who asked for one of those gets the stand-in line instead. Reported, never failed: part of what is dropped is a stage direction, which is right to drop, and only a person reading the case can tell which is which. The command exits non-zero if a file of write-ups cannot be read, and on two things besides: an exhibit a member can be shown that is not the whole of what the write-up holds, and a prompt that names the book, the casebook or the authors or notes a printing oddity. Those are the loud failures, so the cap is raised, the content shortened or the prompt rewritten before anything reaches a member. A prompt that only describes the case as a case is reported and not failed, because an interviewer can be a character in the story and a person decides. It needs the write-ups, which are git-ignored and live only on the owner's machine, so it is not part of CI; `reports/` is git-ignored. `scripts/liveCaseAudit.mjs`, tested in `src/data/liveCaseAudit.test.ts`.

- **Playing every case to the end.** `npm run dryrun:live` plays every live-eligible write-up through the **real** live case — `handleLive` in `supabase/functions/_shared/liveCaseCoach.ts` over the rules in `liveCase.ts`, on the in-memory deps the tests use (`src/test/memoryLiveDeps.ts`) — in all three modes, against eleven scripted candidates. The five it has always had: **brisk** (answers every beat well and moves on), **passive** (writes nothing at all and presses nothing, so only the clock can carry the case), **offtrack** (writes plausible but wrong-headed answers that never complete a beat and never asks to move on), **asker** (asks for data instead of answering, then chooses "move on") and **plausible** (writes messages that sound like progress and name nothing, every one of which the stub scores a clear step forward — the pilot's own failure, and the one candidate whose words are written to be read rather than counted, because the ladder's entry condition now reads them). Six added by issue #181, each for a shape of turn the engine branches on that nothing could produce before: **coached** (is lost, takes the help, and then closes the part on a real step forward — the only one whose beats come out `hinted`), **probing** (asks for figures, which the model marks `data_request`, so asking costs no rung of help), **blocked** (asks outright for the answer, so the model declines the turn itself and declines to write the feedback at the end), **circling** (takes a long time over half-answers the model scores `partial`), **unfiltered** (is answered by a model that says things it should not, so every filter in `parseTurn` runs) and **interrupted** (uses the scratchpad, types into the box and leaves it there, pauses in the middle and comes back, presses "move on" before writing, ends the case while writing the recommendation, and logs it). The clock is driven through `deps.now()`, so the whole catalogue takes about nine minutes (27,951 runs), not thirty minutes a case. The report (`reports/live-case-dry-run.md`) names, at the top, every case that did not reach `stage: 'done'`, grouped by cause and with the stage it stopped at, and then gives one line per case per mode per candidate: where it finished and why, beats reached and their outcomes, hints given and the highest nudge rung reached, and the seconds it took against the plan. The summary (end states, beat outcomes, nudge rungs, what the engine refused) is in a fixed order so two runs can be diffed. **It also proves that nothing of the interviewer's own exhibits reaches the member**: every exhibit a run hands over is asked the production rule itself (`isInterviewerSideExhibit` on the payload the member received, not on the plan that chose it), and no interviewer-side exhibit's title or caption may appear in a message to them — over the whole catalogue, in every mode, for every candidate. A leak fails the command even if the case ran to the end. Figures are a different question on purpose: the interviewer reads out the data a member asks for, which is the rule above. **A run that does not reach the end is one of two things, and the report keeps them apart**: a **failure** (it did not reach `done` in a mode that has a clock, or it threw, or it stopped somewhere the engine did not mean to leave it) or **open by design** (an untimed case waiting on a member who neither completed a beat nor chose "move on"). The command exits non-zero on failures only, so the check stays meaningful; the open-by-design runs are counted and named in their own section, because "a learner who stops engaging is never moved on" is a product question even though it is not a defect. **What it pretends** is the model: in production Bucket decides `assessment`, `beat_complete`, `direction_clear` and `data_request`, may decline a turn outright, and writes the words the member reads. Here the scripted candidate decides all of that from which turn was asked for and how many times it has written on the beat, and nothing else (`CANDIDATE_SPECS` in the script), and the reply is one of a fixed set of shapes, each written to be caught by one of the engine's filters rather than to be read (`REPLY_SHAPES`): a verdict on the member's reading, a verdict with the next question on the end of it, the member named in the third person, the narrator's voice in front of a fact, an announced withheld answer, a move-on sentence, a figure the book worked out in a table the member cannot see, a sentence of the interviewer's private notes word for word, a reply that is not JSON, and an empty one. The last two of the readable ones are built by `playCase` from the write-up it is playing and handed to the stub, so the stub itself still reads nothing of the case. The summary says, for every shape, how many were written and what became of each: **kept** word for word, **edited** by a filter, replaced by one of the engine's own stand-in lines, or **dropped** because the reply could not be used at all. **A reply that carried the book's own answer as far as the member fails the command**, like a leaked exhibit, whether or not the case finished. So it answers "does the case break in the middle, and did the rules fire?" and never "are Bucket's words any good?", which needs a real model — and the shapes catch the wordings the filters are written for, so a paraphrase a filter misses is also one the stub never writes. Options: `--modes`, `--candidates`, `--cases N`, `--dir`, `--out`. Like the audit it needs the git-ignored write-ups and is not part of CI. `scripts/liveCaseDryRun.mjs`, tested in `src/data/liveCaseDryRun.test.ts`.
- **Can the dry run reach what you changed? `npm run coverage:engine`** answers that for the live-case engine. It runs the dry run under V8's own coverage (`NODE_V8_COVERAGE`) and prints, for `supabase/functions/_shared/liveCase.ts` and `liveCaseCoach.ts`, every function that never ran (by name and line; an anonymous one by its source line) and every block inside a function that did run but never did (the untaken side of an `if`, a `??` fallback, an early return), so it reads as a to-do list and not a score. PR #183 took the whole catalogue from 16 of 155 functions in `liveCaseCoach.ts` and 9 of 109 in `liveCase.ts` unreached to 1 and 0, by this measure. **It is for a person to read, not a gate**: some unreached code is right to be (the timer-driven hint is dead in the deployed function too), and a threshold would invite a candidate written to satisfy a number, so nothing fails on what it finds. It takes the dry run's options (`--dir`, `--cases N`, `--modes`, `--candidates`) and `--out` (default `reports/engine-coverage.md`, git-ignored); the whole catalogue takes about as long as `dryrun:live`, and `--cases 40` gives a quick, longer list. The report holds function names and line numbers of our own source only. Needs the git-ignored write-ups and Node 22.6+, so it is not part of CI. `scripts/engineCoverage.mjs`, tested in `src/data/engineCoverage.test.ts`.

  Learning mode has no clock, and Bucket never moves a learner on, so the only things that end a beat there are the member completing it or pressing "move on": a candidate who does neither (`passive`, `offtrack`, `plausible`) is left where it is, in every case. That is the design (see `isUntimed` and `nudgeLevel`), so the dry run counts it as open by design rather than as a failure; the other eight finish every learning case.

  **What the dry run still cannot reach** (measured with V8 coverage over the two engine files, before and after issue #181): the 30-minute hard stop (`endReason: 'time_limit'`), which no candidate reaches because the plan reserves the closing stages' time; ending a case while a part of the discussion is still open; the guards against an action the screen cannot send (empty text, the wrong stage, acting while paused); the limits (4 starts a day, 12 a week, 3,000 actions, 90 coach replies) and the save-collision retries, because one run is one case played alone; and the `??` fallbacks for sessions saved before a field existed. The residue is listed in `KNOWN_ISSUES.md` with what each one would cost to reach. The timer-driven hint path used to head that list; it was removed outright in issue #188, so the engine no longer holds a way to produce help that nobody asked for.

- **Running a case against the deployed function, for real. `npm run pilot:live` SPENDS REAL MONEY.** The audit and the dry run stub the model, so neither can say whether Bucket's words nudge or solve. The pilot runner does: it signs in as a throwaway account (`CASELAB_E2E_EMAIL_A` / `_B` from the git-ignored `.env.e2e.local`, with the project from `.env.local`) and drives one live case turn by turn against the **deployed** `live-case` Edge Function, printing exactly what the member would have seen. Five commands: `catalog` (the cases that can be practised, `--book "<substring>"`, `--json <path>`), `start --case <libraryId> --mode practice|interview|learning`, `turn` with one of `--ready --say "..." --submit "..." --next --finish --end`, `play --script <path.json>` (a whole case unattended from `[{ "do": "say", "text": "..." }, ...]`, each step optionally with `"repeat": n` and the `"stage"` it expects; the run stops rather than improvising if the function refuses or the case is somewhere else), and `spend`. Each turn prints the stage and both clocks, beats shown of total, the mode, every message added since the last turn in full with its `from` and `kind` (a `hint` says so), every exhibit newly handed over in full as the member receives it (title, caption, headings, every row, the approximate flag, and the chart's kind and series names), any refusal, and the running spend. **The spend is read, not estimated**: `live_case_sessions` has no API access, so the script reads `state -> 'usage'` for its own sessions through `npx supabase db query --remote --read-only` (pass `--workdir` when the linked `supabase/` folder is elsewhere, as in a git worktree) and prices the tokens at the deployed models — Haiku for every turn, Sonnet for the one feedback call a `finish` makes, and the higher Haiku tier for a turn whose prompt passes 100,000 tokens. Input, output and the Sonnet cache-read rates are exact; the two cache-write rates and the Haiku cache-read rate are approximations, so every total says "approximate". The running total printed after a turn and the total `spend` prints are the same report over the same turns (`spendReport`, given the turn just taken through `spendWithTurn`), so a `finish` counts at the feedback model's rates in both and the two figures cannot drift apart. **The cap stops the next call before it is made**: `--cap <usd>` defaults to **$2.00** (the owner's figure for the pilot), and the script refuses and exits non-zero when what has been spent plus a reserve — the dearest turn of the pilot so far, never under $0.05, or $0.25 for a `finish` — would cross it. It also prints how many starts the account has left against the function's own 4 a day and 12 a week, refuses to adopt a session it did not start, and never sends the `logged` action, so nothing it does is logged as a real case. Transcripts are JSON under `reports/pilot/` and **hold the book's own prompt and exhibits: never paste one into an issue, a pull request or a commit** (`/reports/` is git-ignored). At the end of a case the transcript also holds the session's full state read back from the database, because the hints, asks and outcome of each beat are how you tell which rung of the ladder a reply came from and the view does not show them. It cannot run in CI (no credentials, real money); its pure parts — prices and attribution, the cap decision, the env-file parsing, the script reader, the view diff and the printing — are tested in `src/data/liveCasePilot.test.ts` with a fake `send`. `scripts/liveCasePilot.mjs`.

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

- **Shortcuts** work anywhere you aren't typing in a box or in a window: `N` logs a case, `?` shows the list, and `G` then `D`, `L`, `I`, `C` or `W` jumps to Dashboard, Case Log, Improvement Areas (under the Case Log tab), Community or Warm-up.
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

### Live case: practise a whole case with Bucket

**Live Case tab → pick a mode, then Surprise me (or pick a lane).** The Dashboard banner, the Improvement Areas card and the first-login tour all lead here too. You get one casebook case that has a full write-up (a random one you have not logged, or one you pick), typed, against one continuous clock that starts when the prompt first appears and is as long as the case has in it (23 minutes for a case with one thing to work through, 39 for the usual five, up to 40 for the busiest; see the table below). Bucket plays the interviewer. When the case ends you get feedback on what you actually wrote, and the case is added to your case log. Opening the tab after a case has finished and been logged starts afresh: its feedback lives in the case log.

- **Three modes.** **Practice** can be paused (the clock stops and the work is hidden, so a pause is a rest and not extra time to think; every moment of the case moves on by the length of the break, so exactly the time that was left comes back) and ended early (what was written goes to feedback, and the case is logged as ended early; a case ended before anything was written asks the model for nothing and is not logged). **Interview** has no pause and no early end, and the server refuses them, so the clock runs from the first screen to the last — **and it gives less away**: the help ladder starts one rung later and stops one rung earlier, so being stuck costs you the exhibit instead of earning you the analysis (see "You drive" below) — **and it never tells you whether you are right** (see "An interview does not tell you whether you are right" below), where practice says what was good about a step as it goes. A case from before there were modes counts as practice.

- **Learning** has no clock at all: no timer is shown, no stage or case ever runs out, and nothing is paused because there is nothing to pause (the server refuses it). The member moves the case on (Ready, Hand in, **Move on**) and can end it whenever they like. **Move on is open at any point**: on an exhibit the member has written nothing about, the button is live and the server accepts it, so a learner who does not know how to start on one can move past it without first writing something they do not mean. Nothing here is scored, so how long to stay with an exhibit is theirs to decide. On the last part of the section the button reads **Move on from this section**. Bucket coaches instead of interviewing: it says what was good and why a step matters in a real case, hints and explains when the member is stuck (it never moves them on by itself), and, once they have had a go, says what a strong answer to the exhibit looks like (from the case's own notes, in its own words; the answer to the whole case stays private). The feedback is framed as learning notes with no ratings, whatever the model sends, and the case is saved to the log the same way as the others, with blank ratings and a note saying it was learning mode. Practice and interview behave as before.

| Part | Planned time | What happens |
|---|---|---|
| Prompt and clarifying questions | 3:00 | You see the case prompt, word for word. Ask three or four questions; Bucket gives the facts and any figures the case holds as written, and says so only when it really has nothing |
| Framework thinking | 1:30 | Protected: no questions, no hints, a private scratchpad (kept apart from what you hand in) |
| Framework and starting direction | 3:00 | Write the framework, then say where you would start |
| Exhibits and discussion | 4:00 plus 4:00 for each thing to work through (8:00 at the least, 25:00 at the most) | One part at a time, each one named as it comes out — an exhibit, or a piece of the analysis that has no exhibit: what you make of it, your calculations, what it means for the client, your next step |
| Brainstorm (as many as the case has, each where the book asks for it: in the middle of the discussion, or after it) | 0:30 + 1:30 each | Think, then write. The discussion is picked up again afterwards if the case has more of it |
| Recommendation | 0:30 + 1:30 | Think, then write; your earlier work stays on screen |

**The case is as long as it has in it.** Everything around the discussion is the same for every case — 7:30 of prompt and framework, 4:00 the closing stages need, 3:30 of flexible time, 15:00 in all — so the whole case is the exhibit discussion plus fifteen minutes. A case with one thing to work through runs 8:00 of discussion in 23:00; two, 12:00 in 27:00; three, 16:00 in 31:00; four, 20:00 in 35:00; five (the commonest size), 24:00 in 39:00; six or more, the ceiling of 25:00 in 40:00. A case with nothing for the candidate to work through has no discussion stage at all and runs 15:00. Over the 847 write-ups live practice offers, that is a median of five parts and 39:00 a case, and 272 of them plan the full 25:00 in 40:00.

In a four-exhibit case that is 31:30 planned in 35:00, and the 3:30 of flexible time is the same at every size. Time you save by moving on early carries into the exhibit discussion, which may run past its planned time only while you keep making progress and never into the closing time: the recommendation always starts 2:00 before the end, and every brainstorm the case still has to run keeps its 2:00 on top of that. The exhibits are yours to drive: how many you get through in the time is up to you, and when the exhibit time is used up the case moves on to the brainstorm or the recommendation. A case with no brainstorm skips those two stages, and a case with two takes the second one's two minutes out of the flexible time rather than running longer (the discussion is split across two sittings, with the time it had left when it stopped). At the end of the clock anything you were typing is saved as an unfinished draft (marked as such), the case ends, and the feedback is written afterwards (it need not fit in the time).

- **A case runs its exhibits *and* the rest of its analysis (issue #128).** The discussion is a sequence of parts, and a part is one of two things: an exhibit the book hands the candidate, or a piece of the book's analysis that has no exhibit of its own — the hurdle-rate test, the payback, the market sizing done in conversation. The two behave the same way: the same clock, the same help ladder, the same "I'm done with this part" button, the same record of how it went. A part with no exhibit hands nothing over; Bucket puts it to you, the exhibits you have already been given stay within reach in a fold, and everything the book worked out about it (its working, what a strong candidate notices, the common miss, the questions to check yourself with) stays with the interviewer, exactly as an exhibit's notes do.
- **A case that hands over no exhibit is run as the conversation it is (issue #193).** 246 of the 847 live-eligible write-ups have no exhibit at all: every part of them is a piece of the book's analysis, talked through. The strip and the stage above it have said **Discussion** on those cases since the strip was built; what changed on 2026-11-18 is that everything Bucket is told says it too. The conversation Bucket reads no longer carries "an exhibit is shown to the student" in front of a part that handed nothing over — on these cases, and on the talked-through parts of every other case, where the line was wrong in the same way — because the notice is now read against the plan, which says whether that part was an exhibit or a topic. The stage name Bucket is given for your written record, for the time each stage took and for the debrief it writes back is **Discussion** rather than "Exhibits and discussion", so the debrief no longer heads a conversation-only case with a part it never had. And the turn where you say where you would start no longer tells Bucket to say it will show you some data: on a case with nothing to show it says the case is getting into the work instead ("Understood. Let us start working through it."), so you are not left waiting for an exhibit that does not exist. Two things deliberately stay: Bucket still reads out a figure you ask for, because a case can hold the interviewer's own tables without having a single exhibit to hand over; and the skill is still **Exhibits & Charts** in your feedback and your case log, because that is the case log's own skill group and a live case is logged beside every case you log by hand.
- **Every part says what it is about before it asks you for anything (issue #163).** An exhibit names itself on the table; a part that is talked through hands over nothing, so the line that opens it carries the topic — "Good. Next part: Break-even volume. What would you look at, and how?" **The topic comes from the engine, not from the model**: it is the book's own step title, with the book's numbering taken off ("Question 3B:", "Q2.", "Part C -", "Part II:", "Phase 3:", "Bucket 1:", "Math question 2:", "Question 3 (optional):", "Exhibits 1 and 2:"), and it is the only thing of the step the member ever reads. The numbering comes off only when something separates it from the subject, so a title that counts something of its own keeps every word ("Question 4 and recommendation", "5 Cs: where to start", "Break-even, part 2: the fixed costs only"), and a filing word the books also use as an ordinary one ("Option", "Analysis", "Decision") comes off only with a number behind it (issue #194). This matters because an interview is right to forbid Bucket to name a driver, a comparison or a figure the member has not raised (issue #130/#145), so before this the topic could not reach them until their second message. **The topic is the question, never its answer.** A step's body, working, what a strong candidate notices, the common miss and the questions to check yourself with stay with the interviewer and `leaks()` still covers them; the title is not among them and never was. Two kinds of title are not shown at all, and the part keeps an opening line that names nothing: one that holds the finding rather than the question ("Why the suburban shops lag", "Demand is driven by end users", "Confirm the profit decline"), and one the book heads with the name of an interviewer-side table, which the member is never told (issue #95). Measured over the 847 live-eligible write-ups on 2026-11-18: 2,723 parts are talked through, 2,620 of them (96%) now say what they are about, 70 are held back as a finding and 33 as the name of a hidden table (one more than before #194: with the numbering gone, that part's subject is exactly the name of an interviewer-side table, which is the guard doing its job); of the 284 cases that are talked through from the framework to the recommendation, 254 name every part (`stepTopic` and `revealBeat` in `supabase/functions/_shared/liveCase.ts`). On such a part Bucket's line and the box ask how you would work it out rather than what you notice, and the acknowledgement an interview falls back to at the rung that gives nothing asks what you make of **this part** rather than of "that".

  **Where each part sits** is the book's own order. The two lists in a write-up — exhibits and steps — are each in order, and the only link between them is a step that names its exhibit ("Exhibit 2: why the suburban shops lag", "Financial analysis: Exhibit 1"), so those steps are the sync points: that exhibit comes out there, and the step is not worked through a second time. A step with no label that says the same thing as an exhibit ("Cost structure" beside "Cost structure of the client") is that exhibit's part too, because a part you meet twice is worse than one you meet once. An exhibit nobody claims is handed over before the parts it would otherwise sit behind, so in a case where nothing names anything the exhibits come first and the steps follow, which is the order those cases already had. A step whose work another stage does is left out, and both tests read the **head** of the title so that a step that merely uses one of those words further along keeps its part. The closing recommendation: "Recommendation", "Final recommendation", "Synthesis", "Conclusion to the CEO", "Wrap-up", "Summary for the CEO", "Closing the case", "Answer" on its own — but not "Close or invest: the ROIC test" or "Closing the payback gap". The framework: "Framework and hypothesis", "Framework and the two parts of the case", "Structure and prioritize", "Clarifying questions and the goal" — but not "Revisiting the framework after Exhibit 2" or "Pick the framework", which are not headed by it, and not "Framework and Exhibit 1", which goes on to name an exhibit and so has an exhibit's work in it. You write your framework once, in its own stages. Over the 847 write-ups live practice offers this is 1,396 exhibit parts and 2,723 talked-through parts, 520 cases that have both, and 10 cases left with a single part (it was 171).

- **A brainstorm is asked where the book asks for it, and every one the case has (issue #133).** The books often want the ideas *before* the exhibit that shows which of them the client went with — "ways to categorise the new shops", asked before the exhibit that groups them into urban and suburban — and a brainstorm run after that exhibit has nothing left to brainstorm. So a brainstorm is a part of the case like an exhibit or a step, placed by the same rule (the step that names its exhibit is the sync point; where nothing in the write-up names anything, the exhibits come first and the steps and brainstorms follow, which is the order those cases already had). When the case reaches it, the discussion stops, you think and write as before, and the discussion is picked up afterwards with the time it had left. A case with two brainstorms runs both, in the book's order, where before it ran only the first. If the clock ends the discussion early, the parts it did not reach are let go but the brainstorm is still run: its time was reserved in the closing time all along. Over the 847 write-ups live practice offers, 177 have a brainstorm and 196 brainstorms are asked in all (22 more than before); 118 of them in 110 cases are asked before a part of the case that used to come first, 35 of those immediately before an exhibit. **What you are asked reads like a question**: the topic is the book's own step title with its heading and its numbering taken off, so "Brainstorm #1: Revenue factors" is asked as "Brainstorm: Revenue factors" (`brainstormTopic` and `planBeats` in `supabase/functions/_shared/liveCase.ts`). Nothing of what the book holds under that step — its ideas, its notes — is ever in the question.
- **Work you hand in is acknowledged, in one line (issue #195).** Handing in your ideas or your recommendation used to be met with silence — of the three writing stages only the framework spoke — so a minute and a half of writing under a clock was followed by the next part of the case, or by the end of it, with nothing to say the work had arrived. Bucket says **"Thanks, I have your ideas."** as the next part opens, and **"Thanks, I have your recommendation."** as the case closes, in front of the line that says your feedback is being written. **The line comes from the engine, not from the model**: it costs no call, it says only that the work arrived — never that it was good, complete or on the right lines — and it cannot stray into the ideas you just wrote or into the book's own list of them. It is said inside the part of the case that opens next, which is the screen you are looking at when it lands, and that part drops its own "Good." so that two greetings do not run together ("Thanks, I have your ideas." then "Next part: Break-even volume. What would you look at, and how?"). The two screens that show none of the conversation — a thinking stage, and the end of the case — read it back and put it in front of their own line ("Thanks, I have your recommendation. Give me a moment while I read through everything you wrote..."). **A draft the clock took, and a stage you left without handing anything in, say nothing of the kind**: nothing was handed in, and "I have your ideas" when the box has just been taken away would not be true. The clock still says it is moving the case on, and ending the case while you are writing still says you ended it here (`HAND_IN`, `submit` and `revealBeat` in `supabase/functions/_shared/liveCase.ts`; `handInLine` in `src/domain/liveCase.ts`).

- **Bucket is with you throughout.** Bucket (the teal bucket) greets you, speaks at the top of every stage in a speech bubble (a different line for each stage, kept steady for the case), and shows how the moment feels: quietly thinking while you think, a light bulb after a hint, a worried face when the clock runs low, and cheering with confetti when your feedback arrives. His messages in the conversation carry his face, and a mini Bucket marks the step you are on.
- **The strip at the top says where you are.** Above the clocks the case's own steps run across the screen: Prompt, Framework, Exhibits, Brainstorm where the case has one, Recommendation. **Each of the four states has a fill and a mark of its own**, so a glance separates them and so does a screen reader. The step at hand is solid in the accent colour and carries the mini Bucket, and it is the one marked `aria-current="step"`. A step behind you is a flat grey with a tick, and is read out as "finished". A step still to come has no fill and a dashed outline, and is read out as "still to come". A step standing open while the case is elsewhere is a tint of the accent colour with a continuation mark, and is read out as "still open". A case whose parts are all talked through has no exhibit to hand over, so its middle step reads **Discussion** and so does the stage above it. A brainstorm the book puts in the middle is asked in its place and the discussion is picked up afterwards, so the marker comes back to the discussion with the case while the brainstorm you handed in stays filled in behind you. A part is filled in once you have finished it and not before: while a mid-case brainstorm runs with parts of the case still to work, the discussion stands open instead, which is how the strip says a part is not closed and the case will come back to it. So a part only ever goes from still to come, to standing open, to finished (`beatsShown` against `beatsTotal` is how the strip knows the case has parts left; when a brainstorm is reached with every part worked, the discussion is filled in). The strip is a place-marker: it counts nothing and scores nothing (`caseSteps`, `STEP_STATE_WORD` and `stageHeading` in `src/domain/liveCase.ts`, drawn by `ClockBar` in `src/features/live/liveParts.tsx`). At phone width the five pills wrap onto two rows.
- **Pick a lane first.** Instead of one long list, cases are gathered into lanes by case type or by industry (a tile per lane with how many cases it holds and how many you have done); choose one to see its cases, or "Surprise me in" that lane, or search across all of them.
- **Word for word, and only full write-ups.** The prompt, the interviewer's facts and answers, and every exhibit (title, caption, and the chart or the table as the book prints it, with its approximate flag) come from the write-up exactly as written, never summarised: nothing is shortened (long table cells and 60-plus-row exhibits included), and the exhibit is drawn by the same code as in the full solution. **A shortened exhibit is never passed off as the whole one.** Every exhibit is measured on its way to the screen — chart kind, series, panels, points, columns, rows and their order, and the text drawn around the chart down to the labels of the rows under its axis and of its reference lines, the write-up against what is drawn (`exhibitLoss` in `src/domain/exhibitFidelity.ts`) — and if a cap ever did cut something out, the exhibit carries a short note saying part of it could not be shown, in the Live case and on the Full solution screen alike. Nothing in the library is in that state (`npm run audit:live` fails on an exhibit that cannot be drawn whole, so it is caught before anything is loaded); the note exists because a member working an exhibit that is quietly missing a column is worse off than one who knows. What was cut is counted in the report, not spelled out to the member mid-case. A chart kind we do not draw (marimekko, waterfall, a map) is not a cut: that exhibit stays the book's own table. The facts the interviewer holds are given only when you ask, exactly as written. Only complete write-ups can be practised (marked `confidence: high` with a prompt, a recommendation and exhibits or steps; the 10 of 346 marked partial are left out), both in the list and in "Surprise me".
- **A drawn chart is shown without a table that only repeats it.** The write-ups carry a table for every exhibit, and where the book prints the exhibit as a chart that table is our own transcription of the chart's figures. A candidate in the interview has only what the book prints, so in the Live case an exhibit whose chart is drawn shows the chart and leaves the table out when every cell of it is made of numbers and words the chart already prints (`tableRepeatsChart` in `src/domain/liveExhibit.ts`). The exhibits are not flagged as transcription or book table, so the test reads the table itself: a number counts as printed when it is a label on a bar or point, a total, a pie slice's share, a figure in a heading, category or footnote, or a plotted value of an exhibit marked approximate (its figures were read off a chart that printed none); a word counts when it is in the chart's own text. Anything the chart does not print keeps the table: a column of its own (the population row the book gives under a chart), the rows of text under the chart's axis (the chart draws them, but a book table beside a chart looks just like them), or exact figures for a chart whose bars carry no printed numbers (the exact table is then the book's). An exhibit with no drawn chart shows its table as always. The "(values read off a chart, approximate)" note beside an exhibit's title explains the figures of its table, so it is shown only while the table is: when the table is left out, the note goes too. The Full solution is unchanged and still shows the table, and the note, beside each chart.
- **The interviewer's own sheets stay hidden.** Many write-ups include tables that are the interviewer's, not the candidate's: guidance, solutions, "Information for Interviewee / Keep Private" sheets, "Table on the book's solution page". They would give the case away, so they are found by their title or by what their caption, headings or cells say, kept off the screen, and given to Bucket as private reference. A case with no table left for the candidate is worked through its steps in conversation instead (284 of the 847 live-eligible write-ups). A rare answer table that says none of these things would still show, and a candidate exhibit that mentions them may be hidden (that is the safer way to be wrong).
- **A word the books use on both sides does not take an exhibit away on its own.** A title's markers come in two kinds. A **hard** one — interviewer, guidance, guide, solution, "performed by", "answer key", "keep private", "not for the candidate" — belongs to the interviewer's sheet wherever it appears and hides the table by itself. A **soft** one — sample, approach, answer, brainstorm, expected, calculation, math — is a word the books also put in the titles of exhibits they hand the candidate ("Exhibit D – Expected Claims Per Years of Warranty", "Exhibit 3: Annual Cost Calculation"), so on its own it hides a table only when the title is not the book's own name for an exhibit. A title counts as the book's own name when it **starts** with the book's numbering ("Exhibit 1:", "Exhibit #3 -", "Exhibit D –", "Figure 2", "Appendix A") and goes on to say what the table is about: "Exhibit 1 calculation" and "Exhibit 3 (math detail)" name the book's working *for* an exhibit rather than the exhibit, and "Exhibit 1: Answers" or "Exhibit 2: Calculations" say nothing beyond the word itself, so all of those stay hidden. Everything else is unchanged — a numbered exhibit is still hidden by a hard marker, and by what its caption, headings or cells say. Over the 847 live-eligible write-ups this shows the member 9 more exhibits (1,394 of 1,752) and hides 9 fewer (358).
- **Ask for a number and you get it, at any point in the case.** The data the interviewer holds — the fact sheet, the clarifying answers and those hidden tables — is with Bucket in every stage of the conversation, not only while an exhibit is on the table, so a member who asks "what are the market sizes?" while still asking clarifying questions is read the market sizes instead of being told we do not have them. What may be *said* from them does not change with the stage: a hidden table that the write-up says the interviewer hands over when asked ("Market sizes (given if prompted)", "Information the interviewer provides once the candidate asks") is read out in full, every row, as an interviewer reads a table aloud; a table that is the book's own working or answer is read out for its **input** figures only, and never for a result, a total, a ratio or a conclusion. One figure is never read out from either kind: the very thing the member has been asked to work out, even where the book prints it as a row of its own ("Profit per customer: $4.20" is an answer, however input-shaped the row looks) — the inputs beside it are given, the answer is theirs to produce. The same goes for a figure the book worked out from other figures in the case: those cells are marked for Bucket as results rather than left to its judgement (see "It cannot give the answer away" below). Asking costs nothing: a message that asks for something — data, an exhibit, a figure, or the answer itself — is not treated as being stuck, and the engine takes it back off the count that climbs the hint ladder (the model flags the message, the rule is the app's), in every mode. Before an exhibit is on the table the tables ride on each reply inside a 2,500-character budget (half the cases that have them hold under 600 characters of them), so a long guidance sheet is cut rather than filling the prompt.
- **The clock and the rules are the app's; the words are the model's.** Which stage you are in, how long it lasts, when a hint is due and when the next exhibit comes out are plain, tested functions (`supabase/functions/_shared/liveCase.ts`). The model (Claude Sonnet 5.5) only writes Bucket's short replies and judges what you wrote. Thinking and writing stages move on by themselves; refreshing or coming back restores the clock, the conversation, your drafts and your scratchpad.
- **You drive; hints answer what you write, and how much help there is depends on the mode.** Bucket never speaks up on its own: nothing arrives while you read, think or type, however long that takes. When you write something about the exhibit and it shows you are stuck, you climb your mode's ladder, one rung per message that gets nowhere (a clear step forward starts the count again, and a message that only asks for data or for the answer costs no rung at all):

  | Message on an exhibit that is going nowhere | Practice | Interview | Learning |
  |---|---|---|---|
  | first | a process hint (a way to approach the data) | nothing: you are left to sit with it | a process hint, with why it works |
  | second | a sharper, directional hint (where to look) | a process hint | a directional hint, with why it matters |
  | third | Bucket leads: it stops asking open questions, says where to look and hands over the data you asked for (the facts, never the conclusion) | a directional hint | Bucket teaches: where to look and what a strong reading is |
  | fourth and after | the next exhibit | the next exhibit | it keeps teaching; a learner is never moved on |

  **What counts as a step forward is not the model's word alone (issue #130).** The rung counter is reset by a message that moved the case on, and the model is what judges it; the real-model pilot found it scoring six messages on one beat as six steps forward while four of them said plainly that the member was stuck, so the ladder never engaged. A message now has to do one of three things to keep the counter at zero: name a comparison or a driver, state or work with a figure, or say the next thing you would do — and a message that reads the exhibit back and then says you do not know what to do with it is not a step forward unless it also says what you would do next. The directives say so in every mode, and the engine applies the same test to the score that comes back (`madeAStep` and `assessmentOf` in `supabase/functions/_shared/liveCase.ts`). It only ever takes the top score away: nothing here can make a message count for more than the model said.

  **Nearly there every time is going nowhere too (issue #184, from the real-model pilot).** A message that gets part of the way is scored `partial`, and a part-way message is not someone who is stuck, so every rung of help was held back from them while the counter went on climbing. The pilot found what that costs: six competent-sounding but wrong messages on one part came back `partial` six times, nothing on the ladder could fire, and the part never ended — the rest of the discussion's time went on it, and the parts the case still had to come to were never reached. Three content-free messages on the part before, which the model scored as getting nowhere, were answered up the ladder and moved on in three turns, so saying nothing cost the member less than sounding good. Two half-answers in a row are a member closing in on it and are left exactly as they were; a third in a row is a member going round in circles, and from there the rungs are open to them as they are to a member who is stuck. A clear step forward sets the count back to nothing, so a half-answer between two real steps costs nothing, and a message that only asked for data costs nothing either. Nothing of it is driven by the clock: it takes a message from the member to reach any of it. So in practice Bucket leads on the third half-answer and the next part comes out on the fourth; in an interview the directional nudge comes on the third and the next part on the fourth; and in **learning** nothing moves, because that mode has no rung that moves a member on and no clock, and nobody but the member ends a part (`CIRCLING_PARTIALS`, `gettingNowhere` and `partialRun` in `supabase/functions/_shared/liveCase.ts`).

  **An interview nudges and never rescues**: there is no rung at which Bucket says where to look, so being stuck costs you the exhibit rather than earning you the analysis. In the timed modes the rung just before moving on is skipped once the exhibit has already taken longer than it is worth, so a case never stalls on one exhibit. **What a part is worth** is the time the discussion still has, shared by the parts it has still to come to. That time runs to the discussion's latest end, flexible time and all, rather than to the planned end the clock draws, so a part brought out while the case is running on its flexible time has real time of its own and is led before it is moved on (issue #164); measured against the planned end it had none, and the last part or two of a long case lost that rung 30 seconds in. The budget decides this one thing — it moves no stage end and no deadline, so a case is exactly as long as it was, and a part that really has run past its share still loses the rung. When the case moves on it is one neutral sentence and the next exhibit, without explaining the last — and the app holds the reply to that, not only the directive (see "It sounds like an interviewer" below). A good answer is never cut off, and a member who has got what an exhibit is saying is not held there: Bucket moves on as soon as they have said what it means for the client, and an **I'm done with this exhibit** button (**I'm done with this part** where the part has no exhibit, **Done with this section** on the last one) lets them move on themselves once they have written something about it — in the timed modes, where the member is being assessed on what they cover and a stray click should not skip an exhibit nobody looked at. The server holds that rule as well as the screen ("Tell me what you make of this one first."). In learning mode the button is **Move on**, and it is open whether or not anything has been written (see "Three modes" above). After the last exhibit the case goes straight on to the next section, and the time saved carries over. Each exhibit is recorded as reached alone, hinted, moved on by the coach, or moved on by the member. The exhibit stays on screen beside the conversation, so it never has to be scrolled back to.
- **It cannot give the answer away.** Each reply sees the prompt, the facts, the clarifying answers and the interviewer's own tables (to read figures out of, under the rules above), and once the discussion starts the exhibit on the table with private notes about it — never the next exhibit, the hypothesis, the recommendation or the brainstorm. A reply that repeats a sentence of those notes is replaced. **A figure the book has already worked out is an answer, not data (issue #129, from the real-model pilot).** The test is the rubric's own: could you have produced this figure yourself from what you already hold? If you could, it is yours to produce, whoever wrote it down and however input-shaped the row it sits in looks — a market revenue that is attendance times ticket price, a per-store quantity that is a total divided by the store count. The directives say so, and say that such a figure is never volunteered either: not unasked, not before an exhibit is out, not tacked onto the inputs just read out, and not inside an otherwise correct refusal. Because a prompt is a request and not a guarantee, the cells are also marked for the model and the reply that comes back is checked in code. A cell of an interviewer-side table is marked `[computed]` when it shows its own arithmetic ("24,000/120 = 200") or when its figure is the product of two figures on the same row or down the same column, or the sum of the rest of them, at the same scale and within half a percent — and never when that figure is one you can see elsewhere in the case, because reading an input out is always right (that is what issue #83 is for). A table with nothing but working in it is marked whole, as having no input to read out. A reply that then states one of those figures, where the figure appears nowhere you have been shown, is replaced the way a reply that quotes a private note is. The check is numbers only: a figure put into words, a rounded version of it, or one the model works out for itself goes straight through, so the directives are the first line and this is the net (`computedCells`, `heldResults` and `statesHeldResult` in `supabase/functions/_shared/liveCaseCoach.ts`). Learning mode holds none of it back: there the answer is the lesson, once you have tried. Everything you write is treated as your answer, not as instructions. Neither the notes nor the case's name reach the screen until the case is over.
- **It sounds like an interviewer, not a narrator (issue #131, from the real-model pilot).** Three things a reply never does. It never talks *about* you — no "the student", no "the candidate" — never describes its own instructions, and never announces that it is holding something back: ask for the very thing you are there to work out and you get one short sentence saying that part is yours, and the next question ("That one is yours to work out — talk me through how you would get there."). It never names where a fact is written: you get the figure or the fact itself, not "the case says ...", "the exhibit states ..." or "according to the prompt" (pointing you at something you are holding — "look at the profit row" — is a different thing and stays). The book, the casebook and the authors are on that list of places a fact can be said to be written, like the case and the exhibit, because the interviewer's own notes sometimes name one: wherever the model repeats it in front of a fact, the fact stays and the source goes. What that cannot do is unsay a book a sentence is built around, so the write-ups say it as the interviewer instead. And when being stuck moves the case on, that sentence is the whole reply: no takeaway, no half-explanation, nothing about what the beat you just left was showing. The directives ask for all three, and the app checks the reply that comes back: a sentence with one of those tells in it is dropped (a reply that was nothing but a refusal becomes the one-sentence version), the narration is taken off the front of a fact, and a move-on reply is cut to its opening sentence — kept only when that sentence really does say the case is moving on, and replaced by "Let us move on to the next piece." when it says something else or is still carrying the beat, measured by the content words it shares with the private notes rather than by a quote (issue #165: the opening sentence used to be kept whatever it said, so a reply opening with a verdict reached you as a bare verdict with no move-on in it). A fact that happens to name you is **not** one of those tells (issue #156): the interviewer's own notes put a condition on a fact that way ("given once the candidate asks for it: ..."), and the coach reads a fact out in full when you ask for it, so dropping that sentence would cost you the figures you asked for rather than a turn of phrase. A sentence that names you is therefore dropped when it is Bucket's own talk about you — its own voice in the same breath ("the student has asked me ..."), or an instruction aimed at you ("the candidate should start with the revenue side") — or when it carries no figure of the case to lose, and is read out as written otherwise. Measured over the 872 write-ups: the filter used to drop 286 sentences of the interviewer's side in 201 of them, 198 of those the whole of a fact or a clarifying answer; it now drops 246 and 165, so 40 sentences in 35 cases reach the member who asks, 33 of them the whole of a fact or an answer. The checks catch the wording the pilot found and the obvious variants of it, not every paraphrase: the directives are the first line and these are the net (`interviewerVoice`, `withoutSourceNarration`, `movingOnOnly` and `sharesSubstance` in `supabase/functions/_shared/liveCaseCoach.ts`, tested in `src/data/liveCaseCoach.test.ts`).
- **Asking outright for the answer is answered, never shown as an error (issue #142, from the real-model pilot).** Sometimes the model declines the turn instead of writing a reply: the API sends back a `refusal` stop reason, which is what asking bluntly for the total usually produces. Its own words are never passed on, and until 2026-11-17 nothing else was either, so the member saw "Bucket could not reply just now" — the message meant for a call that failed. A declined turn is now answered with the line that moment already has: "That one is yours to work out — talk me through how you would get there." in practice and in an interview, and "Let us get there together rather than skip to it — what is the first step you would take?" in learning mode, where the coach teaches the work rather than holding a line against it. It is an ordinary reply in everything the session records: no hint is counted, the beat is not finished, and, like any other message that asks for something instead of working on the case, it costs no rung of the help ladder. A real failure is unchanged and still keeps what you wrote — an answer that is not JSON, one with no message in it, a timeout or a network error all still say that Bucket could not reply (`refusedTurn` in `supabase/functions/_shared/liveCaseCoach.ts`, tested in `src/data/liveCaseCoach.test.ts`).
- **An interview does not tell you whether you are right (issue #130, from the real-model pilot).** In **interview** mode a reply never confirms, denies or grades your reading of the part you are on: no "you're right", no "good instinct", no "that's the core signal", and no "not quite" either. It adds nothing of its own to your thinking — no driver, comparison or segment you have not raised yourself — unless it is the rung's own hint, which is the only help an interview gives. You find out whether you were right by doing the work, which is what the mode is for. It is neutral, not cold: a real interviewer is pleasant and simply does not say. Asking about a **fact** is a different thing and is answered as always ("is the market growing?" gets the fact), and the figures you ask for are still read out in full. **At the first rung, where an interview gives nothing, "nothing" is still something on screen**: an acknowledgement and the question handed back ("Okay, stay with it — what do you make of this part, and what would you do next?", which points at the part rather than at "that": a part that is talked through puts nothing on the table for a pronoun to point at, and the engine has already said what the part is). That line belongs to that rung and to no other: at the rung where being stuck moves the case on, a reply that was nothing but a verdict is replaced by the move-on line instead, because the part is being taken away and "stay with it" would contradict the next exhibit arriving on the line below (issue #165). **Practice and learning keep their encouraging register** and are untouched by this: practice says briefly what was good about a real step before its next question, and learning teaches as it goes. The two registers are kept apart in the directives — the interview's system prompt and its exhibit and direction turns are its own, and practice's say in as many words that it coaches as it goes — and, because a prompt is a request and not a guarantee, the reply that comes back is checked in code for an interview: a sentence that grades your reading is dropped (a verdict with a question stuck on the end of it keeps the question), and at the first rung a reply carrying three or more content words of one sentence of the beat's private notes, none of them words you used yourself, is replaced by that acknowledgement. The check reads the wording the pilot produced and the obvious variants, not every way a verdict can be worded (`gradesTheirReading`, `withoutVerdicts` and `OVER_TO_YOU` in `supabase/functions/_shared/liveCaseCoach.ts`, tested in `src/data/liveCaseCoach.test.ts`).
- **Feedback grounded in your writing.** The feedback gets everything you wrote (not the scratchpad), how each stage went, and the book's write-up as a yardstick. A rating is only kept if the feedback quotes something you really wrote (the check is done in code); behavioural skills are never rated from text. The overall rating is kept only when more than half of the skill ratings Bucket gave are backed by such a quote (3 of 6 is not enough, 4 of 6 is; a stage the case never reached is not counted against it), otherwise the overall shows a dash and the written feedback stands on its own (issue #192). The ratings and notes are Bucket's draft: the case is saved to your case log with Bucket as the interviewer, a note that it is an AI draft, and the usual editor for you to adjust it. It counts as a logged case, which also means it is no longer offered to you as a fresh one.
- **Private and limited.** Sessions live in `live_case_sessions`, which no API role can read or write: only the `live-case` Edge Function (service role) can, so the case's write-up and the stage gating cannot be bypassed from the browser. One running case per member; at most 4 started a day and 12 a week, 90 coach replies and 3 feedback attempts per case. The Anthropic key exists only in the function. Not available in demo mode.
- **Cost.** Starting costs nothing. The 20 to 40 short replies of a case go to a small, cheap model (Claude Haiku 5.5, `ANTHROPIC_COACH_MODEL`) and the one longer call that writes the feedback to Claude Sonnet 5.5 (`ANTHROPIC_FEEDBACK_MODEL`, default `ANTHROPIC_MODEL`). Our estimate is under 10 cents a case, against about 30 on Sonnet throughout; set a spending limit on your Anthropic account as well. Every case keeps the tokens it used (`live_case_sessions.state -> 'usage'`: calls, input, output, cache read and cache write), and each call is also logged by the function, so the real cost can be read back, for example `select state -> 'usage' from live_case_sessions` and multiply by the model's prices.

To switch it on for your own project:

1. Apply the migration `supabase/migrations/20261123120000_live_case.sql` (`npx supabase db push --linked`).
2. Make sure the function has `ANTHROPIC_API_KEY` (`npx supabase secrets set ANTHROPIC_API_KEY=...`; `ANTHROPIC_MODEL` is optional, default `claude-sonnet-5-5`). It is the same secret the Compare with the book feature uses.
3. Deploy it: `npx supabase functions deploy live-case` (`supabase/config.toml` already turns off the gateway's sign-in check for it, because the function checks the sign-in itself).
4. The case library needs write-ups (`library_case_solutions`) for the cases to practise; a case without a full one (`confidence` high, with a prompt, a recommendation and exhibits or steps) is not offered.

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
- **People without an account**: the `anon` role tried as a scraper would, and the `authenticated` role tried the same way: the two public tables refuse every direct read (select, column select, count, order, limit, offset, filter and planner estimate), hold no column grant for either role and have no policy left, so nothing can be listed, searched, counted or paged; the only way in is `public_person(id)` / `public_person_cases(id)` with an exact member ID, which returns the same fields as before, nothing for an unknown ID, nothing for a member who never switched their link on and nothing the moment one switches it off; every old visibility combination keeps the meaning it had and nobody becomes more visible; nothing public by default, opt-in only, free text only for members who opened everything (cut to 2000 characters), private cases hidden, no access to any member or personal table, no writes or function calls, length and skill-name limits, and former members removed by `revoke_nonmembers()`
- **Privacy**: three verified members and one unverified, tried as an attacker would with direct queries: nothing shared by default; each switch reveals only its own field; scores need case history; per-case overrides (private, name only, full); changes apply immediately and leave no stale data; unlisted members vanish; `other_notes` never appears and the partner only with its own switch; another member can't read, edit or delete your cases or profile, write the shared table, or call the internal functions; filters, sorting and counts can't reveal hidden values; unverified and anonymous users get nothing; least-privilege table grants
- **Community logic**: loose case-title matching, pairing (what to offer, what to avoid, thin areas) and the filters
- **What I'm sharpening** (the link holder's skill summary): the rules (`sharpening.test.ts`: weak and strong sides, the middle on
  neither, at most three a side, names with no number in them, silence below the minimum rated cases and for a skill scored on too few,
  nothing without shared skill scores, the behavioral fields read as one, a skill they tagged themselves kept on the sharpening side,
  and the "Shares ..." line offering the summary only where it is rendered: claimed above the minimum, dropped below it, dropped
  without skill scores, dropped with the switch off and dropped for another member, with every other switch left alone) and
  the screens (the card for someone holding the link, absent until the switch is on, absent without skill scores, silent below the
  minimum with no placeholder, no new request or network call, the switch saving like the others, the member's own preview showing
  the same card with a line saying where it stands, and the header line on the profile, in the preview and on a member's view of
  another member never promising a summary that is not on the page). The database side is `sharpeningShare.db.test.ts`: off by default and for every
  profile that existed before the migration, a flag and nothing else stored, another member able to read the switch but not set it and
  getting no extra case data, both tables refusing `anon` and the signed-out caller with any filter, and `public_person(id)` the only way
  the flag reaches a link holder
- **What to give someone next** (the link holder's summary): the rules (never shared / shared once in interview order, "Other" never
  named, industries they typed themselves counted but never called a gap, their own focus tag with ties broken by the app's skill
  order, coverage only below five shared cases, nothing at all with no shared history) and the visitor's screen (the two lanes and
  their "+ n more", the quiet state, the improvement tag left off the card, nothing for a member who shares nothing, burned cases out
  of the numbers, the member's own profile unchanged, and no request or network call that the page didn't already make)
- **The profile link's register**: both cards read for sentences that interpret, hedge or restate what is already on them (the
  removed caveat, the removed focus block, "chose to show this", "no numbers, no ranking"), and the **What I'm sharpening** switch
  read for a line that says what it writes rather than what it leaves out
- **How I like to meet** (the meeting link and time zone, issue #98): the rule (`meeting.test.ts`: an https address kept exactly as
  it will be passed on, the three rooms named and everything else called a link, a phone number with spaces, dashes and an optional
  `+`, both fields optional, and a refusal with a sentence worth showing for `javascript:`, `data:`, `vbscript:`, `file:`, `tel:`,
  `mailto:`, `http:`, `//host`, a relative path, a bare host, plain text, a link with a space or a newline in it, an HTML anchor and
  a number too short or too long to be a phone number; a zone that must be a real IANA name); the database
  (`meetingPrefs.db.test.ts`: no access at all for `anon` or `authenticated` however the read is shaped, both functions acting only
  on the caller's own row and taking no user id, another member — including a blocked one — a visitor holding a link, a signed-out
  caller and an unverified member all refused, the value absent from every column, projection, profile row and member-facing
  function, with the same search finding it when the reader is allowed to, the 20-a-day limit that clearing the fields does not
  reset, the row gone with the account, and **the same inputs run through the plain function and through the database so the two
  cannot drift apart**); the Supabase wrapper and its in-memory twin; and the screen (the section and its one line about who sees
  it, saving only what the database confirmed, the room named back, hostile input refused without asking the database, a failed save
  keeping what was typed, the browser's zone offered but not stored, hidden in demo mode, and the backup carrying it and putting it
  back)
- **Accounts**: sign-up, verification, resend, expired links, password reset, onboarding with everything off by default
- **Supabase layer**: row mapping that round-trips every field, a repository run against a fake Supabase (paging past 1000 rows, chunked upserts, replace-without-data-loss, errors surfaced), friendly error messages, configuration checks
- **Calculations**: week boundaries, averages that ignore missing ratings, behavioral combining, trend windows, coverage, matrix, weekly history
- **Email notifications**: the setting and the once-only markers in Postgres (private, on by default, own row only, no deletes or anonymous access, cascade on account delete, not part of any profile), the email logic with no live service (who is emailed and who isn't, callers who aren't a party, stale or replayed calls, simultaneous calls, a failed send that can be retried, the details, subjects, plain-text twin and escaping of everything a member typed), the app side (the background call, the setting) and the Profile & privacy switch
- **Messages**: in Postgres (a conversation only opens when a request is accepted, seeded with the proposal, note and reply; one per pair; no direct table access; nobody else can read, write, mark, mute, archive or report; trimming and length limits; unread counts; mute and archive per person and a new message bringing one back; deleting only your own; silent blocks in both directions that also stop requests; the 30-in-10-minutes and 500-a-day limits; reports with a snapshot that survives deletions and can't be read by members or visitors; cascade on user delete; no email columns), the Supabase wrapper, the in-memory twin, and the screens (list, count, opening and reading, Enter and Shift+Enter, errors that keep what you typed, new messages on returning to the tab, delete, mute, archive, block, report, entry points, demo mode)
- **Finding it**: five tabs in both navigation bars with people and messages together under Community (Members and Inbox views, the older `#/requests` and `#/messages` addresses still working), one count on the tab, and the Dashboard's "Needs you" strip (not shown in demo mode)
- **Connected members**: a new request between two members with a conversation is refused by the database (both directions, after the generic refusal, leaving waiting requests alone), and in the app "Case again with …?" sends the case details as a message instead (from the profile and from Find a case; errors keep what you typed; a normal request to someone you aren't connected to is unchanged)
- **Live case**:
  - the clock and the pacing rules (every stage, early finishes, flexible time, the protected closing time at every size of case from no beats to twelve, the hint ladder, drafts and timeouts, the case sized to how much it has to work through, a plan saved under an older rule, and cases with different numbers of exhibits and with or without a brainstorm)
  - where a brainstorm sits (the topic read out of the book's title whatever its numbering, a brainstorm asked before the exhibit the book puts after it, two brainstorms both run and both handed in, the discussion picked up again afterwards, the closing time kept safe for two of them, and the brainstorm still run when the clock ends the discussion first)
  - what a hand-in is answered with (the ideas thanked for in the part of the case that opens next, with that part's own "Good." gone so two greetings do not run together; the recommendation thanked for as the case closes; and nothing of the kind when the clock takes the box away, when the member ends the case while writing, or on a writing stage where there is nothing to be ready for and no part to move on from — six paths in all, one per stage per way out, plus the line read back for the two screens that show none of the conversation)
  - the help ladder of each mode (every rung in practice, interview and learning, an interview that never leads and moves on instead, a message that asks for data costing no rung, a case saved before there were modes counting as practice, what counts as a step forward, so that a message naming no comparison, no figure and no next move no longer resets the rung counter, the member whose every message is scored a half-answer reaching the top of the ladder all the same (the third in a row counts as circling, a half-answer between two real steps does not, a request for data costs no part of the run, and a learner is still never moved on), and what a part of the discussion is worth: the flexible time shared out, a part brought out as the plan runs out led rather than moved on, a case with a brainstorm sharing 3:30 rather than 5:30, and a pause leaving the arithmetic exactly where it was)
  - the interview's own register (a verdict on the member's reading dropped from the reply, the question kept when the two share a sentence, the first rung giving nothing but an acknowledgement and the question back, that acknowledgement pointing at the part rather than at "that", a fact still answered, and practice and learning left as they were)
  - the move-on in every mode (a reply that opens with a verdict and a reply that opens with a verdict and moves on later both read as the move-on line, in practice as well as in an interview, while the reply that already moves on is untouched, and the case moves on either way)
  - what a part with no exhibit says it is about (the topic in the line that opens it, the same in all three modes; the book's numbering taken off in every shape it comes in and a phrase of its own left alone; a question mark kept and a full stop added; a title that holds the finding and a title that names an interviewer-side table both held back; a plan saved before a step carried a topic; nothing of the step but its title reaching the member; the exhibit parts left as they were; and the screen showing the member what the part is and asking how they would work it out)
  - a case that hands over no exhibit at all (the conversation the model reads saying an exhibit was shown only where one really was, on a case with none and on the mixed case where two of three parts handed one over; the stage named as the discussion in the written record and in the stage times, and as the exhibits on a case that has them; every part notice still in that record, named for what it was; and the direction turn promising data in all three modes on a case that has exhibits and in none of them on a case that has not, down to the stand-in reply an interview falls back to)
  - the exhibit as the member sees it (the book's chart with no table that only repeats it, the table kept beside a chart when the book prints one or the chart does not print the figures, no chart where the book drew none or where its kind is one we don't draw, the approximate note (shown with a table, left off with a table that is hidden, and still in the Full solution), and a table bigger than a write-up may hold kept whole and plotted whole)
  - **the whole of the write-up reaching the member** (what a cap cut, measured write-up against render and told apart from text cut to length, in `src/domain/exhibitFidelity.test.ts`; the note on the exhibit when something was cut and silence when nothing was; and `src/data/liveExhibitCaps.test.ts`, which sends an oversized exhibit through the real `readExhibits` and then through the screen so that the Edge Function's caps and the parser's cannot drift apart)
  - the rule that decides when a table repeats its chart (`src/domain/liveExhibit.test.ts`)
  - the progress strip (which step is marked in a case with a brainstorm, with several, with none at all, in a case that hands over no exhibit and in a learning case with no clock; a brainstorm already handed in staying behind the member while the discussion is picked up again; the discussion left open while a mid-case brainstorm runs, including the cases whose brainstorm comes before any part of the discussion, and filled in when the brainstorm is reached with every part worked; the whole plan of exhibit, brainstorm, exhibit, step, exhibit walked from the prompt to the end, where no part ever loses ground; the four states drawn four different ways, three of them with a mark as well as a fill, and each state read out in its own words to a screen reader; and the whole case behind them once it is over)
  - the coach layer with a fake model (what each reply may see, replies that leak or arrive late, drafts colliding with the end of the case, feedback that must quote the member)
  - the sessions table and case list in Postgres (closed to every API role, one running case each, the catalogue releasing nothing about what a case holds)
  - the case-log entry
  - and the whole screen from prompt to logged case
- **Practice requests**: in Postgres (open to every listed, verified member and no one else, private to the two people, no direct table access, one waiting per pair, the 5-waiting and 20-a-day limits, silent blocks that can be undone, length limits, nothing readable by visitors, cascade on user delete), the Supabase wrapper, and the screens (nothing to switch on, asking, prefilled from Find a case, answering with a reply, declining and blocking, the badge, cancelling, errors, demo mode)
- **Delete account**: in Postgres (a member with data in every table is removed completely: login, profile and public copies, cases, lists, goal, Warm-up record, requests, blocks, conversations, messages; everyone else untouched; the other person loses the conversation; a report stays but no longer points at the person; the confirmation word is required, a member can only delete themselves, visitors and signed-out callers can't, and a second call is harmless), the Supabase wrapper (asks the database, then ends only this browser's session; a failure changes nothing), and the screen (the Danger zone, what is listed before you confirm, typing `DELETE`, signing out to the public page, forgetting the member on this device but keeping the theme, a failed deletion keeping everything and allowing a retry, off in demo mode)
- **Warm-up**: question generation for all fifteen kinds (seeded, so repeatable; each answer is recomputed from its own wording, the rule-of-72 answers are accepted, and no question repeats too soon), answer reading and the 5% tolerance (including `%`, years and months), scoring, the three round lengths and a best for each (including how an older single record is read); the record in Postgres (own row only, no direct writes, raise-only, no visitor access, cascade on user delete); syncing between the account and this device (offline, first sign-in on a shared browser, demo mode); and the screen (timer, streaks, tips after a miss, end of round)
- **Rules**: milestones, suggestions (including "stays silent with too little data"), improvement areas, knowledge filtering, case-log search / filter / sort
- **Bucket**: what is sent (writing only, newest first, never titles, partners or other notes, cut to length, bounded in total), the prompt, what is accepted back (right shape, at most three of each, an unknown skill dropped, anything else refused), the whole request (stored answer returned without asking, a few-minutes limit on changed feedback, a refusal or cut-off or bad answer or network error leaving the stored read alone), the stored table's database rules (own row only, no writes by members, one row each, goes with the account), and the card (what it says it sends, nothing until you click, the scope choice, a stored read shown on return with a note when cases changed, each way a read can fail, hidden in demo mode)
- **Casebook library**: the search (every word must match, exact then starting matches then co-chair picks then newer books, capped), what picking a case fills in, the screen (suggestions on the title as you type it, nothing until you type, keyboard picking, no surprise pick or submit on Enter, Escape closing only the list, nothing for one letter or no match or a failed lookup, not suggesting a title you just picked, removing the link, a plain box when editing or in demo mode), the link kept on a case, the library database rules (verified members only, the analysis table unreadable by every role, our analysis released only to a member who logged the case and never because someone else did, not writable, the link cleared when a case is removed) the matching (`libraryMatching.db.test.ts`, `libraryMatch.test.ts`, `MatchCases.test.tsx`: the name key agreeing across the database, the loader and the app; the source rules; the backfill linking only sure matches and changing nothing else; the review listing only your own cases and never our analysis; the banner, the sure and maybe defaults, updating or only linking, cancelling) and the loader (apostrophes, running again, all or nothing, one entry per name with Booth first then the newest book whatever the file order, listed-only cases, a half-written analysis refused, an earlier copy folded in with the link moved across)
- **Exhibit charts** (`src/features/caselog/ExhibitChart.test.tsx`, the drawing the Full solution and the Live case share): every chart kind drawn, the key, the colours the book gives a series, dashed reference lines and highlighted bars, wrapped category names and footnotes broken into lines, several panels to an exhibit; **where each label lands, measured against the plot's own edges** rather than that the chart renders (a 100% bar on a percentage chart, a bar at a nice axis maximum, a bar too short to hold its label, a line's point and a scatter point at the top of the axis, the longest sideways bar and the last number on its axis, with the shorter bars' labels left where they were); and a chart wider than the card saying it can be swiped, only while there is more of it to the right
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
member-search checks need that), which is a few minutes. (A member can delete their whole account from Settings; the live checks don't use that,
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
- Anything a member shows through their profile link can be read, copied and scraped by whoever holds the link, and can't be recalled once copied. That is why it is opt-in, off by default, confirmed, and excludes written text. Nobody can page through members any more (the tables are closed to every API role), but a link can be passed on, and the member ID in it is permanent: switching the link off is the only way to cut it.
- Per-case settings other than "private" (name only, full) also apply to anyone with the link once it is on; "private" is the only per-case way to hide a case from everyone.
- The People directory shows listed members alphabetically (first 50 per search); there is no pagination or profile photo.
- CAPTCHA is recommended for public sign-up but isn't wired in yet (see Set it up, step 2).
