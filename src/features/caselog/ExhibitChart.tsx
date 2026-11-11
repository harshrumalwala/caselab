import type { ReactNode } from 'react';
import type { ChartSeries, ExhibitChart as Chart, SolutionExhibit } from '../../domain/bookSolution';

// The book draws its charts in greys with a few coloured lines, so ours do too: they should read as the book's exhibit, not as ours.
const GREYS = ['#d2d2d2', '#a9a9a9', '#7e7e7e', '#555555', '#3d3d3d', '#2a2a2a'];
const LINE_COLOURS: Record<string, string> = { red: '#c8202f', blue: '#1f6fa8', yellow: '#e2b93b', green: '#3b8a3e', black: '#222222', gray: '#888888', grey: '#888888', orange: '#e07b21', purple: '#6b4aa8' };
const LINE_CYCLE = ['#1f6fa8', '#c8202f', '#e2b93b', '#3b8a3e', '#6b4aa8'];
const INK = 'currentColor';

const lineColour = (s: ChartSeries, i: number) => LINE_COLOURS[s.color.toLowerCase()] ?? (s.color.startsWith('#') ? s.color : LINE_CYCLE[i % LINE_CYCLE.length]);
const greyFor = (i: number) => GREYS[Math.min(i, GREYS.length - 1)];
const onGrey = (i: number) => (i >= 2 ? '#ffffff' : '#1f1f1f'); // readable text on that grey

/** A short axis or value label: 1,200,000 -> 1.2M; small numbers stay as they are. */
function short(n: number): string {
  const a = Math.abs(n);
  const f = (x: number, s: string) => `${Number.isInteger(x) ? x : Number(x.toFixed(1))}${s}`;
  if (a >= 1e12) return f(n / 1e12, 'T');
  if (a >= 1e9) return f(n / 1e9, 'B');
  if (a >= 1e6) return f(n / 1e6, 'M');
  if (a >= 1e4) return f(n / 1e3, 'K');
  return Number.isInteger(n) ? n.toLocaleString('en-US') : String(Number(n.toFixed(2)));
}

/** Axis tick values from min to max, in whole steps. */
function ticksFor(min: number, max: number, step: number | null): number[] {
  const span = max - min || 1;
  let st = step;
  if (!st) {
    const raw = span / 5;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const f = raw / pow;
    st = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  }
  const out: number[] = [];
  for (let v = Math.ceil(min / st) * st; v <= max + st * 1e-6 && out.length < 12; v += st) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const niceMax = (max: number, step: number | null) => {
  const t = ticksFor(0, max, step);
  const top = t[t.length - 1] ?? max;
  return top >= max ? top : top + (step ?? ((t[1] ?? 0) - (t[0] ?? 0) || 1));
};

/** Splits a long label into two lines at the space nearest the middle, as the book wraps its category names. */
function wrap(label: string, max = 12): string[] {
  if (label.length <= max || !label.includes(' ')) return [label];
  const spaces = [...label].map((c, i) => (c === ' ' ? i : -1)).filter((i) => i >= 0);
  const mid = label.length / 2;
  const at = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best), spaces[0]);
  return [label.slice(0, at), label.slice(at + 1)];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function Text({ x, y, children, anchor = 'middle', size = 11, weight = 400, fill = INK, opacity = 1 }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; weight?: number; fill?: string; opacity?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} fill={fill} opacity={opacity}>
      {children}
    </text>
  );
}

