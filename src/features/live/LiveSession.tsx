import { Brain, Clock } from 'lucide-react';
import type { LiveView } from '../../data/liveCase';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { isThinking } from '../../domain/liveCase';
import { ChatInput, ClockBar, ExhibitView, Scratchpad, Thread, WriteBox } from './liveParts';
import type { LiveSession } from './useLiveSession';

const THINK_TEXT: Record<string, { title: string; body: string }> = {
  framework_think: { title: 'Think about your structure', body: 'Take this time to think. Bucket will not interrupt and will not suggest anything. Use the scratchpad if it helps.' },
  brainstorm_think: { title: 'Think about the brainstorm', body: 'Take a moment to think before you write. Bucket will not interrupt.' },
  recommend_think: { title: 'Think about your recommendation', body: 'Pull together what you have worked through. Bucket will not interrupt or fill in any gaps.' },
};

const WRITE_TEXT: Record<string, { label: string; placeholder: string; submit: string; key: 'framework' | 'brainstorm' | 'recommendation' }> = {
  framework_write: { label: 'Your framework', placeholder: 'Write your framework. Next, tell Bucket where you would start.', submit: 'Hand in framework', key: 'framework' },
  brainstorm_write: { label: 'Your ideas', placeholder: 'Write your ideas.', submit: 'Hand in ideas', key: 'brainstorm' },
  recommend_write: { label: 'Your recommendation', placeholder: 'Answer first, then the reasons, the risks and your next steps.', submit: 'Hand in recommendation', key: 'recommendation' },
};

/** What the member has done so far, to look back at while writing the recommendation. */
function WorkSoFar({ view }: { view: LiveView }) {
  const sub = (kind: string) => view.submissions.find((s) => s.kind === kind);
  const framework = sub('framework');
  const direction = sub('direction');
  const brainstorm = sub('brainstorm');
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">Your work so far</summary>
      <div className="mt-3 space-y-4 text-sm">
        {framework && (
          <section>
            <h4 className="eyebrow">Your framework</h4>
            <p className="mt-1 whitespace-pre-wrap text-ink">{framework.text}</p>
          </section>
        )}
        {direction && (
          <section>
            <h4 className="eyebrow">Where you started</h4>
            <p className="mt-1 whitespace-pre-wrap text-ink">{direction.text}</p>
          </section>
        )}
        {view.exhibits.map((e) => (
          <ExhibitView key={e.beat} exhibit={e} />
        ))}
        {brainstorm && (
          <section>
            <h4 className="eyebrow">Your brainstorm</h4>
            <p className="mt-1 whitespace-pre-wrap text-ink">{brainstorm.text}</p>
          </section>
        )}
      </div>
    </details>
  );
}

