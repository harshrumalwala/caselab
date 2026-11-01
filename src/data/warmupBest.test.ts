import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createMemoryWarmup, SupabaseWarmup } from './warmupBest';

type Result = { data: unknown; error: { message: string } | null };

/** Just the two calls SupabaseWarmup makes, recording what was sent. */
function fakeClient(answers: { select?: Result; rpc?: Result }) {
  const sent: { op: string; name: string; args?: unknown }[] = [];
  const client = {
    from(table: string) {
      return {
        select: async (columns: string) => {
          sent.push({ op: 'select', name: table, args: columns });
          return answers.select ?? { data: [], error: null };
        },
      };
    },
    rpc: async (name: string, args: unknown) => {
      sent.push({ op: 'rpc', name, args });
      return answers.rpc ?? { data: [], error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, sent };
}

describe('SupabaseWarmup', () => {
  it('reads your saved record for each round length, or no best for a length you have not played', async () => {
    const some = fakeClient({
      select: {
        data: [
          { seconds: 60, best_score: 120, best_streak: 7 },
          { seconds: 120, best_score: 260, best_streak: 11 },
        ],
        error: null,
      },
    });
    expect(await new SupabaseWarmup(some.client).loadAll()).toEqual({
      30: { score: 0, streak: 0 },
      60: { score: 120, streak: 7 },
      120: { score: 260, streak: 11 },
    });
    expect(some.sent).toEqual([{ op: 'select', name: 'warmup_best', args: 'seconds, best_score, best_streak' }]);

    const none = fakeClient({});
    expect(await new SupabaseWarmup(none.client).loadAll()).toEqual({ 30: { score: 0, streak: 0 }, 60: { score: 0, streak: 0 }, 120: { score: 0, streak: 0 } });
  });

  it('ignores a row for a length that is not a round length', async () => {
    const odd = fakeClient({ select: { data: [{ seconds: 45, best_score: 999, best_streak: 9 }], error: null } });
    const all = await new SupabaseWarmup(odd.client).loadAll();
    expect(Object.values(all).every((b) => b.score === 0)).toBe(true);
  });

  it('offers a record through the function (never a table write), with its round length, and returns what is saved', async () => {
    const f = fakeClient({ rpc: { data: [{ score: 200, streak: 9 }], error: null } });
    expect(await new SupabaseWarmup(f.client).record({ score: 90, streak: 9 })).toEqual({ score: 200, streak: 9 });
    expect(await new SupabaseWarmup(f.client).record({ score: 40, streak: 2 }, 30)).toEqual({ score: 200, streak: 9 });
    expect(f.sent).toEqual([
      { op: 'rpc', name: 'record_warmup_best', args: { p_score: 90, p_streak: 9, p_seconds: 60 } }, // 60 seconds unless told otherwise
      { op: 'rpc', name: 'record_warmup_best', args: { p_score: 40, p_streak: 2, p_seconds: 30 } },
    ]);
  });

  it('passes database errors on so the caller can keep the local copy', async () => {
    const down = { data: null, error: { message: 'boom' } };
    await expect(new SupabaseWarmup(fakeClient({ select: down }).client).loadAll()).rejects.toMatchObject({ message: 'boom' });
    await expect(new SupabaseWarmup(fakeClient({ rpc: down }).client).record({ score: 1, streak: 1 })).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('the in-memory stand-in behaves like the database', () => {
  it('only raises the record', async () => {
    const mem = createMemoryWarmup();
    expect(await mem.record({ score: 100, streak: 5 })).toEqual({ score: 100, streak: 5 });
    expect(await mem.record({ score: 60, streak: 8 })).toEqual({ score: 100, streak: 8 });
    expect(mem.saved).toEqual({ score: 100, streak: 8 });
  });

  it('keeps a separate record for each round length', async () => {
    const mem = createMemoryWarmup({ score: 50, streak: 2 }); // a single record is the 60-second one
    await mem.record({ score: 30, streak: 4 }, 30);
    await mem.record({ score: 200, streak: 12 }, 120);
    await mem.record({ score: 10, streak: 1 }, 30); // lower: no change
    expect(mem.savedAll).toEqual({ 30: { score: 30, streak: 4 }, 60: { score: 50, streak: 2 }, 120: { score: 200, streak: 12 } });
    expect(await mem.loadAll()).toEqual(mem.savedAll);
  });
});
