import { CalendarRange } from 'lucide-react';
import type { WeekBucket } from '../../domain/stats';
import { Card, CardHeader } from '../../components/ui/Card';

export function WeeklyPractice({ weeks, total }: { weeks: WeekBucket[]; total: number }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const sum = weeks.reduce((a, w) => a + w.count, 0);
  const active = weeks.filter((w) => w.count > 0).length;

  return (
    <Card aria-labelledby="weekly-title">
      <CardHeader
        titleId="weekly-title"
        title="Weekly practice"
        subtitle="Cases per calendar week, Monday to Sunday"
        icon={<CalendarRange className="size-4" />}
      />
      {total === 0 ? (
        <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
          Your weekly history appears after your first case.
        </p>
      ) : (
        <>
          <ol className="flex h-36 items-end gap-2" aria-label="Cases per week, oldest to newest">
            {weeks.map((w) => (
              <li
                key={w.weekStart}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                title={`Week of ${w.label}: ${w.count} ${w.count === 1 ? 'case' : 'cases'}`}
              >
                <span className={`num text-xs font-semibold ${w.count ? 'text-ink-2' : 'text-transparent'}`}>
                  {w.count || 0}
                </span>
                <div
                  className={`w-full rounded-md transition-[height] duration-700 ease-out ${
                    w.isCurrent ? 'bg-accent' : 'bg-bar/60 group-hover:bg-bar'
                  } ${w.count === 0 ? 'opacity-30' : ''}`}
                  style={{ height: w.count === 0 ? '3px' : `${Math.max(12, (w.count / max) * 88)}px` }}
                />
                <span className={`num text-[10px] ${w.isCurrent ? 'font-semibold text-ink' : 'text-muted'}`}>
                  {w.label}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted">
            {sum} {sum === 1 ? 'case' : 'cases'} across the last {weeks.length} weeks
            {active > 0 && ` · ${active} active ${active === 1 ? 'week' : 'weeks'}`}. Quiet weeks happen. Even
            partners take vacations.
          </p>
        </>
      )}
    </Card>
  );
}
