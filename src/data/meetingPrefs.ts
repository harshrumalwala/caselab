import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMeetingLink, parseTimeZone } from '../domain/meeting';
import { DataError } from './errors';

/** How a member likes to meet. Empty strings mean "not given"; both fields are optional and independent. */
export interface MeetingPrefs {
  /** An https:// meeting room or a phone number. */
  link: string;
  /** An IANA time zone name, for example `America/Chicago`. */
  timeZone: string;
}

export const NO_MEETING_PREFS: MeetingPrefs = { link: '', timeZone: '' };

/**
 * The signed-in member's own meeting details. Readable by nobody else: the table has no API access at all and both
 * calls go through database functions that act on the caller's own row.
 */
export interface MeetingRepository {
  /** What is stored for you right now. */
  load(): Promise<MeetingPrefs>;
  /** Saves both fields and resolves with what the database actually stored. Rejects with a message fit to show. */
  save(prefs: MeetingPrefs): Promise<MeetingPrefs>;
}

interface PrefsRow {
  meeting_link: string | null;
  time_zone: string | null;
}

const toPrefs = (row: PrefsRow | undefined): MeetingPrefs => ({ link: row?.meeting_link ?? '', timeZone: row?.time_zone ?? '' });

/** The database writes its refusals to be read ("Paste a link starting with https://…"); anything else is a real error. */
function fail(error: { message?: string; code?: string }): never {
  if (error.code === 'P0001' && error.message) throw new DataError(error.message, error);
  throw error;
}

export class SupabaseMeeting implements MeetingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async load(): Promise<MeetingPrefs> {
    const { data, error } = await this.client.rpc('my_meeting_prefs');
    if (error) throw error;
    return toPrefs((data as PrefsRow[] | null)?.[0]);
  }

  async save(prefs: MeetingPrefs): Promise<MeetingPrefs> {
    const { data, error } = await this.client.rpc('save_my_meeting_prefs', {
      p_link: prefs.link.trim(),
      p_zone: prefs.timeZone.trim(),
    });
    if (error) fail(error);
    return toPrefs((data as PrefsRow[] | null)?.[0]);
  }
}

/** For tests: the same behaviour as the database, in memory, including its refusals. */
export function createMemoryMeeting(initial: MeetingPrefs = NO_MEETING_PREFS) {
  let saved: MeetingPrefs = { ...initial };
  return {
    /** What the "database" holds right now. */
    get saved() {
      return saved;
    },
    /** Set to true to make calls fail, like a network drop. */
    failing: false as boolean,
    async load() {
      if (this.failing) throw new Error('TypeError: Failed to fetch');
      return saved;
    },
    async save(prefs: MeetingPrefs) {
      if (this.failing) throw new Error('TypeError: Failed to fetch');
      const link = parseMeetingLink(prefs.link);
      if (!link.ok) throw new DataError(link.message);
      const zone = parseTimeZone(prefs.timeZone);
      if (!zone.ok) throw new DataError(zone.message);
      saved = { link: link.link?.value ?? '', timeZone: zone.zone ?? '' };
      return saved;
    },
  } satisfies MeetingRepository & { saved: MeetingPrefs; failing: boolean };
}
