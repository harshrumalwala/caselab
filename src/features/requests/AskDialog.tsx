import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { describeError } from '../../data/errors';
import type { Profile } from '../../domain/community';
import { cleanRequest, EMPTY_REQUEST, MAX_REQUEST_BOOK, MAX_REQUEST_TEXT, MAX_REQUEST_TITLE, proposalMessage, type NewRequest } from '../../domain/requests';
import { checkMeetingTimes, zoneOfMember } from '../../domain/scheduling';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useConversationWith, useMessages } from '../../state/MessagesProvider';
import { usePractice } from '../../state/PracticeProvider';
import { useMeetings } from '../../state/SchedulingProvider';
import { useToast } from '../../state/ToastProvider';
import { AddLinkLine, anyTime, draftToTimes, emptyTimes, firstName, TimesField, type TimesDraft } from '../scheduling/TimesField';

/**
 * "Case with …?": a short, optional proposal to another member. They answer yes or no, with a note back.
 * If you're already connected (you have a conversation), there is nothing to accept: it goes into that conversation as a message
 * with the new case details, and shows up as new in their inbox.
 *
 * Times are optional too, and go through scheduling rather than into the note: the other person taps one to settle it.
 * The request is saved first and the times second, so a refusal on the times leaves the request standing and says so.
 */
export function AskDialog({ person, prefill, onClose }: { person: Profile; prefill?: Partial<NewRequest>; onClose: () => void }) {
  const { send } = usePractice();
  const { repository, reload } = useMessages();
  const conversation = useConversationWith(person.userId);
  const scheduling = useMeetings();
  const toast = useToast();
  const [form, setForm] = useState<NewRequest>({ ...EMPTY_REQUEST, ...prefill });
  const [times, setTimes] = useState<TimesDraft>(emptyTimes());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once the request itself is saved, so a retry only sends the times. */
  const [sent, setSent] = useState<{ requestId: string | null } | null>(null);
  const name = firstName(person.displayName);

  const set = (key: keyof NewRequest) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const wantsTimes = scheduling.available && anyTime(times);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const checked = wantsTimes ? checkMeetingTimes(draftToTimes(times, scheduling.myZone)) : null;
    if (checked && !checked.ok) {
      setError(checked.message);
      return;
    }
    setSending(true);
    setError(null);

    let saved = sent;
    try {
      if (!saved) {
        if (conversation) {
          await repository.send(conversation.id, proposalMessage(form));
          await reload();
          saved = { requestId: null };
        } else {
          saved = { requestId: await send(person.userId, cleanRequest(form)) };
        }
        setSent(saved);
      }
    } catch (err) {
      setError(describeError(err));
      setSending(false);
      return;
    }

    if (checked?.ok) {
      try {
        await scheduling.propose(person.userId, checked.times, { requestId: saved.requestId, conversationId: conversation?.id ?? null });
      } catch (err) {
        // The request is saved and cannot be sent twice; only the times can be tried again.
        setError(`Sent, but the times didn't go: ${describeError(err)}`);
        setSending(false);
        return;
      }
    }

    toast(
      conversation
        ? { title: `Sent to ${name}`, body: "It's in your conversation, and new in their inbox." }
        : { title: `Request sent to ${name}`, body: "You'll see their answer in Community → Inbox." },
    );
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={conversation ? `Case again with ${name}?` : `Case with ${name}?`}
      description={
        conversation
          ? "You're already connected, so this goes into your conversation as a message. They'll see it as new in their inbox."
          : 'Everything here is optional. They can accept or decline, and reply with a note.'
      }
      width="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" form="ask-form" variant="primary" disabled={sending}>
            <Send className="size-4" /> {sending ? 'Sending…' : sent ? 'Send the times' : conversation ? 'Send message' : 'Send request'}
          </Button>
        </div>
      }
    >
      <form id="ask-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div>
            <label className="label" htmlFor="ask-title">
              Case to try
            </label>
            <input id="ask-title" className="field" value={form.caseTitle} onChange={(e) => set('caseTitle')(e.target.value)} maxLength={MAX_REQUEST_TITLE} placeholder="e.g. Airline profitability" data-autofocus />
          </div>
          <div>
            <label className="label" htmlFor="ask-book">
              Casebook
            </label>
            <input id="ask-book" className="field" value={form.caseBook} onChange={(e) => set('caseBook')(e.target.value)} maxLength={MAX_REQUEST_BOOK} placeholder="e.g. Cosentino" />
          </div>
        </div>
        {scheduling.available && (
          <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-3.5">
            <TimesField
              draft={times}
              onChange={setTimes}
              otherName={person.displayName}
              otherZone={zoneOfMember(scheduling.meetings, person.userId)}
              disabled={sending}
              legend="Propose times (optional)"
            />
            {wantsTimes && !scheduling.haveLink && <AddLinkLine name={name} />}
          </div>
        )}
        <div>
          <label className="label" htmlFor="ask-note">
            Note
          </label>
          <textarea id="ask-note" className="field" rows={3} value={form.message} onChange={(e) => set('message')(e.target.value)} maxLength={MAX_REQUEST_TEXT} placeholder={`Say hi, ${name}…`} />
          <p className="mt-1 text-right text-xs text-muted" aria-live="polite">
            <span className="num">{form.message.length}</span> / {MAX_REQUEST_TEXT}
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad-text">
            {error}
          </p>
        )}
        <p className="text-xs text-muted">Only {name} sees this. Your email is never shared.</p>
      </form>
    </Dialog>
  );
}
