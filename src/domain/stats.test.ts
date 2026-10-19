import { describe, expect, it } from 'vitest';
import { CASE_TYPES, INDUSTRIES } from './constants';
import {
  canonicalIndustry,
  caseSkillValue,
  caseTypeCounts,
  coverageMatrix,
  industryCounts,
  overallTrend,
  overview,
  skillStats,
  weeklyHistory,
} from './stats';
import { NOW, casesWithRatings, makeCase } from '../test/builders';

const stat = (cases: ReturnType<typeof makeCase>[], key: string) => skillStats(cases).find((s) => s.key === key)!;

describe('overview (A1)', () => {
  it('reports zeros, not made-up numbers, with no cases', () => {
    const o = overview([], NOW);
    expect(o).toMatchObject({ total: 0, thisWeek: 0, caseTypesCovered: 0, industriesCovered: 0 });
    expect(o.caseTypesTotal).toBe(13);
  });

  it('counts cases in the current Monday-Sunday calendar week only', () => {
    // NOW is Wed 21 Oct 2026, so the week is Mon 19 Oct .. Sun 25 Oct.
    const cases = [
      makeCase({ date: '2026-10-18' }), // Sunday before: last week
      makeCase({ date: '2026-10-19' }), // Monday: in
      makeCase({ date: '2026-10-21' }), // today: in
      makeCase({ date: '2026-10-25' }), // Sunday: in
      makeCase({ date: '2026-10-26' }), // next Monday: out
    ];
    expect(overview(cases, NOW).thisWeek).toBe(3);
    expect(overview(cases, NOW).total).toBe(5);
  });

  it('counts distinct case types and industries (case-insensitively), ignoring blank industries', () => {
    const cases = [
      makeCase({ caseType: 'Profitability', industry: 'Technology / SaaS' }),
      makeCase({ caseType: 'Profitability', industry: 'technology / saas' }),
      makeCase({ caseType: 'Market Entry', industry: 'Aerospace' }),
      makeCase({ caseType: 'Revenue', industry: '' }), // e.g. imported from the MCG sheet
    ];
    const o = overview(cases, NOW);
    expect(o.caseTypesCovered).toBe(3);
    expect(o.industriesCovered).toBe(2);
    expect(o.presetIndustriesCovered).toBe(1);
    expect(o.customIndustriesCovered).toBe(1);
  });
});

describe('skill averages (A2)', () => {
  it('ignores unrated skills instead of treating them as zero', () => {
    const cases = casesWithRatings('framework', [2, null, 4]);
    const s = stat(cases, 'framework');
    expect(s.count).toBe(2);
    expect(s.average).toBe(3);
  });

  it('has no average at all when a skill was never rated', () => {
    const s = stat(casesWithRatings('framework', [null, null]), 'quant');
    expect(s.count).toBe(0);
    expect(s.average).toBeNull();
    expect(s.recentAverage).toBeNull();
  });

  it('combines Behavioral 1 and 2 into one per-case value, using whichever were rated', () => {
    const both = makeCase({ skills: { behavioral1: 2, behavioral2: 4 } });
    const onlyFirst = makeCase({ skills: { behavioral1: 5 } });
    const onlySecond = makeCase({ skills: { behavioral2: 1 } });
    const none = makeCase({});
    expect(caseSkillValue(both, 'behavioral')).toBe(3);
    expect(caseSkillValue(onlyFirst, 'behavioral')).toBe(5);
    expect(caseSkillValue(onlySecond, 'behavioral')).toBe(1);
    expect(caseSkillValue(none, 'behavioral')).toBeNull();
    // Each case counts once: (3 + 5) / 2 = 4, not a pooled mean of 2, 4, 5.
    expect(stat([both, onlyFirst, none], 'behavioral').average).toBe(4);
  });

  it('shows a last-5 average only once there are five ratings', () => {
    expect(stat(casesWithRatings('framework', [1, 2, 3, 4]), 'framework').recentAverage).toBeNull();
    expect(stat(casesWithRatings('framework', [1, 2, 3, 4]), 'framework').windowAverage).toBe(2.5);
    expect(stat(casesWithRatings('framework', [1, 2, 3, 4, 5]), 'framework').recentAverage).toBe(3);
  });

  it('uses the five most recent ratings (by date), skipping cases that did not rate the skill', () => {
    const cases = casesWithRatings('framework', [1, 1, null, 5, 5, 5, 5, 5]);
    const s = stat(cases, 'framework');
    expect(s.count).toBe(7);
    expect(s.recentAverage).toBe(5);
  });

  it('flags improving, declining and steady trends only with enough data', () => {
    const improving = stat(casesWithRatings('framework', [2, 2, 2, 2, 2, 4, 4, 4, 4, 4]), 'framework');
    expect(improving.trend).toBe('improving');
    expect(improving.delta).toBeCloseTo(2);
    expect(improving.firstFive).toBe(2);
    expect(improving.latestFive).toBe(4);

    const declining = stat(casesWithRatings('quant', [4, 4, 4, 2, 2, 2, 2, 2]), 'quant');
    expect(declining.trend).toBe('declining');

    const steady = stat(casesWithRatings('quant', [3, 3, 3, 3, 3, 3, 3, 3]), 'quant');
    expect(steady.trend).toBe('steady');

    // Seven ratings: not enough to compare against earlier cases.
    const tooFew = stat(casesWithRatings('framework', [1, 1, 1, 5, 5, 5, 5]), 'framework');
    expect(tooFew.trend).toBeNull();
    expect(tooFew.firstFive).toBeNull();

    // Nine ratings: a trend, but no non-overlapping first-five vs latest-five yet.
    const nine = stat(casesWithRatings('framework', [1, 1, 1, 1, 5, 5, 5, 5, 5]), 'framework');
    expect(nine.trend).toBe('improving');
    expect(nine.firstFive).toBeNull();
  });
});

