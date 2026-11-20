import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Eye, Hand, Loader2, MessageCircle, Mic, UserRound } from 'lucide-react';
import type { PublicReader } from '../../data/community';
import { describeError } from '../../data/errors';
import { publicSharingSummary, sharingSummary, type Profile, type SharedCase } from '../../domain/community';
import { giveNextView, type GiveNextView } from '../../domain/giveNext';
import { distinctValues, matchesFilter, NO_FILTER, sortShared, type CaseFilter, type SharedSort } from '../../domain/pairing';
import type { CaseRecord } from '../../domain/types';
import { Badge } from '../../components/ui/Badge';
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
import { useUI } from '../../state/ui';
import { useWideScreen } from '../../state/screen';
import { useConversationWith, useMessages } from '../../state/MessagesProvider';
import { usePractice } from '../../state/PracticeProvider';
import type { NewRequest } from '../../domain/requests';
import { AskDialog } from '../requests/AskDialog';
import { CaseFilterBar } from '../community/CaseFilterBar';
import { SharedCaseRow } from '../community/SharedCaseRow';
import { SharedCaseTable } from './SharedCaseTable';
import { FindCase } from './FindCase';
import { GiveThemNext } from './GiveThemNext';
import { LiveCaseTeaser } from './LiveCaseTeaser';
import { PairingLines } from './PairingLines';
import { SharedScores } from './SharedScores';
import { sharingShown } from '../../domain/sharpening';
import { SharpeningCard } from './SharpeningCard';
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

/**
 * Your own page when you have left People search and kept your link on. The member list is empty, correctly: it is
 * what other members see, and they asked to be left out of it. The link is a different audience and is unaffected, so
 * the page says that and sends you to "What others see", which reads the link live, rather than guessing at it here.
 */
function OwnPageLinkOnly() {
  const { openPreview } = useUI();
  return (
    <EmptyState
      title="No shared cases"
      compact
      actions={
        <Button onClick={openPreview}>
          <Eye className="size-4" /> See what your link shows
        </Button>
      }
    >
      You're not in People search, so members see nothing here. Your link is unaffected.
    </EmptyState>
  );
}

/** Whether the shared rows carry any score at all: what decides if "Shared performance" has a card to draw. */
const hasSharedScores = (view: GiveNextView | null): boolean => !!view && (view.scores.length > 0 || view.thinScores.length > 0);

/**
 * What the person shares, as averages, with the reader's own log held up against it underneath. Only appears
 * when they share scores; the pairing lines only where both logs can carry the claim.
 */
function SharedPerformance({ view, name }: { view: GiveNextView; name: string }) {
  if (!hasSharedScores(view)) return null;
  return (
    <Card strip="sky" aria-labelledby="shared-perf">
      <CardHeader titleId="shared-perf" title="Shared performance" />
      <SharedScores scores={view.scores} thin={view.thinScores} label="Shared performance" />
      <PairingLines pairing={view.pairing} name={name} />
    </Card>
  );
}

interface Props {
  /** Reading one member is all this screen needs, so it works for a signed-in member and for a visitor with a link. */
  reader: PublicReader;
  userId: string;
  onBack: () => void;
  /** What the back link says; visitors came from the front page, not from a list of members. */
  backLabel?: string;
  /**
   * Your own cases, for "Find a case for them". `null` for a visitor without an account: they can read what
   * the member shares, but pairing needs their own history, so they get a prompt to sign in instead.
   */
  mine: CaseRecord[] | null;
  /** Shown to visitors in place of "Find a case for them". */
  signInPrompt?: (person: Profile) => ReactNode;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** A stable empty list, so the view below is only recomputed when the real rows change. */
const NO_SHARED: SharedCase[] = [];

export function PersonProfile({ reader, userId, onBack, mine, signInPrompt, backLabel = 'All members' }: Props) {
  const visitor = mine === null;
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; person: Profile | null; shared: SharedCase[]; interviewed: SharedInterviewed[] }
  >({ status: 'loading' });
  const [tab, setTab] = useState<Tab>('find');
  const [filter, setFilter] = useState<CaseFilter>(NO_FILTER);
  // Which column the case table is ordered by. Null is the order the rows arrived in, which is the one the page opens on.
  const [sort, setSort] = useState<SharedSort | null>(null);
  const [ask, setAsk] = useState<Partial<NewRequest> | null>(null);
  const me = useMyUserId();
  // A visitor's two views are tabs on a narrow screen and stacked blocks from `lg`. Which one is on screen decides the markup
  // and not only the look: tabs nobody can reach would describe a page the reader is not on. False where the browser
  // can't say, so the answer there is the tabs, which work at any width.
  const wide = useWideScreen();

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

