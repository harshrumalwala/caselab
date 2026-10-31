import { ArrowRight, Plus } from 'lucide-react';
import type { Suggestion } from '../../domain/suggestions';
import { Button } from '../../components/ui/Button';
import { Sparkle } from '../../components/ui/Doodles';
import { useUI } from '../../state/ui';

/** What this week looks like and the one thing to do next, so the dashboard opens with an answer before the charts. */
function weekLine(n: number): string {
  if (n === 0) return 'No cases yet this week. A quick one counts.';
  if (n === 1) return 'One case this week. The streak starts here.';
  if (n < 4) return `${n} cases this week. Nice rhythm.`;
  return `${n} cases this week. Someone is on a roll.`;
}

export function TodayStrip({ thisWeek, next }: { thisWeek: number; next?: Suggestion }) {
  const { openLogCase } = useUI();
  const action = next?.action;
  return (
    <section aria-label="Your week" className="sticker relative flex flex-col gap-4 overflow-hidden bg-sun-soft p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <Sparkle className="absolute right-3 top-2 size-5 text-sun" />
      <div className="min-w-0">
        <p className="eyebrow !text-ink-2">Your week</p>
        <p className="mt-1 font-display text-xl font-extrabold leading-snug text-ink sm:text-2xl">{weekLine(thisWeek)}</p>
        {next && (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-2">
            <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold text-ink">Next:</span> {next.text}
            </span>
          </p>
        )}
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
