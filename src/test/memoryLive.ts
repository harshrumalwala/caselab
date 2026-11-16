// For tests: the same engine and request handler the Edge Function runs, over an in-memory "database", with a coach that follows a script.
// It lives with the tests so that none of it (the prompts included) is part of the app that ships.
import {
  handleLive,
  isFullSolution,
  type CaseInfo,
  type LiveAction,
  type LiveDeps,
  type LiveResponse,
  type StoredSession,
  type TurnRequest,
} from '../../supabase/functions/_shared/liveCaseCoach';
import { LiveClient, type LiveCatalogCase } from '../data/liveCase';

export interface MemoryLiveCase {
  info: CaseInfo;
  solution: unknown;
}

export interface MemoryLiveOptions {
  userId: string;
  cases: Record<string, MemoryLiveCase>;
  /** Library case ids the member has already logged. */
  logged?: () => string[];
  now?: () => number;
  /** What the "model" says. By default a short reply that counts as progress, and plausible feedback. */
  reply?: (kind: string, request: TurnRequest) => unknown | Promise<unknown>;
}

const kindOf = (req: TurnRequest): string => {
  if (req.system.includes('writing honest, specific feedback') || req.system.includes('writing learning notes')) return 'feedback';
  const last = req.messages[req.messages.length - 1].content;
  if (last.includes('asked a clarifying question')) return 'clarify';
  if (last.includes('handed in a framework')) return 'direction';
  if (last.includes('is working on the exhibit')) return 'exhibit';
  if (last.includes('ONE brief process-oriented hint')) return 'nudge_process';
  if (last.includes('still stuck after a hint')) return 'nudge_directional';
  return 'unknown';
};

export function createMemoryLive(options: MemoryLiveOptions) {
  const now = options.now ?? (() => Date.now());
  const db = new Map<string, StoredSession>();
  const starts: number[] = [];
  const asked: TurnRequest[] = [];
  const control = {
    failing: false as boolean,
    reply: options.reply,
  };

  const defaultReply = (kind: string): unknown =>
    kind === 'feedback'
      ? {
          overall_rating: 0,
          overall_feedback: 'You worked through the case steadily.',
          skills: [],
          went_well: 'You kept going.',
          struggled: 'Some stages were short on detail.',
          concepts: '',
          next_focus: 'Practise stating the implication of each exhibit.',
          improvement_area: 'none',
          debrief: [],
          unfinished: [],
        }
      : { message: `Okay (${kind}).`, assessment: 'progress', beat_complete: false, direction_clear: kind === 'direction' };

  const deps: LiveDeps = {
    now,
    loadCase: async (id) => options.cases[id] ?? null,
    pickCase: async () => Object.keys(options.cases).find((id) => isFullSolution(options.cases[id].solution) && !(options.logged?.() ?? []).includes(id)) ?? null,
    getSession: async (userId, id) => {
      const s = db.get(id);
      return s && s.userId === userId ? structuredClone(s) : null;
    },
    getActive: async (userId) => {
      const s = [...db.values()].find((x) => x.userId === userId && x.status === 'active');
      return s ? structuredClone(s) : null;
    },
    getLatest: async (userId) => {
      const s = [...db.values()].filter((x) => x.userId === userId).sort((a, b) => b.createdAt - a.createdAt)[0];
      return s ? structuredClone(s) : null;
    },
    createSession: async (s) => {
      db.set(s.id, structuredClone(s));
      starts.push(s.createdAt);
    },
    saveSession: async (s, expected) => {
      const cur = db.get(s.id);
      if (!cur || cur.version !== expected) return false;
      db.set(s.id, structuredClone(s));
      return true;
    },
    countStarts: async (_userId, since) => starts.filter((t) => t >= since).length,
    ask: async (request) => {
      asked.push(structuredClone(request));
      if (control.failing) throw new Error('model unavailable');
      const kind = kindOf(request);
      const out = await (control.reply ?? defaultReply)(kind, request);
      return { text: typeof out === 'string' ? out : JSON.stringify(out), stopReason: 'end_turn' };
    },
  };

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
