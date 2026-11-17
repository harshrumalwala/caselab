import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { blankChart, parseBookSolution, parseSolutionExhibit, type ExhibitChart as Chart, type SolutionExhibit } from '../../domain/bookSolution';
import { ExhibitChart } from './ExhibitChart';

const exhibit = (title: string): SolutionExhibit => ({ title, caption: '', columns: ['A'], rows: [['1']], approx: false, howToRead: '', takeaways: [], chart: null, cut: [], shortened: [] });
const series = (name: string, values: number[], over: Partial<Chart['series'][number]> = {}) => ({ name, values, labels: [], type: 'bar' as const, color: '', ...over });

function draw(chart: Partial<Chart>) {
  const { container } = render(<ExhibitChart exhibit={exhibit('Exhibit 1')} chart={{ ...blankChart, ...chart }} />);
  return container.querySelector('svg') as SVGSVGElement;
}
const text = (svg: SVGSVGElement) => [...svg.querySelectorAll('text')].map((t) => t.textContent);

describe("the book's charts, redrawn", () => {
  it('draws bars with the value on each, the axis title, and the rows the book prints under the axis', () => {
    const svg = draw({
      kind: 'bar',
      axisTitle: 'Total revenue',
      unit: '$M',
      categories: ['2006', '2007'],
      series: [series('Revenue', [100, 200], { labels: ['100', '200'] })],
      belowRows: [{ label: 'EBITDA', values: ['10%', '15%'] }],
      yMax: 200,
      yStep: 50,
    });
    expect(svg.querySelectorAll('rect')).toHaveLength(2);
    expect(text(svg)).toEqual(expect.arrayContaining(['Total revenue', '100', '200', '2006', '2007', 'EBITDA', '10%', '15%', '$200M']));
  });

  it('draws stacks with the segment names inside, the totals on top and the notes beside, and fills each stack for a percent chart', () => {
    const svg = draw({
      kind: 'stacked',
      categories: ['2008', '2009'],
      series: [series('Grocery', [180, 190]), series('Salons', [100, 100])],
      totals: ['434M', '447M'],
      sideNotes: { heading: "CAGR '08-'10", items: ['0%', '5%'] },
      segmentNames: true,
    });
    expect(text(svg)).toEqual(expect.arrayContaining(['Grocery', 'Salons', '434M', '447M', "CAGR '08-'10", '0%', '5%']));
    const pct = draw({ kind: 'stacked', percent: true, categories: ['2009'], series: [series('Salons', [60]), series('Drug stores', [20])], segmentNames: true });
    expect(text(pct)).toEqual(expect.arrayContaining(['100', 'Salons', 'Drug stores']));
  });

  it('draws lines over bars with the line names at the ends, and a line chart on its own', () => {
    const svg = draw({
      kind: 'bar',
      categories: ['Performance', 'Price'],
      series: [series('Importance', [4.7, 3.7], { labels: ['4.7', '3.7'] }), series('Brand A', [4.8, 3.7], { type: 'line', color: 'yellow' })],
      yMin: 1,
      yMax: 5,
      yStep: 1,
    });
    expect(svg.querySelectorAll('polyline')).toHaveLength(1);
    expect(text(svg)).toEqual(expect.arrayContaining(['Brand A', '4.7']));
    expect(draw({ kind: 'line', categories: ['0', '3'], series: [series('% Infected', [0, 20])] }).querySelectorAll('polyline')).toHaveLength(1);
  });

  it('draws a pie with the printed labels (or the shares), a scatter with labelled points, and sideways bars with their numbers along the bottom', () => {
    const pie = draw({ kind: 'pie', categories: ['Events.com', 'Other'], series: [series('Share', [17, 83], { labels: ['17%', ''] })] });
    expect(text(pie)).toEqual(expect.arrayContaining(['Events.com 17%', 'Other 83%']));
    const scatter = draw({ kind: 'scatter', categories: ['$0', '$300'], xValues: [0, 300], series: [series('Surgeries', [90, 75])] });
    expect(scatter.querySelectorAll('circle')).toHaveLength(2);
    const sideways = draw({ kind: 'bar', horizontal: true, categories: ['Comedy', 'Drama'], series: [series('Domestic', [1500, 1000])], yStep: 500 });
    expect(text(sideways)).toEqual(expect.arrayContaining(['Comedy', 'Drama', '1,500', '1,000', '0', '500']));
  });

  it('prints a value only where the book does: a deliberate blank label, or valueLabels off, prints nothing', () => {
    const blank = draw({ kind: 'bar', categories: ['a', 'b'], series: [series('X', [7, 23], { labels: ['\u00a0', '23%'] })] });
    expect(text(blank)).toEqual(expect.arrayContaining(['23%']));
    expect(text(blank)).not.toContain('7');
    const none = draw({ kind: 'bar', valueLabels: false, categories: ['a'], series: [series('X', [7])] });
    expect(text(none)).not.toContain('7');
    expect(text(draw({ kind: 'bar', footnote: '*Average run of 30 days', categories: ['a'], series: [series('X', [1])] }))).toContain('*Average run of 30 days');
  });

  it('wraps a long category name onto two lines rather than cutting it off', () => {
    const svg = draw({ kind: 'bar', categories: ['Performance', 'Exclusivity', 'Price', 'Trendiness', 'Direct incentives', 'Natural ingredients'], series: [series('Importance', [4.7, 4.5, 3.7, 3.2, 3.2, 2.5])] });
    expect(text(svg)).toEqual(expect.arrayContaining(['Direct', 'incentives', 'Natural', 'ingredients', 'Price']));
  });

  it('puts several charts in one exhibit side by side, each with its heading, and at most two to a row', () => {
    const panel = (heading: string) => ({ ...blankChart, kind: 'stacked' as const, heading, categories: ['x'], series: [series('COGS', [3])] });
    const svg = draw({ kind: 'stacked', panels: [panel('VARIABLE'), panel('FIXED'), panel('EXTRA')] });
    expect(text(svg)).toEqual(expect.arrayContaining(['VARIABLE', 'FIXED', 'EXTRA']));
    const [w, h] = (svg.getAttribute('viewBox') ?? '').split(' ').slice(2).map(Number);
    expect(w).toBeLessThanOrEqual(680);
    expect(h).toBeGreaterThan(300); // two rows
  });

  // Issue #95 raised the panel cap from four to eight (the library's biggest exhibit has six charts). The drawing lays panels two to a
  // row, so more of them makes the exhibit taller and never narrower: each panel keeps the width and the height it had at four.
  it('lays out five, six and eight charts two to a row, each the same size as in a four-panel exhibit', () => {
    const panel = (heading: string) => ({ ...blankChart, kind: 'bar' as const, heading, categories: ['x'], series: [series('COGS', [3])] });
    const box = (n: number) => {
      const svg = draw({ kind: 'bar', panels: Array.from({ length: n }, (_, i) => panel(`P${i + 1}`)) });
      const [w, h] = (svg.getAttribute('viewBox') ?? '').split(' ').slice(2).map(Number);
      return { w, h, headings: text(svg).filter((t) => t?.startsWith('P')).length, svg };
    };
    const four = box(4);
    for (const n of [5, 6, 8]) {
      const many = box(n);
      expect(many.headings, `${n} panels`).toBe(n); // every chart is drawn, none dropped
      expect(many.w, `${n} panels`).toBe(four.w); // the same two columns, so no panel is squeezed
      expect(many.h, `${n} panels`).toBe((four.h / 2) * Math.ceil(n / 2)); // one more row, nothing overlapping
      // and nothing is drawn outside the box the viewBox claims
      expect(Math.max(...[...many.svg.querySelectorAll('text')].map((t) => Number(t.getAttribute('y')) || 0))).toBeLessThan(many.h);
    }
  });

  // The series cap went from six to sixteen in the same issue: ten stacks in the library have more than six segments, and the last ones
  // used to be dropped. The key wraps onto as many rows as it needs and the panel grows to hold them.
  it('draws every segment of a thirteen-segment stack, with a key that wraps and no two neighbours in the same grey', () => {
    const names = Array.from({ length: 13 }, (_, i) => `Segment ${i + 1}`);
    const svg = draw({ kind: 'stacked', categories: ['2026'], series: names.map((n, i) => series(n, [i + 1])) });
    expect(text(svg)).toEqual(expect.arrayContaining(names));
    const key = swatches(svg);
    expect(key).toHaveLength(13);
    const fill = key.map((r) => r.getAttribute('fill'));
    expect(fill.slice(0, 6)).toEqual(['#d2d2d2', '#a9a9a9', '#7e7e7e', '#555555', '#3d3d3d', '#2a2a2a']);
    expect(fill.every((f, i) => i === 0 || f !== fill[i - 1])).toBe(true); // the ramp starts again rather than repeating one grey
    // the key sits inside the panel: several rows, and the plot moved down to make room for them
    const rows = new Set(key.map((r) => r.getAttribute('y')));
    expect(rows.size).toBeGreaterThan(1);
    const h = Number((svg.getAttribute('viewBox') ?? '').split(' ')[3]);
    expect(Math.max(...[...svg.querySelectorAll('text')].map((t) => Number(t.getAttribute('y')) || 0))).toBeLessThan(h);
  });

  it('describes the chart for a screen reader', () => {
    const svg = draw({ kind: 'bar', categories: ['2006', '2007'], series: [series('Revenue', [100, 120], { labels: ['100', '120'] })] });
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg.getAttribute('aria-label')).toMatch(/Exhibit 1: 2006 100; 2007 120/);
  });

  it('stacks only the bar series: a line laid over a stacked chart stays a line', () => {
    const svg = draw({
      kind: 'stacked',
      categories: ['2013', '2014'],
      series: [series('Own', [40, 40]), series('Other', [55, 50]), series('Total', [95, 90], { type: 'line' })],
      yMax: 100,
      yStep: 20,
    });
    // four stacked segments, plus a swatch each for the two bar series in the key (the line is not a segment)
    expect(svg.querySelectorAll('rect')).toHaveLength(6);
    expect(svg.querySelectorAll('polyline')).toHaveLength(1);
  });

  it('prints every few category labels on a long monthly series, and all of them on a short one', () => {
    const months = Array.from({ length: 61 }, (_, i) => `Mon-${2010 + Math.floor(i / 12)}-${i}`);
    const long = draw({ kind: 'line', categories: months, series: [series('Price', months.map((_, i) => 100 + i))] });
    const printed = text(long).filter((t) => t?.startsWith('Mon-'));
    expect(printed.length).toBeGreaterThan(5);
    expect(printed.length).toBeLessThan(31);
    const short = draw({ kind: 'line', categories: ['2013', '2014', '2015'], series: [series('Price', [1, 2, 3])] });
    expect(text(short)).toEqual(expect.arrayContaining(['2013', '2014', '2015']));
  });

  it('can leave the names off a scatter (the book labels none of the points), and wraps a long line name at the end of the line', () => {
    const base = { kind: 'scatter' as const, categories: ['Contract 1', 'Contract 2'], xValues: [10, 20], series: [series('Bid', [3000, 4000])] };
    expect(text(draw(base))).toEqual(expect.arrayContaining(['Contract 1', 'Contract 2']));
    const quiet = draw({ ...base, pointLabels: false });
    expect(text(quiet).filter((t) => t?.startsWith('Contract'))).toHaveLength(0);
    expect(text(quiet)).toEqual(expect.arrayContaining(['10', '20']));
    const line = draw({ kind: 'line', categories: ['a', 'b'], series: [series('Years to commercialization (right-hand axis, 0 to 8)', [7, 2])] });
    const lines = text(line).filter((t) => t && /commercialization|right-hand|axis/.test(t));
    expect(lines.length).toBeGreaterThan(1);
  });

  it('breaks a long footnote into lines, so none runs off the edge', () => {
    const note = 'Expected YoY Market Growth: 10% for stage one and 20% for stage two. Likeliness of commercial success: Stage 1 10%, Stage 2 25%, Stage 3 60%.';
    const svg = draw({ kind: 'bar', categories: ['a', 'b'], series: [series('x', [1, 2])], footnote: note });
    const lines = text(svg).filter((t) => t && /Expected|Stage|growth|success/i.test(t));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toContain('Stage 3 60%.');
  });

  it('leaves room for the long names beside sideways bars, and prints only the x values of a crowded scatter that fit', () => {
    const names = ['Customer service', 'Electronic products', 'Close to home'];
    const svg = draw({ kind: 'bar', horizontal: true, categories: names, series: [series('Client', [80, 70, 60])], yStep: 20 });
    names.forEach((n) => {
      const t = [...svg.querySelectorAll('text')].find((el) => el.textContent === n);
      expect(t).toBeTruthy();
      // the name ends at the plot's left edge and starts to the right of the SVG's own left edge
      expect(Number(t!.getAttribute('x')) - n.length * 5.4).toBeGreaterThan(0);
    });
    const xs = Array.from({ length: 40 }, (_, i) => 10 + i * 0.05);
    const crowded = draw({ kind: 'scatter', pointLabels: false, categories: xs.map((_, i) => `P${i}`), xValues: xs, series: [series('Y', xs.map((v) => v * 2))] });
    expect(text(crowded).filter((t) => t && /^1\d(\.\d)?$/.test(t)).length).toBeLessThan(25);
  });

  it('names each bar in a key when a bar chart has several series, and prints no key for one series', () => {
    const several = draw({ kind: 'bar', categories: ['2005', '2006'], series: [series('Public', [10, 12]), series('Private', [4, 5])] });
    expect(text(several)).toEqual(expect.arrayContaining(['Public', 'Private']));
    const sideways = draw({ kind: 'bar', horizontal: true, categories: ['Price'], series: [series('Client', [80]), series('Competitor', [70])] });
    expect(text(sideways)).toEqual(expect.arrayContaining(['Client', 'Competitor']));
    const one = draw({ kind: 'bar', categories: ['2005'], series: [series('Public', [10])] });
    expect(text(one)).not.toContain('Public');
  });

  const fills = (svg: SVGSVGElement) => [...svg.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
  const swatches = (svg: SVGSVGElement) => [...svg.querySelectorAll('rect')].filter((r) => r.getAttribute('width') === '10' && r.getAttribute('height') === '10');

  it('gives a stack whose segments are not named a key, and none to a stack that prints its names inside the segments', () => {
    const base = { kind: 'stacked' as const, percent: true, categories: ['Need both', 'Buy from Circle'], series: [series('Both', [60, 20]), series('Only air bubble', [24, 33]), series('Only stretch plastics', [16, 47])] };
    const keyed = draw(base);
    expect(text(keyed)).toEqual(expect.arrayContaining(['Both', 'Only air bubble', 'Only stretch plastics']));
    expect(swatches(keyed)).toHaveLength(3);
    // the names inside the segments already say which is which
    const named = draw({ ...base, segmentNames: true });
    expect(swatches(named)).toHaveLength(0);
    expect(text(named).filter((t) => t === 'Both')).toHaveLength(2); // once per stack, none in a key
    // one series, or unnamed series, is not worth a key
    expect(swatches(draw({ kind: 'stacked', categories: ['a'], series: [series('Only', [5])] }))).toHaveLength(0);
    expect(swatches(draw({ kind: 'stacked', categories: ['a'], series: [series('', [5]), series('', [6])] }))).toHaveLength(0);
  });

  it('puts the key above the totals and the plot, and starts a second row when the names do not fit across the panel', () => {
    const svg = draw({
      kind: 'stacked',
      percent: true,
      axisTitle: 'Share of customers',
      categories: ['One', 'Two'],
      series: [series('Both products', [60, 20]), series('Only air bubble', [24, 33]), series('Only stretch plastics', [16, 47])],
      totals: ['25', '15'],
    });
    const plotTop = Math.min(...[...svg.querySelectorAll('line')].map((l) => Number(l.getAttribute('y1'))));
    const keyBottom = Math.max(...swatches(svg).map((r) => Number(r.getAttribute('y')) + 10));
    const totalTop = Math.min(...[...svg.querySelectorAll('text')].filter((t) => ['25', '15'].includes(t.textContent ?? '')).map((t) => Number(t.getAttribute('y')) - 11));
    expect(keyBottom).toBeLessThanOrEqual(totalTop);
    expect(totalTop).toBeLessThan(plotTop);
    // in a narrow panel (two charts side by side) the three names wrap onto a second row rather than running off the edge
    const narrow = draw({
      kind: 'stacked',
      panels: ['Customer demand', 'Air bubble buyers'].map((heading) => ({
        ...blankChart,
        kind: 'stacked' as const,
        heading,
        percent: true,
        categories: ['Q1', 'Q2'],
        series: [series('Both products', [60, 20]), series('Only air bubble', [24, 33]), series('Only stretch plastics', [16, 47])],
      })),
    });
    const firstPanel = swatches(narrow).filter((r) => Number(r.getAttribute('x')) < 340);
    expect(new Set(firstPanel.map((r) => r.getAttribute('y'))).size).toBeGreaterThan(1);
    expect(Math.max(...firstPanel.map((r) => Number(r.getAttribute('x'))))).toBeLessThan(340);
    // the exhibit is tall enough for the second row: nothing is drawn below the bottom of the svg
    const h = Number(narrow.getAttribute('viewBox')!.split(' ')[3]);
    expect(Math.max(...[...narrow.querySelectorAll('text')].map((t) => Number(t.getAttribute('y'))))).toBeLessThan(h);
  });

  it('gives each panel of a multi-panel exhibit its own key', () => {
    const panel = (heading: string, names: [string, string]) => ({ ...blankChart, kind: 'stacked' as const, heading, percent: true, categories: ['Q1'], series: [series(names[0], [20]), series(names[1], [80])] });
    const svg = draw({ kind: 'stacked', panels: [panel('Awareness', ['Yes', 'No']), panel('Willingness', ['Willing', 'Not willing'])] });
    expect(swatches(svg)).toHaveLength(4);
    expect(text(svg)).toEqual(expect.arrayContaining(['Yes', 'No', 'Willing', 'Not willing']));
  });

  it("fills bars and stack segments in the colour the book gives a series, and the key's swatches match", () => {
    const colours = ['#e07b21', '#0f2a5c', '#0b8a8a'];
    const stack = draw({ kind: 'stacked', percent: true, categories: ['A'], series: [series('Both', [60], { color: 'orange' }), series('Air', [24], { color: 'navy' }), series('Stretch', [16], { color: 'teal' })] });
    expect(swatches(stack).map((r) => r.getAttribute('fill'))).toEqual(colours);
    expect(fills(stack).slice(3)).toEqual(colours); // the segments, after the three swatches
    const bars = draw({ kind: 'bar', categories: ['a', 'b'], series: [series('Yes', [3, 4], { color: 'Red' }), series('No', [2, 1], { color: ' green ' })] });
    expect(swatches(bars).map((r) => r.getAttribute('fill'))).toEqual(['#c8202f', '#3b8a3e']);
    expect(fills(bars).slice(2)).toEqual(['#c8202f', '#3b8a3e', '#c8202f', '#3b8a3e']);
    // the text inside a dark segment is white, inside a light one dark
    const labelled = draw({ kind: 'stacked', categories: ['A'], segmentNames: true, series: [series('Dark', [50], { color: 'navy' }), series('Light', [50], { color: 'yellow' })] });
    const ink = (name: string) => [...labelled.querySelectorAll('text')].find((t) => t.textContent === name)!.getAttribute('fill');
    expect(ink('Dark')).toBe('#ffffff');
    expect(ink('Light')).toBe('#1f1f1f');
  });

  it('falls back to the grey scale for a colour it does not know, for a series with no colour, and for a chart with none set', () => {
    const none = draw({ kind: 'stacked', categories: ['A'], series: [series('One', [1]), series('Two', [2]), series('Three', [3])] });
    expect(swatches(none).map((r) => r.getAttribute('fill'))).toEqual(['#d2d2d2', '#a9a9a9', '#7e7e7e']);
    expect(fills(none).slice(3)).toEqual(['#d2d2d2', '#a9a9a9', '#7e7e7e']);
    const odd = draw({ kind: 'stacked', categories: ['A'], series: [series('One', [1], { color: 'chartreuse' }), series('Two', [2], { color: 'url(javascript:1)' }), series('Three', [3], { color: 'teal' })] });
    expect(swatches(odd).map((r) => r.getAttribute('fill'))).toEqual(['#d2d2d2', '#a9a9a9', '#0b8a8a']);
    const hex = draw({ kind: 'bar', categories: ['A'], series: [series('One', [1], { color: '#123abc' }), series('Two', [2])] });
    expect(swatches(hex).map((r) => r.getAttribute('fill'))).toEqual(['#123abc', '#a9a9a9']);
  });

  it('keeps highlighted bars working with and without a colour on the series', () => {
    const chart = { kind: 'bar' as const, categories: ['1', '2', '3'], yMin: 0, yMax: 10, yStep: 5, highlight: [0, 2], highlightColor: 'orange' };
    expect(fills(draw({ ...chart, series: [series('x', [3, 5, 8])] }))).toEqual(['#e07b21', '#a9a9a9', '#e07b21']);
    // with a series colour the bars that are not picked out keep it
    const coloured = draw({ ...chart, series: [series('x', [3, 5, 8], { color: 'navy' })] });
    expect(fills(coloured)).toEqual(['#e07b21', '#0f2a5c', '#e07b21']);
    expect(swatches(coloured)).toHaveLength(0); // one series, no key
  });

  it('reads a series colour from a write-up and draws it', () => {
    const e = parseSolutionExhibit({
      title: 'E',
      columns: ['A'],
      rows: [['1']],
      chart: { kind: 'stacked', categories: ['a'], series: [{ name: 'Yes', values: [20], color: 'teal' }, { name: 'No', values: [80], color: 'orange' }] },
    });
    expect(swatches(draw({ ...e.chart! })).map((r) => r.getAttribute('fill'))).toEqual(['#0b8a8a', '#e07b21']);
  });

  it('draws the dashed line the book draws across a chart, with its label, and colours the bars the book picks out', () => {
    const svg = draw({
      kind: 'bar',
      categories: ['1', '2', '3', 'Other'],
      series: [series('Cumulative', [100, 160, 190, 250])],
      yMin: 0,
      yMax: 300,
      yStep: 100,
      valueLabels: false,
      referenceLines: [{ value: 200, label: '80%', color: 'orange' }],
      highlight: [0, 1, 2],
      highlightColor: 'orange',
    });
    const dashed = [...svg.querySelectorAll('line')].filter((l) => l.getAttribute('stroke-dasharray'));
    expect(dashed).toHaveLength(1);
    expect(dashed[0].getAttribute('stroke')).toBe('#e07b21');
    expect(dashed[0].getAttribute('y1')).toBe(dashed[0].getAttribute('y2'));
    expect(text(svg)).toContain('80%');
    const fills = [...svg.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
    expect(fills).toEqual(['#e07b21', '#e07b21', '#e07b21', '#a9a9a9']);
    // a chart with no highlight keeps its usual grey and has no dashed line
    const plain = draw({ kind: 'bar', categories: ['a', 'b'], series: [series('x', [1, 2])] });
    expect([...plain.querySelectorAll('rect')].map((r) => r.getAttribute('fill'))).toEqual(['#d2d2d2', '#d2d2d2']);
    expect([...plain.querySelectorAll('line')].filter((l) => l.getAttribute('stroke-dasharray'))).toHaveLength(0);
  });

  it('stretches the axis to a reference line above the bars, and draws an upright line across sideways bars', () => {
    const tall = draw({ kind: 'bar', categories: ['a', 'b'], series: [series('x', [10, 20])], referenceLines: [{ value: 90, label: 'Target', color: '' }] });
    const ticks = text(tall).map((t) => Number(String(t).replace(/[^0-9.]/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(90);
    const sideways = draw({ kind: 'bar', horizontal: true, categories: ['Price', 'Quality'], series: [series('Client', [80, 60])], yStep: 20, referenceLines: [{ value: 70, label: 'Par', color: '' }] });
    const line = [...sideways.querySelectorAll('line')].find((l) => l.getAttribute('stroke-dasharray'));
    expect(line).toBeTruthy();
    expect(line!.getAttribute('x1')).toBe(line!.getAttribute('x2'));
    expect(text(sideways)).toContain('Par');
  });

  it('reads reference lines and highlighted bars from a write-up, and drops what cannot be drawn', () => {
    const e = parseSolutionExhibit({
      title: 'E',
      columns: ['A'],
      rows: [['1']],
      chart: {
        kind: 'bar',
        categories: ['1', '2', '3'],
        series: [{ name: 'x', values: [1, 2, 3] }],
        referenceLines: [{ value: 2, label: '80%', color: 'orange' }, { value: 'not a number', label: 'bad' }, { label: 'no value' }],
        highlight: [0, 1, 7, -1, 1.5, 'x'],
        highlightColor: 'blue',
      },
    });
    expect(e.chart?.referenceLines).toEqual([{ value: 2, label: '80%', color: 'orange' }]);
    expect(e.chart?.highlight).toEqual([0, 1]);
    expect(e.chart?.highlightColor).toBe('blue');
  });

  it('is only drawn for a chart that can be drawn: a parsed chart always lines up with its categories', () => {
    const s = parseBookSolution({
      prompt: 'A question here',
      recommendation: 'A recommendation here',
      steps: [{ title: 'S', body: 'b' }],
      exhibits: [{ title: 'E', columns: ['A'], rows: [['1']], chart: { kind: 'bar', categories: ['a', 'b'], series: [{ name: 'x', values: [1] }] } }],
    });
    expect(s?.exhibits[0].chart).toBeNull();
    expect(within(document.body).queryByRole('img')).toBeNull();
    expect(screen).toBeTruthy();
  });
});
