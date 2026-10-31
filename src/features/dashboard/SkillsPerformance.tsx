import { ArrowDownRight, ArrowUpRight, Gauge, Minus } from 'lucide-react';
import { RATINGS, RATING_LABELS } from '../../domain/constants';
import { round1, type SkillStat } from '../../domain/stats';
import { Card, CardHeader } from '../../components/ui/Card';
import { GrowBar } from '../../components/ui/Motion';
import { TONE, scoreTone } from '../../components/ui/tones';

const BAR_COLOURS = ['bg-sun', 'bg-teal', 'bg-coral', 'bg-lilac', 'bg-sky'] as const;

const fmt = (n: number) => round1(n).toFixed(1);

function TrendChip({ stat }: { stat: SkillStat }) {
  if (stat.trend === null || stat.delta === null) return null;
  if (stat.trend === 'steady') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted" title="Within 0.3 of your earlier ratings">
        <Minus className="size-3.5" /> steady
      </span>
    );
  }
  const up = stat.trend === 'improving';
  return (
    <span
      className={`num inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-good' : 'text-bad'}`}
      title="Last 5 ratings compared with your earlier ratings"
    >
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {up ? '+' : '−'}
      {fmt(Math.abs(stat.delta))}
    </span>
  );
}

function SkillRow({ stat, emphasis, colour }: { stat: SkillStat; emphasis?: boolean; colour: string }) {
  const tone = TONE[scoreTone(stat.average)];
  const avgPct = stat.average === null ? 0 : (stat.average / 5) * 100;
  const recentPct = stat.recentAverage === null ? null : (stat.recentAverage / 5) * 100;

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={`truncate text-sm ${emphasis ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>
          {stat.label}
        </span>
        {stat.count > 0 && <span className="num text-xs text-muted">n={stat.count}</span>}
      </div>
      <div className="flex items-center justify-end gap-3">
        {stat.recentAverage !== null && (
          <span className="num text-xs text-muted" title="Average of your last 5 rated cases">
            last 5: <span className="font-semibold text-ink-2">{fmt(stat.recentAverage)}</span>
          </span>
        )}
        <TrendChip stat={stat} />
        <span className={`num min-w-9 text-right text-sm font-semibold ${stat.average === null ? 'text-ink' : tone.text}`}>
          {stat.average === null ? <span className="text-xs font-normal text-muted">not rated</span> : fmt(stat.average)}
        </span>
      </div>

      <div
        className="relative col-span-2 h-2.5 rounded-full bg-track"
        role="img"
        aria-label={
          stat.average === null
            ? `${stat.label}: not rated yet`
            : `${stat.label}: average ${fmt(stat.average)} out of 5${stat.recentAverage !== null ? `, last five ${fmt(stat.recentAverage)}` : ''}`
        }
      >
        <GrowBar className={`h-full rounded-full ${colour}`} pct={avgPct} />
        {recentPct !== null && (
          <span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border-2 border-surface bg-ink shadow-sm"
            style={{ left: `${recentPct}%` }}
            aria-hidden
          />
        )}
      </div>
    </li>
  );
}

export function SkillsPerformance({ stats, total }: { stats: SkillStat[]; total: number }) {
  const [overall, ...rest] = stats;
  const anyRated = stats.some((s) => s.count > 0);

  return (
    <Card strip="sun" aria-labelledby="skills-title">
      <CardHeader
        titleId="skills-title"
        title="Skills performance"
        subtitle="Average of the cases where you rated each skill. Skills you skipped never count against you."
        icon={<Gauge className="size-4" />}
      />

      {!anyRated ? (
        <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
          {total === 0
            ? 'Skill averages appear after you rate your first case.'
            : 'None of your cases have skill ratings yet. Add ratings when you log or edit a case.'}
        </p>
      ) : (
        <>
          <ul className="space-y-5">
            <SkillRow stat={overall} emphasis colour="bg-accent" />
            <li className="border-t border-line" aria-hidden />
            {rest.map((s, i) => (
              <SkillRow key={s.key} stat={s} colour={BAR_COLOURS[i % BAR_COLOURS.length]} />
            ))}
          </ul>

          <div className="mt-6 space-y-3 border-t border-line pt-4 text-xs text-muted">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-5 rounded-full bg-bar" /> All rated cases
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rotate-45 rounded-[2px] bg-ink" /> Last 5 rated (from 5 ratings)
                </span>
              </div>
              <details className="relative">
                <summary className="cursor-pointer list-none font-medium text-accent-text hover:underline">
                  Rating scale
                </summary>
                <ul className="num absolute bottom-full right-0 z-10 mb-2 w-64 space-y-1 rounded-xl border border-line bg-surface p-3 text-xs text-ink-2 shadow-pop">
                  {RATINGS.map((n) => (
                    <li key={n}>
                      <span className="font-semibold">{n}</span> = {RATING_LABELS[n]}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
            {stats.some((s) => s.count === 0) && (
              <p>Skills you didn't rate are left out of the averages. They are never counted as zero.</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
