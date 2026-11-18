import { parseMeetingLink, parseTimeZone, timeZoneChoices } from '../domain/meeting';
import { SCHEMA_VERSION, type AppData, type BackupFile, type BackupMeeting, type CaseRecord } from '../domain/types';
import { parseAppData } from './parse';

export class ImportError extends Error {}

export function buildBackup(data: AppData, now: Date = new Date(), meeting?: BackupMeeting | null): BackupFile {
  const mine = cleanMeeting(meeting);
  return {
    app: 'caselab',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: { ...data, schemaVersion: SCHEMA_VERSION },
    ...(mine ? { meeting: mine } : {}),
  };
}

/**
 * A complete copy of your data: every case, rating, feedback field, learning note and list item, and how you like to
 * meet. Only your own: another member's meeting details are unreadable, so no backup can hold them.
 */
export function backupToJSON(data: AppData, now: Date = new Date(), meeting?: BackupMeeting | null): string {
  return JSON.stringify(buildBackup(data, now, meeting), null, 2);
}

/** Keeps the two fields only if they are the real thing, so a hand-edited file cannot carry something else back in. */
function cleanMeeting(meeting: unknown, known?: readonly string[]): BackupMeeting | null {
  if (!meeting || typeof meeting !== 'object') return null;
  const raw = meeting as { link?: unknown; timeZone?: unknown };
  const link = parseMeetingLink(typeof raw.link === 'string' ? raw.link : '');
  const zone = parseTimeZone(typeof raw.timeZone === 'string' ? raw.timeZone : '', known);
  const out: BackupMeeting = {
    link: link.ok ? (link.link?.value ?? '') : '',
    timeZone: zone.ok ? (zone.zone ?? '') : '',
  };
  return out.link || out.timeZone ? out : null;
}

export interface ParsedBackup {
  data: AppData;
  caseCount: number;
  /** Present only when the file carries them (see `buildBackup`). */
  meeting?: BackupMeeting;
}

/** Accepts a CaseLab backup file (or, leniently, a bare data object / array of cases). */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('That file is not valid JSON.');
  }

  let payload: unknown = raw;
  let meeting: BackupMeeting | null = null;
  if (Array.isArray(raw)) {
    payload = { cases: raw };
  } else if (raw && typeof raw === 'object' && (raw as { app?: unknown }).app === 'caselab') {
    payload = (raw as { data?: unknown }).data;
    // A file is read strictly: a zone this browser has never heard of is left behind rather than written back.
    meeting = cleanMeeting((raw as { meeting?: unknown }).meeting, timeZoneChoices());
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { cases?: unknown }).cases)) {
    throw new ImportError('That does not look like a CaseLab backup (no "cases" found).');
  }
  const data = parseAppData(payload);
  return { data, caseCount: data.cases.length, ...(meeting ? { meeting } : {}) };
}

/**
 * Merge a backup into the current data. Cases are matched by id; when both sides have the
 * same case, the most recently edited version wins. Nothing is ever deleted.
 */
export function mergeAppData(current: AppData, incoming: AppData): AppData {
  const cases = new Map<string, CaseRecord>(current.cases.map((c) => [c.id, c]));
  for (const c of incoming.cases) {
    const existing = cases.get(c.id);
    if (!existing || c.updatedAt > existing.updatedAt) cases.set(c.id, c);
  }
  const opportunities = new Map(current.opportunities.map((o) => [o.id, o]));
  for (const o of incoming.opportunities) if (!opportunities.has(o.id)) opportunities.set(o.id, o);

  return parseAppData({
    cases: [...cases.values()],
    opportunities: [...opportunities.values()],
  });
}
