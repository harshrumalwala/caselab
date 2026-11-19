// @vitest-environment node
//
// Is the database that is actually live the one the code expects, and are the private parts still closed? Run against the REAL
// project with the two throwaway accounts (see README), by direct API requests as a member and as a visitor.
//
//   * Every table and column the migrations create must exist live, and every function the app calls must exist with the arguments
//     the app sends. This is the check that catches "the app was deployed before its migration was applied".
//   * The tables that hold requests, conversations, messages, reports and scheduled times must stay closed to direct access.
//   * The Warm-up record, the notification choice and account deletion keep their rules.
//
// Nothing here sends a message or a request, and nothing deletes an account: only read-only calls, refusals, and private rows that
// belong to the test accounts themselves.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SupabaseWarmup } from '../src/data/warmupBest';
import { HAVE_TWO_USERS, newClient, signedInClient, USER_A, USER_B } from './helpers';

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url);
const sql = () =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(new URL(f, MIGRATIONS), 'utf8'))
    .join('\n');

/** Table names from `create table public.x`. */
const migrationTables = () => [...new Set([...sql().matchAll(/create table public\.([a-z_]+)/gi)].map((m) => m[1]))].sort();

/** [table, column] pairs from `alter table public.x add column y ...` (one statement may add several). */
function migrationColumns(): [string, string][] {
  const out: [string, string][] = [];
  for (const m of sql().matchAll(/alter table public\.([a-z_]+)\s+(add column[^;]*);/gi)) {
    for (const c of m[2].matchAll(/add column\s+([a-z_]+)/gi)) out.push([m[1], c[1]]);
  }
  return out;
}

const MISSING_TABLE = /could not find the table|does not exist|relation .* does not exist/i;
const MISSING_COLUMN = /column .* does not exist|could not find the .* column/i;

