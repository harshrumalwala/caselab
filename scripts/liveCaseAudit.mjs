// Measures every write-up in private-data/solutions/ against the rules the live case really uses, and writes one report saying, case by
// case, whether that case can carry a live case. Nothing here decides anything: every rule is imported from the files production runs
// (supabase/functions/_shared/liveCase.ts and liveCaseCoach.ts, src/domain/bookSolution.ts), so the report cannot drift from the app.
//
//   npm run audit:live                       # writes reports/live-case-audit.md and prints the summary
//   npm run audit:live -- --out somewhere.md
//
// The report holds case names, book names, exhibit titles, counts and verdicts only: never a prompt, a figure or a line of a solution, so
// it is safe to paste into an issue. Both the source write-ups and the default report directory are git-ignored.
//
// Needs Node 22.6+ (the rules are TypeScript; the script re-runs itself with type stripping when the Node it is started with has none).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nameKey } from './librarySeed.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = 'private-data/solutions';
const DEFAULT_OUT = 'reports/live-case-audit.md';

/**
 * The real rules, loaded from the files production uses. The Edge Function's TypeScript is loaded by Node's type stripping; `main` makes
 * sure that is switched on before this runs. A test imports the same three modules itself and passes them to `audit`.
 */
export async function loadRules() {
  const liveCase = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/liveCase.ts')).href);
  const coach = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/liveCaseCoach.ts')).href);
  const book = await import(pathToFileURL(join(ROOT, 'src/domain/bookSolution.ts')).href);
  return {
    isInterviewerSideExhibit: liveCase.isInterviewerSideExhibit,
    buildPlan: liveCase.buildPlan,
    readSolution: coach.readSolution,
    isFullSolution: coach.isFullSolution,
    givenOnRequest: coach.givenOnRequest,
    planFor: coach.planFor,
    parseBookSolution: book.parseBookSolution,
    parseSolutionExhibit: book.parseSolutionExhibit,
    LIVE_EXHIBIT_LIMITS: book.LIVE_EXHIBIT_LIMITS,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The parser's caps, measured rather than copied
// ---------------------------------------------------------------------------------------------------------------------------

const list = (n, make) => Array.from({ length: n }, (_, i) => make(i));

/**
 * What `parseBookSolution` keeps, found by pushing a deliberately oversized write-up through it: the caps are read off the result instead
 * of being written down here, so a cap that changes in the parser changes in the report with it.
 */
export function measureCaps({ parseBookSolution }) {
  const probe = { exhibits: 40, columns: 40, rows: 200, points: 200, panels: 12, structure: 24, clarifyingQuestions: 16, takeaways: 12 };
  const chart = {
    kind: 'bar',
    categories: ['a', 'b'],
    series: [{ name: 's', values: [1, 2] }],
    totals: list(probe.points, (i) => `t${i}`),
    panels: list(probe.panels, () => ({ kind: 'bar', categories: ['a'], series: [{ name: 'p', values: [1] }] })),
  };
  const exhibit = (i) => ({
    title: `E${i}`,
    columns: list(probe.columns, (c) => `c${c}`),
    rows: list(probe.rows, (r) => list(probe.columns, (c) => `${r}.${c}`)),
    chart,
  });
  const parsed = parseBookSolution({
    prompt: 'p',
    recommendation: 'r',
    steps: [{ title: 's', body: 'b' }],
    exhibits: list(probe.exhibits, exhibit),
    structure: list(probe.structure, (i) => ({ heading: `h${i}`, points: ['p'] })),
    clarifyingQuestions: list(probe.clarifyingQuestions, (i) => ({ question: `q${i}`, answer: 'a' })),
    ourTakeaways: list(probe.takeaways, (i) => ({ title: `t${i}`, detail: 'd' })),
  });
  const first = parsed?.exhibits[0];
  if (!parsed || !first || !first.chart) throw new Error('The cap probe was refused by parseBookSolution: the audit cannot measure the caps.');
  const caps = {
    exhibits: parsed.exhibits.length,
    columns: first.columns.length,
    rows: first.rows.length,
    points: first.chart.totals.length,
    panels: first.chart.panels.length,
    structure: parsed.structure.length,
    clarifyingQuestions: parsed.clarifyingQuestions.length,
    takeaways: parsed.ourTakeaways.length,
  };
  for (const [key, value] of Object.entries(caps)) {
    if (value >= probe[key]) throw new Error(`The cap for ${key} is at least ${value}: raise the probe in measureCaps and run again.`);
  }
  return caps;
}

export const CAP_LABEL = {
  exhibits: 'exhibits',
  columns: 'columns',
  rows: 'rows',
  points: 'chart points',
  panels: 'panels',
  structure: 'structure buckets',
  clarifyingQuestions: 'clarifying questions',
  takeaways: 'takeaways',
};

// ---------------------------------------------------------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------------------------------------------------------

const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Which of the four tests in `isInterviewerSideExhibit` hides this table, found by asking the real function about one part of the table at
 * a time. An exhibit can be caught by more than one.
 */
function hidingRules(exhibit, isInterviewerSideExhibit) {
  const parts = [
    ['title', { title: exhibit.title }],
    ['caption', { caption: exhibit.caption }],
    ['column', { columns: exhibit.columns }],
    ['cell', { rows: exhibit.rows }],
  ];
  return parts.flatMap(([name, part]) => (isInterviewerSideExhibit(part) ? [name] : []));
}

/** What a chart will look like on the screen: its kind, or how many panels, or nothing. */
const chartKind = (chart) => (chart === null ? '' : chart.panels.length > 0 ? `${chart.kind} (${chart.panels.length} panels)` : chart.kind);

/** Everything in the write-up that a parser cap cuts, as counts (never content). */
function capCuts(raw, caps) {
  const cuts = [];
  const over = (what, had, cap) => {
    if (had > cap) cuts.push(`${what}: ${had} of ${cap} kept`);
  };
  over('exhibits', arr(raw.exhibits).length, caps.exhibits);
  over('structure buckets', arr(raw.structure).length, caps.structure);
  over('clarifying questions', arr(raw.clarifyingQuestions).length, caps.clarifyingQuestions);
  over('takeaways', arr(raw.ourTakeaways).length, caps.takeaways);
  arr(raw.exhibits).forEach((e, i) => {
    const where = `exhibit ${i + 1}`;
    over(`${where} columns`, arr(e?.columns).length, caps.columns);
    over(`${where} rows`, arr(e?.rows).length, caps.rows);
    const chart = e?.chart;
    if (chart && typeof chart === 'object') {
      over(`${where} chart categories`, arr(chart.categories).length, caps.points);
      over(`${where} chart totals`, arr(chart.totals).length, caps.points);
      over(`${where} chart panels`, arr(chart.panels).length, caps.panels);
      arr(chart.belowRows).forEach((r, j) => over(`${where} chart row ${j + 1}`, arr(r?.values).length, caps.points));
    }
  });
  return cuts;
}

/** Why a write-up is not offered for live practice. Descriptive only: `isFullSolution` is what decides. */
function whyNotEligible(raw, live) {
  const reasons = [];
  if (raw.confidence !== 'high') reasons.push('marked partial');
  if (!live) reasons.push('no prompt');
  if (!live?.recommendation) reasons.push('no recommendation');
  if (arr(raw.exhibits).length + arr(raw.steps).length === 0) reasons.push('nothing to work through');
  return reasons.length > 0 ? reasons : ['refused by isFullSolution'];
}

/** One write-up, measured against the live case's own rules. */
export function auditCase(raw, rules, caps) {
  const { isInterviewerSideExhibit, readSolution, isFullSolution, givenOnRequest, planFor, parseBookSolution, parseSolutionExhibit, LIVE_EXHIBIT_LIMITS } = rules;
  const live = readSolution(raw);
  const eligible = isFullSolution(raw);
  const plan = live ? planFor(live) : { beats: [] };
  const exhibits = live ? live.exhibits : [];

  const shown = [];
  const hidden = [];
  exhibits.forEach((e, index) => {
    if (isInterviewerSideExhibit(e)) {
      hidden.push({ index: index + 1, title: e.title, rules: hidingRules(e, isInterviewerSideExhibit), class: givenOnRequest(e) ? 'onRequest' : 'reference' });
      return;
    }
    // Exactly what the screen does with an exhibit the member is shown (see ExhibitView in src/features/live/liveParts.tsx).
    const drawn = parseSolutionExhibit({ title: e.title, caption: e.caption, columns: e.columns, rows: e.rows, approx: e.approx, chart: e.chart }, LIVE_EXHIBIT_LIMITS);
    shown.push({
      index: index + 1,
      title: e.title,
      chart: chartKind(drawn.chart),
      chartInWriteUp: Boolean(e.chart),
      empty: e.columns.length === 0 || e.rows.length === 0,
    });
  });

  const cuts = capCuts(raw, caps);
  const readCount = arr(raw.exhibits).length;
  if (readCount > exhibits.length && live) cuts.push(`exhibits read by the live case: ${readCount} of ${exhibits.length} kept`);

  const flags = [];
  if (!eligible) flags.push('not_live_eligible');
  if (!parseBookSolution(raw)) flags.push('full_solution_refused');
  if (eligible && plan.beats.length < 2) flags.push('fewer_than_2_beats');
  if (shown.some((e) => e.empty)) flags.push('candidate_exhibit_empty');
  if (cuts.length > 0) flags.push('cut_by_parser_cap');
  if (eligible && hidden.length > 0 && shown.length === 0 && plan.beats.length < 2) flags.push('all_exhibits_hidden');

  return {
    name: String(raw.name ?? ''),
    book: String(raw.book ?? ''),
    eligible,
    reasons: eligible ? [] : whyNotEligible(raw, live),
    beats: {
      total: plan.beats.length,
      exhibits: plan.beats.filter((b) => b.kind === 'exhibit').length,
      steps: plan.beats.filter((b) => b.kind === 'step').length,
      hasBrainstorm: Boolean(plan.hasBrainstorm),
    },
    exhibits: { inWriteUp: readCount, read: exhibits.length, shown: shown.length, hidden: hidden.length },
    shown,
    hidden,
    cuts,
    flags,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Every case
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Audits a list of write-ups, folding two write-ups of the same case name the way `scripts/buildLibrarySeed.mjs` does (one entry per
 * `nameKey`; the seed refuses a second one outright, so the audit keeps the first and says the other was folded in).
 */
export function audit(entries, rules, caps = measureCaps(rules)) {
  const seen = new Map();
  const folded = [];
  const cases = [];
  for (const raw of entries) {
    const key = nameKey(raw?.name ?? '');
    if (seen.has(key)) {
      folded.push({ name: String(raw?.name ?? ''), keptName: seen.get(key) });
      continue;
    }
    seen.set(key, String(raw?.name ?? ''));
    cases.push(auditCase(raw ?? {}, rules, caps));
  }
  cases.sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)) || a.book.localeCompare(b.book));
  return { cases, folded, caps, read: entries.length };
}

export const FLAGS = ['not_live_eligible', 'full_solution_refused', 'fewer_than_2_beats', 'candidate_exhibit_empty', 'cut_by_parser_cap', 'all_exhibits_hidden'];

const tally = (values) => values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map());
const sum = (values) => values.reduce((t, v) => t + v, 0);

