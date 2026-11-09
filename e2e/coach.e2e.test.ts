// @vitest-environment node
//
// Bucket, the coach, against the REAL project: the deployed analyze-feedback function, the real stored table and a real Claude call.
// It uses the two throwaway accounts. Account A gets four cases (titled "ZZ CaseLab e2e ...", removed afterwards) with written feedback,
// asks for a read, and the checks are on the shape of what comes back and on who can see or change what. The text is always the same,
// so after the first run a repeat is answered from the stored read and costs nothing; the first run makes one Claude call (a few cents).
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readReply } from '../src/data/feedbackInsights';
import { HAVE_TWO_USERS, newClient, signedInClient, TEST_PREFIX, USER_A, USER_B } from './helpers';

describe.skipIf(!HAVE_TWO_USERS)('live Supabase: Bucket, the coach', () => {
  let a: { client: SupabaseClient; userId: string };
  let b: { client: SupabaseClient; userId: string };
  let anon: SupabaseClient;

  // Always the same text, so after the first run a repeat is answered from the stored read and costs nothing.
  const row = (i: number, over: Record<string, unknown> = {}) => ({
    title: `${TEST_PREFIX} coach case ${i}`,
    case_date: `2026-10-0${i}`,
    case_type: 'Profitability',
    overall: 3,
    overall_feedback: `Good structure but I rushed the arithmetic and lost the thread. Case ${i}.`,
    struggled: 'Mental maths under time pressure.',
    skills: {},
    ...over,
  });

  const wipe = async () => {
    const del = await a.client.from('cases').delete().like('title', `${TEST_PREFIX}%`);
    if (del.error) throw del.error;
  };

  beforeAll(async () => {
    a = await signedInClient(USER_A);
    b = await signedInClient(USER_B);
    anon = newClient();
    await wipe();
    const ins = await a.client.from('cases').insert([1, 2, 3, 4].map((i) => row(i)));
    if (ins.error) throw ins.error;
  });

  afterAll(async () => {
    if (a) await wipe();
  });

  it('writes a read of the member\'s own feedback, in the right shape, and keeps it', async () => {
    const { data, error } = await a.client.functions.invoke('analyze-feedback', { body: { scope: 'recent' } });
    expect(error).toBeNull();
    // Compared as sent, so that a failure shows its reason (and detail) in the test output.
    expect(data).toMatchObject({ status: 'ok' });
    const result = readReply(data);
    // Either a fresh read or the stored one from an earlier run with the same text.
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const { insight } = result.read;
    expect(insight.summary.length).toBeGreaterThan(10);
    expect(insight.focus.length).toBeGreaterThan(0);
    expect(insight.focus.length).toBeLessThanOrEqual(3);
    expect(insight.strengths.length).toBeLessThanOrEqual(3);
    for (const f of insight.focus) expect(f.action.length).toBeGreaterThan(5);
    // The feedback was about arithmetic, so a sound read should name it. (A model could phrase it many ways: keep this loose.)
    expect(JSON.stringify(insight).toLowerCase()).toMatch(/quant|arithmetic|math|calculat/);
    expect(result.read.scope).toBe('recent');
    expect(result.read.caseCount).toBe(4);

    // And it is stored: the member can read their own row back.
    const stored = await a.client.from('feedback_insights').select('scope, case_count, model').maybeSingle();
    expect(stored.error).toBeNull();
    expect(stored.data).toMatchObject({ scope: 'recent', case_count: 4 });
  }, 120_000);

  it('answers a repeat with the stored read, without calling Claude again', async () => {
    const { data } = await a.client.functions.invoke('analyze-feedback', { body: { scope: 'recent' } });
    expect(data).toMatchObject({ status: 'ok', cached: true });
    expect(readReply(data)).toMatchObject({ status: 'ok', cached: true });
  }, 60_000);

  it('is private: another member cannot read, write or reset it', async () => {
    const seen = await b.client.from('feedback_insights').select('*');
    expect(seen.error).toBeNull();
    expect(seen.data).toEqual([]);
    expect((await b.client.from('feedback_insights').insert({ user_id: b.userId, scope: 'all', case_count: 1, input_hash: 'abcdef1234567890', result: {}, model: 'm' })).error).not.toBeNull();
    expect((await a.client.from('feedback_insights').update({ updated_at: '2000-01-01' }).eq('user_id', a.userId)).error).not.toBeNull();
    expect((await a.client.from('feedback_insights').delete().eq('user_id', a.userId)).error).not.toBeNull();
    expect((await anon.from('feedback_insights').select('*')).error).not.toBeNull();
  });

  it('refuses a visitor with no account, and a bad request', async () => {
    const visitor = await anon.functions.invoke('analyze-feedback', { body: { scope: 'recent' } });
    expect(visitor.error).not.toBeNull();
    const bad = await a.client.functions.invoke('analyze-feedback', { body: { scope: 'everything' } });
    expect(bad.error).not.toBeNull();
  }, 60_000);

  it('says there is not enough to read, and spends nothing, for a member with too little written', async () => {
    // Account B has no cases with writing, so there is nothing to send.
    const { data } = await b.client.functions.invoke('analyze-feedback', { body: { scope: 'recent' } });
    expect(readReply(data)).toMatchObject({ status: 'not_enough', needed: 3 });
  }, 60_000);
});
