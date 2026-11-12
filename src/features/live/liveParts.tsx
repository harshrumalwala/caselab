import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { DraftKey, LiveView, Message, PublicExhibit } from '../../data/liveCase';
import { parseBookSolution } from '../../domain/bookSolution';
import { formatClock, STAGE_LABEL, STEPS } from '../../domain/liveCase';
import { Button } from '../../components/ui/Button';
import { ExhibitChart } from '../caselog/ExhibitChart';

/** Saves what is typed a moment after typing stops, and once more when the box goes away, so a refresh or a timeout never loses a draft. */
export function useAutosave(value: string, save: (text: string) => void, delayMs = 1000): void {
  const latest = useRef(value);
  const saved = useRef(value);
  const saver = useRef(save);
  saver.current = save;
  latest.current = value;
  useEffect(() => {
    if (value === saved.current) return;
    const timer = window.setTimeout(() => {
      saved.current = value;
      saver.current(value);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  useEffect(
    () => () => {
      if (latest.current !== saved.current) saver.current(latest.current);
    },
    [],
  );
}

/** An exhibit as the member sees it: its figures and the chart the book drew, drawn from what the case has shown so far. */
export function ExhibitView({ exhibit }: { exhibit: PublicExhibit }) {
  const normalised = useMemo(
    () => parseBookSolution({ prompt: 'x', exhibits: [{ title: exhibit.title, caption: exhibit.caption, columns: exhibit.columns, rows: exhibit.rows, approx: exhibit.approx, chart: exhibit.chart, howToRead: '', takeaways: [] }] })?.exhibits[0],
    [exhibit],
  );
  return (
    <figure className="space-y-2 rounded-xl border border-line bg-surface p-3.5">
      <figcaption className="text-sm font-semibold text-ink">
        {exhibit.title}
        {exhibit.approx && <span className="ml-2 text-xs font-normal text-muted">(values read off a chart, approximate)</span>}
      </figcaption>
      {exhibit.caption && <p className="text-xs text-muted">{exhibit.caption}</p>}
      {normalised?.chart && <ExhibitChart exhibit={normalised} chart={normalised.chart} />}
      {exhibit.columns.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-muted">
              <tr>
                {exhibit.columns.map((c, i) => (
                  <th key={`${i}-${c}`} scope="col" className="px-3 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {exhibit.rows.map((r, ri) => (
                <tr key={ri}>
                  {exhibit.columns.map((_, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-ink">
                      {r[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

/** The two clocks, the stage, and the steps of the case. */
export function ClockBar({ view, now }: { view: LiveView; now: number }) {
  const overall = view.endsAt - now;
  const stage = view.stageEndsAt - now;
  const closing = overall <= 120_000;
  const stepIndex = STEPS.findIndex((s) => s.stages.includes(view.stage));
  return (
    <div className="sticky top-0 z-30 -mx-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="eyebrow">{STAGE_LABEL[view.stage]}</p>
          <ol className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Steps of the case">
            {STEPS.filter((s) => s.id !== 'brainstorm' || view.hasBrainstorm).map((s, i) => (
              <li
                key={s.id}
                aria-current={i === stepIndex ? 'step' : undefined}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${i === stepIndex ? 'border-accent bg-accent text-accent-ink' : i < stepIndex ? 'border-line bg-surface-2 text-ink-2' : 'border-line text-muted'}`}
              >
                {s.label}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex items-end gap-5 text-right">
          <div>
            <p className="eyebrow">This part</p>
            <p className={`num text-xl font-extrabold tabular-nums ${stage <= 30_000 ? 'text-bad-text' : 'text-ink'}`} role="timer" aria-label="Time left in this part">
              {formatClock(stage)}
            </p>
          </div>
          <div>
            <p className="eyebrow">Time left</p>
            <p className={`num text-3xl font-extrabold tabular-nums ${closing ? 'text-bad-text' : 'text-ink'}`} role="timer" aria-label="Time left in the case">
              {formatClock(overall)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** What was said, in order. The case prompt, exhibits and notices stand apart from the conversation. */
export function Thread({ messages, pending, typing }: { messages: Message[]; pending: string | null; typing: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.length, pending, typing]);
  return (
    <div className="space-y-3" aria-live="polite" aria-label="Conversation">
      {messages.map((m) =>
        m.kind === 'notice' || m.kind === 'exhibit' ? (
          <p key={m.id} className={`whitespace-pre-line rounded-xl px-4 py-3 text-sm leading-relaxed ${m.id === 1 ? 'border-2 border-ink/80 bg-sun-soft font-medium text-ink' : 'bg-surface-2 text-ink-2'}`}>
            {m.text}
          </p>
        ) : (
          <Bubble key={m.id} mine={m.from === 'user'} hint={m.kind === 'hint'}>
            {m.text}
          </Bubble>
        ),
      )}
      {pending && <Bubble mine>{pending}</Bubble>}
      {typing && (
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          <Loader2 className="size-3.5 animate-spin" /> Bucket is replying…
        </p>
      )}
      <div ref={end} />
    </div>
  );
}

function Bubble({ mine, hint = false, children }: { mine: boolean; hint?: boolean; children: string }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${mine ? 'bg-accent text-accent-ink' : 'border border-line bg-surface text-ink'}`}>
        {!mine && <span className="mb-0.5 block text-xs font-bold text-accent-text">{hint ? 'Bucket (a hint)' : 'Bucket'}</span>}
        {children}
      </p>
    </div>
  );
}

/** One line to say something to Bucket. Enter sends; Shift+Enter starts a new line. */
export function ChatInput({
  draftKey,
  initial,
  label,
  placeholder,
  busy,
  onSend,
  onDraft,
  extra,
}: {
  draftKey: DraftKey;
  initial: string;
  label: string;
  placeholder: string;
  busy: boolean;
  onSend: (text: string) => void;
  onDraft: (key: DraftKey, text: string) => void;
  extra?: React.ReactNode;
}) {
  const [text, setText] = useState(initial);
  useAutosave(text, (t) => onDraft(draftKey, t));
  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    onSend(t);
  };
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        send();
      }}
      className="space-y-2"
    >
      <label htmlFor={`live-${draftKey}`} className="label">
        {label}
      </label>
      <textarea
        id={`live-${draftKey}`}
        className="field min-h-24 resize-y"
        value={text}
        placeholder={placeholder}
        maxLength={4000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">{extra}</div>
        <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
          <Send className="size-4" /> Send
        </Button>
      </div>
    </form>
  );
}

/** A box for a written response of its own (framework, brainstorm, recommendation), handed in with a button. */
export function WriteBox({
  draftKey,
  initial,
  label,
  placeholder,
  submitLabel,
  busy,
  onSubmit,
  onDraft,
}: {
  draftKey: DraftKey;
  initial: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (text: string) => void;
  onDraft: (key: DraftKey, text: string) => void;
}) {
  const [text, setText] = useState(initial);
  useAutosave(text, (t) => onDraft(draftKey, t));
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (text.trim() && !busy) onSubmit(text.trim());
      }}
      className="space-y-2"
    >
      <label htmlFor={`live-${draftKey}`} className="label">
        {label}
      </label>
      <textarea id={`live-${draftKey}`} className="field min-h-48 resize-y" value={text} placeholder={placeholder} maxLength={4000} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">Saved as you type. If time runs out, what is here is kept as an unfinished draft.</p>
        <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** A private place to jot things down while thinking. It is kept apart from the framework you hand in. */
export function Scratchpad({ initial, onSave }: { initial: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  useAutosave(text, onSave);
  return (
    <div className="space-y-2">
      <label htmlFor="live-scratchpad" className="label">
        Scratchpad <span className="font-normal text-muted">(private notes, not handed in)</span>
      </label>
      <textarea id="live-scratchpad" className="field min-h-40 resize-y" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="Jot down anything that helps you think." />
    </div>
  );
}
