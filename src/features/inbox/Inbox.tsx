import { useEffect, useState } from 'react';
import { ChevronDown, FlaskConical, Hourglass, Inbox as InboxIcon, Loader2, MessageCircle } from 'lucide-react';
import { describeError } from '../../data/errors';
import { conversationSections } from '../../domain/messages';
import { sections, unseenAnswer } from '../../domain/requests';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { useData } from '../../state/DataProvider';
import { useMessages } from '../../state/MessagesProvider';
import { usePractice } from '../../state/PracticeProvider';
import { useToast } from '../../state/ToastProvider';
import { useUI } from '../../state/ui';
import { CommunityTabs } from '../community/CommunityTabs';
import { Thread } from '../messages/Thread';
import { ConversationRow } from './ConversationRow';
import { AnswerCard, Blocked, HistoryRow } from './RequestCards';

const demoNote = (what: string) => (
  <Card>
    <EmptyState icon={<FlaskConical className="size-6" />} title={`${what} aren't available in demo mode`} actions={<ExitDemo />}>
      Demo mode uses sample data. Exit demo mode to see your real requests and conversations.
    </EmptyState>
  </Card>
);

function ExitDemo() {
  const { exitDemo } = useData();
  return (
    <Button variant="primary" onClick={exitDemo}>
      Exit demo mode
    </Button>
  );
}

/**
 * Everything addressed to you in one place: practice requests waiting for your answer, your conversations, the requests you are
 * waiting on, and what happened to the rest. An accepted request carries on as a conversation, right here.
 */
export function Inbox() {
  const { mode } = useData();
  const practice = usePractice();
  const chats = useMessages();
  const toast = useToast();
  const [showArchived, setShowArchived] = useState(false);

  const unseen = practice.requests.some(unseenAnswer);
  // Looking at this screen is seeing the answers: clear the "new answer" count (they stay marked here until you leave).
  const [markedFresh, setMarkedFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!unseen) return;
    setMarkedFresh(new Set(practice.requests.filter(unseenAnswer).map((r) => r.id)));
    void practice.markAnswersSeen().catch(() => undefined);
    // Only when answers arrive that haven't been seen.
  }, [unseen]);

  if (mode === 'demo') return demoNote('Requests and messages');

  const { toAnswer, waiting, earlier } = sections(practice.requests);
  const { active, archived } = conversationSections(chats.conversations);
  const loading = practice.status === 'loading' || chats.status === 'loading';
  const nothingYet = practice.status === 'ready' && chats.status === 'ready' && practice.requests.length === 0 && chats.conversations.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Community</h1>
        <p className="text-sm text-muted">Ask someone to case, answer when someone asks you, and talk with the people you've agreed to case with.</p>
      </div>
      <CommunityTabs current="inbox" />

      {loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" /> Loading your inbox…
        </div>
      )}

      {practice.status === 'error' && (
        <Card>
          <div role="alert" className="space-y-3 text-sm">
            <p className="font-semibold text-ink">Couldn't load your requests</p>
            <p className="text-ink-2">{practice.loadError}</p>
            <Button onClick={() => void practice.reload()}>Try again</Button>
          </div>
        </Card>
      )}

      {chats.status === 'error' && (
        <Card>
          <div role="alert" className="space-y-3 text-sm">
            <p className="font-semibold text-ink">Couldn't load your messages</p>
            <p className="text-ink-2">{chats.loadError}</p>
            <Button onClick={() => void chats.reload()}>Try again</Button>
          </div>
        </Card>
      )}

      {nothingYet && (
        <div className="sticker bg-sky-soft">
          <EmptyState icon={<InboxIcon className="size-6" />} title="Nothing in your inbox yet" compact actions={<Button onClick={() => (window.location.hash = '#/people')}>Find members</Button>}>
            Quiet in here. Open someone's profile and choose "Case with …?" to ask them. When someone accepts, you can talk here.
          </EmptyState>
        </div>
      )}

      {toAnswer.length > 0 && (
        <section aria-labelledby="to-answer" className="space-y-3">
          <h2 id="to-answer" className="text-lg font-bold tracking-tight text-ink">
            Waiting for your answer <span className="num text-muted">({toAnswer.length})</span>
          </h2>
          <ul className="space-y-3">
            {toAnswer.map((r) => (
              <AnswerCard key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}

      {(active.length > 0 || archived.length > 0) && (
        <section aria-labelledby="conversations" className="space-y-3">
          <h2 id="conversations" className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
            <MessageCircle className="size-4 text-muted" aria-hidden /> Conversations{' '}
            {active.length > 0 && <span className="num text-muted">({active.length})</span>}
          </h2>
          {active.length > 0 && (
            <ul className="space-y-2.5" aria-label="Conversations">
              {active.map((c) => (
                <ConversationRow key={c.id} c={c} />
              ))}
            </ul>
          )}
          {archived.length > 0 && (
            <div>
              <button
                type="button"
                id="archived-title"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink"
              >
                <ChevronDown className={`size-4 transition ${showArchived ? '' : '-rotate-90'}`} aria-hidden /> Archived <span className="num text-muted">({archived.length})</span>
              </button>
              {showArchived && (
                <ul className="mt-3 space-y-2.5" aria-label="Archived conversations">
                  {archived.map((c) => (
                    <ConversationRow key={c.id} c={c} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {waiting.length > 0 && (
        <section aria-labelledby="you-asked" className="space-y-3">
          <h2 id="you-asked" className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
            <Hourglass className="size-4 text-muted" aria-hidden /> You're waiting on <span className="num text-muted">({waiting.length})</span>
          </h2>
          <ul className="space-y-3">
            {waiting.map((r) => (
              <HistoryRow
                key={r.id}
                r={r}
                onCancel={() =>
                  void practice.cancel(r.id).then(
                    () => toast({ title: 'Request cancelled' }),
                    (e) => toast({ kind: 'error', title: 'Not cancelled', body: describeError(e) }),
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}

      {earlier.length > 0 && (
        <section aria-labelledby="earlier" className="space-y-3">
          <h2 id="earlier" className="text-lg font-bold tracking-tight text-ink">
            Earlier requests
          </h2>
          <ul className="space-y-3">
            {earlier.map((r) => (
              <HistoryRow key={r.id} r={markedFresh.has(r.id) ? { ...r, answerSeen: false } : r} />
            ))}
          </ul>
        </section>
      )}

      <Blocked />
    </div>
  );
}

/** One conversation (`#/messages/<id>`), kept out of demo mode like the rest of the inbox. */
export function ConversationScreen() {
  const { mode } = useData();
  const { routeParam } = useUI();
  if (mode === 'demo') return demoNote('Messages');
  return routeParam ? <Thread key={routeParam} conversationId={routeParam} /> : null;
}
