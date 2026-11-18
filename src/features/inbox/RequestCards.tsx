import { useEffect, useState } from 'react';
import { Check, MessageCircle, X } from 'lucide-react';
import type { BlockedMember } from '../../data/practiceRequests';
import { describeError } from '../../data/errors';
import { describeSlot, durationLabel } from '../../domain/meetingTime';
import { cleanReply, describeProposal, MAX_REQUEST_TEXT, unseenAnswer, type PracticeRequest } from '../../domain/requests';
import { openProposal, schedulingWith, type ScheduledMeeting } from '../../domain/scheduling';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { usePractice } from '../../state/PracticeProvider';
import { useMeetings } from '../../state/SchedulingProvider';
import { useToast } from '../../state/ToastProvider';
import { useConversationWith } from '../../state/MessagesProvider';
import { MeetingPanel } from '../scheduling/MeetingPanel';
import { ProposeTimesDialog } from '../scheduling/TimesField';

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
  const scheduling = useMeetings();
  const toast = useToast();
  const [reply, setReply] = useState('');
  const [stop, setStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countering, setCountering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = first(r.otherName);

  // The times they proposed with the request, if they proposed any and they are still waiting for you.
  const waiting = scheduling.available ? schedulingWith(scheduling.meetings, r.otherId).awaiting : null;
  const offered: ScheduledMeeting | null = waiting && waiting.myTurn && openProposal(waiting) ? waiting : null;
  const proposal = offered ? openProposal(offered) : null;

  /** Accepting with a time settles the time first: if someone got there first, nothing else has happened yet. */
  const answer = async (accept: boolean, slot?: string) => {
    setBusy(true);
    setError(null);
    try {
      if (offered && slot) await scheduling.confirm(offered.id, slot);
      if (offered && !accept) await scheduling.decline(offered.id);
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
      {offered && proposal && (
        <div className="mt-3" role="group" aria-labelledby={`times-${r.id}`}>
          <p id={`times-${r.id}`} className="label">
            Pick a time
          </p>
          <ul className="space-y-2">
            {proposal.slots.map((slot) => (
              <li key={slot}>
                <Button variant="primary" className="w-full justify-start text-left" disabled={busy} onClick={() => void answer(true, slot)}>
                  {describeSlot(slot, scheduling.myZone, offered.otherTimeZone, name)}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-2">{durationLabel(proposal.durationMinutes)}</p>
        </div>
      )}
      {!offered && (
        <div className="mt-3">
          <MeetingPanel otherId={r.otherId} otherName={r.otherName} requestId={r.id} quiet />
        </div>
      )}
      <div className="mt-3">
        <label className="label" htmlFor={`reply-${r.id}`}>
          Reply <span className="font-normal text-muted">(optional: a video link, or how to reach you)</span>
        </label>
        <textarea id={`reply-${r.id}`} className="field" rows={2} value={reply} maxLength={MAX_REQUEST_TEXT} onChange={(e) => setReply(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant={offered ? 'secondary' : 'primary'} onClick={() => void answer(true)} disabled={busy}>
          <Check className="size-4" /> {offered ? 'Accept without a time' : 'Accept'}
        </Button>
        {offered && (
          <Button onClick={() => setCountering(true)} disabled={busy}>
            Suggest other times
          </Button>
        )}
        <Button onClick={() => void answer(false)} disabled={busy}>
          <X className="size-4" /> Decline
        </Button>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          If I decline, don't let {name} ask again
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-bad-text">
          {error}
        </p>
      )}
      {countering && offered && (
        <ProposeTimesDialog
          title={`Suggest other times to ${name}`}
          submitLabel="Send times"
          otherName={r.otherName}
          otherZone={offered.otherTimeZone}
          onClose={() => setCountering(false)}
          onSubmit={async (times) => {
            await scheduling.counter(offered.id, times);
            toast({ title: `Times sent to ${name}` });
          }}
        />
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
      {r.status === 'pending' && r.direction === 'sent' && (
        <div className="mt-3">
          <MeetingPanel otherId={r.otherId} otherName={r.otherName} requestId={r.id} quiet />
        </div>
      )}
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
