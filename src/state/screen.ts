import { useEffect, useState } from 'react';

/** Tailwind's `lg`, in the same unit the stylesheet uses, so the answer here and the layout there change together. */
const WIDE = '(min-width: 64rem)';

/**
 * Whether the window is wide enough for Tailwind's `lg`. False where the browser can't say (older browsers, and the
 * test environment): the narrow layout is the one every width can show, so nothing depends on a guess that it is roomy.
 *
 * It exists for the handful of places where the markup itself has to differ, not the look — a control that is laid out
 * as two columns on a wide screen is not a set of tabs there, and saying so in CSS alone would leave the accessibility
 * tree describing a page nobody is on. Anything that is only about looks stays in the stylesheet.
 */
export function isWideScreen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(WIDE).matches;
}

/** The same answer, kept up to date while the window is resized. */
export function useWideScreen(): boolean {
  const [wide, setWide] = useState(isWideScreen);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(WIDE);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}
