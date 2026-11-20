import { Fragment } from 'react';
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

/** How much of the row the bar fills, as a percentage, so a bar is always measured against its own row. */
function fill(value: number, max: number): string {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return `${share * 100}%`;
}

/**
 * Horizontal bars for a profile: one row per case type, industry or skill, in the order they are handed in,
 * beside a list carrying the same rows as text, so the picture is never the only way to read them. The block
 * is `aria-hidden` and the list belongs to the caller.
 *
 * **Ordinary DOM, not a chart** (issue #237). A grid of rows whose first column is `auto`, so the browser
 * measures the names: the column is as wide as the longest name it holds and wraps when the card is narrower
 * than that. Until #237 these rows were a Recharts bar chart whose names sat in a fixed pixel gutter handed
 * to a `YAxis` inside an SVG with `overflow: hidden`, so every name longer than the gutter lost its first
 * letters at every window width — "Healthcare / Pharmaceuticals" read as "lthcare / Pharmaceuticals". There
 * is no pixel count here to get wrong. A bar's own length is a percentage of its row.
 */
export function ProfileBars({ rows, max }: { rows: BarRow[]; max: number }) {
  const { isDark } = useTheme();
  const c = chartColors(isDark);
  const bars = barColors(isDark);

  return (
    // min-w-0 so the rows shrink with their grid column instead of overflowing it.
    // data-profile-bars is how the tests tell the drawn rows from the sr-only list beside them.
    <div data-profile-bars aria-hidden className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2">
      {rows.map((r) => (
        <Fragment key={r.name}>
          <div className="break-words text-[11px] leading-tight" style={{ color: c.ink }}>
            {r.name}
            {r.note && (
              <span className="num ml-1 text-[10px]" style={{ color: c.axis }}>
                {r.note}
              </span>
            )}
          </div>
          <div className="h-3.5 min-w-0 rounded" style={{ background: bars.track }}>
            <div className="h-full rounded" style={{ width: fill(r.value, max), background: r.fill }} />
          </div>
          <div className="num text-[11px] leading-none" style={{ color: c.ink }}>
            {r.label}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
