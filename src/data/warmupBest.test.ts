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
        select(columns: string) {
          sent.push({ op: 'select', name: table, args: columns });
          return { maybeSingle: async () => answers.select ?? { data: null, error: null } };
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
  it('reads your saved record, or no best when you have none', async () => {
    const some = fakeClient({ select: { data: { best_score: 120, best_streak: 7 }, error: null } });
    expect(await new SupabaseWarmup(some.client).load()).toEqual({ score: 120, streak: 7 });
    expect(some.sent).toEqual([{ op: 'select', name: 'warmup_best', args: 'best_score, best_streak' }]);

    const none = fakeClient({});
    expect(await new SupabaseWarmup(none.client).load()).toEqual({ score: 0, streak: 0 });
  });

  it('offers a record through the function (never a table write) and returns what is saved', async () => {
    const f = fakeClient({ rpc: { data: [{ score: 200, streak: 9 }], error: null } });
    expect(await new SupabaseWarmup(f.client).record({ score: 90, streak: 9 })).toEqual({ score: 200, streak: 9 });
    expect(f.sent).toEqual([{ op: 'rpc', name: 'record_warmup_best', args: { p_score: 90, p_streak: 9 } }]);
  });

  it('passes database errors on so the caller can keep the local copy', async () => {
    const down = { data: null, error: { message: 'boom' } };
    await expect(new SupabaseWarmup(fakeClient({ select: down }).client).load()).rejects.toMatchObject({ message: 'boom' });
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
});
