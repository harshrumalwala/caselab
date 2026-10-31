import { SKILLS } from '../domain/constants';
import { sortAsc } from '../domain/stats';
import type { CaseRecord, OpportunityItem } from '../domain/types';

type Cell = string | number | null | { value: string; fontWeight: 'bold' };

const bold = (value: string): Cell => ({ value, fontWeight: 'bold' });

/** The header row of the MCG "Log" tab: each skill's rating column is followed by its feedback column. */
const LOG_HEADER = [
  'Date',
  'Case Title',
  'Case Source',
  'Case Type',
  'Industry',
  'Interviewer / Partner',
  'Overall',
  'Feedback',
  ...SKILLS.flatMap((s) => [s.label, 'Feedback']),
  'Other',
];

/**
 * The cases as rows of the MCG case-log template, oldest first, so the file opens as the spreadsheet people already know
 * and imports straight back. Dates are written as plain YYYY-MM-DD text, which reads the same in every time zone.
 * Only the template's columns are here; the full copy (learning notes, improvement tags, sharing) is the JSON backup.
 */
export function casesToLogRows(cases: CaseRecord[]): Cell[][] {
  const rows = sortAsc(cases).map((c): Cell[] => [
    c.date,
    c.title,
    c.source,
    c.caseType,
    c.industry,
    c.partner,
    c.overall,
    c.overallFeedback,
    ...SKILLS.flatMap((s) => [c.skills[s.key].rating, c.skills[s.key].feedback]),
    c.otherNotes,
  ]);
  return [LOG_HEADER.map(bold), ...rows];
}

/** The template's "Opportunity Areas" tab: two lists side by side under their headings. */
export function opportunitiesToRows(items: OpportunityItem[]): Cell[][] {
  const exposure = items.filter((o) => o.kind === 'exposure').map((o) => o.text);
  const skills = items.filter((o) => o.kind === 'skill').map((o) => o.text);
  const rows: Cell[][] = [[bold('No Exposure'), bold('Skillsets to Improve')]];
  for (let i = 0; i < Math.max(exposure.length, skills.length); i += 1) rows.push([exposure[i] ?? null, skills[i] ?? null]);
  return rows;
}

const WIDTHS = [12, 36, 22, 20, 26, 22, 9, 28, ...SKILLS.flatMap(() => [10, 28]), 36].map((width) => ({ width }));

/** An .xlsx workbook with a "Log" tab and an "Opportunity Areas" tab, built in the browser from the member's own data. */
export async function buildWorkbook(cases: CaseRecord[], opportunities: OpportunityItem[]) {
  // Loaded on demand so the spreadsheet writer stays out of the main bundle.
  const { default: writeXlsxFile } = await import('write-excel-file/universal');
  return writeXlsxFile([
    { sheet: 'Log', data: casesToLogRows(cases), columns: WIDTHS, stickyRowsCount: 1 },
    { sheet: 'Opportunity Areas', data: opportunitiesToRows(opportunities), columns: [{ width: 40 }, { width: 40 }] },
  ]);
}
