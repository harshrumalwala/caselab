import type { CaseType } from './constants';
import type { CaseInput } from './types';

/**
 * A practice case in the casebook library, as any member may see it before doing it: its name, the book, the case type, the industry,
 * and whether the co-chairs recommend it. Nothing about the case itself (our analysis of it is released only after you have logged it).
 */
export interface LibraryCase {
  id: string;
  name: string;
  book: string;
  school: string;
  year: number;
  caseType: CaseType;
  industry: string;
  cochairPick: boolean;
  /** The other books this same case appears in (one entry per case: Booth MCG first, otherwise the newest book). */
  alsoIn: string[];
  /**
   * False for a case that is only listed (we know its name, book and year but not yet its case type and industry): then `caseType` and
   * `industry` are a placeholder that is never shown or filled in.
   */
  detailsKnown: boolean;
}

/** "Army Hotel (Booth MCG 2026-2027)": what a search result and a linked case are called. */
export const libraryLabel = (c: Pick<LibraryCase, 'name' | 'book'>): string => `${c.name} (${c.book})`;

/** What picking a library case fills in on the Log case form: the title, the book as the source, the type, the industry (when known) and the link. */
export function libraryPrefill(c: LibraryCase): Partial<Pick<CaseInput, 'title' | 'source' | 'caseType' | 'industry' | 'libraryId'>> {
  // A case we only have listed fills in what we know and leaves the type and industry for the member to choose.
  return c.detailsKnown ? { title: c.name, source: c.book, caseType: c.caseType, industry: c.industry, libraryId: c.id } : { title: c.name, source: c.book, libraryId: c.id };
}

/**
 * The same fill-in for a form that has nowhere to keep the link: a case you interviewed is stored without one, so picking a casebook
 * case there is typing saved and nothing more. Derived from `libraryPrefill` so the four fields have one definition.
 */
export function libraryPrefillWithoutLink(c: LibraryCase): Partial<Pick<CaseInput, 'title' | 'source' | 'caseType' | 'industry'>> {
  const { libraryId: _link, ...fields } = libraryPrefill(c);
  void _link;
  return fields;
}

/**
 * The same search as the database function, for tests and the in-memory backend: every word you type must appear in the name, book
 * (or another book the case is also in), school or year; exact and starting matches first, then the co-chairs' picks, then newer books.
 */
export function searchLibrary(all: readonly LibraryCase[], query: string, limit = 8): LibraryCase[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(' ').filter(Boolean);
  const hay = (c: LibraryCase) => `${c.name} ${c.book} ${c.school} ${c.year} ${c.alsoIn.join(' ')}`.toLowerCase();
  return all
    .filter((c) => words.every((w) => hay(c).includes(w)))
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase() === q) - Number(a.name.toLowerCase() === q) ||
        Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) ||
        Number(b.cochairPick) - Number(a.cochairPick) ||
        Number(b.detailsKnown) - Number(a.detailsKnown) ||
        b.year - a.year ||
        a.name.localeCompare(b.name),
    )
    .slice(0, Math.min(Math.max(limit, 1), 20));
}
