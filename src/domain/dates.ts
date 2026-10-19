// All dates in CaseLab are local calendar dates stored as 'YYYY-MM-DD'.
// Weeks run Monday to Sunday.

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function isValidISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Monday 00:00 of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

export function weekStartISO(iso: string): string {
  return toISODate(startOfWeek(parseISODate(iso)));
}

export function daysAgoISO(now: Date, days: number): string {
  return toISODate(addDays(now, -days));
}

const fullFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function formatDate(iso: string): string {
  return isValidISODate(iso) ? fullFmt.format(parseISODate(iso)) : iso;
}

export function formatShortDate(iso: string): string {
  return isValidISODate(iso) ? shortFmt.format(parseISODate(iso)) : iso;
}

/** ISO timestamp -> short human date, used for "last backup". */
export function formatTimestamp(ts: string | null): string {
  if (!ts) return 'never';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? 'never' : fullFmt.format(d);
}
