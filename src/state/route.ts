import { useCallback, useEffect, useState } from 'react';

export type Route = 'dashboard' | 'log' | 'improve' | 'people' | 'warmup' | 'inbox' | 'messages' | 'live';
/** The screens that have a tab in the navigation. The Inbox and a conversation live under the Community (people) tab. */
export type NavRoute = Exclude<Route, 'inbox' | 'messages' | 'live'>;

/** The screens that sit under the Community tab. */
export const UNDER_COMMUNITY: readonly Route[] = ['inbox', 'messages'];
/** The live case sits under Improvement Areas. */
export const UNDER_IMPROVE: readonly Route[] = ['live'];

export const ROUTES: { id: NavRoute; label: string; /** For tight spaces (the phone bar, a narrow top bar). */ short: string }[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Dashboard' },
  { id: 'log', label: 'My Case Log', short: 'My Cases' },
  { id: 'improve', label: 'Improvement Areas', short: 'Improve' },
  { id: 'people', label: 'Community', short: 'Community' },
  { id: 'warmup', label: 'Warm-up', short: 'Warm-up' },
];

export interface Location {
  route: Route;
  /** For `people`: the member being viewed (#/people/<id>); for `messages`: the conversation (#/messages/<id>). Undefined shows the list or the inbox. */
  param: string | undefined;
}

function parse(): Location {
  const [first, second] = window.location.hash.replace(/^#\/?/, '').split('/');
  if (first === 'log' || first === 'improve' || first === 'warmup' || first === 'inbox' || first === 'live') return { route: first, param: undefined };
  // Older addresses still work: requests and the list of conversations are both the Inbox now.
  if (first === 'requests') return { route: 'inbox', param: undefined };
  if (first === 'messages') return second ? { route: 'messages', param: decodeURIComponent(second) } : { route: 'inbox', param: undefined };
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
