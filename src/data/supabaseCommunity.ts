import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, ProfileInput, SharedCase } from '../domain/community';
import {
  PUBLIC_PROFILE_COLUMNS,
  PUBLIC_SHARED_COLUMNS,
  SHARED_COLUMNS,
  profileToRow,
  rowToProfile,
  rowToPublicProfile,
  rowToSharedCase,
  type CommunityReader,
  type CommunityRepository,
  type ProfileRow,
  type PublicProfileRow,
  type SharedRow,
} from './community';

const PAGE = 1000;

async function pageShared(client: SupabaseClient, table: string, columns: string, ownerId: string): Promise<SharedCase[]> {
  const out: SharedRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
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
 * Read-only community access for people WITHOUT an account. It uses a client that never holds a session, so
 * every request runs as the database's `anon` role: it can only see members who opted in to being public,
 * and only the columns granted to that role (no written feedback, notes, or private ids).
 */
export class PublicCommunity implements CommunityReader {
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

  async getPerson(userId: string): Promise<Profile | null> {
    const { data, error } = await this.anon.from('public_profiles').select(PUBLIC_PROFILE_COLUMNS).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data ? rowToPublicProfile(data as unknown as PublicProfileRow) : null;
  }

  getSharedCases(ownerId: string): Promise<SharedCase[]> {
    return pageShared(this.anon, 'public_shared_cases', PUBLIC_SHARED_COLUMNS, ownerId);
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
    const { data, error } = await this.client
      .from('profiles')
      .upsert({ user_id: this.userId, ...profileToRow(input) }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return rowToProfile(data as ProfileRow);
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

  getPublicView(ownerId: string): Promise<SharedCase[]> {
    return this.publicView.getSharedCases(ownerId);
  }
}
