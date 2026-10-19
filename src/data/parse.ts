import { INDUSTRIES } from '../domain/constants';
import { emptyAppData, normalizeCase, normalizeOpportunity } from '../domain/factory';
import { SCHEMA_VERSION, type AppData, type CaseRecord } from '../domain/types';

const presetLower = new Set(INDUSTRIES.map((i) => i.toLowerCase()));

/** Industries that aren't in the preset list, de-duplicated case-insensitively. */
export function deriveCustomIndustries(cases: CaseRecord[]): string[] {
  const customs = new Map<string, string>();
  for (const c of cases) {
    const trimmed = c.industry.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !presetLower.has(key) && !customs.has(key)) customs.set(key, trimmed);
  }
  return [...customs.values()];
}

/** Turn anything JSON-shaped (a backup file, an old export) into valid AppData, never throwing. */
export function parseAppData(raw: unknown): AppData {
  const out = emptyAppData();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;

  const byId = new Map<string, CaseRecord>();
  for (const item of Array.isArray(r.cases) ? r.cases : []) {
    const c = normalizeCase(item);
    if (!c) continue;
    const prior = byId.get(c.id);
    if (!prior || c.updatedAt > prior.updatedAt) byId.set(c.id, c);
  }
  out.cases = [...byId.values()];

  const oppIds = new Set<string>();
  for (const item of Array.isArray(r.opportunities) ? r.opportunities : []) {
    const o = normalizeOpportunity(item);
    if (o && !oppIds.has(o.id)) {
      oppIds.add(o.id);
      out.opportunities.push(o);
    }
  }

  out.customIndustries = deriveCustomIndustries(out.cases);
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}
