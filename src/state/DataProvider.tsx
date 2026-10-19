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
import { createLocalStorageAdapter, DEMO_KEY, parseAppData, REAL_KEY, type CaseLabStorage } from '../data/storage';
import { cleanInput, emptyAppData, newId } from '../domain/factory';
import { canonicalIndustry } from '../domain/stats';
import { INDUSTRIES } from '../domain/constants';
import type { AppData, CaseInput, CaseRecord, OpportunityItem } from '../domain/types';

export type DataMode = 'real' | 'demo';

const MODE_KEY = 'caselab:v1:mode';
export const DRAFT_KEY = 'caselab:v1:draft';

function readMode(): DataMode {
  try {
    return window.sessionStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'real';
  } catch {
    return 'real';
  }
}

function writeMode(mode: DataMode) {
  try {
    if (mode === 'demo') window.sessionStorage.setItem(MODE_KEY, 'demo');
    else window.sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* ignore */
  }
}

export interface DataContextValue {
  ready: boolean;
  mode: DataMode;
  data: AppData;
  cases: CaseRecord[];
  /** False when the browser blocked storage and nothing will survive a refresh. */
  persistent: boolean;
  loadWarning: string | null;
  saveError: string | null;

  addCase(input: CaseInput): CaseRecord;
  updateCase(id: string, input: CaseInput): void;
  deleteCase(id: string): void;
  addOpportunity(kind: OpportunityItem['kind'], text: string): void;
  removeOpportunity(id: string): void;

  replaceAll(data: AppData): void;
  mergeIn(data: AppData): void;
  /** Add imported cases, skipping any whose date + title already exist. */
  importCases(cases: CaseRecord[]): { added: number; skipped: number };
  markExported(): void;
  clearAll(): Promise<void>;

