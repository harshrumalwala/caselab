import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { mergeAppData } from '../data/backup';
import { buildDemoData } from '../data/demoData';
import { describeError, toDataError } from '../data/errors';
import { withUuidIds } from '../data/mapping';
import { createMemoryRepository } from '../data/memoryRepository';
import { deriveCustomIndustries, parseAppData } from '../data/parse';
import type { CaseLabData, CaseLabRepository } from '../data/repository';
import { caseKey } from '../domain/caseKey';
import { cleanInput, emptyAppData, newId } from '../domain/factory';
import { canonicalIndustry } from '../domain/stats';
import { SCHEMA_VERSION, type AppData, type CaseInput, type CaseRecord, type OpportunityItem } from '../domain/types';
import { DRAFT_KEY, MODE_KEY } from './storageKeys';

export { DRAFT_KEY };
export type DataMode = 'real' | 'demo';
export type LoadStatus = 'loading' | 'ready' | 'error';

function readDemoFlag(): boolean {
  try {
    return window.sessionStorage.getItem(MODE_KEY) === 'demo';
  } catch {
    return false;
  }
}

function writeDemoFlag(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(MODE_KEY, 'demo');
    else window.sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* ignore */
  }
}

const assemble = (cases: CaseRecord[], opportunities: OpportunityItem[]): AppData => ({
  schemaVersion: SCHEMA_VERSION,
  cases,
  opportunities,
  customIndustries: deriveCustomIndustries(cases),
});

export interface DataContextValue {
  status: LoadStatus;
  /** Why the first load failed; the app shows this with a Retry instead of an empty dashboard. */
  loadError: string | null;
  /** A background refresh failed; the data on screen may be out of date. */
  refreshError: string | null;
  mode: DataMode;
  data: AppData;
  cases: CaseRecord[];

  /** Try the initial load (or a refresh) again. */
  reload(): Promise<void>;

  // Every write waits for the database. It resolves only after the change is stored, and
  // rejects with a DataError (a message fit to show the user) otherwise. State is never
  // updated ahead of the database, so the screen can't claim something was saved when it wasn't.
  addCase(input: CaseInput): Promise<CaseRecord>;
  updateCase(id: string, input: CaseInput): Promise<void>;
  deleteCase(id: string): Promise<void>;
  addOpportunity(kind: OpportunityItem['kind'], text: string): Promise<void>;
  removeOpportunity(id: string): Promise<void>;

  replaceAll(data: AppData): Promise<void>;
  mergeIn(data: AppData): Promise<void>;
  /**
   * Add imported cases, skipping any whose date + title already exist, along with any hand-edited list entries
   * that aren't already on the lists. Everything is stored in one write.
   */
  importCases(
    cases: CaseRecord[],
    opportunities?: Pick<OpportunityItem, 'kind' | 'text'>[],
  ): Promise<{ added: number; skipped: number; opportunitiesAdded: number }>;
  clearAll(): Promise<void>;

  enterDemo(): void;
  exitDemo(): void;
}

/** Exported so a feature can ask which dataset is in use without the hook that insists on a provider. */
export const DataContext = createContext<DataContextValue | null>(null);

interface Props {
  children: ReactNode;
  /** Where your real data lives (Supabase in production, in-memory in tests). */
  repository: CaseLabRepository;
}

