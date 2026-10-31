import { useEffect, useState } from 'react';
import { Check, MessageCircle, X } from 'lucide-react';
import type { BlockedMember } from '../../data/practiceRequests';
import { describeError } from '../../data/errors';
import { cleanReply, describeProposal, MAX_REQUEST_TEXT, unseenAnswer, type PracticeRequest } from '../../domain/requests';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
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
export function AnswerCard({ r }: { r: PracticeRequest }) {
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
export function HistoryRow({ r, onCancel }: { r: PracticeRequest; onCancel?: () => void }) {
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

export function Blocked() {
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
