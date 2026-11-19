/**
 * Reading and writing a practice time in two time zones.
 *
 * Every time is stored as a UTC instant. A member reads it in the zone they saved (`How I like to meet`), or in their
 * browser's when they saved none, and sees the other person's zone beside their own wherever a time is being settled.
 * The one piece of arithmetic that is easy to get wrong is the other direction: a `datetime-local` box hands back a
 * wall clock with no zone on it, and it has to be read as a wall clock *in the member's own zone*, not the browser's.
 * `wallToIso` does that, across a daylight-saving boundary included.
 *
 * No dependency: `Intl.DateTimeFormat` with a `timeZone` does all of it.
 */

import { browserTimeZone } from './meeting';
import { MEETING_SLOT_MARGIN_MINUTES } from './scheduling';

/** The zone a member reads times in: the one they saved, else their browser's, else UTC. */
export function viewerZone(saved: string): string {
  return saved.trim() || browserTimeZone() || 'UTC';
}

interface Pieces {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
  monthName: string;
  dayPeriod: string;
  zoneName: string;
}

const NUMERIC: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: false };
const WORDS: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' };

/** `en-US` throughout, as everywhere else in the app, so the same instant reads the same for everyone. */
function parts(ms: number, zone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const format = new Intl.DateTimeFormat('en-US', { ...options, timeZone: zone || 'UTC' });
  const out: Record<string, string> = {};
  for (const p of format.formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
}

/** Everything a screen needs about one instant in one zone, or null if it is not an instant. */
export function readTime(iso: string, zone: string): Pieces | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const n = parts(ms, zone, NUMERIC);
  const w = parts(ms, zone, WORDS);
  return {
    year: Number(n.year),
    month: Number(n.month),
    day: Number(n.day),
    // A midnight that `en-US` writes as hour 24 is the start of that day, not its end.
    hour: Number(n.hour) % 24,
    minute: Number(n.minute),
    weekday: w.weekday ?? '',
    monthName: w.month ?? '',
    dayPeriod: (w.dayPeriod ?? '').toLowerCase(),
    zoneName: w.timeZoneName ?? '',
  };
}

const clock = (p: Pieces) => `${p.hour % 12 === 0 ? 12 : p.hour % 12}:${String(p.minute).padStart(2, '0')} ${p.dayPeriod}`;

/** "Tue 18 Nov", with the year on it when it is not this one. */
export function formatDate(iso: string, zone: string, now: Date = new Date()): string {
  const p = readTime(iso, zone);
  if (!p) return '';
  const here = readTime(now.toISOString(), zone);
  return `${p.weekday} ${p.day} ${p.monthName}${here && p.year !== here.year ? ` ${p.year}` : ''}`;
}

/** "7:00 pm". */
export function formatTime(iso: string, zone: string): string {
  const p = readTime(iso, zone);
  return p ? clock(p) : '';
}

/** "Tue 18 Nov, 7:00 pm". */
export function formatDateTime(iso: string, zone: string, now: Date = new Date()): string {
  const p = readTime(iso, zone);
  return p ? `${formatDate(iso, zone, now)}, ${clock(p)}` : '';
}

/** Whether both zones put the same instant on the same date at the same clock reading. */
export function sameClock(iso: string, a: string, b: string): boolean {
  const x = readTime(iso, a);
  const y = readTime(iso, b);
  if (!x || !y) return true;
  return x.year === y.year && x.month === y.month && x.day === y.day && x.hour === y.hour && x.minute === y.minute;
}

/**
 * "Tue 18 Nov, 7:00 pm for you (8:00 pm for Sam)", which is the whole point of the feature: one instant, read by two
 * people. Their part carries a weekday when the instant falls on another day for them, and the sentence drops to the
 * time alone when they saved no zone or their clock reads the same as yours.
 */
export function describeSlot(iso: string, mine: string, theirs: string, theirName: string, now: Date = new Date()): string {
  const when = formatDateTime(iso, mine, now);
  if (!when) return '';
  if (!theirs || !theirName || sameClock(iso, mine, theirs)) return when;
  const me = readTime(iso, mine)!;
  const them = readTime(iso, theirs)!;
  const otherDay = me.day !== them.day || me.month !== them.month || me.year !== them.year;
  return `${when} for you (${otherDay ? `${them.weekday} ` : ''}${clock(them)} for ${theirName})`;
}

/** The offset the zone was on at that instant, in milliseconds. */
function offsetAt(ms: number, zone: string): number {
  const p = parts(ms, zone, NUMERIC);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return asUtc - ms;
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * What a `datetime-local` box hands back ("2027-03-17T19:00"), read as a wall clock in `zone`, as the UTC instant it
 * is. Two passes, because the offset to subtract is the one in force at the answer, not at the guess — which is how a
 * time an hour after a clock change comes out right. Null if the box is empty or half filled in.
 */
export function wallToIso(wall: string, zone: string): string | null {
  const m = WALL.exec((wall ?? '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const want = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (Number.isNaN(want)) return null;
  let ms = want - offsetAt(want, zone);
  ms = want - offsetAt(ms, zone);
  return new Date(ms).toISOString();
}

/** The other direction, for filling a `datetime-local` box with a time that is already settled. */
export function isoToWall(iso: string, zone: string): string {
  const p = readTime(iso, zone);
  if (!p) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** The earliest a box should let you pick: the margin the rules keep, rounded up to the next five minutes. */
export function earliestWall(zone: string, now: Date = new Date()): string {
  const step = 5 * 60_000;
  return isoToWall(new Date(Math.ceil((now.getTime() + MEETING_SLOT_MARGIN_MINUTES * 60_000) / step) * step).toISOString(), zone);
}

/** "45 minutes", "1 hour", "1 hour 30". */
export function durationLabel(minutes: number): string {
  if (minutes === 60) return '1 hour';
  if (minutes === 90) return '1 hour 30';
  return `${minutes} minutes`;
}
