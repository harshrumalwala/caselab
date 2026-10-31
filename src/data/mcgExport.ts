import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { CASE_TYPES, SKILLS, skillGroupLabel, type SkillKey } from '../domain/constants';
import { sortAsc } from '../domain/stats';
import type { CaseRecord, OpportunityItem } from '../domain/types';

/**
 * Export to Excel by filling in the real MCG case-log workbook, not by drawing something that looks like it. The template's four
 * tabs (Dashboard with its formulas, pie chart and logo; Log; Opportunity Areas; Data Validation with the case-type dropdown),
 * column order, widths, merged headers, frozen panes and styles are all kept exactly as MCG made them; we write the cases into the
 * Log, the two lists into Opportunity Areas, and your name and the numbers into the Dashboard.
 *
 * The template has no column for some of what CaseLab keeps, so those details go in extra columns to the RIGHT of "Other" (industry,
 * what went well, what I struggled with, concepts learned, next focus, improvement focus). Nothing is dropped, the template's own
 * columns are untouched, and importing the file back restores all of it.
 */

const SHEET = {
  dashboard: 'xl/worksheets/sheet1.xml',
  log: 'xl/worksheets/sheet2.xml',
  opportunities: 'xl/worksheets/sheet3.xml',
  styles: 'xl/styles.xml',
  workbook: 'xl/workbook.xml',
} as const;

/** The template's style numbers (xf indexes in its styles.xml). */
const STYLE = {
  number: 14, // the "#" column: centred
  date: 40, // M/d/yyyy
  text: 41, // wraps, so long feedback can be read in the cell
  rating: 42, // the rating cell, with its left border
  headerBody: 33, // a header cell, like "Case Source"
  headerEnd: 34, // the header cell that closes the row
  opportunity: 51,
} as const;
/** Added to the template's styles: the "Other" column's style, but wrapping text. */
const OTHER_WRAPPED = 55;

const TEMPLATE_STYLE_COUNT = 55;
const OTHER_STYLE_XF =
  '<xf borderId="24" fillId="0" fontId="7" numFmtId="0" xfId="0" applyAlignment="1" applyBorder="1" applyFont="1"><alignment vertical="center" wrapText="1"/></xf>';

type Value = string | number | null;

interface Column {
  letter: string;
  style: number;
  /** Characters that fit on one line, for working out how tall a row must be. */
  width: number;
  value(c: CaseRecord, n: number): Value;
}

const skill = (key: SkillKey, part: 'rating' | 'feedback') => (c: CaseRecord): Value => {
  const entry = c.skills[key];
  return part === 'rating' ? entry.rating : entry.feedback;
};

/**
 * The Log tab, A to Y exactly as in the template: "#", Date, Case Title, Case Source, Case Type, Interviewer, then Overall and each skill
 * as a rating column followed by its feedback column, then Other. Z to AE are ours.
 */
const COLUMNS: Column[] = [
  { letter: 'A', style: STYLE.number, width: 3, value: (_c, n) => n },
  { letter: 'B', style: STYLE.date, width: 10, value: (c) => excelDate(c.date) },
  { letter: 'C', style: STYLE.text, width: 28, value: (c) => c.title },
  { letter: 'D', style: STYLE.text, width: 21, value: (c) => c.source },
  { letter: 'E', style: STYLE.text, width: 16, value: (c) => c.caseType },
  { letter: 'F', style: STYLE.text, width: 21, value: (c) => c.partner },
  { letter: 'G', style: STYLE.rating, width: 5, value: (c) => c.overall },
  { letter: 'H', style: STYLE.text, width: 25, value: (c) => c.overallFeedback },
  ...SKILLS.flatMap((s, i): Column[] => [
    { letter: letter(9 + i * 2), style: STYLE.rating, width: 5, value: skill(s.key, 'rating') },
    { letter: letter(10 + i * 2), style: STYLE.text, width: s.key === 'recommendation' ? 31 : 25, value: skill(s.key, 'feedback') },
  ]),
  { letter: 'Y', style: OTHER_WRAPPED, width: 63, value: (c) => c.otherNotes },
  { letter: 'Z', style: STYLE.text, width: 20, value: (c) => c.industry },
  { letter: 'AA', style: STYLE.text, width: 40, value: (c) => c.wentWell },
  { letter: 'AB', style: STYLE.text, width: 40, value: (c) => c.struggled },
  { letter: 'AC', style: STYLE.text, width: 40, value: (c) => c.concepts },
  { letter: 'AD', style: STYLE.text, width: 40, value: (c) => c.nextFocus },
  { letter: 'AE', style: STYLE.text, width: 24, value: (c) => (c.improvementArea ? skillGroupLabel(c.improvementArea) : '') },
];

