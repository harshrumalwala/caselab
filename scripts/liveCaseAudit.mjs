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
  const fidelity = await import(pathToFileURL(join(ROOT, 'src/domain/exhibitFidelity.ts')).href);
  return {
    isInterviewerSideExhibit: liveCase.isInterviewerSideExhibit,
    buildPlan: liveCase.buildPlan,
    readSolution: coach.readSolution,
    isFullSolution: coach.isFullSolution,
    interviewerVoice: coach.interviewerVoice,
    hasTell: coach.hasTell,
    givenOnRequest: coach.givenOnRequest,
    planFor: coach.planFor,
    parseBookSolution: book.parseBookSolution,
    parseSolutionExhibit: book.parseSolutionExhibit,
    exhibitLoss: fidelity.exhibitLoss,
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
  const probe = { exhibits: 40, columns: 40, rows: 200, points: 200, series: 32, panels: 16, structure: 24, clarifyingQuestions: 16, takeaways: 12 };
  const chart = {
    kind: 'bar',
    categories: ['a', 'b'],
    series: list(probe.series, (i) => ({ name: `s${i}`, values: [1, 2] })),
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
    series: first.chart.series.length,
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
  series: 'chart series',
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
    const charts = (c, label) => {
      if (!c || typeof c !== 'object') return;
      over(`${label} categories`, arr(c.categories).length, caps.points);
      over(`${label} totals`, arr(c.totals).length, caps.points);
      over(`${label} series`, arr(c.series).length, caps.series);
      over(`${label} panels`, arr(c.panels).length, caps.panels);
      arr(c.belowRows).forEach((r, j) => over(`${label} row ${j + 1}`, arr(r?.values).length, caps.points));
      arr(c.panels).forEach((p, j) => charts(p, `${label} panel ${j + 1}`));
    };
    charts(e?.chart, `${where} chart`);
  });
  return cuts;
}

/**
 * The heart of this report since issue #95: what the write-up holds for one exhibit, against what is actually drawn from it, on both the
 * screens that draw one. `exhibitLoss` does the comparing (chart kind, series, panels, points, columns, rows and their order), and it is
 * the same function the screens read to decide whether to tell the member the exhibit is not whole, so the report and the screen can
 * never disagree.
 *
 * **Write-up to render, not book to render.** The casebook pages are not in the repo, so nothing here can say whether a write-up is
 * faithful to the printed page; only that nothing is lost after the write-up.
 *
 * The live case is compared from the raw write-up all the way to the screen, which covers both cuts: the one `readExhibits` makes in the
 * Edge Function and the one `parseSolutionExhibit` makes in the browser.
 */
function renderLoss(rawExhibit, liveExhibit, rules) {
  const { parseSolutionExhibit, exhibitLoss, LIVE_EXHIBIT_LIMITS } = rules;
  const source = rawExhibit ?? liveExhibit;
  const live = liveExhibit
    ? exhibitLoss(
        source,
        // Exactly what the screen does with an exhibit the member is shown (see ExhibitView in src/features/live/liveParts.tsx).
        parseSolutionExhibit({ title: liveExhibit.title, caption: liveExhibit.caption, columns: liveExhibit.columns, rows: liveExhibit.rows, approx: liveExhibit.approx, chart: liveExhibit.chart }, LIVE_EXHIBIT_LIMITS),
      )
    : { cut: [], shortened: [] };
  // The Full solution screen draws every exhibit of the write-up, the interviewer's included, with the write-up's own (smaller) caps.
  const full = rawExhibit ? exhibitLoss(rawExhibit, parseSolutionExhibit(rawExhibit)) : { cut: [], shortened: [] };
  return { live, full };
}

// ---------------------------------------------------------------------------------------------------------------------------
// What the prompt says
// ---------------------------------------------------------------------------------------------------------------------------

