import { describe, expect, it } from 'vitest';
import { makeCase } from '../test/builders';
import {
  caseXp,
  levelForXp,
  MAX_LEVEL,
  progressFor,
  skillGains,
  titleForLevel,
  TITLES,
  xpAtLevel,
  xpBreakdown,
  xpGained,
  XP_RULES,
} from './progress';
import { sortAsc } from './stats';

const full = (over = {}) =>
  makeCase({
    overall: 4,
    overallFeedback: 'Good structure',
    concepts: 'Load factor',
    improvementArea: 'quant',
    nextFocus: 'Faster maths',
    skills: { behavioral1: 4, behavioral2: 4, prompt: 4, framework: 4, quant: 3, exhibits: 4, brainstorm: 4, recommendation: 4 },
    ...over,
  });

describe('what one case earns', () => {
  it('earns the base for a bare log, and nothing for what was left out', () => {
    expect(caseXp(makeCase())).toBe(XP_RULES.logged);
  });

  it('earns more for each thing you filled in', () => {
    expect(caseXp(makeCase({ overall: 3 }))).toBe(20 + 5);
    expect(caseXp(makeCase({ skills: { quant: 3, framework: 4 } }))).toBe(20 + 2 * 2);
    expect(caseXp(makeCase({ overallFeedback: 'Nice' }))).toBe(20 + 5);
    expect(caseXp(makeCase({ concepts: 'Churn' }))).toBe(20 + 5);
    expect(caseXp(makeCase({ improvementArea: 'framework' }))).toBe(20 + 5);
    expect(caseXp(makeCase({ nextFocus: 'Slow down' }))).toBe(20 + 3);
  });

  it('counts feedback written on a single skill too, and ignores blank text', () => {
    const c = makeCase();
    c.skills.quant = { rating: null, feedback: 'Rounded too late' };
    expect(caseXp(c)).toBe(20 + 5);
    expect(caseXp(makeCase({ overallFeedback: '   ', concepts: '  ' }))).toBe(20);
  });

  it('pays a fully written-up case about three times a bare one, and no more than 59', () => {
    expect(caseXp(full())).toBe(20 + 5 + 16 + 5 + 5 + 5 + 3);
    expect(caseXp(full())).toBeGreaterThanOrEqual(2.9 * caseXp(makeCase()));
    expect(caseXp(full())).toBe(59);
  });
});

describe('what the log earns together', () => {
  it('earns nothing with no cases', () => {
    expect(progressFor([])).toMatchObject({ xp: 0, level: 1, title: 'Intern', intoLevel: 0, pct: 0 });
    expect(xpBreakdown([])).toEqual({ logging: 0, coverage: 0, consistency: 0, improvement: 0, quests: 0 });
  });

  it('pays the first three cases of a day in full and later ones a quarter, so logging a pile at once does not pay', () => {
    const day = Array.from({ length: 6 }, () => makeCase({ date: '2026-09-01' }));
    expect(xpBreakdown(day).logging).toBe(3 * 20 + 3 * 5); // 20 each, then a quarter of 20
    const spread = [1, 2, 3, 4, 5, 6].map((d) => makeCase({ date: `2026-09-0${d}` }));
    expect(xpBreakdown(spread).logging).toBe(6 * 20);
  });

  it('adds a bonus for the first case in each new case type and industry, and nothing for Other or a blank industry', () => {
    const cases = [
      makeCase({ date: '2026-09-01', caseType: 'Profitability', industry: 'Insurance' }),
      makeCase({ date: '2026-09-02', caseType: 'Profitability', industry: 'Insurance' }), // nothing new
      makeCase({ date: '2026-09-03', caseType: 'Market Entry', industry: 'Financial Services' }),
      makeCase({ date: '2026-09-04', caseType: 'Other', industry: 'Other' }), // not a gap, so no bonus
      makeCase({ date: '2026-09-05', caseType: 'Revenue', industry: '' }),
    ];
    expect(xpBreakdown(cases).coverage).toBe(3 * XP_RULES.newCaseType + 2 * XP_RULES.newIndustry);
  });

  it('gives a weekly bonus for each week with three or more cases', () => {
    const solid = ['2026-10-12', '2026-10-13', '2026-10-14'].map((date) => makeCase({ date })); // Mon to Wed
    const thin = ['2026-10-19', '2026-10-20'].map((date) => makeCase({ date }));
    expect(xpBreakdown(solid).consistency).toBe(XP_RULES.solidWeek);
    expect(xpBreakdown([...solid, ...thin]).consistency).toBe(XP_RULES.solidWeek);
    expect(xpBreakdown(thin).consistency).toBe(0);
    // Three on one day count as a solid week too: it is a count, not a spread.
    expect(xpBreakdown(Array.from({ length: 3 }, () => makeCase({ date: '2026-10-12' }))).consistency).toBe(XP_RULES.solidWeek);
  });

  it('does not depend on the weekly goal, so changing the goal can never take XP away', () => {
    // Progress is worked out from the cases alone: there is no goal to pass in.
    expect(progressFor.length).toBe(1);
  });
});

