/**
 * How a member likes to meet: one meeting link (or phone number) and one time zone.
 *
 * Both rules live here as plain functions, and both are enforced again in the database
 * (`supabase/migrations/20261126120000_meeting_prefs.sql`): `is_meeting_link()` is the same pair of patterns, and the
 * time zone is checked against `pg_timezone_names`. Change one and change the other; `src/data/meetingPrefs.db.test.ts`
 * runs the same inputs through both and fails if they disagree.
 */

/** Who the link is for, so the screen can name it. Nothing is stored: it is read back off the address. */
export type MeetingLinkKind = 'zoom' | 'meet' | 'teams' | 'phone' | 'other';

export interface MeetingLink {
  /** Exactly what gets stored: trimmed, with the scheme in lower case. */
  value: string;
  kind: MeetingLinkKind;
}

export type MeetingLinkResult = { ok: true; link: MeetingLink | null } | { ok: false; message: string };

export type TimeZoneResult = { ok: true; zone: string | null } | { ok: false; message: string };

/** A link is a line, not a document. The database holds the same number. */
export const MEETING_LINK_MAX = 300;
export const TIME_ZONE_MAX = 60;

/** A web address we will hand to the other person: https only, a real host, and no whitespace in it. */
const HTTPS = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:[0-9]{1,5})?([/?#][^\s]*)?$/i;
/** Digits, with an optional + at the front and spaces or dashes between them. */
const PHONE = /^\+?[0-9]([0-9 -]*[0-9])?$/;
/** A real phone number, not a year or a 40-digit paste. */
const PHONE_DIGITS = { min: 7, max: 15 };
/** `UTC`, or an IANA name: `America/Chicago`, `America/Argentina/Buenos_Aires`, `Etc/GMT+5`. */
const ZONE = /^(UTC|[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)+)$/;

const digitsIn = (text: string) => text.replace(/[^0-9]/g, '').length;

function hostOf(url: string): string {
  const rest = url.slice('https://'.length);
  const end = rest.search(/[/?#]/);
  return (end === -1 ? rest : rest.slice(0, end)).split(':')[0].toLowerCase();
}

/** Zoom, Google Meet and Teams by name; everything else is a link like any other. */
function kindOf(host: string): MeetingLinkKind {
  const at = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (at('zoom.us') || at('zoom.com') || at('zoomgov.com')) return 'zoom';
  if (at('meet.google.com')) return 'meet';
  if (at('teams.microsoft.com') || at('teams.live.com')) return 'teams';
  return 'other';
}

/**
 * Reads what the member typed. An empty box is a fine answer (`link: null`); anything that is neither an `https://`
 * address nor a phone number is refused with a sentence to show them.
 */
export function parseMeetingLink(raw: string): MeetingLinkResult {
  const text = (raw ?? '').trim();
  if (!text) return { ok: true, link: null };
  if (text.length > MEETING_LINK_MAX) {
    return { ok: false, message: `That is longer than ${MEETING_LINK_MAX} characters. Paste just the meeting address.` };
  }

  if (PHONE.test(text)) {
    const digits = digitsIn(text);
    if (digits < PHONE_DIGITS.min || digits > PHONE_DIGITS.max) {
      return { ok: false, message: 'A phone number needs between 7 and 15 digits.' };
    }
    return { ok: true, link: { value: text, kind: 'phone' } };
  }

  if (HTTPS.test(text)) {
    const value = `https://${text.slice('https://'.length)}`;
    return { ok: true, link: { value, kind: kindOf(hostOf(value)) } };
  }

  if (/^http:\/\//i.test(text)) {
    return { ok: false, message: 'Use the https:// address — http:// is not secure enough to pass on.' };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith('//')) {
    return { ok: false, message: 'A meeting link has to start with https://. Paste the address your meeting room opens at.' };
  }
  return { ok: false, message: 'Paste a link starting with https://, or a phone number.' };
}

/**
 * Reads a time zone. An empty box is a fine answer. `known` is the list the browser offers, when it has one: with it, a
 * zone nobody has heard of is refused here as well as in the database.
 */
export function parseTimeZone(raw: string, known?: readonly string[]): TimeZoneResult {
  const text = (raw ?? '').trim();
  if (!text) return { ok: true, zone: null };
  const unknown = { ok: false as const, message: 'Pick a time zone from the list (for example America/Chicago).' };
  if (text.length > TIME_ZONE_MAX || !ZONE.test(text)) return unknown;
  if (known && known.length > 0 && !known.includes(text)) return unknown;
  return { ok: true, zone: text };
}

/** Every zone this browser knows, in order. Older browsers hand back a short list of the ones our members use. */
export function timeZoneChoices(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  try {
    const all = intl.supportedValuesOf?.('timeZone');
    if (all && all.length > 0) return [...all];
  } catch {
    // An old browser: fall through to the short list.
  }
  return [...FALLBACK_ZONES];
}

/** Enough to cover a Booth cohort and the firms they talk to, for a browser that cannot list them all. */
const FALLBACK_ZONES = [
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Berlin',
  'Europe/London',
  'UTC',
] as const;

/** The zone this browser is in, if it will say and we recognise it. */
export function browserTimeZone(): string {
  try {
    const guess = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    return parseTimeZone(guess).ok ? guess.trim() : '';
  } catch {
    return '';
  }
}

/** What to call a link on screen. */
export function meetingLinkLabel(kind: MeetingLinkKind): string {
  return { zoom: 'Zoom', meet: 'Google Meet', teams: 'Microsoft Teams', phone: 'Phone', other: 'Link' }[kind];
}
