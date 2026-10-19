import { useCallback, useEffect, useState } from 'react';

export type Route = 'dashboard' | 'log' | 'improve';

export const ROUTES: { id: Route; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'log', label: 'Case Log' },
  { id: 'improve', label: 'Improvement Areas' },
];

function parse(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return hash === 'log' || hash === 'improve' ? hash : 'dashboard';
}

/** Tiny hash router: three screens don't need a routing library, and it works on any host. */
export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parse);

  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = `/${r}`;
    window.scrollTo?.({ top: 0 });
  }, []);

  return [route, navigate];
}
