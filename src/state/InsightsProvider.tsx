import { createContext, useContext, type ReactNode } from 'react';
import type { InsightsRepository } from '../data/feedbackInsights';

const Ctx = createContext<InsightsRepository | null>(null);

/** The member's Coach's read, kept with their account. Nothing outside the Coach card ever asks for it. */
export function InsightsProvider({ repository, children }: { repository: InsightsRepository; children: ReactNode }) {
  return <Ctx.Provider value={repository}>{children}</Ctx.Provider>;
}

/** The Coach's read, or null where there is none (for example in a test that does not set one up). */
export function useInsights(): InsightsRepository | null {
  return useContext(Ctx);
}
