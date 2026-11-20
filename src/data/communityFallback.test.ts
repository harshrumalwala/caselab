import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { ProfileRow, PublicProfileRow, SharedRow } from './community';
import { SupabaseCommunity } from './supabaseCommunity';

/**
 * Which of the two paths answers for one member, and whether the profile and the cases come from the same one.
 *
 * The fake "database" below is the two rules that decide it, written out as the migrations have them:
 *  - `profiles: members read listed, owner reads own` (20261020120000:297) — a member's row reaches another member
 *    only while they appear in People search;
 *  - `shared_cases: members read` (20261020120000:314) — likewise for their shared cases;
 *  - `public_person` / `public_person_cases` — the link, which after the migration of #244 asks for
 *    `public_profile` and a verified email and says nothing about People search.
 * Nothing here needs the migration itself: this is the app's own routing, which is all issue #247 changes.
 */

const ME = 'me';

const profileRow = (over: Partial<ProfileRow> & Pick<ProfileRow, 'user_id' | 'display_name'>): ProfileRow => ({
  mba_class: null,
  listed: true,
  public_profile: false,
  public_link_only: false,
  burned_books: [],
  burned_cases: [],
  share_cases: true,
  share_overall: true,
  share_skills: false,
  share_sharpening: false,
  share_feedback: true,
  share_improvement: false,
  share_notes: true,
  share_partner: false,
  share_details: false,
  share_burned: false,
  share_interviewed: true,
  share_level: true,
  level: 7,
  ...over,
});

const sharedRow = (over: Partial<SharedRow> & Pick<SharedRow, 'share_id' | 'owner_id' | 'title'>): SharedRow => ({
  case_date: '2026-10-01',
  source: 'Booth casebook',
  partner: 'Dana',
  case_type: 'Profitability',
  industry: 'Technology / SaaS',
  overall: 4,
  skill_scores: { framework: 4 },
  feedback: { overall: 'Crisp structure' },
  improvement_area: null,
  notes: { went_well: 'The maths' },
  other_notes: 'Loose notes',
  ...over,
});

/** The whole "database": every profile row and every shared row, before any policy is applied. */
interface Db {
  profiles: ProfileRow[];
  shared: SharedRow[];
  /** Members whose email is verified (`is_member_id`). Everyone, unless a test says otherwise. */
  unverified?: string[];
}

