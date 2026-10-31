import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { describeError } from '../../data/errors';
import type { Profile } from '../../domain/community';
import { cleanRequest, EMPTY_REQUEST, MAX_REQUEST_BOOK, MAX_REQUEST_TEXT, MAX_REQUEST_TITLE, MAX_REQUEST_WHEN, proposalMessage, type NewRequest } from '../../domain/requests';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useConversationWith, useMessages } from '../../state/MessagesProvider';
import { usePractice } from '../../state/PracticeProvider';
import { useToast } from '../../state/ToastProvider';

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * "Case with …?": a short, optional proposal to another member. They answer yes or no, with a note back.
 * If you're already connected (you have a conversation), there is nothing to accept: it goes into that conversation as a message
 * with the new case details, and shows up as new in their inbox.
 */
export function AskDialog({ person, prefill, onClose }: { person: Profile; prefill?: Partial<NewRequest>; onClose: () => void }) {
  const { send } = usePractice();
  const { repository, reload } = useMessages();
  const conversation = useConversationWith(person.userId);
  const toast = useToast();
  const [form, setForm] = useState<NewRequest>({ ...EMPTY_REQUEST, ...prefill });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = firstName(person.displayName);

  const set = (key: keyof NewRequest) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      if (conversation) {
        await repository.send(conversation.id, proposalMessage(form));
        await reload();
        toast({ title: `Sent to ${name}`, body: "It's in your conversation, and new in their inbox." });
      } else {
        await send(person.userId, cleanRequest(form));
        toast({ title: `Request sent to ${name}`, body: "You'll see their answer in Community → Inbox." });
      }
      onClose();
    } catch (err) {
      setError(describeError(err));
      setSending(false);
    }
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
            <Send className="size-4" /> {sending ? 'Sending…' : conversation ? 'Send message' : 'Send request'}
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
        <div>
          <label className="label" htmlFor="ask-when">
            When
          </label>
          <input id="ask-when" className="field" value={form.when} onChange={(e) => set('when')(e.target.value)} maxLength={MAX_REQUEST_WHEN} placeholder="e.g. tonight 8pm, or this weekend" />
        </div>
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
          <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad">
            {error}
          </p>
        )}
        <p className="text-xs text-muted">Only {name} sees this. Your email is never shared.</p>
      </form>
    </Dialog>
  );
}
