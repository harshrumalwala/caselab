import { describe, expect, it } from 'vitest';
import type { SharedCase } from './community';
import { giveNextView, MIN_SHARED_FOR_SKILL, whatToGiveNext } from './giveNext';
import { MIN_CASES_FOR_TRENDS } from './suggestions';
import { CASE_TYPES, CASE_TYPE_PRIORITY, INDUSTRIES, INDUSTRY_PRIORITY } from './constants';

const shared = (over: Partial<SharedCase> & { title: string }): SharedCase => ({
  caseId: `s-${over.title}`,
  ownerId: 'bob',
  date: '2026-10-01',
  source: '',
  partner: '',
  otherNotes: '',
  caseType: 'Profitability',
  industry: 'Technology / SaaS',
  overall: null,
  skillScores: null,
  feedback: null,
  improvementArea: null,
  notes: null,
  ...over,
});

/** `n` cases of one type and industry, with distinct titles. */
const many = (n: number, over: Partial<SharedCase> = {}): SharedCase[] =>
  Array.from({ length: n }, (_, i) => shared({ title: `Case ${over.caseType ?? ''} ${over.industry ?? ''} ${i}`, ...over }));

describe('what to give someone next, from what they share', () => {
  it('has nothing to say about a member who shares no case history', () => {
    const ideas = whatToGiveNext([]);
    expect(ideas.total).toBe(0);
    expect(ideas.enough).toBe(false);
    expect([ideas.coveredTypes, ideas.coveredIndustries, ideas.unseenTypes, ideas.unseenIndustries]).toEqual([[], [], [], []]);
    expect(ideas.focus).toBeNull();
  });

  it('stays silent below the minimum the rest of the app uses, and shows coverage only', () => {
    const few = many(MIN_CASES_FOR_TRENDS - 1, { caseType: 'Profitability', industry: 'Technology / SaaS' });
    const ideas = whatToGiveNext(few);
    expect(ideas.total).toBe(MIN_CASES_FOR_TRENDS - 1);
    expect(ideas.enough).toBe(false);
    // Coverage is still there: it is only a count of their own rows.
    expect(ideas.coveredTypes).toEqual([{ name: 'Profitability', count: MIN_CASES_FOR_TRENDS - 1 }]);
    expect(ideas.coveredIndustries).toEqual([{ name: 'Technology / SaaS', count: MIN_CASES_FOR_TRENDS - 1 }]);
    // No suggestion of any kind, however obvious the gaps look.
    expect([ideas.unseenTypes, ideas.onceTypes, ideas.unseenIndustries, ideas.onceIndustries]).toEqual([[], [], [], []]);
  });

  it('names what they have never shared and what they have shared once, from the minimum upwards', () => {
    const cases = [
      ...many(3, { caseType: 'Profitability', industry: 'Technology / SaaS' }),
      ...many(1, { caseType: 'Market Sizing', industry: 'Financial Services' }),
      ...many(1, { caseType: 'Market Entry', industry: 'Financial Services' }),
    ];
    const ideas = whatToGiveNext(cases);
    expect(ideas.total).toBe(MIN_CASES_FOR_TRENDS);
    expect(ideas.enough).toBe(true);
    expect(ideas.onceTypes).toEqual(['Market Entry', 'Market Sizing']); // interview-frequency order, not alphabetical
    expect(ideas.unseenTypes[0]).toBe('Growth Strategy');
    expect(ideas.unseenTypes).not.toContain('Profitability');
    expect(ideas.onceIndustries).toEqual([]); // Financial Services has two
    expect(ideas.unseenIndustries[0]).toBe('Healthcare / Pharmaceuticals');
    expect(ideas.unseenIndustries).not.toContain('Technology / SaaS');
  });

  it('never names the catch-all "Other" as something to practise, in either list', () => {
    const cases = [
      ...many(4, { caseType: 'Profitability', industry: 'Technology / SaaS' }),
      ...many(1, { caseType: 'Other', industry: 'Other' }),
    ];
    const ideas = whatToGiveNext(cases);
    expect(ideas.enough).toBe(true);
    expect([...ideas.unseenTypes, ...ideas.onceTypes]).not.toContain('Other');
    expect([...ideas.unseenIndustries, ...ideas.onceIndustries]).not.toContain('Other');
    // It is still counted as something they have done.
    expect(ideas.coveredTypes).toContainEqual({ name: 'Other', count: 1 });
    expect(ideas.coveredIndustries).toContainEqual({ name: 'Other', count: 1 });
  });

  it('counts an industry they typed themselves as covered, but never calls an unnamed one a gap', () => {
    const cases = [...many(4, { industry: 'Agritech' }), ...many(1, { industry: 'agritech' })];
    const ideas = whatToGiveNext(cases);
    expect(ideas.coveredIndustries).toEqual([{ name: 'Agritech', count: 5 }]); // folded, however it was typed
    expect(ideas.unseenIndustries.every((i) => (INDUSTRIES as readonly string[]).includes(i))).toBe(true);
    expect(ideas.onceIndustries).toEqual([]);
  });

  it('says nothing is missing when they have shared at least two of everything', () => {
    const cases = CASE_TYPES.flatMap((caseType) => INDUSTRIES.flatMap((industry) => many(2, { caseType, industry })));
    const ideas = whatToGiveNext(cases);
    expect(ideas.enough).toBe(true);
    expect([ideas.unseenTypes, ideas.onceTypes, ideas.unseenIndustries, ideas.onceIndustries]).toEqual([[], [], [], []]);
  });

  it("reports the member's own improvement focus, most tagged first, with the count behind it", () => {
    const cases = [
      ...many(3, { caseType: 'Profitability' }).map((c) => ({ ...c, improvementArea: 'quant' as const })),
      ...many(2, { caseType: 'Revenue' }).map((c) => ({ ...c, improvementArea: 'framework' as const })),
    ];
    expect(whatToGiveNext(cases).focus).toEqual({ key: 'quant', label: 'Quant / Math', count: 3 });
  });

  it('reports no focus when they do not share it, whatever else they share', () => {
    expect(whatToGiveNext(many(8)).focus).toBeNull();
  });

  it('reports their focus even when there are too few cases to suggest anything', () => {
    const ideas = whatToGiveNext([shared({ title: 'One', improvementArea: 'exhibits' })]);
    expect(ideas.enough).toBe(false);
    expect(ideas.focus).toEqual({ key: 'exhibits', label: 'Exhibits & Charts', count: 1 });
  });

  it('breaks a tie between focus tags by the order the app lists skills in', () => {
    const cases = [
      shared({ title: 'A', improvementArea: 'recommendation' }),
      shared({ title: 'B', improvementArea: 'framework' }),
    ];
    expect(whatToGiveNext(cases).focus?.key).toBe('framework');
  });

  it('orders what they have covered by how much of it there is', () => {
    const cases = [
      ...many(1, { caseType: 'Market Entry', industry: 'Insurance' }),
      ...many(3, { caseType: 'Revenue', industry: 'Financial Services' }),
      ...many(2, { caseType: 'Profitability', industry: 'Technology / SaaS' }),
    ];
    const ideas = whatToGiveNext(cases);
    expect(ideas.coveredTypes.map((c) => c.name)).toEqual(['Revenue', 'Profitability', 'Market Entry']);
    expect(ideas.coveredIndustries.map((c) => c.name)).toEqual(['Financial Services', 'Technology / SaaS', 'Insurance']);
  });

  it('leaves a case with no industry out of the industry counts without losing the case', () => {
    const cases = [...many(4, { industry: '' }), ...many(1, { industry: 'Insurance' })];
    const ideas = whatToGiveNext(cases);
    expect(ideas.total).toBe(5);
    expect(ideas.coveredIndustries).toEqual([{ name: 'Insurance', count: 1 }]);
    expect(ideas.onceIndustries).toEqual(['Insurance']);
  });
});

