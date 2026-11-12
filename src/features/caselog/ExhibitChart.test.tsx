import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { blankChart, parseBookSolution, type ExhibitChart as Chart, type SolutionExhibit } from '../../domain/bookSolution';
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
