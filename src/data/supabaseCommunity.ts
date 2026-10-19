import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, ProfileInput, SharedCase } from '../domain/community';
import {
  SHARED_COLUMNS,
  profileToRow,
  rowToProfile,
  rowToSharedCase,
  type CommunityRepository,
  type ProfileRow,
  type SharedRow,
} from './community';

const PAGE = 1000;

/**
 * Community access through Supabase. Row level security decides what comes back: members only ever
 * receive listed profiles and the `shared_cases` projection, never another member's `cases` rows.
 */
export class SupabaseCommunity implements CommunityRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

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

  async getSharedCases(ownerId: string): Promise<SharedCase[]> {
    const out: SharedRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from('shared_cases')
        .select(SHARED_COLUMNS)
        .eq('owner_id', ownerId)
        .order('case_date', { ascending: false })
        .order('share_id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as SharedRow[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out.map(rowToSharedCase);
  }
}
