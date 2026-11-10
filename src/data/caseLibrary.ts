import type { SupabaseClient } from '@supabase/supabase-js';
import { CASE_TYPES, type CaseType } from '../domain/constants';
import { searchLibrary, type LibraryCase } from '../domain/library';
import { libraryNameKey, matchCases, type CaseMatch } from '../domain/libraryMatch';
import type { CaseRecord } from '../domain/types';

/** Our own-words analysis of a casebook case, released only to a member who has logged it. */
export interface BookNotes {
  /** 1 (easy) to 5 (very hard). */
  difficulty: number;
  /** The skills the case tests, most important first (the dashboard's skill categories). */
  skills: string[];
  concepts: string[];
  summary: string;
  strongAnswer: string;
  pitfalls: string[];
  /** `partial` when some charts or tables could not be read and the analysis leans on the book's solution pages. */
  confidence: 'high' | 'partial';
}

interface NotesRow {
  difficulty: number;
  skills: string[] | null;
  concepts: string[] | null;
  summary: string;
  strong_answer: string;
  pitfalls: string[] | null;
  confidence: string;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

/** A row of library_notes_for(), read defensively: a row that is not shaped as expected is left out, never half-shown. */
export function rowToBookNotes(r: NotesRow | null | undefined): BookNotes | null {
  if (!r || typeof r.summary !== 'string' || typeof r.strong_answer !== 'string' || r.summary.trim() === '' || r.strong_answer.trim() === '') return null;
  const difficulty = Number(r.difficulty);
  return {
    difficulty: difficulty >= 1 && difficulty <= 5 ? Math.round(difficulty) : 3,
    skills: strings(r.skills),
    concepts: strings(r.concepts),
    summary: r.summary.trim(),
    strongAnswer: r.strong_answer.trim(),
    pitfalls: strings(r.pitfalls),
    confidence: r.confidence === 'partial' ? 'partial' : 'high',
  };
}

/** Search the casebook library by name, book, school or year. Read-only, and only what a member who has not done the case may see. */
export interface LibraryRepository {
  search(query: string, limit?: number): Promise<LibraryCase[]>;
  /** Your own cases that look like casebook cases and are not linked yet, or are linked and differ from the library (for review). */
  matchMyCases(): Promise<CaseMatch[]>;
  /** A few casebook cases that exercise a skill and that you have not done yet (co-chair picks and newer books first). */
  nextCases(skill: string, limit?: number): Promise<LibraryCase[]>;
  /** Our analysis of a casebook case you have logged (the database releases it to nobody else), or null. */
  notesFor(libraryId: string): Promise<BookNotes | null>;
}

/** A row of search_library(), read defensively: a row that is not shaped as expected is left out, never half-shown. */
interface LibraryRow {
  id: string;
  name: string;
  book: string;
  school: string;
  year: number;
  case_type: string;
  industry: string;
  cochair_pick: boolean;
  also_in?: string[] | null;
  details_known?: boolean | null;
}

export function rowToLibraryCase(r: LibraryRow): LibraryCase | null {
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.book !== 'string') return null;
  const caseType = (CASE_TYPES as readonly string[]).includes(r.case_type) ? (r.case_type as CaseType) : 'Other';
  return {
    id: r.id,
    name: r.name,
    book: r.book,
    school: typeof r.school === 'string' ? r.school : '',
    year: Number(r.year) || 0,
    caseType,
    industry: typeof r.industry === 'string' ? r.industry : '',
    cochairPick: r.cochair_pick === true,
    alsoIn: Array.isArray(r.also_in) ? r.also_in.filter((b): b is string => typeof b === 'string') : [],
    detailsKnown: r.details_known !== false,
  };
}

interface MatchRow {
  case_id: string;
  title: string;
  source: string | null;
  case_type: string;
  industry: string | null;
  linked: boolean;
  sure: boolean;
  library_id: string;
  lib_name: string;
  lib_book: string;
  lib_school: string;
  lib_year: number;
  lib_case_type: string;
  lib_industry: string;
  lib_cochair: boolean;
  lib_also_in: string[] | null;
  lib_details_known?: boolean | null;
}