  // Their shared scores, with the reader's own log held against them. It is read here, above the branches, so the
  // page knows whether the side column has anything in it before it decides how many columns to draw.
  const theirs = state.status === 'ready' ? state.shared : NO_SHARED;
  const theirId = state.status === 'ready' ? state.person?.userId : undefined;
  const performance = useMemo(
    // Nobody is paired with themselves: on your own page the card is the scores you share and nothing else.
    () => (mine ? giveNextView(theirs, theirId === me ? null : mine) : null),
    [theirs, theirId, mine, me],
  );

  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline">
      <ArrowLeft className="size-4" /> {backLabel}
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

  const visible = sortShared(
    shared.filter((s) => matchesFilter(s, filter)),
    sort,
  );
  // A visitor's page is one full-width column from `lg`, so the case history has the room to be read as a table:
  // fourteen cases compared down a column rather than scrolled past one card at a time. Narrower than that, and in
  // the member's own narrower column, the cards are still the list.
  const asTable = visitor && wide;
  const industries = distinctValues(shared, 'industry');
  const sources = distinctValues(shared, 'source');
  // A member reading someone who has left People search is reading their link, the same page a visitor gets. The
  // member-to-member actions are refused by the database for exactly those members, so the page doesn't offer them.
  const linkView = !visitor && person.viaLink === true;
  // What the top line promises is read from what the page carries, not from the switches: the sharpening summary
  // also needs scores it can name a skill from, and it belongs to the link, so a member's page never carries it.
  const onThePage = sharingShown(person.sharing, shared, visitor ? 'visitor' : 'member');
  const summary = visitor ? publicSharingSummary(onThePage) : sharingSummary(onThePage);

  // Your own page, read as members read it, while you are out of People search and your link is on: the empty list is
  // right, and without a word it looks like a link that has stopped working.
  const ownLinkOnly = !visitor && person.userId === me && !person.listed && person.publicProfile;

