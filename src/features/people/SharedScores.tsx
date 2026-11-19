import { lazy, Suspense } from 'react';
import { barColors } from '../../components/charts/colors';
import type { SharedScore } from '../../domain/giveNext';
import { useTheme } from '../../state/theme';
import type { BarRow } from './ProfileBars';

const ProfileBars = lazy(() => import('./ProfileBars'));

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const score = (n: number) => n.toFixed(1);

/**
 * The scores a member shares, as bars, strongest first, with the ones only a case or two carry kept out of
 * the ordering and shown underneath for what they are. The same block is on a profile link and on the page
 * another member sees; what feeds it is `giveNextView`, so one rule decides which score is which.
 */
export function SharedScores({ scores, thin, label }: { scores: SharedScore[]; thin: SharedScore[]; label: string }) {
  const { isDark } = useTheme();
  const bars = barColors(isDark);

  const rows: BarRow[] = scores.map((s) => ({
    name: s.label,
    value: s.average,
    label: score(s.average),
    note: `n=${s.count}`,
    fill: bars.score,
  }));

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <>
          <Suspense fallback={<div style={{ height: rows.length * 26 + 12 }} className="animate-pulse rounded-xl bg-surface-2" aria-hidden />}>
            <ProfileBars rows={rows} max={5} nameWidth={132} />
          </Suspense>
          <ul className="sr-only" aria-label={label}>
            {scores.map((s) => (
              <li key={s.key}>{`${s.label}: ${score(s.average)} out of 5, from ${plural(s.count, 'case')}`}</li>
            ))}
          </ul>
        </>
      )}
      {thin.length > 0 && (
        <p className="text-xs text-muted">
          <span className="font-semibold text-ink-2">Only a case or two so far:</span>{' '}
          {thin.map((s) => `${s.label} ${score(s.average)}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
