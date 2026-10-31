import { useState } from 'react';
import { ArrowRight, Flame, Plus, Target } from 'lucide-react';
import { describeError } from '../../data/errors';
import { goalProgress, GOAL_CHOICES, type GoalProgress } from '../../domain/goal';
import { needsWarmup, type Suggestion } from '../../domain/suggestions';
import type { CaseRecord } from '../../domain/types';
import { Button } from '../../components/ui/Button';
import { Sparkle } from '../../components/ui/Doodles';
import { WarmupLink } from '../warmup/WarmupLink';
import { useGrowIn } from '../../state/motion';
import { useGoal } from '../../state/GoalProvider';
import { useToast } from '../../state/ToastProvider';
import { useUI } from '../../state/ui';

/** What this week looks like and the one thing to do next, so the dashboard opens with an answer before the charts. */
function weekLine(n: number): string {
  if (n === 0) return 'No cases yet this week. A quick one counts.';
  if (n === 1) return 'One case this week. The streak starts here.';
  if (n < 4) return `${n} cases this week. Nice rhythm.`;
  return `${n} cases this week. Someone is on a roll.`;
}

function goalLine(p: GoalProgress): string {
  if (p.met) return p.count > p.goal ? `Goal hit, and then some: ${p.count} of ${p.goal}.` : `Goal hit: ${p.count} of ${p.goal}. Go get a coffee.`;
  if (p.count === 0) return `Goal: ${p.goal} this week. Nothing yet, plenty of week left.`;
  return `${p.count} of ${p.goal} this week. ${p.remaining} to go.`;
}

const RADIUS = 30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** A ring that fills as the week's cases add up to the goal. */
function GoalRing({ progress }: { progress: GoalProgress }) {
  const shown = useGrowIn(progress.pct);
  return (
    <div className="relative size-20 shrink-0" role="img" aria-label={`${progress.count} of ${progress.goal} cases this week`}>
      <svg viewBox="0 0 72 72" className="size-full -rotate-90" aria-hidden>
        <circle cx="36" cy="36" r={RADIUS} fill="none" strokeWidth="9" className="stroke-surface" />
        <circle
          cx="36"
          cy="36"
          r={RADIUS}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className={`${progress.met ? 'stroke-teal' : 'stroke-accent'} transition-[stroke-dashoffset] duration-700 ease-out`}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - shown / 100)}
        />
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center font-display text-lg font-extrabold text-ink">
        {progress.count}/{progress.goal}
      </span>
    </div>
  );
}

function GoalPicker({ current, onDone }: { current: number | null; onDone: () => void }) {
  const { setGoal } = useGoal();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const choose = async (next: number | null) => {
    setBusy(true);
    try {
      await setGoal(next);
      onDone();
    } catch (e) {
      toast({ kind: 'error', title: "Couldn't save your goal", body: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="group" aria-label="Cases per week" className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-ink-2">Cases a week:</span>
      {GOAL_CHOICES.map((n) => (
        <button
          key={n}
          type="button"
          disabled={busy}
          aria-pressed={current === n}
          onClick={() => void choose(n)}
          className={`num size-9 rounded-full border-2 border-ink/80 text-sm font-bold transition disabled:opacity-60 ${
            current === n ? 'bg-ink text-bg' : 'bg-surface text-ink hover:bg-sun'
          }`}
        >
          {n}
        </button>
      ))}
      {current !== null && (
        <button type="button" disabled={busy} onClick={() => void choose(null)} className="text-sm font-semibold text-accent-text hover:underline">
          No goal
        </button>
      )}
    </div>
  );
}

export function TodayStrip({ cases, now, next }: { cases: CaseRecord[]; now: Date; next?: Suggestion }) {
  const { openLogCase } = useUI();
  const { goal, ready } = useGoal();
  const [picking, setPicking] = useState(false);
  const action = next?.action;
  const progress = goal ? goalProgress(cases, now, goal) : null;
  const thisWeek = progress?.count ?? goalProgress(cases, now, 1).count;

  return (
    <section aria-label="Your week" className="sticker relative flex flex-col gap-4 overflow-hidden bg-sun-soft p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <Sparkle className="absolute right-3 top-2 size-5 text-sun" />
      <div className="flex min-w-0 items-start gap-4">
        {progress && <GoalRing progress={progress} />}
        <div className="min-w-0">
          <p className="eyebrow !text-ink-2">Your week</p>
          <p className="mt-1 font-display text-xl font-extrabold leading-snug text-ink sm:text-2xl">
            {progress ? goalLine(progress) : weekLine(thisWeek)}
          </p>
          {progress && progress.streak > 0 && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-coral-ink">
              <Flame className={`size-4 ${progress.streak > 1 ? 'animate-flame' : ''}`} aria-hidden />
              {progress.streak === 1 ? '1 week on target' : `${progress.streak} weeks in a row on target`}
            </p>
          )}
          {next && (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-2">
              <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold text-ink">Next:</span> {next.text}
              </span>
            </p>
          )}
          {((next && needsWarmup(next)) || (ready && !picking)) && (
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              {next && needsWarmup(next) && <WarmupLink />}
              {ready && !picking && (
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink/80 bg-surface px-3 py-1 text-xs font-bold text-ink shadow-[1px_2px_0_0_rgb(28_26_24/0.85)] transition hover:bg-sun-soft"
                >
                  <Target className="size-3.5" aria-hidden /> {goal ? 'Change weekly goal' : 'Set a weekly goal'}
                </button>
              )}
            </div>
          )}
          {picking && <GoalPicker current={goal} onDone={() => setPicking(false)} />}
        </div>
      </div>
      <Button
        variant="primary"
        size="lg"
        className="shrink-0 self-start sm:self-center"
        onClick={() => openLogCase(action ? { caseType: action.caseType, industry: action.industry } : undefined)}
      >
        <Plus className="size-4" /> {action?.label ?? 'Log a case'}
      </Button>
    </section>
  );
}