describe('overall trend', () => {
  it('only includes rated cases and starts the rolling average at the fifth', () => {
    const cases = [
      makeCase({ date: '2026-10-01', overall: 2 }),
      makeCase({ date: '2026-10-02', overall: null }),
      makeCase({ date: '2026-10-03', overall: 3 }),
      makeCase({ date: '2026-10-04', overall: 4 }),
      makeCase({ date: '2026-10-05', overall: 4 }),
      makeCase({ date: '2026-10-06', overall: 5 }),
    ];
    const points = overallTrend(cases);
    expect(points).toHaveLength(5);
    expect(points.map((p) => p.rolling)).toEqual([null, null, null, null, 3.6]);
  });
});

describe('case type coverage (A3)', () => {
  it('lists all 13 types with the right exposure level', () => {
    const cases = [
      makeCase({ caseType: 'Profitability' }),
      makeCase({ caseType: 'Profitability' }),
      makeCase({ caseType: 'Market Entry' }),
    ];
    const counts = caseTypeCounts(cases);
    expect(counts).toHaveLength(13);
    expect(counts.map((c) => c.caseType)).toEqual([...CASE_TYPES]);
    expect(counts.find((c) => c.caseType === 'Profitability')).toMatchObject({ count: 2, exposure: 'multiple' });
    expect(counts.find((c) => c.caseType === 'Market Entry')).toMatchObject({ count: 1, exposure: 'once' });
    expect(counts.find((c) => c.caseType === 'Mergers and Acquisitions')).toMatchObject({ count: 0, exposure: 'none' });
    expect(counts.reduce((a, c) => a + c.count, 0)).toBe(3);
  });
});

describe('industry coverage (A4)', () => {
  it('always lists the 13 preset industries, with zeros, plus custom industries that have cases', () => {
    const cases = [
      makeCase({ industry: 'Healthcare / Pharmaceuticals' }),
      makeCase({ industry: 'Healthcare / Pharmaceuticals' }),
      makeCase({ industry: 'Aerospace & Defense' }),
      makeCase({ industry: '' }),
    ];
    const rows = industryCounts(cases, ['Aerospace & Defense', 'Unused Custom']);
    expect(rows.filter((r) => r.isPreset)).toHaveLength(INDUSTRIES.length);
    expect(rows[0]).toMatchObject({ industry: 'Healthcare / Pharmaceuticals', count: 2 });
    expect(rows.find((r) => r.industry === 'Aerospace & Defense')).toMatchObject({ count: 1, isPreset: false });
    expect(rows.find((r) => r.industry === 'Unused Custom')).toBeUndefined();
    expect(rows.find((r) => r.industry === 'Insurance')?.count).toBe(0);
    // The blank-industry case is attributed nowhere.
    expect(rows.reduce((a, r) => a + r.count, 0)).toBe(3);
  });

  it('matches industries case-insensitively', () => {
    expect(canonicalIndustry(' technology / saas ')).toBe('Technology / SaaS');
    expect(canonicalIndustry('aerospace', ['Aerospace'])).toBe('Aerospace');
    expect(canonicalIndustry('   ')).toBe('');
  });
});

describe('industry x case type matrix (A5)', () => {
  it('counts each combination', () => {
    const cases = [
      makeCase({ industry: 'Technology / SaaS', caseType: 'Revenue' }),
      makeCase({ industry: 'Technology / SaaS', caseType: 'Revenue' }),
      makeCase({ industry: 'Technology / SaaS', caseType: 'Profitability' }),
      makeCase({ industry: 'Insurance', caseType: 'Market Entry' }),
    ];
    const m = coverageMatrix(cases);
    const cell = (industry: string, type: string) =>
      m.rows.find((r) => r.industry === industry)!.cells[m.columns.indexOf(type as never)];
    expect(cell('Technology / SaaS', 'Revenue')).toBe(2);
    expect(cell('Technology / SaaS', 'Profitability')).toBe(1);
    expect(cell('Insurance', 'Market Entry')).toBe(1);
    expect(cell('Insurance', 'Revenue')).toBe(0);
    expect(m.max).toBe(2);
    expect(m.combinationsSeen).toBe(3);
    expect(m.columns).toHaveLength(13);
  });
});

describe('weekly practice history', () => {
  it('returns eight Monday-aligned weeks ending with the current one, with quiet weeks at zero', () => {
    const cases = [
      makeCase({ date: '2026-10-21' }),
      makeCase({ date: '2026-10-19' }),
      makeCase({ date: '2026-10-13' }), // week of Oct 12
      makeCase({ date: '2026-09-01' }), // outside the window
    ];
    const weeks = weeklyHistory(cases, NOW, 8);
    expect(weeks).toHaveLength(8);
    expect(weeks[7]).toMatchObject({ weekStart: '2026-10-19', count: 2, isCurrent: true });
    expect(weeks[6]).toMatchObject({ weekStart: '2026-10-12', count: 1, isCurrent: false });
    expect(weeks[5].count).toBe(0);
    expect(weeks[0].weekStart).toBe('2026-08-31'); // seven weeks before Oct 19
  });
});
