import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidGoal } from '../domain/goal';

/** A member's weekly practice goal (cases a week), kept with their account. Private: only they can read it. */
export interface GoalRepository {
  /** Your saved goal, or null when you have none. */
  load(): Promise<number | null>;
  /** Saves a goal, or removes it when given null. Resolves with what is saved afterwards. */
  save(goal: number | null): Promise<number | null>;
}

export class SupabaseGoal implements GoalRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async load(): Promise<number | null> {
    // Row level security returns only your own row, so no filter is needed.
    const { data, error } = await this.client.from('weekly_goal').select('goal').maybeSingle();
    if (error) throw error;
    const goal = (data as { goal: number } | null)?.goal;
    return isValidGoal(goal) ? goal : null;
  }

  async save(goal: number | null): Promise<number | null> {
    if (goal === null) {
      const { error } = await this.client.from('weekly_goal').delete().eq('user_id', this.userId);
      if (error) throw error;
      return null;
    }
    if (!isValidGoal(goal)) throw new Error('A weekly goal is a whole number from 1 to 14.');
    const { error } = await this.client
      .from('weekly_goal')
      .upsert({ user_id: this.userId, goal, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
    return goal;
  }
}

/** For tests: the same behaviour as the database, in memory. */
export function createMemoryGoal(initial: number | null = null) {
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
    async save(goal: number | null) {
      if (this.failing) throw new Error('offline');
      if (goal !== null && !isValidGoal(goal)) throw new Error('A weekly goal is a whole number from 1 to 14.');
      saved = goal;
      return saved;
    },
  } satisfies GoalRepository & { saved: number | null; failing: boolean };
}
