// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CASE_TYPES, SKILLS } from '../domain/constants';
import { emptySkills, normalizeCase } from '../domain/factory';
import type { CaseRecord, OpportunityItem } from '../domain/types';
import { buildMcgWorkbook, EXTRA_HEADERS, excelDate } from './mcgExport';
import { readMcgWorkbook } from './mcgImport';

const template = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/data/mcg-case-log-template.xlsx')));
// The copy in the repo root is the reference MCG sent; the one the app ships must be the same file.
const reference = new Uint8Array(readFileSync(resolve(process.cwd(), 'MCG Case Log Template.xlsx')));

const rated = (rating: number, feedback = '') => ({ rating: rating as 1 | 2 | 3 | 4 | 5, feedback });
const NOW = new Date(2026, 9, 31, 12, 0); // 31 Oct 2026

function aCase(over: Partial<CaseRecord> = {}): CaseRecord {
  const skills = emptySkills();
  skills.behavioral1 = rated(5, 'Great story about the project');
  skills.behavioral2 = rated(3, 'Rambled a little');
  skills.prompt = rated(4, 'Clarified the objective');
  skills.framework = rated(4, 'MECE and tailored');
  skills.quant = rated(2, 'Slow on the division');
  skills.exhibits = rated(3, 'Missed the trend in chart 2');
  skills.brainstorm = rated(4, 'Good breadth');
  skills.recommendation = rated(5, 'Crisp, risks included');
  return normalizeCase({
    id: 'c1',
    date: '2026-10-28',
    title: 'Airline profitability',
    source: 'Darden 2019',
    caseType: 'Profitability',
    industry: 'Transportation / Logistics',
    partner: 'Bob',
    overall: 4,
    overallFeedback: 'Strong structure, fix the maths',
    skills,
    wentWell: 'Structure was clean',
    struggled: 'Mental maths under pressure',
    concepts: 'Fixed vs variable costs; load factor',
    nextFocus: 'Drill percentages daily',
    improvementArea: 'quant',
    otherNotes: 'Bring a calculator face',
    ...over,
  } as CaseRecord) as CaseRecord;
}

const opp = (kind: 'exposure' | 'skill', text: string): OpportunityItem => ({ id: text, kind, text, createdAt: '2026-10-01T00:00:00.000Z' });

async function sheetsOf(bytes: Uint8Array) {
  const { default: readXlsxFile } = await import('read-excel-file/universal');
  const sheets = await readXlsxFile(new Blob([bytes as BlobPart]));
  return Object.fromEntries(sheets.map((s) => [s.sheet, s.data as unknown[][]]));
}

const parts = (bytes: Uint8Array) => unzipSync(bytes);
const text = (bytes: Uint8Array, path: string) => strFromU8(parts(bytes)[path]);

describe('the shipped template', () => {
  it('is the MCG workbook, byte for byte', () => {
    expect(Buffer.from(template).equals(Buffer.from(reference))).toBe(true);
  });
});

