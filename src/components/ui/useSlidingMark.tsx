import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A highlight that slides to whichever tab is chosen, instead of the colour jumping from one to the next.
 *
 * Put `ref` on the row of tabs (it must be positioned: `relative`), render `mark` as its first child, and give the chosen tab
 * `data-slide-active="true"` with its text colour set and its own background left clear: the mark is the yellow behind it. The first
 * placement is instant (nothing slides in from the corner); after that it glides. Browsers set to reduce motion get no glide,
 * through the global rule in index.css, and the mark is simply where the chosen tab is.
 */
export function useSlidingMark<T extends HTMLElement>(activeKey: string, markClass: string): { ref: React.RefObject<T | null>; mark: ReactNode } {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [glide, setGlide] = useState(false);

  const measure = () => {
    const row = ref.current;
    const chosen = row?.querySelector<HTMLElement>('[data-slide-active="true"]');
    if (!row || !chosen || chosen.offsetWidth === 0) {
      setBox((prev) => (prev === null ? prev : null));
      return;
    }
    const next = { x: chosen.offsetLeft, y: chosen.offsetTop, w: chosen.offsetWidth, h: chosen.offsetHeight };
    setBox((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next));
  };

  // Before the browser paints, so the mark is already under the chosen tab when the page appears.
  useLayoutEffect(measure, [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep it on the tab when the row changes size without a click: the window resizes, web fonts arrive, a count appears.
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    const watcher = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    watcher?.observe(row);
    row.querySelectorAll('[data-slide-active], a, button').forEach((el) => watcher?.observe(el));
    const poll = window.setInterval(measure, 500);
    return () => {
      window.removeEventListener('resize', measure);
      watcher?.disconnect();
      window.clearInterval(poll);
    };
  }, [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Turn the glide on only after the first placement.
  useEffect(() => {
    if (box === null || glide) return;
    const id = window.setTimeout(() => setGlide(true), 60);
    return () => window.clearTimeout(id);
  }, [box, glide]);

  const mark =
    box === null ? null : (
      <span
        aria-hidden
        data-slide-mark
        className={`pointer-events-none absolute left-0 top-0 ${glide ? 'transition-[transform,width,height] duration-300 ease-out' : ''} ${markClass}`}
        style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h }}
      />
    );

  return { ref, mark };
}

/**
 * A row of tabs with the sliding highlight built in. Children are the tabs; the chosen one carries `data-slide-active="true"` and
 * leaves its own background clear. `activeKey` is anything that changes when the chosen tab does.
 */
export function SlideRow({
  as: Tag = 'div',
  activeKey,
  markClass,
  className = '',
  children,
  ...rest
}: {
  as?: 'div' | 'nav';
  activeKey: string;
  markClass: string;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  const { ref, mark } = useSlidingMark<HTMLElement>(activeKey, markClass);
  return (
    <Tag ref={ref as React.RefObject<HTMLDivElement & HTMLElement>} className={`relative ${className}`} {...rest}>
      {mark}
      {children}
    </Tag>
  );
}
