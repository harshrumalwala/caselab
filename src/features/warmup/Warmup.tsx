import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Flame, Timer, Trophy, Zap } from 'lucide-react';
import {
  checkAnswer,
  createQuestionStream,
  createRng,
  EMPTY_ROUND,
  endOfRoundLine,
  levelFor,
  recordAnswer,
  ROUND_SECONDS,
  TOLERANCE,
  updateBest,
  type BestUpdate,
  type Level,
  type Question,
  type Rng,
  type RoundStats,
} from '../../domain/warmup';
import { Button } from '../../components/ui/Button';
import { Sparkle, Sticky } from '../../components/ui/Doodles';
import { useBest } from './useBest';

type Phase = 'intro' | 'playing' | 'done';

interface Asked {
  question: Question;
  level: Level;
}
interface Feedback {
  right: boolean;
  text: string;
}
interface Result {
  stats: RoundStats;
  line: string;
  update: BestUpdate;
}

const TICK_MS = 200;

function Stat({ label, value, icon, tone }: { label: string; value: ReactNode; icon: ReactNode; tone: string }) {
  return (
    <div className={`sticker flex items-center gap-2.5 px-3 py-2.5 sm:px-4 ${tone}`}>
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-80">{label}</p>
        <p className="num font-display text-2xl font-extrabold leading-none">{value}</p>
      </div>
    </div>
  );
}

/**
 * A 60-second mental-math sprint. Entirely optional and entirely local: the best score and streak live in this browser
 * (see useBest), nothing is saved to the account or shown to other members. `seed` makes the questions repeatable for tests.
 */
