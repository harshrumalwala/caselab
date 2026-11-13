import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tourKey } from './seen';

interface Step {
  /** The `data-tour` value of the thing to point at. */
  target: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { target: 'live', title: 'Practise a whole case with Bucket', body: 'A live case in writing: Bucket plays your interviewer, you work against the clock, and you get feedback on what you wrote.' },
  { target: 'log', title: 'Log a case here', body: 'After each practice case, a minute is all it takes. Press N from anywhere to open it.' },
  { target: 'import', title: 'Coming from Excel?', body: 'Import your whole log in one step. You see everything first, and nothing is saved until you say so.' },
  { target: 'community', title: 'Find someone to case with', body: 'Browse members, ask for a case, and share only what you choose. Everything starts private.' },
];

const CARD_WIDTH = 300;
const MARGIN = 12;
/** About as tall as the card gets, for placing it clear of the thing it points at. */
const CARD_HEIGHT = 205;

/** The first visible thing carrying this tour tag: a layout can render the same link twice and show only one of them. */
function findTarget(name: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  return Array.from(all).find((el) => el.getClientRects().length > 0) ?? null;
}

function markSeen(userId: string) {
  try {
    window.localStorage.setItem(tourKey(userId), '1');
  } catch {
    /* storage blocked: it may show again next visit, which is harmless */
  }
}

/**
 * A four-stop tour for a brand-new account: the live case with Bucket, Log Case, Import and Community, one note at a time. It points at the real
 * buttons, skips a stop whose button isn't on screen, can be skipped with a click or Escape, and never comes back once
 * finished or skipped.
 */
export function Tour({ userId, active }: { userId: string; active: boolean }) {
  const [index, setIndex] = useState(0);
  const [gone, setGone] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; height: number; width: number } | null>(null);
  const next = useRef<HTMLButtonElement>(null);

  const step = STEPS[index];
  const finish = useCallback(() => {
    markSeen(userId);
    setGone(true);
  }, [userId]);

  // A stop whose target isn't on screen (no Import card once there are cases, or a layout without it) is passed over.
  useLayoutEffect(() => {
    if (!active || gone || !step) return;
    if (findTarget(step.target)) return;
    const later = STEPS.findIndex((s, i) => i > index && findTarget(s.target));
    if (later !== -1) setIndex(later);
    else if (index > 0) finish();
  }, [active, gone, step, index, finish]);

  // Follow the target while the page scrolls or resizes.
  useEffect(() => {
    if (!active || gone || !step) return;
    const target = findTarget(step.target);
    if (!target) return;
    target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    const measure = () => {
      const r = target.getBoundingClientRect();
      // Same place as before: keep the old object so nothing re-renders.
      setBox((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.height === r.height && prev.width === r.width
          ? prev
          : { top: r.top, left: r.left, height: r.height, width: r.width },
      );
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    // The ring has to stay on the button when the page moves under it without a scroll or a resize: web fonts arriving
    // change a button's width, and content loading in pushes everything down.
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    const watcher = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    watcher?.observe(target);
    watcher?.observe(document.body);
    // A few times a second as well, so the ring still finds the button when nothing above announces a change.
    const poll = window.setInterval(measure, 300);
    return () => {
      live = false;
      window.clearInterval(poll);
      watcher?.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [active, gone, step]);

  useEffect(() => {
    if (!active || gone || !box) return;
    next.current?.focus({ preventScroll: true });
  }, [active, gone, index, box === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active || gone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, gone, finish]);

  if (!active || gone || !step || !box) return null;

  const stops = STEPS.filter((s) => findTarget(s.target) !== null);
  const position = Math.max(1, stops.findIndex((s) => s.target === step.target) + 1);
  const last = index >= STEPS.length - 1 || !STEPS.slice(index + 1).some((s) => findTarget(s.target));

  const width = Math.min(CARD_WIDTH, window.innerWidth - MARGIN * 2);
  const left = Math.min(Math.max(MARGIN, box.left + box.width / 2 - width / 2), window.innerWidth - width - MARGIN);
  const below = box.top + box.height + CARD_HEIGHT < window.innerHeight;
  // Always inside the screen, even while the page is still scrolling the target into view.
  const top = Math.min(Math.max(MARGIN, below ? box.top + box.height + 14 : box.top - 14 - CARD_HEIGHT), window.innerHeight - CARD_HEIGHT - MARGIN);

  const advance = () => {
    const later = STEPS.findIndex((s, i) => i > index && findTarget(s.target));
    if (later === -1) finish();
    else setIndex(later);
  };

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed z-[90] rounded-xl ring-4 ring-sun ring-offset-2 ring-offset-bg"
        style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8 }}
      />
      <div
        role="dialog"
        aria-label="Quick tour"
        className="sticker fixed z-[91] bg-surface p-4"
        style={{ top, left, width }}
      >
        <p className="eyebrow">
          {position} of {stops.length}
        </p>
        <p className="mt-1 font-display text-lg font-extrabold leading-snug text-ink">{step.title}</p>
        <p className="mt-1 font-sans text-sm leading-relaxed text-ink-2">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2 font-sans">
          <button type="button" onClick={finish} className="text-sm font-semibold text-muted hover:text-ink hover:underline">
            Skip tour
          </button>
          <button
            ref={next}
            type="button"
            onClick={advance}
            className="inline-flex h-8 items-center justify-center rounded-xl bg-accent px-4 text-xs font-semibold text-accent-ink shadow-sm transition hover:bg-accent-hover"
          >
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
