import { createContext, useContext, type ReactNode } from 'react';
import type { LiveCaseRepository } from '../data/liveCase';

const Ctx = createContext<LiveCaseRepository | null>(null);

/** The live case with Bucket. */
export function LiveProvider({ repository, children }: { repository: LiveCaseRepository; children: ReactNode }) {
  return <Ctx.Provider value={repository}>{children}</Ctx.Provider>;
}

export function useLive(): LiveCaseRepository {
  const repo = useContext(Ctx);
  if (!repo) throw new Error('useLive must be used inside <LiveProvider>');
  return repo;
}
