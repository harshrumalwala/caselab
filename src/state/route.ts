import { useCallback, useEffect, useState } from 'react';

export type Route = 'dashboard' | 'log' | 'improve' | 'people';

export const ROUTES: { id: Route; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'log', label: 'My Case Log' },
  { id: 'improve', label: 'Improvement Areas' },
  { id: 'people', label: 'People' },
];

export interface Location {
  route: Route;
  /** For `people`: the member being viewed (#/people/<id>); undefined shows the directory. */
  param: string | undefined;
}

function parse(): Location {
  const [first, second] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (first === 'log' || first === 'improve') return { route: first, param: undefined };
  if (first === 'people') return { route: 'people', param: second ? decodeURIComponent(second) : undefined };
  return { route: 'dashboard', param: undefined };
}

/** Tiny hash router: a handful of screens don't need a routing library, and it works on any host. */
export function useRoute(): [Location, (r: Route, param?: string) => void] {
  const [location, setLocation] = useState<Location>(parse);

  useEffect(() => {
    const onChange = () =>
      setLocation((prev) => {
        const next = parse();
        return prev.route === next.route && prev.param === next.param ? prev : next;
      });
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((r: Route, param?: string) => {
    window.location.hash = param ? `/${r}/${encodeURIComponent(param)}` : `/${r}`;
    window.scrollTo?.({ top: 0 });
  }, []);

  return [location, navigate];
}
