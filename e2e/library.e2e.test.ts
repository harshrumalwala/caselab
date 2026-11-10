// @vitest-environment node
//
// The case library against the REAL project, tried the way an attacker would: direct API requests as a member, as another member, and as a
// visitor with no account. It makes no assumption about what is loaded into the library, so it holds before and after the cases are loaded.
// Needs the two throwaway users (see README).
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAVE_TWO_USERS, newClient, signedInClient, TEST_PREFIX, USER_A, USER_B } from './helpers';

describe.skipIf(!HAVE_TWO_USERS)('live Supabase: the case library', () => {
  let a: { client: SupabaseClient; userId: string };
  let b: { client: SupabaseClient; userId: string };
  let anon: SupabaseClient;

  beforeAll(async () => {
    a = await signedInClient(USER_A);
    b = await signedInClient(USER_B);
    anon = newClient();
    await a.client.from('cases').delete().like('title', `${TEST_PREFIX}%`);
  });

  afterAll(async () => {
    if (a) await a.client.from('cases').delete().like('title', `${TEST_PREFIX}%`);
  });

  it('lets a verified member search it, and returns only what a member who has not done the case may know', async () => {
    const { data, error } = await a.client.rpc('search_library', { p_query: 'hotel', p_limit: 5 });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      expect(Object.keys(row).sort()).toEqual(['also_in', 'book', 'case_type', 'cochair_pick', 'id', 'industry', 'name', 'school', 'year']);
    }
    const none = await a.client.rpc('search_library', { p_query: 'x' }); // one letter is not a search
    expect(none.error).toBeNull();
    expect(none.data).toEqual([]);
  });

  it('keeps our analysis unreadable: no table read, no column read, and nothing released for a case you have not logged', async () => {
    for (const client of [a.client, b.client, anon]) {
      expect((await client.from('library_case_notes').select('*')).error).not.toBeNull();
      expect((await client.from('library_case_notes').select('strong_answer')).error).not.toBeNull();
    }
    // The public columns of the main table are readable by a member, but nothing outside that list.
    expect((await a.client.from('library_cases').select('id, name, book, case_type, industry')).error).toBeNull();
    expect((await a.client.from('library_cases').select('name_key')).error).not.toBeNull();
    // A random library id releases nothing.
    const released = await a.client.rpc('library_notes_for', { p_library_id: '99999999-9999-4999-8999-999999999999' });
    expect(released.error).toBeNull();
    expect(released.data).toEqual([]);
  });

  it('is read-only for everyone: no member or visitor can add, change or remove a library case', async () => {
    const row = { book: 'ZZ test book', school: 'ZZ', year: 2026, name: `${TEST_PREFIX} library case`, case_type: 'Other', industry: 'Other' };
    for (const client of [a.client, anon]) {
      expect((await client.from('library_cases').insert(row)).error).not.toBeNull();
      expect((await client.from('library_cases').update({ name: 'Hacked' }).eq('book', 'Booth MCG 2026-2027')).error).not.toBeNull();
      expect((await client.from('library_cases').delete().eq('book', 'Booth MCG 2026-2027')).error).not.toBeNull();
      expect((await client.from('library_case_notes').insert({ case_id: '99999999-9999-4999-8999-999999999999' })).error).not.toBeNull();
    }
  });

  it('is closed to visitors without an account', async () => {
    expect((await anon.rpc('search_library', { p_query: 'hotel' })).error).not.toBeNull();
    expect((await anon.rpc('library_notes_for', { p_library_id: '99999999-9999-4999-8999-999999999999' })).error).not.toBeNull();
    expect((await anon.rpc('match_my_cases')).error).not.toBeNull();
    expect((await anon.from('library_cases').select('id')).error).not.toBeNull();
  });

  it('keeps the owner-only tools out of every member\'s reach', async () => {
    for (const client of [a.client, b.client, anon]) {
      expect((await client.rpc('link_cases_to_library')).error).not.toBeNull();
      expect((await client.rpc('library_name_key', { p_name: 'x' })).error).not.toBeNull();
      expect((await client.rpc('library_source_matches', { p_source: 'x', p_book: 'y', p_also_in: [] })).error).not.toBeNull();
    }
  });

  it('lets a member log a case with no link, and refuses a link to a library case that does not exist', async () => {
    const ok = await a.client.from('cases').insert({ title: `${TEST_PREFIX} no link`, case_date: '2026-10-01', case_type: 'Other', library_id: null }).select('id, library_id').single();
    expect(ok.error).toBeNull();
    expect(ok.data?.library_id).toBeNull();
    const bad = await a.client.from('cases').insert({ title: `${TEST_PREFIX} bad link`, case_date: '2026-10-01', case_type: 'Other', library_id: '99999999-9999-4999-8999-999999999999' });
    expect(bad.error).not.toBeNull();
  });

  it('shows a member only their own cases when they review matches, and never anyone else\'s', async () => {
    await a.client.from('cases').insert({ title: `${TEST_PREFIX} Army Hotel`, source: 'Booth', case_date: '2026-10-01', case_type: 'Profitability' });
    const mineA = await a.client.rpc('match_my_cases');
    expect(mineA.error).toBeNull();
    const mineB = await b.client.rpc('match_my_cases');
    expect(mineB.error).toBeNull();
    const ids = ((mineB.data ?? []) as { title: string }[]).map((r) => r.title);
    expect(ids.some((t) => t.startsWith(TEST_PREFIX))).toBe(false);
    for (const row of (mineA.data ?? []) as Record<string, unknown>[]) {
      expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['strong_answer']));
      expect(JSON.stringify(row)).not.toMatch(/strong_answer|pitfalls|summary/);
    }
  });
});
