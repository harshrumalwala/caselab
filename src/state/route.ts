import { useCallback, useEffect, useState } from 'react';

export type Route = 'dashboard' | 'log' | 'improve' | 'people' | 'warmup' | 'requests' | 'messages';
/** The screens that have a tab in the navigation. Requests and Messages live under People. */
export type NavRoute = Exclude<Route, 'requests' | 'messages'>;

/** The screens that sit under the People tab. */
export const UNDER_PEOPLE: readonly Route[] = ['requests', 'messages'];

export const ROUTES: { id: NavRoute; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'log', label: 'My Case Log' },
  { id: 'improve', label: 'Improvement Areas' },
  { id: 'people', label: 'People' },
  { id: 'warmup', label: 'Warm-up' },
];

export interface Location {
  route: Route;
  /** For `people`: the member being viewed (#/people/<id>); for `messages`: the conversation (#/messages/<id>). Undefined shows the list. */
  param: string | undefined;
}

function parse(): Location {
  const [first, second] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (first === 'log' || first === 'improve' || first === 'warmup' || first === 'requests') return { route: first, param: undefined };
  if (first === 'people' || first === 'messages') return { route: first, param: second ? decodeURIComponent(second) : undefined };
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
