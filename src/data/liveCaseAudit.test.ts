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
import { audit, auditCase, formatReport, formatSummary, measureCaps, readSolutionFiles, summarise, type AuditRules } from '../../scripts/liveCaseAudit.mjs';

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
    expect(caps).toMatchObject({ exhibits: 12, panels: 4, structure: 8, clarifyingQuestions: 5, takeaways: 3 });
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
    expect(withExhibits.beats).toMatchObject({ total: 2, exhibits: 2, steps: 0 });
    const withSteps = one({ exhibits: [], steps: [{ title: 'Size the market', body: 'a' }, { title: 'Check the costs', body: 'b' }] });
    expect(withSteps.beats).toMatchObject({ total: 2, exhibits: 0, steps: 2 });
    expect(withExhibits.beats.total).toBe(planFor(readSolution(writeUp({ exhibits: [exhibit(), exhibit({ title: 'Exhibit 2: Costs' })] }))!).beats.length);
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
    expect(one().flags).toContain('fewer_than_2_beats');
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

  it('flags a write-up that is not live-eligible, and one the Full solution screen would refuse', () => {
    expect(one({ confidence: 'partial' }).flags).toContain('not_live_eligible');
    expect(one({ steps: [] }).flags).toContain('full_solution_refused');
    expect(one().flags).not.toContain('not_live_eligible');
  });
});

describe('the whole run', () => {
  const result = audit(
    [
      writeUp(),
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
    expect(s.beats.get(2)).toBe(1);
    expect(s.flags.get('not_live_eligible')).toBe(1);
    expect(s.flags.get('fewer_than_2_beats')).toBe(1);
    const text = formatSummary(s);
    for (const line of ['live-eligible', 'cases with no candidate exhibit', 'hidden from the candidate', 'a chart is drawn', 'Beats per case', 'clarifying questions']) {
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
