import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { emptySkills, normalizeCase } from '../domain/factory';
import type { CaseRecord, OpportunityItem } from '../domain/types';
import { buildMcgWorkbook } from './mcgExport';

const template = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/data/mcg-case-log-template.xlsx')));

describe('Excel export: well-formed XML', () => {
  it('every part the export touches parses as XML, even with awkward text in it', () => {
    const c = normalizeCase({
      id: 'x',
      date: '2026-10-01',
      title: 'a & b < c > d "e"',
      source: "it's",
      caseType: 'Revenue',
      industry: 'Tech & <Software>',
      partner: '',
      overall: 3,
      overallFeedback: 'line\nbreak',
      skills: emptySkills(),
      otherNotes: '',
    } as CaseRecord) as CaseRecord;
    const opp: OpportunityItem = { id: 'o', kind: 'skill', text: 'a & b <c>', createdAt: '2026-10-01T00:00:00.000Z' };
    const bytes = buildMcgWorkbook(template, [c], [opp], { name: 'A & B <C>', now: new Date(2026, 9, 31) });
    const files = unzipSync(bytes);
    for (const path of ['xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) {
      const doc = new DOMParser().parseFromString(strFromU8(files[path]), 'application/xml');
      expect(doc.getElementsByTagName('parsererror'), path).toHaveLength(0);
    }
  });
});
