import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import type { DraftKey, LiveView, Message, PublicExhibit } from '../../data/liveCase';
import { LIVE_EXHIBIT_LIMITS, parseSolutionExhibit } from '../../domain/bookSolution';
import { formatClock, STAGE_LABEL, STEPS } from '../../domain/liveCase';
import { tableRepeatsChart } from '../../domain/liveExhibit';
import { Button } from '../../components/ui/Button';
import { ExhibitChart } from '../caselog/ExhibitChart';
import { ExhibitNotWhole } from '../caselog/ExhibitNotWhole';
import { BucketAvatar } from '../improvement/BucketAvatar';

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

/**
 * An exhibit as the member sees it: the chart the book drew, and its table. When a chart is drawn and the table only repeats the figures the
 * chart already prints, the table is left out: it is our own transcription of the chart (the book prints the chart alone), and a real
 * candidate would not have it. A table with anything the chart does not print stays (see `tableRepeatsChart`).
 * The "values read off a chart, approximate" note describes that table's figures, so it is shown only while the table is.
 * If a cap did cut something out of this exhibit, the member is told: working an exhibit that is quietly missing a column or a panel is
 * worse than knowing it is (see `ExhibitNotWhole`).
 */
export function ExhibitView({ exhibit }: { exhibit: PublicExhibit }) {
  const normalised = useMemo(() => parseSolutionExhibit(exhibit, LIVE_EXHIBIT_LIMITS), [exhibit]);
  const showTable = exhibit.columns.length > 0 && !tableRepeatsChart(normalised);
  return (
    <figure className="space-y-2 rounded-xl border border-line bg-surface p-3.5">
      <figcaption className="text-sm font-semibold text-ink">
        {exhibit.title}
        {exhibit.approx && showTable && <span className="ml-2 text-xs font-normal text-muted">(values read off a chart, approximate)</span>}
      </figcaption>
      {exhibit.caption && <p className="text-xs text-muted">{exhibit.caption}</p>}
      <ExhibitNotWhole cut={normalised.cut} />
      {normalised.chart && <ExhibitChart exhibit={normalised} chart={normalised.chart} />}
      {showTable && (
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
  const untimed = view.mode === 'learning';
  const closing = !untimed && overall <= 120_000;
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
                {i === stepIndex && <BucketAvatar className="mr-1 inline size-4 -translate-y-px" />}
                {s.label}
              </li>
            ))}
          </ol>
        </div>
        {untimed ? (
          <p className="text-right text-xs font-semibold text-muted">Learning mode: no clock, take your time.</p>
        ) : (
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
        )}
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
        <p className="flex items-center gap-2 text-xs font-medium text-muted" role="status">
          <BucketAvatar mood="thinking" className="size-9 animate-bob" />
          <span>Bucket is replying</span>
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bump rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        </p>
      )}
      <div ref={end} />
    </div>
  );
}

function Bubble({ mine, hint = false, children }: { mine: boolean; hint?: boolean; children: string }) {
  return (
    <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <BucketAvatar mood={hint ? 'hint' : 'happy'} className="size-9 shrink-0" />}
      <p
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          mine ? 'rounded-br-md bg-accent text-accent-ink' : 'rounded-bl-md border-2 border-ink/80 bg-surface text-ink'
        }`}
      >
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
