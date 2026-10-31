// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ImportError } from './backup';
import { cellToISODate, mcgRowsToCases, opportunityRowsToItems, readMcgWorkbook } from './mcgImport';

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

    // "M&A deals" is a common way to write Mergers and Acquisitions; a missing rating stays null, not 0.
    expect(deal.caseType).toBe('Mergers and Acquisitions');
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

  it('falls back to Other for a case type it does not know, and keeps the original wording', () => {
    const { rows } = mcgRowsToCases([
      ['Date', 'Case Title', 'Case Type', 'Overall', null],
      ['2026-10-01', 'Zoo turnaround', 'Zoo strategy', 4, null],
    ]);
    expect(rows[0].record.caseType).toBe('Other');
    expect(rows[0].record.otherNotes).toContain('Case type in spreadsheet: Zoo strategy');
    expect(rows[0].notes.join(' ')).toMatch(/Zoo strategy.*saved as Other/);
  });

  it('does not read the next column as feedback when it is a column of its own', () => {
    const { cases } = mcgRowsToCases([
      ['Case Title', 'Date', 'Overall', 'Framework', 'Quant'],
      ['Zoo sizing', '2026-10-01', 4, 3, 5],
    ]);
    expect(cases[0].overall).toBe(4);
    expect(cases[0].overallFeedback).toBe('');
    expect(cases[0].skills.framework).toEqual({ rating: 3, feedback: '' });
    expect(cases[0].skills.quant.rating).toBe(5);
  });

  it('understands other spellings of the headers', () => {
    const { cases } = mcgRowsToCases([
      ['#', 'Case Date', 'Title', 'Casebook', 'Type', 'Partner', 'Overall Rating', 'Structure', 'Math & Calculations'],
      [1, '2026-10-01', 'Ice cream entry', 'Cosentino', 'market entry', 'Pat', 3, 4, 2],
    ]);
    expect(cases[0]).toMatchObject({ title: 'Ice cream entry', source: 'Cosentino', caseType: 'Market Entry', partner: 'Pat', overall: 3 });
    expect(cases[0].skills.framework.rating).toBe(4);
  });

  it('flags ratings it could not use instead of guessing', () => {
    const { rows } = mcgRowsToCases([
      ['Case Title', 'Date', 'Overall', null, 'Framework', null, 'Quant', null],
      ['Zoo sizing', '2026-10-01', '4/5', null, 'seven', null, 4.4, null],
    ]);
    expect(rows[0].record.overall).toBe(4); // "4/5" is read as 4
    expect(rows[0].record.skills.framework.rating).toBeNull();
    expect(rows[0].record.skills.quant.rating).toBe(4);
    expect(rows[0].notes.join(' ')).toMatch(/Framework rating “seven”/);
    expect(rows[0].notes.join(' ')).toMatch(/Quant \/ Math rating 4.4 was rounded to 4/);
  });

  it('notes missing dates and titles and shortens over-long text', () => {
    const { rows } = mcgRowsToCases(
      [
        ['Case Title', 'Date', 'Overall', null],
        [null, null, 3, null],
        ['x'.repeat(250), 'not a date', 4, null],
      ],
      new Date(2026, 9, 30),
    );
    expect(rows[0].record.title).toBe('Untitled case (imported)');
    expect(rows[0].record.date).toBe('2026-10-30');
    expect(rows[0].notes.join(' ')).toMatch(/No case title/);
    expect(rows[0].notes.join(' ')).toMatch(/No date/);
    expect(rows[1].record.title).toHaveLength(200);
    expect(rows[1].notes.join(' ')).toMatch(/title was longer than 200/);
    expect(rows[1].notes.join(' ')).toMatch(/not a date.*wasn't understood/);
  });

  it('reads day-first dates when the month would be impossible', () => {
    expect(cellToISODate('25/10/2026')).toBe('2026-10-25');
    expect(cellToISODate('10/11/2026')).toBe('2026-10-11'); // ambiguous: month first
    expect(cellToISODate('5.10.26')).toBe('2026-05-10');
  });

  describe('a workbook with the extras people add', () => {
    it('uses an Industry column, and suggests an industry from the title when there is none', async () => {
      const { rows } = await readMcgWorkbook(fixture('mcg-rich.xlsx'));
      expect(rows).toHaveLength(3);
      expect(rows[0].record.industry).toBe('Transportation / Logistics');
      expect(rows[0].suggestedIndustry).toBe('Transportation / Logistics');
      expect(rows[1].record.industry).toBe('');
      expect(rows[1].suggestedIndustry).toBe('Healthcare / Pharmaceuticals'); // "Hospital" in the title
      expect(rows[2].suggestedIndustry).toBe(''); // nothing in the words points anywhere
    });

    it("keeps columns it does not know in the case's private notes", async () => {
      const { rows } = await readMcgWorkbook(fixture('mcg-rich.xlsx'));
      expect(rows[0].record.otherNotes).toBe('Ask about load factor first\nDuration (min): 45');
      expect(rows[1].record.otherNotes).toBe('Duration (min): 30');
    });

    it('maps loose case types and reports the problems it found', async () => {
      const { rows } = await readMcgWorkbook(fixture('mcg-rich.xlsx'));
      expect(rows[1].record.caseType).toBe('Market Entry'); // "market entry (healthcare)"
      expect(rows[2].record.caseType).toBe('Investment Decision'); // "PE deal"
      expect(rows[2].record.overall).toBe(4); // "4/5"
      expect(rows[2].notes.join(' ')).toMatch(/Framework rating “seven”/);
    });

    it('brings in both hand-edited lists from the Opportunity Areas tab', async () => {
      const { opportunities } = await readMcgWorkbook(fixture('mcg-rich.xlsx'));
      expect(opportunities).toEqual([
        { kind: 'exposure', text: 'Supply chain cases' },
        { kind: 'exposure', text: 'Pricing' },
        { kind: 'exposure', text: 'Insurance' },
        { kind: 'skill', text: 'Quant speed' },
        { kind: 'skill', text: 'Synthesis at the end' },
      ]);
    });

    it("finds nothing in the empty template's lists", async () => {
      const empty = readFileSync(new URL('../../MCG Case Log Template.xlsx', import.meta.url));
      const buf = empty.buffer.slice(empty.byteOffset, empty.byteOffset + empty.byteLength) as ArrayBuffer;
      expect((await readMcgWorkbook(buf)).opportunities).toEqual([]);
    });
  });

  it('reads the Opportunity Areas layout: headings, then entries beneath each', () => {
    expect(
      opportunityRowsToItems([
        ['Areas of Improvement'],
        [],
        ['Cases/Concepts with No Exposure', null, null, null, 'Skillsets to Improve Upon'],
        ['Pricing', null, null, null, '1. Quant speed'],
        ['pricing', null, null, null, 'Quant speed'],
      ]),
    ).toEqual([
      { kind: 'exposure', text: 'Pricing' },
      { kind: 'skill', text: 'Quant speed' },
    ]);
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

describe('the extra columns CaseLab\'s own export adds beside the template', () => {
  const header = ['#', 'Date', 'Case Title', 'Case Type', 'Overall', null, 'Industry', 'What went well', 'What I struggled with', 'Concepts I learned', 'Next focus', 'Improvement focus'];

  it('puts each one in its own field, not in the case\'s other notes', () => {
    const rows = [header, [1, '2026-10-12', 'Airline profit', 'Revenue', 4, '', 'Insurance', 'Clean tree', 'Quick maths', 'Load factor', 'Daily drills', 'Quant / Math']];
    const { cases, rows: detail } = mcgRowsToCases(rows);
    expect(cases[0]).toMatchObject({
      industry: 'Insurance',
      wentWell: 'Clean tree',
      struggled: 'Quick maths',
      concepts: 'Load factor',
      nextFocus: 'Daily drills',
      improvementArea: 'quant',
      otherNotes: '',
    });
    expect(detail[0].notes).toEqual([]);
  });

  it('understands the improvement focus however it is spelled, and says so when it is none of the skill areas', () => {
    const at = (text: string) => mcgRowsToCases([header, [1, '2026-10-12', 'X', 'Revenue', 4, '', '', '', '', '', '', text]]);
    expect(at('quant').cases[0].improvementArea).toBe('quant');
    expect(at('Prompt / Pre-framework').cases[0].improvementArea).toBe('prompt');
    expect(at('BEHAVIORAL').cases[0].improvementArea).toBe('behavioral');
    expect(at('').cases[0].improvementArea).toBeNull();
    const odd = at('Vibes');
    expect(odd.cases[0].improvementArea).toBeNull();
    expect(odd.rows[0].notes).toEqual(['Improvement focus “Vibes” isn\'t one of the skill areas, so it was left blank.']);
  });
});