describe('improvement', () => {
  const rated = (ratings: number[]) =>
    ratings.map((quant, i) => makeCase({ date: `2026-08-${String(1 + i).padStart(2, '0')}`, skills: { quant: quant as 1 | 2 | 3 | 4 | 5 } }));

  it('needs ten ratings of a skill before it compares anything', () => {
    expect(skillGains(sortAsc(rated([2, 2, 2, 2, 2, 5, 5, 5, 5])))).toEqual([]);
    expect(skillGains(sortAsc(rated([2, 2, 2, 2, 2, 4, 4, 4, 4, 4])))).toHaveLength(1);
  });

  it('measures your best five against your first five', () => {
    const [g] = skillGains(sortAsc(rated([2, 2, 2, 2, 2, 3, 4, 4, 4, 4, 3, 2, 2])));
    expect(g).toMatchObject({ skill: 'quant', first: 2 });
    expect(g.best).toBeCloseTo(3.8); // 3, 4, 4, 4, 4
    expect(g.gain).toBeCloseTo(1.8);
  });

  it('pays 50 XP for half a point better and 50 more for a whole point, once each', () => {
    const wholePoint = rated([2, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
    expect(xpBreakdown(wholePoint).improvement).toBe(100); // both steps
    const sixTenths = rated([2, 2, 2, 2, 2, 2, 3, 3, 2, 3]); // the best five is 2, 3, 3, 2, 3 = 2.6, up 0.6
    expect(xpBreakdown(sixTenths).improvement).toBe(50);
    const barely = rated([2, 2, 2, 2, 2, 2, 2, 3, 2, 2]); // best five 2.2: up 0.2
    expect(xpBreakdown(barely).improvement).toBe(0);
  });

  it('does not take it back when a later run is worse, because it is your best that counts', () => {
    const up = rated([2, 2, 2, 2, 2, 4, 4, 4, 4, 4]);
    const upThenDown = rated([2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1]);
    expect(xpBreakdown(upThenDown).improvement).toBe(xpBreakdown(up).improvement);
  });

  it('does not pay for a skill that got worse', () => {
    expect(xpBreakdown(rated([4, 4, 4, 4, 4, 2, 2, 2, 2, 2])).improvement).toBe(0);
  });
});

describe('levels', () => {
  it('start at level 1 with nothing and climb steeper and steeper', () => {
    expect(xpAtLevel(1)).toBe(0);
    expect(xpAtLevel(2)).toBe(60);
    const steps = Array.from({ length: 30 }, (_, i) => xpAtLevel(i + 2) - xpAtLevel(i + 1));
    expect(steps.every((s, i) => i === 0 || s >= steps[i - 1])).toBe(true);
    expect(xpAtLevel(10)).toBe(1620);
    expect(xpAtLevel(20)).toBeGreaterThan(4800); // Partner, about 5,000 XP
    expect(xpAtLevel(20)).toBeLessThan(5200);
  });

  it('are found from XP, on the edge exactly', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(59)).toBe(1);
    expect(levelForXp(60)).toBe(2);
    expect(levelForXp(xpAtLevel(10) - 1)).toBe(9);
    expect(levelForXp(xpAtLevel(10))).toBe(10);
    expect(levelForXp(xpAtLevel(20))).toBe(20);
    expect(levelForXp(1e9)).toBe(MAX_LEVEL);
  });

  it('carry the job titles: Intern, Analyst, Associate, Consultant, Engagement Manager, Partner', () => {
    expect(TITLES.map((t) => t.title)).toEqual(['Intern', 'Analyst', 'Associate', 'Consultant', 'Engagement Manager', 'Partner']);
    expect([1, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 30].map((l) => titleForLevel(l).title)).toEqual([
      'Intern', 'Intern', 'Analyst', 'Analyst', 'Associate', 'Associate', 'Consultant', 'Consultant', 'Engagement Manager', 'Engagement Manager', 'Partner', 'Partner',
    ]);
  });

  it('say how far you are through the level, what is left, and the next title', () => {
    const p = progressFor(Array.from({ length: 4 }, (_, i) => makeCase({ date: `2026-09-0${i + 1}` })));
    expect(p.xp).toBeGreaterThan(0);
    expect(p.intoLevel).toBe(p.xp - xpAtLevel(p.level));
    expect(p.toNext).toBe(xpAtLevel(p.level + 1) - p.xp);
    expect(p.pct).toBeGreaterThanOrEqual(0);
    expect(p.pct).toBeLessThan(100);
    expect(p.nextTitle).toEqual({ title: 'Analyst', level: 4 });
    expect(p.atMax).toBe(false);
  });

  it('stop at the top, with nothing left to earn and no next title', () => {
    const start = new Date(2024, 0, 1);
    const lots = Array.from({ length: 500 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return full({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
    });
    const p = progressFor(lots);
    expect(p).toMatchObject({ level: MAX_LEVEL, atMax: true, pct: 100, toNext: 0, title: 'Partner', nextTitle: null });
  });
});

describe('what saving a case changed', () => {
  it('reports the XP gained and whether it crossed into a new level', () => {
    const none = xpGained([], [full({ date: '2026-09-01' })]);
    expect(none.gained).toBeGreaterThan(0);
    expect(none.leveledUp).toBe(true); // 59 + 30 + 20 = 109, past the 60 for level 2
    expect(none.from.level).toBe(1);
    expect(none.to.level).toBe(2);

    const a = [full({ date: '2026-09-01' })];
    const next = xpGained(a, [...a, makeCase({ date: '2026-09-09' })]); // another week, so no quest is finished by it
    expect(next.gained).toBe(20);
    expect(next.leveledUp).toBe(false);
  });

  it('never reports a loss', () => {
    const a = [full({ date: '2026-09-01' }), makeCase({ date: '2026-09-02' })];
    expect(xpGained(a, [a[0]]).gained).toBe(0);
  });
});


describe('how long the climb takes', () => {
  // Three ways of keeping a log, three cases a week, covering each case type and industry in turn.
  const types = ['Growth Strategy', 'Market Entry', 'Market Sizing', 'Profitability', 'Mergers and Acquisitions', 'Revenue', 'Cost Reduction', 'Investment Decision', 'Organizational Change', 'Operating Model', 'Non-traditional', 'Sourcing / Outsourcing'] as const;
  const industries = ['Technology / SaaS', 'Financial Services', 'Healthcare / Pharmaceuticals', 'Consumer Products / Retail', 'Energy / Utilities', 'Transportation / Logistics', 'Insurance', 'Telecom / Media', 'Travel / Hospitality', 'Manufacturing / Industrials', 'Real Estate / Construction', 'Public Sector / Education'];
  const date = (i: number) => {
    const d = new Date(2025, 8, 1 + Math.floor(i / 3) * 7 + (i % 3) * 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const log = (n: number, extra: (i: number) => Parameters<typeof makeCase>[0]) =>
    Array.from({ length: n }, (_, i) => makeCase({ date: date(i), caseType: types[i % types.length], industry: industries[i % industries.length], ...extra(i) }));
  const rating = (n: number) => n as 1 | 2 | 3 | 4 | 5;
  const bare = (n: number) => log(n, () => ({}));
  const ordinary = (n: number) =>
    log(n, (i) => ({ overall: 3, skills: { framework: 3, quant: 3, recommendation: 3, prompt: 3 }, overallFeedback: i % 2 ? 'ok' : '', improvementArea: i % 3 ? 'quant' : null }));
  const thorough = (n: number) =>
    log(n, (i) => ({
      overall: rating(3 + ((i >> 2) % 2)),
      skills: { behavioral1: 3, behavioral2: 3, prompt: 3, framework: rating(3 + ((i >> 3) % 2)), quant: rating(2 + Math.min(2, Math.floor(i / 20))), exhibits: 3, brainstorm: 3, recommendation: 3 },
      overallFeedback: 'good', concepts: 'x', improvementArea: 'quant', nextFocus: 'y',
    }));
  /** The number of cases at which a way of logging first reaches Partner. */
  const casesToPartner = (make: (n: number) => ReturnType<typeof makeCase>[]) => {
    for (let n = 5; n <= 400; n += 1) if (progressFor(make(n)).title === 'Partner') return n;
    return Infinity;
  };

  it('reaches Partner at about a hundred cases for an ordinary log', () => {
    const n = casesToPartner(ordinary);
    expect(n).toBeGreaterThanOrEqual(85);
    expect(n).toBeLessThanOrEqual(110);
  });

  it('is quicker for someone who writes every case up in full, and slower for the bare minimum', () => {
    const full = casesToPartner(thorough);
    const plain = casesToPartner(bare);
    expect(full).toBeGreaterThanOrEqual(55);
    expect(full).toBeLessThanOrEqual(80);
    expect(plain).toBeGreaterThan(casesToPartner(ordinary));
    expect(plain).toBeLessThanOrEqual(160); // still reachable: just not by logging nothing but titles
  });

  it('does not make Partner of anyone in their first fifty cases, however carefully they write them up', () => {
    expect(progressFor(thorough(50)).title).not.toBe('Partner');
    expect(progressFor(ordinary(50)).level).toBeLessThan(20);
  });

  it('has a real middle: Consultant around the halfway mark for an ordinary log', () => {
    const half = progressFor(ordinary(50)).title;
    expect(['Associate', 'Consultant']).toContain(half);
    expect(progressFor(ordinary(10)).title).toBe('Analyst');
  });
});
