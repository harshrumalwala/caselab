// @vitest-environment node
//
// The weekly goal, the cases you interviewed, and showing those cases to other members, against the REAL project and two REAL
// accounts, tried the way an attacker would: direct API requests as the other member, and as a visitor with no account.
// Needs the two throwaway users (see README). Rows are titled "ZZ CaseLab e2e ..." and removed afterwards, the goal is removed, and
// account A ends unlisted with nothing shared, so no test account is ever left visible to real members.
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SupabaseInterviewed } from '../src/data/interviewed';
import { PublicCommunity, SupabaseCommunity } from '../src/data/supabaseCommunity';
import { SupabaseGoal } from '../src/data/weeklyGoal';
import { NO_SHARING, type ProfileInput } from '../src/domain/community';
import type { InterviewedInput } from '../src/domain/interviewed';
import { HAVE_TWO_USERS, newClient, signedInClient, TEST_PREFIX, USER_A, USER_B } from './helpers';

describe.skipIf(!HAVE_TWO_USERS)('live Supabase: weekly goal, interviewed cases and sharing them', () => {
  let a: { client: SupabaseClient; userId: string };
  let b: { client: SupabaseClient; userId: string };
  let goalA: SupabaseGoal;
  let interviewedA: SupabaseInterviewed;
  let communityA: SupabaseCommunity;
  let communityB: SupabaseCommunity;
  let visitors: PublicCommunity;
  let anon: SupabaseClient;

  const profile = (over: Partial<ProfileInput> = {}): ProfileInput => ({
    displayName: 'E2E Owner A',
    mbaClass: '',
    listed: false,
    publicProfile: false,
    publicLinkOnly: false,
    burnedBooks: [],
    burnedCases: [],
    sharing: NO_SHARING,
    ...over,
  });

  const interview = (title: string, over: Partial<InterviewedInput> = {}): InterviewedInput => ({
    date: '2026-10-10',
    title: `${TEST_PREFIX} ${title}`,
    source: 'Darden 2019',
    caseType: 'Profitability',
    industry: 'Transportation / Logistics',
    partner: `${TEST_PREFIX} secret partner`,
    feedback: `${TEST_PREFIX} secret feedback`,
    learned: `${TEST_PREFIX} secret lesson`,
    ...over,
  });

  const wipe = async () => {
    const del = await a.client.from('interviewed_cases').delete().like('title', `${TEST_PREFIX}%`);
    if (del.error) throw del.error;
    await goalA.save(null);
  };

  beforeAll(async () => {
    a = await signedInClient(USER_A);
    b = await signedInClient(USER_B);
    anon = newClient();
    goalA = new SupabaseGoal(a.client, a.userId);
    interviewedA = new SupabaseInterviewed(a.client);
    communityA = new SupabaseCommunity(a.client, a.userId, newClient());
    communityB = new SupabaseCommunity(b.client, b.userId, newClient());
    visitors = new PublicCommunity(anon);
    await communityA.saveProfile(profile()); // unlisted, nothing shared, from the very start
    await wipe();
  });

  beforeEach(async () => {
    await wipe();
    await communityA.saveProfile(profile());
  });

  afterAll(async () => {
    if (communityA) await communityA.saveProfile(profile()); // never leave a test account visible
    if (a) await wipe();
  });

  describe('the weekly goal', () => {
    it('is saved to the account, can be changed, and is removed with null', async () => {
      expect(await goalA.load()).toBeNull();
      expect(await goalA.save(3)).toBe(3);
      expect(await goalA.load()).toBe(3);
      expect(await goalA.save(14)).toBe(14);
      expect(await goalA.load()).toBe(14);
      expect(await goalA.save(null)).toBeNull();
      expect(await goalA.load()).toBeNull();
    });

    it('is refused outside 1 to 14, by the app and by the database itself', async () => {
      await expect(goalA.save(15)).rejects.toThrow();
      await expect(goalA.save(0)).rejects.toThrow();
      expect((await a.client.from('weekly_goal').insert({ user_id: a.userId, goal: 20 })).error).not.toBeNull();
      expect((await a.client.from('weekly_goal').insert({ user_id: a.userId, goal: 0 })).error).not.toBeNull();
      expect(await goalA.load()).toBeNull();
    });

    it('is private: another member cannot read, change, remove or plant one, and a visitor gets nothing', async () => {
      await goalA.save(5);

      const seen = await b.client.from('weekly_goal').select('*');
      expect(seen.error).toBeNull();
      expect(seen.data).toEqual([]);

      await b.client.from('weekly_goal').update({ goal: 9 }).eq('user_id', a.userId); // matches no row it may touch
      await b.client.from('weekly_goal').delete().eq('user_id', a.userId);
      expect((await b.client.from('weekly_goal').insert({ user_id: a.userId, goal: 2 })).error).not.toBeNull();
      expect(await goalA.load()).toBe(5);

      expect((await anon.from('weekly_goal').select('*')).error).not.toBeNull();
      expect((await anon.from('weekly_goal').insert({ goal: 3 })).error).not.toBeNull();
    });
  });

  describe('interviewed cases', () => {
    it('can be added, listed, changed and removed', async () => {
      const first = await interviewedA.add(interview('one'));
      const second = await interviewedA.add(interview('two', { date: '2026-10-20' }));
      const titles = async () => (await interviewedA.list()).filter((c) => c.title.startsWith(TEST_PREFIX)).map((c) => c.title);
      expect(await titles()).toEqual([`${TEST_PREFIX} two`, `${TEST_PREFIX} one`]); // newest first

      const changed = await interviewedA.update(first.id, interview('one, edited', { learned: 'new lesson' }));
      expect(changed).toMatchObject({ id: first.id, title: `${TEST_PREFIX} one, edited`, learned: 'new lesson' });

      await interviewedA.remove(second.id);
      expect(await titles()).toEqual([`${TEST_PREFIX} one, edited`]);
    });

    it('follows the same shape rules as cases: a title, a known case type, sensible lengths', async () => {
      const row = { case_type: 'Other', title: `${TEST_PREFIX} x` };
      expect((await a.client.from('interviewed_cases').insert({ ...row, title: '   ' })).error).not.toBeNull();
      expect((await a.client.from('interviewed_cases').insert({ ...row, case_type: 'Made up' })).error).not.toBeNull();
      expect((await a.client.from('interviewed_cases').insert({ ...row, title: 'x'.repeat(201) })).error).not.toBeNull();
      expect((await a.client.from('interviewed_cases').insert({ ...row, feedback: 'y'.repeat(4001) })).error).not.toBeNull();
      expect((await interviewedA.list()).filter((c) => c.title.startsWith(TEST_PREFIX))).toEqual([]);
    });

    it('is private to its owner, and never mixed into the cases you solved', async () => {
      const mine = await interviewedA.add(interview('private one'));

      const seen = await b.client.from('interviewed_cases').select('*');
      expect(seen.error).toBeNull();
      expect(seen.data).toEqual([]);
      await b.client.from('interviewed_cases').update({ title: 'Hijacked' }).eq('id', mine.id);
      await b.client.from('interviewed_cases').delete().eq('id', mine.id);
      expect((await b.client.from('interviewed_cases').insert({ user_id: a.userId, title: 'Planted', case_type: 'Other' })).error).not.toBeNull();
      expect((await interviewedA.list()).filter((c) => c.title.startsWith(TEST_PREFIX)).map((c) => c.title)).toEqual([mine.title]);

      const solved = await a.client.from('cases').select('id').like('title', `${TEST_PREFIX}%`);
      expect(solved.data).toEqual([]);

      expect((await anon.from('interviewed_cases').select('*')).error).not.toBeNull();
      expect((await anon.from('interviewed_cases').insert({ title: 'x', case_type: 'Other' })).error).not.toBeNull();
    });
  });

  describe('showing interviewed cases to other members', () => {
    const mineSeenByB = async () =>
      (await communityB.getInterviewed(a.userId)).filter((c) => c.title.startsWith(TEST_PREFIX));

    it('shows nothing until the member lists themselves and switches it on, and hides again the moment they switch it off', async () => {
      await interviewedA.add(interview('shared one', { date: '2026-10-10' }));
      await interviewedA.add(interview('shared two', { date: '2026-10-20' }));

      // Off by default, even when listed.
      await communityA.saveProfile(profile({ listed: true }));
      expect(await mineSeenByB()).toEqual([]);

      // On, but not listed: still nothing.
      await communityA.saveProfile(profile({ listed: false, sharing: { ...NO_SHARING, interviewed: true } }));
      expect(await mineSeenByB()).toEqual([]);

      // On and listed: the cases themselves, newest first, and the switch really was saved.
      await communityA.saveProfile(profile({ listed: true, sharing: { ...NO_SHARING, interviewed: true } }));
      expect((await communityA.getMyProfile())?.sharing.interviewed).toBe(true);
      const shown = await mineSeenByB();
      expect(shown.map((c) => c.title)).toEqual([`${TEST_PREFIX} shared two`, `${TEST_PREFIX} shared one`]);
      expect(shown[0]).toMatchObject({ date: '2026-10-20', source: 'Darden 2019', caseType: 'Profitability', industry: 'Transportation / Logistics' });

      // Off again: gone at once.
      await communityA.saveProfile(profile({ listed: true, sharing: NO_SHARING }));
      expect(await mineSeenByB()).toEqual([]);
    });

    it('never shows who you interviewed, what you told them or what you learned', async () => {
      await interviewedA.add(interview('careful one'));
      await communityA.saveProfile(profile({ listed: true, sharing: { ...NO_SHARING, interviewed: true } }));

      const shown = await mineSeenByB();
      expect(shown).toHaveLength(1);
      expect(Object.keys(shown[0]).sort()).toEqual(['caseType', 'date', 'industry', 'source', 'title']);
      expect(JSON.stringify(shown)).not.toMatch(/secret/);

      // Asked for directly, the function returns only those five columns too.
      const raw = await b.client.rpc('member_interviewed', { p_member: a.userId });
      expect(raw.error).toBeNull();
      const rows = ((raw.data ?? []) as Record<string, unknown>[]).filter((r) => String(r.title).startsWith(TEST_PREFIX));
      expect(Object.keys(rows[0]).sort()).toEqual(['case_date', 'case_type', 'industry', 'source', 'title']);
      expect(JSON.stringify(raw.data)).not.toMatch(/secret/);
    });

    it('keeps the table itself closed even while the switch is on, and gives visitors without an account nothing', async () => {
      await interviewedA.add(interview('closed one'));
      await communityA.saveProfile(profile({ listed: true, sharing: { ...NO_SHARING, interviewed: true } }));

      expect((await b.client.from('interviewed_cases').select('*')).data).toEqual([]);

      expect(await visitors.getInterviewed()).toEqual([]);
      const direct = await anon.rpc('member_interviewed', { p_member: a.userId });
      expect(direct.error).not.toBeNull();
      expect(direct.data ?? null).toBeNull();
    });

    it('is never part of what visitors see on a public profile', async () => {
      await interviewedA.add(interview('not public'));
      await communityA.saveProfile(profile({ listed: true, publicProfile: true, sharing: { ...NO_SHARING, cases: true, interviewed: true } }));
      const publicPerson = await visitors.getPerson(a.userId);
      expect(publicPerson).not.toBeNull();
      expect(publicPerson?.sharing.interviewed).toBe(false);
      expect(await visitors.getInterviewed()).toEqual([]);
    });
  });
});
