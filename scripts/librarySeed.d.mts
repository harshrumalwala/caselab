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
  /** False for a case that is only listed: its caseType and industry are a placeholder. */
  detailsKnown?: boolean;
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
/** A write-up of the book's own solution to a case, in our own words (see src/domain/bookSolution.ts). */
export interface SeedSolution {
  name: string;
  book?: string;
  school?: string;
  year?: number;
  prompt: string;
  facts?: string[];
  structure?: { heading: string; points: string[] }[];
  steps: { title: string; body?: string; calc?: string[] }[];
  exhibits?: { title: string; caption?: string; columns: string[]; rows: string[][]; approx?: boolean }[];
  recommendation: string;
  risks?: string[];
  nextSteps?: string[];
  bookErrors?: string[];
  confidence?: string;
}
export function seedSql(
  groups: { file: string; cases: SeedCase[] }[],
  solutions?: SeedSolution[],
): { sql: string; count: number; dropped: Dropped[]; solutionCount: number };
