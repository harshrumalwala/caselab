import type { SupabaseClient } from '@supabase/supabase-js';
import { isRoundLength, mergeBest, NO_BEST, NO_BESTS, ROUND_SECONDS, type Best, type Bests, type RoundLength } from '../domain/warmup';

/** A member's best Warm-up score and streak for each round length, kept with their account. Private: only they can read them. */
export interface WarmupRepository {
  /** Your saved records, one per round length (no best yet for a length you haven't played). */
  loadAll(): Promise<Bests>;
  /** Offers a record for one round length (the 60-second round unless told otherwise). It can only raise what is saved, never lower it; returns what is saved afterwards. */
  record(best: Best, seconds?: RoundLength): Promise<Best>;
}

export class SupabaseWarmup implements WarmupRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadAll(): Promise<Bests> {
    // Row level security returns only your own rows, so no filter is needed.
    const { data, error } = await this.client.from('warmup_best').select('seconds, best_score, best_streak');
    if (error) throw error;
    const out: Bests = { ...NO_BESTS };
    for (const row of (data ?? []) as { seconds: number; best_score: number; best_streak: number }[]) {
      if (isRoundLength(row.seconds)) out[row.seconds] = { score: row.best_score, streak: row.best_streak };
    }
    return out;
  }

  async record(best: Best, seconds: RoundLength = ROUND_SECONDS): Promise<Best> {
    // The database keeps the higher of the old and new values, so a stale browser can't overwrite a better record.
    const { data, error } = await this.client.rpc('record_warmup_best', { p_score: best.score, p_streak: best.streak, p_seconds: seconds });
    if (error) throw error;
    const row = ((data ?? []) as { score: number; streak: number }[])[0];
    return row ? { score: row.score, streak: row.streak } : best;
  }
}

/** For tests: the same behaviour as the database, in memory. */
export function createMemoryWarmup(initial: Best | Partial<Bests> = NO_BEST) {
  // A single Best is the 60-second record, as it was before there were other lengths.
  let saved: Bests = 'score' in initial ? { ...NO_BESTS, 60: initial } : { ...NO_BESTS, ...initial };
  return {
    /** The 60-second record as the "database" holds it right now. */
    get saved() {
      return saved[60];
    },
    /** Every round length's record as the "database" holds it. */
    get savedAll() {
      return saved;
    },
    /** Set to true to make calls fail, like a network drop. */
    failing: false as boolean,
    async loadAll() {
      if (this.failing) throw new Error('offline');
      return saved;
    },
    async record(best: Best, seconds: RoundLength = ROUND_SECONDS) {
      if (this.failing) throw new Error('offline');
      saved = { ...saved, [seconds]: mergeBest(saved[seconds], best) };
      return saved[seconds];
    },
  } satisfies WarmupRepository & { saved: Best; savedAll: Bests; failing: boolean };
}
