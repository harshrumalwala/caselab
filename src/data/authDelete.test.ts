import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseAuth } from './auth';

type Failure = { message: string; code?: string };

/** Just the two things deleteAccount uses, recording what it asked for and in what order. */
function fakeClient(rpcError: Failure | null = null, signOutError: Failure | null = null) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn: `rpc:${fn}`, args });
      return { data: null, error: rpcError };
    },
    auth: {
      signOut: async (args: unknown) => {
        calls.push({ fn: 'signOut', args });
        return { error: signOutError };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('Supabase auth: deleting the account', () => {
  it('asks the database to delete the caller with the confirmation word, then ends only this browser\'s session', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseAuth(client).deleteAccount();
    expect(calls).toEqual([
      { fn: 'rpc:delete_my_account', args: { p_confirm: 'DELETE' } },
      { fn: 'signOut', args: { scope: 'local' } }, // local: the server no longer has this user to sign out
    ]);
  });

  it('passes a database error on and does not sign out, so a failed deletion changes nothing', async () => {
    const { client, calls } = fakeClient({ message: 'TypeError: Failed to fetch' });
    await expect(createSupabaseAuth(client).deleteAccount()).rejects.toMatchObject({ message: 'TypeError: Failed to fetch' });
    expect(calls.map((c) => c.fn)).toEqual(['rpc:delete_my_account']);
  });

  it('still counts as deleted if ending the local session then fails: the account is gone either way', async () => {
    const { client } = fakeClient(null, { message: 'storage blocked' });
    await expect(createSupabaseAuth(client).deleteAccount()).resolves.toBeUndefined();
  });
});