export function DataProvider({ children, repository }: Props) {
  // Demo data comes from its own in-memory repository: it can never reach the real database.
  const [demoRepo, setDemoRepo] = useState<CaseLabRepository | null>(() =>
    readDemoFlag() ? createMemoryRepository(buildDemoData()) : null,
  );
  const repo = demoRepo ?? repository;
  const mode: DataMode = demoRepo ? 'demo' : 'real';

  const [data, setData] = useState<AppData>(emptyAppData);
  const dataRef = useRef<AppData>(data);
  const repoRef = useRef(repo);
  repoRef.current = repo;
  const inflight = useRef(0);

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const setAll = useCallback((next: CaseLabData) => {
    const assembled = assemble(next.cases, next.opportunities);
    dataRef.current = assembled;
    setData(assembled);
  }, []);

  const load = useCallback(
    async (silent: boolean) => {
      const target = repoRef.current;
      if (!silent) {
        setStatus('loading');
        setLoadError(null);
      }
      try {
        const loaded = await target.loadAll();
        if (repoRef.current !== target) return; // switched to/from demo mode while loading
        setAll(loaded);
        setStatus('ready');
        setLoadError(null);
        setRefreshError(null);
      } catch (e) {
        if (repoRef.current !== target) return;
        if (silent) setRefreshError(describeError(e));
        else {
          setLoadError(describeError(e));
          setStatus('error');
        }
      }
    },
    [setAll],
  );

  // Load on first render and whenever the data source changes (entering/leaving demo mode).
  useEffect(() => {
    dataRef.current = emptyAppData();
    setData(dataRef.current);
    void load(false);
  }, [repo, load]);

  // Pick up changes made on another device when you come back to this tab.
  useEffect(() => {
    if (mode !== 'real') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && inflight.current === 0) void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [mode, load]);

  /** Run a database write; apply its result to the screen only if it succeeded and still applies. */
  const write = useCallback(
    async <T,>(operation: (target: CaseLabRepository) => Promise<T>, apply: (result: T) => void): Promise<T> => {
      const target = repoRef.current;
      inflight.current += 1;
      try {
        const result = await operation(target);
        if (repoRef.current === target) apply(result);
        return result;
      } catch (e) {
        throw toDataError(e);
      } finally {
        inflight.current -= 1;
      }
    },
    [],
  );

  const current = () => dataRef.current;
  const patch = (fn: (d: AppData) => CaseLabData) => setAll(fn(dataRef.current));

  const prepare = (input: CaseInput): CaseInput => {
    const cleaned = cleanInput(input);
    // Reuse the existing spelling/casing of an industry the user already has.
    return { ...cleaned, industry: canonicalIndustry(cleaned.industry, dataRef.current.customIndustries) };
  };

  const addCase = useCallback<DataContextValue['addCase']>(
    (input) => {
      const stamp = new Date().toISOString();
      const record: CaseRecord = { ...prepare(input), id: newId(), createdAt: stamp, updatedAt: stamp };
      return write(
        (r) => r.insertCase(record),
        (saved) => patch((d) => ({ cases: [...d.cases, saved], opportunities: d.opportunities })),
      );
    },
    [write],
  );

  const updateCase = useCallback<DataContextValue['updateCase']>(
    async (id, input) => {
      const existing = current().cases.find((c) => c.id === id);
      if (!existing) throw toDataError(new Error('That case no longer exists.'));
      const record: CaseRecord = {
        ...prepare(input),
        id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await write(
        (r) => r.updateCase(record),
        (saved) =>
          patch((d) => ({ cases: d.cases.map((c) => (c.id === id ? saved : c)), opportunities: d.opportunities })),
      );
    },
    [write],
  );

  const deleteCase = useCallback<DataContextValue['deleteCase']>(
    async (id) => {
      await write(
        (r) => r.deleteCase(id),
        () => patch((d) => ({ cases: d.cases.filter((c) => c.id !== id), opportunities: d.opportunities })),
      );
    },
    [write],
  );

  const addOpportunity = useCallback<DataContextValue['addOpportunity']>(
    async (kind, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (current().opportunities.some((o) => o.kind === kind && o.text.toLowerCase() === trimmed.toLowerCase())) return;
      const item: OpportunityItem = { id: newId(), kind, text: trimmed, createdAt: new Date().toISOString() };
      await write(
        (r) => r.insertOpportunity(item),
        (saved) => patch((d) => ({ cases: d.cases, opportunities: [...d.opportunities, saved] })),
      );
    },
    [write],
  );

  const removeOpportunity = useCallback<DataContextValue['removeOpportunity']>(
    async (id) => {
      await write(
        (r) => r.deleteOpportunity(id),
        () => patch((d) => ({ cases: d.cases, opportunities: d.opportunities.filter((o) => o.id !== id) })),
      );
    },
    [write],
  );

  const replaceAll = useCallback<DataContextValue['replaceAll']>(
    async (incoming) => {
      const parsed = parseAppData(incoming);
      const next: CaseLabData = {
        cases: withUuidIds(parsed.cases),
        opportunities: withUuidIds(parsed.opportunities),
      };
      await write((r) => r.replaceAll(next), () => setAll(next));
    },
    [write, setAll],
  );

  const mergeIn = useCallback<DataContextValue['mergeIn']>(
    async (incoming) => {
      const before = dataRef.current;
      const merged = mergeAppData(before, {
        ...incoming,
        cases: withUuidIds(incoming.cases),
        opportunities: withUuidIds(incoming.opportunities),
      });
      const changedCases = merged.cases.filter(
        (c) => before.cases.find((x) => x.id === c.id)?.updatedAt !== c.updatedAt,
      );
      const newOpportunities = merged.opportunities.filter((o) => !before.opportunities.some((x) => x.id === o.id));
      await write(
        (r) => r.upsertMany({ cases: changedCases, opportunities: newOpportunities }),
        () => setAll({ cases: merged.cases, opportunities: merged.opportunities }),
      );
    },
    [write, setAll],
  );

  const importCases = useCallback<DataContextValue['importCases']>(
    async (incoming, incomingOpportunities = []) => {
      const before = dataRef.current;
      const seen = new Set(before.cases.map(caseKey));
      const fresh: CaseRecord[] = [];
      for (const c of withUuidIds(incoming)) {
        if (seen.has(caseKey(c))) continue;
        seen.add(caseKey(c));
        fresh.push(c);
      }

      const listed = new Set(before.opportunities.map((o) => `${o.kind}|${o.text.trim().toLowerCase()}`));
      const createdAt = new Date().toISOString();
      const freshOpportunities: OpportunityItem[] = [];
      for (const o of incomingOpportunities) {
        const text = o.text.trim();
        const key = `${o.kind}|${text.toLowerCase()}`;
        if (!text || listed.has(key)) continue;
        listed.add(key);
        freshOpportunities.push({ id: newId(), kind: o.kind, text, createdAt });
      }

      if (fresh.length > 0 || freshOpportunities.length > 0) {
        await write(
          (r) => r.upsertMany({ cases: fresh, opportunities: freshOpportunities }),
          () =>
            setAll({
              cases: [...before.cases, ...fresh],
              opportunities: [...before.opportunities, ...freshOpportunities],
            }),
        );
      }
      return { added: fresh.length, skipped: incoming.length - fresh.length, opportunitiesAdded: freshOpportunities.length };
    },
    [write, setAll],
  );

  const clearAll = useCallback<DataContextValue['clearAll']>(async () => {
    await write(
      (r) => r.clearAll(),
      () => {
        setAll({ cases: [], opportunities: [] });
        try {
          window.localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
      },
    );
  }, [write, setAll]);

  const enterDemo = useCallback(() => {
    writeDemoFlag(true);
    setDemoRepo(createMemoryRepository(buildDemoData()));
  }, []);

  const exitDemo = useCallback(() => {
    writeDemoFlag(false);
    setDemoRepo(null);
  }, []);

  const reload = useCallback(() => load(status !== 'error' && status !== 'loading'), [load, status]);

  const value = useMemo<DataContextValue>(
    () => ({
      status,
      loadError,
      refreshError,
      mode,
      data,
      cases: data.cases,
      reload,
      addCase,
      updateCase,
      deleteCase,
      addOpportunity,
      removeOpportunity,
      replaceAll,
      mergeIn,
      importCases,
      clearAll,
      enterDemo,
      exitDemo,
    }),
    [
      status,
      loadError,
      refreshError,
      mode,
      data,
      reload,
      addCase,
      updateCase,
      deleteCase,
      addOpportunity,
      removeOpportunity,
      replaceAll,
      mergeIn,
      importCases,
      clearAll,
      enterDemo,
      exitDemo,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
