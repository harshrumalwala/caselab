import { useState } from 'react';
import { Brain, Clock, Pause, Play } from 'lucide-react';
import type { LiveView } from '../../data/liveCase';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { bucketLine, formatClock, isThinking } from '../../domain/liveCase';
import { BucketSays } from './BucketSays';
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

/** Pause and end, always within reach: a break is allowed, and so is stopping here and getting feedback on what is written. A learning case has no clock, so it has nothing to pause. */
function CaseControls({ s, untimed = false }: { s: LiveSession; untimed?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div role="group" aria-label="End the case" className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <span className="font-medium text-ink">End the case here and get feedback on what you have written?</span>
        <Button variant="danger" size="sm" disabled={s.busy} onClick={() => void s.end()}>
          Yes, end it
        </Button>
        <Button size="sm" onClick={() => setConfirming(false)}>
          Keep going
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!untimed && (
        <Button size="sm" disabled={s.busy} onClick={() => void s.pause()} title="Stops the clock until you continue">
          <Pause className="size-3.5" aria-hidden /> Pause
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={s.busy} onClick={() => setConfirming(true)}>
        End case
      </Button>
    </div>
  );
}

/** The case on hold: the clock is stopped and the work is hidden, so a pause is a rest and not extra time to think. */
function PausedScreen({ s, view }: { s: LiveSession; view: LiveView }) {
  const [confirming, setConfirming] = useState(false);
  const left = view.endsAt - (view.pausedAt ?? view.serverNow);
  return (
    <div className="mx-auto max-w-2xl space-y-5 pt-4">
      <BucketSays mood="thinking" big>
        Paused. The clock is stopped, and your work is saved. Take a breather, and tell me when you are ready to carry on.
      </BucketSays>
      {s.error && (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad-soft px-4 py-2.5 text-sm font-medium text-bad-text">
          {s.error}
        </p>
      )}
      <Card className="space-y-4" strip="sun">
        <div>
          <p className="eyebrow">Time left in the case</p>
          <p className="num text-4xl font-extrabold tabular-nums text-ink" role="timer" aria-label="Time left in the case">
            {formatClock(left)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" disabled={s.busy} onClick={() => void s.unpause()}>
            <Play className="size-4" aria-hidden /> Continue
          </Button>
          {confirming ? (
            <span role="group" aria-label="End the case" className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-ink">End it here and get feedback?</span>
              <Button variant="danger" size="sm" disabled={s.busy} onClick={() => void s.end()}>
                Yes, end it
              </Button>
              <Button size="sm" onClick={() => setConfirming(false)}>
                Keep it paused
              </Button>
            </span>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              End case
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export function LiveSessionScreen({ s, view }: { s: LiveSession; view: LiveView }) {
  if (view.pausedAt != null) return <PausedScreen s={s} view={view} />;
  return <RunningCase s={s} view={view} />;
}

function RunningCase({ s, view }: { s: LiveSession; view: LiveView }) {
  const { now, busy, pending } = s;
  const stageLeft = view.stageEndsAt - now;
  const key = `${view.stage}-${view.frameworkPhase}`;
  // What is on the table right now. Some parts of a case are an exhibit; the rest are talked through, and then the exhibits already
  // handed over move into the fold, where they stay within reach.
  const onTable = view.exhibits.find((e) => e.beat === view.beatsShown - 1);
  const earlier = view.exhibits.filter((e) => e !== onTable);
  const writing = WRITE_TEXT[view.stage];
  const thinking = THINK_TEXT[view.stage];
  const thread = view.messages;

  const untimed = view.mode === 'learning';

  // The member has written something about the exhibit on the table, so moving on is theirs to choose. In learning mode it is theirs either
  // way: the member sets the pace, and someone who does not know how to start on an exhibit can move past it.
  const lastExhibitAt = view.messages.map((m) => m.kind).lastIndexOf('exhibit');
  const saidSomething = view.messages.slice(lastExhibitAt + 1).some((m) => m.from === 'user');
  const sayFirst = !untimed && !saidSomething;
  const lastBeat = view.beatsShown >= view.beatsTotal;
  const moveOnLabel = untimed
    ? lastBeat
      ? 'Move on from this section'
      : 'Move on'
    : lastBeat
      ? 'Done with this section'
      : onTable
        ? "I'm done with this exhibit"
        : "I'm done with this part";

  const bucket = bucketLine(view, now, view.messages.at(-1)?.kind === 'hint');
  const says = <BucketSays mood={bucket.mood}>{bucket.text}</BucketSays>;

  const warning = untimed
    ? null
    : view.stage === 'prompt' && stageLeft <= 20_000
      ? `Framework thinking starts in ${Math.max(0, Math.ceil(stageLeft / 1000))} seconds. Choose "Ready for framework" now if you are ready.`
      : writing && stageLeft <= 30_000
        ? `${Math.max(0, Math.ceil(stageLeft / 1000))} seconds left. What you have written is saved.`
        : null;

  return (
    <div className="space-y-5">
      <ClockBar view={view} now={now} />
      {view.mode === 'interview' ? <p className="text-right text-xs font-semibold text-muted">Interview mode: the clock does not stop.</p> : <CaseControls s={s} untimed={untimed} />}

      {view.stage !== 'exhibits' && says}

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
            {view.clarifyCount} question{view.clarifyCount === 1 ? '' : 's'} asked. Three or four is plenty.{untimed ? '' : ' Time you save carries over to later parts.'}
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
          {view.exhibits.length > 0 && (
            <section
              aria-label={onTable ? 'The exhibit on the table' : 'The exhibits you have been given'}
              className="sticky top-[7.5rem] z-20 max-h-[42vh] space-y-3 overflow-y-auto bg-bg pb-2 lg:top-28 lg:max-h-[calc(100vh-8rem)]"
            >
              {onTable ? (
                <>
                  <h2 className="eyebrow">
                    Exhibit {view.exhibits.indexOf(onTable) + 1} of {view.exhibitsTotal}
                  </h2>
                  <ExhibitView exhibit={onTable} />
                </>
              ) : (
                <h2 className="eyebrow">Exhibits so far</h2>
              )}
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
            {says}
            <Thread messages={thread.filter((m) => m.stage === 'exhibits')} pending={pending} typing={busy && Boolean(pending)} />
            <ChatInput
              draftKey="exhibit"
              initial={view.drafts.exhibit ?? ''}
              label="Your thinking"
              placeholder="What do you notice? Show your calculations, then what it means for the client and what you would do next."
              busy={busy}
              onSend={(t) => void s.say(t)}
              onDraft={(k, t) => void s.saveDraft(k, t)}
              extra={
                <Button variant="secondary" onClick={() => void s.next()} disabled={busy || sayFirst} title={sayFirst ? 'Tell Bucket what you make of it first' : undefined}>
                  {moveOnLabel}
                </Button>
              }
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

      {!isThinking(view.stage) && view.stage !== 'done' && <p className="text-xs text-muted">Your answers are saved as you go. If you leave and come back, {untimed ? 'you will pick up where you left off.' : 'the clock keeps running and you will pick up where the case is.'}</p>}
    </div>
  );
}
