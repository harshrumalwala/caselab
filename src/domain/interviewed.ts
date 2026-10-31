import { CASE_TYPES, type CaseType } from './constants';
import { isValidISODate, toISODate } from './dates';

/** A case you ran as the interviewer. Kept apart from the cases you solved: it never counts in a total, rating, trend or goal. */
export interface InterviewedCase {
  id: string;
  date: string;
  title: string;
  source: string;
  caseType: CaseType;
  industry: string;
  /** Who you interviewed. */
  partner: string;
  /** What you told them. */
  feedback: string;
  /** What running it taught you. */
  learned: string;
  createdAt: string;
  updatedAt: string;
}

/** What another member sees of a case you interviewed: the case itself, never who you interviewed or your notes. */
export interface SharedInterviewed {
  date: string;
  title: string;
  source: string;
  caseType: CaseType;
  industry: string;
}

/** The part of one of your own interviewed cases that members can see. */
export const toSharedInterviewed = (c: InterviewedCase): SharedInterviewed => ({
  date: c.date,
  title: c.title,
  source: c.source,
  caseType: c.caseType,
  industry: c.industry,
});

export type InterviewedInput = Omit<InterviewedCase, 'id' | 'createdAt' | 'updatedAt'>;

export const INTERVIEWED_LIMITS = { title: 200, source: 200, industry: 100, partner: 100, text: 4000 } as const;

const clip = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Tidy what was typed: trimmed, limited to what the database accepts, a real date and a known case type. */
export function cleanInterviewed(raw: Partial<InterviewedInput>, today: Date = new Date()): InterviewedInput {
  return {
    date: typeof raw.date === 'string' && isValidISODate(raw.date) ? raw.date : toISODate(today),
    title: clip(raw.title, INTERVIEWED_LIMITS.title),
    source: clip(raw.source, INTERVIEWED_LIMITS.source),
    caseType: CASE_TYPES.includes(raw.caseType as CaseType) ? (raw.caseType as CaseType) : 'Other',
    industry: clip(raw.industry, INTERVIEWED_LIMITS.industry),
    partner: clip(raw.partner, INTERVIEWED_LIMITS.partner),
    feedback: clip(raw.feedback, INTERVIEWED_LIMITS.text),
    learned: clip(raw.learned, INTERVIEWED_LIMITS.text),
  };
}

/** Newest first, ties broken by when they were added. */
export function sortInterviewed(list: InterviewedCase[]): InterviewedCase[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Search by title, book, partner or industry. An empty search keeps everything. */
export function searchInterviewed(list: InterviewedCase[], query: string): InterviewedCase[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => [c.title, c.source, c.partner, c.industry, c.caseType].some((f) => f.toLowerCase().includes(q)));
}
