import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseType } from '../domain/constants';
import type { Profile, ProfileInput, SharedCase } from '../domain/community';
import type { SharedInterviewed } from '../domain/interviewed';
import {
  PUBLIC_PROFILE_COLUMNS,
  SHARED_COLUMNS,
  profileToRow,
  rowToProfile,
  rowToPublicProfile,
  rowToSharedCase,
  type PublicReader,
  type RecentCaser,
  type CommunityRepository,
  type ProfileRow,
  type PublicProfileRow,
  type SharedRow,
} from './community';

const PAGE = 1000;
const RECENT_PAGE = 100;
const RECENT_SCAN = 500; // rows examined while looking for the most recent members

async function pageShared(client: SupabaseClient, table: string, columns: string, ownerId: string, maxRows = Infinity): Promise<SharedCase[]> {
  const out: SharedRow[] = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq('owner_id', ownerId)
      .order('case_date', { ascending: false })
      .order('share_id', { ascending: true })
      .range(from, Math.min(from + PAGE, maxRows) - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as SharedRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out.map(rowToSharedCase);
}

/**
 * Read-only community access for people WITHOUT an account. It uses a client that never holds a session, so
 * every request runs as the database's `anon` role: it can only see members who opted in to being public,
 * and only the columns granted to that role (written feedback and notes only when the member opened everything; never private ids).
 */
export class PublicCommunity implements PublicReader {
  constructor(private readonly anon: SupabaseClient) {}

  async searchPeople(query: string): Promise<Profile[]> {
    // The public tables only ever hold members who chose to be visible, so no further filtering is needed.
    let q = this.anon.from('public_profiles').select(PUBLIC_PROFILE_COLUMNS);
    const text = query.trim();
    if (text) q = q.ilike('display_name', `%${text}%`);
    const { data, error } = await q.order('display_name', { ascending: true }).limit(50);
    if (error) throw error;
    return ((data ?? []) as unknown as PublicProfileRow[]).map(rowToPublicProfile);
  }

  // One member by exact id. This goes through a function rather than the table, because a member who chose "link only"
  // isn't in what the table returns: only someone who has their exact id can open them.
  async getPerson(userId: string): Promise<Profile | null> {
    const { data, error } = await this.anon.rpc('public_person', { p_id: userId });
    if (error) throw error;
    const row = ((data ?? []) as PublicProfileRow[])[0];
    return row ? rowToPublicProfile(row) : null;
  }

  async recentPeople(limit: number): Promise<RecentCaser[]> {
    // Newest shared cases first; the first time an owner appears is their most recent case. Scan a few pages at most,
    // so one very active member can't make the page do unbounded work.
    const latest = new Map<string, string>();
    for (let from = 0; from < RECENT_SCAN && latest.size < limit; from += RECENT_PAGE) {
      const { data, error } = await this.anon
        .from('public_shared_cases')
        .select('owner_id, case_date')
        .order('case_date', { ascending: false })
        .order('share_id', { ascending: true })
        .range(from, from + RECENT_PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { owner_id: string; case_date: string }[];
      for (const r of rows) if (!latest.has(r.owner_id)) latest.set(r.owner_id, r.case_date);
      if (rows.length < RECENT_PAGE) break;
    }
    const ids = [...latest.keys()].slice(0, limit);
    if (ids.length === 0) return [];
    const { data, error } = await this.anon.from('public_profiles').select(PUBLIC_PROFILE_COLUMNS).in('user_id', ids);
    if (error) throw error;
    const byId = new Map(((data ?? []) as unknown as PublicProfileRow[]).map((r) => [r.user_id, rowToPublicProfile(r)]));
    return ids.flatMap((id) => (byId.has(id) ? [{ person: byId.get(id)!, lastCased: latest.get(id)! }] : []));
  }

  async getSharedCases(ownerId: string): Promise<SharedCase[]> {
    // The function returns at most 1000 cases, so a single account can't make the public page enormous.
    const { data, error } = await this.anon.rpc('public_person_cases', { p_id: ownerId });
    if (error) throw error;
    return ((data ?? []) as SharedRow[]).map(rowToSharedCase);
  }

  /** Visitors without an account never see interviewed cases: they are for members only. */
  async getInterviewed(): Promise<SharedInterviewed[]> {
    return [];
  }
}

/**
 * Community access for a signed-in member through Supabase. Row level security decides what comes back:
 * members only ever receive listed profiles and the `shared_cases` projection, never another member's
 * `cases` rows.
 */
export class SupabaseCommunity implements CommunityRepository {
  private readonly publicView: PublicCommunity;

  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    anonClient: SupabaseClient,
  ) {
    this.publicView = new PublicCommunity(anonClient);
  }

  async getMyProfile(): Promise<Profile | null> {
    const { data, error } = await this.client.from('profiles').select('*').eq('user_id', this.userId).maybeSingle();
    if (error) throw error;
    return data ? rowToProfile(data as ProfileRow) : null;
  }

  async saveProfile(input: ProfileInput): Promise<Profile> {
    const row = profileToRow(input);
    // Update first: it is what lets a former member switch themselves off (creating a profile needs membership).
    const updated = await this.client.from('profiles').update(row).eq('user_id', this.userId).select().maybeSingle();
    if (updated.error) throw updated.error;
    if (updated.data) return rowToProfile(updated.data as ProfileRow);
    const created = await this.client.from('profiles').insert({ user_id: this.userId, ...row }).select().single();
    if (created.error) throw created.error;
    return rowToProfile(created.data as ProfileRow);
  }

  async searchPeople(query: string): Promise<Profile[]> {
    let q = this.client.from('profiles').select('*').eq('listed', true).neq('user_id', this.userId);
    const text = query.trim();
    if (text) q = q.ilike('display_name', `%${text}%`);
    const { data, error } = await q.order('display_name', { ascending: true }).limit(50);
    if (error) throw error;
    return ((data ?? []) as ProfileRow[]).map(rowToProfile);
  }

  async getPerson(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data ? rowToProfile(data as ProfileRow) : null;
  }

  getSharedCases(ownerId: string): Promise<SharedCase[]> {
    return pageShared(this.client, 'shared_cases', SHARED_COLUMNS, ownerId);
  }

  async getInterviewed(ownerId: string): Promise<SharedInterviewed[]> {
    // The function checks that you are a verified member and that they listed themselves and switched this on.
    const { data, error } = await this.client.rpc('member_interviewed', { p_member: ownerId });
    if (error) throw error;
    return ((data ?? []) as InterviewedRow[]).map((r) => ({
      date: r.case_date,
      title: r.title,
      source: r.source ?? '',
      caseType: r.case_type as CaseType,
      industry: r.industry ?? '',
    }));
  }

  getPublicView(ownerId: string): Promise<SharedCase[]> {
    return this.publicView.getSharedCases(ownerId);
  }
}

interface InterviewedRow {
  case_date: string;
  title: string;
  source: string | null;
  case_type: string;
  industry: string | null;
}
