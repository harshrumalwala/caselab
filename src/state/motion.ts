import { useEffect, useRef, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether to skip movement. True when the person asked their device for less motion. Also true where the browser can't
 * say (older browsers, and the test environment), so nothing animates by surprise and screens render their final state.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(QUERY).matches;
}

/** The same answer, kept up to date if the setting is changed while the page is open. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(QUERY);
    const update = () => setReduce(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduce;
}

/**
 * A width (0 to 100) that starts empty and grows to `target` just after the first paint, so a bar that has a CSS width
 * transition fills in instead of appearing full. With reduced motion it is simply `target`.
 */
export function useGrowIn(target: number): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) return;
    const frame = window.requestAnimationFrame(() => setValue(target));
    return () => window.cancelAnimationFrame(frame);
  }, [target, reduce]);
  return reduce ? target : value;
}

/** Counts from the previous value (0 on first show) to `target`, easing out. With reduced motion it is simply `target`. */
export function useCountUp(target: number, durationMs = 800): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? target : 0);
  const from = useRef(reduce ? target : 0);
  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(origin + (target - origin) * eased);
      from.current = value;
      setShown(value);
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, reduce, durationMs]);
  return reduce ? target : shown;
}
