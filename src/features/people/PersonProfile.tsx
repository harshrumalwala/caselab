import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Flame, Loader2, UserRound } from 'lucide-react';
import type { CommunityReader } from '../../data/community';
import { describeError } from '../../data/errors';
import { groupBurnedCases, publicSharingSummary, sharedToRecords, sharingSummary, type Profile, type SharedCase } from '../../domain/community';
import { distinctValues, matchesFilter, NO_FILTER, type CaseFilter } from '../../domain/pairing';
import { round1, skillStats } from '../../domain/stats';
import type { CaseRecord } from '../../domain/types';
import { Badge, RatingBadge } from '../../components/ui/Badge';
import { chipClass } from '../../components/ui/chips';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { CaseFilterBar } from '../community/CaseFilterBar';
import { SharedCaseRow } from '../community/SharedCaseRow';
import { FindCase } from './FindCase';

type Tab = 'cases' | 'find';

/** What the person shares, as averages. Only appears when they share scores. */
function SharedPerformance({ shared }: { shared: SharedCase[] }) {
  const stats = useMemo(() => skillStats(sharedToRecords(shared)).filter((s) => s.count > 0), [shared]);
  if (stats.length === 0) return null;
  return (
    <Card aria-labelledby="shared-perf">
      <CardHeader
        titleId="shared-perf"
        title="Shared performance"
        subtitle={`Averages across the ${shared.length} case${shared.length === 1 ? '' : 's'} they've shared, counting only the scores they share`}
      />
      <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {stats.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-2">
              {s.label} <span className="num text-xs text-muted">n={s.count}</span>
            </span>
            <RatingBadge value={s.average === null ? null : round1(s.average)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface Props {
  reader: CommunityReader;
  userId: string;
  onBack: () => void;
  /**
   * Your own cases, for "Find a case for them". `null` for a visitor without an account: they can read what
   * the member shares, but pairing needs their own history, so they get a prompt to sign in instead.
   */
  mine: CaseRecord[] | null;
  /** Shown to visitors in place of "Find a case for them". */
  signInPrompt?: (person: Profile) => ReactNode;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function PersonProfile({ reader, userId, onBack, mine, signInPrompt }: Props) {
  const visitor = mine === null;
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; person: Profile | null; shared: SharedCase[] }
  >({ status: 'loading' });
  const [tab, setTab] = useState<Tab>(visitor ? 'cases' : 'find');
  const [filter, setFilter] = useState<CaseFilter>(NO_FILTER);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const person = await reader.getPerson(userId);
      // A member who isn't visible to you (unlisted, not public, or no such member) looks exactly the same as one who doesn't exist.
      const shared = person ? await reader.getSharedCases(userId) : [];
      setState({ status: 'ready', person, shared });
    } catch (e) {
      setState({ status: 'error', message: describeError(e) });
    }
  }, [reader, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline">
      <ArrowLeft className="size-4" /> All members
    </button>
  );

  if (state.status === 'loading') {
    return (
      <div className="space-y-4">
        {back}
        <div className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" /> Loading profile…
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <div role="alert" className="space-y-3 text-sm">
            <p className="font-semibold text-ink">Couldn't load this profile</p>
            <p className="text-ink-2">{state.message}</p>
            <Button onClick={() => void load()}>Try again</Button>
          </div>
        </Card>
      </div>
    );
  }

  const { person, shared } = state;
  if (!person) {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <EmptyState title="This member isn't available" icon={<UserRound className="size-6" />}>
            They may have chosen not to appear here, or the link may be wrong.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const visible = shared.filter((s) => matchesFilter(s, filter));
  const industries = distinctValues(shared, 'industry');
  const sources = distinctValues(shared, 'source');
  const summary = visitor ? publicSharingSummary(person.sharing) : sharingSummary(person.sharing);

  const casesPanel = (
    <div className="space-y-4" role={visitor ? undefined : 'tabpanel'}>
      {shared.length === 0 ? (
        <Card>
          <EmptyState title="No shared cases" compact>
            {person.displayName} hasn't shared any case history{visitor ? ' with visitors' : ' with other members'}.
          </EmptyState>
        </Card>
      ) : (
        <>
          <CaseFilterBar value={filter} onChange={setFilter} industries={industries} sources={sources} />
          {visible.length === 0 ? (
            <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">No cases match those filters.</p>
          ) : (
            <>
              <p className="text-xs text-muted">
                {visible.length} of {shared.length} shared case{shared.length === 1 ? '' : 's'}
              </p>
              <ul className="space-y-3">
                {visible.map((s) => (
                  <SharedCaseRow key={s.caseId} shared={s} />
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap gap-1.5">
            {!person.sharing.overall && !person.sharing.skills && <Badge>Scores not shared</Badge>}
            {!person.sharing.feedback && <Badge>{visitor ? 'Written feedback and notes are not shared' : 'Feedback not shared'}</Badge>}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {back}

      <div className="sticker flex items-start gap-4 bg-sun-soft p-5 sm:p-6">
        <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 border-ink/80 font-display text-2xl font-extrabold ${chipClass(person.displayName)}`} aria-hidden>
          {person.displayName.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">{person.displayName}</h1>
          <p className="text-sm text-muted">{person.mbaClass || 'MBA class not shown'}</p>
          <p className="mt-2 text-sm text-ink-2">
            Shares <strong className="font-semibold text-ink">{summary}</strong>
            {shared.length > 0 && <> · {shared.length} case{shared.length === 1 ? '' : 's'} visible</>}
          </p>
          {!visitor && (person.burnedBooks.length > 0 || person.burnedCases.length > 0) && (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-2">
              <Flame className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
              <span>
                Has burned{' '}
                {person.burnedBooks.length > 0 && <strong className="font-semibold text-ink">{person.burnedBooks.join(', ')}</strong>}
                {person.burnedBooks.length > 0 && person.burnedCases.length > 0 && ' and '}
                {person.burnedCases.length > 0 && (
                  <strong className="font-semibold text-ink">
                    {person.burnedCases.length} {person.burnedCases.length === 1 ? 'case' : 'cases'}
                  </strong>
                )}
              </span>
            </p>
          )}
          {!visitor && person.burnedCases.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-xs font-semibold text-accent-text hover:underline">
                See the burned {person.burnedCases.length === 1 ? 'case' : 'cases'}
              </summary>
              <div className="mt-2 space-y-2">
                {groupBurnedCases(person.burnedCases).map(([book, items]) => (
                  <div key={book || '(no book)'}>
                    <p className="eyebrow">{book || 'No book'}</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={`Burned cases${book ? ` from ${book}` : ''}`}>
                      {items.map((c) => (
                        <li key={c.title} className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-ink-2">
                          {c.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Burned cases are solo practice. They are not counted in {firstName(person.displayName)}'s totals.</p>
            </details>
          )}
        </div>
      </div>

      <SharedPerformance shared={shared} />

      {visitor ? (
        <>
          {signInPrompt?.(person)}
          {casesPanel}
        </>
      ) : (
        <>
          <div role="tablist" aria-label="Profile sections" className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium">
            {(
              [
                ['find', 'Find a case for them'],
                ['cases', `Shared cases (${shared.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 rounded-lg px-3 py-2 transition ${tab === id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'find' ? <FindCase person={person} theirs={shared} mine={mine} /> : casesPanel}
        </>
      )}
    </div>
  );
}
