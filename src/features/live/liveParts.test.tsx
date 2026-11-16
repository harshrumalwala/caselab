import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicExhibit } from '../../data/liveCase';
import { ExhibitView } from './liveParts';

const exhibit = (over: Partial<PublicExhibit> = {}): PublicExhibit => ({
  beat: 1,
  title: 'Exhibit 1: Occupancy by season',
  caption: 'Share of rooms sold',
  columns: ['Season', 'Occupancy'],
  rows: [
    ['Summer', '85%'],
    ['Winter', '40%'],
  ],
  approx: false,
  chart: null,
  ...over,
});

const barChart = {
  kind: 'bar',
  axisTitle: 'Occupancy',
  unit: '%',
  categories: ['Summer', 'Winter'],
  series: [{ name: 'Occupancy', values: [85, 40], labels: ['85%', '40%'], type: 'bar', color: '' }],
};

describe('an exhibit in a live case', () => {
  it('draws the chart the book drew, and no table that only repeats the figures printed on it', () => {
    render(<ExhibitView exhibit={exhibit({ chart: barChart })} />);
    const chart = screen.getByRole('img', { name: /Exhibit 1: Occupancy by season/ });
    expect(chart).toBeInTheDocument();
    expect(chart.tagName.toLowerCase()).toBe('svg');
    // the figures the book prints on the chart are on it
    expect([...chart.querySelectorAll('text')].map((t) => t.textContent)).toEqual(expect.arrayContaining(['85%', '40%', 'Summer', 'Winter']));
    // and our transcription of them is not shown beneath it
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Exhibit 1: Occupancy by season')).toBeInTheDocument();
    expect(screen.getByText('Share of rooms sold')).toBeInTheDocument();
  });

  it('shows only the chart for a chart read off the page, whose table is our own reading of it', () => {
    const rows = [
      ['1', '~45'],
      ['2', '~65'],
      ['Other ~ 460', '~250'],
    ];
    render(
      <ExhibitView
        exhibit={exhibit({
          title: 'Cumulative sales by customer',
          columns: ['Customer', 'Cumulative revenue (million USD)'],
          rows,
          approx: true,
          chart: {
            kind: 'bar',
            axisTitle: 'Revenue (million USD)',
            categories: ['1', '2', 'Other ~ 460'],
            series: [{ name: 'Cumulative revenue', values: [45, 65, 250], labels: ['', '', ''] }],
            valueLabels: false,
            footnote: 'Horizontal axis: Customers',
            referenceLines: [{ value: 205, label: '80%', color: 'orange' }],
          },
        })}
      />,
    );
    expect(screen.getByRole('img', { name: /Cumulative sales by customer/ })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // the table is hidden, so a note about how its figures were read would refer to figures the member cannot see
    expect(screen.queryByText(/approximate/)).not.toBeInTheDocument();
  });

  it('shows only the charts of a survey drawn as side-by-side panels, not the table of its answers', () => {
    const panel = (heading: string) => ({
      kind: 'stacked',
      heading,
      unit: '%',
      percent: true,
      categories: ['Do you need both?', 'Would you buy?'],
      series: [
        { name: 'Yes', values: [60, 75], labels: ['60%', '75%'] },
        { name: 'No', values: [40, 25], labels: ['40%', '25%'] },
      ],
      totals: ['25', '15'],
    });
    render(
      <ExhibitView
        exhibit={exhibit({
          title: 'Survey results of 25 customers',
          columns: ['Chart', 'Question and answer', 'Share'],
          rows: [
            ['Customer demand (25 customers)', 'Do you need both? - Yes', '60%'],
            ['Customer demand (15 customers)', 'Would you buy? - No', '25%'],
          ],
          chart: { kind: 'stacked', panels: [panel('Customer demand'), panel('Buyers')] },
        })}
      />,
    );
    expect(screen.getByRole('img', { name: /Survey results of 25 customers/ })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('keeps a table the book prints beside its chart (a population row the chart does not carry)', () => {
    render(
      <ExhibitView
        exhibit={exhibit({
          title: 'Exhibit A: Market segments',
          caption: "A table beneath gives each segment's population.",
          columns: ['Segment', 'Books per year', 'Population'],
          rows: [
            ['Super readers', '15', '8M'],
            ['Occasional readers', '10', '20M'],
          ],
          chart: {
            kind: 'bar',
            categories: ['Super readers', 'Occasional readers'],
            series: [{ name: 'Books per year', type: 'bar', values: [15, 10], labels: ['15', '10'] }],
            belowRows: [{ label: 'Population', values: ['8M', '20M'] }],
          },
        })}
      />,
    );
    expect(screen.getByRole('img', { name: /Exhibit A: Market segments/ })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Population')).toBeInTheDocument();
    expect(within(table).getByText('20M')).toBeInTheDocument();
  });

  it('keeps the exact table when the chart plots figures it does not print, because the book gave that table', () => {
    render(
      <ExhibitView
        exhibit={exhibit({
          title: 'Exhibit 4: Cost and savings schedule',
          columns: ['Year', 'Savings'],
          rows: [
            ['2019', '1,500'],
            ['2020', '7,500'],
          ],
          chart: { kind: 'line', categories: ['2019', '2020'], series: [{ name: 'Savings', values: [1500, 7500], labels: [] }], valueLabels: false },
        })}
      />,
    );
    expect(screen.getByRole('img', { name: /Exhibit 4/ })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('7,500')).toBeInTheDocument();
  });

  it('draws no chart for an exhibit that has none, and still shows the table', () => {
    const { container } = render(<ExhibitView exhibit={exhibit()} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Season', 'Occupancy']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('85%')).toBeInTheDocument();
  });

  it('draws no chart for a chart kind we do not draw, and leaves no empty frame', () => {
    const { container } = render(<ExhibitView exhibit={exhibit({ chart: { ...barChart, kind: 'waterfall' } })} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('says the values were read off a chart only while the table of those values is shown', () => {
    // a table with a column the chart does not carry stays, and so does the note that explains its figures
    const withNotes = exhibit({
      approx: true,
      columns: ['Season', 'Occupancy', 'Sample size'],
      rows: [['Summer', '85%', '120 hotels'], ['Winter', '40%', '95 hotels']],
      chart: barChart,
    });
    const { rerender } = render(<ExhibitView exhibit={withNotes} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('(values read off a chart, approximate)')).toBeInTheDocument();
    // a table that only repeats the chart is hidden, and the note goes with it
    rerender(<ExhibitView exhibit={exhibit({ approx: true, chart: barChart })} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('(values read off a chart, approximate)')).not.toBeInTheDocument();
    // an exhibit that was not read off a chart never carries it
    rerender(<ExhibitView exhibit={exhibit()} />);
    expect(screen.queryByText('(values read off a chart, approximate)')).not.toBeInTheDocument();
  });

  it('shows the note with an exhibit that has no chart drawn but a table of approximate figures', () => {
    render(<ExhibitView exhibit={exhibit({ approx: true, chart: { ...barChart, kind: 'waterfall' } })} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('(values read off a chart, approximate)')).toBeInTheDocument();
  });

  it('keeps a table bigger than the full-solution caps whole, and plots every row of it', () => {
    // a third column the chart does not plot keeps the table (a table that only repeated the chart would be left out)
    const rows = Array.from({ length: 90 }, (_, i) => [`M${i + 1}`, String(i + 1), `Reading ${i + 1}`]);
    render(
      <ExhibitView
        exhibit={exhibit({
          title: 'Exhibit 2: Units by month',
          columns: ['Month', 'Units', 'Note'],
          rows,
          // the earlier chart form: plot the exhibit's own columns
          chart: { kind: 'line', labelColumn: 0, seriesColumns: [1] },
        })}
      />,
    );
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(91);
    expect(within(table).getByText('M90')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /M90 90/ })).toBeInTheDocument();
  });

  it('plots a chart with more points than a write-up may hold', () => {
    const months = Array.from({ length: 90 }, (_, i) => `M${i + 1}`);
    render(
      <ExhibitView
        exhibit={exhibit({
          title: 'Exhibit 3: Units by month',
          chart: { kind: 'line', categories: months, series: [{ name: 'Units', values: months.map((_, i) => i + 1), labels: [], type: 'bar', color: '' }] },
        })}
      />,
    );
    expect(screen.getByRole('img', { name: /M90 90/ })).toBeInTheDocument();
  });
});
