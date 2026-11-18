import { cleanup, render, screen, within } from '@testing-library/react';
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

/** Each pill and the state it is drawn in, in order: which part of the case is finished, open, at hand or still to come. */
function pills(over: Partial<LiveView> = {}): [string, string][] {
  cleanup(); // one strip on screen at a time, so several readings can be taken in one test
  render(<ClockBar view={liveView(over)} now={NOW} />);
  return within(screen.getByRole('list', { name: 'Steps of the case' }))
    .getAllByRole('listitem')
    .map((p) => [p.textContent?.trim() ?? '', p.dataset.state ?? '']);
}

/** The pills on screen now, in order. */
const items = (): HTMLElement[] => within(screen.getByRole('list', { name: 'Steps of the case' })).getAllByRole('listitem');

/** Each pill as a screen reader meets it: the words on it, and the name it is given (the state word, or nothing for the part at hand). */
const named = (): [string, string | null][] => items().map((p) => [p.textContent?.trim() ?? '', p.getAttribute('aria-label')]);

/** The pills on screen now, by the state they are drawn in. */
const byState = (): Record<string, HTMLElement> => Object.fromEntries(items().map((p) => [p.dataset.state ?? '', p]));

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

  // Issue #166: the shape the books ask for since #148 - a brainstorm in the middle of the plan, with more of the case after it.
  // The fixture is one plan throughout: exhibit, brainstorm, exhibit, step, exhibit.
  const MID_CASE_PLAN = { hasBrainstorm: true, exhibitsTotal: 3, beatsTotal: 5 } as const;
  const handedIn = [{ kind: 'brainstorm' as const, text: 'Four ways to group the shops', timedOut: false }];

  it('leaves the discussion open while a mid-case brainstorm runs, with parts of the case still to work', () => {
    const working = pills({ ...MID_CASE_PLAN, stage: 'exhibits', beatsShown: 1 });
    expect(working).toEqual([
      ['Prompt', 'done'],
      ['Framework', 'done'],
      ['Exhibits', 'current'],
      ['Brainstorm', 'ahead'],
      ['Recommendation', 'ahead'],
    ]);

    const brainstorming = pills({ ...MID_CASE_PLAN, stage: 'brainstorm_think', beatsShown: 2 });
    expect(brainstorming).toEqual([
      ['Prompt', 'done'],
      ['Framework', 'done'],
      ['Exhibits', 'open'],
      ['Brainstorm', 'current'],
      ['Recommendation', 'ahead'],
    ]);
    // the mini Bucket and the marker stay on the part at hand, and the exhibits the member has not worked are not called finished
    expect(screen.getAllByRole('listitem').filter((p) => p.getAttribute('aria-current') === 'step').map((p) => p.textContent?.trim())).toEqual(['Brainstorm']);

    const back = pills({ ...MID_CASE_PLAN, stage: 'exhibits', beatsShown: 3, submissions: handedIn });
    expect(back).toEqual([
      ['Prompt', 'done'],
      ['Framework', 'done'],
      ['Exhibits', 'current'],
      ['Brainstorm', 'done'],
      ['Recommendation', 'ahead'],
    ]);
  });

  it('fills the discussion in once the case reaches a brainstorm with every part of it worked', () => {
    const closing = pills({ ...MID_CASE_PLAN, stage: 'brainstorm_write', beatsShown: 5, submissions: [] });
    expect(closing).toEqual([
      ['Prompt', 'done'],
      ['Framework', 'done'],
      ['Exhibits', 'done'],
      ['Brainstorm', 'current'],
      ['Recommendation', 'ahead'],
    ]);
  });

  it('marks nothing finished while a brainstorm the book asks for first runs, before the member has worked a part', () => {
    // 20 of the 844 live-eligible cases put the brainstorm before any part of the discussion: plan brainstorm, exhibit, step.
    const first = pills({ hasBrainstorm: true, exhibitsTotal: 1, beatsTotal: 3, beatsShown: 1, stage: 'brainstorm_think' });
    expect(first).toEqual([
      ['Prompt', 'done'],
      ['Framework', 'done'],
      ['Exhibits', 'open'],
      ['Brainstorm', 'current'],
      ['Recommendation', 'ahead'],
    ]);
    expect(first.filter(([, state]) => state === 'done').map(([label]) => label)).toEqual(['Prompt', 'Framework']);
  });

  // The guarantee #152 stated: nothing the member has finished is ever un-done, and the strip only ever gains ground. A part goes
  // from still to come, to underway, to finished, and never back - which of the underway parts carries the marker is not ground.
  it('only ever gains ground, part by part, through a case whose brainstorm runs in the middle', () => {
    const ground = { ahead: 0, open: 1, current: 1, done: 2 } as const;
    // The plan exhibit, brainstorm, exhibit, step, exhibit, as the case works through it.
    const walk: Partial<LiveView>[] = [
      { stage: 'prompt', beatsShown: 0 },
      { stage: 'framework_think', beatsShown: 0 },
      { stage: 'framework_write', beatsShown: 0 },
      { stage: 'exhibits', beatsShown: 1 },
      { stage: 'brainstorm_think', beatsShown: 2 },
      { stage: 'brainstorm_write', beatsShown: 2 },
      { stage: 'exhibits', beatsShown: 3, submissions: handedIn },
      { stage: 'exhibits', beatsShown: 4, submissions: handedIn },
      { stage: 'exhibits', beatsShown: 5, submissions: handedIn },
      { stage: 'recommend_think', beatsShown: 5, submissions: handedIn },
      { stage: 'recommend_write', beatsShown: 5, submissions: handedIn },
      { stage: 'done', beatsShown: 5, submissions: handedIn, status: 'done', endReason: 'completed' },
    ];
    let before: Record<string, number> = {};
    for (const step of walk) {
      const now = Object.fromEntries(pills({ ...MID_CASE_PLAN, ...step }).map(([label, state]) => [label, ground[state as keyof typeof ground]]));
      for (const [label, reached] of Object.entries(before)) {
        expect(now[label], `${label} lost ground at ${step.stage}`).toBeGreaterThanOrEqual(reached);
      }
      before = now;
    }
    // and by the end every part of the case is behind the member
    expect(before).toEqual({ Prompt: 2, Framework: 2, Exhibits: 2, Brainstorm: 2, Recommendation: 2 });
  });

  // Issue #176: the strip was read in a browser for the first time, and what it says at a glance (and to a screen reader) is what
  // these three tests hold. The fixture is the mid-case brainstorm, which is the one shape that puts all four states on screen at once.
  const FOUR_STATES = { ...MID_CASE_PLAN, stage: 'brainstorm_think' as const, beatsShown: 2 };

  it('draws the four states four different ways, and marks three of them with a shape as well as a fill', () => {
    expect(pills(FOUR_STATES)).toEqual([
      ['Prompt', 'done'],
      ['Framework', 'done'],
      ['Exhibits', 'open'],
      ['Brainstorm', 'current'],
      ['Recommendation', 'ahead'],
    ]);
    const pill = byState();
    // no two states are drawn alike: whatever the four looks are, they are four
    expect(new Set(Object.values(pill).map((p) => p.className)).size).toBe(4);
    // and the difference is not only colour: a part behind the member is ticked, a part standing open carries a continuation,
    // the part at hand carries the mini Bucket, and a part still to come carries nothing at all
    expect(pill.done.querySelector('[data-mark="finished"]')).not.toBeNull();
    expect(pill.open.querySelector('[data-mark="open"]')).not.toBeNull();
    expect(pill.current.querySelector('svg')).not.toBeNull();
    expect(pill.ahead.querySelector('svg')).toBeNull();
  });

  it('says which state each part is in to a screen reader, in the words the strip already means', () => {
    pills(FOUR_STATES);
    expect(named()).toEqual([
      ['Prompt', 'Prompt, finished'],
      ['Framework', 'Framework, finished'],
      ['Exhibits', 'Exhibits, still open'],
      ['Brainstorm', null], // the part at hand is the one aria-current marks, so it needs no word of its own
      ['Recommendation', 'Recommendation, still to come'],
    ]);
    const current = byState().current;
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(current.textContent?.trim()).toBe('Brainstorm');
  });

  it('still says which part is finished and which is still to come once the case is over and nothing is at hand', () => {
    pills({ ...MID_CASE_PLAN, stage: 'recommend_write', beatsShown: 5, submissions: handedIn });
    expect(named()).toEqual([
      ['Prompt', 'Prompt, finished'],
      ['Framework', 'Framework, finished'],
      ['Exhibits', 'Exhibits, finished'],
      ['Brainstorm', 'Brainstorm, finished'],
      ['Recommendation', null],
    ]);

    pills({ ...MID_CASE_PLAN, stage: 'done', beatsShown: 5, submissions: handedIn, status: 'done', endReason: 'completed' });
    expect(named().map(([, name]) => name)).toEqual([
      'Prompt, finished',
      'Framework, finished',
      'Exhibits, finished',
      'Brainstorm, finished',
      'Recommendation, finished',
    ]);
    expect(items().filter((p) => p.getAttribute('aria-current') === 'step')).toEqual([]);
  });

  it('shows the whole case behind the member once it is over', () => {
    const over = strip({ stage: 'done', status: 'done', endReason: 'completed' });
    expect(over.current).toEqual([]);
    expect(over.done).toEqual(['Prompt', 'Framework', 'Exhibits', 'Recommendation']);
  });
});
