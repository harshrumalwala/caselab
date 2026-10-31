import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createMemoryInterviewed, type InterviewedRepository } from '../data/interviewed';
import { describeError } from '../data/errors';
import { sortInterviewed, type InterviewedCase, type InterviewedInput } from '../domain/interviewed';
import { useData } from './DataProvider';

interface InterviewedValue {
  items: InterviewedCase[];
  status: 'loading' | 'ready' | 'error';
  loadError: string | null;
  /** Each of these waits for the database and rejects if it could not save; the list on screen is then unchanged. */
  add: (input: InterviewedInput) => Promise<InterviewedCase>;
  update: (id: string, input: InterviewedInput) => Promise<InterviewedCase>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

const nothing = async () => {
  throw new Error('Interviewed cases are not available here.');
};
const Ctx = createContext<InterviewedValue>({ items: [], status: 'ready', loadError: null, add: nothing, update: nothing, remove: nothing, reload: async () => {} });

/**
 * The cases you ran as the interviewer. They live with your account and are kept apart from the cases you solved, so nothing
 * here ever reaches a total, rating, trend or goal. In demo mode they are only kept for the visit.
 */
export function InterviewedProvider({ repository, children }: { repository: InterviewedRepository; children: ReactNode }) {
  const { mode } = useData();
  const demo = mode === 'demo';
  const demoRepo = useMemo(() => createMemoryInterviewed(), [demo]); // eslint-disable-line react-hooks/exhaustive-deps
  const repo = demo ? demoRepo : repository;

  const [items, setItems] = useState<InterviewedCase[]>([]);
  const [status, setStatus] = useState<InterviewedValue['status']>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setItems(sortInterviewed(await repo.list()));
      setLoadError(null);
      setStatus('ready');
    } catch (e) {
      setLoadError(describeError(e));
      setStatus('error');
    }
  }, [repo]);

  useEffect(() => {
    let live = true;
    setItems([]);
    setStatus('loading');
    repo.list().then(
      (list) => {
        if (!live) return;
        setItems(sortInterviewed(list));
        setLoadError(null);
        setStatus('ready');
      },
      (e) => {
        if (!live) return;
        setLoadError(describeError(e));
        setStatus('error');
      },
    );
    return () => {
      live = false;
    };
  }, [repo]);

  const add = useCallback(
    async (input: InterviewedInput) => {
      const saved = await repo.add(input);
      setItems((list) => sortInterviewed([...list, saved]));
      return saved;
    },
    [repo],
  );
  const update = useCallback(
    async (id: string, input: InterviewedInput) => {
      const saved = await repo.update(id, input);
      setItems((list) => sortInterviewed(list.map((c) => (c.id === id ? saved : c))));
      return saved;
    },
    [repo],
  );
  const remove = useCallback(
    async (id: string) => {
      await repo.remove(id);
      setItems((list) => list.filter((c) => c.id !== id));
    },
    [repo],
  );

  const value = useMemo(() => ({ items, status, loadError, add, update, remove, reload: load }), [items, status, loadError, add, update, remove, load]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useInterviewed = () => useContext(Ctx);