/**
 * The numbers the summary is made of. Exhibits, charts and beats are counted over the cases live practice actually offers, because a
 * write-up that is not eligible is never run; the exhibits of the rest are given as one line of their own.
 */
export function summarise({ cases, folded, caps, read }) {
  const eligible = cases.filter((c) => c.eligible);
  const shown = eligible.flatMap((c) => c.shown);
  const hidden = eligible.flatMap((c) => c.hidden);
  return {
    read,
    folded: folded.length,
    audited: cases.length,
    eligible: eligible.length,
    notEligible: cases.length - eligible.length,
    reasons: tally(cases.filter((c) => !c.eligible).flatMap((c) => c.reasons)),
    exhibitsInWriteUps: sum(eligible.map((c) => c.exhibits.inWriteUp)),
    exhibitsRead: sum(eligible.map((c) => c.exhibits.read)),
    exhibitsNotEligible: sum(cases.filter((c) => !c.eligible).map((c) => c.exhibits.inWriteUp)),
    shown: shown.length,
    hidden: hidden.length,
    hiddenReference: hidden.filter((e) => e.class === 'reference').length,
    hiddenOnRequest: hidden.filter((e) => e.class === 'onRequest').length,
    hiddenByRule: tally(hidden.flatMap((e) => e.rules)),
    chartsDrawn: shown.filter((e) => e.chart).length,
    chartsNotDrawn: shown.filter((e) => !e.chart).length,
    chartsLost: shown.filter((e) => !e.chart && e.chartInWriteUp).length,
    chartKinds: tally(shown.filter((e) => e.chart).map((e) => e.chart.replace(/ \(.*\)$/, ''))),
    noCandidateExhibit: eligible.filter((c) => c.exhibits.shown === 0).length,
    beats: tally(eligible.map((c) => Math.min(c.beats.total, 8))),
    flags: tally(cases.flatMap((c) => c.flags)),
    flagged: cases.filter((c) => c.flags.length > 0).length,
    caps,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------------------------------------

const pad = (label, value) => `  ${label.padEnd(44, ' ')}${String(value).padStart(6, ' ')}`;
const counted = (m, keys) => keys.map((k) => pad(`  ${k}`, m.get(k) ?? 0));
const sortedKeys = (m) => [...m.keys()].sort();

/** The block that is meant to be diffed between two runs and pasted into an issue: one fact per line, in a fixed order. */
export function formatSummary(s) {
  const beat = (n) => pad(`  ${n === 8 ? '8 or more' : n}`, s.beats.get(n) ?? 0);
  return [
    'Write-ups',
    pad('write-ups read', s.read),
    pad('folded as a duplicate name', s.folded),
    pad('cases audited', s.audited),
    pad('live-eligible', s.eligible),
    pad('not live-eligible', s.notEligible),
    ...counted(s.reasons, sortedKeys(s.reasons)),
    '',
    'Exhibits (eligible cases)',
    pad('exhibits in the write-ups', s.exhibitsInWriteUps),
    pad('exhibits the live case reads', s.exhibitsRead),
    pad('shown to the candidate', s.shown),
    pad('hidden from the candidate', s.hidden),
    pad('  classed reference', s.hiddenReference),
    pad('  classed onRequest', s.hiddenOnRequest),
    'Hidden by rule (one exhibit can match more than one)',
    ...counted(s.hiddenByRule, ['title', 'caption', 'column', 'cell']),
    pad('exhibits in write-ups that are not eligible', s.exhibitsNotEligible),
    '',
    'Charts on the exhibits the candidate sees',
    pad('a chart is drawn', s.chartsDrawn),
    pad('no chart is drawn', s.chartsNotDrawn),
    pad('  a chart is in the write-up but cannot be drawn', s.chartsLost),
    'Charts drawn by kind',
    ...counted(s.chartKinds, sortedKeys(s.chartKinds)),
    '',
    'Shape of the live case (eligible cases)',
    pad('cases with no candidate exhibit', s.noCandidateExhibit),
    'Beats per case',
    ...[1, 2, 3, 4, 5, 6, 7, 8].map(beat),
    '',
    'Parser caps (measured from parseBookSolution)',
    ...Object.entries(CAP_LABEL).map(([key, label]) => pad(`  ${label}`, s.caps[key])),
    '',
    'Flagged against the audit criteria',
    pad('cases with at least one flag', s.flagged),
    ...counted(s.flags, FLAGS),
  ].join('\n');
}

function caseLines(c) {
  const lines = [`### ${c.name}${c.book ? ` — ${c.book}` : ''}`];
  lines.push(`live-eligible: ${c.eligible ? 'yes' : `no (${c.reasons.join('; ')})`}`);
  const kinds = c.beats.exhibits > 0 ? `${c.beats.exhibits} exhibit` : c.beats.steps > 0 ? `${c.beats.steps} step` : 'none';
  lines.push(`beats: ${c.beats.total} (${kinds})${c.beats.hasBrainstorm ? ', brainstorm stage' : ''}`);
  lines.push(`exhibits: ${c.exhibits.inWriteUp} in the write-up, ${c.exhibits.shown} to the candidate, ${c.exhibits.hidden} hidden`);
  for (const e of c.shown) {
    const chart = e.chart ? `chart ${e.chart}` : e.chartInWriteUp ? 'chart in the write-up, not drawable' : 'no chart';
    lines.push(`  shown  ${e.index}. ${e.title || '(no title)'} — ${chart}${e.empty ? ' — EMPTY TABLE' : ''}`);
  }
  for (const e of c.hidden) {
    lines.push(`  hidden ${e.index}. ${e.title || '(no title)'} — by ${e.rules.join(', ') || 'none (rule not identified)'} — ${e.class}`);
  }
  for (const cut of c.cuts) lines.push(`  cut    ${cut}`);
  lines.push(`flags: ${c.flags.join(', ') || 'none'}`);
  return lines.join('\n');
}

export function formatReport(result, { dir, files, at }) {
  const s = summarise(result);
  const flagged = result.cases.filter((c) => c.flags.length > 0);
  return [
    '# Live-case suitability report',
    '',
    `Run: ${at}`,
    `Source: ${dir} (${files} file(s))`,
    'Rules: imported from supabase/functions/_shared/liveCase.ts, liveCaseCoach.ts and src/domain/bookSolution.ts, never copied.',
    'Content: case names, book names, exhibit titles, counts and verdicts only. No prompt, figure or solution text is in this file.',
    '',
    '## Summary',
    '',
    '```',
    formatSummary(s),
    '```',
    '',
    '## Criteria',
    '',
    '- `not_live_eligible`: `isFullSolution` refuses the write-up, so live case never offers it.',
    '- `full_solution_refused`: `parseBookSolution` returns null, so the Full solution screen has nothing to show.',
    '- `fewer_than_2_beats`: an eligible case with nothing, or only one thing, to work through.',
    '- `candidate_exhibit_empty`: an exhibit the candidate is shown has no columns or no rows.',
    '- `cut_by_parser_cap`: a parser cap silently cuts part of the write-up.',
    '- `all_exhibits_hidden`: every exhibit in the write-up is hidden and fewer than two step beats are left.',
    '',
    ...(result.folded.length > 0
      ? ['## Folded duplicate names', '', ...result.folded.map((f) => `- ${f.name} (kept: ${f.keptName})`), '']
      : []),
    `## Flagged cases (${flagged.length})`,
    '',
    ...(flagged.length > 0 ? flagged.map((c) => `- ${c.name}${c.book ? ` — ${c.book}` : ''}: ${c.flags.join(', ')}`) : ['None.']),
    '',
    `## Every case (${result.cases.length})`,
    '',
    ...result.cases.map(caseLines).flatMap((block) => [block, '']),
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------------------------------------------------------

export function readSolutionFiles(dir) {
  const full = resolve(ROOT, dir);
  if (!existsSync(full)) throw new Error(`No write-ups found: ${dir} does not exist (it is git-ignored and lives only on the owner's machine).`);
  const files = readdirSync(full).filter((f) => f.endsWith('.json')).sort();
  const entries = [];
  const broken = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(full, file), 'utf8'));
    } catch (error) {
      broken.push(`${file}: ${error.message}`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      broken.push(`${file}: the file is not a list of write-ups`);
      continue;
    }
    parsed.forEach((entry, i) => {
      if (!entry || typeof entry !== 'object') broken.push(`${file}: write-up ${i + 1} is not an object`);
      else if (typeof entry.name !== 'string' || entry.name.trim() === '') broken.push(`${file}: write-up ${i + 1} has no name`);
      else entries.push(entry);
    });
  }
  return { files, entries, broken };
}

const option = (argv, name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

async function main(argv) {
  if (argv.includes('--help')) {
    console.log('Usage: node scripts/liveCaseAudit.mjs [--dir private-data/solutions] [--out reports/live-case-audit.md]');
    return 0;
  }
  const dir = option(argv, 'dir', DEFAULT_DIR);
  const out = option(argv, 'out', DEFAULT_OUT);
  const { files, entries, broken } = readSolutionFiles(dir);
  const rules = await loadRules();
  const result = audit(entries, rules);
  const report = formatReport(result, { dir, files: files.length, at: new Date().toISOString() });
  const target = resolve(ROOT, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, report);
  console.log(formatSummary(summarise(result)));
  console.log(`\nWrote ${out} (${result.cases.length} cases, ${result.cases.filter((c) => c.flags.length > 0).length} flagged).`);
  if (broken.length > 0) {
    console.error(`\n${broken.length} write-up(s) could not be read:`);
    for (const b of broken) console.error(`  ${b}`);
    return 1;
  }
  return 0;
}

// Run only when this file is the command. The rules are TypeScript, so an older Node is restarted with type stripping switched on.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (process.features.typescript) {
    process.exitCode = await main(process.argv.slice(2));
  } else {
    const flags = ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];
    const run = spawnSync(process.execPath, [...flags, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
    if (run.error) throw new Error(`This script needs Node 22.6 or newer, which can read the TypeScript rules: ${run.error.message}`);
    process.exitCode = run.status ?? 1;
  }
}
