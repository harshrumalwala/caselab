import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GoalRepository } from '../data/weeklyGoal';
import { useData } from './DataProvider';

interface GoalValue {
  /** The weekly goal in cases, or null when none is set. */
  goal: number | null;
  /** False until the saved goal has loaded, so the dashboard doesn't flash "set a goal" at someone who has one. */
  ready: boolean;
  /** Saves the goal (null removes it). Rejects if it couldn't be saved; the goal on screen is then unchanged. */
  setGoal: (goal: number | null) => Promise<void>;
}

const Ctx = createContext<GoalValue>({ goal: null, ready: true, setGoal: async () => {} });

/**
 * The member's weekly goal. It lives with their account; in demo mode it is only kept for this visit, so playing
 * with sample data never writes to the real account.
 */
export function GoalProvider({ repository, children }: { repository: GoalRepository; children: ReactNode }) {
  const { mode } = useData();
  const repo = mode === 'demo' ? null : repository;
  const [goal, setGoalState] = useState<number | null>(null);
  const [ready, setReady] = useState(repo === null);

  useEffect(() => {
    if (!repo) {
      setGoalState(null);
      setReady(true);
      return;
    }
    let live = true;
    setReady(false);
    repo.load().then(
      (saved) => {
        if (!live) return;
        setGoalState(saved);
        setReady(true);
      },
      () => {
        // Offline or a hiccup: show the dashboard without a goal rather than blocking it.
        if (live) setReady(true);
      },
    );
    return () => {
      live = false;
    };
  }, [repo]);

  const setGoal = useCallback(
    async (next: number | null) => {
      setGoalState(repo ? await repo.save(next) : next);
    },
    [repo],
  );

  const value = useMemo(() => ({ goal, ready, setGoal }), [goal, ready, setGoal]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useGoal = () => useContext(Ctx);
