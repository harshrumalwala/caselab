import type { SupabaseClient } from '@supabase/supabase-js';
import { CASE_TYPES, type CaseType } from '../domain/constants';
import { searchLibrary, type LibraryCase } from '../domain/library';

/** Search the casebook library by name, book, school or year. Read-only, and only what a member who has not done the case may see. */
export interface LibraryRepository {
  search(query: string, limit?: number): Promise<LibraryCase[]>;
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
  };
}

export class SupabaseLibrary implements LibraryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async search(query: string, limit = 8): Promise<LibraryCase[]> {
    const { data, error } = await this.client.rpc('search_library', { p_query: query, p_limit: limit });
    if (error) throw error;
    return ((data ?? []) as LibraryRow[]).flatMap((r) => rowToLibraryCase(r) ?? []);
  }
}

/** For tests: the same search as the database, over a fixed list, and a record of what was asked. */
export function createMemoryLibrary(cases: LibraryCase[] = []) {
  const queries: string[] = [];
  const state = { failing: false as boolean };
  return {
    queries,
    state,
    cases,
    async search(query: string, limit = 8) {
      queries.push(query);
      if (state.failing) throw new Error('Failed to fetch');
      return searchLibrary(cases, query, limit);
    },
  } satisfies LibraryRepository & Record<string, unknown>;
}