/** The headings of the columns we add, in order, starting at Z. */
export const EXTRA_HEADERS = ['Industry', 'What went well', 'What I struggled with', 'Concepts I learned', 'Next focus', 'Improvement focus'] as const;
const EXTRA_WIDTHS = [20, 40, 40, 40, 40, 24];

function letter(index: number): string {
  // 1 -> A, 26 -> Z, 27 -> AA
  let n = index;
  let out = '';
  while (n > 0) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Excel's date number: days since 1899-12-30. Computed from the calendar date, so no time zone can shift it. */
export function excelDate(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 + 25_569;
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const XML_UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const MAX_CELL = 32_767;

/** Text as a spreadsheet will accept it: no characters XML forbids, no more than a cell can hold, spaces and line breaks kept. */
const cleanText = (s: string) => s.replace(/\r\n?/g, '\n').replace(XML_UNSAFE, '').slice(0, MAX_CELL);

function cell(ref: string, style: number, value: Value): string {
  if (value === null || value === '') return `<c r="${ref}" s="${style}"/>`;
  if (typeof value === 'number') return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cleanText(value))}</t></is></c>`;
}

/** Tall enough to show every line of the longest cell (the template's rows are a fixed height, which would hide long feedback). */
function rowHeight(c: CaseRecord, n: number): number {
  let lines = 1;
  for (const col of COLUMNS) {
    const v = col.value(c, n);
    if (typeof v !== 'string' || v === '') continue;
    const perLine = Math.max(4, Math.floor(col.width * 1.05));
    const count = v.split('\n').reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / perLine)), 0);
    lines = Math.max(lines, count);
  }
  return Math.min(400, Math.max(33.75, lines * 14 + 6));
}

function logRow(c: CaseRecord, n: number): string {
  const r = n + 1; // row 1 is the header
  return `<row r="${r}" ht="${rowHeight(c, n)}" customHeight="1">${COLUMNS.map((col) => cell(`${col.letter}${r}`, col.style, col.value(c, n))).join('')}</row>`;
}

const ROW = /<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;

/** The Log tab with the cases written in (oldest first), the extra headings added, and the sheet's own formatting left alone. */
function patchLog(xml: string, cases: CaseRecord[]): string {
  const rows = new Map<number, string>();
  cases.forEach((c, i) => rows.set(i + 2, logRow(c, i + 1)));

  // Headings for our extra columns, beside the template's own header row.
  const extraHeads = EXTRA_HEADERS.map((h, i) => cell(`${letter(26 + i)}1`, i === EXTRA_HEADERS.length - 1 ? STYLE.headerEnd : STYLE.headerBody, h)).join('');
  let out = xml.replace(/<row r="1"[^>]*>[\s\S]*?<\/row>/, (row) => row.replace(/<c r="(?:Z|AA|AB|AC|AD)1"[^>]*\/>/g, '').replace('</row>', `${extraHeads}</row>`));

  out = out.replace(ROW, (m, n: string) => rows.get(Number(n)) ?? m);

  // More cases than the template has rows (it has about a thousand): carry on below.
  const last = Math.max(...[...out.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1])));
  const extra = [...rows.keys()].filter((r) => r > last).sort((a, b) => a - b);
  if (extra.length > 0) out = out.replace('</sheetData>', `${extra.map((r) => rows.get(r)).join('')}</sheetData>`);

  // Column widths for our extra columns.
  const cols = EXTRA_WIDTHS.map((w, i) => `<col customWidth="1" min="${26 + i}" max="${26 + i}" width="${w}"/>`).join('');
  return out.replace('</cols>', `${cols}</cols>`);
}

/** The Opportunity Areas tab: "Cases/Concepts with No Exposure" in column A and "Skillsets to Improve Upon" in column E, one per row. */
function patchOpportunities(xml: string, items: OpportunityItem[]): string {
  const exposure = items.filter((o) => o.kind === 'exposure').map((o) => o.text);
  const skills = items.filter((o) => o.kind === 'skill').map((o) => o.text);
  const count = Math.max(exposure.length, skills.length, 3); // the template ships three empty, styled rows
  let rows = '';
  for (let i = 0; i < count; i += 1) {
    const r = 4 + i;
    rows += `<row r="${r}">${cell(`A${r}`, STYLE.opportunity, exposure[i] ?? null)}${cell(`E${r}`, STYLE.opportunity, skills[i] ?? null)}</row>`;
  }
  return xml.replace(/<row r="4"[\s\S]*?<\/sheetData>/, `${rows}</sheetData>`);
}

/** The numbers the Dashboard's own formulas work out. Excel recalculates them on opening; we write them too so a previewer shows them. */
function dashboardNumbers(cases: CaseRecord[], now: Date): Map<string, number | 'error'> {
  const out = new Map<string, number | 'error'>();
  const average = (values: (number | null)[]) => {
    const n = values.filter((v): v is number => v !== null);
    return n.length ? n.reduce((a, b) => a + b, 0) / n.length : ('error' as const); // #DIV/0! with nothing rated, as in Excel
  };
  out.set('C3', cases.length);
  // "Cases in the past week" in the template: dates on or after today minus 7.5 days.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000 + 25_569;
  out.set('G3', cases.filter((c) => (excelDate(c.date) ?? -1) >= today - 7.5).length);
  // The template averages Overall, Behavioral 1 (not 2), Prompt, Framework, Quant, Exhibits, Brainstorm and Recommendation.
  const ratings: [string, (c: CaseRecord) => number | null][] = [
    ['C7', (c) => c.overall],
    ['D7', (c) => c.skills.behavioral1.rating],
    ['E7', (c) => c.skills.prompt.rating],
    ['F7', (c) => c.skills.framework.rating],
    ['G7', (c) => c.skills.quant.rating],
    ['H7', (c) => c.skills.exhibits.rating],
    ['I7', (c) => c.skills.brainstorm.rating],
    ['J7', (c) => c.skills.recommendation.rating],
  ];
  for (const [ref, get] of ratings) out.set(ref, average(cases.map(get)));
  CASE_TYPES.forEach((t, i) => out.set(`D${10 + i}`, cases.filter((c) => c.caseType.toLowerCase() === t.toLowerCase()).length));
  return out;
}

function patchDashboard(xml: string, cases: CaseRecord[], name: string, now: Date): string {
  let out = xml;
  if (name.trim()) {
    out = out.replace(/<c r="C1"( s="\d+")[^>]*>[\s\S]*?<\/c>/, (_m, style: string) => cell('C1', Number(style.match(/\d+/)![0]), name.trim().slice(0, 100)));
  }
  for (const [ref, value] of dashboardNumbers(cases, now)) {
    out = out.replace(new RegExp(`(<c r="${ref}" s="\\d+")(?: t="\\w+")?(>\\s*<f>[\\s\\S]*?</f>)<v>[\\s\\S]*?</v>(</c>)`), (_m, open: string, f: string, close: string) =>
      value === 'error' ? `${open} t="e"${f}<v>#DIV/0!</v>${close}` : `${open}${f}<v>${value}</v>${close}`,
    );
  }
  // The formulas look at rows 2 to 998; make sure they reach the last case if there are more than that.
  const last = Math.max(998, cases.length + 1);
  return last === 998 ? out : out.replace(/<f>[\s\S]*?<\/f>/g, (f) => f.replace(/\$998\b/g, () => '$' + last).replace(/([A-Z])998\b/g, (_m, col: string) => col + last));
}