/** One chart (a panel, when the exhibit has several), as an SVG group of the given width. */
function Panel({ chart, width }: { chart: Chart; width: number }) {
  const hasSide = chart.sideNotes !== null;
  const lineSeries = chart.series.filter((s) => s.type === 'line' || chart.kind === 'line');
  const endLabels = lineSeries.length > 0 && chart.kind !== 'pie';
  const left = chart.kind === 'pie' ? 10 : 52 + (chart.axisEnds ? 62 : 0);
  const right = hasSide ? 110 : endLabels ? 74 : 14;
  const top = (chart.heading ? 22 : 0) + (chart.axisTitle ? 22 : 8) + (chart.totals.length > 0 ? 14 : 0);
  const rowsH = chart.belowRows.length * 16;
  const plotH = chart.kind === 'pie' ? 190 : 170;
  const wrapped = chart.categories.some((c) => wrap(c).length > 1);
  const catH = chart.kind === 'pie' ? 0 : wrapped ? 42 : 30;
  const H = top + plotH + catH + rowsH + 12;
  const plot: Box = { x: left, y: top, w: width - left - right, h: plotH };

  const n = Math.max(chart.categories.length, 1);
  const slot = plot.w / n;
  const barSeries = chart.series.filter((s) => s.type === 'bar' && chart.kind !== 'line');
  const stacked = chart.kind === 'stacked';

  // vertical scale
  const stackTotals = chart.categories.map((_, i) => chart.series.filter((s) => s.type === 'bar').reduce((t, s) => t + (s.values[i] ?? 0), 0));
  const allVals = chart.series.flatMap((s) => s.values);
  const dataMax = chart.percent ? 100 : stacked ? Math.max(...stackTotals, 0) : Math.max(...allVals, 0);
  const dataMin = Math.min(0, ...allVals);
  const yMin = chart.yMin ?? (chart.kind === 'scatter' || chart.kind === 'line' ? Math.min(...allVals, dataMin) : dataMin);
  const yMax = chart.yMax ?? (chart.percent ? 100 : niceMax(dataMax, chart.yStep));
  const span = yMax - yMin || 1;
  const y = (v: number) => plot.y + plot.h - ((v - yMin) / span) * plot.h;
  const base = y(Math.max(yMin, Math.min(0, yMax))); // where bars start: zero, or the bottom of the axis when it does not reach zero
  const cx = (i: number) => plot.x + slot * i + slot / 2;
  const ticks = chart.kind === 'pie' ? [] : ticksFor(yMin, yMax, chart.yStep ?? (chart.percent ? 20 : null));
  const fmtTick = (t: number) => `${chart.unit === '$' || chart.unit === '$M' || chart.unit === '$B' ? '$' : ''}${short(t)}${chart.unit === '%' ? '%' : chart.unit === '$M' ? 'M' : chart.unit === '$B' ? 'B' : ''}`;
  const labelFor = (s: ChartSeries, i: number) => s.labels[i] || short(s.values[i]);

  const body: ReactNode[] = [];

  if (chart.kind === 'pie') {
    const s = chart.series[0];
    const total = s.values.reduce((a, b) => a + b, 0) || 1;
    const r = 70;
    const ccx = width / 2;
    const ccy = plot.y + plot.h / 2;
    let a0 = -Math.PI / 2;
    s.values.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, rad: number) => `${ccx + Math.cos(a) * rad},${ccy + Math.sin(a) * rad}`;
      const d = s.values.length === 1 ? `M ${ccx - r},${ccy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0` : `M ${ccx},${ccy} L ${p(a0, r)} A ${r},${r} 0 ${large} 1 ${p(a1, r)} Z`;
      body.push(<path key={`s${i}`} d={d} fill={greyFor(i)} stroke="#ffffff" strokeWidth={1.5} />);
      const lx = ccx + Math.cos(mid) * (r + 12);
      const ly = ccy + Math.sin(mid) * (r + 12);
      const anchor = Math.cos(mid) >= 0 ? 'start' : 'end';
      const pct = `${Math.round((v / total) * 100)}%`;
      body.push(
        <Text key={`l${i}`} x={lx} y={ly + 4} anchor={anchor} size={11}>
          {chart.categories[i]} {s.labels[i] || pct}
        </Text>,
      );
      a0 = a1;
    });
  } else {
    // grid, axis numbers and the axis title
    ticks.forEach((t) =>
      body.push(
        <g key={`t${t}`}>
          <line x1={plot.x} x2={plot.x + plot.w} y1={y(t)} y2={y(t)} stroke={INK} strokeOpacity={t === 0 ? 0.6 : 0.12} strokeWidth={1} />
          <Text x={plot.x - 6} y={y(t) + 4} anchor="end" size={10} opacity={0.75}>
            {chart.percent ? `${t}` : fmtTick(t)}
          </Text>
        </g>,
      ),
    );

    if (chart.axisEnds) {
      const put = (label: string, yy: number, key: string) =>
        wrap(label, 10).forEach((line, li) =>
          body.push(
            <Text key={`${key}${li}`} x={4} y={yy + li * 11} anchor="start" size={9} weight={600}>
              {line}
            </Text>,
          ),
        );
      put(chart.axisEnds.top, y(yMax) + 8, 'ae-t');
      put(chart.axisEnds.bottom, y(yMin) - 12, 'ae-b');
    }

    if (chart.kind === 'scatter') {
      const xs = chart.xValues.length === chart.categories.length ? chart.xValues : chart.categories.map((_, i) => i + 1);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const xx = (v: number) => plot.x + 14 + ((v - xMin) / (xMax - xMin || 1)) * (plot.w - 28);
      xs.forEach((xv, i) => {
        body.push(<circle key={`p${i}`} cx={xx(xv)} cy={y(chart.series[0].values[i])} r={4.5} fill={GREYS[3]} />);
        body.push(
          <Text key={`pl${i}`} x={xx(xv)} y={y(chart.series[0].values[i]) - 8} size={10}>
            {chart.categories[i]}
          </Text>,
        );
        body.push(
          <Text key={`px${i}`} x={xx(xv)} y={plot.y + plot.h + 16} size={10} opacity={0.8}>
            {short(xv)}
          </Text>,
        );
      });
    } else if (chart.kind === 'bar' && chart.horizontal) {
      // sideways bars: categories down the left, bars to the right
      const rowH = plot.h / n;
      const barH = Math.min(rowH * 0.7, 26 / Math.max(barSeries.length, 1) + 12);
      const xMaxV = chart.yMax ?? niceMax(dataMax, chart.yStep);
      const xScale = (v: number) => plot.x + (v / (xMaxV || 1)) * plot.w;
      chart.categories.forEach((c, i) => {
        const cy = plot.y + rowH * i + rowH / 2;
        body.push(
          <Text key={`c${i}`} x={plot.x - 6} y={cy + 4} anchor="end" size={10}>
            {c.length > 16 ? `${c.slice(0, 15)}…` : c}
          </Text>,
        );
        barSeries.forEach((s, si) => {
          const bh = barH / barSeries.length;
          const by = cy - barH / 2 + bh * si;
          body.push(<rect key={`b${i}-${si}`} x={plot.x} y={by} width={Math.max(xScale(s.values[i]) - plot.x, 1)} height={Math.max(bh - 1, 2)} fill={greyFor(si)} />);
          body.push(
            <Text key={`bv${i}-${si}`} x={xScale(s.values[i]) + 4} y={by + bh / 2 + 4} anchor="start" size={10}>
              {labelFor(s, i)}
            </Text>,
          );
        });
      });
    } else {
      const groupW = Math.min(slot * 0.72, 64);
      chart.categories.forEach((c, i) => {
        const x0 = cx(i) - groupW / 2;
        if (stacked) {
          const tot = chart.percent ? stackTotals[i] || 1 : 1;
          let acc = 0;
          chart.series.forEach((s, si) => {
            const v = chart.percent ? (s.values[i] / tot) * 100 : s.values[i];
            const y0 = y(acc);
            const y1 = y(acc + v);
            acc += v;
            const segH = Math.abs(y0 - y1);
            body.push(<rect key={`g${i}-${si}`} x={x0} y={Math.min(y0, y1)} width={groupW} height={Math.max(segH, 0)} fill={greyFor(si)} stroke="#ffffff" strokeWidth={0.8} />);
            if (segH > 13) {
              body.push(
                <Text key={`gl${i}-${si}`} x={cx(i)} y={(y0 + y1) / 2 + 4} size={10} fill={onGrey(si)}>
                  {chart.segmentNames ? s.name : labelFor(s, i)}
                </Text>,
              );
            }
          });
          if (chart.totals[i]) {
            body.push(
              <Text key={`tot${i}`} x={cx(i)} y={y(chart.percent ? 100 : stackTotals[i]) - 5} weight={500} size={11}>
                {chart.totals[i]}
              </Text>,
            );
          }
        } else {
          barSeries.forEach((s, si) => {
            const bw = groupW / barSeries.length;
            const v = s.values[i];
            const top2 = Math.min(y(v), base);
            body.push(<rect key={`b${i}-${si}`} x={x0 + bw * si} y={top2} width={Math.max(bw - 2, 2)} height={Math.max(Math.abs(y(v) - base), 1)} fill={greyFor(si)} />);
            body.push(
              <Text key={`bv${i}-${si}`} x={x0 + bw * si + (bw - 2) / 2} y={(v >= 0 ? top2 : top2 + Math.abs(y(v) - base)) + (v >= 0 ? -5 : 12)} size={10}>
                {labelFor(s, i)}
              </Text>,
            );
          });
          if (chart.totals[i]) {
            body.push(
              <Text key={`tot${i}`} x={cx(i)} y={plot.y - 4} weight={500} size={11}>
                {chart.totals[i]}
              </Text>,
            );
          }
        }
        wrap(c).forEach((line, li) =>
          body.push(
            <Text key={`cat${i}-${li}`} x={cx(i)} y={plot.y + plot.h + 16 + li * 12} size={10}>
              {line}
            </Text>,
          ),
        );
      });

      // lines (a line chart, or lines laid over bars)
      lineSeries.forEach((s, li) => {
        const col = lineColour(s, li);
        const pts = s.values.map((v, i) => `${cx(i)},${y(v)}`).join(' ');
        body.push(<polyline key={`ln${li}`} points={pts} fill="none" stroke={col} strokeWidth={2.2} strokeLinejoin="round" />);
        s.values.forEach((v, i) => {
          body.push(<circle key={`ld${li}-${i}`} cx={cx(i)} cy={y(v)} r={3} fill={col} />);
          if (chart.kind === 'line' && s.labels[i]) {
            body.push(
              <Text key={`lv${li}-${i}`} x={cx(i)} y={y(v) - 7} size={10}>
                {s.labels[i]}
              </Text>,
            );
          }
        });
        const last = s.values.length - 1;
        body.push(
          <Text key={`le${li}`} x={cx(last) + 10} y={y(s.values[last]) + 4} anchor="start" size={11} fill={col} weight={500}>
            {s.name}
          </Text>,
        );
      });
    }

    // rows of text under the axis (for example the EBITDA row)
    chart.belowRows.forEach((r, ri) => {
      const yy = plot.y + plot.h + catH + 12 + ri * 16;
      body.push(
        <Text key={`rl${ri}`} x={4} y={yy} anchor="start" size={10} weight={500}>
          {r.label}
        </Text>,
      );
      r.values.forEach((v, i) =>
        body.push(
          <Text key={`rv${ri}-${i}`} x={cx(i)} y={yy} size={10}>
            {v}
          </Text>,
        ),
      );
    });

    // notes beside the chart, lined up with the stack's segments (top to bottom) when there is one per series
    if (chart.sideNotes) {
      const items = chart.sideNotes.items;
      const sx = plot.x + plot.w + 12;
      body.push(
        <Text key="sn-h" x={sx} y={plot.y + 2} anchor="start" size={10} weight={500}>
          {chart.sideNotes.heading}
        </Text>,
      );
      const aligned = stacked && items.length === chart.series.length;
      items.forEach((it, i) => {
        let yy = plot.y + 22 + ((plot.h - 30) / Math.max(items.length, 1)) * (i + 0.5);
        if (aligned) {
          const si = chart.series.length - 1 - i; // the first item sits beside the top segment
          const base = chart.series.slice(0, si).reduce((t, s) => t + (chart.percent ? ((s.values[n - 1] ?? 0) / (stackTotals[n - 1] || 1)) * 100 : (s.values[n - 1] ?? 0)), 0);
          const v = chart.percent ? ((chart.series[si].values[n - 1] ?? 0) / (stackTotals[n - 1] || 1)) * 100 : (chart.series[si].values[n - 1] ?? 0);
          yy = y(base + v / 2) + 4;
        }
        body.push(
          <Text key={`sn${i}`} x={sx} y={yy} anchor="start" size={11}>
            {it}
          </Text>,
        );
      });
    }
  }

  return (
    <g>
      {chart.heading && (
        <Text x={width / 2} y={14} weight={600} size={12}>
          {chart.heading}
        </Text>
      )}
      {chart.axisTitle && (
        <Text x={chart.kind === 'pie' ? width / 2 : 4} y={top - (chart.totals.length > 0 ? 18 : 8)} anchor={chart.kind === 'pie' ? 'middle' : 'start'} size={11} opacity={0.85}>
          {chart.axisTitle}
        </Text>
      )}
      {body}
      <title>{chart.heading || chart.axisTitle}</title>
      <rect x={0} y={0} width={0} height={H} fill="none" />
    </g>
  );
}

