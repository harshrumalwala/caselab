// @vitest-environment node
//
// Privacy between two REAL accounts, tried the way an attacker would: direct API requests as the
// other member, with no CaseLab UI in the way. Needs two throwaway users (see README). Never touches
// your own account. Rows are titled "ZZ CaseLab e2e ..." and removed afterwards.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SHARED_COLUMNS } from '../src/data/community';
import { PublicCommunity, SupabaseCommunity } from '../src/data/supabaseCommunity';
import { SupabaseRepository } from '../src/data/supabaseRepository';
import { NO_SHARING, type ProfileInput, type SharingPrefs } from '../src/domain/community';
import type { CaseRecord } from '../src/domain/types';
import { richCase } from '../src/test/builders';
import { cleanup, HAVE_TWO_USERS, newClient, signedInClient, SUPABASE_KEY, SUPABASE_URL, TEST_PREFIX, USER_A, USER_B } from './helpers';

describe.skipIf(!HAVE_TWO_USERS)('live Supabase: privacy between two real accounts', () => {
  let a: { client: SupabaseClient; userId: string };
  let b: { client: SupabaseClient; userId: string };
  let repoA: SupabaseRepository;
  let communityA: SupabaseCommunity;
  let communityB: SupabaseCommunity;

  const profile = (over: Partial<ProfileInput> = {}): ProfileInput => ({
    displayName: 'E2E Owner A',
    mbaClass: '',
    listed: true,
    publicProfile: false, publicLinkOnly: false,
    sharing: NO_SHARING,
    ...over,
  });
  /** Every single switch except Open everything, which is what lets visitors read written feedback and notes. */
  const allButDetails = (Object.keys(NO_SHARING) as (keyof SharingPrefs)[]).filter((k) => k !== 'details');
  const sharing = (...on: (keyof SharingPrefs)[]): SharingPrefs => ({ ...NO_SHARING, ...Object.fromEntries(on.map((k) => [k, true])) });

  const testCase = (over: Partial<CaseRecord> = {}): CaseRecord => ({
    ...richCase(),
    id: randomUUID(),
    title: `${TEST_PREFIX} shared case`,
    shareMode: 'profile',
    otherNotes: 'PRIVATE-OTHER-NOTES',
    partner: 'PRIVATE-PARTNER',
    ...over,
  });

  /** What member B can see of A's e2e cases. */
  const seenByB = async () => (await communityB.getSharedCases(a.userId)).filter((s) => s.title.startsWith(TEST_PREFIX));

  beforeAll(async () => {
    a = await signedInClient(USER_A);
    b = await signedInClient(USER_B);
    repoA = new SupabaseRepository(a.client);
    communityA = new SupabaseCommunity(a.client, a.userId, newClient());
    communityB = new SupabaseCommunity(b.client, b.userId, newClient());
    await communityA.saveProfile(profile());
    await communityB.saveProfile(profile({ displayName: 'E2E Viewer B' }));
    await cleanup(a.client);
    await cleanup(b.client);
  });

  // Every test starts from "A has no test cases", so rows left by an earlier test can't show up in the next.
  beforeEach(async () => {
    await cleanup(a.client);
  });

  afterAll(async () => {
    if (!communityA) return;
    await communityA.saveProfile(profile()); // back to: listed, nothing shared
    await cleanup(a.client);
    await cleanup(b.client);
  });

  it('shares nothing by default, and never exposes the full case record', async () => {
    const c = testCase();
    await repoA.insertCase(c);
    expect(await seenByB()).toEqual([]);

    // Direct access to the private table as the other member.
    const raw = await b.client.from('cases').select('*').eq('id', c.id);
    expect(raw.error).toBeNull();
    expect(raw.data).toEqual([]);
    const fb = await b.client.from('cases').select('overall_feedback, other_notes, partner').eq('id', c.id);
    expect(fb.data).toEqual([]);
  });

  it('cannot edit or delete another member’s case, profile or shared rows', async () => {
    const c = testCase();
    await repoA.insertCase(c);
    await communityA.saveProfile(profile({ sharing: sharing('cases') }));

    const upd = await b.client.from('cases').update({ title: `${TEST_PREFIX} hacked` }).eq('id', c.id).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await b.client.from('cases').delete().eq('id', c.id).select();
    expect(del.data ?? []).toEqual([]);
    expect((await repoA.loadAll()).cases.find((x) => x.id === c.id)?.title).toBe(c.title); // untouched

    const profileEdit = await b.client.from('profiles').update({ share_cases: false, display_name: 'Hacked' }).eq('user_id', a.userId).select();
    expect(profileEdit.data ?? []).toEqual([]);
    expect((await communityB.getPerson(a.userId))?.displayName).toBe('E2E Owner A');

    // The shared projection is read-only for everyone and its writer functions are not callable.
    const ins = await b.client.from('shared_cases').insert({ case_id: randomUUID(), owner_id: b.userId, case_date: '2026-01-01', title: 'forged', case_type: 'Revenue' });
    expect(ins.error).not.toBeNull();
    const upShared = await b.client.from('shared_cases').update({ title: 'forged' }).eq('owner_id', a.userId);
    expect(upShared.error).not.toBeNull();
    const delShared = await b.client.from('shared_cases').delete().eq('owner_id', a.userId);
    expect(delShared.error).not.toBeNull();
    const rpc = await b.client.rpc('refresh_shared_case', { p_case_id: c.id });
    expect(rpc.error).not.toBeNull();
  });

  it('reveals case history only, then each extra field only when its switch is on', async () => {
    const c = testCase();
    await repoA.insertCase(c);

    await communityA.saveProfile(profile({ sharing: sharing('cases') }));
    let [row] = await seenByB();
    expect(row).toMatchObject({ title: c.title, caseType: c.caseType, industry: c.industry, source: c.source });
    expect([row.overall, row.skillScores, row.feedback, row.improvementArea, row.notes]).toEqual([null, null, null, null, null]);

    await communityA.saveProfile(profile({ sharing: sharing('cases', 'overall') }));
    [row] = await seenByB();
    expect(row.overall).toBe(c.overall);
    expect([row.skillScores, row.feedback, row.notes]).toEqual([null, null, null]);

    await communityA.saveProfile(profile({ sharing: sharing('cases', 'skills', 'feedback', 'improvement', 'notes') })); // partner stays off
    [row] = await seenByB();
    expect(row.overall).toBeNull();
    expect(row.skillScores).toMatchObject({ framework: 2 });
    expect(row.feedback?.overall).toBe(c.overallFeedback);
    expect(row.improvementArea).toBe(c.improvementArea);
    expect(row.notes?.concepts).toBe(c.concepts);

    // Never shared, whatever is switched on.
    expect(JSON.stringify(row)).not.toContain('PRIVATE-OTHER-NOTES');
    expect(JSON.stringify(row)).not.toContain('PRIVATE-PARTNER');
  });

  it('applies a privacy change immediately and keeps no old private data', async () => {
    await repoA.insertCase(testCase());
    await communityA.saveProfile(profile({ sharing: sharing(...(Object.keys(NO_SHARING) as (keyof SharingPrefs)[])) }));
    expect((await seenByB())[0].feedback).not.toBeNull();

    await communityA.saveProfile(profile({ sharing: sharing('cases', 'overall', 'skills', 'improvement', 'notes') })); // feedback off
    const [row] = await seenByB();
    expect(row.feedback).toBeNull();
    expect(JSON.stringify(row)).not.toContain('Solid overall'); // the old feedback text is gone, not just hidden

    await communityA.saveProfile(profile({ sharing: NO_SHARING }));
    expect(await seenByB()).toEqual([]);
  });

  it('applies per-case overrides: private, history only, and full', async () => {
    const hidden = testCase({ title: `${TEST_PREFIX} hidden`, shareMode: 'private' });
    const historyOnly = testCase({ title: `${TEST_PREFIX} history only`, shareMode: 'history' });
    const fullyOpen = testCase({ title: `${TEST_PREFIX} fully open`, shareMode: 'full' });
    for (const c of [hidden, historyOnly, fullyOpen]) await repoA.insertCase(c);

    // Profile shares scores and feedback generally.
    await communityA.saveProfile(profile({ sharing: sharing('cases', 'overall', 'feedback') }));
    let rows = await seenByB();
    expect(rows.map((r) => r.title).sort()).toEqual([historyOnly.title, fullyOpen.title].sort());
    expect(rows.find((r) => r.title === historyOnly.title)).toMatchObject({ overall: null, feedback: null });
    expect(rows.find((r) => r.title === fullyOpen.title)?.overall).toBe(fullyOpen.overall);

    // Profile shares nothing: only the 'full' and 'history' cases are visible, because the owner opted those in.
    await communityA.saveProfile(profile({ sharing: NO_SHARING }));
    rows = await seenByB();
    expect(rows.map((r) => r.title).sort()).toEqual([historyOnly.title, fullyOpen.title].sort());
    expect(rows.find((r) => r.title === fullyOpen.title)?.notes).not.toBeNull();

    // Switching a case back to private removes it at once.
    await repoA.updateCase({ ...fullyOpen, shareMode: 'private', updatedAt: new Date().toISOString() });
    expect((await seenByB()).map((r) => r.title)).toEqual([historyOnly.title]);
  });

  it('hides an unlisted member completely, and keeps email addresses out of every response', async () => {
    await repoA.insertCase(testCase());
    await communityA.saveProfile(profile({ sharing: sharing('cases'), listed: false }));
    expect(await seenByB()).toEqual([]);
    expect(await communityB.getPerson(a.userId)).toBeNull();
    expect((await communityB.searchPeople('E2E Owner A')).some((p) => p.userId === a.userId)).toBe(false);

    await communityA.saveProfile(profile({ sharing: sharing('cases'), listed: true }));
    expect((await communityB.searchPeople('E2E Owner A')).some((p) => p.userId === a.userId)).toBe(true);

    const rawProfile = await b.client.from('profiles').select('*').eq('user_id', a.userId).single();
    expect(Object.keys(rawProfile.data ?? {}).some((k) => /email|phone|password/i.test(k))).toBe(false);
    const rawShared = await b.client.from('shared_cases').select(SHARED_COLUMNS).eq('owner_id', a.userId);
    expect(JSON.stringify(rawShared.data)).not.toMatch(/@/);
  });

  it('cannot be probed through filters or counts, and signed-out requests get nothing', async () => {
    await repoA.insertCase(testCase({ overall: 5 }));
    await communityA.saveProfile(profile({ sharing: sharing('cases') })); // scores NOT shared

    const byScore = await b.client.from('shared_cases').select('share_id').eq('owner_id', a.userId).eq('overall', 5);
    expect(byScore.data).toEqual([]);
    const count = await b.client.from('shared_cases').select('share_id', { count: 'exact', head: true }).eq('owner_id', a.userId);
    expect(count.count).toBe((await communityB.getSharedCases(a.userId)).length);

    const anon = newClient();
    expect((await anon.from('shared_cases').select('*')).error).not.toBeNull();
    expect((await anon.from('profiles').select('*')).error).not.toBeNull();
    const bare = await fetch(`${SUPABASE_URL}/rest/v1/shared_cases?select=*`, { headers: { apikey: SUPABASE_KEY } });
    expect(bare.status).toBe(401);
  });

  it('does not let members read the private case id, so it cannot be probed', async () => {
    const c = testCase();
    await repoA.insertCase(c);
    await communityA.saveProfile(profile({ sharing: sharing('cases') }));
    const readId = await b.client.from('shared_cases').select('case_id').eq('owner_id', a.userId);
    expect(readId.error).not.toBeNull();
    const star = await b.client.from('shared_cases').select('*').eq('owner_id', a.userId);
    expect(star.error).not.toBeNull();
    const seen = await b.client.from('shared_cases').select('share_id').eq('owner_id', a.userId);
    expect(JSON.stringify(seen.data)).not.toContain(c.id);
  });

  describe('visitors without an account', () => {
    const visitor = () => new PublicCommunity(newClient());
    const visibleToVisitors = async () => (await visitor().getSharedCases(a.userId)).filter((s) => s.title.startsWith(TEST_PREFIX));

    it('see nothing by default, however much is shared with members', async () => {
      await repoA.insertCase(testCase());
      await communityA.saveProfile(profile({ sharing: sharing(...allButDetails) }));
      expect(await visibleToVisitors()).toEqual([]);
      expect(await visitor().getPerson(a.userId)).toBeNull();
      expect((await visitor().searchPeople('E2E Owner A')).some((p) => p.userId === a.userId)).toBe(false);
    });

    it('see a member who opted in: history and chosen scores, never written feedback or notes, and only until they opt out', async () => {
      const c = testCase();
      await repoA.insertCase(c);
      await communityA.saveProfile(profile({ publicProfile: true, publicLinkOnly: false, sharing: sharing(...allButDetails) }));

      const person = await visitor().getPerson(a.userId);
      expect(person).toMatchObject({ displayName: 'E2E Owner A', publicProfile: true });
      expect(person?.sharing).toMatchObject({ cases: true, overall: true, feedback: false, notes: false }); // free text is not shared with visitors
      const [row] = await visibleToVisitors();
      expect(row).toMatchObject({ title: c.title, caseType: c.caseType, overall: c.overall });
      expect([row.feedback, row.notes]).toEqual([null, null]);
      expect(JSON.stringify(row)).not.toContain(c.overallFeedback);
      expect(JSON.stringify(row)).not.toContain('PRIVATE-OTHER-NOTES');
      expect(row.partner).toBe('PRIVATE-PARTNER'); // "who cased me" was switched on above, and only then

      await communityA.saveProfile(profile({ publicProfile: true, publicLinkOnly: false, sharing: sharing('cases', 'overall') }));
      expect((await visibleToVisitors())[0].partner).toBe(''); // switched off again: the name is gone at once

      await communityA.saveProfile(profile({ publicProfile: false, publicLinkOnly: false, sharing: sharing('cases') }));
      expect(await visibleToVisitors()).toEqual([]);
      expect(await visitor().getPerson(a.userId)).toBeNull();
    });

    it('see a public member in "cased recently" by the date of their newest visible case, and not once nothing is visible', async () => {
      const shown = testCase({ date: '2026-03-02' });
      const newerPrivate = testCase({ date: '2026-09-09', shareMode: 'private' });
      await repoA.insertCase(shown);
      await repoA.insertCase(newerPrivate);
      await communityA.saveProfile(profile({ publicProfile: true, publicLinkOnly: false, sharing: sharing('cases') }));

      const mine = async () => (await visitor().recentPeople(50)).find((r) => r.person.userId === a.userId);
      expect((await mine())?.lastCased).toBe('2026-03-02'); // the private, newer case doesn't count
      expect((await visitor().recentPeople(1)).length).toBeLessThanOrEqual(1);

      await communityA.saveProfile(profile({ publicProfile: true, publicLinkOnly: false, sharing: NO_SHARING })); // nothing shared any more
      expect(await mine()).toBeUndefined();
    });

    it('link only: not found, listed or counted, but opens from the exact id; and back in the directory when switched off', async () => {
      const c = testCase();
      await repoA.insertCase(c);
      await communityA.saveProfile(profile({ publicProfile: true, publicLinkOnly: true, sharing: sharing('cases', 'overall') }));

      const people = async () => (await visitor().searchPeople('E2E Owner A')).some((p) => p.userId === a.userId);
      const recent = async () => (await visitor().recentPeople(50)).some((r) => r.person.userId === a.userId);
      expect(await people()).toBe(false);
      expect(await recent()).toBe(false);
      // The tables behind the front page return nothing for them, even by a direct filter on their id.
      expect((await newClient().from('public_profiles').select('user_id').eq('user_id', a.userId)).data).toEqual([]);
      expect((await newClient().from('public_shared_cases').select('title').eq('owner_id', a.userId)).data).toEqual([]);

      // The exact id still opens it, with what visitors see.
      expect(await visitor().getPerson(a.userId)).toMatchObject({ displayName: 'E2E Owner A', publicProfile: true });
      const [row] = await visibleToVisitors();
      expect(row).toMatchObject({ title: c.title, overall: c.overall });
      expect([row.feedback, row.notes]).toEqual([null, null]);
      expect(await visitor().getPerson('00000000-0000-4000-8000-000000000000')).toBeNull(); // a made-up id finds nothing

      await communityA.saveProfile(profile({ publicProfile: true, publicLinkOnly: false, sharing: sharing('cases', 'overall') }));
      expect(await people()).toBe(true);

      await communityA.saveProfile(profile({ publicProfile: false, publicLinkOnly: false, sharing: sharing('cases') }));
      expect(await visitor().getPerson(a.userId)).toBeNull();
      expect(await visibleToVisitors()).toEqual([]);
    });

    it('open everything: visitors can read feedback, notes and other notes, and only until it is switched off', async () => {
      const c = testCase();
      await repoA.insertCase(c);
      await communityA.saveProfile(profile({ publicProfile: true, publicLinkOnly: false, sharing: sharing('cases', 'details') }));

      const [open] = await visibleToVisitors();
      expect(open.feedback?.overall).toBe(c.overallFeedback);
      expect(open.notes?.wentWell).toBe(c.wentWell);
      expect(open.otherNotes).toBe('PRIVATE-OTHER-NOTES');
      expect(open.partner).toBe(''); // the partner has its own switch
      expect(JSON.stringify(open)).not.toContain('PRIVATE-PARTNER');

      await communityA.saveProfile(profile({ publicProfile: true, publicLinkOnly: false, sharing: sharing('cases') }));
      const [closed] = await visibleToVisitors();
      expect([closed.feedback, closed.notes, closed.otherNotes]).toEqual([null, null, '']);
    });

    it('cannot read anything else, or write anything, through direct requests', async () => {
      await repoA.insertCase(testCase());
      await communityA.saveProfile(profile({ publicProfile: true, publicLinkOnly: false, sharing: sharing('cases') }));
      const anon = newClient();
      for (const table of ['cases', 'opportunities', 'profiles', 'shared_cases']) {
        expect((await anon.from(table).select('*')).error, table).not.toBeNull();
      }
      // The detail columns are readable, but empty for everyone who hasn't opened everything (A has not, here).
      const detail = await anon.from('public_shared_cases').select('feedback, notes, other_notes').eq('owner_id', a.userId);
      expect(detail.error).toBeNull();
      expect(JSON.stringify(detail.data)).not.toMatch(/PRIVATE|Solid overall/);
      expect((await anon.from('public_shared_cases').select('case_id')).error).not.toBeNull(); // not granted
      expect((await anon.from('public_shared_cases').select('*')).error).not.toBeNull();
      expect((await anon.from('public_profiles').update({ display_name: 'hacked' }).eq('user_id', a.userId)).error).not.toBeNull();
      expect((await anon.from('public_shared_cases').delete().eq('owner_id', a.userId)).error).not.toBeNull();
      expect((await anon.rpc('revoke_nonmembers')).error).not.toBeNull();
      expect((await anon.rpc('refresh_all_shared')).error).not.toBeNull();
      expect((await communityB.getPerson(a.userId))?.displayName).toBe('E2E Owner A'); // members unaffected
    });

    it('stop seeing a member the moment they unlist, and a private case is never public', async () => {
      const open = testCase({ title: `${TEST_PREFIX} public one` });
      const secret = testCase({ title: `${TEST_PREFIX} secret one`, shareMode: 'private' });
      await repoA.insertCase(open);
      await repoA.insertCase(secret);
      await communityA.saveProfile(profile({ publicProfile: true, publicLinkOnly: false, sharing: sharing('cases') }));
      expect((await visibleToVisitors()).map((s) => s.title)).toEqual([open.title]);

      await communityA.saveProfile(profile({ listed: false, publicProfile: true, publicLinkOnly: false, sharing: sharing('cases') })); // unlisting also withdraws public
      expect(await visibleToVisitors()).toEqual([]);
    });
  });

  it('removes shared data when the case is deleted', async () => {
    const c = testCase({ title: `${TEST_PREFIX} to delete` });
    await repoA.insertCase(c);
    await communityA.saveProfile(profile({ sharing: sharing('cases') }));
    expect((await seenByB()).some((r) => r.title === c.title)).toBe(true);
    await repoA.deleteCase(c.id);
    expect((await seenByB()).some((r) => r.title === c.title)).toBe(false);
  });

  it('keeps each person’s dashboard data separate', async () => {
    const mine = await repoA.loadAll();
    const theirs = await new SupabaseRepository(b.client).loadAll();
    const mineIds = new Set(mine.cases.map((x) => x.id));
    expect(theirs.cases.some((x) => mineIds.has(x.id))).toBe(false);
  });
});
