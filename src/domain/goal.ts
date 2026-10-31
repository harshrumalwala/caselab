import { addDays, startOfWeek, toISODate, weekStartISO } from './dates';
import type { CaseRecord } from './types';

/** The most cases a week a goal can ask for (the database enforces the same limit). */
export const MAX_GOAL = 14;
/** The quick choices offered; any number up to MAX_GOAL can be typed. */
export const GOAL_CHOICES = [1, 2, 3, 4, 5, 7] as const;

export const isValidGoal = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_GOAL;

export interface GoalProgress {
  goal: number;
  /** Cases logged so far this week (Monday to Sunday). */
  count: number;
  /** 0 to 100, stopping at 100 when the goal is passed. */
  pct: number;
  met: boolean;
  /** Cases still to log to reach the goal this week (0 once met). */
  remaining: number;
  /** In a row: the weeks that reached the goal. This week counts once it has; an unfinished week doesn't break the run. */
  streak: number;
}

const MAX_WEEKS_BACK = 520;

/**
 * How this week is going against the goal, and how many weeks in a row have reached it. A burned case is never in
 * `cases`, so it never counts. A week with no goal set yet isn't judged: the streak only looks at the goal as it is now.
 */
export function goalProgress(cases: CaseRecord[], now: Date, goal: number): GoalProgress {
  const perWeek = new Map<string, number>();
  for (const c of cases) {
    const key = weekStartISO(c.date);
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
  }

  const thisWeek = startOfWeek(now);
  const count = perWeek.get(toISODate(thisWeek)) ?? 0;
  const met = count >= goal;

  let streak = met ? 1 : 0;
  for (let i = 1; i <= MAX_WEEKS_BACK; i += 1) {
    if ((perWeek.get(toISODate(addDays(thisWeek, -7 * i))) ?? 0) < goal) break;
    streak += 1;
  }

  return { goal, count, pct: Math.min(100, Math.round((count / goal) * 100)), met, remaining: Math.max(0, goal - count), streak };
}
