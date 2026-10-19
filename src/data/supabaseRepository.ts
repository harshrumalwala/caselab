import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseRecord, OpportunityItem } from '../domain/types';
import {
  caseToRow,
  opportunityToRow,
  rowToCase,
  rowToOpportunity,
  type CaseRow,
  type OpportunityRow,
} from './mapping';
import type { CaseLabData, CaseLabRepository } from './repository';

const PAGE = 1000; // PostgREST returns at most 1000 rows per request
const CHUNK = 200; // keeps bulk writes and `in (...)` filters comfortably small

const chunks = <T>(items: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * CaseLab's Supabase persistence. Row level security does the access control: every request
 * carries the signed-in user's token, so each query only ever sees that user's rows, and
 * `user_id` is filled in by the database. All methods throw the raw Supabase error on failure.
 */
export class SupabaseRepository implements CaseLabRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async fetchAll<T>(table: 'cases' | 'opportunities', columns = '*'): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from(table)
        .select(columns)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  async loadAll(): Promise<CaseLabData> {
    const [cases, opportunities] = await Promise.all([
      this.fetchAll<CaseRow>('cases'),
      this.fetchAll<OpportunityRow>('opportunities'),
    ]);
    return { cases: cases.map(rowToCase), opportunities: opportunities.map(rowToOpportunity) };
  }

  async insertCase(record: CaseRecord): Promise<CaseRecord> {
    const { data, error } = await this.client.from('cases').insert(caseToRow(record)).select().single();
    if (error) throw error;
    return rowToCase(data as CaseRow);
  }

  async updateCase(record: CaseRecord): Promise<CaseRecord> {
    // id and created_at never change; user_id is not sent.
    const { id, created_at: _created, ...patch } = caseToRow(record);
    void _created;
    const { data, error } = await this.client.from('cases').update(patch).eq('id', id).select().single();
    if (error) throw error; // a case deleted elsewhere surfaces as PGRST116 (zero rows)
    return rowToCase(data as CaseRow);
  }

  async deleteCase(id: string): Promise<void> {
    const { error } = await this.client.from('cases').delete().eq('id', id);
    if (error) throw error;
  }

  async insertOpportunity(item: OpportunityItem): Promise<OpportunityItem> {
    const { data, error } = await this.client.from('opportunities').insert(opportunityToRow(item)).select().single();
    if (error) throw error;
    return rowToOpportunity(data as OpportunityRow);
  }

  async deleteOpportunity(id: string): Promise<void> {
    const { error } = await this.client.from('opportunities').delete().eq('id', id);
    if (error) throw error;
  }

  async upsertMany({ cases, opportunities }: CaseLabData): Promise<void> {
    for (const part of chunks(cases)) {
      const { error } = await this.client.from('cases').upsert(part.map(caseToRow), { onConflict: 'id' });
      if (error) throw error;
    }
    for (const part of chunks(opportunities)) {
      const { error } = await this.client.from('opportunities').upsert(part.map(opportunityToRow), { onConflict: 'id' });
      if (error) throw error;
    }
  }

  async replaceAll(data: CaseLabData): Promise<void> {
    await this.upsertMany(data); // 1. write everything first
    await this.prune('cases', new Set(data.cases.map((c) => c.id))); // 2. then remove what's left over
    await this.prune('opportunities', new Set(data.opportunities.map((o) => o.id)));
  }

  private async prune(table: 'cases' | 'opportunities', keep: Set<string>): Promise<void> {
    const existing = await this.fetchAll<{ id: string }>(table, 'id');
    const stale = existing.map((r) => r.id).filter((id) => !keep.has(id));
    for (const part of chunks(stale)) {
      const { error } = await this.client.from(table).delete().in('id', part);
      if (error) throw error;
    }
  }

  async clearAll(): Promise<void> {
    // Row level security limits these deletes to the signed-in user's own rows.
    for (const table of ['cases', 'opportunities'] as const) {
      const { error } = await this.client.from(table).delete().not('id', 'is', null);
      if (error) throw error;
    }
  }
}
