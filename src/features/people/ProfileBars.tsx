import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { barColors, chartColors } from '../../components/charts/colors';
import { useTheme } from '../../state/theme';

export interface BarRow {
  /** The case type, industry or skill this row is about. */
  name: string;
  value: number;
  /** The value as it is printed beside the bar. */
  label: string;
  /** A quieter figure after the name, when the row has one (how many cases a score comes from). */
  note?: string;
  fill: string;
}

const ROW_HEIGHT = 26;

interface TickProps {
  x?: number;
  y?: number;
  payload?: { value?: string };
  rows: BarRow[];
  ink: string;
  muted: string;
}

/** The name on the left, with its quieter figure tucked after it. */
function NameTick({ x = 0, y = 0, payload, rows, ink, muted }: TickProps) {
  const name = payload?.value ?? '';
  const note = rows.find((r) => r.name === name)?.note;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill={ink}>
      <tspan>{name}</tspan>
      {note && (
        <tspan dx={5} fontSize={10} fill={muted}>
          {note}
        </tspan>
      )}
    </text>
  );
}

/**
 * Horizontal bars for a profile: one row per case type, industry or skill, in the order they are handed in.
 * Kept in its own module so the charting library loads only when a profile is actually opened, and drawn
 * beside a list carrying the same rows as text, so the picture is never the only way to read them.
 */
export default function ProfileBars({ rows, max, nameWidth = 142 }: { rows: BarRow[]; max: number; nameWidth?: number }) {
  const { isDark } = useTheme();
  const c = chartColors(isDark);
  const bars = barColors(isDark);

  return (
    <div style={{ height: rows.length * ROW_HEIGHT + 12 }} className="w-full min-w-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 2, right: 34, bottom: 2, left: 0 }} barCategoryGap={4}>
          <XAxis type="number" domain={[0, max]} hide />
          <YAxis
            type="category"
            dataKey="name"
            width={nameWidth}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={<NameTick rows={rows} ink={c.ink} muted={c.axis} />}
          />
          <Bar dataKey="value" background={{ fill: bars.track, radius: 4 }} radius={4} isAnimationActive={false} maxBarSize={14}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r.fill} />
            ))}
            <LabelList dataKey="label" position="right" fontSize={11} fill={c.ink} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