  enterDemo(): Promise<void>;
  exitDemo(): Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

interface Props {
  children: ReactNode;
  /** Injection points for tests, or for a future cloud-backed storage. */
  realStorage?: CaseLabStorage;
  demoStorage?: CaseLabStorage;
}

export function DataProvider({ children, realStorage, demoStorage }: Props) {
  const real = useMemo(() => realStorage ?? createLocalStorageAdapter(REAL_KEY), [realStorage]);
  const demo = useMemo(() => demoStorage ?? createLocalStorageAdapter(DEMO_KEY), [demoStorage]);

  const [mode, setMode] = useState<DataMode>(readMode);
  const storage = mode === 'demo' ? demo : real;

  const [data, setData] = useState<AppData>(emptyAppData);
  const dataRef = useRef<AppData>(data);
  const storageRef = useRef<CaseLabStorage>(storage);
  storageRef.current = storage;

  const [ready, setReady] = useState(false);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load whenever the active storage changes (first render, entering/leaving demo mode).
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    storage.load().then((res) => {
      if (cancelled) return;
      dataRef.current = res.data;
      setData(res.data);
      setLoadWarning(res.warning);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  // Pick up changes made in another tab of the same browser.
  useEffect(() => {
    if (mode !== 'real') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== REAL_KEY) return;
      real.load().then((res) => {
        dataRef.current = res.data;
        setData(res.data);
      });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [mode, real]);

  const commit = useCallback((next: AppData) => {
    dataRef.current = next;
    setData(next);
    storageRef.current
      .save(next)
      .then(() => setSaveError(null))
      .catch(() =>
        setSaveError('CaseLab could not save to this browser (storage may be full or blocked). Export a backup now.'),
      );
  }, []);

  /** Keep custom industries tidy: reuse existing casing, remember genuinely new names. */
  const withIndustry = useCallback((current: AppData, input: CaseInput) => {
    const cleaned = cleanInput(input);
    const industry = canonicalIndustry(cleaned.industry, current.customIndustries);
    const isKnown = (INDUSTRIES as readonly string[]).includes(industry) || current.customIndustries.includes(industry);
    return {
      cleaned: { ...cleaned, industry },
      customIndustries: industry && !isKnown ? [...current.customIndustries, industry] : current.customIndustries,
    };
  }, []);

  const addCase = useCallback<DataContextValue['addCase']>(
    (input) => {
      const current = dataRef.current;
      const { cleaned, customIndustries } = withIndustry(current, input);
      const stamp = new Date().toISOString();
      const record: CaseRecord = { ...cleaned, id: newId(), createdAt: stamp, updatedAt: stamp };
      commit({ ...current, cases: [...current.cases, record], customIndustries });
      return record;
    },
    [commit, withIndustry],
  );

  const updateCase = useCallback<DataContextValue['updateCase']>(
    (id, input) => {
      const current = dataRef.current;
      const { cleaned, customIndustries } = withIndustry(current, input);
      const cases = current.cases.map((c) =>
        c.id === id ? { ...cleaned, id, createdAt: c.createdAt, updatedAt: new Date().toISOString() } : c,
      );
      commit({ ...current, cases, customIndustries });
    },
    [commit, withIndustry],
  );

  const deleteCase = useCallback<DataContextValue['deleteCase']>(
    (id) => {
      const current = dataRef.current;
      commit({ ...current, cases: current.cases.filter((c) => c.id !== id) });
    },
    [commit],
  );

  const addOpportunity = useCallback<DataContextValue['addOpportunity']>(
    (kind, text) => {
      const trimmed = text.trim();
      const current = dataRef.current;
      if (!trimmed) return;
      if (current.opportunities.some((o) => o.kind === kind && o.text.toLowerCase() === trimmed.toLowerCase())) return;
      const item: OpportunityItem = { id: newId(), kind, text: trimmed, createdAt: new Date().toISOString() };
      commit({ ...current, opportunities: [...current.opportunities, item] });
    },
    [commit],
  );

  const removeOpportunity = useCallback<DataContextValue['removeOpportunity']>(
    (id) => {
      const current = dataRef.current;
      commit({ ...current, opportunities: current.opportunities.filter((o) => o.id !== id) });
    },
    [commit],
  );

  const replaceAll = useCallback<DataContextValue['replaceAll']>((next) => commit(parseAppData(next)), [commit]);

  const mergeIn = useCallback<DataContextValue['mergeIn']>(
    (incoming) => commit(mergeAppData(dataRef.current, incoming)),
    [commit],
  );

  const importCases = useCallback<DataContextValue['importCases']>(
    (incoming) => {
      const current = dataRef.current;
      const key = (c: CaseRecord) => `${c.date}|${c.title.trim().toLowerCase()}`;
      const seen = new Set(current.cases.map(key));
      const fresh: CaseRecord[] = [];
      for (const c of incoming) {
        if (seen.has(key(c))) continue;
        seen.add(key(c));
        fresh.push(c);
      }
      if (fresh.length > 0) commit({ ...current, cases: [...current.cases, ...fresh] });
      return { added: fresh.length, skipped: incoming.length - fresh.length };
    },
    [commit],
  );

  const markExported = useCallback(() => {
    commit({ ...dataRef.current, lastExportAt: new Date().toISOString() });
  }, [commit]);

  const clearAll = useCallback(async () => {
    await storageRef.current.clear();
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    const empty = emptyAppData();
    dataRef.current = empty;
    setData(empty);
    setSaveError(null);
  }, []);

  const enterDemo = useCallback(async () => {
    await demo.save(buildDemoData());
    writeMode('demo');
    setMode('demo');
  }, [demo]);

  const exitDemo = useCallback(async () => {
    await demo.clear();
    writeMode('real');
    setMode('real');
  }, [demo]);

  const value = useMemo<DataContextValue>(
    () => ({
      ready,
      mode,
      data,
      cases: data.cases,
      persistent: storage.persistent,
      loadWarning,
      saveError,
      addCase,
      updateCase,
      deleteCase,
      addOpportunity,
      removeOpportunity,
      replaceAll,
      mergeIn,
      importCases,
      markExported,
      clearAll,
      enterDemo,
      exitDemo,
    }),
    [
      ready,
      mode,
      data,
      storage.persistent,
      loadWarning,
      saveError,
      addCase,
      updateCase,
      deleteCase,
      addOpportunity,
      removeOpportunity,
      replaceAll,
      mergeIn,
      importCases,
      markExported,
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
