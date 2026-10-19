import { BookOpenCheck, CalendarDays, Layers, Building2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { startOfWeek, toISODate, formatShortDate } from '../../domain/dates';
import { weeklyHistory, type Overview as OverviewStats } from '../../domain/stats';
import type { CaseRecord } from '../../domain/types';

function Metric({
  label,
  icon,
  value,
  suffix,
  caption,
  progress,
}: {
  label: string;
  icon: ReactNode;
  value: number;
  suffix?: string;
  caption: ReactNode;
  /** 0-1; omitted for metrics that have no natural ceiling. */
  progress?: number;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        <span className="text-muted">{icon}</span>
      </div>
      <p className="num mt-3 flex items-baseline gap-1.5 text-4xl font-semibold tracking-tight text-ink">
        {value}
        {suffix && <span className="text-lg font-medium text-muted">{suffix}</span>}
      </p>
      <p className="mt-1 text-sm text-muted">{caption}</p>
      {progress !== undefined && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-track" aria-hidden>
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${Math.round(Math.min(1, progress) * 100)}%` }}
          />
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
        label="Total cases"
        icon={<BookOpenCheck className="size-4" />}
        value={stats.total}
        caption={stats.total === 0 ? 'Nothing logged yet' : stats.total === 1 ? 'case practiced' : 'cases practiced'}
      />
      <Metric
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
        label="Case types"
        icon={<Layers className="size-4" />}
        value={stats.caseTypesCovered}
        suffix={`of ${stats.caseTypesTotal}`}
        caption="case types practiced"
        progress={stats.caseTypesCovered / stats.caseTypesTotal}
      />
      <Metric
        label="Industries"
        icon={<Building2 className="size-4" />}
        value={stats.industriesCovered}
        caption={industryCaption}
        progress={stats.presetIndustriesCovered / stats.presetIndustriesTotal}
      />
    </div>
  );
}