describe('Excel export: the real MCG workbook', () => {
  const out = buildMcgWorkbook(template, [aCase()], [], { name: 'Harsh Rumalwala', now: NOW });

  it('keeps all four tabs, in order, and everything else in the file untouched', async () => {
    expect(Object.keys(await sheetsOf(out))).toEqual(['Dashboard', 'Log', 'Opportunity Areas', 'Data Validation']);
    const before = parts(template);
    const after = parts(out);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    const changed = Object.keys(before).filter((p) => !Buffer.from(before[p]).equals(Buffer.from(after[p])));
    // Only the tabs we fill in, the style list (one added style) and the workbook's recalculate flag differ.
    expect(changed.sort()).toEqual(
      ['xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml'].sort(),
    );
    // The chart, the logo, the dropdown list and the drawings are the template's own.
    for (const p of ['xl/charts/chart1.xml', 'xl/media/image1.png', 'xl/worksheets/sheet4.xml', 'xl/drawings/drawing1.xml']) {
      expect(Buffer.from(after[p]).equals(Buffer.from(before[p])), p).toBe(true);
    }
  });

  it("keeps the Log's dropdowns, merged skill headers, frozen panes and widths", () => {
    const log = text(out, 'xl/worksheets/sheet2.xml');
    expect(log).toContain("<formula1>'Data Validation'!$A$2:$A$14</formula1>"); // the case-type dropdown
    expect(log).toContain('type="custom"'); // the date check
    expect(log).toContain('<mergeCell ref="G1:H1"/>');
    expect(log).toContain('<mergeCell ref="W1:X1"/>');
    expect(log).toContain('state="frozen"');
    expect(log).toContain('<col customWidth="1" min="25" max="25" width="63.38"/>');
  });

  it('writes the template layout exactly: "#", Date, Case Title, Case Source, Case Type, Interviewer, then each skill as rating + feedback, then Other', async () => {
    const { Log } = await sheetsOf(out);
    expect(Log[0].slice(0, 25)).toEqual([
      '#',
      'Date',
      'Case Title',
      'Case Source',
      'Case Type',
      'Interviewer',
      'Overall',
      null,
      'Behavioral 1',
      null,
      'Behavioral 2',
      null,
      'Prompt / Pre-framework',
      null,
      'Framework',
      null,
      'Quant / Math',
      null,
      'Exhibits & Charts',
      null,
      'Brainstorm(s)',
      null,
      'Recommendation',
      null,
      'Other',
    ]);
    const row = Log[1];
    expect(row[0]).toBe(1);
    expect((row[1] as Date).toISOString().slice(0, 10)).toBe('2026-10-28'); // a real Excel date, not text
    expect(row.slice(2, 6)).toEqual(['Airline profitability', 'Darden 2019', 'Profitability', 'Bob']);
    // Overall + feedback, then every skill: rating, then its feedback.
    expect(row.slice(6, 24)).toEqual([
      4,
      'Strong structure, fix the maths',
      5,
      'Great story about the project',
      3,
      'Rambled a little',
      4,
      'Clarified the objective',
      4,
      'MECE and tailored',
      2,
      'Slow on the division',
      3,
      'Missed the trend in chart 2',
      4,
      'Good breadth',
      5,
      'Crisp, risks included',
    ]);
    expect(row[24]).toBe('Bring a calculator face');
  });

  it('adds what the template has no column for to the right of "Other", with headings, and nothing in between', async () => {
    const { Log } = await sheetsOf(out);
    expect(Log[0].slice(25, 31)).toEqual([...EXTRA_HEADERS]);
    expect(Log[1].slice(25, 31)).toEqual([
      'Transportation / Logistics',
      'Structure was clean',
      'Mental maths under pressure',
      'Fixed vs variable costs; load factor',
      'Drill percentages daily',
      'Quant / Math',
    ]);
    const log = text(out, 'xl/worksheets/sheet2.xml');
    for (const [i, w] of [20, 40, 40, 40, 40, 24].entries()) expect(log).toContain(`<col customWidth="1" min="${26 + i}" max="${26 + i}" width="${w}"/>`);
  });

  it('puts every case on its own row, oldest first, numbered, and leaves the rest of the template rows blank', async () => {
    const bytes = buildMcgWorkbook(
      template,
      [aCase({ id: 'b', date: '2026-10-20', title: 'Later' }), aCase({ id: 'a', date: '2026-10-02', title: 'Earlier' }), aCase({ id: 'c', date: '2026-10-11', title: 'Middle' })],
      [],
      { now: NOW },
    );
    const { Log } = await sheetsOf(bytes);
    expect(Log.slice(1, 4).map((r) => [r[0], r[2]])).toEqual([
      [1, 'Earlier'],
      [2, 'Middle'],
      [3, 'Later'],
    ]);
    expect(Log[4][2]).toBeNull(); // row 5 is still the template's blank row
  });

  it('turns the Dashboard on: your name, and the numbers its formulas work out', async () => {
    const cases = [
      aCase({ id: '1', date: '2026-10-30', caseType: 'Profitability', overall: 4 }),
      aCase({ id: '2', date: '2026-10-20', caseType: 'Profitability', overall: 2 }),
      aCase({ id: '3', date: '2026-10-29', caseType: 'Market Entry', overall: null }),
    ];
    const bytes = buildMcgWorkbook(template, cases, [], { name: 'Harsh Rumalwala', now: NOW });
    const { Dashboard } = await sheetsOf(bytes);
    const at = (ref: string) => {
      const [, col, row] = /([A-Z]+)(\d+)/.exec(ref)!;
      return Dashboard[Number(row) - 1][col.charCodeAt(0) - 65];
    };
    expect(at('C1')).toBe('Harsh Rumalwala');
    expect(at('C3')).toBe(3); // total cases
    expect(at('G3')).toBe(2); // within 7.5 days of 31 Oct: the 30th and the 29th
    expect(at('C7')).toBe(3); // overall average: (4 + 2) / 2, the unrated one ignored
    expect(at('D7')).toBe(5); // Behavioral 1
    expect(at('G7')).toBe(2); // Quant
    expect(at('D10')).toBe(0); // Growth Strategy
    expect(at('D11')).toBe(1); // Market Entry
    expect(at('D13')).toBe(2); // Profitability
    const sheet = text(bytes, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<f>COUNT(Log!$B$2:$B$998)</f>'); // still the template's own formulas
    expect(text(bytes, 'xl/workbook.xml')).toContain('<calcPr fullCalcOnLoad="1"/>'); // and Excel recalculates them on opening
  });

  it('numbers the Dashboard case types the way the template lists them', async () => {
    const { 'Data Validation': validation, Dashboard } = await sheetsOf(out);
    expect(validation.slice(1, 14).map((r) => r[0])).toEqual([...CASE_TYPES]);
    expect(Dashboard.slice(9, 22).map((r) => r[1])).toEqual([...CASE_TYPES]);
  });

  it('shows an empty Dashboard as the template does (nothing to average) when there are no cases', async () => {
    const bytes = buildMcgWorkbook(template, [], [], { now: NOW });
    const sheet = text(bytes, 'xl/worksheets/sheet1.xml');
    expect(sheet).toMatch(/<c r="C7" s="\d+" t="e"><f>AVERAGE\(Log!\$G\$2:G\$998\)<\/f><v>#DIV\/0!<\/v><\/c>/);
    expect(sheet).toMatch(/<c r="C3" s="\d+"><f>COUNT\(Log!\$B\$2:\$B\$998\)<\/f><v>0<\/v><\/c>/);
    const { Log } = await sheetsOf(bytes);
    expect(Log[1][2]).toBeNull();
  });

  it('writes the two Opportunity Areas lists under their headings, as many as there are', async () => {
    const bytes = buildMcgWorkbook(
      template,
      [],
      [opp('exposure', 'Market sizing: telecom'), opp('skill', 'Mental maths'), opp('exposure', 'M&A synergies'), opp('exposure', 'Pricing'), opp('exposure', 'Supply chain')],
      { now: NOW },
    );
    const { 'Opportunity Areas': areas } = await sheetsOf(bytes);
    expect(areas[2][0]).toBe('Cases/Concepts with No Exposure');
    expect(areas[2][4]).toBe('Skillsets to Improve Upon');
    expect(areas.slice(3, 7).map((r) => [r[0] ?? null, r[4] ?? null])).toEqual([
      ['Market sizing: telecom', 'Mental maths'],
      ['M&A synergies', null],
      ['Pricing', null],
      ['Supply chain', null],
    ]);
  });

  it('makes rows tall enough to read long feedback, never shorter than the template', async () => {
    const long = 'A long piece of feedback. '.repeat(30);
    const bytes = buildMcgWorkbook(template, [aCase({ title: 'Short', overallFeedback: 'ok' }), aCase({ id: 'x', date: '2026-10-29', title: 'Long', overallFeedback: long })], [], { now: NOW });
    const log = text(bytes, 'xl/worksheets/sheet2.xml');
    const height = (r: number) => Number(new RegExp(`<row r="${r}" ht="([\\d.]+)"`).exec(log)![1]);
    expect(height(2)).toBeGreaterThanOrEqual(33.75);
    expect(height(3)).toBeGreaterThan(height(2));
    expect(height(3)).toBeLessThanOrEqual(400);
  });

  it('keeps the Other column readable too, with a wrapping style added to the template', () => {
    const styles = text(out, 'xl/styles.xml');
    expect(styles).toContain('<cellXfs count="56">');
    expect(styles).toContain('wrapText="1"/></xf></cellXfs>');
    expect(text(out, 'xl/worksheets/sheet2.xml')).toMatch(/<c r="Y2" s="55" t="inlineStr">/);
  });
});

describe('Excel export: care with the text', () => {
  it('writes accents, ampersands, quotes, line breaks and leading spaces exactly, and drops characters a spreadsheet cannot hold', async () => {
    // Set after normalising (which trims) so the exporter itself is what is under test.
    const tricky: CaseRecord = {
      ...aCase(),
      title: 'Café “Déjà vu” & <Co> "quotes"',
      overallFeedback: '  indented\nsecond line\r\nthird line\u0007\u0000',
      otherNotes: 'x'.repeat(40_000),
    };
    const bytes = buildMcgWorkbook(template, [tricky], [], { now: NOW });
    const { Log } = await sheetsOf(bytes);
    expect(Log[1][2]).toBe('Café “Déjà vu” & <Co> "quotes"');
    // This reader trims the ends of a cell's text; the file itself keeps the leading spaces and line breaks:
    expect(Log[1][7]).toBe('indented\nsecond line\nthird line');
    expect(text(bytes, 'xl/worksheets/sheet2.xml')).toContain('<t xml:space="preserve">  indented\nsecond line\nthird line</t>');
    expect((Log[1][24] as string).length).toBe(32_767);
  });

  it('does not change the template it was given', () => {
    const copy = new Uint8Array(template);
    buildMcgWorkbook(copy, [aCase()], [], { now: NOW });
    expect(Buffer.from(copy).equals(Buffer.from(template))).toBe(true);
  });

  it('turns calendar dates into Excel dates without a time zone getting in the way', () => {
    expect(excelDate('2026-10-28')).toBe(46323);
    expect(excelDate('1900-03-01')).toBe(61);
    expect(excelDate('2026-02-30' as string)).not.toBeNull(); // shape is checked here; real dates come from the app
    expect(excelDate('nonsense')).toBeNull();
  });
});

describe('Excel export: more cases than the template has rows', () => {
  it('carries on below the template, and stretches the Dashboard formulas to reach the last case', async () => {
    const many = Array.from({ length: 1005 }, (_, i) => aCase({ id: `c${i}`, date: '2026-10-01', title: `Case ${i + 1}` }));
    const bytes = buildMcgWorkbook(template, many, [], { now: NOW });
    const log = text(bytes, 'xl/worksheets/sheet2.xml');
    expect(log).toContain('<row r="1006" ');
    expect(log.match(/<row r="\d+"/g)!.length).toBe(1006);
    const dashboard = text(bytes, 'xl/worksheets/sheet1.xml');
    expect(dashboard).toContain('<f>COUNT(Log!$B$2:$B$1006)</f>');
    expect(dashboard).not.toContain('$998');
    expect(dashboard).toContain('<v>1005</v>');
  });
});

describe('Excel export: reads back through the importer', () => {
  it('restores every field of a case, including the ones the template has no column for', async () => {
    const original = aCase();
    const bytes = buildMcgWorkbook(template, [original], [], { name: 'Harsh', now: NOW });
    const result = await readMcgWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(result.cases).toHaveLength(1);
    expect(result.rows[0].notes).toEqual([]); // nothing had to be changed or dropped
    const back = result.cases[0];
    expect(back).toMatchObject({
      date: '2026-10-28',
      title: 'Airline profitability',
      source: 'Darden 2019',
      caseType: 'Profitability',
      industry: 'Transportation / Logistics',
      partner: 'Bob',
      overall: 4,
      overallFeedback: 'Strong structure, fix the maths',
      wentWell: 'Structure was clean',
      struggled: 'Mental maths under pressure',
      concepts: 'Fixed vs variable costs; load factor',
      nextFocus: 'Drill percentages daily',
      improvementArea: 'quant',
      otherNotes: 'Bring a calculator face',
    });
    for (const s of SKILLS) expect(back.skills[s.key], s.key).toEqual(original.skills[s.key]);
  });

  it('restores the Opportunity Areas lists, and many cases at once', async () => {
    const cases = ['2026-10-01', '2026-10-05', '2026-10-09'].map((date, i) => aCase({ id: `c${i}`, date, title: `Case ${i}`, overall: ((i % 5) + 1) as 1 }));
    const opps = [opp('exposure', 'Telecom sizing'), opp('skill', 'Quant')];
    const bytes = buildMcgWorkbook(template, cases, opps, { now: NOW });
    const result = await readMcgWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(result.cases.map((c) => c.title)).toEqual(['Case 0', 'Case 1', 'Case 2']);
    expect(result.opportunities).toEqual([
      { kind: 'exposure', text: 'Telecom sizing' },
      { kind: 'skill', text: 'Quant' },
    ]);
    expect(result.rows).toHaveLength(3);
  });

  it('keeps a case that has almost nothing filled in: blanks stay blank', async () => {
    const sparse = normalizeCase({ id: 's', date: '2026-10-03', title: 'Bare minimum', source: '', caseType: 'Revenue', industry: '', partner: '', overall: null, overallFeedback: '', skills: emptySkills(), otherNotes: '' } as CaseRecord) as CaseRecord;
    const bytes = buildMcgWorkbook(template, [sparse], [], { now: NOW });
    const result = await readMcgWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(result.cases[0]).toMatchObject({ title: 'Bare minimum', caseType: 'Revenue', overall: null, wentWell: '', improvementArea: null, industry: '' });
  });
});
