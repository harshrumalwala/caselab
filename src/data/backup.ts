import { SCHEMA_VERSION, type AppData, type BackupFile, type CaseRecord } from '../domain/types';
import { parseAppData } from './parse';

export class ImportError extends Error {}

export function buildBackup(data: AppData, now: Date = new Date()): BackupFile {
  return {
    app: 'caselab',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: { ...data, schemaVersion: SCHEMA_VERSION },
  };
}

/** A complete copy of your data: every case, rating, feedback field, learning note and list item. */
export function backupToJSON(data: AppData, now: Date = new Date()): string {
  return JSON.stringify(buildBackup(data, now), null, 2);
}

export interface ParsedBackup {
  data: AppData;
  caseCount: number;
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
  if (Array.isArray(raw)) {
    payload = { cases: raw };
  } else if (raw && typeof raw === 'object' && (raw as { app?: unknown }).app === 'caselab') {
    payload = (raw as { data?: unknown }).data;
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { cases?: unknown }).cases)) {
    throw new ImportError('That does not look like a CaseLab backup (no "cases" found).');
  }
  const data = parseAppData(payload);
  return { data, caseCount: data.cases.length };
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