  const casesBody = (
    <>
      {shared.length === 0 ? (
        <Card>
          {ownLinkOnly ? (
            <OwnPageLinkOnly />
          ) : (
            <EmptyState title="No shared cases" compact>
              {person.displayName} hasn't shared any case history{visitor ? ' with visitors' : ' with other members'}.
            </EmptyState>
          )}
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
              {asTable ? (
                <SharedCaseTable rows={visible} sort={sort} onSort={setSort} />
              ) : (
                <ul className="space-y-3">
                  {visible.map((s) => (
                    <SharedCaseRow key={s.caseId} shared={s} />
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="flex flex-wrap gap-1.5">
            {!person.sharing.overall && !person.sharing.skills && <Badge>Scores not shared</Badge>}
            {!person.sharing.feedback && <Badge>{visitor ? 'Written feedback and notes are not shared' : 'Feedback not shared'}</Badge>}
          </div>
        </>
      )}
    </>
  );

  const side = visitor ? (
    <>
      {/* A visitor has no log, so pairing is out of reach: this is the nearest honest answer to "what should I give them?",
          and it is the view the page opens on, because it is the reason someone opens a link five minutes before casing
          them. Members keep "Find a case for them", which is the better answer once there is a log to compare with. */}
      <GiveThemNext person={person} shared={shared} />

      {/* The skill summary is its own choice: sharing a score beside each case is one thing, a line about what someone
          is weaker at, on a page anyone with the link can open, is another. It appears only while the member's own
          "What I'm sharpening" switch is on, and they see the same card in their preview before they choose. */}
      {person.sharing.sharpening && <SharpeningCard name={firstName(person.displayName)} shared={shared} />}
    </>
  ) : (
    <>
      {/* A visitor reads the scores inside "What to give them next", where they sit beside the practice they came for.
          A member reads them here, with the two directions of the pairing under them: their own log is already in the
          browser, so the card can answer "is this worth it, and which way round" instead of leaving them to do it. */}
      {performance && <SharedPerformance view={performance} name={firstName(person.displayName)} />}
      <InterviewedCard name={firstName(person.displayName)} items={interviewed} />
    </>
  );
  // Whether there is a second view at all: a member's scores beside their cases, or a visitor's "what to give them
  // next" above them. With nothing in it a visitor is offered no tab to an empty view.
  const beside = visitor ? shared.length > 0 : hasSharedScores(performance) || interviewed.length > 0;
  // A visitor switches between the two views until the page is wide enough to stack both; from then on both are on
  // screen, so the page says so and drops the tabs rather than leaving panels pointing at a control nobody can reach.
  const switching = visitor && beside && !wide;
  // The case list carries no heading of its own, so it keeps a name wherever it has company: the tab's while it is one
  // of two views, its own while it is a block among them. Alone on the page it is the page, and names nothing.
  const casesRole = !visitor ? undefined : switching ? 'tabpanel' : beside ? 'region' : undefined;
  const prompt = visitor ? signInPrompt?.(person) : null;

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
          {!visitor && person.userId !== me && !linkView && (
            <>
              <AskButton person={person} onAsk={() => setAsk({})} />
              {ask && <AskDialog person={person} prefill={ask} onClose={() => setAsk(null)} />}
            </>
          )}
          {linkView && person.userId !== me && <p className="self-center text-sm text-ink-2">{firstName(person.displayName)} can't be asked to case right now.</p>}
          {/* A conversation the two of you already have outlives People search, so this stays wherever there is one. */}
          {!visitor && <MessageButton person={person} />}
        </div>
      </div>

      {visitor && (
        // A link is the only way in without an account, so a visitor here may never have heard of CaseLab. The two
        // invitations sit under the member's own card and above everything about their practice, and read general then
        // particular: what you can do here, then what you get with this person. Side by side where there is room.
        <div className="grid gap-5 lg:grid-cols-3">
          <div className={prompt ? 'lg:col-span-2' : 'lg:col-span-3'}>
            <LiveCaseTeaser />
          </div>
          {prompt}
        </div>
      )}

      {/* What this person is like, then their cases. A visitor reads them stacked down one full-width column, each
          block using the whole width: the practice lanes two across, the case history as a table wide enough to
          compare down. On a narrow screen the two are tabs. A member keeps their scores in a column beside the
          cases, and switches that column between the two answers. */}
      <div className={visitor ? 'space-y-5' : 'grid gap-5 lg:grid-cols-12'}>
        {switching && (
          <SlideRow
            role="tablist"
            aria-label="Profile sections"
            activeKey={tab}
            markClass={splitMarkClass}
            className={`${splitTabsClass} lg:hidden`}
          >
            {(
              [
                ['find', `What to give ${firstName(person.displayName)} next`],
                ['cases', `Shared cases (${shared.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`profile-tab-${id}`}
                aria-controls={`profile-panel-${id}`}
                aria-selected={tab === id}
                data-slide-active={tab === id ? 'true' : undefined}
                onClick={() => setTab(id)}
                className={splitTabClass(tab === id)}
              >
                {label}
              </button>
            ))}
          </SlideRow>
        )}

        {beside && (
          // Every card in here names itself, so as a block it needs no wrapper of its own; as a view it is the
          // panel the first tab opens.
          <div
            id={switching ? 'profile-panel-find' : undefined}
            role={switching ? 'tabpanel' : undefined}
            aria-labelledby={switching ? 'profile-tab-find' : undefined}
            className={`space-y-5 lg:block ${visitor ? '' : 'lg:col-span-5'} ${visitor && tab !== 'find' ? 'hidden' : ''}`}
          >
            {side}
          </div>
        )}

        {visitor ? (
          <div
            id={switching ? 'profile-panel-cases' : undefined}
            role={casesRole}
            aria-labelledby={switching ? 'profile-tab-cases' : undefined}
            aria-label={casesRole === 'region' ? `Shared cases (${shared.length})` : undefined}
            className={`space-y-4 lg:block ${beside && tab !== 'cases' ? 'hidden' : ''}`}
          >
            {casesBody}
          </div>
        ) : (
          <div className={`space-y-5 ${beside ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
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
              <div role="tabpanel">
                <FindCase
                  person={person}
                  theirs={shared}
                  mine={mine}
                  onPropose={person.userId !== me && !linkView ? (c) => setAsk({ caseTitle: c.title, caseBook: c.source }) : undefined}
                />
              </div>
            ) : (
              <div className="space-y-4" role="tabpanel">
                {casesBody}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
