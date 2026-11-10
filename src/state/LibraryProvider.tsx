import { createContext, useContext, type ReactNode } from 'react';
import type { LibraryRepository } from '../data/caseLibrary';

const Ctx = createContext<LibraryRepository | null>(null);

/** The casebook library, for searching while logging a case. */
export function LibraryProvider({ repository, children }: { repository: LibraryRepository; children: ReactNode }) {
  return <Ctx.Provider value={repository}>{children}</Ctx.Provider>;
}

/** The library, or null where there is none (for example in a test that does not set one up). */
export function useLibrary(): LibraryRepository | null {
  return useContext(Ctx);
}
