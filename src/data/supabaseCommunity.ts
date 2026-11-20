import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseType } from '../domain/constants';
import type { Profile, ProfileInput, SharedCase } from '../domain/community';
import type { SharedInterviewed } from '../domain/interviewed';
import {
  SHARED_COLUMNS,
  profileToRow,
  rowToProfile,
  rowToPublicProfile,
  rowToSharedCase,
  type PublicReader,
  type CommunityRepository,
  type ProfileRow,
  type PublicProfileRow,
  type SharedRow,
} from './community';

const PAGE = 1000;

/** Every case one member shares with signed-in members, a page at a time. */
async function pageShared(client: SupabaseClient, ownerId: string): Promise<SharedCase[]> {
  const out: SharedRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('shared_cases')
      .select(SHARED_COLUMNS)
      .eq('owner_id', ownerId)
      .order('case_date', { ascending: false })
      .order('share_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as SharedRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out.map(rowToSharedCase);
}

/**
 * Read-only community access for people WITHOUT an account. It uses a client that never holds a session, so every
 * request runs as the database's `anon` role, and that role can read neither public table directly: both reads below
 * go through a function that answers on an exact member id, which is the value in that member's own profile link.
 * There is nothing here that lists, searches or counts members.
 */
export class PublicCommunity implements PublicReader {
  constructor(private readonly anon: SupabaseClient) {}

  // One member by exact id, through the function: the only way in without an account.
  async getPerson(userId: string): Promise<Profile | null> {
    const { data, error } = await this.anon.rpc('public_person', { p_id: userId });
    if (error) throw error;
    const row = ((data ?? []) as PublicProfileRow[])[0];
    return row ? rowToPublicProfile(row) : null;
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
 * `cases` rows. A member who publishes a profile link without appearing in People search is served by that
 * link instead, through the same anonymous reader a visitor uses (`getPerson` / `getSharedCases` below).
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

  async saveSharedLevel(level: number): Promise<void> {
    const { error } = await this.client.from('profiles').update({ level }).eq('user_id', this.userId);
    if (error) throw error;
  }

  async searchPeople(query: string): Promise<Profile[]> {
    let q = this.client.from('profiles').select('*').eq('listed', true).neq('user_id', this.userId);
    const text = query.trim();
    if (text) q = q.ilike('display_name', `%${text}%`);
    const { data, error } = await q.order('display_name', { ascending: true }).limit(50);
    if (error) throw error;
    return ((data ?? []) as ProfileRow[]).map(rowToProfile);
  }

  /**
   * Whether this member answers on the member path at all. Their row comes back only while they appear in People
   * search (the policy `profiles: members read listed, owner reads own`), so this is also the question "is there a
   * member-side view of them to read?" — the one thing that decides which path serves the whole page, asked the
   * same way for the profile and for the cases. It is asked again rather than remembered: a repository that
   * cached the answer between two calls would serve a stale one, and the cost is a single row by primary key.
   */
  private async readableAsMember(userId: string): Promise<boolean> {
    const { data, error } = await this.client.from('profiles').select('user_id').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return !!data;
  }

  /**
   * A member who has left People search is invisible on the member path, and the same link that opens their
   * profile for a stranger would then say they aren't available to their own classmates. So when the member path
   * has nothing, this falls back to what their link publishes — the link view, exactly as a visitor reads it, and
   * marked `viaLink` so the screen offers nothing the database would refuse them.
   */
  async getPerson(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (data) return rowToProfile(data as ProfileRow);
    return this.publicView.getPerson(userId);
  }

  /** The cases come from whichever path answered for the profile, never a mixture of the two. */
  async getSharedCases(ownerId: string): Promise<SharedCase[]> {
    return (await this.readableAsMember(ownerId)) ? pageShared(this.client, ownerId) : this.publicView.getSharedCases(ownerId);
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

  getPublicPerson(ownerId: string): Promise<Profile | null> {
    return this.publicView.getPerson(ownerId);
  }
}

interface InterviewedRow {
  case_date: string;
  title: string;
  source: string | null;
  case_type: string;
  industry: string | null;
}
