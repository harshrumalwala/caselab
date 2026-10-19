import { describe, expect, it } from 'vitest';
import { MAIN_CASE_TYPES, type CaseType } from './constants';
import { applyFilters, DEFAULT_FILTERS, keyImprovement } from './caseFilters';
import { limitedExposure, skillsToImprove } from './improvement';
import { ALL, conceptsFromCases, filterConcepts, groupConceptsByIndustry, splitConcepts } from './knowledge';
import { milestones, newMilestones, nextCountMilestone } from './milestones';
import { MAX_SUGGESTIONS, nextPracticeFocus } from './suggestions';
import { NOW, casesWithRatings, makeCase } from '../test/builders';

describe('milestones', () => {
  it('derives count milestones with the date of the case that reached them', () => {
    const cases = Array.from({ length: 6 }, (_, i) => makeCase({ date: `2026-10-0${i + 1}` }));
    const counts = milestones(cases).filter((m) => m.kind === 'count');
    expect(counts).toEqual([{ id: 'count-5', label: '5 cases completed', date: '2026-10-05', kind: 'count' }]);
    expect(nextCountMilestone(6)).toEqual({ target: 10, remaining: 4 });
    expect(nextCountMilestone(100)).toBeNull();
  });

  it('marks the first case in each industry once, and ignores blank industries', () => {
    const cases = [
      makeCase({ date: '2026-10-01', industry: 'Insurance' }),
      makeCase({ date: '2026-10-02', industry: 'Insurance' }),
      makeCase({ date: '2026-10-03', industry: 'Energy / Utilities' }),
      makeCase({ date: '2026-10-04', industry: '' }),
    ];
    const labels = milestones(cases)
      .filter((m) => m.kind === 'industry')
      .map((m) => m.label);
    expect(labels).toEqual(['First Insurance case', 'First Energy / Utilities case']);
  });

  it('awards "every main case type" only once all 12 (excluding Other) are covered', () => {
    const eleven = MAIN_CASE_TYPES.slice(0, 11).map((t, i) => makeCase({ caseType: t, date: `2026-09-${10 + i}` }));
    expect(milestones(eleven).some((m) => m.kind === 'caseTypes')).toBe(false);
    const twelve = [...eleven, makeCase({ caseType: MAIN_CASE_TYPES[11], date: '2026-09-30' })];
    const hit = milestones(twelve).find((m) => m.kind === 'caseTypes');
    expect(hit?.date).toBe('2026-09-30');
  });

  it('reports only what a newly saved case unlocked', () => {
    const before = [makeCase({ industry: 'Insurance', date: '2026-10-01' })];
    const added = makeCase({ industry: 'Telecom / Media', date: '2026-10-02' });
    expect(newMilestones(before, [...before, added]).map((m) => m.label)).toEqual(['First Telecom / Media case']);
  });
});