export function Warmup({ seed }: { seed?: number } = {}) {
  const [best, saveBest] = useBest();
  const [phase, setPhase] = useState<Phase>('intro');
  const [stats, setStats] = useState<RoundStats>(EMPTY_ROUND);
  const [msLeft, setMsLeft] = useState(ROUND_SECONDS * 1000);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [missed, setMissed] = useState(false); // you just missed this one: the clock waits while you read the tip
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const round = useRef(0);
  const rng = useRef<Rng>(createRng(0));
  const stream = useRef(createQuestionStream(rng.current));
  const input = useRef<HTMLInputElement>(null);

  const ask = (correctSoFar: number) =>
    setAsked({ question: stream.current.next(correctSoFar), level: levelFor(correctSoFar) });

  const start = () => {
    round.current += 1;
    rng.current = createRng((seed ?? Math.floor(Math.random() * 2 ** 31)) + round.current);
    stream.current = createQuestionStream(rng.current);
    setStats(EMPTY_ROUND);
    setMsLeft(ROUND_SECONDS * 1000);
    setFeedback(null);
    setMissed(false);
    setTyped('');
    setProblem(null);
    setResult(null);
    ask(0);
    setPhase('playing');
  };

  // The clock only runs while you are answering, not while you read what went wrong.
  const running = phase === 'playing' && !missed;
  useEffect(() => {
    if (!running) return;
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - last;
      last = now;
      setMsLeft((m) => Math.max(0, m - elapsed));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (phase !== 'playing' || msLeft > 0) return;
    const update = updateBest(best, stats);
    if (update.newScore || update.newStreak) saveBest(update.best);
    setResult({ stats, line: endOfRoundLine(stats, rng.current), update });
    setPhase('done');
  }, [phase, msLeft, stats, best, saveBest]);

  useEffect(() => {
    if (running) input.current?.focus();
  }, [running, asked]);

  const answer = (right: boolean, q: Question, level: Level) => {
    const next = recordAnswer(stats, level, right);
    setStats(next);
    setTyped('');
    setProblem(null);
    if (right) {
      setFeedback({ right: true, text: `Yes, ${q.display}. +${next.score - stats.score} points` });
      ask(next.correct);
    } else {
      setFeedback({ right: false, text: `The answer was ${q.display}.` });
      setMissed(true);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!asked || missed) return;
    const verdict = checkAnswer(asked.question, typed);
    if (verdict === 'invalid') {
      setProblem('Type a number, like 36, 4.8k or 408M.');
      return;
    }
    answer(verdict === 'correct', asked.question, asked.level);
  };

  const next = () => {
    setMissed(false);
    setFeedback(null);
    ask(stats.correct);
  };

  const seconds = Math.ceil(msLeft / 1000);

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Warm-up</h1>
        <p className="text-sm text-ink-2">
          Sixty seconds of case-style maths, for a break between cases. Optional, and mildly addictive.
        </p>
      </div>

      {phase === 'intro' && (
        <section aria-labelledby="warmup-intro" className="sticker relative bg-sun-soft p-5 sm:p-6">
          <Sparkle className="absolute right-4 top-4 size-6 text-sun" />
          <h2 id="warmup-intro" className="text-xl font-extrabold tracking-tight text-ink">
            The 60-second sprint
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
            <li>Answer as many percentages, growth, break-even and market-sizing sums as you can.</li>
            <li>
              Estimating is the job: anything within {Math.round(TOLERANCE * 100)}% counts. Type <span className="num font-semibold text-ink">36</span>,{' '}
              <span className="num font-semibold text-ink">4.8k</span> or <span className="num font-semibold text-ink">408M</span>.
            </li>
            <li>A streak earns bonus points. A miss shows you the quick way and pauses the clock while you read it.</li>
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button variant="primary" size="lg" onClick={start}>
              <Zap className="size-4" /> Start the sprint
            </Button>
            <p className="text-sm text-ink-2">
              {best.score > 0 ? (
                <>
                  Best: <span className="num font-bold text-ink">{best.score}</span> points, streak of{' '}
                  <span className="num font-bold text-ink">{best.streak}</span>
                </>
              ) : (
                'No best yet. Yours to set.'
              )}
            </p>
          </div>
          <p className="mt-4 text-xs text-ink-2">Your best is kept on this device only. Nobody else sees it.</p>
        </section>
      )}

      {phase === 'playing' && asked && (
        <>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            <Stat
              label="Time"
              value={
                <span role="timer" aria-label="Seconds left">
                  {seconds}s
                </span>
              }
              icon={<Timer className="size-5" />}
              tone="bg-sky-soft text-sky-ink"
            />
            <Stat label="Score" value={stats.score} icon={<Trophy className="size-5" />} tone="bg-teal-soft text-teal-ink" />
            <Stat label="Streak" value={stats.streak} icon={<Flame className="size-5" />} tone="bg-coral-soft text-coral-ink" />
          </div>
          <div aria-hidden className="h-2.5 overflow-hidden rounded-full border-2 border-ink/80 bg-track">
            <div
              className={`h-full transition-[width] duration-200 ease-linear motion-reduce:transition-none ${seconds <= 10 ? 'bg-coral' : 'bg-teal'}`}
              style={{ width: `${(msLeft / (ROUND_SECONDS * 1000)) * 100}%` }}
            />
          </div>

          {/* Announced politely to screen readers as well as shown. */}
          <p role="status" className="min-h-5 text-sm font-semibold text-good">
            {!missed && feedback?.right ? feedback.text : ''}
          </p>

          <section aria-label="Question" className="sticker bg-surface p-5 sm:p-6">
            <p className="eyebrow">Question {stats.correct + stats.missed + (missed ? 0 : 1)}</p>
            <p className="mt-1 font-display text-xl font-bold leading-snug text-ink sm:text-2xl">{asked.question.prompt}</p>

            {missed ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border-2 border-ink/80 bg-coral-soft px-4 py-3 text-coral-ink">
                  <p className="font-display text-base font-extrabold">{feedback?.text}</p>
                  <p className="mt-1 text-sm text-ink">
                    <span className="font-semibold">Here’s the quick way:</span> {asked.question.tip}
                  </p>
                </div>
                <Button variant="primary" onClick={next} autoFocus>
                  Next question
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4" noValidate>
                <label htmlFor="warmup-answer" className="label">
                  Your answer <span className="font-normal text-muted">({asked.question.unitHint})</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="warmup-answer"
                    ref={input}
                    className="field num text-lg"
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setProblem(null);
                    }}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    inputMode="text"
                    enterKeyHint="go"
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? 'warmup-problem' : undefined}
                  />
                  <Button type="submit" variant="primary" size="lg">
                    Check
                  </Button>
                  <Button size="lg" onClick={() => answer(false, asked.question, asked.level)}>
                    Skip
                  </Button>
                </div>
                {problem && (
                  <p id="warmup-problem" role="alert" className="mt-2 text-sm font-medium text-bad">
                    {problem}
                  </p>
                )}
              </form>
            )}
          </section>
        </>
      )}

      {phase === 'done' && result && (
        <section aria-labelledby="warmup-done" className="sticker relative bg-lilac-soft p-5 sm:p-6">
          {(result.update.newScore || result.update.newStreak) && (
            <Sticky tone="sun" tilt={5} className="absolute -top-3 right-3 sm:right-6">
              New best!
            </Sticky>
          )}
          <p className="eyebrow">Time’s up</p>
          <h2 id="warmup-done" className="mt-1 text-4xl font-extrabold tracking-tight text-ink">
            <span className="num">{result.stats.score}</span> points
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            <span className="num font-semibold text-ink">{result.stats.correct}</span> right,{' '}
            <span className="num font-semibold text-ink">{result.stats.missed}</span> missed, longest streak{' '}
            <span className="num font-semibold text-ink">{result.stats.bestStreak}</span>.
          </p>
          <p className="mt-4 font-display text-lg font-bold leading-snug text-ink">{result.line}</p>
          <p className="mt-3 text-sm text-ink-2">
            Best so far: <span className="num font-bold text-ink">{result.update.best.score}</span> points, streak of{' '}
            <span className="num font-bold text-ink">{result.update.best.streak}</span>.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={start} autoFocus>
              <Zap className="size-4" /> Go again
            </Button>
            <a
              href="#/dashboard"
              className="inline-flex h-12 items-center rounded-xl px-4 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink"
            >
              Back to the dashboard
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
