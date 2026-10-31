// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptySkills, normalizeCase } from '../domain/factory';
import type { CaseRecord, OpportunityItem } from '../domain/types';
import { mcgRowsToCases, opportunityRowsToItems, readMcgWorkbook } from './mcgImport';
import { buildWorkbook, casesToLogRows, opportunitiesToRows } from './mcgExport';

const rated = (rating: number, feedback = '') => ({ rating: rating as 1 | 2 | 3 | 4 | 5, feedback });

function aCase(over: Partial<CaseRecord> = {}): CaseRecord {
  const skills = emptySkills();
  skills.quant = rated(2, 'Slow on the division');
  skills.framework = rated(4);
  return normalizeCase({
    id: 'c1',
    date: '2026-10-12',
    title: 'Airline profitability',
    source: 'Darden 2019',
    caseType: 'Profitability',
    industry: 'Transportation / Logistics',
    partner: 'Bob',
    overall: 4,
    overallFeedback: 'Strong structure',
    skills,
    otherNotes: 'Bring a calculator face',
    ...over,
  } as CaseRecord) as CaseRecord;
}

const opp = (kind: 'exposure' | 'skill', text: string): OpportunityItem => ({ id: text, kind, text, createdAt: '2026-10-01T00:00:00.000Z' });

describe('Excel export', () => {
  it('writes the MCG layout, oldest case first', () => {
    const rows = casesToLogRows([aCase({ id: 'b', date: '2026-10-20', title: 'Later' }), aCase({ id: 'a', date: '2026-10-02', title: 'Earlier' })]);
    expect((rows[0][0] as { value: string }).value).toBe('Date');
    expect(rows[1][1]).toBe('Earlier');
    expect(rows[2][1]).toBe('Later');
  });

  it('reads back as the same cases through the importer', () => {
    const original = aCase();
    const rows = casesToLogRows([original]).map((r) => r.map((c) => (c && typeof c === 'object' ? c.value : c)));
    const back = mcgRowsToCases(rows).cases;
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({
      date: '2026-10-12',
      title: 'Airline profitability',
      source: 'Darden 2019',
      caseType: 'Profitability',
      industry: 'Transportation / Logistics',
      partner: 'Bob',
      overall: 4,
      overallFeedback: 'Strong structure',
      otherNotes: 'Bring a calculator face',
    });
    expect(back[0].skills.quant).toEqual({ rating: 2, feedback: 'Slow on the division' });
    expect(back[0].skills.framework.rating).toBe(4);
    expect(back[0].skills.exhibits.rating).toBeNull();
  });

  it('keeps the two Opportunity Areas lists apart and in order', () => {
    const rows = opportunitiesToRows([opp('exposure', 'Pricing'), opp('skill', 'Mental math'), opp('exposure', 'PE due diligence')]);
    const back = opportunityRowsToItems(rows.map((r) => r.map((c) => (c && typeof c === 'object' ? c.value : c))));
    expect(back).toEqual([
      { kind: 'exposure', text: 'Pricing' },
      { kind: 'exposure', text: 'PE due diligence' },
      { kind: 'skill', text: 'Mental math' },
    ]);
  });

  it('builds a real .xlsx file that the Excel importer reads back, lists included', async () => {
    const file = await buildWorkbook([aCase(), aCase({ id: 'c2', title: 'Bank market entry', date: '2026-10-15', caseType: 'Market Entry', industry: 'Financial Services' })], [opp('skill', 'Mental math')]);
    const result = await readMcgWorkbook(await file.toBlob());
    expect(result.cases.map((c) => c.title)).toEqual(['Airline profitability', 'Bank market entry']);
    expect(result.cases[0].skills.quant.rating).toBe(2);
    expect(result.opportunities).toEqual([{ kind: 'skill', text: 'Mental math' }]);
  });

  it('writes a workbook even with no cases yet', async () => {
    const file = await buildWorkbook([], []);
    expect((await file.toBlob()).size).toBeGreaterThan(100);
  });
});
