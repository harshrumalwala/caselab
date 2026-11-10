import { describe, expect, it } from 'vitest';
import type { LibraryCase } from './library';
import { composePlan, gapsFrom, planSize, type Gap } from './weeklyPlan';

const c = (name: string, over: Partial<LibraryCase> = {}): LibraryCase => ({
  id: `id-${name}`,
  name,
  book: 'Booth MCG 2026-2027',
  school: 'Booth',
  year: 2026,
  caseType: 'Profitability',
  industry: 'Travel / Hospitality',
  cochairPick: false,
  alsoIn: [],
  detailsKnown: true,
  ...over,
});

const typeNone = (name: string): Gap => ({ kind: 'type', name, once: false });
const industryOnce = (name: string): Gap => ({ kind: 'industry', name, once: true });

describe('the size of the plan', () => {
  it('follows the weekly goal, kept between two and five, and is three with no goal', () => {
    expect(planSize(null)).toBe(3);
    expect(planSize(1)).toBe(2);
    expect(planSize(4)).toBe(4);
    expect(planSize(14)).toBe(5);
  });
});

describe('the gaps in your practice', () => {
  it('lists the ones you have done none of before the ones you have done once, case types before industries', () => {
    const gaps = gapsFrom({
      caseTypesNone: ['Market Entry'],
      caseTypesOnce: [{ name: 'Revenue', caseTitle: 'x' }],
      industriesNone: ['Insurance'],
      industriesOnce: [{ name: 'Telecom / Media', caseTitle: 'y' }],
    });
    expect(gaps).toEqual([
      { kind: 'type', name: 'Market Entry', once: false },
      { kind: 'industry', name: 'Insurance', once: false },
      { kind: 'type', name: 'Revenue', once: true },
      { kind: 'industry', name: 'Telecom / Media', once: true },
    ]);
  });
});

describe('this week\'s plan', () => {
  it('starts with a case for the skill Bucket says to work on, preferring one that also fills a gap', () => {
    const plan = composePlan({
      focus: ['quant'],
      skillCases: { quant: [c('Plain Quant'), c('Quant And Gap', { caseType: 'Market Entry' })] },
      gapCases: [],
      gaps: [typeNone('Market Entry')],
      size: 3,
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].library.name).toBe('Quant And Gap');
    expect(plan[0].reasons).toEqual(['Practises Quant / Math', 'Your first Market Entry case']);
  });

  it('falls back to the best case for the skill when none fills a gap', () => {
    const plan = composePlan({ focus: ['quant'], skillCases: { quant: [c('First'), c('Second')] }, gapCases: [], gaps: [], size: 3 });
    expect(plan.map((p) => p.library.name)).toEqual(['First']);
    expect(plan[0].reasons).toEqual(['Practises Quant / Math']);
  });

  it('then fills the plan from the biggest gaps, never the same gap twice and never the same case twice', () => {
    const plan = composePlan({
      focus: [],
      skillCases: {},
      gapCases: [
        c('Insurance A', { industry: 'Insurance', caseType: 'Market Entry' }),
        c('Insurance B', { industry: 'Insurance', caseType: 'Other' }),
        c('Energy Once', { industry: 'Energy / Utilities', caseType: 'Other' }),
        c('Revenue None', { caseType: 'Revenue' }),
      ],
      gaps: [typeNone('Market Entry'), typeNone('Revenue'), industryOnce('Energy / Utilities'), { kind: 'industry', name: 'Insurance', once: false }],
      size: 4,
    });
    // Insurance A fills two "none" gaps (4); then Revenue None (2); then Energy Once (1); Insurance B would only repeat Insurance.
    expect(plan.map((p) => p.library.name)).toEqual(['Insurance A', 'Revenue None', 'Energy Once']);
    expect(plan[0].reasons).toEqual(['Your first Market Entry case', 'Your first Insurance case']);
    expect(plan[2].reasons).toEqual(["You've done one Energy / Utilities case"]);
  });

  it('mixes the two: a case for the focus skill, then gap cases, up to the size', () => {
    const plan = composePlan({
      focus: ['framework', 'quant'],
      skillCases: { framework: [c('Frame')], quant: [c('Quant')] },
      gapCases: [c('Gap One', { caseType: 'Revenue' }), c('Gap Two', { caseType: 'Market Entry' })],
      gaps: [typeNone('Revenue'), typeNone('Market Entry')],
      size: 3,
    });
    expect(plan.map((p) => p.library.name)).toEqual(['Frame', 'Quant', 'Gap One']);
  });

  it('leaves room for the gaps: with a plan of two, only one case is for a skill', () => {
    const plan = composePlan({
      focus: ['framework', 'quant'],
      skillCases: { framework: [c('Frame')], quant: [c('Quant')] },
      gapCases: [c('Gap One', { caseType: 'Revenue' })],
      gaps: [typeNone('Revenue')],
      size: 2,
    });
    expect(plan.map((p) => p.library.name)).toEqual(['Frame', 'Gap One']);
  });

  it('never counts a case whose type and industry are not known as filling a gap, and says nothing when there is nothing real', () => {
    const unknown = c('Listed Only', { caseType: 'Other', industry: 'Other', detailsKnown: false });
    expect(composePlan({ focus: [], skillCases: {}, gapCases: [unknown], gaps: [typeNone('Other')], size: 3 })).toEqual([]);
    expect(composePlan({ focus: [], skillCases: {}, gapCases: [], gaps: [], size: 3 })).toEqual([]);
  });

  it('does not use the same case for a skill and a gap', () => {
    const both = c('Both', { caseType: 'Revenue' });
    const plan = composePlan({ focus: ['quant'], skillCases: { quant: [both] }, gapCases: [both], gaps: [typeNone('Revenue')], size: 3 });
    expect(plan.map((p) => p.library.name)).toEqual(['Both']);
  });
});
