import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LiveView, PublicExhibit } from '../../data/liveCase';
import { ClockBar, ExhibitView } from './liveParts';

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

  // Issue #95: a member working an exhibit must never be handed a shortened one as if it were the book's whole exhibit. The live case
  // sends the exhibit whole (see src/data/liveExhibitCaps.test.ts), so this should never be seen; it is here for the day it is.
  it('says so when a cap cut part of the exhibit, and says nothing when the whole of it is drawn', () => {
    const { rerender } = render(<ExhibitView exhibit={exhibit({ chart: barChart })} />);
    expect(screen.queryByText(/Not the whole exhibit/)).not.toBeInTheDocument();
    // 500 chart points against the live cap of 400: the member sees part of the line and is told so.
    const months = Array.from({ length: 500 }, (_, i) => `M${i + 1}`);
    rerender(
      <ExhibitView
        exhibit={exhibit({
          title: 'Exhibit 5: Units by month',
          chart: { kind: 'line', categories: months, series: [{ name: 'Units', values: months.map((_, i) => i + 1), labels: [], type: 'bar', color: '' }] },
        })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Not the whole exhibit');
  });

  it('says nothing for a chart kind we do not draw: the table beside it is the book\'s own exhibit', () => {
    render(<ExhibitView exhibit={exhibit({ chart: { ...barChart, kind: 'marimekko' } })} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/Not the whole exhibit/)).not.toBeInTheDocument();
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

const NOW = 1_700_000_000_000;

const liveView = (over: Partial<LiveView> = {}): LiveView => ({
  sessionId: 'session-1',
  serverNow: NOW,
  startedAt: NOW,
  endsAt: NOW + 20 * 60_000,
  stage: 'exhibits',
  stageStartedAt: NOW,
  stageEndsAt: NOW + 5 * 60_000,
  plannedEndsAt: NOW + 15 * 60_000,
  nextNudgeAt: null,
  frameworkPhase: 'framework',
  messages: [],
  exhibits: [],
  drafts: {},
  scratchpad: '',
  submissions: [],
  clarifyCount: 0,
  beatsTotal: 3,
  beatsShown: 1,
  exhibitsTotal: 3,
  hasBrainstorm: false,
  status: 'active',
  endReason: null,
  mode: 'practice',
  pausedAt: null,
  feedback: null,
  feedbackAttempts: 0,
  caseInfo: null,
  loggedCaseId: null,
  ...over,
});

/** The strip as a member reads it: every pill in order, which one is marked, and which ones are behind. */
function strip(over: Partial<LiveView> = {}) {
  const { unmount } = render(<ClockBar view={liveView(over)} now={NOW} />);
  const pills = within(screen.getByRole('list', { name: 'Steps of the case' })).getAllByRole('listitem');
  const labels = pills.map((p) => p.textContent?.trim() ?? '');
  const result = {
    labels,
    current: pills.filter((p) => p.getAttribute('aria-current') === 'step').map((p) => p.textContent?.trim() ?? ''),
    done: pills.filter((p) => p.dataset.state === 'done').map((p) => p.textContent?.trim() ?? ''),
    ahead: pills.filter((p) => p.dataset.state === 'ahead').map((p) => p.textContent?.trim() ?? ''),
    unmount,
  };
  return result;
}

describe('the progress strip of a live case', () => {
  it('marks the recommendation in a case whose book asks for no brainstorm', () => {
    const think = strip({ stage: 'recommend_think' });
    expect(think.labels).toEqual(['Prompt', 'Framework', 'Exhibits', 'Recommendation']);
    expect(think.current).toEqual(['Recommendation']);
    expect(think.done).toEqual(['Prompt', 'Framework', 'Exhibits']);
    think.unmount();

    const write = strip({ stage: 'recommend_write' });
    expect(write.current).toEqual(['Recommendation']);
    write.unmount();

    const exhibits = strip({ stage: 'exhibits' });
    expect(exhibits.current).toEqual(['Exhibits']);
    expect(exhibits.ahead).toEqual(['Recommendation']);
  });

  it('marks each step of a case that has a brainstorm', () => {
    const framework = strip({ hasBrainstorm: true, stage: 'framework_write' });
    expect(framework.labels).toEqual(['Prompt', 'Framework', 'Exhibits', 'Brainstorm', 'Recommendation']);
    expect(framework.current).toEqual(['Framework']);
    expect(framework.ahead).toEqual(['Exhibits', 'Brainstorm', 'Recommendation']);
    framework.unmount();

    const brainstorm = strip({ hasBrainstorm: true, stage: 'brainstorm_write' });
    expect(brainstorm.current).toEqual(['Brainstorm']);
    brainstorm.unmount();

    const recommend = strip({ hasBrainstorm: true, stage: 'recommend_write' });
    expect(recommend.current).toEqual(['Recommendation']);
    expect(recommend.done).toEqual(['Prompt', 'Framework', 'Exhibits', 'Brainstorm']);
  });

  it('comes back to the discussion with the case, and keeps a brainstorm already handed in behind the member', () => {
    const back = strip({
      hasBrainstorm: true,
      stage: 'exhibits',
      submissions: [
        { kind: 'framework', text: 'Revenue and cost', timedOut: false },
        { kind: 'brainstorm', text: 'Three ways to grow', timedOut: false },
      ],
    });
    expect(back.current).toEqual(['Exhibits']);
    expect(back.done).toEqual(['Prompt', 'Framework', 'Brainstorm']);
    expect(back.ahead).toEqual(['Recommendation']);
    back.unmount();

    // The second brainstorm of the same case: the marker is on it again.
    const second = strip({
      hasBrainstorm: true,
      stage: 'brainstorm_think',
      submissions: [{ kind: 'brainstorm', text: 'Three ways to grow', timedOut: false }],
    });
    expect(second.current).toEqual(['Brainstorm']);
  });

  it('calls the middle of a case that hands over no exhibit what it is, and still marks the recommendation', () => {
    const talking = strip({ exhibitsTotal: 0, stage: 'exhibits' });
    expect(talking.labels).toEqual(['Prompt', 'Framework', 'Discussion', 'Recommendation']);
    expect(talking.current).toEqual(['Discussion']);
    expect(screen.getByText('Discussion', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText(/Exhibit/)).not.toBeInTheDocument();
    talking.unmount();

    const closing = strip({ exhibitsTotal: 0, stage: 'recommend_write' });
    expect(closing.current).toEqual(['Recommendation']);
    expect(closing.done).toEqual(['Prompt', 'Framework', 'Discussion']);
  });

  it('marks the step of a learning case, which has no clock to show', () => {
    const learning = strip({ mode: 'learning', stage: 'recommend_write' });
    expect(learning.current).toEqual(['Recommendation']);
    expect(screen.queryAllByRole('timer')).toHaveLength(0);
    expect(screen.getByText(/no clock/)).toBeInTheDocument();
    learning.unmount();

    const brainstorming = strip({ mode: 'learning', hasBrainstorm: true, stage: 'brainstorm_think' });
    expect(brainstorming.current).toEqual(['Brainstorm']);
    expect(brainstorming.ahead).toEqual(['Recommendation']);
  });

  it('shows the whole case behind the member once it is over', () => {
    const over = strip({ stage: 'done', status: 'done', endReason: 'completed' });
    expect(over.current).toEqual([]);
    expect(over.done).toEqual(['Prompt', 'Framework', 'Exhibits', 'Recommendation']);
  });
});
