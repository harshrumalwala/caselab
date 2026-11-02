import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Draws its children only once they scroll into view, so an animation that plays when it appears (the bars growing, the arrow
 * drawing itself) is seen rather than finished before anyone gets there. The box keeps its size while empty, so nothing jumps.
 * Where the browser can't tell (older browsers, tests) the children are simply there.
 */
export function RevealOnView({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const canWatch = typeof IntersectionObserver === 'function';
  const [seen, setSeen] = useState(!canWatch);

  useEffect(() => {
    const box = ref.current;
    if (seen || !box) return;
    const watcher = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setSeen(true);
    }, { threshold: 0.3 });
    watcher.observe(box);
    return () => watcher.disconnect();
  }, [seen]);

  return (
    <div ref={ref} className={className}>
      {seen ? children : null}
    </div>
  );
}
