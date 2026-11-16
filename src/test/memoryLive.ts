// For tests: the same engine and request handler the Edge Function runs, over an in-memory "database", with a coach that follows a script.
// It lives with the tests so that none of it (the prompts included) is part of the app that ships.
//
// The deps themselves (sessions, library, clock, model) are in `memoryLiveDeps.ts`, because the dry run (scripts/liveCaseDryRun.mjs) uses
// them too and cannot load this file: `LiveClient` uses syntax Node's type stripping refuses. This file is the app's view of them.
import { handleLive, isFullSolution, type LiveAction, type LiveResponse } from '../../supabase/functions/_shared/liveCaseCoach';
import { LiveClient, type LiveCatalogCase } from '../data/liveCase';
import { createMemoryLiveDeps, type MemoryLiveCase, type MemoryLiveOptions } from './memoryLiveDeps';

export type { MemoryLiveCase, MemoryLiveOptions };

export function createMemoryLive(options: MemoryLiveOptions) {
  const { deps, db, asked, starts, control } = createMemoryLiveDeps(options);

  const send = async (action: LiveAction): Promise<LiveResponse> => {
    if (control.failing && (action.type === 'resume' || action.type === 'start')) throw new Error('TypeError: Failed to fetch');
    return handleLive(options.userId, action, deps);
  };
  const list = async (): Promise<LiveCatalogCase[]> =>
    Object.entries(options.cases).filter(([, c]) => isFullSolution(c.solution)).map(([id, c]) => ({
      id,
      name: c.info.name,
      book: c.info.book,
      school: 'Booth',
      year: 2026,
      caseType: c.info.caseType,
      industry: c.info.industry,
      cochairPick: false,
      done: (options.logged?.() ?? []).includes(id),
    }));

  const repo = new LiveClient(send, list);
  return Object.assign(repo, { control, asked, db, starts });
}
