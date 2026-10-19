import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate, formatShortDate } from '../../domain/dates';
import { round1, type TrendPoint } from '../../domain/stats';
import { chartColors } from '../../components/charts/colors';
import { useTheme } from '../../state/theme';

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="font-semibold text-ink">{p.title || 'Untitled case'}</p>
      <p className="mt-0.5 text-muted">{formatDate(p.date)}</p>
      <p className="num mt-1 text-ink-2">
        Overall <span className="font-semibold">{p.overall}</span>
        {p.rolling !== null && <> · 5-case avg {round1(p.rolling).toFixed(1)}</>}
      </p>
    </div>
  );
}

/** Kept in its own module so the charting library loads only when a trend is actually shown. */
export default function TrendChart({ points }: { points: TrendPoint[] }) {
  const { isDark } = useTheme();
  const c = chartColors(isDark);

  // At most ~6 x-axis labels, evenly spaced over case numbers.
  const step = Math.max(1, Math.ceil(points.length / 6));
  const ticks = points.filter((_p, i) => i % step === 0 || i === points.length - 1).map((p) => p.n);

  return (
    <div className="h-56 w-full" role="img" aria-label={`Overall rating across ${points.length} rated cases`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis
            dataKey="n"
            type="number"
            domain={[1, Math.max(points.length, 2)]}
            ticks={ticks}
            tickFormatter={(n: number) => formatShortDate(points[n - 1]?.date ?? '')}
            tick={{ fontSize: 11, fill: c.axis }}
            tickLine={false}
            axisLine={false}
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={{ fontSize: 11, fill: c.axis }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: c.grid }} />
          <Line
            type="monotone"
            dataKey="rolling"
            stroke={c.line}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="overall"
            stroke={c.accent}
            strokeWidth={2.5}
            dot={{ r: 4, fill: c.surface, stroke: c.accent, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: c.accent, stroke: c.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