/** A row of match_my_cases(), read defensively: a row that is not shaped as expected is left out. */
export function rowToCaseMatch(r: MatchRow): CaseMatch | null {
  const library = rowToLibraryCase({
    id: r.library_id,
    name: r.lib_name,
    book: r.lib_book,
    school: r.lib_school,
    year: r.lib_year,
    case_type: r.lib_case_type,
    industry: r.lib_industry,
    cochair_pick: r.lib_cochair,
    also_in: r.lib_also_in,
    details_known: r.lib_details_known,
  });
  if (!library || typeof r.case_id !== 'string' || typeof r.title !== 'string') return null;
  const caseType = (CASE_TYPES as readonly string[]).includes(r.case_type) ? (r.case_type as CaseType) : 'Other';
  return { caseId: r.case_id, title: r.title, source: r.source ?? '', caseType, industry: r.industry ?? '', linked: r.linked === true, sure: r.sure === true, library };
}

export class SupabaseLibrary implements LibraryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async search(query: string, limit = 8): Promise<LibraryCase[]> {
    const { data, error } = await this.client.rpc('search_library', { p_query: query, p_limit: limit });
    if (error) throw error;
    return ((data ?? []) as LibraryRow[]).flatMap((r) => rowToLibraryCase(r) ?? []);
  }

  async matchMyCases(): Promise<CaseMatch[]> {
    const { data, error } = await this.client.rpc('match_my_cases');
    if (error) throw error;
    return ((data ?? []) as MatchRow[]).flatMap((r) => rowToCaseMatch(r) ?? []);
  }

  async nextCases(skill: string, limit = 3): Promise<LibraryCase[]> {
    const { data, error } = await this.client.rpc('library_next_cases', { p_skill: skill, p_limit: limit });
    if (error) throw error;
    return ((data ?? []) as LibraryRow[]).flatMap((r) => rowToLibraryCase(r) ?? []);
  }

  async notesFor(libraryId: string): Promise<BookNotes | null> {
    const { data, error } = await this.client.rpc('library_notes_for', { p_library_id: libraryId });
    if (error) throw error;
    return rowToBookNotes(Array.isArray(data) ? (data[0] as NotesRow | undefined) : null);
  }
}

/** For tests: the same search as the database, over a fixed list, and a record of what was asked. */
export function createMemoryLibrary(
  cases: LibraryCase[] = [],
  myCases: () => Promise<CaseRecord[]> = async () => [],
  /** Which skills each library case exercises (the private analysis), by library id. */
  skillsById: Record<string, string[]> = {},
  /** Our analysis by library id (only released for a library case one of your cases is linked to, as in the database). */
  notesById: Record<string, BookNotes> = {},
) {
  const queries: string[] = [];
  const nextAsked: string[] = [];
  const notesAsked: string[] = [];
  const state = { failing: false as boolean };
  return {
    queries,
    nextAsked,
    notesAsked,
    state,
    cases,
    async search(query: string, limit = 8) {
      queries.push(query);
      if (state.failing) throw new Error('Failed to fetch');
      return searchLibrary(cases, query, limit);
    },
    async matchMyCases() {
      if (state.failing) throw new Error('Failed to fetch');
      return matchCases(await myCases(), cases);
    },
    async notesFor(libraryId: string) {
      notesAsked.push(libraryId);
      if (state.failing) throw new Error('Failed to fetch');
      const mine = await myCases();
      return mine.some((m) => m.libraryId === libraryId) ? (notesById[libraryId] ?? null) : null;
    },
    async nextCases(skill: string, limit = 3) {
      nextAsked.push(skill);
      if (state.failing) throw new Error('Failed to fetch');
      const mine = await myCases();
      const done = new Set(mine.flatMap((m) => (m.libraryId ? [m.libraryId] : [])));
      const titles = new Set(mine.map((m) => libraryNameKey(m.title)));
      return cases
        .filter((c) => (skillsById[c.id] ?? []).includes(skill) && !done.has(c.id) && !titles.has(libraryNameKey(c.name)))
        .sort((a, b) => Number(b.cochairPick) - Number(a.cochairPick) || b.year - a.year || a.name.localeCompare(b.name))
        .slice(0, Math.min(Math.max(limit, 1), 10));
    },
  } satisfies LibraryRepository & Record<string, unknown>;
}
