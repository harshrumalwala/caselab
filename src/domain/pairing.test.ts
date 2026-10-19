import { describe, expect, it } from 'vitest';
import type { SharedCase } from './community';
import { compareTitles, distinctValues, matchesFilter, NO_FILTER, pairCases, titleTokens } from './pairing';
import { makeCase } from '../test/builders';

const theirs = (title: string, over: Partial<SharedCase> = {}): SharedCase => ({
  caseId: `s-${title}`,
  ownerId: 'bob',
  date: '2026-10-01',
  title,
  source: '',
  caseType: 'Profitability',
  industry: 'Technology / SaaS',
  overall: null,
  skillScores: null,
  feedback: null,
  improvementArea: null,
  notes: null,
  ...over,
});

describe('matching case titles', () => {
  it('tidies titles into comparable words', () => {
    expect(titleTokens('The Airline Profit Case!')).toEqual(['airline', 'profit']);
    expect(titleTokens('Hospitals: market entry (practice)')).toEqual(['hospital', 'market', 'entry']);
  });

  it('treats differently typed versions of the same title as the same case', () => {
    expect(compareTitles('Airline Profitability', 'airline profitability case')).toBe('same');
    expect(compareTitles('Piano tuners', 'The piano tuner case')).toBe('same');
    expect(compareTitles('Regional airline profit', 'Regional Airline Profitability')).toBe('same');
  });

  it('flags a looser overlap as similar, to be double-checked, never as the same', () => {
    expect(compareTitles('Airline profitability', 'Regional airline profitability')).toBe('similar');
  });

  it('does not match different cases that merely share a word or an industry', () => {
    expect(compareTitles('Airline profitability', 'Airline growth strategy')).toBeNull();
    expect(compareTitles('Coffee chain', 'Tea chain')).toBeNull();
    expect(compareTitles('Case', '')).toBeNull();
    expect(compareTitles('Hospital entry', 'Hospital merger')).toBeNull();
  });
});

describe('pairing my cases with what someone shared', () => {
  const mine = [
    makeCase({ title: 'Airline profitability', caseType: 'Profitability', industry: 'Transportation / Logistics', date: '2026-09-01' }),
    makeCase({ title: 'Hospital market entry', caseType: 'Market Entry', industry: 'Healthcare / Pharmaceuticals', date: '2026-09-02' }),
    makeCase({ title: 'Piano tuners', caseType: 'Market Sizing', industry: 'Other', date: '2026-09-03' }),
    makeCase({ title: 'Regional hospital market entry strategy', caseType: 'Market Entry', industry: 'Healthcare / Pharmaceuticals', date: '2026-09-04' }),
  ];

  it('offers cases they have not shared, and separates ones they already have', () => {
    const p = pairCases(mine, [theirs('airline profitability case'), theirs('Bank M&A', { caseType: 'Mergers and Acquisitions' })]);
    expect(p.newToThem.map((c) => c.title).sort()).toEqual(['Hospital market entry', 'Piano tuners', 'Regional hospital market entry strategy'].sort());
    expect(p.theyHaveDone.map((t) => [t.shared.title, t.mine?.match ?? null])).toEqual([
      ['airline profitability case', 'same'],
      ['Bank M&A', null],
    ]);
  });

  it('puts only similar-looking cases in a separate check-first group', () => {
    const p = pairCases(mine, [theirs('Hospital market entry', { caseType: 'Market Entry' })]);
    expect(p.newToThem.map((c) => c.title)).not.toContain('Hospital market entry'); // same: excluded
    expect(p.mayOverlap).toEqual([
      { mine: expect.objectContaining({ title: 'Regional hospital market entry strategy' }), theirTitle: 'Hospital market entry' },
    ]);
    expect(p.newToThem.map((c) => c.title)).not.toContain('Regional hospital market entry strategy');
  });

  it('lists a case once even if I practiced it twice', () => {
    const twice = [...mine, makeCase({ title: 'airline profitability case', date: '2026-10-01' })];
    expect(pairCases(twice, []).newToThem.filter((c) => /airline/i.test(c.title))).toHaveLength(1);
  });

  it('shows type and industry gaps in their shared history, and what I can offer there', () => {
    const p = pairCases(mine, [theirs('One', { caseType: 'Profitability' }), theirs('Two', { caseType: 'Profitability' }), theirs('Three', { caseType: 'Profitability' })]);
    const gap = (name: string) => p.caseTypeGaps.find((g) => g.name === name);
    expect(gap('Profitability')).toMatchObject({ theirCount: 3, offerable: 1 });
    expect(gap('Market Entry')).toMatchObject({ theirCount: 0, offerable: 2 });
    expect(p.caseTypeGaps[0].theirCount).toBe(0);
    expect(p.caseTypeGaps.at(-1)?.name).toBe('Profitability'); // most-practiced last
    expect(p.industryGaps.find((g) => g.name === 'Healthcare / Pharmaceuticals')).toMatchObject({ theirCount: 0, offerable: 2 });
  });

  it('with nothing shared, claims nothing about what they have done', () => {
    const p = pairCases(mine, []);
    expect(p.theyHaveDone).toEqual([]);
    expect(p.newToThem).toHaveLength(4);
    expect(p.caseTypeGaps.every((g) => g.theirCount === 0)).toBe(true);
  });
});

describe('filters', () => {
  const rows = [
    { title: 'Airline profit', source: 'Booth casebook', industry: 'Transportation / Logistics', caseType: 'Profitability' },
    { title: 'Bank entry', source: 'Case in Point', industry: 'Financial Services', caseType: 'Market Entry' },
  ];
  const ids = (f: Partial<typeof NO_FILTER>) => rows.filter((r) => matchesFilter(r, { ...NO_FILTER, ...f })).map((r) => r.title);

  it('filters by name, casebook, industry and case type', () => {
    expect(ids({})).toEqual(['Airline profit', 'Bank entry']);
    expect(ids({ query: 'AIRLINE' })).toEqual(['Airline profit']);
    expect(ids({ query: 'point' })).toEqual(['Bank entry']); // matches the casebook
    expect(ids({ source: 'booth CASEBOOK' })).toEqual(['Airline profit']);
    expect(ids({ industry: 'Financial Services' })).toEqual(['Bank entry']);
    expect(ids({ caseType: 'Profitability' })).toEqual(['Airline profit']);
  });

  it('lists distinct sources and industries for the drop-downs', () => {
    expect(distinctValues([...rows, { ...rows[0], source: 'booth casebook ' }], 'source')).toEqual(['Booth casebook', 'Case in Point']);
    expect(distinctValues(rows, 'industry')).toEqual(['Financial Services', 'Transportation / Logistics']);
  });
});
