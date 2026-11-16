import { describe, expect, it } from 'vitest';
import { blankChart, parseSolutionExhibit, type ExhibitChart, type SolutionExhibit } from './bookSolution';
import { cellsTheChartDoesNotShow, tableRepeatsChart } from './liveExhibit';

const series = (name: string, values: number[], labels: string[] = [], type: 'bar' | 'line' = 'bar') => ({ name, values, labels, type, color: '' });
const chart = (over: Partial<ExhibitChart>): ExhibitChart => ({ ...blankChart, ...over });
const exhibit = (over: Partial<SolutionExhibit>): SolutionExhibit => ({
  title: 'Exhibit 1',
  caption: '',
  columns: [],
  rows: [],
  approx: false,
  howToRead: '',
  takeaways: [],
  chart: null,
  cut: [],
  shortened: [],
  ...over,
});

describe('a table under a drawn chart', () => {
  it('is kept when there is no chart: there is nothing for it to repeat', () => {
    expect(tableRepeatsChart(exhibit({ columns: ['Season', 'Occupancy'], rows: [['Summer', '85%']], chart: null }))).toBe(false);
  });

  it('repeats the chart when every figure and word in it is printed on the chart', () => {
    const e = exhibit({
      columns: ['Season', 'Occupancy'],
      rows: [
        ['Summer', '85%'],
        ['Winter', '40%'],
      ],
      chart: chart({ categories: ['Summer', 'Winter'], series: [series('Occupancy', [85, 40], ['85%', '40%'])] }),
    });
    expect(tableRepeatsChart(e)).toBe(true);
    expect(cellsTheChartDoesNotShow(e)).toEqual([]);
  });

  it('repeats a chart that prints the value on each bar, though no label was written', () => {
    const e = exhibit({
      columns: ['Season', 'Rooms'],
      rows: [['Summer', '1,200']],
      chart: chart({ categories: ['Summer'], series: [series('Rooms', [1200])], valueLabels: true }),
    });
    expect(tableRepeatsChart(e)).toBe(true);
  });

  it('is kept when the chart plots the figures but prints none of them: the exact table is then the book\'s', () => {
    const e = exhibit({
      columns: ['Year', 'Revenue'],
      rows: [
        ['2018', '205'],
        ['2019', '210'],
      ],
      chart: chart({ categories: ['2018', '2019'], series: [series('Revenue', [205, 210])], valueLabels: false }),
    });
    expect(tableRepeatsChart(e)).toBe(false);
    expect(cellsTheChartDoesNotShow(e)).toEqual(['205', '210']);
  });

  it('repeats a chart whose figures were read off the picture, even though it prints none (our own reading of the drawing)', () => {
    const e = exhibit({
      approx: true,
      columns: ['Customer', 'Cumulative revenue'],
      rows: [
        ['1', '~45'],
        ['2', '~65'],
        ['Other ~ 460', '~250'],
      ],
      chart: chart({ categories: ['1', '2', 'Other ~ 460'], series: [series('Cumulative revenue', [45, 65, 250])], valueLabels: false, footnote: 'Horizontal axis: Customers' }),
    });
    expect(tableRepeatsChart(e)).toBe(true);
  });

  it('is kept when a column holds something the chart does not print, such as a population the book gives in a table', () => {
    const e = exhibit({
      columns: ['Segment', 'Books per year', 'Population'],
      rows: [
        ['Heavy readers', '15', '8M'],
        ['Light readers', '10', '20M'],
      ],
      chart: chart({ categories: ['Heavy readers', 'Light readers'], series: [series('Books per year', [15, 10], ['15', '10'])] }),
    });
    expect(tableRepeatsChart(e)).toBe(false);
    expect(cellsTheChartDoesNotShow(e)).toEqual(['8M', '20M']);
  });

  it('is kept when it matches the chart only through the rows of text under the chart\'s axis', () => {
    const e = exhibit({
      columns: ['Segment', 'Books per year', 'Population'],
      rows: [
        ['Heavy readers', '15', '8M'],
        ['Light readers', '10', '20M'],
      ],
      chart: chart({
        categories: ['Heavy readers', 'Light readers'],
        series: [series('Books per year', [15, 10], ['15', '10'])],
        belowRows: [{ label: 'Population', values: ['8M', '20M'] }],
      }),
    });
    expect(tableRepeatsChart(e)).toBe(false);
  });

  it('is kept when it names something the chart never names', () => {
    const e = exhibit({
      columns: ['Season', 'Occupancy', 'Note'],
      rows: [['Summer', '85%', 'Peak season, school holidays']],
      chart: chart({ categories: ['Summer'], series: [series('Occupancy', [85], ['85%'])] }),
    });
    expect(tableRepeatsChart(e)).toBe(false);
  });

  it('compares a figure with its scale: 20M is not 20', () => {
    const e = exhibit({
      columns: ['Segment', 'Population'],
      rows: [['Heavy readers', '20M']],
      chart: chart({ categories: ['Heavy readers'], series: [series('Books per year', [20], ['20'])] }),
    });
    expect(tableRepeatsChart(e)).toBe(false);
  });

  it('does not count a value the book prints nothing on (a blank label means no figure on that bar)', () => {
    const e = exhibit({
      columns: ['Season', 'Occupancy'],
      rows: [
        ['Summer', '85%'],
        ['Winter', '40%'],
      ],
      chart: chart({ categories: ['Summer', 'Winter'], series: [series('Occupancy', [85, 40], ['85%', ' '])] }),
    });
    expect(tableRepeatsChart(e)).toBe(false);
  });

  it('counts the share a pie prints on each slice', () => {
    const e = exhibit({
      columns: ['Channel', 'Share'],
      rows: [
        ['Retail', '60%'],
        ['Online', '40%'],
      ],
      chart: chart({ kind: 'pie', categories: ['Retail', 'Online'], series: [series('Sales', [60, 40])], valueLabels: false }),
    });
    expect(tableRepeatsChart(e)).toBe(true);
  });

  it('reads the panels of a chart, and text cells made of the chart\'s own headings, questions and footnotes', () => {
    const panel = (heading: string, questions: string[], footnote = ''): ExhibitChart =>
      chart({
        kind: 'stacked',
        heading,
        percent: true,
        categories: questions,
        series: [series('Yes', [20, 75], ['20%', '75%']), series('No', [80, 25], ['80%', '25%'])],
        footnote,
      });
    const e = exhibit({
      columns: ['Chart', 'Question and answer', 'Share'],
      rows: [
        ['Customer buyers (25 customers)', 'Do you know the product? - Yes', '20%'],
        ['Customer buyers (25 customers)', 'Would you try it? - No', '25%'],
        ['Customer buyers', 'Expected upsell potential', '75% of current revenue'],
      ],
      chart: chart({
        kind: 'stacked',
        panels: [
          { ...panel('Customer buyers', ['Do you know the product?', 'Would you try it?'], 'Expected upsell potential: 75% of current revenue'), totals: ['25', '25'] },
        ],
        // the parser leaves the top level without series when there are panels
      }),
    });
    expect(tableRepeatsChart(e)).toBe(true);
  });

  it('treats a table with no rows as having nothing to hide', () => {
    expect(tableRepeatsChart(exhibit({ columns: ['A'], rows: [], chart: chart({ categories: ['a'], series: [series('s', [1])] }) }))).toBe(false);
  });

  it('works on what the parser makes of a write-up\'s exhibit', () => {
    const parsed = parseSolutionExhibit({
      title: 'Exhibit 1',
      columns: ['Season', 'Occupancy'],
      rows: [['Summer', '85%']],
      chart: { kind: 'bar', categories: ['Summer'], series: [{ name: 'Occupancy', values: [85], labels: ['85%'] }] },
    });
    expect(parsed.chart).not.toBeNull();
    expect(tableRepeatsChart(parsed)).toBe(true);
  });
});
