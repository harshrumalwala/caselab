import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, UserRound } from 'lucide-react';
import { describeError } from '../../data/errors';
import { sharedToRecords, sharingSummary, type Profile, type SharedCase } from '../../domain/community';
import { distinctValues, matchesFilter, NO_FILTER, type CaseFilter } from '../../domain/pairing';
import { round1, skillStats } from '../../domain/stats';
import { Badge, RatingBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { useCommunity } from '../../state/CommunityProvider';
import { useData } from '../../state/DataProvider';
import { useUI } from '../../state/ui';
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

export function PersonProfile({ userId }: { userId: string }) {
  const { community } = useCommunity();
  const { cases: mine } = useData();
  const { navigate } = useUI();

  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; person: Profile | null; shared: SharedCase[] }
  >({ status: 'loading' });
  const [tab, setTab] = useState<Tab>('find');
  const [filter, setFilter] = useState<CaseFilter>(NO_FILTER);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const person = await community.getPerson(userId);
      // A member who isn't visible to you (unlisted, or no such member) looks exactly the same as one who doesn't exist.
      const shared = person ? await community.getSharedCases(userId) : [];
      setState({ status: 'ready', person, shared });
    } catch (e) {
      setState({ status: 'error', message: describeError(e) });
    }
  }, [community, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const back = (
    <button
      type="button"
      onClick={() => navigate('people')}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline"
    >
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
            They may have chosen not to appear in People, or the link may be wrong.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const visible = shared.filter((s) => matchesFilter(s, filter));
  const industries = distinctValues(shared, 'industry');
  const sources = distinctValues(shared, 'source');

  return (
    <div className="space-y-5">
      {back}

      <div className="card flex items-start gap-4 p-5 sm:p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-lg font-semibold text-accent-text" aria-hidden>
          {person.displayName.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{person.displayName}</h1>
          <p className="text-sm text-muted">{person.mbaClass || 'MBA class not shown'}</p>
          <p className="mt-2 text-sm text-ink-2">
            Shares <strong className="font-semibold text-ink">{sharingSummary(person.sharing)}</strong>
            {shared.length > 0 && <> · {shared.length} case{shared.length === 1 ? '' : 's'} visible</>}
          </p>
        </div>
      </div>

      <SharedPerformance shared={shared} />

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

      {tab === 'find' ? (
        <FindCase person={person} theirs={shared} mine={mine} />
      ) : (
        <div className="space-y-4" role="tabpanel">
          {shared.length === 0 ? (
            <Card>
              <EmptyState title="No shared cases" compact>
                {person.displayName} hasn't shared any case history with other members.
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
                {!person.sharing.feedback && <Badge>Feedback not shared</Badge>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
