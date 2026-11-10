import type { CaseType } from './constants';
import type { LibraryCase } from './library';
import type { CaseRecord } from './types';

/**
 * Matching a case a member already logged to the casebook library. The same rules as the database (library_name_key,
 * library_source_matches and match_my_cases), so the in-memory backend and the tests behave like the real thing.
 */

/** The same case under slightly different names: "Midwest Machinery Co." and "midwest machinery". */
export const libraryNameKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(co|inc|corp|company|corporation|llc|ltd)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Does a free-text source name this book, or another book the case is also in? A book's first word is its school; "MCG" counts for Booth. */
export function sourceNamesBook(source: string, book: string, alsoIn: readonly string[]): boolean {
  const s = source.toLowerCase();
  return [book, ...alsoIn].some((b) => {
    const school = b.trim().toLowerCase().split(' ')[0] ?? '';
    return (/^[a-z]+$/.test(school) && new RegExp(`\\b${school}\\b`).test(s)) || (b.toLowerCase().includes('mcg') && /\bmcg\b/.test(s));
  });
}

/** A logged case that looks like a library case. `sure` means the name matches and the source names the book. */
export interface CaseMatch {
  caseId: string;
  title: string;
  source: string;
  caseType: CaseType;
  industry: string;
  /** Already linked to the library case (by picking it, or by an earlier match). */
  linked: boolean;
  sure: boolean;
  library: LibraryCase;
}

export type ChangeField = 'title' | 'source' | 'caseType' | 'industry';
export interface Change {
  field: ChangeField;
  label: string;
  from: string;
  to: string;
}

/** What updating the case to match the library case would change: nothing is listed for what is already the same. */
export function changesFor(m: Pick<CaseMatch, 'title' | 'source' | 'caseType' | 'industry' | 'library'>): Change[] {
  const l = m.library;
  const changes: Change[] = [];
  if (m.title !== l.name) changes.push({ field: 'title', label: 'Title', from: m.title, to: l.name });
  if (m.source !== l.book) changes.push({ field: 'source', label: 'Book', from: m.source, to: l.book });
  // The case type and industry only count when the library really knows them (a listed-only case has a placeholder).
  if (l.detailsKnown && m.caseType !== l.caseType) changes.push({ field: 'caseType', label: 'Case type', from: m.caseType, to: l.caseType });
  if (l.detailsKnown && m.industry !== l.industry) changes.push({ field: 'industry', label: 'Industry', from: m.industry, to: l.industry });
  return changes;
}

/** Cases that match a library case but are not linked, or are linked and differ from it (what the review screen lists), as the database finds them. */
export function matchCases(cases: readonly CaseRecord[], library: readonly LibraryCase[]): CaseMatch[] {
  const out: CaseMatch[] = [];
  for (const c of cases) {
    const linked = Boolean(c.libraryId);
    const candidates = library.filter((l) => (linked ? l.id === c.libraryId : libraryNameKey(c.title) !== '' && libraryNameKey(l.name) === libraryNameKey(c.title)));
    const best = [...candidates].sort((a, b) => Number(b.cochairPick) - Number(a.cochairPick) || b.year - a.year || a.name.localeCompare(b.name))[0];
    if (!best) continue;
    const match: CaseMatch = {
      caseId: c.id,
      title: c.title,
      source: c.source,
      caseType: c.caseType,
      industry: c.industry,
      linked,
      sure: sourceNamesBook(c.source, best.book, best.alsoIn),
      library: best,
    };
    if (!linked || changesFor(match).length > 0) out.push(match);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 200);
}
