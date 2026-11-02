import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Hand, Loader2, MessageCircle, Mic, UserRound } from 'lucide-react';
import type { CommunityReader } from '../../data/community';
import { describeError } from '../../data/errors';
import { publicSharingSummary, sharedToRecords, sharingSummary, type Profile, type SharedCase } from '../../domain/community';
import { distinctValues, matchesFilter, NO_FILTER, type CaseFilter } from '../../domain/pairing';
import { round1, skillStats } from '../../domain/stats';
import type { CaseRecord } from '../../domain/types';
import { Badge, RatingBadge } from '../../components/ui/Badge';
import { chipClass } from '../../components/ui/chips';
import { splitMarkClass, splitTabClass, splitTabsClass } from '../../components/ui/splitTab';
import { SlideRow } from '../../components/ui/useSlidingMark';
import { BurnedLine } from '../community/BurnedLine';
import { InterviewedCard } from './InterviewedCard';
import type { SharedInterviewed } from '../../domain/interviewed';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { useMyUserId } from '../../state/CommunityProvider';
import { useConversationWith, useMessages } from '../../state/MessagesProvider';
import { usePractice } from '../../state/PracticeProvider';
import type { NewRequest } from '../../domain/requests';
import { AskDialog } from '../requests/AskDialog';
import { CaseFilterBar } from '../community/CaseFilterBar';
import { SharedCaseRow } from '../community/SharedCaseRow';
import { FindCase } from './FindCase';
import { LevelTag } from '../progress/LevelTag';

type Tab = 'cases' | 'find';

/** "Message them", when you already have a conversation (it starts when a request is accepted). */
function MessageButton({ person }: { person: Profile }) {
  const conversation = useConversationWith(person.userId);
  if (!conversation) return null;
  return (
    <a
      href={`#/messages/${encodeURIComponent(conversation.id)}`}
      className="inline-flex h-10 grow items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition hover:bg-surface-2 sm:grow-0"
    >
      <MessageCircle className="size-4" aria-hidden /> Message {firstName(person.displayName)}
      {conversation.unread > 0 && !conversation.muted && <span className="num rounded-full bg-coral px-1.5 text-[11px] font-extrabold text-on-color">{conversation.unread}</span>}
    </a>
  );
}

/** "Case with them?" for a member who takes requests. Not offered to visitors, or while one is already waiting. */
function AskButton({ person, onAsk }: { person: Profile; onAsk: () => void }) {
  const { requests } = usePractice();
  const { status } = useMessages();
  const conversation = useConversationWith(person.userId);
  const waiting = requests.some((r) => r.direction === 'sent' && r.otherId === person.userId && r.status === 'pending');
  // Until the conversations have loaded we can't tell whether this is a new request or a message in an existing conversation.
  const unsure = status === 'loading';
  const name = firstName(person.displayName);
  return (
    <Button variant="primary" className="grow sm:grow-0" onClick={onAsk} disabled={waiting || unsure}>
      <Hand className="size-4" /> {waiting ? 'Request waiting' : conversation ? `Case again with ${name}?` : `Case with ${name}?`}
    </Button>
  );
}

/** What the person shares, as averages. Only appears when they share scores. */
function SharedPerformance({ shared }: { shared: SharedCase[] }) {
  const stats = useMemo(() => skillStats(sharedToRecords(shared)).filter((s) => s.count > 0), [shared]);
  if (stats.length === 0) return null;
  return (
    <Card strip="sky" aria-labelledby="shared-perf">
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
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; person: Profile | null; shared: SharedCase[]; interviewed: SharedInterviewed[] }
  >({ status: 'loading' });
  const [tab, setTab] = useState<Tab>(visitor ? 'cases' : 'find');
  const [filter, setFilter] = useState<CaseFilter>(NO_FILTER);
  const [ask, setAsk] = useState<Partial<NewRequest> | null>(null);
  const me = useMyUserId();

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const person = await reader.getPerson(userId);
      // A member who isn't visible to you (unlisted, not public, or no such member) looks exactly the same as one who doesn't exist.
      const shared = person ? await reader.getSharedCases(userId) : [];
      // Only members can see this, and only if they switched it on: don't even ask for a visitor or when it is off.
      const interviewed = person && !visitor && person.sharing.interviewed ? await reader.getInterviewed(userId) : [];
      setState({ status: 'ready', person, shared, interviewed });
    } catch (e) {
      setState({ status: 'error', message: describeError(e) });
    }
  }, [reader, userId, visitor]);

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

  const { person, shared, interviewed } = state;
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

      <div className="sticker bg-sun-soft p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 border-ink/80 font-display text-2xl font-extrabold ${chipClass(person.displayName)}`} aria-hidden>
            {person.displayName.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">{person.displayName}</h1>
            <p className="text-sm text-muted">{person.mbaClass || 'MBA class not shown'}</p>
            {!visitor && <LevelTag person={person} className="mt-1.5" />}
            <p className="mt-2 text-sm text-ink-2">
              Shares <strong className="font-semibold text-ink">{summary}</strong>
              {shared.length > 0 && <> · {shared.length} case{shared.length === 1 ? '' : 's'} visible</>}
            </p>
            <BurnedLine books={person.burnedBooks} cases={person.burnedCases} name={firstName(person.displayName)} />
            {interviewed.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Mic className="size-4 text-teal-ink" aria-hidden /> Has interviewed {interviewed.length} case{interviewed.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>
        {/* One row: the main action first, then the conversation. On a phone the buttons share the card's full width, or stack at full width; no space when there is neither. */}
        <div className="mt-4 flex flex-wrap gap-2 empty:hidden">
          {!visitor && person.userId !== me && (
            <>
              <AskButton person={person} onAsk={() => setAsk({})} />
              {ask && <AskDialog person={person} prefill={ask} onClose={() => setAsk(null)} />}
            </>
          )}
          {!visitor && <MessageButton person={person} />}
        </div>
      </div>

      <SharedPerformance shared={shared} />
      <InterviewedCard name={firstName(person.displayName)} items={interviewed} />

      {visitor ? (
        <>
          {signInPrompt?.(person)}
          {casesPanel}
        </>
      ) : (
        <>
          <SlideRow role="tablist" aria-label="Profile sections" activeKey={tab} markClass={splitMarkClass} className={splitTabsClass}>
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
                data-slide-active={tab === id ? 'true' : undefined}
                onClick={() => setTab(id)}
                className={splitTabClass(tab === id)}
              >
                {label}
              </button>
            ))}
          </SlideRow>
          {tab === 'find' ? (
            <FindCase
              person={person}
              theirs={shared}
              mine={mine}
              onPropose={person.userId !== me ? (c) => setAsk({ caseTitle: c.title, caseBook: c.source }) : undefined}
            />
          ) : (
            casesPanel
          )}
        </>
      )}
    </div>
  );
}
