import { SKILLS, SKILL_GROUPS, type Rating, type SkillGroupKey, type SkillKey } from '../domain/constants';
import { isValidISODate, toISODate } from '../domain/dates';
import { emptySkills, normalizeCase, normalizeRating, newId } from '../domain/factory';
import { canonicalIndustryName, guessIndustry, matchCaseType, normalizeText } from '../domain/importHints';
import type { CaseRecord } from '../domain/types';
import { ImportError } from './backup';

type Cell = unknown;

/** One spreadsheet row, converted, plus anything about it the person should look at before importing. */
export interface ImportRow {
  record: CaseRecord;
  /** Plain-words things that were changed or left out while converting this row. */
  notes: string[];
  /** The industry named in the sheet, or a best guess from the title and source, or '' when there is none. */
  suggestedIndustry: string;
  /** The row's position in the sheet (1 is the first row), so it can be found in the original file. */
  sheetRow: number;
}

/** An entry from the template's "Opportunity Areas" tab. */
export interface ImportedOpportunity {
  kind: 'exposure' | 'skill';
  text: string;
}

export interface McgImportResult {
  rows: ImportRow[];
  /** The converted cases on their own (same order as `rows`). */
  cases: CaseRecord[];
  /** Rows that had no title, date or rating at all (the template ships ~1000 blank rows). */
  blankRows: number;
  /** The two hand-edited lists from the "Opportunity Areas" tab, when the workbook has them. */
  opportunities: ImportedOpportunity[];
}

const MAX = { title: 200, source: 200, industry: 100, partner: 100, opportunity: 200 };
const MAX_OPPORTUNITIES = 100;

// Header text on the MCG "Log" tab, plus spellings people use when they keep their own copy. Compared after
// normalizeText, so case, punctuation and "&" versus "and" don't matter.
const COLUMN_ALIASES = {
  date: ['date', 'case date'],
  title: ['case title', 'title', 'case name', 'case'],
  source: ['case source', 'source', 'casebook', 'book'],
  type: ['case type', 'type'],
  industry: ['industry', 'sector'],
  partner: ['interviewer', 'partner', 'practice partner', 'interviewer partner', 'caser', 'casing partner'],
  overall: ['overall', 'overall rating', 'overall score'],
  other: ['other', 'other notes', 'notes', 'comments'],
  // Columns CaseLab's own export adds to the right of "Other" (the template has no place for these).
  wentWell: ['what went well', 'went well'],
  struggled: ['what i struggled with', 'what i struggled', 'struggled'],
  concepts: ['concepts i learned', 'concepts learned', 'concepts'],
  nextFocus: ['next focus', 'what to practice next', 'practice next'],
  improvement: ['improvement focus', 'main thing to improve', 'main improvement'],
} as const;

// Each skill header sits above two columns: the rating, then the feedback text (the header cell is merged across both).
const SKILL_ALIASES: Record<SkillKey, string[]> = {
  behavioral1: ['behavioral 1', 'behavioural 1', 'behavioral1', 'behavioral', 'behavioural'],
  behavioral2: ['behavioral 2', 'behavioural 2', 'behavioral2'],
  prompt: ['prompt pre framework', 'prompt', 'pre framework', 'prompt preframework', 'prompt and pre framework'],
  framework: ['framework', 'structure'],
  quant: ['quant math', 'quant', 'math', 'quant and math', 'quantitative'],
  exhibits: ['exhibits and charts', 'exhibits', 'exhibit', 'charts'],
  brainstorm: ['brainstorm s', 'brainstorm', 'brainstorms', 'brainstorming'],
  recommendation: ['recommendation', 'recommendations'],
};

