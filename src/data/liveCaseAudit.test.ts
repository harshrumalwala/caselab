// @vitest-environment node
//
// The live-case suitability report (scripts/liveCaseAudit.mjs): it must apply the rules production applies, say per case what the live
// case will do with it, and never carry a word of the book's content out of private-data.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildPlan, isInterviewerSideExhibit } from '../../supabase/functions/_shared/liveCase';
import { givenOnRequest, isFullSolution, planFor, readSolution } from '../../supabase/functions/_shared/liveCaseCoach';
import { LIVE_EXHIBIT_LIMITS, SOLUTION_EXHIBIT_LIMITS, parseBookSolution, parseSolutionExhibit } from '../domain/bookSolution';
import { exhibitLoss } from '../domain/exhibitFidelity';
import { PROMPT_BREACH, PROMPT_RULES, audit, auditCase, formatReport, formatSummary, lossKind, measureCaps, promptAsides, readSolutionFiles, summarise, type AuditRules } from '../../scripts/liveCaseAudit.mjs';

const rules: AuditRules = {
  isInterviewerSideExhibit,
  buildPlan,
  readSolution,
  isFullSolution,
  givenOnRequest,
  planFor,
  parseBookSolution,
  parseSolutionExhibit,
  exhibitLoss,
  LIVE_EXHIBIT_LIMITS,
};
const caps = measureCaps(rules);

const exhibit = (over: Record<string, unknown> = {}) => ({
  title: 'Exhibit 1: Revenue by region',
  caption: '',
  columns: ['Region', 'Revenue'],
  rows: [
    ['North', '10'],
    ['South', '20'],
  ],
  howToRead: 'Compare the two regions.',
  takeaways: ['North is twice South.'],
  ...over,
});

const writeUp = (over: Record<string, unknown> = {}) => ({
  name: 'Sample Co.',
  book: 'Booth MCG 2026-2027',
  prompt: 'The client is losing money and wants to know why.',
  recommendation: 'Close the southern plant.',
  confidence: 'high',
  steps: [{ title: 'Size the market', body: 'Work out the market size.' }],
  exhibits: [exhibit()],
  ...over,
});

const one = (over: Record<string, unknown> = {}) => auditCase(writeUp(over), rules, caps);

describe('the parser caps', () => {
  it('are measured from parseBookSolution, not written down in the report', () => {
    expect(caps.columns).toBe(SOLUTION_EXHIBIT_LIMITS.columns);
    expect(caps.rows).toBe(SOLUTION_EXHIBIT_LIMITS.rows);
    expect(caps.points).toBe(SOLUTION_EXHIBIT_LIMITS.points);
    expect(caps).toMatchObject({ exhibits: 12, series: 16, panels: 8, structure: 8, clarifyingQuestions: 5, takeaways: 3 });
  });
});

