import { useEffect, useState } from 'react';
import { useCommunity } from '../../state/CommunityProvider';
import { useData } from '../../state/DataProvider';

export interface MemberSuggestion {
  name: string;
  /** Their class, if they gave one: shown beside the name to tell two people apart. */
  detail: string;
}

/**
 * Names of community members that match what is being typed, for the "who cased you" and "who you interviewed" boxes. It only
 * suggests: the box is still free text, so anyone who isn't on CaseLab can be typed in as usual. Nothing is linked or stored beyond
 * the name that ends up in the box. Not used in demo mode (sample data stays away from real members), and if the search fails the
 * box simply has no member suggestions.
 */
export function useMemberSuggestions(query: string): MemberSuggestion[] {
  const { community } = useCommunity();
  const { mode } = useData();
  const [found, setFound] = useState<MemberSuggestion[]>([]);
  const text = query.trim();

  useEffect(() => {
    if (mode === 'demo') {
      setFound([]);
      return;
    }
    let live = true;
    // Wait a moment after the last keystroke so we don't ask for every letter.
    const timer = window.setTimeout(
      () => {
        community.searchPeople(text).then(
          (people) => live && setFound(people.map((p) => ({ name: p.displayName, detail: p.mbaClass }))),
          () => live && setFound([]),
        );
      },
      text ? 200 : 0,
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [community, mode, text]);

  return found;
}
