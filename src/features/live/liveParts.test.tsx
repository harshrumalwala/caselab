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
  it('draws the chart the book drew above the table', () => {
    render(<ExhibitView exhibit={exhibit({ chart: barChart })} />);
    const chart = screen.getByRole('img', { name: /Exhibit 1: Occupancy by season/ });
    expect(chart).toBeInTheDocument();
    expect(chart.tagName.toLowerCase()).toBe('svg');
    // the figures the book plots are drawn, not only listed
    expect([...chart.querySelectorAll('text')].map((t) => t.textContent)).toEqual(expect.arrayContaining(['85%', '40%', 'Summer', 'Winter']));
    // and the table is still there, unchanged, below the chart
    const table = screen.getByRole('table');
    expect(within(table).getByText('Winter')).toBeInTheDocument();
    expect(chart.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('says so when the values were read off a chart', () => {
    const { rerender } = render(<ExhibitView exhibit={exhibit({ approx: true, chart: barChart })} />);
    expect(screen.getByText('(values read off a chart, approximate)')).toBeInTheDocument();
    rerender(<ExhibitView exhibit={exhibit()} />);
    expect(screen.queryByText('(values read off a chart, approximate)')).not.toBeInTheDocument();
  });

  it('keeps a table bigger than the full-solution caps whole, and plots every row of it', () => {
    const rows = Array.from({ length: 90 }, (_, i) => [`M${i + 1}`, String(i + 1)]);
    render(
      <ExhibitView
        exhibit={exhibit({
          title: 'Exhibit 2: Units by month',
          columns: ['Month', 'Units'],
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
