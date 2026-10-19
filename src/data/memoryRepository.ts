import type { CaseLabData, CaseLabRepository } from './repository';
import type { CaseRecord, OpportunityItem } from '../domain/types';
import { DataError } from './errors';

/**
 * An in-memory repository. Used for demo mode (so sample data can never reach your account)
 * and in tests. Nothing here is persisted: a reload starts from the initial data again.
 */
export function createMemoryRepository(initial?: Partial<CaseLabData>): CaseLabRepository {
  let cases: CaseRecord[] = [...(initial?.cases ?? [])];
  let opportunities: OpportunityItem[] = [...(initial?.opportunities ?? [])];

  const upsert = <T extends { id: string }>(list: T[], items: T[]): T[] => {
    const next = [...list];
    for (const item of items) {
      const i = next.findIndex((x) => x.id === item.id);
      if (i === -1) next.push(item);
      else next[i] = item;
    }
    return next;
  };

  return {
    async loadAll() {
      return { cases: [...cases], opportunities: [...opportunities] };
    },
    async insertCase(record) {
      cases = [...cases, record];
      return record;
    },
    async updateCase(record) {
      if (!cases.some((c) => c.id === record.id)) throw new DataError('That record no longer exists.');
      cases = cases.map((c) => (c.id === record.id ? record : c));
      return record;
    },
    async deleteCase(id) {
      cases = cases.filter((c) => c.id !== id);
    },
    async insertOpportunity(item) {
      opportunities = [...opportunities, item];
      return item;
    },
    async deleteOpportunity(id) {
      opportunities = opportunities.filter((o) => o.id !== id);
    },
    async upsertMany(data) {
      cases = upsert(cases, data.cases);
      opportunities = upsert(opportunities, data.opportunities);
    },
    async replaceAll(data) {
      cases = [...data.cases];
      opportunities = [...data.opportunities];
    },
    async clearAll() {
      cases = [];
      opportunities = [];
    },
  };
}
