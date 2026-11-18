import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../../data/errors';
import type { DraftKey, LiveCaseRepository, LiveMode, LiveView } from '../../data/liveCase';

/** Wait this long after a stage's time is up before asking the server to move the case on (it also moves it on at any request). */
const SETTLE_GRACE_MS = 400;
/** The least time between two attempts of the same background request. */
const RETRY_MS = 4000;
const MAX_FEEDBACK_TRIES = 3;

/**
 * The running live case: the case as the server last described it, a clock kept in step with the server's, and the things that happen
 * on their own (the next stage when time is up, and the feedback when the case ends).
 */
export function useLiveSession(repo: LiveCaseRepository) {
  const [view, setView] = useState<LiveView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const offset = useRef(0);
  const viewRef = useRef<LiveView | null>(null);
  const last = useRef({ settle: 0, finish: 0 });
  const finishing = useRef(false);
  const inFlight = useRef(0);

  const apply = useCallback((v: LiveView) => {
    // A slow answer must not put back an older picture than one already shown.
    if (viewRef.current && viewRef.current.sessionId === v.sessionId && v.serverNow < viewRef.current.serverNow) return;
    offset.current = v.serverNow - Date.now();
    viewRef.current = v;
    setView(v);
  }, []);

  // The case that was running when the page was opened (or the latest one that finished).
  useEffect(() => {
    let current = true;
    repo
      .resume()
      .then((v) => current && v && apply(v))
      .catch((e) => current && setError(describeError(e)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [repo, apply]);

  const running = Boolean(view && view.status === 'active');
  useEffect(() => {
    if (!view) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [view?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The server's time now, as best the page can tell. While the case is paused the clock stands still, so it is the moment it was paused. */
  const now = view?.pausedAt != null ? view.pausedAt : tick + offset.current;

  /** Runs one thing the member does: shows the result, or says what went wrong and looks again at where the case really is. */
  const run = useCallback(
    async (job: () => Promise<LiveView>, shown?: string) => {
      setBusy(true);
      setError(null);
      if (shown) setPending(shown);
      inFlight.current += 1;
      try {
        apply(await job());
      } catch (e) {
        setError(describeError(e));
        try {
          const v = await repo.resume();
          if (v) apply(v);
        } catch {
          // The message above already says there is a problem.
        }
      } finally {
        inFlight.current -= 1;
        setPending(null);
        setBusy(false);
      }
    },
    [repo, apply],
  );

  // Time is up for this stage: the server moves the case on (it would at any request, but the screen should not wait for one).
  useEffect(() => {
    if (!view || view.status !== 'active' || view.mode === 'learning' || now < view.stageEndsAt + SETTLE_GRACE_MS) return; // a learning case has no clock to run out
    if (Date.now() - last.current.settle < RETRY_MS) return;
    last.current.settle = Date.now();
    repo
      .resume()
      .then((v) => v && apply(v))
      .catch(() => undefined);
  }, [now, view, repo, apply]);

  // The case is over: write the feedback (it does not have to fit in the 30 minutes).
  const needsFeedback = Boolean(view && view.status === 'done' && !view.feedback);
  const tries = view?.feedbackAttempts ?? 0;
  const finish = useCallback(async () => {
    const v = viewRef.current;
    if (!v || finishing.current) return;
    finishing.current = true;
    setFeedbackError(null);
    try {
      apply(await repo.finish(v.sessionId));
    } catch (e) {
      setFeedbackError(describeError(e));
      try {
        const fresh = await repo.resume();
        if (fresh) apply(fresh);
      } catch {
        // Keep the message above.
      }
    } finally {
      finishing.current = false;
    }
  }, [repo, apply]);

  useEffect(() => {
    if (!needsFeedback || tries >= MAX_FEEDBACK_TRIES || feedbackError || finishing.current) return;
    if (Date.now() - last.current.finish < RETRY_MS) return;
    last.current.finish = Date.now();
    void finish();
    // Looks again every few seconds while the feedback is still missing, in case a request collided with another save.
  }, [needsFeedback, tries, feedbackError, finish, Math.floor(now / RETRY_MS)]); // eslint-disable-line react-hooks/exhaustive-deps

  const need = useCallback(() => {
    const v = viewRef.current;
    if (!v) throw new Error('No live case');
    return v.sessionId;
  }, []);

  return {
    view,
    loading,
    busy,
    pending,
    error,
    feedbackError,
    running,
    /** The server's time now (ms). */
    now,
    clearError: () => setError(null),
    start: (libraryId: string | null, mode: LiveMode = 'practice') => run(() => repo.start(libraryId, mode)),
    ready: () => run(() => repo.ready(need())),
    submit: (text: string) => run(() => repo.submit(need(), text)),
    say: (text: string) => run(() => repo.say(need(), text), text),
    next: () => run(() => repo.next(need())),
    pause: () => run(() => repo.pause(need())),
    unpause: () => run(() => repo.unpause(need())),
    end: () => run(() => repo.end(need())),
    retryFeedback: () => {
      setFeedbackError(null);
      last.current.finish = 0;
      return finish();
    },
    saveDraft: (key: DraftKey, text: string) => repo.saveDraft(need(), key, text).catch(() => undefined),
    saveScratchpad: (text: string) => repo.saveScratchpad(need(), text).catch(() => undefined),
    markLogged: async (caseId: string) => {
      await repo.logged(need(), caseId);
      const v = await repo.resume();
      if (v) apply(v);
    },
  };
}

export type LiveSession = ReturnType<typeof useLiveSession>;