export interface McgExportOptions {
  /** Shown beside "Name:" on the Dashboard tab. */
  name?: string;
  /** The date "cases in the past week" is counted from. */
  now?: Date;
}

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const XLSX_MIME = MIME;

/**
 * The MCG case log, filled in with these cases (oldest first) and opportunity lists. `template` is the workbook's bytes
 * (src/data/mcg-case-log-template.xlsx); it isn't changed.
 */
export function buildMcgWorkbook(template: Uint8Array, cases: CaseRecord[], opportunities: OpportunityItem[], options: McgExportOptions = {}): Uint8Array {
  const files = unzipSync(template);
  const edit = (path: string, change: (xml: string) => string) => {
    const bytes = files[path];
    if (!bytes) throw new Error(`The MCG template is missing ${path}.`);
    files[path] = strToU8(change(strFromU8(bytes)));
  };
  const sorted = sortAsc(cases);
  const now = options.now ?? new Date();

  edit(SHEET.log, (xml) => patchLog(xml, sorted));
  edit(SHEET.opportunities, (xml) => patchOpportunities(xml, opportunities));
  edit(SHEET.dashboard, (xml) => patchDashboard(xml, sorted, options.name ?? '', now));
  edit(SHEET.styles, (xml) =>
    xml.replace(new RegExp(`<cellXfs count="${TEMPLATE_STYLE_COUNT}">`), `<cellXfs count="${TEMPLATE_STYLE_COUNT + 1}">`).replace('</cellXfs>', `${OTHER_STYLE_XF}</cellXfs>`),
  );
  // Ask Excel to recalculate everything when the file opens, so the Dashboard is always right.
  edit(SHEET.workbook, (xml) => xml.replace('<calcPr/>', '<calcPr fullCalcOnLoad="1"/>'));

  const zippable: Zippable = {};
  for (const [path, bytes] of Object.entries(files)) zippable[path] = path.endsWith('.png') ? [bytes, { level: 0 }] : bytes;
  return zipSync(zippable);
}
