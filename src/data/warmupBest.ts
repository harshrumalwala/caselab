import type { SupabaseClient } from '@supabase/supabase-js';
import { mergeBest, NO_BEST, type Best } from '../domain/warmup';

/** A member's best Warm-up score and streak, kept with their account. Private: only they can read it. */
export interface WarmupRepository {
  /** Your saved record (no best yet if you have none). */
  load(): Promise<Best>;
  /** Offers a record. It can only raise what is saved, never lower it; returns what is saved afterwards. */
  record(best: Best): Promise<Best>;
}

export class SupabaseWarmup implements WarmupRepository {
  constructor(private readonly client: SupabaseClient) {}

  async load(): Promise<Best> {
    // Row level security returns only your own row, so no filter is needed.
    const { data, error } = await this.client.from('warmup_best').select('best_score, best_streak').maybeSingle();
    if (error) throw error;
    const row = data as { best_score: number; best_streak: number } | null;
    return row ? { score: row.best_score, streak: row.best_streak } : NO_BEST;
  }

  async record(best: Best): Promise<Best> {
    // The database keeps the higher of the old and new values, so a stale browser can't overwrite a better record.
    const { data, error } = await this.client.rpc('record_warmup_best', { p_score: best.score, p_streak: best.streak });
    if (error) throw error;
    const row = ((data ?? []) as { score: number; streak: number }[])[0];
    return row ? { score: row.score, streak: row.streak } : best;
  }
}

/** For tests: the same behaviour as the database, in memory. */
export function createMemoryWarmup(initial: Best = NO_BEST) {
  let saved = initial;
  return {
    /** What is "in the database" right now. */
    get saved() {
      return saved;
    },
    /** Set to true to make calls fail, like a network drop. */
    failing: false as boolean,
    async load() {
      if (this.failing) throw new Error('offline');
      return saved;
    },
    async record(best: Best) {
      if (this.failing) throw new Error('offline');
      saved = mergeBest(saved, best);
      return saved;
    },
  } satisfies WarmupRepository & { saved: Best; failing: boolean };
}
