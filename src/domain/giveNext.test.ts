import { describe, expect, it } from 'vitest';
import type { SharedCase } from './community';
import { whatToGiveNext } from './giveNext';
import { MIN_CASES_FOR_TRENDS } from './suggestions';
import { CASE_TYPES, INDUSTRIES } from './constants';

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