const NUMBERING = ['', 'no', 'number', 'row'];
const FEEDBACK_HEADERS = ['feedback', 'comments', 'comment', 'notes'];
const NOT_A_RATING = /^(n\/?a|none|nil|x|-|–|—)$/i;

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
    const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
    if (us) {
      const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
      const month = (n: string) => n.padStart(2, '0');
      const monthFirst = `${year}-${month(us[1])}-${month(us[2])}`;
      if (isValidISODate(monthFirst)) return monthFirst;
      // 25/10/2026 can only be day first.
      const dayFirst = `${year}-${month(us[2])}-${month(us[1])}`;
      return isValidISODate(dayFirst) ? dayFirst : null;
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return toISODate(parsed);
  }
  return null;
}

function rate(v: Cell, label: string, notes: string[]): Rating | null {
  const text = cellText(v);
  if (text === '') return null;
  // "4/5" is read as 4.
  const value = typeof v === 'string' ? Number(text.split('/')[0]) : v;
  const r = normalizeRating(value);
  if (r === null) {
    if (!NOT_A_RATING.test(text)) notes.push(`${label} “${text}” isn't a rating from 1 to 5, so it was left blank.`);
  } else if (typeof value === 'number' && value !== r) {
    notes.push(`${label} ${text} was rounded to ${r}.`);
  }
  return r;
}

/** "Quant / Math" or "quant" both name the same skill area; anything else is not one. */
function matchImprovementArea(text: string): SkillGroupKey | null {
  const t = normalizeText(text);
  if (t === '') return null;
  return SKILL_GROUPS.find((g) => g.key === t || normalizeText(g.label) === t)?.key ?? null;
}

function clip(text: string, max: number, label: string, notes: string[]): string {
  if (text.length <= max) return text;
  notes.push(`${label} was longer than ${max} characters and was shortened.`);
  return text.slice(0, max).trimEnd();
}

interface Layout {
  headerIdx: number;
  col: (name: keyof typeof COLUMN_ALIASES) => number;
  skillCols: Partial<Record<SkillKey, number>>;
  /** Columns whose header isn't one we know, with the text to label their values by. */
  extras: { index: number; header: string }[];
  header: Cell[];
}

/** The rating column's neighbour holds its feedback text, unless that neighbour is a column of its own. */
const feedbackColumn = (header: Cell[], at: number): number => {
  const next = header[at + 1];
  const t = typeof next === 'string' ? normalizeText(next) : '';
  return t === '' || FEEDBACK_HEADERS.includes(t) ? at + 1 : -1;
};

function findLayout(rows: Cell[][]): Layout {
  const isKnown = (c: Cell) => {
    if (typeof c !== 'string') return false;
    const t = normalizeText(c);
    return (
      Object.values(COLUMN_ALIASES).some((a) => (a as readonly string[]).includes(t)) ||
      Object.values(SKILL_ALIASES).some((a) => a.includes(t))
    );
  };
  const headerIdx = rows.slice(0, 10).findIndex(
    (r) =>
      r.some((c) => typeof c === 'string' && (COLUMN_ALIASES.title as readonly string[]).includes(normalizeText(c))) &&
      r.filter(isKnown).length >= 2,
  );
  if (headerIdx === -1) {
    throw new ImportError('This does not look like the MCG case log: no "Case Title" column was found.');
  }
  const header = rows[headerIdx];
  const find = (aliases: readonly string[]) => header.findIndex((c) => typeof c === 'string' && aliases.includes(normalizeText(c)));
  const col = (name: keyof typeof COLUMN_ALIASES) => find(COLUMN_ALIASES[name]);

  const skillCols: Partial<Record<SkillKey, number>> = {};
  for (const s of SKILLS) {
    const at = find(SKILL_ALIASES[s.key]);
    if (at !== -1) skillCols[s.key] = at;
  }

  const used = new Set<number>();
  for (const name of Object.keys(COLUMN_ALIASES) as (keyof typeof COLUMN_ALIASES)[]) {
    const at = col(name);
    if (at !== -1) used.add(at);
    if (name === 'overall' && at !== -1) used.add(feedbackColumn(header, at));
  }
  for (const at of Object.values(skillCols)) {
    used.add(at);
    used.add(feedbackColumn(header, at));
  }
  const extras = header.flatMap((c, index) => {
    if (used.has(index) || typeof c !== 'string') return [];
    const t = normalizeText(c);
    if (NUMBERING.includes(t) || FEEDBACK_HEADERS.includes(t)) return [];
    return [{ index, header: c.trim().slice(0, 60) }];
  });
  return { headerIdx, col, skillCols, extras, header };
}

