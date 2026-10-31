import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Archive, BellOff, BellRing, Flag, Loader2, Send, ShieldOff, Trash2 } from 'lucide-react';
import { describeError } from '../../data/errors';
import { cleanMessage, formatWhen, MAX_MESSAGE, MAX_REPORT_REASON, type ChatMessage } from '../../domain/messages';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useMessages } from '../../state/MessagesProvider';
import { useToast } from '../../state/ToastProvider';
import { useUI } from '../../state/ui';

/** While a conversation is open, look for new messages this often. */
const POLL_MS = 5_000;

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; messages: ChatMessage[] };

function ReportDialog({ name, onSend, onClose }: { name: string; onSend: (reason: string, alsoBlock: boolean) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSend(reason, alsoBlock);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Report this conversation with ${name}`}
      description="Tell us briefly what happened."
      width="sm"
      layer="top"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="report-form" variant="primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send report'}
          </Button>
        </div>
      }
    >
      <form id="report-form" onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="report-reason">
            What happened
          </label>
          <textarea id="report-reason" className="field" rows={4} value={reason} maxLength={MAX_REPORT_REASON} onChange={(e) => setReason(e.target.value)} data-autofocus />
          <p className="mt-1 text-right text-xs text-muted">
            <span className="num">{reason.length}</span> / {MAX_REPORT_REASON}
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>Also block {name}, so neither of you can message the other or send requests. They won't be told.</span>
        </label>
        <p className="text-xs text-muted">
          The report goes to whoever runs CaseLab, together with the last 30 messages as they are now, even if some are deleted afterwards.
          Messages in CaseLab are not end-to-end encrypted.
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad-text">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** One conversation: the messages, a box to write in, and the controls (mute, archive, block, report). */
export function Thread({ conversationId }: { conversationId: string }) {
  const { repository, status: listStatus, conversations, reload } = useMessages();
  const { navigate } = useUI();
  const toast = useToast();
  const conv = conversations.find((c) => c.id === conversationId);

  const [state, setState] = useState<State>({ status: 'loading' });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'block' | { deleteId: string } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // follow new messages only while you are at the bottom

  const load = useCallback(
    async (first: boolean) => {
      try {
        const messages = await repository.messages(conversationId);
        setState({ status: 'ready', messages });
      } catch (e) {
        // A failed refresh keeps what is on screen; only the first load shows an error.
        if (first) setState({ status: 'error', message: describeError(e) });
      }
    },
    [repository, conversationId],
  );

  useEffect(() => {
    void load(true);
    const again = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    const timer = window.setInterval(again, POLL_MS);
    window.addEventListener('focus', again);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', again);
    };
  }, [load]);

  const messages = state.status === 'ready' ? state.messages : [];
  const lastTheirs = [...messages].reverse().find((m) => !m.mine)?.id;

  // Reading it: mark it read when you open it and whenever something new from them arrives.
  useEffect(() => {
    if (!lastTheirs) return;
    void repository.markRead(conversationId).then(() => reload(), () => undefined);
  }, [lastTheirs, repository, conversationId, reload]);

  useEffect(() => {
    if (stick.current) end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  const onScroll = () => {
    const el = document.scrollingElement;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  };
  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const back = (
    <a href="#/inbox" className="text-sm font-medium text-accent-text hover:underline">
      ← Inbox
    </a>
  );

  if (listStatus === 'loading' || (state.status === 'loading' && !conv)) {
    return (
      <div className="space-y-4">
        {back}
        <div className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" /> Loading the conversation…
        </div>
      </div>
    );
  }

  if (!conv || state.status === 'error') {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          {state.status === 'error' && conv ? (
            <div role="alert" className="space-y-3 text-sm">
              <p className="font-semibold text-ink">Couldn't load this conversation</p>
              <p className="text-ink-2">{state.message}</p>
              <Button onClick={() => void load(true)}>Try again</Button>
            </div>
          ) : (
            <EmptyState title="This conversation isn't available" compact>
              It may have been removed, or the link may be wrong.
            </EmptyState>
          )}
        </Card>
      </div>
    );
  }

  const name = conv.otherName;
  const first = name.trim().split(/\s+/)[0] || name;

  const act = async (work: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) toast({ title: done });
      await reload();
    } catch (e) {
      toast({ kind: 'error', title: 'Not changed', body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const body = cleanMessage(text);
    if (!body || sending || conv.blocked) return;
    setSending(true);
    setSendError(null);
    try {
      await repository.send(conversationId, body);
      setText('');
      stick.current = true;
      await load(false);
      void reload();
    } catch (e) {
      setSendError(describeError(e)); // what you typed stays
    } finally {
      setSending(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="space-y-2">
        {back}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            <a href={`#/people/${encodeURIComponent(conv.otherId)}`} className="hover:underline">
              {name}
            </a>
          </h1>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Conversation options">
            <Button size="sm" disabled={busy} onClick={() => void act(() => repository.setMuted(conv.id, !conv.muted), conv.muted ? 'Unmuted' : "Muted. You won't be counted on the badge.")}>
              {conv.muted ? <BellRing className="size-3.5" /> : <BellOff className="size-3.5" />} {conv.muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await repository.setArchived(conv.id, !conv.archived);
                  if (!conv.archived) navigate('inbox');
                }, conv.archived ? 'Moved back to your inbox' : 'Archived. A new message brings it back.')
              }
            >
              <Archive className="size-3.5" /> {conv.archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => setConfirm('block')}>
              <ShieldOff className="size-3.5" /> Block
            </Button>
            <Button size="sm" disabled={busy} onClick={() => setReporting(true)}>
              <Flag className="size-3.5" /> Report
            </Button>
          </div>
        </div>
      </div>

      <section aria-label={`Conversation with ${name}`} className="space-y-3">
        {messages.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-8 text-center text-sm text-muted">No messages yet. Say hello to {first}.</p>
        ) : (
          <ol className="space-y-2.5" aria-label="Messages">
            {messages.map((m) => (
              <li key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl border-2 border-ink/80 px-3.5 py-2.5 ${m.mine ? 'bg-sun-soft' : 'bg-surface'}`}>
                  {m.deleted ? (
                    <p className="text-sm italic text-muted">Message deleted</p>
                  ) : (
                    <p className="whitespace-pre-line break-words text-sm text-ink">{m.body}</p>
                  )}
                  <p className="mt-1 flex items-center justify-end gap-2 text-[11px] text-muted">
                    <time dateTime={m.createdAt}>{formatWhen(m.createdAt)}</time>
                    {m.mine && !m.deleted && (
                      <button type="button" onClick={() => setConfirm({ deleteId: m.id })} className="inline-flex items-center gap-0.5 font-semibold hover:text-bad-text" aria-label="Delete this message">
                        <Trash2 className="size-3" aria-hidden /> Delete
                      </button>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div ref={end} />
      </section>

      {conv.blocked ? (
        <p role="note" className="rounded-2xl border-2 border-ink/80 bg-lilac-soft px-4 py-3 text-sm text-ink">
          You can't message this member right now. If you blocked them, you can undo it under Requests → Blocked members.
        </p>
      ) : (
        <form onSubmit={submit} className="sticker space-y-2 bg-surface p-3" noValidate>
          <label htmlFor="chat-box" className="sr-only">
            Message
          </label>
          <textarea
            id="chat-box"
            className="field"
            rows={2}
            value={text}
            maxLength={MAX_MESSAGE}
            onChange={(e) => {
              setText(e.target.value);
              setSendError(null);
            }}
            onKeyDown={onKey}
            placeholder={`Message ${first}…`}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              <span className="num">{text.length}</span> / {MAX_MESSAGE} · Enter sends, Shift+Enter adds a line
            </p>
            <Button type="submit" variant="primary" disabled={sending || !cleanMessage(text)}>
              <Send className="size-4" /> {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
          {sendError && (
            <p role="alert" className="text-sm font-medium text-bad-text">
              {sendError}
            </p>
          )}
        </form>
      )}

      <ConfirmDialog
        open={confirm === 'block'}
        title={`Block ${name}?`}
        confirmLabel="Block"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void act(async () => {
            await repository.block(conv.otherId);
            setConfirm(null);
          }, `${name} is blocked`)
        }
      >
        <p>
          Neither of you will be able to message the other, and {first} can't send you practice requests. They won't be told. You can undo this under Requests → Blocked members.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={typeof confirm === 'object' && confirm !== null}
        title="Delete this message?"
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const id = typeof confirm === 'object' && confirm ? confirm.deleteId : '';
          void act(async () => {
            await repository.deleteMessage(id);
            setConfirm(null);
            await load(false);
          });
        }}
      >
        <p>It disappears for both of you. This can't be undone.</p>
      </ConfirmDialog>

      {reporting && (
        <ReportDialog
          name={name}
          onClose={() => setReporting(false)}
          onSend={async (reason, alsoBlock) => {
            await repository.report(conv.id, reason, alsoBlock);
            setReporting(false);
            toast({ title: 'Report sent', body: alsoBlock ? `${name} is blocked too.` : undefined });
            await reload();
          }}
        />
      )}
    </div>
  );
}
