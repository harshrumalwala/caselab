import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, FlaskConical, Loader2, Search, Users } from 'lucide-react';
import type { CommunityReader } from '../../data/community';
import { describeError } from '../../data/errors';
import { sharedParts, sharingSummary, type Profile, type SharingPrefs } from '../../domain/community';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { useCommunity } from '../../state/CommunityProvider';
import { useData } from '../../state/DataProvider';
import { useUI } from '../../state/ui';
import { chipClass } from '../../components/ui/chips';
import { CommunityTabs } from '../community/CommunityTabs';
import { PersonProfile } from './PersonProfile';

const MAX_CHIPS = 3;

/** What a member shares, as a few small coloured chips instead of the same long sentence on every row. */
function SharedChips({ sharing }: { sharing: SharingPrefs }) {
  const parts = sharedParts(sharing);
  if (parts.length === 0) return <span className="mt-1 block text-xs italic text-muted">Keeping it private for now</span>;
  const shown = parts.slice(0, MAX_CHIPS);
  const more = parts.length - shown.length;
  return (
    <span className="mt-1.5 flex flex-wrap gap-1" title={`Shares ${sharingSummary(sharing)}`}>
      {shown.map((part) => (
        <span key={part} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${chipClass(part)}`}>
          {part}
        </span>
      ))}
      {more > 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink-2">+{more} more</span>}
    </span>
  );
}

/** Search box and member list. Used for signed-in members and for visitors without an account. */
export function Directory({
  reader,
  onOpen,
  publicView = false,
}: {
  reader: CommunityReader;
  onOpen: (userId: string) => void;
  /** Visitors without an account: only the shared parts they can actually see are summarised. */
  publicView?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; people: Profile[] }
  >({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // Search as you type, waiting a moment so we don't ask for every keystroke.
  useEffect(() => {
    let current = true;
    // Keep showing the previous results while the next search runs, so the list doesn't flash empty.
    setResult((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    const timer = window.setTimeout(
      () => {
        reader
          .searchPeople(query)
          .then((people) => current && setResult({ status: 'ready', people }))
          .catch((e) => current && setResult({ status: 'error', message: describeError(e) }));
      },
      query ? 250 : 0,
    );
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [reader, query, attempt]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          className="field !pl-10"
          type="search"
          placeholder="Search members by name"
          aria-label="Search members by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {result.status === 'loading' && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" /> Searching…
        </div>
      )}

      {result.status === 'error' && (
        <Card>
          <div role="alert" className="space-y-3 text-sm">
            <p className="font-semibold text-ink">Couldn't load members</p>
            <p className="text-ink-2">{result.message}</p>
            <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          </div>
        </Card>
      )}

      {result.status === 'ready' &&
        (result.people.length === 0 ? (
          <Card>
            <EmptyState icon={<Users className="size-6" />} title={query ? 'No members found' : 'No members to show yet'} compact>
              {query
                ? "Try a different spelling. Members who chose not to appear here can't be found."
                : publicView
                  ? 'Members choose whether to appear here. When someone does, they show up in this list.'
                  : "When classmates join and appear in People, they'll show up here."}
            </EmptyState>
          </Card>
        ) : (
          <ul className="space-y-2.5">
            {result.people.map((p) => (
              <li key={p.userId}>
                <button
                  type="button"
                  onClick={() => onOpen(p.userId)}
                  className="sticker flex w-full items-center justify-between gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:bg-sun-soft"
                >
                  <span className="flex min-w-0 items-center gap-3.5">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink/80 font-display font-bold ${chipClass(p.displayName)}`} aria-hidden>
                      {p.displayName.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{p.displayName}</span>
                      <span className="block truncate text-xs text-muted">{p.mbaClass || 'Member'}</span>
                      {!publicView && <SharedChips sharing={p.sharing} />}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/** Signed-in People screen: the directory, or one member's profile with "Find a case for them". */
export function People() {
  const { routeParam, navigate } = useUI();
  const { community } = useCommunity();
  const { mode, exitDemo, cases } = useData();

  if (mode === 'demo') {
    return (
      <Card>
        <EmptyState icon={<FlaskConical className="size-6" />} title="People isn't available in demo mode" actions={<Button variant="primary" onClick={exitDemo}>Exit demo mode</Button>}>
          Demo mode uses sample cases that must never be compared with real members. Exit demo mode to use People.
        </EmptyState>
      </Card>
    );
  }

  if (routeParam) {
    return (
      <PersonProfile
        key={routeParam}
        reader={community}
        userId={routeParam}
        onBack={() => navigate('people')}
        mine={cases}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Community</h1>
        <p className="text-sm text-muted">
          Find a fellow member, see what they've chosen to share, and pick a case to give them. Members can choose to share with
          other members only, or with anyone.
        </p>
      </div>
      <CommunityTabs current="members" />
      <Directory reader={community} onOpen={(id) => navigate('people', id)} />
    </div>
  );
}

export type { ReactNode };
