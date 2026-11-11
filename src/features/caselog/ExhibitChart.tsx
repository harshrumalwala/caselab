import { parseFigure, type ExhibitChart as Chart, type SolutionExhibit } from '../../domain/bookSolution';

// Static class names, so the style sheet keeps them.
const SERIES = [
  { fill: 'fill-teal', stroke: 'stroke-teal', swatch: 'bg-teal' },
  { fill: 'fill-coral', stroke: 'stroke-coral', swatch: 'bg-coral' },
  { fill: 'fill-lilac', stroke: 'stroke-lilac', swatch: 'bg-lilac' },
  { fill: 'fill-sky', stroke: 'stroke-sky', swatch: 'bg-sky' },
] as const;

const W = 520;
const H = 230;
const PAD = { top: 18, right: 14, bottom: 46, left: 54 };

/** A short label for an axis value: 1,200,000 -> 1.2M. */
function short(n: number): string {
  const a = Math.abs(n);
  const f = (x: number, s: string) => `${Number.isInteger(x) ? x : x.toFixed(1)}${s}`;
  if (a >= 1e12) return f(n / 1e12, 'T');
  if (a >= 1e9) return f(n / 1e9, 'B');
  if (a >= 1e6) return f(n / 1e6, 'M');
  if (a >= 1e3) return f(n / 1e3, 'K');
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * A small bar or line chart drawn from an exhibit's own table (never the book's picture). The table stays beside it as the source of every
 * figure. Each series is read from the columns the write-up names, and only drawn when every row has a figure in it.
 */
export function ExhibitChart({ exhibit, chart }: { exhibit: SolutionExhibit; chart: Chart }) {
  const labels = exhibit.rows.map((r) => r[chart.labelColumn] ?? '');
  const series = chart.seriesColumns.map((c) => ({ name: exhibit.columns[c] ?? '', values: exhibit.rows.map((r) => parseFigure(r[c] ?? '') ?? 0) }));
  const all = series.flatMap((s) => s.values);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - min) / span) * plotH;
  const slot = plotW / Math.max(labels.length, 1);
  const ticks = [min, min + span / 2, max];
  const zero = y(0);

  const description = `${exhibit.title}: ${labels.map((l, i) => `${l} ${series.map((s) => `${s.name} ${exhibit.rows[i][chart.seriesColumns[series.indexOf(s)]]}`).join(', ')}`).join('; ')}`;

  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={description} className="h-auto w-full max-w-xl">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-muted" fontSize={10}>
              {short(t)}
              {chart.unit && t === max ? ` ${chart.unit}` : ''}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={zero} y2={zero} className="stroke-ink-2" strokeWidth={1} />

        {chart.kind === 'bar' &&
          labels.map((label, i) => {
            const groupW = Math.min(slot * 0.8, 56 * series.length);
            const barW = groupW / series.length;
            const x0 = PAD.left + slot * i + (slot - groupW) / 2;
            return (
              <g key={`${i}-${label}`}>
                {series.map((s, si) => {
                  const v = s.values[i];
                  const top = Math.min(y(v), zero);
                  return <rect key={s.name + si} x={x0 + barW * si} y={top} width={Math.max(barW - 2, 1)} height={Math.max(Math.abs(y(v) - zero), 1)} className={SERIES[si].fill} rx={2} />;
                })}
                <text x={PAD.left + slot * i + slot / 2} y={H - PAD.bottom + 14} textAnchor="middle" className="fill-ink-2" fontSize={10}>
                  {label.length > 14 ? `${label.slice(0, 13)}…` : label}
                </text>
              </g>
            );
          })}

        {chart.kind === 'line' && (
          <>
            {series.map((s, si) => {
              const pts = s.values.map((v, i) => `${PAD.left + slot * i + slot / 2},${y(v)}`);
              return (
                <g key={s.name + si}>
                  <polyline points={pts.join(' ')} fill="none" className={SERIES[si].stroke} strokeWidth={2.5} strokeLinejoin="round" />
                  {s.values.map((v, i) => (
                    <circle key={i} cx={PAD.left + slot * i + slot / 2} cy={y(v)} r={3.5} className={SERIES[si].fill} />
                  ))}
                </g>
              );
            })}
            {labels.map((label, i) => (
              <text key={`${i}-${label}`} x={PAD.left + slot * i + slot / 2} y={H - PAD.bottom + 14} textAnchor="middle" className="fill-ink-2" fontSize={10}>
                {label.length > 14 ? `${label.slice(0, 13)}…` : label}
              </text>
            ))}
          </>
        )}
      </svg>
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Chart key">
          {series.map((s, si) => (
            <li key={s.name + si} className="flex items-center gap-1.5">
              <span className={`inline-block size-2.5 rounded-sm ${SERIES[si].swatch}`} aria-hidden />
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