function fakeClients(db: Db) {
  const sent: string[] = [];
  const member = (id: string) => !(db.unverified ?? []).includes(id);

  const table = (name: string) => {
    const filters: Record<string, unknown> = {};
    const rows = () => {
      if (name === 'profiles') {
        // The policy: your own row always, anyone else's only while they are listed.
        return db.profiles.filter((p) => (p.user_id === ME || p.listed) && Object.entries(filters).every(([k, v]) => p[k as keyof ProfileRow] === v));
      }
      if (name === 'shared_cases') {
        const listed = new Set(db.profiles.filter((p) => p.listed).map((p) => p.user_id));
        return db.shared.filter((s) => listed.has(s.owner_id) && Object.entries(filters).every(([k, v]) => s[k as keyof SharedRow] === v));
      }
      throw new Error(`the app should not be reading ${name} here`);
    };
    const builder = {
      select(columns: string) {
        sent.push(`${name}.select(${columns})`);
        return builder;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      order() {
        return builder;
      },
      async range(from: number, to: number) {
        return { data: rows().slice(from, to + 1), error: null };
      },
      async maybeSingle() {
        return { data: rows()[0] ?? null, error: null };
      },
    };
    return builder;
  };

  const client = { from: (name: string) => table(name) } as unknown as SupabaseClient;

  // The link, as `anon` reaches it: an exact id, a published link and a verified member, and nothing else.
  const published = (id: string) => db.profiles.find((p) => p.user_id === id && p.public_profile && member(id));
  const anon = {
    async rpc(fn: string, args: { p_id: string }) {
      sent.push(`${fn}(${args.p_id})`);
      const p = published(args.p_id);
      if (fn === 'public_person') {
        if (!p) return { data: [], error: null };
        const row: PublicProfileRow = {
          user_id: p.user_id,
          display_name: p.display_name,
          mba_class: p.mba_class,
          share_cases: p.share_cases,
          share_overall: p.share_overall,
          share_skills: p.share_skills,
          share_sharpening: p.share_sharpening,
          share_improvement: p.share_improvement,
          share_partner: p.share_partner,
          share_details: p.share_details,
          share_burned: p.share_burned,
        };
        return { data: [row], error: null };
      }
      if (fn === 'public_person_cases') {
        if (!p) return { data: [], error: null };
        // Visitors never get free text unless the member opened everything, exactly as the function leaves it out.
        return {
          data: db.shared
            .filter((s) => s.owner_id === args.p_id)
            .map((s) => (p.share_details ? s : { ...s, feedback: null, notes: null, other_notes: null, partner: null })),
          error: null,
        };
      }
      throw new Error(`unexpected function ${fn}`);
    },
  } as unknown as SupabaseClient;

  return { community: new SupabaseCommunity(client, ME, anon), sent };
}

const LINK_ONLY = profileRow({ user_id: 'eva', display_name: 'Eva Ernst', listed: false, public_profile: true });
const LISTED = profileRow({ user_id: 'bob', display_name: 'Bob Brown', listed: true });

describe('reading a member who has left People search but still publishes a link', () => {
  it('opens their profile through the link instead of reporting them missing', async () => {
    const { community } = fakeClients({ profiles: [LINK_ONLY], shared: [] });
    const person = await community.getPerson('eva');
    expect(person).toMatchObject({ userId: 'eva', displayName: 'Eva Ernst', viaLink: true });
  });

  it('reads their shared cases through the same link, with the free text the link leaves out', async () => {
    const { community } = fakeClients({
      profiles: [LINK_ONLY],
      shared: [sharedRow({ share_id: 's1', owner_id: 'eva', title: 'Airline profitability' })],
    });
    const [kase] = await community.getSharedCases('eva');
    expect(kase).toMatchObject({ caseId: 's1', title: 'Airline profitability', overall: 4 });
    expect(kase.feedback).toBeNull(); // she never opened everything, so the link publishes no writing
    expect(kase.notes).toBeNull();
  });

  it('serves the profile and the cases from the one path: the link answers both or neither', async () => {
    const { community, sent } = fakeClients({
      profiles: [LINK_ONLY],
      shared: [sharedRow({ share_id: 's1', owner_id: 'eva', title: 'Airline profitability' })],
    });
    await community.getPerson('eva');
    await community.getSharedCases('eva');
    expect(sent).toContain('public_person(eva)');
    expect(sent).toContain('public_person_cases(eva)');
    expect(sent).not.toContain('shared_cases.select(share_id, owner_id, case_date, title, source, partner, case_type, industry, overall, skill_scores, feedback, improvement_area, notes, other_notes)');
  });

  it('still shows nothing at all for a member who publishes no link, or who does not exist', async () => {
    const { community } = fakeClients({
      profiles: [profileRow({ user_id: 'ghost', display_name: 'Hidden Harry', listed: false, public_profile: false })],
      shared: [sharedRow({ share_id: 'g1', owner_id: 'ghost', title: 'Private case' })],
    });
    expect(await community.getPerson('ghost')).toBeNull();
    expect(await community.getSharedCases('ghost')).toEqual([]);
    expect(await community.getPerson('nobody')).toBeNull();
    expect(await community.getSharedCases('nobody')).toEqual([]);
  });

  it('gives a member with an unverified email nothing, link or no link', async () => {
    const { community } = fakeClients({
      profiles: [profileRow({ user_id: 'dave', display_name: 'Dave Doe', listed: false, public_profile: true })],
      shared: [sharedRow({ share_id: 'd1', owner_id: 'dave', title: 'Unverified case' })],
      unverified: ['dave'],
    });
    expect(await community.getPerson('dave')).toBeNull();
    expect(await community.getSharedCases('dave')).toEqual([]);
  });
});

describe('a member the member path can still answer for', () => {
  it('reads a listed member from the member tables, with everything only a member is given', async () => {
    const { community, sent } = fakeClients({ profiles: [LISTED], shared: [] });
    const person = await community.getPerson('bob');
    expect(person).toMatchObject({ userId: 'bob', displayName: 'Bob Brown', level: 7 });
    expect(person?.viaLink).toBeUndefined(); // not the link view: the member tables answered
    expect(person?.sharing.interviewed).toBe(true); // members only, and lost on the link
    expect(sent).not.toContain('public_person(bob)');
  });

  it('keeps the free text a listed member shares with members and the link would drop', async () => {
    const { community, sent } = fakeClients({
      profiles: [LISTED],
      shared: [sharedRow({ share_id: 'b1', owner_id: 'bob', title: 'Bank market entry' })],
    });
    const [kase] = await community.getSharedCases('bob');
    expect(kase).toMatchObject({ title: 'Bank market entry', partner: 'Dana', otherNotes: 'Loose notes' });
    expect(kase.feedback).toEqual({ overall: 'Crisp structure' });
    expect(sent).not.toContain('public_person_cases(bob)');
  });

  it('leaves a listed member who shares nothing with nothing: an empty list is an answer, not a miss', async () => {
    // The trap this guards: falling back here would hand a member the link copy of someone they can read properly,
    // and would hide a real defect behind a quietly different answer.
    const { community, sent } = fakeClients({ profiles: [profileRow({ user_id: 'carol', display_name: 'Carol Chen', listed: true, public_profile: true })], shared: [] });
    expect(await community.getSharedCases('carol')).toEqual([]);
    expect(sent).not.toContain('public_person_cases(carol)');
  });

  it('reads your own profile and your own shared rows from the member tables, listed or not', async () => {
    const { community, sent } = fakeClients({
      profiles: [profileRow({ user_id: ME, display_name: 'Test User', listed: false, public_profile: true })],
      shared: [],
    });
    expect(await community.getPerson(ME)).toMatchObject({ userId: ME });
    expect((await community.getPerson(ME))?.viaLink).toBeUndefined();
    expect(await community.getSharedCases(ME)).toEqual([]);
    expect(sent.filter((s) => s.startsWith('public_'))).toEqual([]);
  });
});