describe('next practice focus (A6)', () => {
  it('stays empty with no cases rather than inventing advice', () => {
    expect(nextPracticeFocus([])).toEqual([]);
  });

  it('uses coverage gaps (not trends) for fewer than five cases, even with terrible ratings', () => {
    const cases = casesWithRatings('framework', [1, 1, 1, 1]);
    const kinds = nextPracticeFocus(cases).map((s) => s.kind);
    expect(kinds).not.toContain('skill');
    expect(kinds).not.toContain('decline');
    expect(kinds).toContain('caseType');
  });

  it('surfaces a weak skill from the last five ratings, citing the real average', () => {
    const cases = casesWithRatings('framework', [3, 2, 3, 2, 2]); // mean 2.4
    const [first] = nextPracticeFocus(cases);
    expect(first.kind).toBe('skill');
    expect(first.text).toContain('Framework');
    expect(first.text).toContain('2.4');
    expect(first.text).toMatch(/structuring/i);
  });

  it('does not flag a skill that is rated well', () => {
    const cases = casesWithRatings('framework', [4, 4, 5, 4, 4]);
    expect(nextPracticeFocus(cases).some((s) => s.kind === 'skill')).toBe(false);
  });

  it('notices when the last three cases share a case type and offers alternatives', () => {
    const types: CaseType[] = ['Market Entry', 'Revenue', 'Profitability', 'Profitability', 'Profitability'];
    const cases = casesWithRatings('framework', [4, 4, 4, 4, 4], types);
    const hit = nextPracticeFocus(cases).find((s) => s.kind === 'concentration');
    expect(hit?.text).toContain('last three cases were all Profitability');
    expect(hit?.action?.caseType).toBeDefined();
    expect(hit?.action?.caseType).not.toBe('Profitability');
  });

  it('names an industry gap and returns at most three suggestions', () => {
    const cases = casesWithRatings('framework', [2, 2, 2, 2, 2], ['Profitability', 'Profitability', 'Profitability', 'Profitability', 'Profitability']);
    const out = nextPracticeFocus(cases);
    expect(out.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    expect(out.some((s) => s.text.includes("haven't practiced any Healthcare"))).toBe(false); // SaaS cases only
    const none = nextPracticeFocus([makeCase({ industry: 'Healthcare / Pharmaceuticals' })]);
    expect(none.some((s) => s.kind === 'industry')).toBe(true);
    expect(none.find((s) => s.kind === 'industry')?.text).not.toContain('Healthcare');
  });

  it('quotes the next-focus note you wrote on your latest case', () => {
    const cases = [
      makeCase({ date: '2026-10-01', title: 'Older', nextFocus: 'old note' }),
      makeCase({ date: '2026-10-02', title: 'Latest case', nextFocus: 'Work on synthesis' }),
    ];
    const fb = nextPracticeFocus(cases).find((s) => s.kind === 'feedback');
    expect(fb?.text).toContain('Latest case');
    expect(fb?.text).toContain('Work on synthesis');
  });
});

describe('improvement areas (B)', () => {
  it('separates no exposure from limited exposure and never lists "Other"', () => {
    const cases = [
      makeCase({ caseType: 'Profitability', industry: 'Insurance', title: 'One' }),
      makeCase({ caseType: 'Market Entry', industry: 'Insurance', title: 'Two' }),
      makeCase({ caseType: 'Market Entry', industry: 'Energy / Utilities', title: 'Three' }),
    ];
    const e = limitedExposure(cases);
    expect(e.caseTypesNone).toHaveLength(10);
    expect(e.caseTypesNone).not.toContain('Profitability');
    expect(e.caseTypesNone).not.toContain('Other');
    expect(e.caseTypesOnce).toEqual([{ name: 'Profitability', caseTitle: 'One' }]);
    expect(e.industriesNone).toContain('Healthcare / Pharmaceuticals');
    expect(e.industriesNone).not.toContain('Insurance');
    expect(e.industriesOnce).toEqual([{ name: 'Energy / Utilities', caseTitle: 'Three' }]);
  });

  it('needs three cases before ranking skills', () => {
    expect(skillsToImprove(casesWithRatings('framework', [1, 1]))).toEqual([]);
  });

  it('ranks low-rated and declining skills, and leaves strong ones out', () => {
    const cases = casesWithRatings('framework', [2, 2, 2, 2, 2, 2, 2, 2]).map((c, i) =>
      makeCase({ ...c, skills: { framework: 2, quant: 5, recommendation: i < 3 ? 5 : 2 } }),
    );
    const list = skillsToImprove(cases);
    // Recommendation is both low (last five all 2s) and declining (5,5,5 then 2s), so it
    // outranks framework, which is low but flat.
    expect(list.map((p) => p.key)).toEqual(['recommendation', 'framework']);
    expect(list.find((p) => p.key === 'recommendation')?.trend).toBe('declining');
    expect(list.find((p) => p.key === 'framework')?.trend).toBe('steady');
  });

  it('uses your explicit improvement tags as a theme once repeated', () => {
    const cases = [
      makeCase({ date: '2026-10-01', improvementArea: 'prompt' }),
      makeCase({ date: '2026-10-02', improvementArea: 'prompt' }),
      makeCase({ date: '2026-10-03', improvementArea: 'quant' }),
    ];
    const list = skillsToImprove(cases);
    expect(list.map((p) => p.key)).toEqual(['prompt']);
    expect(list[0].reasons.join(' ')).toContain('2 of your last 3 cases');
  });
});

describe('knowledge history (C)', () => {
  it('has nothing until you write something down', () => {
    expect(conceptsFromCases([makeCase({})])).toEqual([]);
  });

  it('splits notes into items on lines and semicolons, not commas', () => {
    expect(splitConcepts('- Load factor\n• Churn; Unit economics\n1. NPV\n\n  ')).toEqual([
      'Load factor',
      'Churn',
      'Unit economics',
      'NPV',
    ]);
    expect(splitConcepts('Learned load factor, capacity and yield')).toEqual(['Learned load factor, capacity and yield']);
  });

  it('merges repeated concepts across cases and groups them by industry', () => {
    const cases = [
      makeCase({ date: '2026-10-01', industry: 'Transportation / Logistics', concepts: 'Load factor\nYield' }),
      makeCase({ date: '2026-10-05', industry: 'Transportation / Logistics', concepts: 'load  factor', title: 'Second' }),
      makeCase({ date: '2026-10-03', industry: 'Technology / SaaS', concepts: 'Churn', caseType: 'Revenue' }),
    ];
    const concepts = conceptsFromCases(cases);
    expect(concepts).toHaveLength(3);
    expect(concepts.find((c) => c.text === 'Load factor')?.sources).toHaveLength(2);

    const groups = groupConceptsByIndustry(concepts);
    expect(groups.map((g) => [g.label, g.concepts.length])).toEqual([
      ['Transportation / Logistics', 2],
      ['Technology / SaaS', 1],
    ]);
  });

  it('filters by industry, case type and search text', () => {
    const concepts = conceptsFromCases([
      makeCase({ industry: 'Technology / SaaS', caseType: 'Revenue', concepts: 'Churn' }),
      makeCase({ industry: 'Transportation / Logistics', caseType: 'Profitability', concepts: 'Load factor' }),
    ]);
    const base = { industry: ALL, caseType: ALL, query: '' };
    expect(filterConcepts(concepts, { ...base, industry: 'Technology / SaaS' }).map((c) => c.text)).toEqual(['Churn']);
    expect(filterConcepts(concepts, { ...base, caseType: 'Profitability' }).map((c) => c.text)).toEqual(['Load factor']);
    expect(filterConcepts(concepts, { ...base, query: 'LOAD' }).map((c) => c.text)).toEqual(['Load factor']);
  });
});

describe('case log filters', () => {
  const cases = [
    makeCase({ id: 'a', title: 'Airline profitability', date: '2026-10-20', caseType: 'Profitability', industry: 'Transportation / Logistics', overall: 4 }),
    makeCase({ id: 'b', title: 'Bank entry', date: '2026-10-10', caseType: 'Market Entry', industry: 'Financial Services', overall: 2, source: 'Casebook' }),
    makeCase({ id: 'c', title: 'Retail sizing', date: '2026-08-01', caseType: 'Market Sizing', industry: 'Consumer Products / Retail', overall: null }),
    makeCase({ id: 'd', title: 'SaaS pricing', date: '2026-10-15', caseType: 'Revenue', industry: 'Technology / SaaS', overall: 3, partner: 'Alex' }),
  ];
  const ids = (f: Partial<typeof DEFAULT_FILTERS>) => applyFilters(cases, { ...DEFAULT_FILTERS, ...f }, NOW).map((c) => c.id);

  it('searches titles (and source / partner)', () => {
    expect(ids({ query: 'airline' })).toEqual(['a']);
    expect(ids({ query: 'casebook' })).toEqual(['b']);
    expect(ids({ query: 'alex' })).toEqual(['d']);
    expect(ids({ query: 'zzz' })).toEqual([]);
  });

  it('filters by industry, case type, date and performance', () => {
    expect(ids({ industry: 'Financial Services' })).toEqual(['b']);
    expect(ids({ caseType: 'Revenue' })).toEqual(['d']);
    expect(ids({ datePreset: '7d' })).toEqual(['a', 'd']); // today (Oct 21) and the 6 days before: Oct 15..21
    expect(ids({ datePreset: '30d' })).toEqual(['a', 'd', 'b']);
    expect(ids({ datePreset: 'custom', from: '2026-08-01', to: '2026-10-10' })).toEqual(['b', 'c']);
    expect(ids({ score: 'strong' })).toEqual(['a']);
    expect(ids({ score: 'developing' })).toEqual(['d']);
    expect(ids({ score: 'needs' })).toEqual(['b']);
    expect(ids({ score: 'unrated' })).toEqual(['c']);
  });

  it('sorts, always sinking unrated cases below rated ones', () => {
    expect(ids({ sort: 'newest' })).toEqual(['a', 'd', 'b', 'c']);
    expect(ids({ sort: 'oldest' })).toEqual(['c', 'b', 'd', 'a']);
    expect(ids({ sort: 'highest' })).toEqual(['a', 'd', 'b', 'c']);
    expect(ids({ sort: 'lowest' })).toEqual(['b', 'd', 'a', 'c']);
  });

  it('derives the key improvement area from your tag, else your lowest rating (<= 3)', () => {
    expect(keyImprovement(makeCase({ improvementArea: 'framework' }))).toEqual({ label: 'Framework', source: 'tag' });
    expect(keyImprovement(makeCase({ skills: { quant: 2, framework: 4 } }))).toEqual({ label: 'Quant / Math', source: 'lowest' });
    expect(keyImprovement(makeCase({ skills: { quant: 4, framework: 5 } }))).toBeNull();
    expect(keyImprovement(makeCase({}))).toBeNull();
  });
});