describe.skipIf(!HAVE_TWO_USERS)('live Supabase: the deployed schema matches the code, and private tables stay closed', () => {
  let a: { client: SupabaseClient; userId: string };
  let b: { client: SupabaseClient; userId: string };
  let anon: SupabaseClient;

  beforeAll(async () => {
    a = await signedInClient(USER_A);
    b = await signedInClient(USER_B);
    anon = newClient();
  });

  afterAll(async () => {
    // Put the one private choice this file touches back to the default (emails on).
    if (a) await a.client.from('notification_settings').upsert({ user_id: a.userId, email_requests: true }, { onConflict: 'user_id' });
  });

  describe('the schema', () => {
    it('finds the tables and columns it is about to check', () => {
      expect(migrationTables().length).toBeGreaterThanOrEqual(15);
      expect(migrationTables()).toEqual(expect.arrayContaining(['cases', 'profiles', 'weekly_goal', 'interviewed_cases', 'notification_settings']));
      expect(migrationColumns()).toEqual(expect.arrayContaining([['profiles', 'share_interviewed'], ['profiles', 'share_level'], ['profiles', 'level'], ['practice_requests', 'emailed_at']]));
    });

    it('has every table the migrations create', async () => {
      const missing: string[] = [];
      for (const table of migrationTables()) {
        const { error } = await a.client.from(table).select('*').limit(0);
        // A permission error means the table is there and closed to this role, which is fine. Only "not found" is a problem.
        if (error && (error.code === 'PGRST205' || error.code === '42P01' || MISSING_TABLE.test(error.message))) missing.push(table);
      }
      expect(missing, `tables missing from the live database: ${missing.join(', ')}`).toEqual([]);
    });

    it('has every column the migrations add', async () => {
      const missing: string[] = [];
      for (const [table, column] of migrationColumns()) {
        const { error } = await a.client.from(table).select(column).limit(0);
        if (error && (error.code === '42703' || error.code === 'PGRST204' || MISSING_COLUMN.test(error.message))) missing.push(`${table}.${column}`);
      }
      expect(missing, `columns missing from the live database: ${missing.join(', ')}`).toEqual([]);
    });

    it('has the functions the app calls, with the arguments it sends them', async () => {
      const nobody = randomUUID();
      const calls: [string, SupabaseClient, Record<string, unknown>][] = [
        ['my_practice_requests', a.client, {}],
        ['my_meeting_prefs', a.client, {}],
        ['my_practice_meetings', a.client, {}],
        ['propose_practice_meeting', a.client, { p_other: nobody, p_slots: [], p_duration: 60, p_request: null, p_conversation: null }], // refused (no times, nobody), so nothing is written
        ['confirm_practice_meeting', a.client, { p_meeting: nobody, p_slot: new Date(Date.now() + 86_400_000).toISOString() }],
        ['counter_practice_meeting', a.client, { p_meeting: nobody, p_slots: [], p_duration: 60 }],
        ['decline_practice_meeting', a.client, { p_meeting: nobody }],
        ['cancel_practice_meeting', a.client, { p_meeting: nobody }],
        ['change_practice_meeting', a.client, { p_meeting: nobody, p_slots: [], p_duration: 60 }],
        ['save_my_meeting_prefs', a.client, { p_link: 'javascript:alert(1)', p_zone: null }], // refused, so nothing is written
        ['my_conversations', a.client, {}],
        ['my_practice_blocks', a.client, {}],
        ['member_interviewed', a.client, { p_member: nobody }],
        ['public_person', anon, { p_id: nobody }],
        ['public_person_cases', anon, { p_id: nobody }],
        ['conversation_messages', b.client, { p_conversation: nobody }],
        ['mark_practice_answers_seen', a.client, {}],
        ['delete_my_account', a.client, { p_confirm: 'not the word' }], // refuses, so nothing is deleted
        ['record_warmup_best', b.client, { p_score: 0, p_streak: 0, p_seconds: 45 }], // refused (45 isn't a round length), so no row is written
        ['respond_practice_request', b.client, { p_id: nobody, p_accept: true, p_reply: '', p_block: false }],
        ['cancel_practice_request', a.client, { p_id: nobody }],
        ['send_message', b.client, { p_conversation: nobody, p_body: 'x' }],
        ['set_conversation_muted', b.client, { p_conversation: nobody, p_muted: false }],
        ['set_conversation_archived', b.client, { p_conversation: nobody, p_archived: false }],
        ['mark_conversation_read', b.client, { p_conversation: nobody }],
        ['delete_message', b.client, { p_id: nobody }],
        ['report_conversation', b.client, { p_conversation: nobody, p_reason: 'x', p_block: false }],
        ['unblock_practice_asker', a.client, { p_user: nobody }],
        ['block_member', a.client, { p_user: a.userId }], // refuses to block yourself, so no row is written
      ];
      const notThere: string[] = [];
      for (const [name, client, args] of calls) {
        const { error } = await client.rpc(name, args);
        // PGRST202 is "no such function with those arguments"; any other answer (data, a refusal, a permission error) means it exists.
        if (error?.code === 'PGRST202') notThere.push(name);
      }
      expect(notThere, `functions missing or with different arguments live: ${notThere.join(', ')}`).toEqual([]);
    });
  });

  describe('the tables behind a profile link', () => {
    // These two are read ONLY through public_person(id) / public_person_cases(id) (checked above). A direct read by
    // anyone, with any filter, count, order or range, must come back empty or refused.
    // NOTE: this fails until the owner applies 20261124120000_link_only_profiles.sql, which is the point: it is the
    // check that the live database matches the code.
    const tables = ['public_profiles', 'public_shared_cases'] as const;

    it('are closed to visitors and to members, however the read is shaped', async () => {
      for (const table of tables) {
        for (const who of [anon, a.client]) {
          const shapes = [
            who.from(table).select('*'),
            who.from(table).select('user_id'),
            who.from(table).select('*', { count: 'exact', head: true }),
            who.from(table).select('*').order('case_date', { ascending: false }).range(0, 99),
          ];
          for (const shape of shapes) {
            const { data, error, count } = await shape;
            expect(error === null ? { rows: data ?? [], count: count ?? 0 } : { rows: [], count: 0 }, table).toEqual({ rows: [], count: 0 });
          }
        }
      }
    });

    it('cannot be written to either', async () => {
      for (const table of tables) {
        for (const who of [anon, a.client]) {
          expect((await who.from(table).insert({ user_id: a.userId })).error, `${table} write`).not.toBeNull();
        }
      }
    });
  });

  describe('tables that hold requests, conversations, messages and meeting details', () => {
    // NOTE: 20261126120000_meeting_prefs.sql was applied on 2026-11-17 (02:51 UTC on the 18th) and this passes. It stays
    // the check that the live database matches the code: a table added here fails until its migration is applied.
    // NOTE: the three scheduling tables come from 20261127120000_practice_meetings.sql (#99), applied on 2026-11-18, and this
    // passes on them. A table added here fails until its migration is applied — that is exactly what it is for.
    const closed = [
      'practice_requests', 'practice_blocks', 'conversations', 'conversation_members', 'messages', 'message_reports', 'meeting_prefs',
      'practice_meetings', 'practice_meeting_proposals', 'practice_meeting_confirmations',
    ];

    it('refuse every direct read and write, as a member and as a visitor', async () => {
      for (const table of closed) {
        for (const who of [a.client, anon]) {
          expect((await who.from(table).select('*')).error, `${table} read`).not.toBeNull();
          expect((await who.from(table).insert({})).error, `${table} write`).not.toBeNull();
        }
      }
    });

    it('lets a member see only their own requests and conversations through the functions, and a stranger nothing', async () => {
      const mine = await a.client.rpc('my_practice_requests');
      expect(mine.error).toBeNull();
      expect(Array.isArray(mine.data)).toBe(true);
      const nobody = randomUUID();
      // Someone else's conversation, or one that doesn't exist, reads as nothing and can't be written to.
      const read = await b.client.rpc('conversation_messages', { p_conversation: nobody });
      expect(read.error?.code === undefined ? (read.data ?? []) : []).toEqual([]);
      expect((await b.client.rpc('send_message', { p_conversation: nobody, p_body: 'hello' })).error).not.toBeNull();
      expect((await b.client.rpc('respond_practice_request', { p_id: nobody, p_accept: true, p_reply: '', p_block: false })).error).not.toBeNull();
    });

    it('gives visitors without an account none of the member functions', async () => {
      for (const [name, args] of [
        ['my_practice_requests', {}],
        ['my_conversations', {}],
        ['my_meeting_prefs', {}],
        ['my_practice_meetings', {}],
        ['cancel_practice_meeting', { p_meeting: randomUUID() }],
        ['member_interviewed', { p_member: randomUUID() }],
        ['delete_my_account', { p_confirm: 'DELETE' }], // refused before it can do anything: there is no one signed in
      ] as const) {
        expect((await anon.rpc(name, args as Record<string, unknown>)).error, name).not.toBeNull();
      }
    });
  });

  describe('the Warm-up record', () => {
    it('only ever goes up, and is private to its owner', async () => {
      const warm = new SupabaseWarmup(a.client);
      const first = await warm.record({ score: 5, streak: 1 });
      expect(first.score).toBeGreaterThanOrEqual(5);
      expect(first.streak).toBeGreaterThanOrEqual(1);

      const lower = await warm.record({ score: 1, streak: 0 }); // a worse round can't lower the record
      expect(lower).toEqual(first);
      expect((await warm.loadAll())[60]).toEqual(first);

      // Each round length keeps its own record, and a length that doesn't exist is refused.
      const thirty = await warm.record({ score: 7, streak: 2 }, 30);
      const twoMinutes = await warm.record({ score: 9, streak: 3 }, 120);
      expect(thirty.score).toBeGreaterThanOrEqual(7);
      expect(twoMinutes.score).toBeGreaterThanOrEqual(9);
      const all = await warm.loadAll();
      expect(all[30]).toEqual(thirty);
      expect(all[120]).toEqual(twoMinutes);
      expect(all[60]).toEqual(first); // the other lengths didn't touch it
      expect((await a.client.rpc('record_warmup_best', { p_score: 1, p_streak: 1, p_seconds: 45 })).error).not.toBeNull();
      expect((await a.client.rpc('record_warmup_best', { p_score: 1, p_streak: 1 })).error).toBeNull(); // the old two-argument call still works

      // Another member reads only their own row, never A's.
      const seen = await b.client.from('warmup_best').select('user_id');
      expect(seen.error).toBeNull();
      expect((seen.data ?? []).every((r: { user_id: string }) => r.user_id === b.userId)).toBe(true);

      // The record can't be written to directly, by its owner or anyone else, or read by a visitor.
      expect((await a.client.from('warmup_best').update({ best_score: 100000 }).eq('user_id', a.userId)).error).not.toBeNull();
      expect((await a.client.from('warmup_best').insert({ best_score: 100000 })).error).not.toBeNull();
      expect((await anon.from('warmup_best').select('*')).error).not.toBeNull();
      expect((await warm.loadAll())[60]).toEqual(first);
    });
  });

  describe('the email choice', () => {
    it('is private to its owner, and can be changed by them', async () => {
      const set = await a.client.from('notification_settings').upsert({ user_id: a.userId, email_requests: false }, { onConflict: 'user_id' });
      expect(set.error).toBeNull();
      const mine = await a.client.from('notification_settings').select('email_requests').eq('user_id', a.userId).single();
      expect(mine.data?.email_requests).toBe(false);

      // Nobody else can read it, change it, or write one for A, and a visitor gets nothing.
      const seen = await b.client.from('notification_settings').select('*').eq('user_id', a.userId);
      expect(seen.error).toBeNull();
      expect(seen.data).toEqual([]);
      await b.client.from('notification_settings').update({ email_requests: true }).eq('user_id', a.userId);
      expect((await b.client.from('notification_settings').insert({ user_id: a.userId, email_requests: true })).error).not.toBeNull();
      const after = await a.client.from('notification_settings').select('email_requests').eq('user_id', a.userId).single();
      expect(after.data?.email_requests).toBe(false);
      expect((await anon.from('notification_settings').select('*')).error).not.toBeNull();

      await a.client.from('notification_settings').upsert({ user_id: a.userId, email_requests: true }, { onConflict: 'user_id' });
    });
  });

  describe('deleting your own account', () => {
    it('refuses unless the exact word is sent, and leaves the account working', async () => {
      for (const word of ['', 'delete', 'DELETE ', 'yes', 'DELET']) {
        const res = await a.client.rpc('delete_my_account', { p_confirm: word });
        expect(res.error, `"${word}" must be refused`).not.toBeNull();
        expect(res.error?.code).not.toBe('PGRST202'); // it exists; it just said no
      }
      // The account is untouched: a brand new sign-in still works, and it is still A.
      const again = await signedInClient(USER_A);
      expect(again.userId).toBe(a.userId);
    });
  });
});
