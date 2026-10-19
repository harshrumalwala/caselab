// @vitest-environment node
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseRepository } from '../src/data/supabaseRepository';
import { blankCaseInput } from '../src/domain/factory';
import type { CaseRecord } from '../src/domain/types';
import { richCase } from '../src/test/builders';
import {
  cleanup,
  counts,
  HAVE_CREDENTIALS,
  newClient,
  signedInClient,
  SUPABASE_KEY,
  SUPABASE_URL,
  TEST_PREFIX,
} from './helpers';

const testCase = (overrides: Partial<CaseRecord> = {}): CaseRecord => ({
  ...richCase(),
  id: randomUUID(),
  title: `${TEST_PREFIX} full case`,
  industry: 'Technology / SaaS',
  ...overrides,
});

describe.skipIf(!HAVE_CREDENTIALS)('live Supabase: repository, auth and row level security', () => {
  let client: SupabaseClient;
  let userId: string;
  let repo: SupabaseRepository;
  let baseline: { cases: number; opportunities: number };

  beforeAll(async () => {
    ({ client, userId } = await signedInClient());
    repo = new SupabaseRepository(client);
    await cleanup(client); // leftovers from an interrupted earlier run
    baseline = await counts(client);
  });

  afterAll(async () => {
    await cleanup(client);
  });

  it('refuses a wrong password', async () => {
    const { error } = await newClient().auth.signInWithPassword({ email: 'harsh.rumalwala@chicagobooth.edu', password: 'definitely-not-it' });
    expect(error?.message).toMatch(/invalid login credentials/i);
  });

  it('gives a signed-out visitor no access to read or write cases or lists', async () => {
    const anon = new SupabaseRepository(newClient());
    await expect(anon.loadAll()).rejects.toBeDefined();
    await expect(anon.insertCase(testCase())).rejects.toBeDefined();
    const bare = await fetch(`${SUPABASE_URL}/rest/v1/cases?select=id`, { headers: { apikey: SUPABASE_KEY } });
    expect(bare.status).toBe(401);
  });

  it('saves a fully populated case and a brand-new session reads back exactly the same data', async () => {
    const record = testCase();
    await repo.insertCase(record);

    const other = await signedInClient(); // a second device / fresh page load
    const reloaded = (await new SupabaseRepository(other.client).loadAll()).cases.find((c) => c.id === record.id);
    expect(reloaded).toEqual(record);

    // The database, not the client, decided who owns it.
    const { data } = await client.from('cases').select('user_id').eq('id', record.id).single();
    expect(data?.user_id).toBe(userId);
  });

  it('keeps blank optional fields null and unrated skills unrated', async () => {
    const blank = { ...blankCaseInput(), title: `${TEST_PREFIX} minimal`, caseType: 'Revenue' as const };
    const now = new Date().toISOString();
    const id = randomUUID();
    await repo.insertCase({ ...blank, id, createdAt: now, updatedAt: now });

    const { data } = await client.from('cases').select('*').eq('id', id).single();
    for (const col of ['source', 'industry', 'partner', 'overall', 'overall_feedback', 'went_well', 'struggled', 'concepts', 'next_focus', 'improvement_area', 'other_notes']) {
      expect(data?.[col], col).toBeNull();
    }
    const back = (await repo.loadAll()).cases.find((c) => c.id === id);
    expect(back?.overall).toBeNull();
    expect(back?.skills.framework.rating).toBeNull();
  });

  it('edits in place: changes the fields, keeps created_at, does not duplicate', async () => {
    const record = testCase({ title: `${TEST_PREFIX} to edit` });
    await repo.insertCase(record);
    const before = (await repo.loadAll()).cases.length;

    await repo.updateCase({ ...record, title: `${TEST_PREFIX} edited`, overall: 2, updatedAt: new Date().toISOString() });

    const all = (await repo.loadAll()).cases;
    expect(all).toHaveLength(before);
    const edited = all.find((c) => c.id === record.id);
    expect(edited).toMatchObject({ title: `${TEST_PREFIX} edited`, overall: 2, createdAt: record.createdAt });
  });

  it('reports an edit to a case that no longer exists instead of pretending it worked', async () => {
    await expect(repo.updateCase(testCase({ id: randomUUID() }))).rejects.toMatchObject({ code: 'PGRST116' });
  });

  it('enforces the database rules', async () => {
    const insert = (row: Record<string, unknown>) => client.from('cases').insert({ title: `${TEST_PREFIX} bad`, case_type: 'Revenue', ...row });
    expect((await insert({ case_type: 'Not a type' })).error?.code).toBe('23514');
    expect((await insert({ overall: 9 })).error?.code).toBe('23514');
    expect((await insert({ title: '   ' })).error?.code).toBe('23514');
    expect((await insert({ improvement_area: 'nope' })).error?.code).toBe('23514');
  });

  it("cannot write a row for someone else, or give one of yours away", async () => {
    const stranger = randomUUID();
    const forged = await client.from('cases').insert({ user_id: stranger, title: `${TEST_PREFIX} forged`, case_type: 'Revenue' });
    expect(forged.error).not.toBeNull();

    const record = testCase({ title: `${TEST_PREFIX} mine` });
    await repo.insertCase(record);
    const gift = await client.from('cases').update({ user_id: stranger }).eq('id', record.id);
    expect(gift.error).not.toBeNull();
    const { data } = await client.from('cases').select('user_id').eq('id', record.id).single();
    expect(data?.user_id).toBe(userId);
  });

  it('adds, reads and removes list items', async () => {
    const item = { id: randomUUID(), kind: 'skill' as const, text: `${TEST_PREFIX} mental math`, createdAt: new Date().toISOString() };
    await repo.insertOpportunity(item);
    expect((await repo.loadAll()).opportunities.find((o) => o.id === item.id)).toEqual(item);
    await repo.deleteOpportunity(item.id);
    expect((await repo.loadAll()).opportunities.some((o) => o.id === item.id)).toBe(false);
  });

  it('deletes cases and leaves your account exactly as it found it', async () => {
    const record = testCase({ title: `${TEST_PREFIX} to delete` });
    await repo.insertCase(record);
    await repo.deleteCase(record.id);
    expect((await repo.loadAll()).cases.some((c) => c.id === record.id)).toBe(false);

    await cleanup(client);
    expect(await counts(client)).toEqual(baseline);
  });
});