/** Convert the rows of the MCG "Log" sheet into CaseLab cases. Pure and unit-testable. */
export function mcgRowsToCases(rows: Cell[][], now: Date = new Date()): McgImportResult {
  const layout = findLayout(rows);
  const { col, header } = layout;
  const idx = {
    date: col('date'),
    title: col('title'),
    source: col('source'),
    type: col('type'),
    industry: col('industry'),
    partner: col('partner'),
    overall: col('overall'),
    other: col('other'),
    wentWell: col('wentWell'),
    struggled: col('struggled'),
    concepts: col('concepts'),
    nextFocus: col('nextFocus'),
    improvement: col('improvement'),
  };
  const read = (row: Cell[], i: number): Cell => (i >= 0 ? row[i] : undefined);

  const out: ImportRow[] = [];
  let blankRows = 0;

  rows.slice(layout.headerIdx + 1).forEach((row, offset) => {
    const notes: string[] = [];
    const rawTitle = cellText(read(row, idx.title));
    const date = cellToISODate(read(row, idx.date));

    const skills = emptySkills();
    for (const s of SKILLS) {
      const at = layout.skillCols[s.key];
      if (at === undefined) continue;
      const fb = feedbackColumn(header, at);
      skills[s.key] = {
        rating: rate(row[at], `${s.label} rating`, notes),
        feedback: fb === -1 ? '' : cellText(row[fb]),
      };
    }
    const overall = rate(read(row, idx.overall), 'Overall rating', notes);
    const overallFeedback = idx.overall >= 0 && feedbackColumn(header, idx.overall) !== -1 ? cellText(row[idx.overall + 1]) : '';
    const hasContent =
      rawTitle !== '' ||
      date !== null ||
      overall !== null ||
      overallFeedback !== '' ||
      SKILLS.some((s) => skills[s.key].rating !== null || skills[s.key].feedback !== '');
    if (!hasContent) {
      blankRows += 1;
      return;
    }

    if (rawTitle === '') notes.push('No case title.');
    if (date === null) {
      const rawDate = cellText(read(row, idx.date));
      notes.push(rawDate ? `Date “${rawDate}” wasn't understood, so today's date was used.` : 'No date, so today\'s date was used.');
    }

    const typeText = cellText(read(row, idx.type));
    const matched = matchCaseType(typeText);
    const extraLines: string[] = [];
    if (!typeText) {
      notes.push('No case type, saved as Other.');
    } else if (!matched) {
      notes.push(`Case type “${typeText}” isn't one of the 13, so it was saved as Other. Your wording is kept in the case's other notes.`);
      extraLines.push(`Case type in spreadsheet: ${typeText}`);
    }

    for (const { index, header: label } of layout.extras) {
      const text = cellText(row[index]);
      if (text) extraLines.push(`${label}: ${text}`);
    }

    const title = clip(rawTitle || 'Untitled case (imported)', MAX.title, 'The title', notes);
    const source = clip(cellText(read(row, idx.source)), MAX.source, 'The source', notes);
    const partner = clip(cellText(read(row, idx.partner)), MAX.partner, 'The partner name', notes);
    const sheetIndustry = canonicalIndustryName(cellText(read(row, idx.industry)));
    const industry = clip(sheetIndustry, MAX.industry, 'The industry', notes);

    const areaText = cellText(read(row, idx.improvement));
    const improvementArea = matchImprovementArea(areaText);
    if (areaText && !improvementArea) notes.push(`Improvement focus “${areaText}” isn't one of the skill areas, so it was left blank.`);

    const stamp = now.toISOString();
    const record = normalizeCase({
      id: newId(),
      date: date ?? toISODate(now),
      title,
      source,
      caseType: matched ?? 'Other',
      industry,
      partner,
      overall,
      overallFeedback,
      skills,
      wentWell: cellText(read(row, idx.wentWell)),
      struggled: cellText(read(row, idx.struggled)),
      concepts: cellText(read(row, idx.concepts)),
      nextFocus: cellText(read(row, idx.nextFocus)),
      improvementArea,
      otherNotes: [cellText(read(row, idx.other)), ...extraLines].filter(Boolean).join('\n'),
      createdAt: stamp,
      updatedAt: stamp,
    });
    if (record) {
      out.push({
        record,
        notes,
        suggestedIndustry: industry || guessIndustry(title, source),
        sheetRow: layout.headerIdx + 2 + offset,
      });
    }
  });

  return { rows: out, cases: out.map((r) => r.record), blankRows, opportunities: [] };
}

