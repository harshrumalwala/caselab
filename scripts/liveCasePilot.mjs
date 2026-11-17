// Drives a real live case against the DEPLOYED `live-case` Edge Function, turn by turn, and says what it costs as it goes.
//
// THIS SPENDS REAL MONEY. Every `say`, `nudge` and `finish` is a real model call on the owner's Anthropic key. The cap is $2.00 by
// default (the owner's figure for the pilot) and is checked BEFORE a call is made, never after. Nothing here judges a reply: the script
// records exactly what the member would have seen, and the person running the pilot reads it.
//
//   npm run pilot:live -- catalog --book "Booth MCG"            # which cases can be practised (no model call)
//   npm run pilot:live -- start --case <libraryId> --mode interview
//   npm run pilot:live -- turn --say "Can I check what the client means by growth?"
//   npm run pilot:live -- turn --next
//   npm run pilot:live -- turn --finish
//   npm run pilot:live -- play --script ../my-candidate.json    # a whole case unattended, under the same cap
//   npm run pilot:live -- spend                                 # what has been spent (no model call)
//
// A TRANSCRIPT HOLDS THE BOOK'S OWN CONTENT. Transcripts are written to `reports/pilot/` (inside the git-ignored `/reports/`) and hold
// the case prompt, the book's exhibits in full and the coach's words. Never paste one, or any part of one, into an issue, a pull request,
// a commit or a message. They stay on the machine that ran the pilot.
//
// What this script is not: it never imports `supabase/functions/**` to decide anything (it is a client, like the app), it never sends the
// `logged` action, and it never writes to `cases`. The sessions it creates are the pilot's evidence and stay in the database.
//
// Spend is READ, not estimated: `live_case_sessions` has no API access, so usage comes from the Supabase CLI
// (`npx supabase db query --remote --read-only`), which needs a linked `supabase/` folder (`npx supabase link`). Pass
// `--workdir <path>` when that folder is somewhere else (a git worktree has none).
//
// Plain Node: no TypeScript is imported, so any Node that runs the app runs this.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Transcripts live here, inside the git-ignored `/reports/`. */
export const PILOT_DIR = 'reports/pilot';
/** The owner's cap on the whole pilot, in dollars. */
export const DEFAULT_CAP = 2;
/**
 * The deployed function's own limits, mirrored rather than imported so this script stays plain JavaScript
 * (`supabase/functions/_shared/liveCaseCoach.ts`). `src/data/liveCasePilot.test.ts` fails if they ever drift apart.
 */
export const MAX_STARTS_PER_DAY = 4;
export const MAX_STARTS_PER_WEEK = 12;

export const ACCOUNTS = ['a', 'b'];
export const MODES = ['practice', 'interview', 'learning'];
/** Everything one `turn` can do. `logged` is deliberately absent: the pilot never logs a case. */
export const TURN_ACTIONS = ['ready', 'say', 'submit', 'next', 'nudge', 'finish', 'end'];
/** The three actions that cost money. Everything else only moves the session on. */
export const MODEL_ACTIONS = ['say', 'nudge', 'finish'];
export const callsModel = (action) => MODEL_ACTIONS.includes(action);

const DAY_MS = 24 * 60 * 60 * 1000;

export const TRANSCRIPT_WARNING =
  "This transcript holds the book's own case prompt and exhibits, word for word. Never paste it, or any part of it, into an issue, a pull request, a commit or a message.";

// ---------------------------------------------------------------------------------------------------------------------------
// Credentials: two git-ignored files, parsed here because the repo has no dotenv
// ---------------------------------------------------------------------------------------------------------------------------

/** `KEY=value` a line at a time: `export ` prefixes, quotes, trailing comments, and blank or commented lines. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    let key = line.slice(0, eq).trim();
    if (key.startsWith('export ')) key = key.slice('export '.length).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    const quoted = value.length > 1 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);
    else {
      const comment = value.indexOf(' #');
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * The project and the throwaway account to sign in as, from the text of the two files. A missing value is named, with the file it belongs
 * in, rather than left to fail at the first request. A key that looks like a secret is refused outright, the same rule the app applies
 * (`src/data/backend.ts`).
 */
export function credentialsFrom(localText, e2eText, account = 'a') {
  const which = String(account || 'a').toLowerCase();
  if (!ACCOUNTS.includes(which)) throw new Error(`Unknown account "${account}". Choose one of: ${ACCOUNTS.join(', ')}.`);
  const local = parseEnvFile(localText);
  const e2e = parseEnvFile(e2eText);
  const suffix = which.toUpperCase();
  const wanted = [
    ['VITE_SUPABASE_URL', local.VITE_SUPABASE_URL, '.env.local'],
    ['VITE_SUPABASE_PUBLISHABLE_KEY', local.VITE_SUPABASE_PUBLISHABLE_KEY, '.env.local'],
    [`CASELAB_E2E_EMAIL_${suffix}`, e2e[`CASELAB_E2E_EMAIL_${suffix}`], '.env.e2e.local'],
    [`CASELAB_E2E_PASSWORD_${suffix}`, e2e[`CASELAB_E2E_PASSWORD_${suffix}`], '.env.e2e.local'],
  ];
  const missing = wanted.filter(([, value]) => !value).map(([name, , file]) => `${name} in ${file}`);
  if (missing.length > 0) {
    throw new Error(
      `The pilot needs ${missing.join(', ')}. Both files are git-ignored: .env.local holds the two public VITE_ values, ` +
        '.env.e2e.local holds the throwaway accounts (see README, "Live checks against the real project").',
    );
  }
  const key = wanted[1][1];
  if (key.startsWith('sb_secret_') || /service_role/i.test(key)) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY looks like a secret key. The pilot signs in as a member; use the publishable key.');
  }
  return { account: which, url: wanted[0][1], key, email: wanted[2][1], password: wanted[3][1] };
}

/** The same, reading the two files from disk. A missing file reads as an empty one, so the error names what is missing. */
export function readCredentials(account = 'a', root = ROOT) {
  const read = (name) => (existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : '');
  return credentialsFrom(read('.env.local'), read('.env.e2e.local'), account);
}

