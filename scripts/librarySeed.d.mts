export interface SeedCase {
  book: string;
  school: string;
  year: number;
  number?: number | null;
  name: string;
  firm?: string | null;
  caseType: string;
  industry: string;
  cochairPick?: boolean;
  /** The analysis: all of these or none of them (a case that is only listed has none). */
  difficulty?: number;
  skills?: string[];
  concepts?: string[];
  summary?: string;
  strongAnswer?: string;
  pitfalls?: string[];
  confidence?: string;
  notes?: string;
}
export interface Dropped {
  book: string;
  name: string;
  keptBook: string;
  keptName: string;
}
export function nameKey(name: string): string;
export function dedupe<T extends SeedCase>(cases: T[]): { winners: (T & { alsoIn: string[] })[]; dropped: Dropped[] };
export function seedSql(groups: { file: string; cases: SeedCase[] }[]): { sql: string; count: number; dropped: Dropped[] };
