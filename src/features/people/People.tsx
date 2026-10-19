import { useEffect, useState } from 'react';
import { ChevronRight, FlaskConical, Loader2, Search, Users } from 'lucide-react';
import { describeError } from '../../data/errors';
import { sharingSummary, type Profile } from '../../domain/community';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { useCommunity } from '../../state/CommunityProvider';
import { useData } from '../../state/DataProvider';
import { useUI } from '../../state/ui';
import { PersonProfile } from './PersonProfile';

function Directory() {
  const { community } = useCommunity();
  const { navigate } = useUI();
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
        community
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
  }, [community, query, attempt]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">People</h1>
        <p className="text-sm text-muted">
          Find a fellow member, see what they've chosen to share, and pick a case to give them. Only verified CaseLab members
          can see this.
        </p>
      </div>

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
            <EmptyState icon={<Users className="size-6" />} title={query ? 'No members found' : 'No other members yet'} compact>
              {query
                ? 'Try a different spelling. Members who chose not to appear in People can\'t be found.'
                : 'When classmates join and appear in People, they\'ll show up here.'}
            </EmptyState>
          </Card>
        ) : (
          <ul className="space-y-2.5">
            {result.people.map((p) => (
              <li key={p.userId}>
                <button
                  type="button"
                  onClick={() => navigate('people', p.userId)}
                  className="card flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-surface-2/60"
                >
                  <span className="flex min-w-0 items-center gap-3.5">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-semibold text-accent-text" aria-hidden>
                      {p.displayName.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{p.displayName}</span>
                      <span className="block truncate text-xs text-muted">
                        {p.mbaClass ? `${p.mbaClass} · ` : ''}Shares {sharingSummary(p.sharing)}
                      </span>
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

/** People directory, and a single member's profile with "Find a case for them". */
export function People() {
  const { routeParam } = useUI();
  const { mode, exitDemo } = useData();

  if (mode === 'demo') {
    return (
      <Card>
        <EmptyState icon={<FlaskConical className="size-6" />} title="People isn't available in demo mode" actions={<Button variant="primary" onClick={exitDemo}>Exit demo mode</Button>}>
          Demo mode uses sample cases that must never be compared with real members. Exit demo mode to use People.
        </EmptyState>
      </Card>
    );
  }

  return routeParam ? <PersonProfile key={routeParam} userId={routeParam} /> : <Directory />;
}
