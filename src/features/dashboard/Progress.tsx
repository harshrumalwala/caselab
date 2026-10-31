import { ArrowRight, Flag, TrendingUp } from 'lucide-react';
import { formatDate } from '../../domain/dates';
import { nextCountMilestone, type Milestone } from '../../domain/milestones';
import { MIN_FOR_FIRST_VS_LATEST } from '../../domain/constants';
import { round1, type SkillStat } from '../../domain/stats';
import { Card, CardHeader } from '../../components/ui/Card';

const fmt = (n: number) => round1(n).toFixed(1);

export function ProgressOverTime({ stats }: { stats: SkillStat[] }) {
  const comparable = stats.filter((s) => s.firstFive !== null && s.latestFive !== null);
  const overall = stats.find((s) => s.key === 'overall');

  return (
    <Card aria-labelledby="progress-title">
      <CardHeader
        titleId="progress-title"
        title="Progress over time"
        subtitle="Your first five ratings vs. your latest five. The glow-up, measured."
        icon={<TrendingUp className="size-4" />}
      />
      {comparable.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
          Comparisons appear once a skill has {MIN_FOR_FIRST_VS_LATEST} ratings, so the two groups of five never overlap.
          {overall && overall.count > 0 && (
            <>
              {' '}
              Overall: {overall.count} of {MIN_FOR_FIRST_VS_LATEST} so far.
            </>
          )}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {comparable.map((s) => {
            const delta = (s.latestFive as number) - (s.firstFive as number);
            return (
              <li key={s.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <span className="truncate text-sm font-medium text-ink">{s.label}</span>
                <span className="num flex shrink-0 items-center gap-2 text-sm text-ink-2">
                  {fmt(s.firstFive as number)}
                  <ArrowRight className="size-3.5 text-muted" />
                  <span className="font-semibold text-ink">{fmt(s.latestFive as number)}</span>
                  <span
                    className={`w-11 text-right text-xs font-semibold ${
                      delta >= 0.3 ? 'text-good' : delta <= -0.3 ? 'text-bad' : 'text-muted'
                    }`}
                  >
                    {delta >= 0 ? '+' : '−'}
                    {fmt(Math.abs(delta))}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function Milestones({ achieved, total }: { achieved: Milestone[]; total: number }) {
  const next = nextCountMilestone(total);
  const latest = [...achieved].reverse().slice(0, 4);

  return (
    <Card aria-labelledby="milestones-title">
      <CardHeader
        titleId="milestones-title"
        title="Milestones"
        subtitle="Tiny trophies for showing up"
        icon={<Flag className="size-4" />}
      />
      {next && (
        <div className="mb-5">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-medium text-ink">Next: {next.target} cases</span>
            <span className="num text-muted">
              {total} of {next.target} · {next.remaining} to go
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-track" aria-hidden>
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
              style={{ width: `${(total / next.target) * 100}%` }}
            />
          </div>
        </div>
      )}
      {latest.length === 0 ? (
        <p className="text-sm text-muted">
          Milestones appear as you go: 5, 10 and 25 cases, your first case in each new industry, and covering every main
          case type.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {latest.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span className="truncate text-ink">{m.label}</span>
              </span>
              <span className="num shrink-0 text-xs text-muted">{formatDate(m.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