const panelHeight = (c: Chart): number => {
  const top = (c.heading ? 22 : 0) + (c.axisTitle ? 22 : 8) + (c.totals.length > 0 ? 14 : 0);
  const wrapped = c.categories.some((x) => wrap(x).length > 1);
  return top + (c.kind === 'pie' ? 190 : 170) + (c.kind === 'pie' ? 0 : wrapped ? 42 : 30) + c.belowRows.length * 16 + 12;
};

/**
 * The exhibit drawn the way the book draws it (its chart type, the labels it prints on the bars, the totals above the stacks, the notes beside
 * the chart), from the figures the book plots. It is our own drawing, never the book's picture. The exhibit's table stays beside it as the
 * exact source of every figure.
 */
export function ExhibitChart({ exhibit, chart }: { exhibit: SolutionExhibit; chart: Chart }) {
  const panels = chart.panels.length > 0 ? chart.panels : [chart];
  const each = panels.length > 1 ? 330 : 560;
  const W = each * panels.length;
  const H = Math.max(...panels.map(panelHeight));
  const description = `${exhibit.title}: ${panels
    .map((p) => `${p.heading ? `${p.heading}: ` : ''}${p.categories.map((c, i) => `${c} ${p.series.map((s) => s.labels[i] || s.values[i]).join(', ')}`).join('; ')}`)
    .join(' | ')}`;
  return (
    <div className="max-w-full overflow-x-auto text-ink">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={description} className="h-auto" style={{ width: '100%', maxWidth: W, minWidth: Math.min(W, 420) }}>
        {panels.map((p, i) => (
          <g key={i} transform={`translate(${each * i},0)`}>
            <Panel chart={p} width={each} />
          </g>
        ))}
      </svg>
    </div>
  );
}
