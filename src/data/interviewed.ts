import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseType } from '../domain/constants';
import { cleanInterviewed, sortInterviewed, type InterviewedCase, type InterviewedInput } from '../domain/interviewed';
import { newId } from '../domain/factory';

/** The cases a member ran as the interviewer, kept with their account. Private: only they can read them. */
export interface InterviewedRepository {
  list(): Promise<InterviewedCase[]>;
  add(input: InterviewedInput): Promise<InterviewedCase>;
  update(id: string, input: InterviewedInput): Promise<InterviewedCase>;
  remove(id: string): Promise<void>;
}

interface Row {
  id: string;
  case_date: string;
  title: string;
  source: string | null;
  case_type: string;
  industry: string | null;
  partner: string | null;
  feedback: string | null;
  learned: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, case_date, title, source, case_type, industry, partner, feedback, learned, created_at, updated_at';

const fromRow = (r: Row): InterviewedCase => ({
  id: r.id,
  date: r.case_date,
  title: r.title,
  source: r.source ?? '',
  caseType: r.case_type as CaseType,
  industry: r.industry ?? '',
  partner: r.partner ?? '',
  feedback: r.feedback ?? '',
  learned: r.learned ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (i: InterviewedInput) => ({
  case_date: i.date,
  title: i.title,
  source: i.source || null,
  case_type: i.caseType,
  industry: i.industry || null,
  partner: i.partner || null,
  feedback: i.feedback || null,
  learned: i.learned || null,
});

export class SupabaseInterviewed implements InterviewedRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<InterviewedCase[]> {
    // Row level security returns only your own rows, so no filter is needed.
    const { data, error } = await this.client.from('interviewed_cases').select(COLUMNS).order('case_date', { ascending: false }).limit(1000);
    if (error) throw error;
    return ((data ?? []) as Row[]).map(fromRow);
  }

  async add(input: InterviewedInput): Promise<InterviewedCase> {
    const { data, error } = await this.client.from('interviewed_cases').insert(toRow(cleanInterviewed(input))).select(COLUMNS).single();
    if (error) throw error;
    return fromRow(data as Row);
  }

  async update(id: string, input: InterviewedInput): Promise<InterviewedCase> {
    const { data, error } = await this.client
      .from('interviewed_cases')
      .update({ ...toRow(cleanInterviewed(input)), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data as Row);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('interviewed_cases').delete().eq('id', id);
    if (error) throw error;
  }
}

/** For tests and demo mode: the same behaviour as the database, in memory. */
export function createMemoryInterviewed(initial: InterviewedCase[] = []) {
  let rows = [...initial];
  return {
    /** What is "in the database" right now. */
    get saved() {
      return sortInterviewed(rows);
    },
    /** Set to true to make calls fail, like a network drop. */
    failing: false as boolean,
    async list() {
      if (this.failing) throw new Error('offline');
      return sortInterviewed(rows);
    },
    async add(input: InterviewedInput) {
      if (this.failing) throw new Error('offline');
      const clean = cleanInterviewed(input);
      if (!clean.title) throw new Error('A title is needed.');
      const stamp = new Date().toISOString();
      const row: InterviewedCase = { ...clean, id: newId(), createdAt: stamp, updatedAt: stamp };
      rows = [...rows, row];
      return row;
    },
    async update(id: string, input: InterviewedInput) {
      if (this.failing) throw new Error('offline');
      const found = rows.find((r) => r.id === id);
      if (!found) throw new Error('That case is gone.');
      const clean = cleanInterviewed(input);
      if (!clean.title) throw new Error('A title is needed.');
      const row: InterviewedCase = { ...found, ...clean, updatedAt: new Date().toISOString() };
      rows = rows.map((r) => (r.id === id ? row : r));
      return row;
    },
    async remove(id: string) {
      if (this.failing) throw new Error('offline');
      rows = rows.filter((r) => r.id !== id);
    },
  } satisfies InterviewedRepository & { saved: InterviewedCase[]; failing: boolean };
}
