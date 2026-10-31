import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Calculator, Flame, Target, Timer, Trophy, Zap } from 'lucide-react';
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
import { useWarmupSync } from '../../state/warmupSync';
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
/** A question you got wrong or skipped, kept for the review at the end. `said` is what you typed, or null if you skipped. */
interface Miss {
  question: Question;
  said: string | null;
}
interface Result {
  stats: RoundStats;
  misses: Miss[];
  line: string;
  update: BestUpdate;
}

const TICK_MS = 200;

/** A scoreboard tile. `bumpKey` makes the number pop each time it changes; `iconClass` can animate the icon. */
function Stat({
  label,
  value,
  icon,
  tone,
  bumpKey,
  iconClass = '',
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone: string;
  bumpKey?: number;
  iconClass?: string;
}) {
  return (
    <div className={`sticker flex items-center gap-2.5 px-3 py-2.5 sm:px-4 ${tone}`}>
      <span aria-hidden className={`shrink-0 ${iconClass}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-80">{label}</p>
        <p key={bumpKey} className={`num inline-block origin-left font-display text-2xl font-extrabold leading-none ${bumpKey ? 'animate-bump' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

/**
 * A 60-second mental-math sprint. Entirely optional. The best score and streak are private to you: kept with your account
 * (see useBest), or in this browser only in demo mode, and never shown to other members. `seed` makes the questions repeatable for tests.
 */
export function Warmup({ seed }: { seed?: number } = {}) {
  const [best, saveBest] = useBest();
  const onAccount = useWarmupSync() !== null;
  const [phase, setPhase] = useState<Phase>('intro');
  const [stats, setStats] = useState<RoundStats>(EMPTY_ROUND);
  const [msLeft, setMsLeft] = useState(ROUND_SECONDS * 1000);
  const [asked, setAsked] = useState<Asked | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [misses, setMisses] = useState<Miss[]>([]);
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
    setMisses([]);
    setTyped('');
    setProblem(null);
    setResult(null);
    ask(0);
    setPhase('playing');
  };

  // A flat 60 seconds: the clock never waits. What you missed is reviewed at the end.
  const running = phase === 'playing';
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
    setResult({ stats, misses, line: endOfRoundLine(stats, rng.current), update });
    setPhase('done');
  }, [phase, msLeft, stats, misses, best, saveBest]);

  useEffect(() => {
    if (running) input.current?.focus();
  }, [running, asked]);

  const answer = (right: boolean, q: Question, level: Level, said: string | null) => {
    const next = recordAnswer(stats, level, right);
    setStats(next);
    setTyped('');
    setProblem(null);
    if (right) {
      setFeedback({ right: true, text: `Yes, ${q.display}. +${next.score - stats.score} points` });
    } else {
      setFeedback({ right: false, text: said === null ? 'Skipped. On to the next.' : 'Missed. On to the next.' });
      setMisses((m) => [...m, { question: q, said }]);
    }
    ask(next.correct);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!asked) return;
    const verdict = checkAnswer(asked.question, typed);
    if (verdict === 'invalid') {
      setProblem('Type a number, like 36, 4.8k or 408M.');
      return;
    }
    answer(verdict === 'correct', asked.question, asked.level, typed.trim());
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
        <section aria-labelledby="warmup-intro" className="sticker relative overflow-hidden bg-sun-soft p-5 text-center sm:p-8">
          <Sparkle className="absolute left-5 top-5 size-5 text-coral" />
          <Sparkle className="absolute right-6 top-8 size-6 text-sun" />
          <Sparkle className="absolute bottom-6 right-10 size-4 text-lilac" />
          <p className="eyebrow !text-ink-2">Ready when you are</p>
          <h2 id="warmup-intro" className="mt-1 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            The 60-second sprint
          </h2>

          <ul className="mx-auto mt-5 grid max-w-xl gap-3 text-left text-sm sm:grid-cols-3">
            <li className="rounded-xl border-2 border-ink/80 bg-surface p-3 text-ink-2">
              <Calculator className="size-5 text-coral" aria-hidden />
              <span className="mt-1.5 block">Percentages, growth, break-even and market-sizing sums. As many as you can.</span>
            </li>
            <li className="rounded-xl border-2 border-ink/80 bg-surface p-3 text-ink-2">
              <Target className="size-5 text-teal" aria-hidden />
              <span className="mt-1.5 block">
                Estimating is the job: anything within {Math.round(TOLERANCE * 100)}% counts. Type <span className="num font-semibold text-ink">36</span>,{' '}
                <span className="num font-semibold text-ink">4.8k</span> or <span className="num font-semibold text-ink">408M</span>.
              </span>
            </li>
            <li className="rounded-xl border-2 border-ink/80 bg-surface p-3 text-ink-2">
              <Flame className="size-5 text-lilac" aria-hidden />
              <span className="mt-1.5 block">A streak earns bonus points. The clock never stops: misses wait for you at the end, with the quick way to do each.</span>
            </li>
          </ul>

          <div className="mt-6 flex flex-col items-center gap-5">
            <Button variant="primary" size="lg" className="!h-14 px-10 text-base" onClick={start}>
              <Zap className="size-5" /> Start the sprint
            </Button>
            <div className="sticker -rotate-2 bg-surface px-5 py-3 text-ink">
              <Trophy className="mx-auto size-5 text-sun-ink" aria-hidden />
              <p className="mt-1 text-sm">
                {best.score > 0 ? (
                  <>
                    Best: <span className="num font-display text-2xl font-extrabold">{best.score}</span> points, streak of{' '}
                    <span className="num font-bold">{best.streak}</span>
                  </>
                ) : (
                  'No best yet. Yours to set.'
                )}
              </p>
            </div>
          </div>
          <p className="mt-5 text-xs text-ink-2">
            {onAccount
              ? 'Your best is saved with your account, so it follows you to any device. Nobody else sees it.'
              : 'Your best is kept on this device only. Nobody else sees it.'}
          </p>
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
            <Stat label="Score" value={stats.score} bumpKey={stats.score} icon={<Trophy className="size-5" />} tone="bg-teal-soft text-teal-ink" />
            <Stat
              label="Streak"
              value={stats.streak}
              bumpKey={stats.streak}
              icon={<Flame className="size-5" />}
              iconClass={stats.streak >= 3 ? 'animate-flame' : ''}
              tone="bg-coral-soft text-coral-ink"
            />
          </div>
          <div aria-hidden className="h-2.5 overflow-hidden rounded-full border-2 border-ink/80 bg-track">
            <div
              className={`h-full transition-[width] duration-200 ease-linear motion-reduce:transition-none ${seconds <= 10 ? 'bg-coral' : 'bg-teal'}`}
              style={{ width: `${(msLeft / (ROUND_SECONDS * 1000)) * 100}%` }}
            />
          </div>

          {/* Announced politely to screen readers as well as shown. */}
          <p key={feedback?.text} role="status" className={`min-h-5 text-sm font-semibold ${feedback ? 'animate-rise' : ''} ${feedback?.right ? 'text-good-text' : 'text-coral-ink'}`}>
            {feedback?.text ?? ''}
          </p>

          <section aria-label="Question" className="sticker bg-surface p-5 sm:p-6">
            <p className="eyebrow">Question {stats.correct + stats.missed + 1}</p>
            <p className="mt-1 font-display text-xl font-bold leading-snug text-ink sm:text-2xl">{asked.question.prompt}</p>

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
                <Button size="lg" onClick={() => answer(false, asked.question, asked.level, null)}>
                  Skip
                </Button>
              </div>
              {problem && (
                <p id="warmup-problem" role="alert" className="mt-2 text-sm font-medium text-bad-text">
                  {problem}
                </p>
              )}
            </form>
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
          {result.stats.correct > 0 && result.misses.length === 0 && (
            <p className="mt-3 text-sm font-semibold text-good-text">Nothing to review: a clean sheet.</p>
          )}
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

      {phase === 'done' && result && result.misses.length > 0 && (
        <section aria-labelledby="warmup-review" className="sticker bg-surface p-5 sm:p-6">
          <h2 id="warmup-review" className="text-xl font-extrabold tracking-tight text-ink">
            Review your misses <span className="num text-muted">({result.misses.length})</span>
          </h2>
          <p className="mt-1 text-sm text-ink-2">Here’s the quick way to each one, now that the clock has stopped.</p>
          <ol className="mt-4 space-y-3">
            {result.misses.map((m, i) => (
              <li key={i} className="rounded-xl border-2 border-ink/80 bg-coral-soft px-4 py-3 text-ink">
                <p className="font-display text-base font-bold leading-snug">{m.question.prompt}</p>
                <p className="mt-1 text-sm">
                  <span className="text-ink-2">{m.said ? `You said ${m.said}.` : 'You skipped it.'}</span>{' '}
                  <span className="font-bold">Answer: {m.question.display}.</span>
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold">Quick way:</span> {m.question.tip}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
