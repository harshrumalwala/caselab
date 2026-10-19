// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ImportError } from './backup';
import { cellToISODate, mcgRowsToCases, readMcgWorkbook } from './mcgImport';

const fixture = (name: string) => {
  const buf = readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

describe('MCG Excel import', () => {
  it('reads the Log sheet of a populated MCG workbook', async () => {
    const { cases, blankRows } = await readMcgWorkbook(fixture('mcg-sample.xlsx'));
    expect(cases).toHaveLength(3);
    expect(blankRows).toBeGreaterThan(0); // the template ships with hundreds of empty numbered rows

    const [airline, pharma, deal] = cases;
    expect(airline).toMatchObject({
      date: '2026-10-05',
      title: 'Airline profitability',
      source: 'Booth casebook',
      caseType: 'Profitability',
      partner: 'Alex',
      overall: 4,
      overallFeedback: 'Great structure',
      otherNotes: 'Remember load factor',
      industry: '', // the template has no industry column
    });
    expect(airline.skills.behavioral1).toEqual({ rating: 3, feedback: 'fine' });
    expect(airline.skills.behavioral2).toEqual({ rating: null, feedback: '' });
    expect(airline.skills.framework).toEqual({ rating: 4, feedback: 'MECE tree' });
    expect(airline.skills.quant).toEqual({ rating: 2, feedback: 'slow math' });
    expect(airline.skills.recommendation.rating).toBe(3);

    expect(pharma.caseType).toBe('Market Entry');
    expect(pharma.skills.exhibits).toEqual({ rating: 4, feedback: 'good chart read' });
    expect(pharma.skills.quant.rating).toBe(3);

    // An unrecognised case type falls back to "Other"; a missing rating stays null, not 0.
    expect(deal.caseType).toBe('Other');
    expect(deal.overall).toBeNull();
  });

  it('imports nothing from the empty template (no fake data)', async () => {
    const empty = readFileSync(new URL('../../MCG Case Log Template.xlsx', import.meta.url));
    const buf = empty.buffer.slice(empty.byteOffset, empty.byteOffset + empty.byteLength) as ArrayBuffer;
    const { cases } = await readMcgWorkbook(buf);
    expect(cases).toEqual([]);
  });

  it('rejects files that are not xlsx workbooks', async () => {
    await expect(readMcgWorkbook(new TextEncoder().encode('hello').buffer as ArrayBuffer)).rejects.toThrow(ImportError);
  });

  it('rejects sheets without the expected header', () => {
    expect(() => mcgRowsToCases([['a', 'b'], [1, 2]])).toThrow(/Case Title/);
  });

  it('finds columns by header name, so reordered columns still import', () => {
    const { cases } = mcgRowsToCases([
      ['Case Title', 'Date', 'Case Type', 'Overall', null, 'Framework', null],
      ['Zoo sizing', '10/12/2026', 'market sizing', 5, 'wow', 3, 'ok'],
    ]);
    expect(cases[0]).toMatchObject({
      title: 'Zoo sizing',
      date: '2026-10-12',
      caseType: 'Market Sizing',
      overall: 5,
      overallFeedback: 'wow',
    });
    expect(cases[0].skills.framework).toEqual({ rating: 3, feedback: 'ok' });
  });

  it('parses Excel dates in all the forms they arrive in', () => {
    expect(cellToISODate(new Date(Date.UTC(2026, 9, 5)))).toBe('2026-10-05');
    expect(cellToISODate(46300)).toBe('2026-10-05'); // Excel serial
    expect(cellToISODate('2026-10-05')).toBe('2026-10-05');
    expect(cellToISODate('10/5/2026')).toBe('2026-10-05');
    expect(cellToISODate('13/45/2026')).toBeNull();
    expect(cellToISODate(null)).toBeNull();
  });
});
