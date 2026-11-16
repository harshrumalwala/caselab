import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Shuffle, Timer } from 'lucide-react';
import { Confetti } from '../../components/ui/Motion';
import { describeError } from '../../data/errors';
import type { LiveCatalogCase, LiveMode, LiveView } from '../../data/liveCase';
import { Badge, RatingBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { chipClass } from '../../components/ui/chips';
import { groupLanes, liveCaseToInput, searchCases, type Lane } from '../../domain/liveCase';
import { SKILLS } from '../../domain/constants';
import { useData } from '../../state/DataProvider';
import { useLive } from '../../state/LiveProvider';
import { useUI } from '../../state/ui';
import { BucketSays } from './BucketSays';
import { LiveSessionScreen } from './LiveSession';
import { useLiveSession, type LiveSession } from './useLiveSession';

const OUTLINE: [string, string][] = [
  ['3 min', 'Read the prompt and ask your clarifying questions'],
  ['1:30', 'Think about your framework (no interruptions)'],
  ['3 min', 'Write it, then say where you would start'],
  ['20-25 min', 'Work through the exhibits with Bucket, who keeps the case moving'],
  ['0:30 + 1:30', 'Brainstorm, if the case has one'],
  ['0:30 + 1:30', 'Think, then write your recommendation'],
];

function CaseButton({ c, busy, hint, onStart }: { c: LiveCatalogCase; busy: boolean; hint: string; onStart: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={() => onStart(c.id)}
        className="sticker flex w-full items-start justify-between gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:bg-sun-soft disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-ink">{c.name}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {c.book} · {hint}
          </span>
        </span>
        {c.done && <Badge>Done</Badge>}
      </button>
    </li>
  );
}

function Start({ s }: { s: LiveSession }) {
  const repo = useLive();
  const [cases, setCases] = useState<LiveCatalogCase[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [by, setBy] = useState<'type' | 'industry'>('type');
  const [lane, setLane] = useState<string | null>(null);
  const [mode, setMode] = useState<LiveMode>('practice');
  const begin = (id: string | null) => void s.start(id, mode);
  useEffect(() => {
    let current = true;
    repo
      .catalog()
      .then((c) => current && setCases(c))
      .catch((e) => current && setProblem(describeError(e)));
    return () => {
      current = false;
    };
  }, [repo]);

  const lanes = useMemo(() => groupLanes(cases ?? [], by), [cases, by]);
  const open = lane ? lanes.find((l) => l.name === lane) : undefined;
  const found = useMemo(() => searchCases(cases ?? [], query), [cases, query]);
  const hintFor = (c: LiveCatalogCase) => (by === 'type' ? c.industry : c.caseType);
  /** A random case from the lane, preferring one not logged yet. */
  const surpriseIn = (l: Lane) => {
    const fresh = l.cases.filter((c) => !c.done);
    const from = fresh.length > 0 ? fresh : l.cases;
    begin(from[Math.floor(Math.random() * from.length)].id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Practise a case with Bucket</h1>
        <p className="max-w-2xl text-sm text-ink-2">
          A whole case in writing with Bucket as your interviewer, against the clock or at your own pace. You lead; Bucket answers, helps when you get stuck,
          and gives you feedback at the end.
        </p>
      </div>

      <BucketSays big mood="happy">
        Ready to case? Pick a lane below and I will find you a case, or let me surprise you!
        <span className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" disabled={s.busy || cases === null} onClick={() => begin(null)}>
            <Shuffle className="size-4" /> Surprise me with a case
          </Button>
          <span className="text-xs font-normal text-muted">Picks one you have not logged yet.</span>
        </span>
      </BucketSays>

      <section aria-labelledby="live-mode" className="space-y-2">
        <h2 id="live-mode" className="text-lg font-bold text-ink">
          Choose a mode
        </h2>
        <div role="radiogroup" aria-labelledby="live-mode" className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['learning', 'Learning', 'No clock at all. Bucket coaches as you go: hints, why each step matters, what a strong answer looks like. Nothing is scored.'],
              ['practice', 'Practice', 'Timed, but you can pause and pick up again, or end the case early and still get feedback.'],
              ['interview', 'Interview', 'The clock never stops and there is no pause and no early end. As close to the real thing as it gets.'],
            ] as const
          ).map(([id, title, text]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => setMode(id)}
              className={`sticker p-4 text-left transition ${mode === id ? 'bg-sun-soft ring-2 ring-accent' : 'hover:bg-surface-2'}`}
            >
              <span className="block font-display text-base font-bold text-ink">{title} mode</span>
              <span className="mt-1 block text-sm text-ink-2">{text}</span>
            </button>
          ))}
        </div>
      </section>

      <Card strip="sun">
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Timer className="size-5 text-accent-text" aria-hidden /> How it works
          </h2>
          <ol className="grid gap-2 sm:grid-cols-2">
            {OUTLINE.map(([time, what]) => (
              <li key={what} className="flex gap-3 text-sm">
                {mode !== 'learning' && <span className="w-20 shrink-0 font-bold tabular-nums text-ink">{time}</span>}
                <span className="text-ink-2">{what}</span>
              </li>
            ))}
          </ol>
          {mode === 'learning' ? (
            <p className="text-xs text-muted">
              These are the same steps, with no clock: take as long as you like on each, and end the case whenever you want feedback. Bucket explains as it goes and
              will show you what a strong answer looks like once you have had a go. Bucket is an AI: it follows the case's own script and does not make up data. Your
              feedback is notes to learn from, not scores, and the case is saved to your log without ratings.
            </p>
          ) : (
            <p className="text-xs text-muted">
              The clock is as long as the case has in it, 20 to 40 minutes, and starts when you see the prompt. Time you save early carries over. Bucket is
              an AI: it follows the case's own script and does not make up data. The ratings in your log are its draft from what you wrote, so you can review and
              change them.
            </p>
          )}
        </div>
      </Card>

      {s.error && (
        <p role="alert" className="text-sm font-medium text-bad-text">
          {s.error}
        </p>
      )}

      <section aria-labelledby="live-pick" className="space-y-4">
        <h2 id="live-pick" className="text-lg font-bold text-ink">
          Pick a lane
        </h2>
        {problem && (
          <p role="alert" className="text-sm font-medium text-bad-text">
            Couldn't load the cases. {problem}
          </p>
        )}
        {cases === null && !problem && (
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading cases…
          </p>
        )}
        {cases !== null && cases.length === 0 && <p className="text-sm text-ink-2">No cases are ready for live practice yet.</p>}
        {cases !== null && cases.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div role="tablist" aria-label="Group cases by" className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
                {(
                  [
                    ['type', 'By case type'],
                    ['industry', 'By industry'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={by === id}
                    onClick={() => {
                      setBy(id);
                      setLane(null);
                    }}
                    className={`rounded-lg px-4 py-2 transition ${by === id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="live-search">
                Search cases
              </label>
              <input
                id="live-search"
                className="field max-w-xs"
                placeholder="Or search by name, book or industry"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {query.trim() ? (
              found.length > 0 ? (
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {found.map((c) => (
                    <CaseButton key={c.id} c={c} busy={s.busy} onStart={begin} hint={`${c.caseType} · ${c.industry}`} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-2">No case matches that. Clear the search to pick a lane.</p>
              )
            ) : open ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={() => setLane(null)}>
                      <ArrowLeft className="size-4" /> All lanes
                    </Button>
                    <h3 className="text-base font-bold text-ink">
                      {open.name}{' '}
                      <span className="font-normal text-muted">
                        · {open.cases.length} case
                        {open.cases.length === 1 ? '' : 's'}
                      </span>
                    </h3>
                  </div>
                  <Button variant="secondary" disabled={s.busy} onClick={() => surpriseIn(open)}>
                    <Shuffle className="size-4" /> Surprise me in {open.name}
                  </Button>
                </div>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {open.cases.map((c) => (
                    <CaseButton key={c.id} c={c} busy={s.busy} onStart={begin} hint={hintFor(c)} />
                  ))}
                </ul>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lanes.map((l) => (
                  <li key={l.name}>
                    <button
                      type="button"
                      onClick={() => setLane(l.name)}
                      className="sticker flex w-full items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:bg-sun-soft"
                    >
                      <span
                        className={`flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-ink/80 font-display text-lg font-extrabold ${chipClass(l.name)}`}
                        aria-hidden
                      >
                        {l.cases.length}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{l.name}</span>
                        <span className="block text-xs text-muted">
                          {l.cases.length} case{l.cases.length === 1 ? '' : 's'}
                          {l.done > 0 ? ` · ${l.done} done` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** A case that was ended before the member said or wrote anything. */
const nothingWritten = (v: LiveView): boolean => v.submissions.length === 0 && !v.messages.some((m) => m.from === 'user');

function Finished({ s, view, onAgain }: { s: LiveSession; view: LiveView; onAgain: () => void }) {
  const { addCase } = useData();
  const { viewCase, navigate } = useUI();
  const [logError, setLogError] = useState<string | null>(null);
  const logging = useRef(false);
  /** Only a member who waited for the feedback gets the party: coming back to a finished case later is quiet. */
  const waited = useRef(!view.feedback);
  const info = view.caseInfo;
  const feedback = view.feedback;
  const empty = nothingWritten(view);
  const learning = view.mode === 'learning';

  const log = async () => {
    if (!info || !feedback || empty || view.loggedCaseId || logging.current) return;
    logging.current = true;
    setLogError(null);
    try {
      const saved = await addCase(liveCaseToInput(view, info, feedback));
      await s.markLogged(saved.id);
    } catch (e) {
      setLogError(describeError(e));
    } finally {
      logging.current = false;
    }
  };

  // The case log is filled in by itself as soon as the feedback is there.
  useEffect(() => {
    if (feedback && info && !empty && !view.loggedCaseId && !logError) void log();
  }, [feedback, info, view.loggedCaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">{view.endReason === 'time_limit' ? 'Time ran out' : view.endReason === 'ended_early' ? 'You ended the case' : 'Case finished'}</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{info ? info.name : 'Your case'}</h1>
        {info && (
          <p className="text-sm text-ink-2">
            {info.book} · {info.caseType} · {info.industry}
          </p>
        )}
      </div>

      {waited.current && feedback && !empty && view.endReason !== 'ended_early' && <Confetti />}
      <BucketSays mood={feedback ? 'cheer' : 'thinking'} big>
        {empty && feedback
          ? 'No problem, we can do this another time. Nothing was written, so there is nothing to log.'
          : feedback
            ? learning
              ? 'Nice work putting in the reps. These are notes to learn from, with no scores. They are in your log too.'
              : view.endReason === 'ended_early'
              ? 'You stopped here, and that is fine. Here is how what you did went, as honestly as I can tell it. It is in your log too.'
              : 'That is a wrap! Here is how it went, as honestly as I can tell it. Your case is in your log too.'
            : 'Give me a moment while I read through everything you wrote...'}
      </BucketSays>

      {!feedback && !s.feedbackError && view.feedbackAttempts < 3 && (
        <Card className="flex items-center gap-3" role="status">
          <Loader2 className="size-5 animate-spin text-accent-text" aria-hidden />
          <p className="text-sm text-ink-2">Bucket is writing your feedback from what you wrote. This does not count against your time.</p>
        </Card>
      )}
      {!feedback && (s.feedbackError || view.feedbackAttempts >= 3) && (
        <Card className="space-y-3">
          <p role="alert" className="text-sm font-medium text-bad-text">
            {s.feedbackError ?? 'The feedback could not be written.'} Your answers are saved.
          </p>
          {view.feedbackAttempts < 3 && (
            <Button variant="primary" onClick={() => void s.retryFeedback()}>
              Try again
            </Button>
          )}
        </Card>
      )}

      {feedback && !empty && (
        <>
          <Card strip="teal">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-ink">{learning ? 'What to take away' : 'Overall'}</h2>
                {!learning && <RatingBadge value={feedback.overall.rating} />}
              </div>
              <p className="text-sm leading-relaxed text-ink">{feedback.overall.feedback}</p>
              <p className="text-xs text-muted">
                {learning
                  ? "Bucket's notes from what you wrote. This was learning mode, so nothing is scored."
                  : "Bucket's draft from what you wrote. Behavioural skills cannot be judged from text, so they are left blank."}
              </p>
            </div>
          </Card>

          {SKILLS.some((k) => feedback.skills[k.key].feedback || feedback.skills[k.key].rating !== null) && (
            <Card className="space-y-3">
              <h2 className="text-lg font-bold text-ink">Skills</h2>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {SKILLS.filter((k) => feedback.skills[k.key].feedback || feedback.skills[k.key].rating !== null).map((k) => {
                  const f = feedback.skills[k.key];
                  return (
                    <li key={k.key} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{k.label}</p>
                        {f.feedback && <p className="mt-0.5 text-sm text-ink-2">{f.feedback}</p>}
                        {f.evidence && <p className="mt-1 text-xs italic text-muted">You wrote: “{f.evidence}”</p>}
                      </div>
                      {!learning && <RatingBadge value={f.rating} />}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card className="grid gap-5 sm:grid-cols-2">
            {[
              ['What went well', feedback.wentWell],
              ['What you struggled with', feedback.struggled],
              ['Concepts', feedback.concepts],
              ['Practise next', feedback.nextFocus],
            ]
              .filter(([, text]) => text)
              .map(([title, text]) => (
                <div key={title}>
                  <h3 className="eyebrow">{title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{text}</p>
                </div>
              ))}
          </Card>

          {feedback.debrief.length > 0 && (
            <Card className="space-y-3">
              <h2 className="text-lg font-bold text-ink">Part by part</h2>
              <ul className="space-y-3">
                {feedback.debrief.map((d) => (
                  <li key={d.stage} className="rounded-xl border border-line bg-surface p-4">
                    <p className="text-sm font-semibold text-ink">{d.stage}</p>
                    <p className="mt-1 text-sm text-ink-2">{d.observed}</p>
                    {d.toImprove && <p className="mt-1 text-sm text-ink">Next time: {d.toImprove}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {feedback.unfinished.length > 0 && (
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink">Left unfinished:</span> {feedback.unfinished.join('; ')}.
            </p>
          )}
        </>
      )}

      {logError && (
        <p role="alert" className="text-sm font-medium text-bad-text">
          Couldn't save it to your case log. {logError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {view.loggedCaseId ? (
          <>
            <p role="status" className="text-sm font-medium text-ink">
              {learning ? 'Saved to your case log, with no ratings. Add your own if you like.' : 'Saved to your case log. Check the ratings and edit anything that is off.'}
            </p>
            <Button variant="primary" onClick={() => viewCase(view.loggedCaseId!)}>
              Open the case
            </Button>
            <Button onClick={() => navigate('log')}>My Case Log</Button>
          </>
        ) : (
          feedback &&
          logError && (
            <Button variant="primary" onClick={() => void log()}>
              Save to my case log
            </Button>
          )
        )}
        <Button onClick={onAgain}>Practise another case</Button>
      </div>
    </div>
  );
}

/** A whole practice case with Bucket: start one, work through it against the clock, then read the feedback. */
export function LiveCase() {
  const repo = useLive();
  const { mode } = useData();
  const s = useLiveSession(repo);
  const [startingAgain, setStartingAgain] = useState(false);

  // Opening the tab after a case is over starts afresh: its feedback is in the case log. Only a case still waiting for its feedback, or
  // for its place in the log, is shown again, so nothing is lost.
  const checked = useRef(false);
  useEffect(() => {
    if (s.loading || checked.current) return;
    checked.current = true;
    const v = s.view;
    if (v && v.status === 'done' && v.feedback && (v.loggedCaseId || nothingWritten(v))) setStartingAgain(true);
  }, [s.loading, s.view]);

  if (mode === 'demo') {
    return (
      <Card className="max-w-xl space-y-2">
        <h1 className="text-2xl font-extrabold text-ink">Practise a case with Bucket</h1>
        <p className="text-sm text-ink-2">The live case isn't available in demo mode. Sign in to your own account to try it.</p>
      </Card>
    );
  }
  if (s.loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted" role="status">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  }
  const view = s.view;
  if (view && view.status === 'active') return <LiveSessionScreen s={s} view={view} />;
  if (view && view.status === 'done' && !startingAgain) return <Finished s={s} view={view} onAgain={() => setStartingAgain(true)} />;
  return (
    <Start
      s={{
        ...s,
        start: async (id, mode) => {
          setStartingAgain(false);
          await s.start(id, mode);
        },
      }}
    />
  );
}
