// The in-memory twin of everything the live case needs from the outside world: the sessions "table", the case library, the clock and the
// model. `handleLive` and the whole engine run unchanged on top of it, so a test (or the dry run in scripts/liveCaseDryRun.mjs) plays a real
// case with no network and no database.
//
// It lives with the tests so that none of it (the prompts included) is part of the app that ships. `memoryLive.ts` wraps these deps in the
// app's own `LiveClient`; the dry run uses the deps directly, because it has to read the saved session back. Everything here is plain
// TypeScript that Node's type stripping can read, so keep enums, namespaces and parameter properties out of it.
import {
  forgetExhibitSignal,
  isFullSolution,
  type CaseInfo,
  type LiveDeps,
  type StoredSession,
  type TurnRequest,
} from '../../supabase/functions/_shared/liveCaseCoach.ts';

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
  /** Keep a copy of every request the engine made, to assert on. Off for the dry run, which plays thousands of cases and never reads them. */
  record?: boolean;
}

export interface MemoryLiveControl {
  failing: boolean;
  reply: MemoryLiveOptions['reply'];
}

export interface MemoryLiveDeps {
  deps: LiveDeps;
  db: Map<string, StoredSession>;
  asked: TurnRequest[];
  starts: number[];
  control: MemoryLiveControl;
}

/** Which kind of turn the coach is being asked for, read from the request the engine built (never decided here). */
export const kindOf = (req: TurnRequest): string => {
  if (req.system.includes('writing honest, specific feedback') || req.system.includes('writing learning notes')) return 'feedback';
  const last = req.messages[req.messages.length - 1].content;
  if (last.includes('asked a clarifying question')) return 'clarify';
  if (last.includes('handed in a framework')) return 'direction';
  if (last.includes('is working on the exhibit')) return 'exhibit';
  if (last.includes('ONE brief process-oriented hint')) return 'nudge_process';
  if (last.includes('still stuck after a hint')) return 'nudge_directional';
  return 'unknown';
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

/** The sessions table, the library, the clock and the model, in memory. Nothing of the engine is reimplemented here. */
export function createMemoryLiveDeps(options: MemoryLiveOptions): MemoryLiveDeps {
  // A new in-memory world is a new library, so the picker's signal (kept in the handler's own memory, as it is in the Edge Function)
  // must not be the one the last test or the last dry run left behind.
  forgetExhibitSignal();
  const now = options.now ?? (() => Date.now());
  const db = new Map<string, StoredSession>();
  const starts: number[] = [];
  const asked: TurnRequest[] = [];
  const control: MemoryLiveControl = { failing: false, reply: options.reply };

  const deps: LiveDeps = {
    now,
    loadCase: async (id) => options.cases[id] ?? null,
    eachCaseSolution: async (visit) => {
      for (const [id, c] of Object.entries(options.cases)) visit({ id, solution: c.solution });
    },
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
      if (options.record !== false) asked.push(structuredClone(request));
      if (control.failing) throw new Error('model unavailable');
      const kind = kindOf(request);
      const out = await (control.reply ?? defaultReply)(kind, request);
      return { text: typeof out === 'string' ? out : JSON.stringify(out), stopReason: 'end_turn' };
    },
  };

  return { deps, db, asked, starts, control };
}