// ---------------------------------------------------------------------------------------------------------------------------
// What the tokens cost
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Dollars per million tokens for the models the deployed function uses. No `ANTHROPIC_MODEL`, `ANTHROPIC_COACH_MODEL` or
 * `ANTHROPIC_FEEDBACK_MODEL` secret is set on the project (checked 2026-11-16), so the code defaults apply: Haiku for the coach's replies,
 * Sonnet for the feedback. Input, output and the Sonnet cache-read rate are exact; the two cache-write rates (about 1.25x input) and the
 * Haiku cache-read rate (about 0.1x input) are conventional approximations, which is why every total printed says so.
 */
export const PRICES = {
  haiku: { model: 'claude-haiku-5-5', tier: 'prompt up to 100K', input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  haikuLong: { model: 'claude-haiku-5-5', tier: 'prompt over 100K', input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
  sonnet: { model: 'claude-sonnet-5-5', tier: 'one tier', input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
};

/** Where the higher Haiku tier starts, counted over the prompt (input plus what was read from the cache). */
export const LONG_PROMPT_TOKENS = 100_000;

export const APPROXIMATE_NOTE =
  'Approximate: the two cache-write rates (about 1.25x input) and the Haiku cache-read rate (about 0.1x input) are conventional, not published figures. Input, output and the Sonnet cache-read rate are exact.';

export const ATTRIBUTION_NOTE =
  'Stored usage is one running total per session and does not say which model each call used, so every turn is priced at the coach model (Haiku) except a `finish` turn, which is priced at the feedback model (Sonnet).';

export const EMPTY_USAGE = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Whatever the database held, as a usage record: every field a number, nothing missing. */
export function readUsage(value) {
  const o = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  return {
    calls: n(o.calls),
    inputTokens: n(o.inputTokens),
    outputTokens: n(o.outputTokens),
    cacheReadTokens: n(o.cacheReadTokens),
    cacheWriteTokens: n(o.cacheWriteTokens),
  };
}

/** What one turn added, field by field. Never negative: a reading that goes backwards counts as nothing added. */
export function usageDelta(before, after) {
  const b = readUsage(before);
  const a = readUsage(after);
  const d = (key) => Math.max(0, a[key] - b[key]);
  return {
    calls: d('calls'),
    inputTokens: d('inputTokens'),
    outputTokens: d('outputTokens'),
    cacheReadTokens: d('cacheReadTokens'),
    cacheWriteTokens: d('cacheWriteTokens'),
  };
}

export function addUsage(a, b) {
  const x = readUsage(a);
  const y = readUsage(b);
  return {
    calls: x.calls + y.calls,
    inputTokens: x.inputTokens + y.inputTokens,
    outputTokens: x.outputTokens + y.outputTokens,
    cacheReadTokens: x.cacheReadTokens + y.cacheReadTokens,
    cacheWriteTokens: x.cacheWriteTokens + y.cacheWriteTokens,
  };
}

/** Dollars for a usage record at one row of the table. */
export function priceUsage(usage, rates) {
  const u = readUsage(usage);
  return (u.inputTokens * rates.input + u.outputTokens * rates.output + u.cacheReadTokens * rates.cacheRead + u.cacheWriteTokens * rates.cacheWrite) / 1_000_000;
}

/**
 * What one turn cost. The feedback call is the one call `finish` makes, so a `finish` turn is priced at Sonnet and everything else at
 * Haiku. A turn whose prompt (input plus cache reads) passes 100,000 tokens is priced at the higher Haiku tier and flagged; when the turn
 * made more than one call the threshold cannot be attributed to a single prompt, so `tierCertain` is false and the flag is printed with
 * "single-call turns only".
 */
export function priceTurn(delta, { finish = false } = {}) {
  const used = readUsage(delta);
  const prompt = used.inputTokens + used.cacheReadTokens;
  const overThreshold = prompt > LONG_PROMPT_TOKENS;
  const rates = finish ? PRICES.sonnet : overThreshold ? PRICES.haikuLong : PRICES.haiku;
  return {
    usd: priceUsage(used, rates),
    model: rates.model,
    tier: rates.tier,
    overThreshold,
    /** False when the turn made more than one call: the 100K threshold is about one prompt, and a running total cannot split it. */
    tierCertain: used.calls <= 1,
    promptTokens: prompt,
    approximate: true,
  };
}

/** Dollars, to the cent where that is the whole of it and to four places where the fractions of a cent matter. */
export const usd = (n) => {
  const value = Math.round((Number(n) || 0) * 10000) / 10000;
  return `$${(Math.abs(value - Math.round(value * 100) / 100) < 1e-9 ? value.toFixed(2) : value.toFixed(4))}`;
};

// ---------------------------------------------------------------------------------------------------------------------------
// The cap, checked before the call
// ---------------------------------------------------------------------------------------------------------------------------

export const RESERVE_FLOOR = 0.05;
/** A `finish` is a Sonnet call over the whole transcript, so it reserves more. */
export const FINISH_RESERVE_FLOOR = 0.25;

/** What the next call might cost: the dearest turn of this pilot so far, never less than the floor for this kind of action. */
export function reserveFor(action, largestTurnUsd = 0) {
  const floor = action === 'finish' ? FINISH_RESERVE_FLOOR : RESERVE_FLOOR;
  return Math.max(floor, Number(largestTurnUsd) || 0);
}

/**
 * Whether the next action may be taken. An action that calls no model is always allowed; one that does is allowed only while what has
 * been spent plus the reserve still fits inside the cap. This is asked before the request is sent, so the cap can never be crossed by a
 * call that has already happened.
 */
export function capDecision({ action, spentUsd = 0, largestTurnUsd = 0, cap = DEFAULT_CAP }) {
  const spent = Number(spentUsd) || 0;
  if (!callsModel(action)) {
    return { allowed: true, action, reserve: 0, spent, projected: spent, cap, message: `${action} makes no model call: nothing is reserved.` };
  }
  const reserve = reserveFor(action, largestTurnUsd);
  const projected = spent + reserve;
  const allowed = projected <= cap;
  return {
    allowed,
    action,
    reserve,
    spent,
    projected,
    cap,
    message: allowed
      ? `${usd(spent)} spent, ${usd(reserve)} reserved for this ${action}: ${usd(projected)} of the ${usd(cap)} cap.`
      : `Stopped before the call. ${usd(spent)} spent plus ${usd(reserve)} reserved for this ${action} would reach ${usd(projected)}, over the ${usd(cap)} cap. ` +
        `Raise it with --cap <usd> only if the owner has said so. ${APPROXIMATE_NOTE}`,
  };
}

/** The dearest single turn of this pilot so far, over every transcript. */
export function largestTurnCost(transcripts) {
  let most = 0;
  for (const t of transcripts ?? []) {
    for (const turn of t?.turns ?? []) {
      const value = Number(turn?.cost?.usd) || 0;
      if (value > most) most = value;
    }
  }
  return most;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Reading the sessions: the table has no API access, so this goes through the Supabase CLI
// ---------------------------------------------------------------------------------------------------------------------------

export const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? ''));

/** The CLI prints a line of its own and then a JSON envelope with the rows inside it. */
export function parseQueryRows(stdout) {
  const text = String(stdout ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`The database query printed no JSON:\n${text.trim().slice(0, 500)}`);
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    throw new Error(`The database query printed something that is not JSON (${error instanceof Error ? error.message : String(error)}):\n${text.trim().slice(0, 500)}`);
  }
  if (parsed && parsed.error) throw new Error(`The database query failed: ${parsed.error.message ?? JSON.stringify(parsed.error)}`);
  if (!Array.isArray(parsed?.rows)) throw new Error(`The database query returned no rows array:\n${text.trim().slice(0, 500)}`);
  return parsed.rows;
}

const quoteArg = (value) => (/[\s"]/.test(value) ? `"${String(value).replace(/"/g, '\\"')}"` : String(value));

/**
 * One read-only query against the linked project, through the CLI. The SQL goes in a temporary file so no shell has to quote it, and the
 * file is removed again. On Windows `npx` is a `.cmd`, which Node will only start through a shell, so the command is built as one string
 * there.
 */
export function runQuery(sql, { workdir = ROOT, run = spawnSync } = {}) {
  const file = join(tmpdir(), `caselab-pilot-${randomUUID()}.sql`);
  writeFileSync(file, sql, 'utf8');
  try {
    const args = ['supabase', 'db', 'query', '--remote', '--read-only', '--workdir', workdir, '--file', file];
    const result =
      process.platform === 'win32'
        ? run(`npx ${args.map(quoteArg).join(' ')}`, { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        : run('npx', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.error) throw new Error(`Could not run the Supabase CLI: ${result.error.message}`);
    if (result.status !== 0) {
      throw new Error(`The Supabase CLI refused the query (exit ${result.status}). Is this folder linked to the project (npx supabase link), or pass --workdir?\n${String(result.stderr ?? '').trim().slice(0, 500)}`);
    }
    return parseQueryRows(result.stdout);
  } finally {
    rmSync(file, { force: true });
  }
}

/** Every session of one member, with its running usage. Only this member's rows: the pilot never reads anyone else's. */
export function sessionsSql(userId) {
  if (!isUuid(userId)) throw new Error(`"${userId}" is not a user id.`);
  return (
    "select id::text as id, library_id::text as library_id, status, state->'usage' as usage, state->>'mode' as mode, " +
    `created_at from public.live_case_sessions where user_id = '${userId}' order by created_at`
  );
}

/** The whole state of one of this member's sessions: how the ladder ran is in `beats` and `stageLog`, and the view never shows it. */
export function sessionStateSql(userId, sessionId) {
  if (!isUuid(userId)) throw new Error(`"${userId}" is not a user id.`);
  if (!isUuid(sessionId)) throw new Error(`"${sessionId}" is not a session id.`);
  return `select state, feedback, actions, llm_calls from public.live_case_sessions where user_id = '${userId}' and id = '${sessionId}'`;
}

export function readSessionRows(rows) {
  return (rows ?? []).map((r) => ({
    id: String(r.id ?? ''),
    libraryId: String(r.library_id ?? ''),
    status: String(r.status ?? ''),
    mode: r.mode ? String(r.mode) : '',
    usage: readUsage(r.usage),
    createdAt: r.created_at ? Date.parse(String(r.created_at)) : NaN,
  }));
}

/** How many starts this account has left, by the deployed function's own rolling day and week. */
export function startsLeft(sessions, now = Date.now()) {
  const times = (sessions ?? []).map((s) => (typeof s.createdAt === 'number' ? s.createdAt : Date.parse(String(s.createdAt)))).filter((t) => Number.isFinite(t));
  const today = times.filter((t) => t > now - DAY_MS).length;
  const week = times.filter((t) => t > now - 7 * DAY_MS).length;
  const leftToday = Math.max(0, MAX_STARTS_PER_DAY - today);
  const leftWeek = Math.max(0, MAX_STARTS_PER_WEEK - week);
  return {
    today,
    week,
    leftToday,
    leftWeek,
    allowed: leftToday > 0 && leftWeek > 0,
    message:
      leftToday === 0
        ? `This account has started ${today} live cases in the last 24 hours, which is the limit of ${MAX_STARTS_PER_DAY} a day. Use the other account or come back tomorrow.`
        : leftWeek === 0
          ? `This account has started ${week} live cases in the last 7 days, which is the limit of ${MAX_STARTS_PER_WEEK} a week. Use the other account or come back next week.`
          : `${leftToday} start${leftToday === 1 ? '' : 's'} left today (${today} of ${MAX_STARTS_PER_DAY} used), ${leftWeek} left this week.`,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------------------------------------------------------

const slug = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'case';

/** One file per run, named so the account, the case and the moment are readable in the folder listing. */
export function transcriptName({ account, caseName, mode, startedAt }) {
  const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-').replace(/z$/i, 'Z');
  return `${account}-${slug(caseName)}-${mode}-${stamp}.json`;
}

export function newTranscript({ account, userId, sessionId, libraryId, caseName, book, mode, cap, startedAt }) {
  return {
    warning: TRANSCRIPT_WARNING,
    version: 1,
    account,
    userId,
    sessionId,
    libraryId,
    caseName,
    book,
    mode,
    cap,
    startedAt: new Date(startedAt).toISOString(),
    turns: [],
    finalView: null,
    finalState: null,
  };
}

export function readTranscripts(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const path = join(dir, name);
    try {
      out.push({ path, data: JSON.parse(readFileSync(path, 'utf8')) });
    } catch {
      // A half-written file is not the pilot's evidence; it is skipped rather than allowed to stop a run.
    }
  }
  return out.sort((a, b) => String(a.data?.startedAt ?? '').localeCompare(String(b.data?.startedAt ?? '')));
}

/** The newest transcript this account wrote, which is the run a bare `turn` acts on. */
export function latestTranscript(transcripts, account) {
  const mine = (transcripts ?? []).filter((t) => t.data?.account === account);
  return mine.length > 0 ? mine[mine.length - 1] : null;
}

export const writeTranscript = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

// ---------------------------------------------------------------------------------------------------------------------------
// What was spent
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Dollars per session and for the pilot. A session with a transcript is priced turn by turn (so its `finish` is priced at Sonnet); usage
 * the transcripts do not account for — a session started by hand, or a call that landed after the last reading — is priced at the coach
 * model and reported separately, because that is the cheaper model and the figure could therefore be low.
 */
export function spendReport(sessions, transcripts) {
  const bySession = new Map();
  for (const t of transcripts ?? []) {
    const id = t?.sessionId;
    if (!id) continue;
    const got = bySession.get(id) ?? { turns: 0, usd: 0, usage: EMPTY_USAGE, caseName: '', mode: '' };
    for (const turn of t.turns ?? []) {
      if (!turn?.cost) continue;
      got.turns += 1;
      got.usd += Number(turn.cost.usd) || 0;
      got.usage = addUsage(got.usage, turn.usage?.delta);
    }
    got.caseName = got.caseName || String(t.caseName ?? '');
    got.mode = got.mode || String(t.mode ?? '');
    bySession.set(id, got);
  }
  const rows = (sessions ?? []).map((s) => {
    const known = bySession.get(s.id);
    const attributedUsd = known?.usd ?? 0;
    const unattributed = usageDelta(known?.usage ?? EMPTY_USAGE, s.usage);
    const unattributedUsd = priceUsage(unattributed, PRICES.haiku);
    return {
      id: s.id,
      caseName: known?.caseName ?? '',
      mode: s.mode || known?.mode || '',
      status: s.status,
      usage: s.usage,
      turns: known?.turns ?? 0,
      hasTranscript: Boolean(known),
      attributedUsd,
      unattributed,
      unattributedUsd,
      usd: attributedUsd + unattributedUsd,
    };
  });
  return {
    sessions: rows,
    totalUsd: rows.reduce((t, r) => t + r.usd, 0),
    unattributedUsd: rows.reduce((t, r) => t + r.unattributedUsd, 0),
    approximate: true,
  };
}

/**
 * What `spend` will report once this turn is written to disk. A turn that has just happened is in no transcript yet, so a report built
 * from the folder alone drops its tokens into the unattributed bucket and prices them at the coach model — which is how a `finish`
 * turn, whose one call is priced at the feedback model, came to print a running total about twenty times too small (issue #134).
 * Handing the turn to `spendReport` before the total is taken keeps the figure printed after a turn and the figure `spend` prints
 * afterwards the same number: both are `spendReport` over the same turns, each priced by the same `priceTurn`.
 */
export function spendWithTurn({ sessions, transcripts, sessionId, turn }) {
  const stored = transcripts ?? [];
  return spendReport(sessions, turn?.cost ? [...stored, { sessionId, turns: [turn] }] : stored);
}

export function formatPriceTable() {
  const row = (label, p) => `  ${label.padEnd(30)} in ${String(p.input).padStart(5)}   out ${String(p.output).padStart(5)}   cache read ${String(p.cacheRead).padStart(5)}   cache write ${String(p.cacheWrite).padStart(5)}`;
  return [
    'Dollars per million tokens:',
    row('claude-haiku-5-5 (<=100K)', PRICES.haiku),
    row('claude-haiku-5-5 (>100K)', PRICES.haikuLong),
    row('claude-sonnet-5-5', PRICES.sonnet),
    `  ${APPROXIMATE_NOTE}`,
    `  ${ATTRIBUTION_NOTE}`,
  ].join('\n');
}

export function formatSpend(report, { cap = DEFAULT_CAP } = {}) {
  const lines = [`Spent so far: ${usd(report.totalUsd)} of the ${usd(cap)} cap (approximate).`, ''];
  if (report.sessions.length === 0) lines.push('No sessions for this account yet.');
  for (const s of report.sessions) {
    lines.push(`${s.id}  ${s.caseName || '(case not in a transcript)'}  ${s.mode || '(mode unknown)'}  ${s.status}`);
    lines.push(
      `  calls ${s.usage.calls}   input ${s.usage.inputTokens}   output ${s.usage.outputTokens}   cache read ${s.usage.cacheReadTokens}   cache write ${s.usage.cacheWriteTokens}`,
    );
    lines.push(
      `  ${usd(s.usd)} = ${usd(s.attributedUsd)} over ${s.turns} recorded turn${s.turns === 1 ? '' : 's'} + ${usd(s.unattributedUsd)} not in any transcript, priced at coach (Haiku) rates`,
    );
  }
  lines.push('');
  if (report.unattributedUsd > 0) {
    lines.push(`${usd(report.unattributedUsd)} of the total is usage no transcript accounts for. It is priced at the cheaper model, so the real figure can only be higher.`);
  }
  lines.push(formatPriceTable());
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------------
// A script of steps
// ---------------------------------------------------------------------------------------------------------------------------

const STEP_FIELDS = ['do', 'text', 'repeat', 'stage'];

/**
 * Reads a candidate script: a JSON array of steps, each `{ "do": "say", "text": "..." }`, optionally with `"repeat": n` and an expected
 * `"stage"`. Everything is checked here, before a single call is made, so a typo costs nothing.
 */
export function readScriptSteps(json) {
  if (!Array.isArray(json)) {
    throw new Error('A script is a JSON array of steps, for example [{ "do": "ready" }, { "do": "say", "text": "Who is the client?" }].');
  }
  const steps = [];
  json.forEach((raw, i) => {
    const at = `step ${i + 1}`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${at} is not an object.`);
    const unknown = Object.keys(raw).filter((k) => !STEP_FIELDS.includes(k));
    if (unknown.length > 0) throw new Error(`${at}: unknown field${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}. A step takes ${STEP_FIELDS.join(', ')}.`);
    const what = raw.do;
    if (typeof what !== 'string' || !TURN_ACTIONS.includes(what)) throw new Error(`${at}: "${String(what)}" is not one of ${TURN_ACTIONS.join(', ')}.`);
    const needsText = what === 'say' || what === 'submit';
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (needsText && !text) throw new Error(`${at}: "${what}" needs "text" (what the candidate writes).`);
    if (!needsText && raw.text !== undefined) throw new Error(`${at}: "${what}" takes no "text".`);
    const repeat = raw.repeat === undefined ? 1 : raw.repeat;
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > 50) throw new Error(`${at}: "repeat" is a whole number from 1 to 50.`);
    if (raw.stage !== undefined && typeof raw.stage !== 'string') throw new Error(`${at}: "stage" is the stage this step expects, as text.`);
    for (let n = 0; n < repeat; n += 1) {
      steps.push({ do: what, ...(needsText ? { text } : {}), ...(raw.stage ? { stage: raw.stage } : {}), from: i + 1 });
    }
  });
  if (steps.length === 0) throw new Error('The script has no steps.');
  return steps;
}

/**
 * Which stages each action belongs to. This is the same knowledge `playCase` in `scripts/liveCaseDryRun.mjs` encodes about where a case
 * wants which action, written out again rather than shared: the free harness is not worth disturbing for this, and here it is only a
 * guard that stops an unattended run rather than a thing that drives one.
 */
export const STAGES_FOR = {
  ready: ['prompt', 'framework_think', 'brainstorm_think', 'recommend_think'],
  say: ['prompt', 'framework_write', 'exhibits'],
  submit: ['framework_write', 'brainstorm_write', 'recommend_write'],
  next: ['exhibits'],
  nudge: ['prompt', 'framework_write', 'exhibits'],
  finish: ['done'],
  end: ['prompt', 'framework_think', 'framework_write', 'exhibits', 'brainstorm_think', 'brainstorm_write', 'recommend_think', 'recommend_write'],
};

/** Why this step does not belong where the case now stands, or null when it does. An unattended run stops rather than improvising. */
export function stepFitsStage(step, view) {
  const stage = String(view?.stage ?? '');
  if (step.stage && step.stage !== stage) return `the step expected stage ${step.stage} and the case is at ${stage}`;
  const allowed = STAGES_FOR[step.do] ?? [];
  if (!allowed.includes(stage)) return `"${step.do}" belongs at ${allowed.join(', ')} and the case is at ${stage}`;
  if ((step.do === 'say' || step.do === 'nudge') && stage === 'framework_write' && view?.frameworkPhase !== 'direction') {
    return `"${step.do}" has nothing to answer while the framework is being written: the case takes "submit" here`;
  }
  return null;
}

export const actionFor = (step, sessionId) => {
  switch (step.do) {
    case 'say':
      return { type: 'say', sessionId, text: step.text };
    case 'submit':
      return { type: 'submit', sessionId, text: step.text };
    case 'ready':
    case 'next':
    case 'nudge':
    case 'finish':
    case 'end':
      return { type: step.do, sessionId };
    default:
      throw new Error(`"${String(step.do)}" is not one of ${TURN_ACTIONS.join(', ')}.`);
  }
};

// ---------------------------------------------------------------------------------------------------------------------------
// What the member would have seen
// ---------------------------------------------------------------------------------------------------------------------------

/** What arrived since the last turn: messages by id, exhibits by the beat they belong to and their title. */
export function diffView(previous, next) {
  const seen = new Set((previous?.messages ?? []).map((m) => m.id));
  const had = new Set((previous?.exhibits ?? []).map((e) => `${e.beat}|${e.title}`));
  return {
    messages: (next?.messages ?? []).filter((m) => !seen.has(m.id)),
    exhibits: (next?.exhibits ?? []).filter((e) => !had.has(`${e.beat}|${e.title}`)),
  };
}

export function formatClock(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return 'no clock';
  if (value <= 0) return 'run out';
  const seconds = Math.round(value / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/** The chart's kind and the names of what it plots, never the whole object: the figures are in the table above it. */
export function chartSummary(chart) {
  if (!chart || typeof chart !== 'object' || Array.isArray(chart)) return 'none';
  const names = (list) => (Array.isArray(list) ? list.map((s) => (s && typeof s === 'object' && s.name ? String(s.name) : '(unnamed)')) : []);
  const series = names(chart.series);
  const panels = Array.isArray(chart.panels) ? chart.panels : [];
  const parts = [String(chart.kind ?? '(no kind)')];
  if (series.length > 0) parts.push(`series: ${series.join(', ')}`);
  if (panels.length > 0) parts.push(`${panels.length} panel${panels.length === 1 ? '' : 's'}: ${panels.map((p) => `${String(p?.kind ?? '?')} (${names(p?.series).join(', ') || 'no named series'})`).join('; ')}`);
  return parts.join(' — ');
}

/** One exhibit as the member receives it: every heading, every row, the approximate flag and what chart is drawn from it. */
export function formatExhibit(exhibit) {
  const columns = Array.isArray(exhibit?.columns) ? exhibit.columns : [];
  const rows = Array.isArray(exhibit?.rows) ? exhibit.rows : [];
  const lines = [`  beat ${Number(exhibit?.beat ?? 0) + 1}: ${exhibit?.title || '(no title)'}${exhibit?.approx ? '   [approx: figures read off a chart]' : ''}`];
  if (exhibit?.caption) lines.push(`    caption: ${exhibit.caption}`);
  if (columns.length > 0) lines.push(`    ${columns.join(' | ')}`);
  for (const row of rows) lines.push(`      ${(Array.isArray(row) ? row : [row]).join(' | ')}`);
  if (columns.length === 0 && rows.length === 0) lines.push('    (no table)');
  lines.push(`    chart: ${chartSummary(exhibit?.chart)}`);
  return lines.join('\n');
}

/** The one line that says where the case stands. */
export function formatStageLine(view) {
  if (!view) return 'no view returned';
  const now = Number(view.serverNow) || Date.now();
  const stage = view.stage === 'framework_write' ? `framework_write (${view.frameworkPhase})` : view.stage;
  const stageClock = view.stage === 'done' ? 'over' : formatClock(Number(view.stageEndsAt) - now);
  const caseClock = view.stage === 'done' ? 'over' : formatClock(Number(view.endsAt) - now);
  return `stage ${stage} · beats ${view.beatsShown}/${view.beatsTotal} · stage clock ${stageClock} · case clock ${caseClock} · mode ${view.mode} · ${view.status}${view.endReason ? ` (${view.endReason})` : ''}`;
}

/** Everything one turn produced, in a form that reads in a terminal. */
export function formatTurn({ n, step, response, diff, cost, spentUsd, cap }) {
  const lines = [`-- turn ${n} · ${step.do}${step.text ? ` · "${step.text}"` : ''} ${'-'.repeat(20)}`];
  if (response?.status === 'refused' || response?.status === 'failed') lines.push(`${response.status}: ${response.message}`);
  const view = response?.view ?? null;
  lines.push(formatStageLine(view));
  const messages = diff?.messages ?? [];
  lines.push(`messages since the last turn (${messages.length}):`);
  for (const m of messages) lines.push(`  [${m.from} · ${m.kind}] ${m.text}`);
  const exhibits = diff?.exhibits ?? [];
  lines.push(`exhibits handed over since the last turn (${exhibits.length}):`);
  for (const e of exhibits) lines.push(formatExhibit(e));
  if (view?.feedback) lines.push('feedback has arrived and is in the transcript (not printed: it is long).');
  if (cost) {
    const tier = cost.overThreshold ? ` · over ${LONG_PROMPT_TOKENS.toLocaleString('en-US')} prompt tokens, priced at the higher tier${cost.tierCertain ? '' : ' (single-call turns only: this turn made several calls, so the tier is a guess)'}` : '';
    lines.push(`spend: this turn ${usd(cost.usd)} at ${cost.model} rates${tier} · ${usd(spentUsd)} of the ${usd(cap)} cap · approximate`);
  } else {
    lines.push(`spend: no model call · ${usd(spentUsd)} of the ${usd(cap)} cap · approximate`);
  }
  return lines.join('\n');
}

/** What goes in the transcript for one turn: the new messages and exhibits in full, and where the case stood, but not the whole view. */
export function turnRecord({ n, step, response, diff, usageBefore, usageAfter, cost, spentUsd }) {
  const view = response?.view ?? null;
  return {
    n,
    at: new Date().toISOString(),
    do: step.do,
    ...(step.text ? { text: step.text } : {}),
    status: response?.status ?? 'unknown',
    message: response && 'message' in response ? response.message : null,
    stage: view?.stage ?? null,
    frameworkPhase: view?.frameworkPhase ?? null,
    beatsShown: view?.beatsShown ?? null,
    beatsTotal: view?.beatsTotal ?? null,
    stageEndsAt: view?.stageEndsAt ?? null,
    endsAt: view?.endsAt ?? null,
    serverNow: view?.serverNow ?? null,
    sessionStatus: view?.status ?? null,
    endReason: view?.endReason ?? null,
    newMessages: diff?.messages ?? [],
    newExhibits: diff?.exhibits ?? [],
    usage: { before: readUsage(usageBefore), after: readUsage(usageAfter), delta: usageDelta(usageBefore, usageAfter) },
    cost: cost ?? null,
    spentAfterUsd: spentUsd,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// One step against the deployed function
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Takes one step: checks the cap first, sends the action, reads the spend back, and returns what to print and what to record. Everything
 * it touches is injected (`send`, `readSpend`), so the whole path is exercised in tests without a network or a database.
 *
 * `readSpend` hands back this session's running usage together with the rows and the transcripts a spend report is built from; the
 * running total is `spendWithTurn`, which is `spendReport` with this turn included, so the figure printed here is the figure `spend`
 * prints next. The cap decision for the step after this one is taken against that same total.
 *
 * `state` is { sessionId, view, spentUsd, largestTurnUsd, cap, usage, n }.
 */
export async function runStep(step, state, { send, readSpend }) {
  const misfit = stepFitsStage(step, state.view);
  if (misfit && state.strict) return { stopped: 'stage', why: `Stopped at step ${step.from ?? state.n}: ${misfit}.`, state };
  const decision = capDecision({ action: step.do, spentUsd: state.spentUsd, largestTurnUsd: state.largestTurnUsd, cap: state.cap });
  if (!decision.allowed) return { stopped: 'cap', why: decision.message, decision, state };

  const response = await send(actionFor(step, state.sessionId));
  const view = response?.view ?? state.view;
  const diff = diffView(state.view, response?.view ?? null);

  let usageAfter = state.usage;
  let spentUsd = state.spentUsd;
  let cost = null;
  if (callsModel(step.do)) {
    const read = await readSpend();
    usageAfter = read.usage;
    const delta = usageDelta(state.usage, usageAfter);
    cost = priceTurn(delta, { finish: step.do === 'finish' });
    spentUsd = spendWithTurn({ sessions: read.sessions, transcripts: read.transcripts, sessionId: state.sessionId, turn: { cost, usage: { delta } } }).totalUsd;
  }
  const n = state.n;
  const record = turnRecord({ n, step, response, diff, usageBefore: state.usage, usageAfter, cost, spentUsd });
  const printed = formatTurn({ n, step, response, diff, cost, spentUsd, cap: state.cap });
  const refused = response?.status === 'refused' || response?.status === 'failed';
  return {
    misfit,
    stopped: refused ? 'refused' : null,
    why: refused ? `Stopped at step ${step.from ?? n}: the function ${response.status} it (${response.message}).` : null,
    record,
    printed,
    response,
    cost,
    state: {
      ...state,
      n: n + 1,
      view,
      usage: usageAfter,
      spentUsd,
      largestTurnUsd: Math.max(state.largestTurnUsd, cost?.usd ?? 0),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Talking to the project
// ---------------------------------------------------------------------------------------------------------------------------

/** Everything the app asks of the live case goes through one call; so does this (`SupabaseLive` in `src/data/liveCase.ts`). */
export function makeSend(client) {
  return async (action) => {
    const { data, error } = await client.functions.invoke('live-case', { body: action });
    if (error) {
      let detail = '';
      try {
        detail = typeof error?.context?.text === 'function' ? await error.context.text() : '';
      } catch {
        detail = '';
      }
      throw new Error(`The live-case function failed: ${error.message}${detail ? ` — ${String(detail).slice(0, 500)}` : ''}`);
    }
    return data;
  };
}

async function signIn(credentials) {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(credentials.url, credentials.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: credentials.email, password: credentials.password });
  if (error) throw new Error(`Could not sign in as ${credentials.email}: ${error.message}`);
  const userId = data?.user?.id;
  if (!userId) throw new Error('Signed in, but the account has no id.');
  return { client, userId, send: makeSend(client) };
}

export const catalogRow = (r) => ({
  id: String(r.id ?? ''),
  name: String(r.name ?? ''),
  book: String(r.book ?? ''),
  school: String(r.school ?? ''),
  year: Number(r.year ?? 0),
  caseType: String(r.case_type ?? ''),
  industry: String(r.industry ?? ''),
  cochairPick: Boolean(r.cochair_pick),
  done: Boolean(r.done),
});

async function loadCatalog(client) {
  const { data, error } = await client.rpc('live_case_catalog');
  if (error) throw new Error(`The catalogue could not be read: ${error.message}`);
  return (data ?? []).map(catalogRow);
}

export function filterCatalog(rows, book) {
  if (!book) return rows;
  const want = book.toLowerCase();
  return rows.filter((r) => r.book.toLowerCase().includes(want));
}

export function formatCatalog(rows) {
  return rows
    .map((r) => `${r.id}  ${r.name} — ${r.book}${r.year ? ` (${r.year})` : ''} · ${r.caseType || 'no type'} · ${r.industry || 'no industry'}${r.cochairPick ? ' · co-chair pick' : ''} · ${r.done ? 'logged by this account' : 'not logged'}`)
    .join('\n');
}

/**
 * The catalogue says nothing about what is inside a case. PR #118 briefly released a conversation-only signal from the Edge Function and
 * PR #124 took it out again, deliberately, so there is nothing to report and nothing is reimplemented here: `buildPlan` stays the one
 * place that decides what a case holds.
 */
export const NO_EXHIBIT_SIGNAL =
  'The deployed function releases no "conversation-only" signal: the endpoint that did (PR #118) was removed again by PR #124. Nothing is reimplemented here, so the catalogue says nothing about what a case holds.';

// ---------------------------------------------------------------------------------------------------------------------------
// The commands
// ---------------------------------------------------------------------------------------------------------------------------

const option = (argv, name, fallback = '') => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

/** The one action a `turn` was asked for, from the flags. Exactly one is allowed. */
export function stepFromArgv(argv) {
  const given = TURN_ACTIONS.filter((a) => argv.includes(`--${a}`));
  if (given.length === 0) throw new Error(`A turn needs one of ${TURN_ACTIONS.map((a) => `--${a}`).join(', ')}.`);
  if (given.length > 1) throw new Error(`A turn does one thing: ${given.map((a) => `--${a}`).join(' and ')} were both given.`);
  const what = given[0];
  if (what === 'say' || what === 'submit') {
    const text = option(argv, what);
    if (!text) throw new Error(`--${what} needs the text the candidate writes, in quotes.`);
    return { do: what, text, from: 1 };
  }
  return { do: what, from: 1 };
}

export function capFromArgv(argv) {
  const given = option(argv, 'cap');
  if (!given) return DEFAULT_CAP;
  const cap = Number(given);
  if (!Number.isFinite(cap) || cap <= 0) throw new Error(`--cap takes an amount in dollars, such as --cap 2.00 ("${given}" is not one).`);
  return cap;
}

const context = async (argv) => {
  const credentials = readCredentials(option(argv, 'account', 'a'));
  const cap = capFromArgv(argv);
  const { client, userId, send } = await signIn(credentials);
  return { credentials, client, userId, send, workdir: option(argv, 'workdir', ROOT), cap, dir: join(ROOT, PILOT_DIR) };
};

/** One read of the database: every session of this account, what each has used, and what the pilot has spent. */
function loadSpend(ctx) {
  const sessions = readSessionRows(runQuery(sessionsSql(ctx.userId), { workdir: ctx.workdir }));
  const transcripts = readTranscripts(ctx.dir);
  const report = spendReport(sessions, transcripts.map((t) => t.data));
  return { sessions, transcripts, report, largestTurnUsd: largestTurnCost(transcripts.map((t) => t.data)) };
}

const usageOf = (sessions, sessionId) => readUsage(sessions.find((s) => s.id === sessionId)?.usage);

async function cmdCatalog(argv) {
  const ctx = await context(argv);
  const rows = filterCatalog(await loadCatalog(ctx.client), option(argv, 'book'));
  console.log(formatCatalog(rows));
  console.log(`\n${rows.length} case${rows.length === 1 ? '' : 's'} that can be practised live${option(argv, 'book') ? ` in books matching "${option(argv, 'book')}"` : ''}.`);
  console.log(NO_EXHIBIT_SIGNAL);
  const out = option(argv, 'json');
  if (out) {
    const path = resolve(process.cwd(), out);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${path}`);
  }
  return 0;
}

async function cmdSpend(argv) {
  const ctx = await context(argv);
  const { report } = loadSpend(ctx);
  console.log(formatSpend(report, { cap: ctx.cap }));
  return 0;
}

/** Starts a case and opens its transcript. Refuses rather than adopting a session that is already running. */
async function startCase(ctx, libraryId, mode) {
  if (!MODES.includes(mode)) throw new Error(`--mode is one of ${MODES.join(', ')}.`);
  if (!isUuid(libraryId)) throw new Error('--case needs the library case id from `catalog` (a uuid).');
  const { sessions, report, largestTurnUsd } = loadSpend(ctx);
  const active = sessions.find((s) => s.status === 'active');
  if (active) {
    throw new Error(
      `This account already has an active live case (${active.id}, started ${new Date(active.createdAt).toISOString()}). ` +
        'Finish it (`turn --finish`) or end it (`turn --end`) before starting another: the function would hand the running one back, and the pilot never adopts a session it did not start.',
    );
  }
  const starts = startsLeft(sessions);
  console.log(starts.message);
  if (!starts.allowed) throw new Error(starts.message);

  const entry = (await loadCatalog(ctx.client)).find((c) => c.id === libraryId);
  if (!entry) throw new Error(`No live-eligible case has the id ${libraryId}. Run \`catalog\` to see the list.`);
  console.log(`Starting ${entry.name} — ${entry.book} in ${mode} mode. ${usd(report.totalUsd)} of the ${usd(ctx.cap)} cap spent so far (approximate).`);

  const response = await ctx.send({ type: 'start', libraryId, mode });
  if (response?.status !== 'ok') throw new Error(`The case would not start: ${response?.message ?? response?.status}`);
  const view = response.view;
  const startedAt = Date.now();
  const transcript = newTranscript({
    account: ctx.credentials.account,
    userId: ctx.userId,
    sessionId: view.sessionId,
    libraryId,
    caseName: entry.name,
    book: entry.book,
    mode,
    cap: ctx.cap,
    startedAt,
  });
  const diff = diffView(null, view);
  transcript.turns.push(
    turnRecord({ n: 0, step: { do: 'start', from: 0 }, response, diff, usageBefore: EMPTY_USAGE, usageAfter: EMPTY_USAGE, cost: null, spentUsd: report.totalUsd }),
  );
  const path = join(ctx.dir, transcriptName({ account: ctx.credentials.account, caseName: entry.name, mode, startedAt }));
  writeTranscript(path, transcript);
  console.log(formatTurn({ n: 0, step: { do: 'start' }, response, diff, cost: null, spentUsd: report.totalUsd, cap: ctx.cap }));
  console.log(`\nTranscript: ${path}\n${TRANSCRIPT_WARNING}`);
  return { path, transcript, view, spentUsd: report.totalUsd, largestTurnUsd };
}

/** Picks up the account's newest transcript and the session it belongs to. */
function openLatest(ctx) {
  const { sessions, transcripts, report, largestTurnUsd } = loadSpend(ctx);
  const found = latestTranscript(transcripts, ctx.credentials.account);
  if (!found) throw new Error(`No transcript for account ${ctx.credentials.account} in ${ctx.dir}. Start a case first: \`start --case <libraryId> --mode interview\`.`);
  const sessionId = String(found.data?.sessionId ?? '');
  if (!sessions.some((s) => s.id === sessionId)) {
    throw new Error(`The newest transcript (${basename(found.path)}) names session ${sessionId}, which this account does not have. Start a case first.`);
  }
  return { path: found.path, transcript: found.data, sessionId, sessions, report, largestTurnUsd };
}

/** The view the last turn left behind, rebuilt from the transcript, so only what is new gets printed. */
function viewFromTranscript(transcript) {
  const messages = [];
  const exhibits = [];
  let last = null;
  for (const turn of transcript?.turns ?? []) {
    for (const m of turn.newMessages ?? []) messages.push(m);
    for (const e of turn.newExhibits ?? []) exhibits.push(e);
    last = turn;
  }
  return {
    messages,
    exhibits,
    stage: last?.stage ?? 'prompt',
    frameworkPhase: last?.frameworkPhase ?? 'framework',
    beatsShown: last?.beatsShown ?? 0,
    beatsTotal: last?.beatsTotal ?? 0,
    status: last?.sessionStatus ?? 'active',
  };
}

async function takeSteps(ctx, opened, steps, { strict }) {
  const { path, transcript, sessionId } = opened;
  let state = {
    sessionId,
    view: viewFromTranscript(transcript),
    usage: usageOf(opened.sessions, sessionId),
    spentUsd: opened.report.totalUsd,
    largestTurnUsd: opened.largestTurnUsd,
    cap: ctx.cap,
    n: (transcript.turns ?? []).length,
    strict,
  };
  let code = 0;
  // One read of the database and of the folder; `runStep` totals them together with the turn it has just taken. The transcript on disk
  // is rewritten after every step, so reading the folder is reading this run too: nothing is counted twice.
  const readSpend = () => {
    const sessions = readSessionRows(runQuery(sessionsSql(ctx.userId), { workdir: ctx.workdir }));
    return { usage: usageOf(sessions, sessionId), sessions, transcripts: readTranscripts(ctx.dir).map((t) => t.data) };
  };
  for (const step of steps) {
    const result = await runStep(step, state, { send: ctx.send, readSpend });
    if (result.misfit) console.log(`note: ${result.misfit}.`);
    if (result.record) {
      transcript.turns.push(result.record);
      writeTranscript(path, transcript);
    }
    if (result.printed) console.log(result.printed);
    state = result.state;
    if (result.stopped) {
      console.error(`\n${result.why}`);
      code = 1;
      break;
    }
  }
  if (state.view?.status === 'done' || state.view?.stage === 'done') {
    transcript.finalView = state.view;
    transcript.finalState = readFinalState(ctx, sessionId);
    writeTranscript(path, transcript);
  }
  console.log(`\nTranscript: ${path}\n${TRANSCRIPT_WARNING}`);
  return code;
}

/** The session's own state, which the view never shows: the hints, the asks and the outcome of each beat, and the stage log. */
function readFinalState(ctx, sessionId) {
  try {
    const rows = runQuery(sessionStateSql(ctx.userId, sessionId), { workdir: ctx.workdir });
    return rows[0] ?? null;
  } catch (error) {
    console.error(`The session state could not be read back: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function cmdStart(argv) {
  const ctx = await context(argv);
  await startCase(ctx, option(argv, 'case'), option(argv, 'mode', 'practice'));
  return 0;
}

async function cmdTurn(argv) {
  const ctx = await context(argv);
  const step = stepFromArgv(argv);
  return takeSteps(ctx, openLatest(ctx), [step], { strict: false });
}

async function cmdPlay(argv) {
  const ctx = await context(argv);
  const file = option(argv, 'script');
  if (!file) throw new Error('--script needs the path to a JSON script of steps.');
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) throw new Error(`No script at ${path}.`);
  let json;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const steps = readScriptSteps(json);
  console.log(`${steps.length} step${steps.length === 1 ? '' : 's'} from ${path}.`);
  const libraryId = option(argv, 'case');
  const opened = libraryId
    ? await (async () => {
        const started = await startCase(ctx, libraryId, option(argv, 'mode', 'practice'));
        const { sessions, report, largestTurnUsd } = loadSpend(ctx);
        return { path: started.path, transcript: started.transcript, sessionId: started.view.sessionId, sessions, report, largestTurnUsd };
      })()
    : openLatest(ctx);
  return takeSteps(ctx, opened, steps, { strict: true });
}

const HELP = `Usage: npm run pilot:live -- <command> [flags]        THIS SPENDS REAL MONEY (cap ${usd(DEFAULT_CAP)} by default)

  catalog [--book "<substring>"] [--json <path>]      the cases that can be practised live (no model call)
  start --case <libraryId> --mode practice|interview|learning
  turn (--ready | --say "<text>" | --submit "<text>" | --next | --nudge | --finish | --end)
  play --script <path.json> [--case <libraryId> --mode <mode>]    a whole case unattended
  spend                                               what this account has spent (no model call)

Flags everywhere: --account a|b (default a), --cap <usd> (default ${DEFAULT_CAP}), --workdir <path to the folder holding supabase/>.
Transcripts are written to ${PILOT_DIR}/ and hold the book's own exhibits: never paste one anywhere.`;

export async function main(argv) {
  const command = argv[0];
  if (!command || argv.includes('--help')) {
    console.log(HELP);
    return command ? 0 : 1;
  }
  const commands = { catalog: cmdCatalog, start: cmdStart, turn: cmdTurn, play: cmdPlay, spend: cmdSpend };
  const run = commands[command];
  if (!run) {
    console.error(`Unknown command "${command}".\n\n${HELP}`);
    return 1;
  }
  try {
    return await run(argv.slice(1));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
