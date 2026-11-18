import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BlockedMember, PracticeRepository } from '../data/practiceRequests';
import { describeError } from '../data/errors';
import { badgeCount, type NewRequest, type PracticeRequest } from '../domain/requests';

type Status = 'loading' | 'ready' | 'error';

interface PracticeContextValue {
  status: Status;
  loadError: string | null;
  /** Your requests, sent and received, newest first. */
  requests: PracticeRequest[];
  /** Waiting for your answer plus answers you haven't seen. Shown on the People tab. */
  badge: number;
  reload(): Promise<void>;
  /** Each of these rejects with an error whose message is fit to show, and refreshes the list when it works. */
  /** Resolves with the new request's id, which is what times proposed with it are attached to. */
  send(to: string, request: NewRequest): Promise<string>;
  respond(id: string, accept: boolean, reply: string, blockAsker?: boolean): Promise<void>;
  cancel(id: string): Promise<void>;
  /** You are looking at the answers now. */
  markAnswersSeen(): Promise<void>;
  blocked(): Promise<BlockedMember[]>;
  unblock(userId: string): Promise<void>;
  /** Whether you get an email about requests. */
  emailRequests(): Promise<boolean>;
  setEmailRequests(on: boolean): Promise<void>;
}

export const PracticeContext = createContext<PracticeContextValue | null>(null);

/** How often to look for new requests while the app is open and visible. */
const REFRESH_MS = 60_000;

export function PracticeProvider({ practice, children }: { practice: PracticeRepository; children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requests, setRequests] = useState<PracticeRequest[]>([]);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    try {
      setRequests(await practice.list());
      loaded.current = true;
      setLoadError(null);
      setStatus('ready');
    } catch (e) {
      // A failed refresh in the background keeps what is already on screen.
      if (!loaded.current) {
        setLoadError(describeError(e));
        setStatus('error');
      }
    }
  }, [practice]);

  useEffect(() => {
    void reload();
    const again = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    const timer = window.setInterval(again, REFRESH_MS);
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', again);
    };
  }, [reload]);

  const value = useMemo<PracticeContextValue>(
    () => ({
      status,
      loadError,
      requests,
      badge: badgeCount(requests),
      reload,
      async send(to, request) {
        const id = await practice.send(to, request);
        await reload();
        return id;
      },
      async respond(id, accept, reply, blockAsker) {
        await practice.respond(id, accept, reply, blockAsker);
        await reload();
      },
      async cancel(id) {
        await practice.cancel(id);
        await reload();
      },
      async markAnswersSeen() {
        await practice.markAnswersSeen();
        await reload();
      },
      blocked: () => practice.blocked(),
      async unblock(userId) {
        await practice.unblock(userId);
      },
      emailRequests: () => practice.emailRequests(),
      setEmailRequests: (on) => practice.setEmailRequests(on),
    }),
    [practice, status, loadError, requests, reload],
  );

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

export function usePractice(): PracticeContextValue {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error('usePractice must be used inside PracticeProvider');
  return ctx;
}

/** The badge number, or 0 where requests aren't loaded (for places that render without the provider). */
export function usePracticeBadge(): number {
  return useContext(PracticeContext)?.badge ?? 0;
}
