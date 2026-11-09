import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseInsight,
  isScope,
  type AnalyzeResult,
  type FeedbackScope,
  type Insight,
} from '../../supabase/functions/_shared/feedbackInsights';

export type { FeedbackScope, Insight };
export { MIN_CASES, RECENT_CASES, ALL_CASES_CAP } from '../../supabase/functions/_shared/feedbackInsights';

/** A stored read: what Claude said, what it covered and when. */
export interface CoachRead {
  insight: Insight;
  scope: FeedbackScope;
  caseCount: number;
  /** ISO time of the read. */
  updatedAt: string;
}

/** What asking for a read comes back with. `unavailable` means the feature is not switched on for this project (no key set). */
export type CoachResult =
  | { status: 'ok'; read: CoachRead; cached: boolean }
  | { status: 'not_enough'; caseCount: number; needed: number }
  | { status: 'too_soon'; retryInSeconds: number }
  | { status: 'failed' }
  | { status: 'unavailable' };

/** The Coach's read: Claude's short read of the feedback you wrote on your own cases. Private to you. */
export interface InsightsRepository {
  /** Your last read, or null if you have never asked for one. */
  saved(): Promise<CoachRead | null>;
  /** Asks for a read (or gets the stored one back if nothing has changed). Rejects only if the request could not be made. */
  analyze(scope: FeedbackScope): Promise<CoachResult>;
}

/** What the Edge Function replies, read defensively: anything unexpected is a failed read, never a half-drawn screen. */
export function readReply(data: unknown): CoachResult {
  const r = (data ?? {}) as Record<string, unknown>;
  switch (r.status) {
    case 'ok': {
      const insight = parseInsight(r.insight);
      if (!insight || !isScope(r.scope) || typeof r.updatedAt !== 'string') return { status: 'failed' };
      return { status: 'ok', cached: r.cached === true, read: { insight, scope: r.scope, caseCount: Number(r.caseCount) || 0, updatedAt: r.updatedAt } };
    }
    case 'not_enough':
      return { status: 'not_enough', caseCount: Number(r.caseCount) || 0, needed: Number(r.needed) || 3 };
    case 'too_soon':
      return { status: 'too_soon', retryInSeconds: Math.max(1, Number(r.retryInSeconds) || 60) };
    case 'unavailable':
      return { status: 'unavailable' };
    default:
      return { status: 'failed' };
  }
}

export class SupabaseInsights implements InsightsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async saved(): Promise<CoachRead | null> {
    // Row level security returns only your own row, so no filter is needed.
    const { data, error } = await this.client.from('feedback_insights').select('scope, case_count, result, updated_at').maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as { scope: string; case_count: number; result: unknown; updated_at: string };
    const insight = parseInsight(row.result);
    return insight && isScope(row.scope) ? { insight, scope: row.scope, caseCount: row.case_count, updatedAt: row.updated_at } : null;
  }

  async analyze(scope: FeedbackScope): Promise<CoachResult> {
    const { data, error } = await this.client.functions.invoke('analyze-feedback', { body: { scope } });
    if (error) throw error;
    return readReply(data as AnalyzeResult | { status: 'unavailable' });
  }
}

/** For tests: the same behaviour as the function and the table, in memory, with a scripted answer in place of Claude. */
export function createMemoryInsights(initial: CoachRead | null = null) {
  let stored = initial;
  const calls: FeedbackScope[] = [];
  const state = {
    /** What the next `analyze` returns, or null to read the log (see `reply`). */
    next: null as CoachResult | null,
    /** Set to true to make calls fail, like a network drop. */
    failing: false as boolean,
  };
  const sample: Insight = {
    summary: 'You structure well but rush the maths.',
    strengths: [{ title: 'Clear structure', detail: 'Your frameworks are consistently MECE.' }],
    focus: [{ title: 'Quant under pressure', detail: 'Slips in arithmetic repeat across cases.', action: 'Do two timed mental-maths drills before your next case.', skill: 'quant' }],
  };
  return {
    calls,
    state,
    get stored() {
      return stored;
    },
    async saved() {
      if (state.failing) throw new Error('Failed to fetch');
      return stored;
    },
    async analyze(scope: FeedbackScope): Promise<CoachResult> {
      calls.push(scope);
      if (state.failing) throw new Error('Failed to fetch');
      if (state.next) return state.next;
      stored = { insight: sample, scope, caseCount: 5, updatedAt: new Date().toISOString() };
      return { status: 'ok', read: stored, cached: false };
    },
  } satisfies InsightsRepository & Record<string, unknown>;
}
