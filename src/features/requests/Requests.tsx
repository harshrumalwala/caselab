import { useEffect, useState } from 'react';
import { Check, FlaskConical, Hourglass, Inbox, Loader2, MessageCircle, X } from 'lucide-react';
import type { BlockedMember } from '../../data/practiceRequests';
import { describeError } from '../../data/errors';
import { cleanReply, describeProposal, MAX_REQUEST_TEXT, sections, unseenAnswer, type PracticeRequest } from '../../domain/requests';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { useData } from '../../state/DataProvider';
import { usePractice } from '../../state/PracticeProvider';
import { useToast } from '../../state/ToastProvider';
import { useConversationWith } from '../../state/MessagesProvider';

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

const STATUS_LABEL = { pending: 'Waiting', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled' } as const;
const STATUS_TONE = { pending: 'neutral', accepted: 'good', declined: 'neutral', cancelled: 'neutral' } as const;

function Person({ r }: { r: PracticeRequest }) {
  return (
    <a href={`#/people/${encodeURIComponent(r.otherId)}`} className="font-semibold text-accent-text hover:underline">
      {r.otherName}
    </a>
  );
}

function Proposal({ r }: { r: PracticeRequest }) {
  const what = describeProposal(r);
  return (
    <>
      {what && <p className="mt-1 font-display text-base font-bold leading-snug text-ink">{what}</p>}
      {r.message && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">“{r.message}”</p>}
    </>
  );
}

/** Someone asked you: say yes or no, with a note back (a video link, how to reach you). */
function AnswerCard({ r }: { r: PracticeRequest }) {
  const { respond } = usePractice();
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [stop, setStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = first(r.otherName);

  const answer = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await respond(r.id, accept, cleanReply(reply), stop);
      toast({ title: accept ? `You said yes to ${name}` : `You declined ${name}'s request` });
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <li className="sticker bg-sun-soft p-4 sm:p-5">
      <p className="text-sm text-ink-2">
        <Person r={r} /> asks you to case
      </p>
      <Proposal r={r} />
      <div className="mt-3">
        <label className="label" htmlFor={`reply-${r.id}`}>
          Reply <span className="font-normal text-muted">(optional: a video link, or how to reach you)</span>
        </label>
        <textarea id={`reply-${r.id}`} className="field" rows={2} value={reply} maxLength={MAX_REQUEST_TEXT} onChange={(e) => setReply(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void answer(true)} disabled={busy}>
          <Check className="size-4" /> Accept
        </Button>
        <Button onClick={() => void answer(false)} disabled={busy}>
          <X className="size-4" /> Decline
        </Button>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          If I decline, don't let {name} ask again
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-bad">
          {error}
        </p>
      )}
    </li>
  );
}

/** An accepted request has a conversation behind it. */
function OpenConversation({ r }: { r: PracticeRequest }) {
  const conversation = useConversationWith(r.otherId);
  if (r.status !== 'accepted' || !conversation) return null;
  return (
    <div className="mt-3">
      <a
        href={`#/messages/${encodeURIComponent(conversation.id)}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-2"
      >
        <MessageCircle className="size-3.5" aria-hidden /> Message {first(r.otherName)}
      </a>
    </div>
  );
}

/** One of your requests, still waiting or finished. */
function HistoryRow({ r, onCancel }: { r: PracticeRequest; onCancel?: () => void }) {
  const fresh = unseenAnswer(r);
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
        <span>
          {r.direction === 'sent' ? (
            <>
              You asked <Person r={r} />
            </>
          ) : (
            <>
              <Person r={r} /> asked you
            </>
          )}
        </span>
        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        {fresh && <Badge tone="warn">New answer</Badge>}
      </div>
      <Proposal r={r} />
      {r.reply && (
        <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink">
          <span className="font-semibold">{r.direction === 'sent' ? `${first(r.otherName)} says: ` : 'You said: '}</span>
          <span className="whitespace-pre-line">{r.reply}</span>
        </p>
      )}
      <OpenConversation r={r} />
      {onCancel && (
        <div className="mt-3">
          <Button size="sm" onClick={onCancel}>
            Cancel request
          </Button>
        </div>
      )}
    </li>
  );
}

function Blocked() {
  const { blocked, unblock, requests } = usePractice();
  const toast = useToast();
  const [list, setList] = useState<BlockedMember[] | null>(null);

  const load = () => blocked().then(setList, () => setList([]));
  // Look again whenever your requests change: declining and blocking someone adds them here.
  useEffect(() => {
    void load();
  }, [requests]);

  if (!list || list.length === 0) return null;
  return (
    <Card aria-labelledby="blocked-title">
      <CardHeader titleId="blocked-title" title="Blocked members" subtitle="They can't send you requests or messages, and they aren't told. Allow them again any time." />
      <ul className="space-y-2">
        {list.map((b) => (
          <li key={b.userId} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink">{b.name}</span>
            <Button
              size="sm"
              onClick={() =>
                void unblock(b.userId)
                  .then(load)
                  .then(() => toast({ title: `${b.name} can ask you again` }))
                  .catch((e) => toast({ kind: 'error', title: 'Not changed', body: describeError(e) }))
              }
            >
              Allow again
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Practice requests, both ways: ones waiting for your answer, ones you're waiting on, and what happened to the rest. */
export function Requests() {
  const { mode, exitDemo } = useData();
  const { status, loadError, requests, reload, cancel, markAnswersSeen } = usePractice();
  const toast = useToast();

  const unseen = requests.some(unseenAnswer);
  // Looking at this screen is seeing the answers: clear the "new answer" count (they stay marked here until you leave).
  const [markedFresh, setMarkedFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!unseen) return;
    setMarkedFresh(new Set(requests.filter(unseenAnswer).map((r) => r.id)));
    void markAnswersSeen().catch(() => undefined);
    // Only when answers arrive that haven't been seen.
  }, [unseen]);

  if (mode === 'demo') {
    return (
      <Card>
        <EmptyState icon={<FlaskConical className="size-6" />} title="Requests aren't available in demo mode" actions={<Button variant="primary" onClick={exitDemo}>Exit demo mode</Button>}>
          Demo mode uses sample data. Exit demo mode to see your real requests.
        </EmptyState>
      </Card>
    );
  }

  const { toAnswer, waiting, earlier } = sections(requests);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <a href="#/people" className="text-sm font-medium text-accent-text hover:underline">
          ← People
        </a>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Requests</h1>
        <p className="text-sm text-ink-2">Ask someone to case, or answer when someone asks you. Short notes only: it's a nudge, not a chat.</p>
      </div>

      {status === 'loading' && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" /> Loading your requests…
        </div>
      )}

      {status === 'error' && (
        <Card>
          <div role="alert" className="space-y-3 text-sm">
            <p className="font-semibold text-ink">Couldn't load your requests</p>
            <p className="text-ink-2">{loadError}</p>
            <Button onClick={() => void reload()}>Try again</Button>
          </div>
        </Card>
      )}

      {status === 'ready' && requests.length === 0 && (
        <Card>
          <EmptyState icon={<Inbox className="size-6" />} title="No requests yet" compact>
            Open someone's profile in People and choose "Case with …?" to ask them. When someone asks you, it shows up here.
          </EmptyState>
        </Card>
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
                  void cancel(r.id).then(
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
            Earlier
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
