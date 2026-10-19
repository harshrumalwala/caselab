import type { CaseRecord, OpportunityItem } from '../domain/types';

export interface CaseLabData {
  cases: CaseRecord[];
  opportunities: OpportunityItem[];
}

/**
 * Everything the app needs from a database, as row-level operations. CaseLab ships a Supabase
 * implementation (real data) and an in-memory one (demo mode and tests). Every method either
 * resolves with what was actually stored or rejects; nothing is ever silently dropped.
 */
export interface CaseLabRepository {
  loadAll(): Promise<CaseLabData>;

  insertCase(record: CaseRecord): Promise<CaseRecord>;
  updateCase(record: CaseRecord): Promise<CaseRecord>;
  deleteCase(id: string): Promise<void>;

  insertOpportunity(item: OpportunityItem): Promise<OpportunityItem>;
  deleteOpportunity(id: string): Promise<void>;

  /** Insert or update the given rows by id. Never deletes anything. */
  upsertMany(data: CaseLabData): Promise<void>;
  /**
   * Make the stored data equal to `data`. Writes first and prunes second, so a failure part
   * way through leaves you with a superset of your data, never a hole.
   */
  replaceAll(data: CaseLabData): Promise<void>;
  clearAll(): Promise<void>;
}