describe('what the report says about one case', () => {
  it('says whether the case is live-eligible, and agrees with isFullSolution', () => {
    expect(one().eligible).toBe(true);
    const partial = writeUp({ confidence: 'partial' });
    expect(isFullSolution(partial)).toBe(false);
    expect(auditCase(partial, rules, caps).eligible).toBe(false);
  });

  it('says why a case is not eligible', () => {
    expect(one({ confidence: 'partial' }).reasons).toContain('marked partial');
    expect(one({ recommendation: '' }).reasons).toContain('no recommendation');
    expect(one({ prompt: '' }).reasons).toContain('no prompt');
    expect(one({ exhibits: [], steps: [] }).reasons).toContain('nothing to work through');
  });

  it('counts the beats and says whether they are exhibits or steps', () => {
    const withExhibits = one({ exhibits: [exhibit(), exhibit({ title: 'Exhibit 2: Costs' })] });
    // Two exhibits, and the write-up's "Size the market" step, which has no exhibit of its own.
    expect(withExhibits.beats).toMatchObject({ total: 3, exhibits: 2, steps: 1 });
    const withSteps = one({ exhibits: [], steps: [{ title: 'Size the market', body: 'a' }, { title: 'Check the costs', body: 'b' }] });
    expect(withSteps.beats).toMatchObject({ total: 2, exhibits: 0, steps: 2 });
    expect(withExhibits.beats.total).toBe(planFor(readSolution(writeUp({ exhibits: [exhibit(), exhibit({ title: 'Exhibit 2: Costs' })] }))!).beats.length);
  });

  it('says both kinds in the case line when a case works through exhibits and steps', () => {
    const report = formatReport(audit([writeUp({ exhibits: [exhibit(), exhibit({ title: 'Exhibit 2: Costs' })] })], rules, caps), { dir: 'x', files: 1, at: 'now' });
    expect(report).toContain('beats: 3 (2 exhibit + 1 step)');
  });

  it('counts exhibits in the write-up, shown to the candidate and hidden', () => {
    const c = one({ exhibits: [exhibit(), exhibit({ title: 'Interviewer guidance: the answer' })] });
    expect(c.exhibits).toMatchObject({ inWriteUp: 2, shown: 1, hidden: 1 });
  });

  it('says which rule hid each hidden exhibit, and whether it is reference or onRequest', () => {
    const c = one({
      exhibits: [
        exhibit({ title: 'Interviewer guidance' }),
        exhibit({ title: 'Table 2', caption: 'Keep private: the book’s solution page' }),
        exhibit({ title: 'Table 3', columns: ['Region', 'Not for the candidate'] }),
        exhibit({ title: 'Table 4', rows: [['North', '(Answer: 10)']] }),
        exhibit({ title: 'Market sizes', caption: 'Given if prompted' }),
      ],
    });
    expect(c.hidden.map((e) => e.rules)).toEqual([['title'], ['caption'], ['column'], ['cell'], ['caption']]);
    expect(c.hidden.map((e) => e.class)).toEqual(['reference', 'reference', 'reference', 'reference', 'onRequest']);
    expect(c.hidden.map((e) => e.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('says whether a chart will be drawn and of what kind, using the live case’s own reader', () => {
    const chart = { kind: 'bar', categories: ['North', 'South'], series: [{ name: 'Revenue', values: [10, 20] }] };
    expect(one({ exhibits: [exhibit({ chart })] }).shown[0]).toMatchObject({ chart: 'bar', chartInWriteUp: true });
    expect(one().shown[0]).toMatchObject({ chart: '', chartInWriteUp: false });
    // A chart of a kind we do not draw (or one whose series do not line up) stays a table, and the report says the write-up had one.
    const broken = { kind: 'waterfall', categories: ['North'], series: [{ name: 'Revenue', values: [10] }] };
    expect(one({ exhibits: [exhibit({ chart: broken })] }).shown[0]).toMatchObject({ chart: '', chartInWriteUp: true });
  });

  it('counts panels in the chart kind', () => {
    const panel = { kind: 'bar', categories: ['a'], series: [{ name: 's', values: [1] }] };
    const chart = { kind: 'bar', categories: ['a'], series: [{ name: 's', values: [1] }], panels: [panel, panel] };
    expect(one({ exhibits: [exhibit({ chart })] }).shown[0].chart).toBe('bar (2 panels)');
  });

  it('says what a parser cap cuts, in counts', () => {
    const rows = Array.from({ length: caps.rows + 5 }, (_, i) => [`r${i}`, '1']);
    const c = one({ exhibits: [exhibit({ rows })], clarifyingQuestions: Array.from({ length: caps.clarifyingQuestions + 1 }, (_, i) => ({ question: `q${i}`, answer: 'a' })) });
    expect(c.cuts).toContain(`exhibit 1 rows: ${caps.rows + 5} of ${caps.rows} kept`);
    expect(c.cuts).toContain(`clarifying questions: ${caps.clarifyingQuestions + 1} of ${caps.clarifyingQuestions} kept`);
    expect(one().cuts).toEqual([]);
  });
});

describe('the flags', () => {
  it('flags a case with fewer than two beats', () => {
    // One exhibit, and the only step is that exhibit's own discussion: one thing to work through.
    expect(one({ steps: [{ title: 'Exhibit 1: Revenue by region', body: 'Read the two regions.' }] }).flags).toContain('fewer_than_2_beats');
    expect(one().flags).not.toContain('fewer_than_2_beats');
    expect(one({ exhibits: [exhibit(), exhibit({ title: 'Exhibit 2: Costs' })] }).flags).not.toContain('fewer_than_2_beats');
  });

  it('flags a candidate exhibit with no columns or no rows', () => {
    expect(one({ exhibits: [exhibit({ rows: [] })] }).flags).toContain('candidate_exhibit_empty');
    expect(one({ exhibits: [exhibit({ columns: [] })] }).flags).toContain('candidate_exhibit_empty');
  });

  it('flags content cut by a parser cap', () => {
    const exhibits = Array.from({ length: caps.exhibits + 1 }, (_, i) => exhibit({ title: `Exhibit ${i + 1}` }));
    expect(one({ exhibits }).flags).toContain('cut_by_parser_cap');
  });

  it('flags a case whose every exhibit is hidden and that has fewer than two step beats', () => {
    const c = one({ exhibits: [exhibit({ title: 'Interviewer guidance' })], steps: [{ title: 'Framework', body: 'a' }] });
    expect(c.exhibits.shown).toBe(0);
    expect(c.flags).toContain('all_exhibits_hidden');
    const rescued = one({
      exhibits: [exhibit({ title: 'Interviewer guidance' })],
      steps: [{ title: 'Size the market', body: 'a' }, { title: 'Check the costs', body: 'b' }],
    });
    expect(rescued.flags).not.toContain('all_exhibits_hidden');
  });

  // Issue #95: the report's one loud failure. An exhibit a member can be shown must hold everything the write-up holds for it.
  it('flags an exhibit that does not reach the member whole, and keeps text cut to length apart from it', () => {
    const wide = Array.from({ length: caps.columns + 4 }, (_, i) => `Product ${i + 1}`);
    const cut = one({ exhibits: [exhibit({ columns: wide, rows: [wide.map((_, i) => String(i))] })] });
    expect(cut.flags).toContain('exhibit_not_whole');
    expect(cut.fidelity[0].full.cut).toContain(`columns: ${wide.length} in the write-up, ${caps.columns} on screen`);
    expect(cut.fidelity[0].full.shortened).toEqual([]);

    const heading = 'A panel heading that runs on well past the sixty characters a panel can hold';
    const long = one({ exhibits: [exhibit({ chart: { kind: 'bar', heading, categories: ['North'], series: [{ name: 'Revenue', values: [10] }] } })] });
    expect(long.flags).toContain('exhibit_text_shortened');
    expect(long.flags).not.toContain('exhibit_not_whole'); // every figure is on screen; one label does not fit
    expect(long.fidelity[0].live.shortened).toContain('chart heading shortened: 1');

    // Nothing to report for an exhibit that reaches the screen whole, on either path.
    expect(one().fidelity).toEqual([]);
    expect(one().flags).not.toContain('exhibit_not_whole');
  });

  // Issue #143: the label of a row under the axis is a line of the exhibit like the panel heading above it, and was the one piece of
  // text the comparison never read, so a cut one reached the member with nothing saying so and nothing in this report.
  it('flags a label under a chart axis that was cut to length, and names the row', () => {
    const label = 'Operating margin after the new distribution centre opens';
    const chart = { kind: 'bar', categories: ['North'], series: [{ name: 'Revenue', values: [10] }], belowRows: [{ label, values: ['4%'] }] };
    const long = one({ exhibits: [exhibit({ chart })] });
    expect(long.flags).toContain('exhibit_text_shortened');
    expect(long.flags).not.toContain('exhibit_not_whole');
    expect(long.fidelity[0].live.shortened).toContain('chart row 1 under the axis label shortened: 1');
    // The summary groups it by its own name, so the report says which kind of text was cut.
    expect(lossKind('chart row 1 under the axis label shortened: 1')).toBe('chart row under the axis label shortened');

    const short = one({ exhibits: [exhibit({ chart: { ...chart, belowRows: [{ label: 'Operating margin', values: ['4%'] }] } })] });
    expect(short.fidelity).toEqual([]);
    expect(short.flags).not.toContain('exhibit_text_shortened');
  });

  it('compares the interviewer\'s own exhibits on the Full solution screen only: a live case never draws them', () => {
    const wide = Array.from({ length: caps.columns + 4 }, (_, i) => `Product ${i + 1}`);
    const hidden = one({ exhibits: [exhibit({ title: 'Interviewer guidance', columns: wide, rows: [wide.map((_, i) => String(i))] })] });
    expect(hidden.fidelity[0]).toMatchObject({ candidate: false, live: { cut: [], shortened: [] } });
    expect(hidden.fidelity[0].full.cut.length).toBeGreaterThan(0);
  });

  it('flags a write-up that is not live-eligible, and one the Full solution screen would refuse', () => {
    expect(one({ confidence: 'partial' }).flags).toContain('not_live_eligible');
    expect(one({ steps: [] }).flags).toContain('full_solution_refused');
    expect(one().flags).not.toContain('not_live_eligible');
  });
});

// Issue #132: the prompt is read to the member word for word as the opening of a live case, so it is the business situation and the
// question put to the candidate, and nothing else.
describe('what the prompt says', () => {
  it('flags a prompt that names the book, the casebook or the authors, and fails the command on it', () => {
    expect(PROMPT_BREACH).toBe('prompt_names_the_book');
    for (const prompt of [
      'The client sells widgets. The book flags this as a hard case.',
      'The client sells widgets. The casebook says to use net present value.',
      'The client sells widgets. The authors run this as five questions.',
      'The client sells widgets, and the book’s own answer is to close the plant.',
    ]) {
      expect(one({ prompt }).flags).toContain('prompt_names_the_book');
    }
  });

  it('flags a prompt that notes how the page prints something, which is a slip note', () => {
    expect(one({ prompt: 'The client is Widgets Inc. (printed in the book as Widgts Inc.), a maker of widgets.' }).flags).toContain('prompt_names_the_book');
    expect(one({ prompt: 'The client is Widgts Inc., the spelling used throughout.' }).flags).toContain('prompt_names_the_book');
    expect(one({ prompt: 'The client is Widgts Inc. [sic], a maker of widgets.' }).flags).toContain('prompt_names_the_book');
  });

  it('reports, without failing, a prompt that describes the case as a case', () => {
    const asides: [string, string][] = [
      ['The client sells widgets. The case is deliberately open-ended.', 'says how hard or open the case is'],
      ['The client sells widgets. This is a role-play case.', 'says what kind of case it is'],
      ['The client sells widgets. The case runs in three phases.', 'says how the case is run'],
      ['The client sells widgets. The interviewer should stay vague.', 'says how the interviewer behaves'],
      ['The client sells widgets. The candidate should answer in order.', 'tells the candidate how to answer'],
    ];
    for (const [prompt, label] of asides) {
      const c = one({ prompt });
      expect(c.asides).toContain(label);
      expect(c.flags).toContain('prompt_talks_about_the_case');
      expect(c.flags).not.toContain('prompt_names_the_book');
    }
  });

  it('leaves a prompt that is only the business situation and the question alone', () => {
    expect(one().asides).toEqual([]);
    expect(one().flags).not.toContain('prompt_names_the_book');
    expect(one().flags).not.toContain('prompt_talks_about_the_case');
    // The house phrasing of the ask, and an interviewer who is a character in the story, are the case itself.
    expect(promptAsides('The candidate must say whether the client should buy the plant.')).toEqual([]);
    expect(promptAsides('The interviewer, a manager who travels a lot, walked into a packed bar.')).toEqual([]);
  });

  it('counts the prompts in the summary, by rule', () => {
    const result = audit(
      [
        writeUp({ name: 'Book Case', prompt: 'The client sells widgets. The book calls this hard.' }),
        writeUp({ name: 'Meta Case', prompt: 'The client sells widgets. The case is interviewer-led.' }),
        writeUp({ name: 'Clean Case' }),
      ],
      rules,
      caps,
    );
    const s = summarise(result);
    expect(s).toMatchObject({ promptsNamingTheBook: 1, promptsAboutTheCase: 1 });
    expect(s.promptRules.get('names the book, the casebook or the authors')).toBe(1);
    expect(s.promptRules.get('says how the case is run')).toBe(1);
    const text = formatSummary(s);
    expect(text).toContain('prompts that name the book or how it prints something');
    expect(text).toContain('prompts that describe the case as a case');
    for (const rule of PROMPT_RULES) expect(text).toContain(rule.label);
  });

  it('names the case and the rule in the report, and never the prompt', () => {
    const report = formatReport(
      audit([writeUp({ prompt: 'ZZPROMPT the client sells widgets. The book calls this hard.' })], rules, caps),
      { dir: 'private-data/solutions', files: 1, at: 'now' },
    );
    expect(report).toContain('## Prompts that are not only the case (1)');
    expect(report).toContain('- Sample Co. — Booth MCG 2026-2027: names the book, the casebook or the authors');
    expect(report).not.toContain('ZZPROMPT');
    const clean = formatReport(audit([writeUp()], rules, caps), { dir: 'private-data/solutions', files: 1, at: 'now' });
    expect(clean).toContain('## Prompts that are not only the case (0)');
    expect(clean).toContain('None: every prompt is the case and nothing else.');
  });
});

describe('the whole run', () => {
  const result = audit(
    [
      writeUp({ steps: [{ title: 'Exhibit 1: Revenue by region', body: 'Read the two regions.' }] }),
      writeUp({ name: 'Midwest Machinery Co.', exhibits: [exhibit(), exhibit({ title: 'Exhibit 2: Costs' })] }),
      writeUp({ name: 'Midwest machinery', exhibits: [] }),
      writeUp({ name: 'Half Case', confidence: 'partial' }),
    ],
    rules,
  );

  it('folds two write-ups of the same case name the way the seed does', () => {
    expect(result.read).toBe(4);
    expect(result.cases).toHaveLength(3);
    expect(result.folded).toEqual([{ name: 'Midwest machinery', keptName: 'Midwest Machinery Co.' }]);
  });

  it('lists the cases in a fixed order, so two runs can be diffed', () => {
    expect(result.cases.map((c) => c.name)).toEqual(['Half Case', 'Midwest Machinery Co.', 'Sample Co.']);
  });

  it('summarises the counts the queue needs', () => {
    const s = summarise(result);
    expect(s).toMatchObject({ read: 4, folded: 1, audited: 3, eligible: 2, notEligible: 1, shown: 3, hidden: 0, noCandidateExhibit: 0 });
    expect(s.beats.get(1)).toBe(1);
    expect(s.beats.get(3)).toBe(1);
    expect(s.flags.get('not_live_eligible')).toBe(1);
    expect(s.flags.get('fewer_than_2_beats')).toBe(1);
    const text = formatSummary(s);
    expect(s.beatsExhibit).toBe(3);
    expect(s.beatsStep).toBe(1); // the Midwest write-up's "Size the market" step; the other case's only step is its exhibit's discussion
    expect(s.bothKinds).toBe(1);
    for (const line of ['live-eligible', 'cases with no candidate exhibit', 'beats talked through', 'cases that work through both kinds', 'hidden from the candidate', 'a chart is drawn', 'Beats per case', 'clarifying questions']) {
      expect(text).toContain(line);
    }
  });
});

describe('what the report may contain', () => {
  const secret = {
    prompt: 'ZZPROMPT the client sells widgets',
    recommendation: 'ZZRECOMMENDATION close the plant',
    facts: ['ZZFACT revenue is 100'],
    steps: [{ title: 'Size it', body: 'ZZSTEPBODY the maths', calc: ['ZZCALC 2 x 2'] }],
    clarifyingQuestions: [{ question: 'ZZQUESTION why', answer: 'ZZANSWER because' }],
    exhibits: [
      exhibit({ caption: 'ZZCAPTION all figures in millions', rows: [['ZZCELL', '10']], howToRead: 'ZZHOWTOREAD compare them', takeaways: ['ZZTAKEAWAY north wins'] }),
      exhibit({ title: 'Interviewer guidance', caption: 'ZZHIDDENCAPTION', rows: [['ZZHIDDENCELL', '1']] }),
    ],
    ourTakeaways: [{ title: 'ZZOURS', detail: 'ZZOURSDETAIL' }],
  };
  const report = formatReport(audit([writeUp(secret)], rules), { dir: 'private-data/solutions', files: 1, at: '2026-11-16T00:00:00.000Z' });

  it('holds no prompt, figure or solution text', () => {
    expect(report).not.toMatch(/ZZ(PROMPT|RECOMMENDATION|FACT|STEPBODY|CALC|QUESTION|ANSWER|CAPTION|CELL|HOWTOREAD|TAKEAWAY|OURS|HIDDENCAPTION|HIDDENCELL)/);
  });

  it('holds the case name, the book, the exhibit titles and the verdicts', () => {
    expect(report).toContain('Sample Co.');
    expect(report).toContain('Booth MCG 2026-2027');
    expect(report).toContain('Exhibit 1: Revenue by region');
    expect(report).toContain('Interviewer guidance');
    expect(report).toContain('live-eligible: yes');
  });

  // Issue #95: the new half of the report measures content, so it is the half most likely to carry some of it out.
  it('says what a cut exhibit lost in counts and positions, and none of what was in it', () => {
    const wide = Array.from({ length: 30 }, (_, i) => `ZZCOLUMN${i}`);
    const cut = formatReport(
      audit([writeUp({ exhibits: [exhibit({ title: 'Exhibit 1: Revenue by region', columns: wide, rows: [wide.map((_, i) => `ZZCUTCELL${i}`)] })] })], rules),
      { dir: 'private-data/solutions', files: 1, at: '2026-11-16T00:00:00.000Z' },
    );
    expect(cut).not.toMatch(/ZZ(COLUMN|CUTCELL)/);
    expect(cut).toContain('## Exhibits that do not reach the member whole (1)');
    expect(cut).toContain('NOT WHOLE 1. Exhibit 1: Revenue by region');
  });

  it('says plainly that it compares the write-up with the render, and not the book with the render', () => {
    expect(report).toContain('**This compares the write-up to the render, not the book to the render.**');
    expect(report).toContain('nothing\nhere can say whether a write-up is faithful to the printed page');
    expect(report).toContain('## Exhibits that do not reach the member whole (0)');
    expect(report).toContain('None: every exhibit reaches the member with everything the write-up holds for it.');
  });
});

describe('reading the write-ups', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caselab-audit-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reports every file that fails to parse, so the command can exit non-zero', () => {
    writeFileSync(join(dir, 'good.json'), JSON.stringify([writeUp()]));
    writeFileSync(join(dir, 'bad.json'), '{ not json');
    writeFileSync(join(dir, 'shape.json'), JSON.stringify({ name: 'not a list' }));
    writeFileSync(join(dir, 'nameless.json'), JSON.stringify([{ prompt: 'p' }]));
    const { files, entries, broken } = readSolutionFiles(dir);
    expect(files).toEqual(['bad.json', 'good.json', 'nameless.json', 'shape.json']);
    expect(entries).toHaveLength(1);
    expect(broken).toHaveLength(3);
    expect(broken.join(' ')).toContain('nameless.json: write-up 1 has no name');
  });

  it('says plainly when the write-ups are not on this machine', () => {
    expect(() => readSolutionFiles(join(dir, 'missing'))).toThrow(/does not exist/);
  });
});
