import { lazy, Suspense, useMemo } from 'react';
import { Compass } from 'lucide-react';
import { barColors } from '../../components/charts/colors';
import type { Profile, SharedCase } from '../../domain/community';
import { giveNextView, type PracticeArea } from '../../domain/giveNext';
import type { Exposure } from '../../domain/stats';
import { useTheme } from '../../state/theme';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import type { BarRow } from './ProfileBars';
import { SharedScores } from './SharedScores';

const ProfileBars = lazy(() => import('./ProfileBars'));

/** The three bands a case type or industry can be in, in the order the lanes read them. */
const BANDS: Exposure[] = ['none', 'once', 'multiple'];
const BAND_LABEL: Record<Exposure, string> = {
  none: "Hasn't cased yet",
  once: 'Cased once',
  multiple: 'Can help you with',
};

const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * One side of the answer: case types, or industries. The ones with nothing in them are named first and in
 * full, then the rest as bars, fewest cases first. A bar is only drawn where there is something to draw.
 */
function Lane({ title, areas }: { title: string; areas: PracticeArea[] }) {
  const { isDark } = useTheme();
  const bars = barColors(isDark);
  const uncased = areas.filter((a) => a.band === 'none');
  const cased = areas.filter((a) => a.band !== 'none');
  const max = Math.max(2, ...cased.map((a) => a.count));
  const rows: BarRow[] = cased.map((a) => ({ name: a.name, value: a.count, label: String(a.count), fill: bars[a.band] }));
  const bands = BANDS.filter((b) => b !== 'none' && cased.some((a) => a.band === b));

  return (
    // min-w-0 so the chart can shrink with its grid column instead of overflowing it.
    <div className="min-w-0 space-y-3" role="group" aria-label={title}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>

      {uncased.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{BAND_LABEL.none}</p>
          <ul className="flex flex-wrap gap-1.5" aria-label={`${title}: hasn't cased yet`}>
            {uncased.map((a) => (
              <li key={a.name} className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-sm text-ink">
                {a.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cased.length > 0 && (
        <div className="space-y-1.5">
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {bands.map((band) => (
              <li key={band} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: bars[band] }} aria-hidden />
                {BAND_LABEL[band]}
              </li>
            ))}
          </ul>
          <Suspense fallback={<div style={{ height: rows.length * 26 + 12 }} className="animate-pulse rounded-xl bg-surface-2" aria-hidden />}>
            <ProfileBars rows={rows} max={max} />
          </Suspense>
          <ul className="sr-only" aria-label={`${title}: cased`}>
            {cased.map((a) => (
              <li key={a.name}>{`${a.name}: ${plural(a.count, 'case')}`}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * "What to give them next" for someone holding this member's profile link. A visitor has no log of their own,
 * so they can't be shown the overlap answer members get; this is built only from the rows the link already
 * hands out, and it stays quiet when those rows can't support it.
 */
export function GiveThemNext({ person, shared }: { person: Profile; shared: SharedCase[] }) {
  const view = useMemo(() => giveNextView(shared), [shared]);
  const name = first(person.displayName);

  // Nothing shared, nothing to say.
  if (view.total === 0) return null;
  const hasScores = view.scores.length > 0 || view.thinScores.length > 0;

  return (
    <Card strip="lilac" aria-labelledby="give-next-title">
      <CardHeader
        titleId="give-next-title"
        title={`What to give ${name} next`}
        subtitle={`From the ${plural(view.total, 'case')} ${name} shares.`}
        icon={<Compass className="size-4" />}
      />

      {view.focus && (
        <div className="mb-5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5" role="group" aria-label="Wants practice in">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Wants practice in</h3>
          <p className="font-display text-lg font-bold text-ink">{view.focus.label}</p>
          <Badge>
            {name}'s own tag, on {plural(view.focus.count, 'case')}
          </Badge>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Lane title="Case types" areas={view.typeLane} />
        <Lane title="Industries" areas={view.industryLane} />
      </div>

      {hasScores && (
        <div className="mt-6 space-y-2.5">
          <h3 className="text-sm font-semibold text-ink">Scores {name} shares</h3>
          <SharedScores scores={view.scores} thin={view.thinScores} label={`Scores ${name} shares`} />
        </div>
      )}
    </Card>
  );
}
