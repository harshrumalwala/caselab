import { INDUSTRIES } from '../domain/constants';
import { emptyAppData, normalizeCase, normalizeOpportunity } from '../domain/factory';
import { SCHEMA_VERSION, type AppData, type CaseRecord } from '../domain/types';

/**
 * The only thing the rest of the app knows about persistence. To move CaseLab to a cloud
 * database later, implement this interface (e.g. against Supabase/Firebase) and pass it to
 * <DataProvider>; nothing else needs to change.
 */
export interface CaseLabStorage {
  /** False when the browser refused storage and data lives in memory only. */
  readonly persistent: boolean;
  load(): Promise<LoadResult>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
}

export interface LoadResult {
  data: AppData;
  warning: string | null;
}

export const REAL_KEY = 'caselab:v1:data';
export const DEMO_KEY = 'caselab:v1:demo';

const presetLower = new Set(INDUSTRIES.map((i) => i.toLowerCase()));

/** Turn anything JSON-shaped into a valid AppData, never throwing. */
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

  const customs = new Map<string, string>();
  const candidates = [
    ...(Array.isArray(r.customIndustries) ? r.customIndustries : []),
    ...out.cases.map((c) => c.industry),
  ];
  for (const name of candidates) {
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !presetLower.has(key) && !customs.has(key)) customs.set(key, trimmed);
  }
  out.customIndustries = [...customs.values()];

  if (typeof r.lastExportAt === 'string' && !Number.isNaN(new Date(r.lastExportAt).getTime())) {
    out.lastExportAt = r.lastExportAt;
  }
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

function memoryBackend(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

function resolveBackend(preferred?: Storage): { backend: Storage; persistent: boolean } {
  try {
    const backend = preferred ?? window.localStorage;
    const probe = '__caselab_probe__';
    backend.setItem(probe, '1');
    backend.removeItem(probe);
    return { backend, persistent: true };
  } catch {
    return { backend: memoryBackend(), persistent: false };
  }
}

/** localStorage-backed storage. Plenty for thousands of cases; no setup, no network. */
export function createLocalStorageAdapter(key: string, preferred?: Storage): CaseLabStorage {
  const { backend, persistent } = resolveBackend(preferred);

  return {
    persistent,

    async load() {
      const text = backend.getItem(key);
      if (text === null) return { data: emptyAppData(), warning: null };
      try {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('unexpected shape');
        const version = (parsed as { schemaVersion?: unknown }).schemaVersion;
        const warning =
          typeof version === 'number' && version > SCHEMA_VERSION
            ? 'This data was saved by a newer version of CaseLab. Some fields may not display.'
            : null;
        return { data: parseAppData(parsed), warning };
      } catch {
        // Never silently discard what we could not read: keep a copy next to it.
        const rescueKey = `${key}:unreadable:${Date.now()}`;
        try {
          backend.setItem(rescueKey, text);
        } catch {
          /* nothing more we can do */
        }
        return {
          data: emptyAppData(),
          warning: `Your saved data could not be read, so CaseLab started empty. A raw copy was kept in this browser under "${rescueKey}".`,
        };
      }
    },

    async save(data) {
      backend.setItem(key, JSON.stringify(data));
    },

    async clear() {
      backend.removeItem(key);
    },
  };
}