describe('the pairing view a profile link is drawn from', () => {
  /** `n` rated cases, every one carrying the same skill scores. */
  const rated = (n: number, scores: Record<string, number>, over: Partial<SharedCase> = {}): SharedCase[] =>
    Array.from({ length: n }, (_, i) =>
      shared({ title: `Rated ${Object.keys(scores).join('-')} ${i}`, skillScores: scores as SharedCase['skillScores'], ...over }),
    );

  it('lays out every main case type with its count, least practised first', () => {
    const cases = [
      ...many(3, { caseType: 'Profitability' }),
      ...many(1, { caseType: 'Market Entry' }),
      ...many(1, { caseType: 'Revenue' }),
    ];
    const view = giveNextView(cases);
    // Nothing is left out: every main type is there, cased or not.
    expect(view.typeLane).toHaveLength(CASE_TYPE_PRIORITY.length);
    expect(view.typeLane.map((a) => a.count)).toEqual([...view.typeLane.map((a) => a.count)].sort((a, b) => a - b));
    expect(view.typeLane[0].count).toBe(0);
    expect(view.typeLane.at(-1)).toEqual({ name: 'Profitability', count: 3, band: 'multiple' });
    expect(view.typeLane.find((a) => a.name === 'Market Entry')).toEqual({ name: 'Market Entry', count: 1, band: 'once' });
    expect(view.typeLane.filter((a) => a.band === 'none').map((a) => a.name)).toEqual(view.unseenTypes);
  });

  it('keeps the catch-all "Other" out of the lane unless they have actually cased it', () => {
    const plain = giveNextView(many(5, { caseType: 'Profitability' }));
    expect(plain.typeLane.map((a) => a.name)).not.toContain('Other');

    const withOther = giveNextView([...many(5, { caseType: 'Profitability' }), ...many(1, { caseType: 'Other' })]);
    expect(withOther.typeLane).toContainEqual({ name: 'Other', count: 1, band: 'once' });
  });

  it('shows only what is in the cases, with no gaps named, below the minimum', () => {
    const view = giveNextView(many(MIN_CASES_FOR_TRENDS - 1, { caseType: 'Profitability', industry: 'Insurance' }));
    expect(view.enough).toBe(false);
    expect(view.typeLane).toEqual([{ name: 'Profitability', count: 4, band: 'multiple' }]);
    expect(view.industryLane).toEqual([{ name: 'Insurance', count: 4, band: 'multiple' }]);
  });

  it('counts an industry they typed themselves, however they spelled it, and never calls an unnamed one a gap', () => {
    const view = giveNextView([...many(4, { industry: 'Agritech' }), ...many(1, { industry: 'agritech' })]);
    expect(view.industryLane).toContainEqual({ name: 'Agritech', count: 5, band: 'multiple' });
    expect(view.industryLane.filter((a) => a.band === 'none').map((a) => a.name)).toEqual(INDUSTRY_PRIORITY);
  });

  it('puts the scores they share in order, strongest first, with the number of cases behind each', () => {
    const cases = [
      ...rated(4, { framework: 5, quant: 3, exhibits: 4 }),
      ...rated(1, { framework: 4, quant: 3, exhibits: 4 }, { caseType: 'Revenue' }),
    ];
    const view = giveNextView(cases);
    expect(view.scores.map((s) => [s.label, s.average, s.count])).toEqual([
      ['Framework', 4.8, 5],
      ['Exhibits & Charts', 4, 5],
      ['Quant / Math', 3, 5],
    ]);
    expect(view.scores.some((s) => s.thin)).toBe(false);
    expect(view.thinScores).toEqual([]);
  });

  it('holds a score back from the strengths until enough shared cases carry it', () => {
    const skill = { framework: 5 };
    const below = giveNextView(rated(MIN_SHARED_FOR_SKILL - 1, skill));
    const at = giveNextView(rated(MIN_SHARED_FOR_SKILL, skill));
    const above = giveNextView(rated(MIN_SHARED_FOR_SKILL + 1, skill));

    expect(below.scores).toEqual([]);
    expect(below.thinScores.map((s) => [s.label, s.count, s.thin])).toEqual([['Framework', MIN_SHARED_FOR_SKILL - 1, true]]);
    expect(at.scores.map((s) => [s.label, s.count, s.thin])).toEqual([['Framework', MIN_SHARED_FOR_SKILL, false]]);
    expect(at.thinScores).toEqual([]);
    expect(above.scores.map((s) => s.count)).toEqual([MIN_SHARED_FOR_SKILL + 1]);
    expect(above.thinScores).toEqual([]);
  });

  it('never lets one case be the headline, high or low', () => {
    // The shape of the owner's own link: eighteen cases carrying two skills, one later case carrying two more.
    const cases = [
      ...rated(18, { framework: 4, quant: 3 }),
      ...rated(1, { behavioral1: 2, prompt: 5 }, { caseType: 'Revenue' }),
    ];
    const view = giveNextView(cases);
    expect(view.scores.map((s) => s.label)).toEqual(['Framework', 'Quant / Math']);
    // Both one-case scores sit in the quiet line, the 5 as much as the 2.
    expect(view.thinScores.map((s) => [s.label, s.average, s.count])).toEqual([
      ['Behavioral', 2, 1],
      ['Prompt / Pre-framework', 5, 1],
    ]);
  });

  it('reads the overall score as one of the scores they share', () => {
    const cases = Array.from({ length: 3 }, (_, i) => shared({ title: `Overall ${i}`, overall: 4 }));
    expect(giveNextView(cases).scores.map((s) => [s.key, s.average])).toEqual([['overall', 4]]);
  });

  it('has no scores at all for a member who shares none', () => {
    const view = giveNextView(many(6));
    expect([view.scores, view.thinScores]).toEqual([[], []]);
  });

  it("carries the member's own improvement tag, and everything the older rules already worked out", () => {
    const cases = many(5, { caseType: 'Profitability' }).map((c) => ({ ...c, improvementArea: 'quant' as const }));
    const view = giveNextView(cases);
    expect(view.focus).toEqual({ key: 'quant', label: 'Quant / Math', count: 5 });
    expect(view.total).toBe(5);
    expect(view.enough).toBe(true);
    expect(view.coveredTypes).toEqual([{ name: 'Profitability', count: 5 }]);
  });
});