/** A sentence that says where the case came from: the book, the casebook or the authors. The prompt rule and the interviewer's rule below read the same words. */
export const NAMES_THE_BOOK = /\b(?:the|this)\s+(?:book|casebook|case book)\b|\bthe\s+authors?\b|\bbook[’']s\b/i;

/**
 * The prompt opens a live case word for word (`openingText`), so it holds the business situation and the question put to the
 * candidate, and nothing else. Each rule below names one kind of sentence that is something else. Only the label travels into the
 * report: the words that matched stay in private-data.
 *
 * The first two are settled and **fail the command**: a prompt never says where the case came from, and a printing oddity is
 * reproduced as printed with no commentary (the owner's rule). The rest describe the case as a case and are reported for a person to
 * judge, because a prompt can fairly mention an interviewer who is a character in the story or a role play the member is part of.
 */
export const PROMPT_RULES = [
  {
    label: 'names the book, the casebook or the authors',
    fails: true,
    test: NAMES_THE_BOOK,
  },
  {
    label: 'notes how the page prints something',
    fails: true,
    test: /\bprinted\s+(?:in|as)\b|\bas\s+printed\b|\bthe\s+spelling\b|\bspelt\b|\bspelled\b|\[sic\]|\(sic\)/i,
  },
  {
    label: 'says how hard or open the case is',
    fails: false,
    test: /\b(?:this|the)\s+(?:case|prompt|question|exercise)\s+(?:is|reads)\s+(?:an?\s+)?(?:very\s+|quite\s+|fairly\s+|rather\s+|somewhat\s+|deliberately\s+|intentionally\s+)?(?:hard|difficult|easy|tough|challenging|complex|open-ended|straightforward|simple|vague|broad)\b|\b(?:hard|difficult|easy|tough|challenging|complex|open-ended|straightforward)\s+case\b/i,
  },
  {
    label: 'says what kind of case it is',
    fails: false,
    test: /\b(?:estimation|market[- ]sizing|sizing|profitability|market[- ]entry|M&A|brainteaser|brainstorming|guesstimate|conversational|interviewer[- ]led|candidate[- ]led|command[- ]and[- ]control|role[- ]play)\s+case\b|\bcase\s+interview|\bfirst[- ]round\b|\bsecond[- ]round\b|\bphone\s+interview\b/i,
  },
  {
    label: 'says how the case is run',
    fails: false,
    test: /\bthe\s+case\s+(?:is|has|runs|opens|tests|turns|combines|proceeds|moves|can\s+be)\b/i,
  },
  {
    label: 'says how the interviewer behaves',
    fails: false,
    test: /\bthe\s+interviewer\b(?!,)/i,
  },
  {
    label: 'tells the candidate how to answer',
    fails: false,
    test: /\bthe\s+candidate\s+should\b/i,
  },
];

const PROMPT_FAILS = new Set(PROMPT_RULES.filter((rule) => rule.fails).map((rule) => rule.label));

/** Which rules a prompt matches, by label. Never the words that matched. */
export function promptAsides(prompt) {
  const text = String(prompt ?? '');
  return PROMPT_RULES.filter((rule) => rule.test.test(text)).map((rule) => rule.label);
}

/** One of these labels is a prompt telling the member where the case came from: the command fails on it. */
export const namesTheBook = (labels) => labels.some((label) => PROMPT_FAILS.has(label));

/** The rest: the prompt describing the case as a case. Reported, for a person to judge. */
export const talksAboutTheCase = (labels) => labels.some((label) => !PROMPT_FAILS.has(label));

// ---------------------------------------------------------------------------------------------------------------------------
// What the interviewer's own side says (issue #149)
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The member never reads a fact or a clarifying answer, but the coach does, and it reads one out when they ask for it (issue #83), so
 * the same sentence can reach a member the way a prompt does. These rules are **reported, never failed**, because the engine takes
 * part of it off by itself: `interviewerVoice` drops the narrator in front of a fact ("the book says X" is read out as X), and only a
 * sentence the book is built into survives it. Both numbers are counted, so the one that needs the content changed is the visible one.
 */
export const INTERVIEWER_RULES = [
  { label: 'a fact names the book, the casebook or the authors', test: NAMES_THE_BOOK },
  { label: 'a clarifying answer names the book, the casebook or the authors', test: NAMES_THE_BOOK },
];

/**
 * The same path, read for what it costs rather than for what it says (issue #156). The reply filter drops a sentence that talks about
 * the member, and the interviewer's own facts name them too, because that is how a write-up puts a condition ("given once the
 * candidate asks for it: ..."). A dropped sentence does not reach the member; when **every** sentence of the fact is dropped, the
 * reply is the stand-in line and the member who asked for the fact gets none of it. Reported, never failed: part of what is dropped
 * is a stage direction, which is right to drop, and only a person reading the case can tell which is which.
 */
export const DROPPED_RULES = [
  { label: 'a fact the reply filter drops whole' },
  { label: 'a clarifying answer the reply filter drops whole' },
];

const sentencesOf = (text) => String(text ?? '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/** One fact or clarifying answer against the reply filter: how many of its sentences are dropped, and whether that is all of them. */
const dropsOf = (text, hasTell) => {
  const all = sentencesOf(text);
  const gone = all.filter((s) => hasTell(s)).length;
  return { gone, whole: all.length > 0 && gone === all.length };
};

/**
 * The interviewer's side of one write-up, measured: which rules it matches, how many of its sentences name the book, how many
 * still name it after the reply filter production runs has had them, and how much of it that filter drops. Labels and counts only,
 * never the sentence.
 */
export function interviewerAsides(live, interviewerVoice, hasTell) {
  const facts = (live?.facts ?? []).filter((t) => NAMES_THE_BOOK.test(t));
  const answers = (live?.clarifying ?? []).map((q) => q?.answer ?? '').filter((t) => NAMES_THE_BOOK.test(t));
  const labels = [];
  if (facts.length > 0) labels.push(INTERVIEWER_RULES[0].label);
  if (answers.length > 0) labels.push(INTERVIEWER_RULES[1].label);
  const named = [...facts, ...answers].flatMap(sentencesOf).filter((s) => NAMES_THE_BOOK.test(s));
  // What a reply that repeats the sentence comes out as. A reply is one message, so the filter is asked the same question here.
  const afterVoice = named.filter((s) => {
    const said = interviewerVoice(s);
    return said && NAMES_THE_BOOK.test(said);
  });
  const factDrops = (live?.facts ?? []).map((t) => dropsOf(t, hasTell));
  const answerDrops = (live?.clarifying ?? []).map((q) => dropsOf(q?.answer ?? '', hasTell));
  const dropLabels = [];
  if (factDrops.some((d) => d.whole)) dropLabels.push(DROPPED_RULES[0].label);
  if (answerDrops.some((d) => d.whole)) dropLabels.push(DROPPED_RULES[1].label);
  return {
    labels,
    facts: facts.length,
    answers: answers.length,
    sentences: named.length,
    afterVoice: afterVoice.length,
    dropLabels,
    dropped: [...factDrops, ...answerDrops].reduce((n, d) => n + d.gone, 0),
    droppedWhole: [...factDrops, ...answerDrops].filter((d) => d.whole).length,
  };
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
  const { isInterviewerSideExhibit, readSolution, isFullSolution, givenOnRequest, planFor, parseBookSolution, parseSolutionExhibit, interviewerVoice, hasTell, LIVE_EXHIBIT_LIMITS } =
    rules;
  const live = readSolution(raw);
  const eligible = isFullSolution(raw);
  const plan = live ? planFor(live) : { beats: [] };
  const exhibits = live ? live.exhibits : [];
  const readCount = arr(raw.exhibits).length;
  // The live case reads every exhibit of the write-up in order unless one was dropped outright; only then do the two lists stop lining
  // up, and the comparison below falls back to the live case's own copy as the source (the dropped exhibit is reported as a cut).
  const aligned = readCount === exhibits.length;

  const shown = [];
  const hidden = [];
  const fidelity = [];
  exhibits.forEach((e, index) => {
    const rawExhibit = aligned ? arr(raw.exhibits)[index] : null;
    const candidate = !isInterviewerSideExhibit(e);
    const loss = renderLoss(rawExhibit, candidate ? e : null, rules);
    if (loss.live.cut.length + loss.live.shortened.length + loss.full.cut.length + loss.full.shortened.length > 0) {
      fidelity.push({ index: index + 1, title: e.title, candidate, ...loss });
    }
    if (!candidate) {
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
  if (readCount > exhibits.length && live) cuts.push(`exhibits read by the live case: ${readCount} of ${exhibits.length} kept`);
  const asides = promptAsides(raw.prompt);
  const interviewer = interviewerAsides(live, interviewerVoice, hasTell);

  const notWhole = fidelity.filter((f) => f.live.cut.length + f.full.cut.length > 0);
  const flags = [];
  if (!eligible) flags.push('not_live_eligible');
  if (!parseBookSolution(raw)) flags.push('full_solution_refused');
  if (eligible && plan.beats.length < 2) flags.push('fewer_than_2_beats');
  if (shown.some((e) => e.empty)) flags.push('candidate_exhibit_empty');
  if (cuts.length > 0) flags.push('cut_by_parser_cap');
  if (eligible && hidden.length > 0 && shown.length === 0 && plan.beats.length < 2) flags.push('all_exhibits_hidden');
  if (notWhole.length > 0) flags.push('exhibit_not_whole');
  if (fidelity.some((f) => f.live.shortened.length + f.full.shortened.length > 0)) flags.push('exhibit_text_shortened');
  if (namesTheBook(asides)) flags.push('prompt_names_the_book');
  if (talksAboutTheCase(asides)) flags.push('prompt_talks_about_the_case');
  if (interviewer.labels.length > 0) flags.push('interviewer_names_the_book');

  return {
    name: String(raw.name ?? ''),
    book: String(raw.book ?? ''),
    eligible,
    reasons: eligible ? [] : whyNotEligible(raw, live),
    beats: {
      total: plan.beats.length,
      exhibits: plan.beats.filter((b) => b.kind === 'exhibit').length,
      steps: plan.beats.filter((b) => b.kind === 'step').length,
      brainstorms: plan.beats.filter((b) => b.kind === 'brainstorm').length,
      // A brainstorm with a part of the case after it: it is asked in the middle, where the book asks for it (issue #133).
      brainstormsBeforeAPart: plan.beats.filter((b, i) => b.kind === 'brainstorm' && plan.beats.slice(i + 1).some((x) => x.kind !== 'brainstorm')).length,
      hasBrainstorm: Boolean(plan.hasBrainstorm),
    },
    exhibits: { inWriteUp: readCount, read: exhibits.length, shown: shown.length, hidden: hidden.length },
    shown,
    hidden,
    fidelity,
    cuts,
    asides,
    interviewer,
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

export const FLAGS = [
  'not_live_eligible',
  'full_solution_refused',
  'fewer_than_2_beats',
  'candidate_exhibit_empty',
  'cut_by_parser_cap',
  'all_exhibits_hidden',
  'exhibit_not_whole',
  'exhibit_text_shortened',
  'prompt_names_the_book',
  'prompt_talks_about_the_case',
  'interviewer_names_the_book',
];

/** The one flag the command fails on: an exhibit a member can be shown is not the whole of what the write-up holds. */
export const BREACH = 'exhibit_not_whole';

/** The other flag the command fails on: the opening the member reads tells them the case came out of a book. */
export const PROMPT_BREACH = 'prompt_names_the_book';

const tally = (values) => values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map());
const sum = (values) => values.reduce((t, v) => t + v, 0);

/** The group a loss line belongs to, with its counts and positions taken out: "chart panel 2 points: 7 ... 6 ..." becomes "chart panel points". */
export const lossKind = (line) => String(line).split(':')[0].replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim();

/**
 * The numbers the summary is made of. Exhibits, charts and beats are counted over the cases live practice actually offers, because a
 * write-up that is not eligible is never run; the exhibits of the rest are given as one line of their own.
 */
export function summarise({ cases, folded, caps, read }) {
  const eligible = cases.filter((c) => c.eligible);
  const shown = eligible.flatMap((c) => c.shown);
  const hidden = eligible.flatMap((c) => c.hidden);
  const fidelity = cases.flatMap((c) => c.fidelity ?? []);
  const cutLive = fidelity.filter((f) => f.live.cut.length > 0);
  const cutFull = fidelity.filter((f) => f.full.cut.length > 0);
  return {
    exhibitsCompared: cases.flatMap((c) => c.shown).length + cases.flatMap((c) => c.hidden).length,
    notWholeLive: cutLive.length,
    notWholeFull: cutFull.length,
    notWhole: fidelity.filter((f) => f.live.cut.length + f.full.cut.length > 0).length,
    shortened: fidelity.filter((f) => f.live.shortened.length + f.full.shortened.length > 0).length,
    lostBy: tally([...cutLive.flatMap((f) => f.live.cut), ...cutFull.flatMap((f) => f.full.cut)].map(lossKind)),
    shortenedBy: tally(fidelity.flatMap((f) => [...new Set([...f.live.shortened, ...f.full.shortened])]).map(lossKind)),
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
    beatsExhibit: sum(eligible.map((c) => c.beats.exhibits)),
    beatsStep: sum(eligible.map((c) => c.beats.steps)),
    beatsBrainstorm: sum(eligible.map((c) => c.beats.brainstorms)),
    casesWithBrainstorm: eligible.filter((c) => c.beats.hasBrainstorm).length,
    casesWithTwoBrainstorms: eligible.filter((c) => c.beats.brainstorms > 1).length,
    // Today's order against the book's: a brainstorm with a part of the case after it is one the engine used to run too late.
    brainstormsBeforeAPart: sum(eligible.map((c) => c.beats.brainstormsBeforeAPart)),
    bothKinds: eligible.filter((c) => c.beats.exhibits > 0 && c.beats.steps > 0).length,
    promptsNamingTheBook: cases.filter((c) => c.flags.includes(PROMPT_BREACH)).length,
    promptsAboutTheCase: cases.filter((c) => c.flags.includes('prompt_talks_about_the_case')).length,
    promptRules: tally(cases.flatMap((c) => c.asides ?? [])),
    // The interviewer's own side (issue #149). Counted over every case the coach can read, because a fact is read out in any mode.
    interviewerNamingTheBook: cases.filter((c) => (c.interviewer?.labels ?? []).length > 0).length,
    interviewerNamingTheBookLive: cases.filter((c) => c.eligible && (c.interviewer?.labels ?? []).length > 0).length,
    interviewerRules: tally(cases.flatMap((c) => c.interviewer?.labels ?? [])),
    interviewerSentences: sum(cases.map((c) => c.interviewer?.sentences ?? 0)),
    interviewerAfterVoice: sum(cases.map((c) => c.interviewer?.afterVoice ?? 0)),
    interviewerCasesAfterVoice: cases.filter((c) => (c.interviewer?.afterVoice ?? 0) > 0).length,
    // What the reply filter drops of that same side (issue #156): a fact dropped whole is a fact the member asked for and did not get.
    interviewerDropped: sum(cases.map((c) => c.interviewer?.dropped ?? 0)),
    interviewerDroppedWhole: sum(cases.map((c) => c.interviewer?.droppedWhole ?? 0)),
    interviewerCasesDropped: cases.filter((c) => (c.interviewer?.dropLabels ?? []).length > 0).length,
    interviewerDropRules: tally(cases.flatMap((c) => c.interviewer?.dropLabels ?? [])),
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
    'Does the whole of the write-up reach the member? (write-up to render, not book to render)',
    pad('exhibits compared', s.exhibitsCompared),
    pad('not whole on screen (something is gone)', s.notWhole),
    pad('  in a live case', s.notWholeLive),
    pad('  on the Full solution screen', s.notWholeFull),
    'What was lost',
    ...(s.lostBy.size === 0 ? [pad('  nothing', 0)] : counted(s.lostBy, sortedKeys(s.lostBy))),
    pad('exhibits with text cut to length (all figures kept)', s.shortened),
    'What was cut to length',
    ...(s.shortenedBy.size === 0 ? [pad('  nothing', 0)] : counted(s.shortenedBy, sortedKeys(s.shortenedBy))),
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
    pad('beats that hand over an exhibit', s.beatsExhibit),
    pad('beats talked through (a step with no exhibit)', s.beatsStep),
    pad('beats that are a brainstorm', s.beatsBrainstorm),
    pad('  cases with a brainstorm', s.casesWithBrainstorm),
    pad('  cases with more than one', s.casesWithTwoBrainstorms),
    pad('  brainstorms asked before a later part', s.brainstormsBeforeAPart),
    pad('cases that work through both kinds', s.bothKinds),
    'Beats per case',
    ...[1, 2, 3, 4, 5, 6, 7, 8].map(beat),
    '',
    'What the prompt says (the member reads it word for word)',
    pad('prompts that name the book or how it prints something', s.promptsNamingTheBook),
    pad('prompts that describe the case as a case', s.promptsAboutTheCase),
    'By rule',
    ...counted(s.promptRules, PROMPT_RULES.map((rule) => rule.label)),
    '',
    'What the interviewer holds (read out when the member asks: issue #83)',
    pad('cases whose facts or answers name the book', s.interviewerNamingTheBook),
    pad('  of those, live-eligible', s.interviewerNamingTheBookLive),
    'By rule',
    ...counted(s.interviewerRules, INTERVIEWER_RULES.map((rule) => rule.label)),
    pad('sentences that name the book', s.interviewerSentences),
    pad('  still naming it after the reply filter', s.interviewerAfterVoice),
    pad('  cases with one of those', s.interviewerCasesAfterVoice),
    pad('sentences the reply filter drops', s.interviewerDropped),
    pad('  facts or answers dropped whole', s.interviewerDroppedWhole),
    pad('  cases with one of those', s.interviewerCasesDropped),
    'By rule',
    ...counted(s.interviewerDropRules, DROPPED_RULES.map((rule) => rule.label)),
    '',
    'Parser caps (measured from parseBookSolution)',
    ...Object.entries(CAP_LABEL).map(([key, label]) => pad(`  ${label}`, s.caps[key])),
    '',
    'Flagged against the audit criteria',
    pad('cases with at least one flag', s.flagged),
    ...counted(s.flags, FLAGS),
  ].join('\n');
}

/** One exhibit whose render is not the whole of the write-up: what is gone, and on which screen. */
const cutLines = (f) => [
  ...f.live.cut.map((cut) => `  NOT WHOLE ${f.index}. ${f.title || '(no title)'} — live case — ${cut}`),
  ...f.full.cut.map((cut) => `  NOT WHOLE ${f.index}. ${f.title || '(no title)'} — Full solution screen — ${cut}`),
];

/** The text caps are the same on both paths, so a shortened label is the same loss twice: say it once. */
const shortenedLines = (f) => [...new Set([...f.live.shortened, ...f.full.shortened])].map((text) => `  shortened ${f.index}. ${f.title || '(no title)'} — ${text}`);

const fidelityLines = (f) => [...cutLines(f), ...shortenedLines(f)];

function caseLines(c) {
  const lines = [`### ${c.name}${c.book ? ` — ${c.book}` : ''}`];
  lines.push(`live-eligible: ${c.eligible ? 'yes' : `no (${c.reasons.join('; ')})`}`);
  const kinds =
    [c.beats.exhibits > 0 ? `${c.beats.exhibits} exhibit` : '', c.beats.steps > 0 ? `${c.beats.steps} step` : '', c.beats.brainstorms > 0 ? `${c.beats.brainstorms} brainstorm` : '']
      .filter(Boolean)
      .join(' + ') || 'none';
  lines.push(`beats: ${c.beats.total} (${kinds})${c.beats.hasBrainstorm ? ', brainstorm stage' : ''}${c.beats.brainstormsBeforeAPart > 0 ? `, ${c.beats.brainstormsBeforeAPart} asked before a later part` : ''}`);
  lines.push(`exhibits: ${c.exhibits.inWriteUp} in the write-up, ${c.exhibits.shown} to the candidate, ${c.exhibits.hidden} hidden`);
  for (const e of c.shown) {
    const chart = e.chart ? `chart ${e.chart}` : e.chartInWriteUp ? 'chart in the write-up, not drawable' : 'no chart';
    lines.push(`  shown  ${e.index}. ${e.title || '(no title)'} — ${chart}${e.empty ? ' — EMPTY TABLE' : ''}`);
  }
  for (const e of c.hidden) {
    lines.push(`  hidden ${e.index}. ${e.title || '(no title)'} — by ${e.rules.join(', ') || 'none (rule not identified)'} — ${e.class}`);
  }
  for (const f of c.fidelity ?? []) lines.push(...fidelityLines(f));
  for (const cut of c.cuts) lines.push(`  cut    ${cut}`);
  if ((c.asides ?? []).length > 0) lines.push(`  prompt ${c.asides.join('; ')}`);
  if ((c.interviewer?.labels ?? []).length > 0)
    lines.push(`  held   ${c.interviewer.labels.join('; ')} — ${c.interviewer.sentences} sentence(s), ${c.interviewer.afterVoice} the reply filter cannot take it out of`);
  lines.push(`flags: ${c.flags.join(', ') || 'none'}`);
  return lines.join('\n');
}

export function formatReport(result, { dir, files, at }) {
  const s = summarise(result);
  const flagged = result.cases.filter((c) => c.flags.length > 0);
  const notWhole = result.cases.filter((c) => c.flags.includes(BREACH));
  const shortened = result.cases.filter((c) => c.flags.includes('exhibit_text_shortened'));
  const prompts = result.cases.filter((c) => (c.asides ?? []).length > 0);
  const held = result.cases.filter((c) => (c.interviewer?.labels ?? []).length > 0);
  return [
    '# Live-case suitability report',
    '',
    `Run: ${at}`,
    `Source: ${dir} (${files} file(s))`,
    'Rules: imported from supabase/functions/_shared/liveCase.ts, liveCaseCoach.ts, src/domain/bookSolution.ts and',
    'src/domain/exhibitFidelity.ts, never copied.',
    'Content: case names, book names, exhibit titles, counts and verdicts only. No prompt, figure or solution text is in this file.',
    '',
    '**This compares the write-up to the render, not the book to the render.** The casebook pages are not in this repository, so nothing',
    'here can say whether a write-up is faithful to the printed page: only that nothing is lost between the write-up and the screen. A',
    'write-up that got the book wrong would pass every check in this file.',
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
    '- `cut_by_parser_cap`: a parser cap cuts part of the write-up (the write-up measured against the caps, whatever the screen does).',
    '- `all_exhibits_hidden`: every exhibit in the write-up is hidden and fewer than two step beats are left.',
    '- `exhibit_not_whole`: an exhibit a member can be shown has lost something between the write-up and the screen — a column, a row, a',
    '  cell, a chart point, a series, a panel. **This is the one that fails the command.**',
    '- `exhibit_text_shortened`: a label was cut to length (a panel heading, an axis title, a footnote, a side note, a row label under',
    '  the axis, a reference line\'s label). Every figure is on screen; one piece of text does not fit the drawing. Reported, not failed:',
    '  the fix is a shorter line in the write-up, which is a content change and the owner\'s call.',
    '- `prompt_names_the_book`: the prompt tells the member the case came out of a book, or notes how the page prints something. The',
    '  member reads the prompt word for word as the opening of a live case. **This one also fails the command.**',
    '- `prompt_talks_about_the_case`: the prompt describes the case as a case — how hard it is, what kind it is, how it is run, how the',
    '  interviewer behaves, how the candidate should answer. Reported, not failed: a prompt can fairly name an interviewer who is a',
    '  character in the story, so a person decides.',
    '- `interviewer_names_the_book`: a fact or a clarifying answer the interviewer holds names the book, the casebook or the',
    '  authors. The coach reads a fact out when the member asks for it, so it can reach a member the way a prompt does. Reported, not',
    '  failed: the reply filter takes the narrator off a fact by itself, and the count that matters is the one it cannot.',
    '',
    `## Exhibits that do not reach the member whole (${notWhole.length})`,
    '',
    'What the write-up holds for the exhibit, against what is drawn from it: chart kind, series count and names, panel count, point count,',
    'the column list, and the rows with their order. Each line says which screen loses it and what is gone, in counts.',
    '',
    ...(notWhole.length > 0
      ? notWhole.flatMap((c) => [`### ${c.name}${c.book ? ` — ${c.book}` : ''}`, ...(c.fidelity ?? []).flatMap(cutLines), ''])
      : ['None: every exhibit reaches the member with everything the write-up holds for it.', '']),
    `## Text cut to length (${shortened.length} case(s))`,
    '',
    'The exhibit is whole; a label is too long for where it is drawn. A chart heading, an axis title, a row label under the axis and the',
    'label on a reference line are single lines inside a panel, so a longer one would run outside it: raising those caps would break the',
    'drawing rather than fix anything.',
    '',
    ...(shortened.length > 0
      ? shortened.flatMap((c) => [`### ${c.name}${c.book ? ` — ${c.book}` : ''}`, ...(c.fidelity ?? []).flatMap(shortenedLines), ''])
      : ['None.', '']),
    `## Prompts that are not only the case (${prompts.length})`,
    '',
    'The prompt is the opening of a live case, read to the member word for word, so it holds the business situation and the question put',
    'to the candidate and nothing else. A prompt that names the book, or notes how the page prints something, fails the command; the rest',
    'are listed for a person to read, because an interviewer can be a character in the story. Rule labels only, never the sentence.',
    '',
    ...(prompts.length > 0
      ? prompts.map((c) => `- ${c.name}${c.book ? ` — ${c.book}` : ''}: ${c.asides.join('; ')}`)
      : ['None: every prompt is the case and nothing else.']),
    '',
    `## What the interviewer holds that names the book (${held.length})`,
    '',
    'A fact and a clarifying answer are never shown to the member, and the coach reads one out, in full, when they ask for it. A sentence',
    'that names the book can therefore reach a member mid-case. `interviewerVoice` (the filter every reply goes through) takes the',
    'narrator off a fact it is in front of — "the book says X" is read out as X — so the second count is the one that needs the write-up',
    'changed: the sentences the book is built into. Rule labels and counts only, never the sentence.',
    '',
    ...(held.length > 0
      ? held.map(
          (c) =>
            `- ${c.name}${c.book ? ` — ${c.book}` : ''}: ${c.interviewer.labels.join('; ')} — ${c.interviewer.sentences} sentence(s), ${c.interviewer.afterVoice} the filter cannot take it out of`,
        )
      : ['None: everything the interviewer holds is held as the interviewer.']),
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
  // The two things this command fails on. Both are loud rather than a line in a list, because nothing should ever be loaded in either
  // state. First: a member can be shown less of a book exhibit than the write-up holds. Raise the cap, or shorten it in the write-up.
  const notWhole = result.cases.filter((c) => c.flags.includes(BREACH));
  if (notWhole.length > 0) {
    console.error(`\n${notWhole.length} case(s) hold an exhibit that does not reach the member whole:`);
    for (const c of notWhole) console.error(`  ${c.name}${c.book ? ` — ${c.book}` : ''}: ${(c.fidelity ?? []).flatMap(cutLines).length} line(s) in the report`);
    console.error('See "Exhibits that do not reach the member whole" in the report.');
  }
  // Second: the prompt opens the case word for word, so a prompt that says where the case came from is the first thing a member reads.
  const named = result.cases.filter((c) => c.flags.includes(PROMPT_BREACH));
  if (named.length > 0) {
    console.error(`\n${named.length} prompt(s) talk about the book instead of to the candidate:`);
    for (const c of named) console.error(`  ${c.name}${c.book ? ` — ${c.book}` : ''}: ${c.asides.join('; ')}`);
    console.error('See "Prompts that are not only the case" in the report.');
  }
  return notWhole.length + named.length > 0 ? 1 : 0;
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
