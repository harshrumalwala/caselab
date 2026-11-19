import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { describeError } from '../data/errors';
import type { NewMeetingTimes, ScheduledMeeting } from '../domain/scheduling';
import { viewerZone } from '../domain/meetingTime';
import { useMeetingPrefs } from './meeting';
import { useScheduling } from './scheduling';

type Status = 'loading' | 'ready' | 'error';

export interface SchedulingValue {
  /** False with nobody signed in and in demo mode, where there is nobody on the other end. */
  available: boolean;
  status: Status;
  loadError: string | null;
  /** Your records, both ways, most recently touched first. */
  meetings: ScheduledMeeting[];
  /** The zone you read times in: the one you saved, or your browser's. */
  myZone: string;
  /** You have a meeting link saved, so the other person gets one when a time is settled. */
  haveLink: boolean;
  reload(): Promise<void>;
  /** Each of these rejects with a message fit to show, and refreshes the list when it works. */
  propose(other: string, times: NewMeetingTimes, from?: { requestId?: string | null; conversationId?: string | null }): Promise<string>;
  confirm(id: string, slot: string): Promise<void>;
  counter(id: string, times: NewMeetingTimes): Promise<void>;
  decline(id: string): Promise<void>;
  cancel(id: string): Promise<void>;
  change(id: string, times: NewMeetingTimes): Promise<void>;
}

const NOT_AVAILABLE = 'Scheduling is not available here.';
const refuse = async (): Promise<never> => {
  throw new Error(NOT_AVAILABLE);
};

const SchedulingDataContext = createContext<SchedulingValue | null>(null);

/** How often to look for times somebody proposed while the app is open and visible. */
const REFRESH_MS = 60_000;

/**
 * The practice times the signed-in member is settling, loaded once and kept fresh, with the two details a screen
 * needs beside them: the zone they read times in and whether they have a meeting link to hand over.
 */
export function SchedulingProvider({ children }: { children: ReactNode }) {
  const repository = useScheduling();
  const prefs = useMeetingPrefs();
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>([]);
  const [savedZone, setSavedZone] = useState('');
  const [haveLink, setHaveLink] = useState(false);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    if (!repository) return;
    try {
      setMeetings(await repository.list());
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
  }, [repository]);

  useEffect(() => {
    if (!repository) {
      loaded.current = false;
      setMeetings([]);
      setStatus('ready');
      return;
    }
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
  }, [repository, reload]);

  // How this member likes to meet, read again when they come back to the tab in case they have just saved a link.
  useEffect(() => {
    if (!repository || !prefs) return;
    let current = true;
    const read = () => {
      void prefs
        .load()
        .then((p) => {
          if (!current) return;
          setSavedZone(p.timeZone);
          setHaveLink(p.link !== '');
        })
        .catch(() => undefined);
    };
    read();
    window.addEventListener('focus', read);
    return () => {
      current = false;
      window.removeEventListener('focus', read);
    };
  }, [repository, prefs]);

  const myZone = useMemo(() => viewerZone(savedZone), [savedZone]);

  const value = useMemo<SchedulingValue>(() => {
    if (!repository) {
      return {
        available: false,
        status: 'ready',
        loadError: null,
        meetings: [],
        myZone,
        haveLink: false,
        reload: async () => undefined,
        propose: refuse,
        confirm: refuse,
        counter: refuse,
        decline: refuse,
        cancel: refuse,
        change: refuse,
      };
    }
    const after = async <T,>(work: Promise<T>): Promise<T> => {
      const out = await work;
      await reload();
      return out;
    };
    return {
      available: true,
      status,
      loadError,
      meetings,
      myZone,
      haveLink,
      reload,
      propose: (other, times, from) => after(repository.propose(other, times, from)),
      confirm: (id, slot) => after(repository.confirm(id, slot)),
      counter: (id, times) => after(repository.counter(id, times)),
      decline: (id) => after(repository.decline(id)),
      cancel: (id) => after(repository.cancel(id)),
      change: (id, times) => after(repository.change(id, times)),
    };
  }, [repository, status, loadError, meetings, myZone, haveLink, reload]);

  return <SchedulingDataContext.Provider value={value}>{children}</SchedulingDataContext.Provider>;
}

/** Scheduling as the screens use it. Outside the provider (and in demo mode) it is simply not available. */
export function useMeetings(): SchedulingValue {
  const ctx = useContext(SchedulingDataContext);
  const zone = useMemo(() => viewerZone(''), []);
  return (
    ctx ?? {
      available: false,
      status: 'ready',
      loadError: null,
      meetings: [],
      myZone: zone,
      haveLink: false,
      reload: async () => undefined,
      propose: refuse,
      confirm: refuse,
      counter: refuse,
      decline: refuse,
      cancel: refuse,
      change: refuse,
    }
  );
}
