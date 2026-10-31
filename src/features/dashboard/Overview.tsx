import { BookOpenCheck, CalendarDays, Layers, Building2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { CountUp, GrowBar } from '../../components/ui/Motion';
import { startOfWeek, toISODate, formatShortDate } from '../../domain/dates';
import { weeklyHistory, type Overview as OverviewStats } from '../../domain/stats';
import type { CaseRecord } from '../../domain/types';

const METRIC_TONES = {
  sun: { card: 'bg-sun-soft', chip: 'bg-sun text-on-sun', bar: 'bg-sun' },
  teal: { card: 'bg-teal-soft', chip: 'bg-teal text-on-color', bar: 'bg-teal' },
  coral: { card: 'bg-coral-soft', chip: 'bg-coral text-on-color', bar: 'bg-coral' },
  lilac: { card: 'bg-lilac-soft', chip: 'bg-lilac text-on-color', bar: 'bg-lilac' },
} as const;

function Metric({
  label,
  icon,
  value,
  suffix,
  caption,
  progress,
  tone,
}: {
  tone: keyof typeof METRIC_TONES;
  label: string;
  icon: ReactNode;
  value: number;
  suffix?: string;
  caption: ReactNode;
  /** 0-1; omitted for metrics that have no natural ceiling. */
  progress?: number;
}) {
  return (
    <div className={`sticker p-5 ${METRIC_TONES[tone].card}`}>
      <div className="flex items-center justify-between">
        <p className="eyebrow !text-ink-2">{label}</p>
        <span className={`flex size-8 items-center justify-center rounded-lg border-2 border-ink/80 ${METRIC_TONES[tone].chip}`}>{icon}</span>
      </div>
      <p className="num mt-3 flex items-baseline gap-1.5 font-display text-5xl font-extrabold tracking-tight text-ink">
        <CountUp value={value} />
        {suffix && <span className="text-lg font-semibold text-ink-2">{suffix}</span>}
      </p>
      <p className="mt-1 text-sm text-ink-2">{caption}</p>
      {progress !== undefined && (
        <div className="mt-4 h-2.5 overflow-hidden rounded-full border-2 border-ink/80 bg-surface" aria-hidden>
          <GrowBar className={`h-full rounded-full ${METRIC_TONES[tone].bar}`} pct={Math.round(Math.min(1, progress) * 100)} />
        </div>
      )}
    </div>
  );
}

export function Overview({ stats, cases, now }: { stats: OverviewStats; cases: CaseRecord[]; now: Date }) {
  const weekStart = toISODate(startOfWeek(now));
  const lastWeek = weeklyHistory(cases, now, 2)[0];
  const industryCaption =
    stats.industriesCovered === 0
      ? 'none yet'
      : stats.customIndustriesCovered > 0
        ? `of ${stats.presetIndustriesTotal} common · ${stats.customIndustriesCovered} custom`
        : `of ${stats.presetIndustriesTotal} common industries`;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Overview">
      <Metric
        tone="sun"
        label="Total cases"
        icon={<BookOpenCheck className="size-4" />}
        value={stats.total}
        caption={stats.total === 0 ? 'Nothing logged yet' : stats.total === 1 ? 'case practiced' : 'cases practiced'}
      />
      <Metric
        tone="teal"
        label="This week"
        icon={<CalendarDays className="size-4" />}
        value={stats.thisWeek}
        caption={
          stats.total === 0 ? (
            `Week of ${formatShortDate(weekStart)}`
          ) : (
            <>
              Week of {formatShortDate(weekStart)}
              <span className="block text-xs">Last week: {lastWeek.count}</span>
            </>
          )
        }
      />
      <Metric
        tone="coral"
        label="Case types"
        icon={<Layers className="size-4" />}
        value={stats.caseTypesCovered}
        suffix={`of ${stats.caseTypesTotal}`}
        caption="case types practiced"
        progress={stats.caseTypesCovered / stats.caseTypesTotal}
      />
      <Metric
        tone="lilac"
        label="Industries"
        icon={<Building2 className="size-4" />}
        value={stats.industriesCovered}
        caption={industryCaption}
        progress={stats.presetIndustriesCovered / stats.presetIndustriesTotal}
      />
    </div>
  );
}
