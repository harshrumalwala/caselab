import { CASE_TYPES, SKILLS, type SkillKey } from '../domain/constants';
import { isValidISODate, toISODate } from '../domain/dates';
import { emptySkills, normalizeCase, normalizeRating, newId } from '../domain/factory';
import type { CaseRecord } from '../domain/types';
import { ImportError } from './backup';

type Cell = unknown;

export interface McgImportResult {
  cases: CaseRecord[];
  /** Rows that had no title, date or rating at all (the template ships ~1000 blank rows). */
  blankRows: number;
}

const norm = (v: Cell) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

// Header text on the MCG "Log" tab. Each skill header sits above two columns:
// the rating, then the feedback text (the header cell is merged across both).
const SKILL_HEADERS: Record<SkillKey, string> = {
  behavioral1: 'behavioral 1',
  behavioral2: 'behavioral 2',
  prompt: 'prompt / pre-framework',
  framework: 'framework',
  quant: 'quant / math',
  exhibits: 'exhibits & charts',
  brainstorm: 'brainstorm(s)',
  recommendation: 'recommendation',
};

function cellText(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return '';
  return String(v).trim();
}

/** Excel dates arrive as Date objects (UTC midnight), serial numbers, or text like 10/12/2026. */
export function cellToISODate(v: Cell): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    return cellToISODate(new Date(Math.round((v - 25569) * 86400000)));
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (isValidISODate(s)) return s;
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
    if (us) {
      const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
      const iso = `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
      return isValidISODate(iso) ? iso : null;
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return toISODate(parsed);
  }
  return null;
}

function matchCaseType(v: Cell): string {
  const s = norm(v);
  return CASE_TYPES.find((t) => t.toLowerCase() === s) ?? 'Other';
}

/** Convert the rows of the MCG "Log" sheet into CaseLab cases. Pure and unit-testable. */
export function mcgRowsToCases(rows: Cell[][], now: Date = new Date()): McgImportResult {
  const headerIdx = rows.slice(0, 10).findIndex((r) => r.some((c) => norm(c) === 'case title'));
  if (headerIdx === -1) {
    throw new ImportError('This does not look like the MCG case log: no "Case Title" column was found.');
  }
  const header = rows[headerIdx];
  const col = (name: string) => header.findIndex((c) => norm(c) === name);

  const idx = {
    date: col('date'),
    title: col('case title'),
    source: col('case source'),
    type: col('case type'),
    partner: col('interviewer'),
    overall: col('overall'),
    other: col('other'),
  };
  const read = (row: Cell[], i: number): Cell => (i >= 0 ? row[i] : undefined);

  const cases: CaseRecord[] = [];
  let blankRows = 0;

  for (const row of rows.slice(headerIdx + 1)) {
    const title = cellText(read(row, idx.title));
    const date = cellToISODate(read(row, idx.date));

    const skills = emptySkills();
    for (const s of SKILLS) {
      const at = col(SKILL_HEADERS[s.key]);
      if (at === -1) continue;
      skills[s.key] = {
        rating: normalizeRating(row[at]),
        feedback: cellText(row[at + 1]),
      };
    }
    const overall = normalizeRating(read(row, idx.overall));
    const overallFeedback = idx.overall >= 0 ? cellText(row[idx.overall + 1]) : '';
    const hasContent =
      title !== '' ||
      date !== null ||
      overall !== null ||
      overallFeedback !== '' ||
      SKILLS.some((s) => skills[s.key].rating !== null || skills[s.key].feedback !== '');
    if (!hasContent) {
      blankRows += 1;
      continue;
    }

    const stamp = now.toISOString();
    const record = normalizeCase({
      id: newId(),
      date: date ?? toISODate(now),
      title: title || 'Untitled case (imported)',
      source: cellText(read(row, idx.source)),
      caseType: matchCaseType(read(row, idx.type)),
      industry: '',
      partner: cellText(read(row, idx.partner)),
      overall,
      overallFeedback,
      skills,
      otherNotes: cellText(read(row, idx.other)),
      createdAt: stamp,
      updatedAt: stamp,
    });
    if (record) cases.push(record);
  }
  return { cases, blankRows };
}

/** Read an .xlsx file in the browser and convert its "Log" sheet. */
export async function readMcgWorkbook(file: Blob | ArrayBuffer): Promise<McgImportResult> {
  // Loaded on demand so the spreadsheet parser stays out of the main bundle.
  const { default: readXlsxFile } = await import('read-excel-file/universal');
  let sheets;
  try {
    sheets = await readXlsxFile(file);
  } catch {
    throw new ImportError('That file could not be read as an .xlsx workbook.');
  }
  const log =
    sheets.find((s) => s.sheet.trim().toLowerCase() === 'log') ??
    sheets.find((s) => s.data.slice(0, 10).some((r) => r.some((c) => norm(c) === 'case title')));
  if (!log) throw new ImportError('No "Log" sheet was found in that workbook.');
  return mcgRowsToCases(log.data as Cell[][]);
}
