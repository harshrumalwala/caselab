import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { blankChart, parseBookSolution, parseSolutionExhibit, type ExhibitChart as Chart, type SolutionExhibit } from '../../domain/bookSolution';
import { ExhibitChart } from './ExhibitChart';

const exhibit = (title: string): SolutionExhibit => ({ title, caption: '', columns: ['A'], rows: [['1']], approx: false, howToRead: '', takeaways: [], chart: null });
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
    expect(svg.querySelectorAll('rect')).toHaveLength(4);
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
