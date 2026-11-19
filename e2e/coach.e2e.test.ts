// @vitest-environment node
//
// Bucket, the coach, against the REAL project: the deployed analyze-feedback function, the real stored table and a real Claude call.
// It uses the two throwaway accounts. Account A gets four cases (titled "ZZ CaseLab e2e ...", removed afterwards) with written feedback,
// asks for a read, and the checks are on the shape of what comes back and on who can see or change what. A read covers everything on the
// account that has writing, and account A is shared with whoever is doing a live check, so the expected number of cases is counted on the
// account first and the four are added to it. The text the test writes is always the same, so while the rest of the account is unchanged a
// repeat is answered from the stored read and costs nothing; otherwise one run makes one Claude call (a few cents).
// Account B is counted the same way, because the last check wants a member the read has too little to go on: while B is under the
// threshold the check asks for the exact number it saw, and above it the check says why it stepped aside instead of failing.
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FEEDBACK_COLUMNS, hasWriting, MIN_CASES, RECENT_CASES, type FeedbackCaseRow } from '../supabase/functions/_shared/feedbackInsights';
import { readReply } from '../src/data/feedbackInsights';
import { HAVE_TWO_USERS, newClient, signedInClient, TEST_PREFIX, USER_A, USER_B } from './helpers';

/** What the function fetches before it picks the cases to read (`FETCH_ROWS` in supabase/functions/analyze-feedback/index.ts). */
const FETCH_ROWS = 150;
const INSERTED = 4;

describe.skipIf(!HAVE_TWO_USERS)('live Supabase: Bucket, the coach', () => {
  let a: { client: SupabaseClient; userId: string };
  let b: { client: SupabaseClient; userId: string };
  let anon: SupabaseClient;
  /** How many cases a read already covered before this run inserted anything: account A is shared, and people log cases on it. */
  let baseline = 0;
  /** What a 'recent' read should cover once the four are in. */
  let expectedCases = INSERTED;
  /** The same count for account B, which the "not enough to read" check needs to be under MIN_CASES. Account B is shared too. */
  let baselineB = 0;

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

  // A read covers every case on the account that has writing, not only the ones with the test's prefix, so the expected number is
  // counted here the way the function counts it (supabase/functions/_shared/feedbackInsights.ts: rows with writing, newest first,
  // never more than RECENT_CASES). Anything the test did not create is left exactly where it is.
  const casesWithWriting = async (client: SupabaseClient) => {
    const { data, error } = await client.from('cases').select(FEEDBACK_COLUMNS).order('case_date', { ascending: false }).limit(FETCH_ROWS);
    if (error) throw error;
    return ((data ?? []) as FeedbackCaseRow[]).filter(hasWriting).length;
  };

  beforeAll(async () => {
    a = await signedInClient(USER_A);
    b = await signedInClient(USER_B);
    anon = newClient();
    await wipe();
    baseline = await casesWithWriting(a.client);
    baselineB = await casesWithWriting(b.client);
    if (baseline + INSERTED > RECENT_CASES) {
      throw new Error(
        `Account A already has ${baseline} cases with written feedback, so a 'recent' read (at most ${RECENT_CASES} cases) cannot cover all ${INSERTED} this test adds. ` +
          `Remove cases from the throwaway account, or give the four cases a date newer than the rest, before running this file.`,
      );
    }
    expectedCases = baseline + INSERTED;
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
    // The four this test inserted, on top of whatever the shared account already held (read just before they went in).
    expect(result.read.caseCount).toBe(expectedCases);

    // And it is stored: the member can read their own row back.
    const stored = await a.client.from('feedback_insights').select('scope, case_count, model').maybeSingle();
    expect(stored.error).toBeNull();
    expect(stored.data).toMatchObject({ scope: 'recent', case_count: expectedCases });
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

  it('says there is not enough to read, and spends nothing, for a member with too little written', async (ctx) => {
    // Account B is shared with whoever is doing a live check, so what it holds is counted rather than assumed: a read needs
    // MIN_CASES cases with writing, and while B is under that — the normal state — the function must say so, and say how few it saw.
    if (baselineB >= MIN_CASES) {
      const note =
        `account B has ${baselineB} cases with written feedback and a read needs ${MIN_CASES}, so "not enough to read" is not true of it today. ` +
        `Asking anyway would spend a Claude call and store a read on B that this test has no right to delete. ` +
        `Remove those cases from the throwaway account to get this check back.`;
      console.warn(`\ncoach.e2e: skipping "not enough to read": ${note}\n`);
      ctx.skip(note);
    }
    const { data } = await b.client.functions.invoke('analyze-feedback', { body: { scope: 'recent' } });
    expect(readReply(data)).toMatchObject({ status: 'not_enough', caseCount: baselineB, needed: MIN_CASES });
  }, 60_000);
});