/** "- one", "• two", "3. three" all become the bare text. */
const stripBullet = (s: string) => s.replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, '').trim();

/**
 * The template's "Opportunity Areas" tab: a heading, then whatever the person typed beneath it, in two columns.
 * Anything under "No Exposure" becomes a case/concept to explore, anything under "Skillsets to Improve" a skill to work on.
 */
export function opportunityRowsToItems(rows: Cell[][]): ImportedOpportunity[] {
  const headings: { kind: ImportedOpportunity['kind']; row: number; col: number; text: string }[] = [];
  rows.slice(0, 10).forEach((row, r) =>
    row.forEach((cell, c) => {
      const t = normalizeText(cellText(cell));
      if (t.includes('no exposure')) headings.push({ kind: 'exposure', row: r, col: c, text: t });
      else if (t.includes('skill') && t.includes('improve')) headings.push({ kind: 'skill', row: r, col: c, text: t });
    }),
  );

  const found: ImportedOpportunity[] = [];
  const seen = new Set<string>();
  for (const h of headings) {
    for (let r = h.row + 1; r < Math.min(rows.length, h.row + 201); r += 1) {
      for (const line of cellText(rows[r]?.[h.col]).split(/\r?\n/)) {
        const text = stripBullet(line).slice(0, MAX.opportunity);
        const key = `${h.kind}|${text.toLowerCase()}`;
        if (text === '' || seen.has(key) || found.length >= MAX_OPPORTUNITIES) continue;
        seen.add(key);
        found.push({ kind: h.kind, text });
      }
    }
  }
  return found;
}

/** Read an .xlsx file in the browser and convert its "Log" sheet (and "Opportunity Areas" sheet, if present). */
export async function readMcgWorkbook(file: Blob | ArrayBuffer): Promise<McgImportResult> {
  // Loaded on demand so the spreadsheet parser stays out of the main bundle.
  const { default: readXlsxFile } = await import('read-excel-file/universal');
  let sheets;
  try {
    sheets = await readXlsxFile(file);
  } catch {
    throw new ImportError(
      'That file could not be read as an .xlsx workbook. If it is an older .xls or a .csv, open it in Excel and use Save As, Excel Workbook (.xlsx).',
    );
  }
  const hasHeader = (data: Cell[][]) =>
    data.slice(0, 10).some((r) => r.some((c) => typeof c === 'string' && normalizeText(c) === 'case title'));
  const log =
    sheets.find((s) => s.sheet.trim().toLowerCase() === 'log') ??
    sheets.find((s) => hasHeader(s.data as Cell[][])) ??
    sheets.find((s) => {
      try {
        findLayout(s.data as Cell[][]);
        return true;
      } catch {
        return false;
      }
    });
  if (!log) throw new ImportError('No "Log" sheet was found in that workbook.');

  const result = mcgRowsToCases(log.data as Cell[][]);
  const areas = sheets.find((s) => normalizeText(s.sheet).includes('opportunit'));
  return { ...result, opportunities: areas ? opportunityRowsToItems(areas.data as Cell[][]) : [] };
}
