import { lazy, Suspense } from 'react';
import { LineChart as LineIcon } from 'lucide-react';
import type { TrendPoint } from '../../domain/stats';
import { Card, CardHeader } from '../../components/ui/Card';

const TrendChart = lazy(() => import('./TrendChart'));

const MIN_POINTS = 3;

export function OverallTrend({ points }: { points: TrendPoint[] }) {
  const enough = points.length >= MIN_POINTS;

  return (
    <Card strip="teal" aria-labelledby="trend-title">
      <CardHeader
        titleId="trend-title"
        title="Overall performance over time"
        subtitle={enough ? 'Each dot is a case · dashed line is the 5-case rolling average · up and to the right is the dream' : undefined}
        icon={<LineIcon className="size-4" />}
      />
      {!enough ? (
        <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
          Your trend line appears after {MIN_POINTS} cases with an overall rating
          {points.length > 0 ? ` (${points.length} so far)` : ''}.
        </p>
      ) : (
        <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-surface-2" aria-hidden />}>
          <TrendChart points={points} />
        </Suspense>
      )}
    </Card>
  );
}