export function LiveSessionScreen({ s, view }: { s: LiveSession; view: LiveView }) {
  const { now, busy, pending } = s;
  const stageLeft = view.stageEndsAt - now;
  const key = `${view.stage}-${view.frameworkPhase}`;
  const latest = view.exhibits.at(-1);
  const earlier = view.exhibits.slice(0, -1);
  const writing = WRITE_TEXT[view.stage];
  const thinking = THINK_TEXT[view.stage];
  const thread = view.messages;

  const warning =
    view.stage === 'prompt' && stageLeft <= 20_000
      ? `Framework thinking starts in ${Math.max(0, Math.ceil(stageLeft / 1000))} seconds. Choose "Ready for framework" now if you are ready.`
      : writing && stageLeft <= 30_000
        ? `${Math.max(0, Math.ceil(stageLeft / 1000))} seconds left. What you have written is saved.`
        : null;

  return (
    <div className="space-y-5">
      <ClockBar view={view} now={now} />

      {warning && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-line bg-sun-soft px-4 py-2.5 text-sm font-semibold text-ink">
          <Clock className="size-4" aria-hidden /> {warning}
        </p>
      )}
      {s.error && (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad-soft px-4 py-2.5 text-sm font-medium text-bad-text">
          {s.error}
        </p>
      )}

      {view.stage === 'prompt' && (
        <div key={key} className="space-y-4">
          <Thread messages={thread} pending={pending} typing={busy && Boolean(pending)} />
          <ChatInput
            draftKey="clarify"
            initial={view.drafts.clarify ?? ''}
            label="Ask a clarifying question"
            placeholder="What would you like to know before you structure your answer?"
            busy={busy}
            onSend={(t) => void s.say(t)}
            onDraft={(k, t) => void s.saveDraft(k, t)}
            extra={
              <Button variant="secondary" onClick={() => void s.ready()} disabled={busy}>
                Ready for framework
              </Button>
            }
          />
          <p className="text-xs text-muted">
            {view.clarifyCount} question{view.clarifyCount === 1 ? '' : 's'} asked. Three or four is plenty. Time you save carries over to later parts.
          </p>
        </div>
      )}

      {thinking && (
        <Card key={key} className="space-y-4">
          <div className="flex items-start gap-3">
            <Brain className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
            <div>
              <h2 className="text-lg font-bold text-ink">{thinking.title}</h2>
              <p className="mt-1 text-sm text-ink-2">{thinking.body}</p>
            </div>
          </div>
          {view.stage === 'framework_think' && <Scratchpad initial={view.scratchpad} onSave={(t) => void s.saveScratchpad(t)} />}
          {view.stage === 'recommend_think' && <WorkSoFar view={view} />}
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => void s.ready()} disabled={busy}>
              Ready to write
            </Button>
          </div>
        </Card>
      )}

      {view.stage === 'framework_write' && view.frameworkPhase === 'framework' && writing && (
        <div key={key} className="space-y-4">
          <WriteBox
            draftKey="framework"
            initial={view.drafts.framework ?? ''}
            label={writing.label}
            placeholder={writing.placeholder}
            submitLabel={writing.submit}
            busy={busy}
            onSubmit={(t) => void s.submit(t)}
            onDraft={(k, t) => void s.saveDraft(k, t)}
          />
          {view.scratchpad && (
            <details className="rounded-2xl border border-line bg-surface p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink">Your scratchpad</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{view.scratchpad}</p>
            </details>
          )}
        </div>
      )}

      {view.stage === 'framework_write' && view.frameworkPhase === 'direction' && (
        <div key={key} className="space-y-4">
          <Thread messages={thread.filter((m) => m.stage === 'framework_write')} pending={pending} typing={busy && Boolean(pending)} />
          <ChatInput
            draftKey="direction"
            initial={view.drafts.direction ?? ''}
            label="Where would you start?"
            placeholder="Where would you start, and what would you want to understand first?"
            busy={busy}
            onSend={(t) => void s.say(t)}
            onDraft={(k, t) => void s.saveDraft(k, t)}
          />
        </div>
      )}

      {view.stage === 'exhibits' && (
        <div key={key} className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
          {/* The exhibit stays in view while the conversation grows, so it never has to be scrolled back to. */}
          {latest && (
            <section
              aria-label="The exhibit on the table"
              className="sticky top-[7.5rem] z-20 max-h-[42vh] space-y-3 overflow-y-auto bg-bg pb-2 lg:top-28 lg:max-h-[calc(100vh-8rem)]"
            >
              <h2 className="eyebrow">
                Exhibit {latest.beat + 1} of {view.beatsTotal}
              </h2>
              <ExhibitView exhibit={latest} />
              {earlier.length > 0 && (
                <details className="rounded-2xl border border-line bg-surface p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">Earlier exhibits ({earlier.length})</summary>
                  <div className="mt-3 space-y-4">
                    {earlier.map((e) => (
                      <ExhibitView key={e.beat} exhibit={e} />
                    ))}
                  </div>
                </details>
              )}
            </section>
          )}
          <div className="space-y-4">
            <Thread messages={thread.filter((m) => m.stage === 'exhibits')} pending={pending} typing={busy && Boolean(pending)} />
            <ChatInput
              draftKey="exhibit"
              initial={view.drafts.exhibit ?? ''}
              label="Your thinking"
              placeholder="What do you notice? Show your calculations, then what it means for the client and what you would do next."
              busy={busy}
              onSend={(t) => void s.say(t)}
              onDraft={(k, t) => void s.saveDraft(k, t)}
            />
          </div>
        </div>
      )}

      {(view.stage === 'brainstorm_write' || view.stage === 'recommend_write') && writing && (
        <div key={key} className="space-y-4">
          <WriteBox
            draftKey={writing.key}
            initial={view.drafts[writing.key] ?? ''}
            label={writing.label}
            placeholder={writing.placeholder}
            submitLabel={writing.submit}
            busy={busy}
            onSubmit={(t) => void s.submit(t)}
            onDraft={(k, t) => void s.saveDraft(k, t)}
          />
          {view.stage === 'recommend_write' && <WorkSoFar view={view} />}
        </div>
      )}

      {!isThinking(view.stage) && view.stage !== 'done' && <p className="text-xs text-muted">Your answers are saved as you go. If you leave and come back, the clock keeps running and you will pick up where the case is.</p>}
    </div>
  );
}
