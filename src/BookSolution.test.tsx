import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { parseBookSolution, parseFigure } from './domain/bookSolution';
import { makeCase } from './test/builders';
import { createFakeEnv, SAMPLE_LIBRARY, SAMPLE_LIBRARY_SOLUTIONS, TEST_USER, type FakeEnv } from './test/fakeBackend';

const HOTEL = SAMPLE_LIBRARY[0];
const SMOOTHIES = SAMPLE_LIBRARY[1]; // linked, but we have not written up its solution

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(`caselab:v1:tour:${TEST_USER.userId}`, '1');
});

async function openCase(title: string, env: FakeEnv) {
  window.location.hash = '#/log';
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'My Case Log' });
  await user.click((await screen.findAllByText(title))[0]);
  return { user, drawer: within(await screen.findByRole('dialog', { name: title })) };
}

async function envWith(over: Parameters<typeof makeCase>[0]) {
  const env = createFakeEnv();
  await env.repo.insertCase(makeCase({ date: '2026-09-01', ...over }));
  return env;
}

describe('the full solution, in a case you did', () => {
  it('starts closed, and opens to the question, the facts, the structure, the steps with their working, the exhibits as tables and the recommendation', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id });
    const { user, drawer } = await openCase('Army Hotel', env);
    const section = within(await drawer.findByRole('region', { name: 'Full solution' }));
    const toggle = section.getByRole('button', { name: /Full solution/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(section.queryByText('The solution, step by step')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(section.getByText('Should a hotel chain open a new property near a military base?')).toBeInTheDocument();
    expect(section.getByText('The base houses 20,000 soldiers.')).toBeInTheDocument();
    expect(section.getByText('Demand')).toBeInTheDocument();
    expect(section.getByText('Size peak demand')).toBeInTheDocument();
    expect(section.getByText('Rooms = 200 x 120 nights = 24,000 room-nights')).toBeInTheDocument();
    expect(section.getByText('Exhibit 1: Occupancy by season')).toBeInTheDocument();
    const table = within(section.getByRole('table'));
    expect(table.getByRole('columnheader', { name: 'Occupancy' })).toBeInTheDocument();
    expect(table.getByRole('cell', { name: '95%' })).toBeInTheDocument();
    expect(section.getByText('Open the hotel only if off-peak occupancy clears the break-even.')).toBeInTheDocument();
    expect(section.getByText('Base closure')).toBeInTheDocument();
    expect(section.queryByText(/Slips in the book/)).not.toBeInTheDocument();
    // Everything we add is purple and labelled as Bucket's tip; the book's solution is plain text.
    expect(section.getByText(/Purple tips are from Bucket/)).toBeInTheDocument();
    expect(section.getByText("Bucket's tip · How to read it fast")).toBeInTheDocument();
    expect(section.getByText("Bucket's tip · What to notice")).toBeInTheDocument();
    expect(section.getByText("Bucket's tip · How to deliver it")).toBeInTheDocument();
    const takeaways = within(section.getByRole('region', { name: "Bucket's top takeaways" }));
    expect(takeaways.getByText(/Bucket's top 2 takeaways/)).toBeInTheDocument();
    expect(takeaways.getByText(/Peak demand is not the year/)).toBeInTheDocument();
    expect(takeaways.getByText(/\(from the exhibit\)/)).toBeInTheDocument();
    await user.click(toggle);
    expect(section.queryByText('The solution, step by step')).not.toBeInTheDocument();
  });

  it('shows the clarifying questions, the hypothesis, the buckets, how to read each exhibit with a chart and its takeaways, and how to deliver the recommendation', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id });
    const { user, drawer } = await openCase('Army Hotel', env);
    const section = within(await drawer.findByRole('region', { name: 'Full solution' }));
    await user.click(section.getByRole('button', { name: /Full solution/ }));
    expect(section.getByText('Who pays for the rooms?')).toBeInTheDocument();
    expect(section.getByText(/The army pays a fixed per diem per soldier\./)).toBeInTheDocument();
    expect(section.getByText('It caps the nightly price.')).toBeInTheDocument();
    expect(section.getByText('The chain should build if off-peak occupancy clears break-even.')).toBeInTheDocument();
    expect(section.getByText('Will enough soldiers stay?')).toBeInTheDocument();
    expect(section.getByText('Occupancy decides revenue.')).toBeInTheDocument();
    expect(section.getByText("Bucket's tip · How to read it fast")).toBeInTheDocument();
    expect(section.getByText('Compare the two seasons first, then ask which one carries the year.')).toBeInTheDocument();
    expect(section.getByRole('img', { name: /Exhibit 1: Occupancy by season: Peak/ })).toBeInTheDocument(); // the chart, described for screen readers
    expect(section.getByText('Off-peak occupancy of 40% is the number that decides the case.')).toBeInTheDocument();
    expect(section.getByText("Bucket's tip · What to notice")).toBeInTheDocument();
    expect(section.getByText('Treating peak demand as year-round')).toBeInTheDocument();
    expect(section.getByText("Bucket's tip · How to deliver it")).toBeInTheDocument();
    expect(section.getByText(/I would not open it yet\./)).toBeInTheDocument();
    expect(section.getByText('Leaving out the off-peak months')).toBeInTheDocument();
  });

  it('keeps the table and the "read off a chart, approximate" note beside a drawn chart (unlike the live case, which hides both)', async () => {
    const exhibit = SAMPLE_LIBRARY_SOLUTIONS[HOTEL.id].exhibits[0];
    exhibit.approx = true;
    try {
      const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id });
      const { user, drawer } = await openCase('Army Hotel', env);
      const section = within(await drawer.findByRole('region', { name: 'Full solution' }));
      await user.click(section.getByRole('button', { name: /Full solution/ }));
      expect(section.getByRole('img', { name: /Exhibit 1: Occupancy by season/ })).toBeInTheDocument();
      expect(within(section.getByRole('table')).getByRole('cell', { name: '95%' })).toBeInTheDocument();
      expect(section.getByText('(values read off a chart, approximate)')).toBeInTheDocument();
    } finally {
      exhibit.approx = false;
    }
  });

  it('lets you tick what you did at each step, and lists what you did not as where your attempt differed', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id });
    const { user, drawer } = await openCase('Army Hotel', env);
    const section = within(await drawer.findByRole('region', { name: 'Full solution' }));
    await user.click(section.getByRole('button', { name: /Full solution/ }));
    expect(section.queryByRole('region', { name: 'Where your attempt differed' })).not.toBeInTheDocument();
    await user.click(section.getByRole('checkbox', { name: 'Did you separate peak from off-peak?' }));
    const differed = within(section.getByRole('region', { name: 'Where your attempt differed' }));
    expect(differed.getByText(/You ticked 1 of 3/)).toBeInTheDocument();
    expect(differed.getByText('Did you state your assumptions out loud?')).toBeInTheDocument();
    expect(differed.getByText('Did you compute a break-even before recommending?')).toBeInTheDocument();
    expect(differed.queryByText('Did you separate peak from off-peak?')).not.toBeInTheDocument();
    await user.click(section.getByRole('checkbox', { name: 'Did you state your assumptions out loud?' }));
    await user.click(section.getByRole('checkbox', { name: 'Did you compute a break-even before recommending?' }));
    expect(within(section.getByRole('region', { name: 'Where your attempt differed' })).getByText(/Nothing to revisit/)).toBeInTheDocument();
  });

  it('is not there for a case with no link, or a linked case whose solution we have not written up', async () => {
    const unlinked = await envWith({ title: 'My own case' });
    expect((await openCase('My own case', unlinked)).drawer.queryByRole('region', { name: 'Full solution' })).not.toBeInTheDocument();
  });

  it('is not there for a linked case that has no write-up yet', async () => {
    const env = await envWith({ title: 'Hawaiian Smoothies', libraryId: SMOOTHIES.id });
    const { drawer } = await openCase('Hawaiian Smoothies', env);
    await waitFor(() => expect(env.library.solutionsAsked).toContain(SMOOTHIES.id));
    expect(drawer.queryByRole('region', { name: 'Full solution' })).not.toBeInTheDocument();
  });

  it('stays quiet when the lookup fails', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id });
    env.library.state.failing = true;
    const { drawer } = await openCase('Army Hotel', env);
    await waitFor(() => expect(env.library.solutionsAsked).toContain(HOTEL.id));
    expect(drawer.queryByRole('region', { name: 'Full solution' })).not.toBeInTheDocument();
  });
});

describe('a write-up read from the database', () => {
  const good = {
    prompt: ' The question ',
    facts: ['A fact'],
    structure: [{ heading: 'Revenue', points: ['Price', 'Volume'] }],
    steps: [{ title: 'Step one', body: 'Do the thing', calc: ['1 + 1 = 2'] }],
    exhibits: [{ title: 'Exhibit 1', caption: '', columns: ['A', 'B'], rows: [['1', '2']], approx: true }],
    recommendation: 'Do it',
    risks: [],
    nextSteps: ['Next'],
    ourTakeaways: [{ title: 'One', detail: 'First thing', from: 'prompt' }, { title: 'Two', detail: 'Second thing', from: 'exhibit' }, { title: 'Three', detail: 'Third', from: 'brainstorm' }, { title: 'Four', detail: 'Fourth', from: 'prompt' }],
    confidence: 'partial',
  };

  it('becomes a solution, tidied', () => {
    expect(parseBookSolution(good)).toMatchObject({ prompt: 'The question', recommendation: 'Do it', confidence: 'partial' });
    expect(parseBookSolution(good)?.ourTakeaways.map((t) => t.title)).toEqual(['One', 'Two', 'Three']); // the top three only
    expect(parseBookSolution({ ...good, bookErrors: ['Slip'] })).not.toHaveProperty('bookErrors'); // slips are not part of a solution
    expect(parseBookSolution(JSON.stringify(good))?.steps[0].calc).toEqual(['1 + 1 = 2']);
    expect(parseBookSolution(good)?.exhibits[0].approx).toBe(true);
  });

  it('is refused unless it has a question, a recommendation and a step, and drops an exhibit with nothing in it', () => {
    expect(parseBookSolution(null)).toBeNull();
    expect(parseBookSolution('nope')).toBeNull();
    expect(parseBookSolution({ ...good, prompt: '' })).toBeNull();
    expect(parseBookSolution({ ...good, recommendation: ' ' })).toBeNull();
    expect(parseBookSolution({ ...good, steps: [] })).toBeNull();
    expect(parseBookSolution({ ...good, steps: [{ title: '', body: 'x' }] })).toBeNull();
    expect(parseBookSolution({ ...good, exhibits: [{ title: 'Empty', columns: ['A'], rows: [] }, good.exhibits[0]] })?.exhibits).toHaveLength(1);
  });

  it('reads the coaching layers, and tolerates a write-up from before them', () => {
    const rich = parseBookSolution({
      ...good,
      clarifyingQuestions: [{ question: ' Who pays? ', answer: ' The army ', why: 'Caps price' }, { question: 'No answer given', answer: '' }],
      hypothesis: { statement: 'Build it', basis: 'Peak is strong' },
      structure: [{ heading: 'Demand', keyQuestion: 'Enough soldiers?', why: 'Drives revenue', points: ['Leave'] }],
      steps: [{ title: 'S', body: 'b', whatToNotice: 'Look at the base', commonMiss: ['Peak only'], checkYourself: ['Did you split seasons?'] }],
      recommendationDetail: { because: ['Reason one'], delivery: 'Say it first.', commonMisses: ['Forgot risks'] },
    });
    expect(rich?.clarifyingQuestions).toEqual([{ question: 'Who pays?', answer: 'The army', why: 'Caps price' }]);
    const many = Array.from({ length: 9 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }));
    expect(parseBookSolution({ ...good, clarifyingQuestions: many })?.clarifyingQuestions.map((q) => q.question)).toEqual(['Q0', 'Q1', 'Q2', 'Q3', 'Q4']);
    expect(rich?.hypothesis).toEqual({ statement: 'Build it', basis: 'Peak is strong' });
    expect(rich?.structure[0]).toMatchObject({ keyQuestion: 'Enough soldiers?', why: 'Drives revenue' });
    expect(rich?.steps[0]).toMatchObject({ whatToNotice: 'Look at the base', commonMiss: ['Peak only'], checkYourself: ['Did you split seasons?'] });
    expect(rich?.recommendationDetail).toEqual({ because: ['Reason one'], delivery: 'Say it first.', commonMisses: ['Forgot risks'] });
    const old = parseBookSolution(good);
    expect(old?.clarifyingQuestions).toEqual([]);
    expect(old?.hypothesis).toBeNull();
    expect(old?.recommendationDetail).toBeNull();
    expect(old?.steps[0].checkYourself).toEqual([]);
  });

  it('keeps a chart only when its columns hold figures in every row, and reads figures like $1.2M, 95%, (300) and 1,200', () => {
    const base = { ...good, exhibits: [{ title: 'E', columns: ['Year', 'Sales', 'Note'], rows: [['2020', '$1.2M', 'a'], ['2021', '(300)', 'b']] }] };
    const withChart = (chart: unknown) => parseBookSolution({ ...base, exhibits: [{ ...base.exhibits[0], chart }] })?.exhibits[0].chart;
    // the earlier form: plot columns of the exhibit's own table
    const fromTable = withChart({ kind: 'bar', labelColumn: 0, seriesColumns: [1], unit: '$' });
    expect(fromTable).toMatchObject({ kind: 'bar', unit: '$', categories: ['2020', '2021'] });
    expect(fromTable?.series).toEqual([{ name: 'Sales', values: [1_200_000, -300], labels: [], type: 'bar', color: '' }]);
    expect(withChart({ kind: 'bar', labelColumn: 0, seriesColumns: [2] })).toBeNull(); // text, not figures
    expect(withChart({ kind: 'donut', labelColumn: 0, seriesColumns: [1] })).toBeNull();
    expect(withChart({ kind: 'line', labelColumn: 9, seriesColumns: [1] })).toBeNull();
    expect(withChart({ kind: 'line', labelColumn: 0, seriesColumns: [0, 1, 2] })?.series.map((x) => x.name)).toEqual(['Sales']);
    expect(withChart(undefined)).toBeNull();
    expect([parseFigure('$1.2M'), parseFigure('95%'), parseFigure('(300)'), parseFigure('1,200'), parseFigure('~40'), parseFigure('3x'), parseFigure('n/a'), parseFigure('')]).toEqual([1_200_000, 95, -300, 1200, 40, 3, null, null]);
  });

  it('reads a chart drawn the way the book draws it: the plotted figures, the totals and notes it prints, and several charts side by side', () => {
    const chart = {
      kind: 'stacked',
      axisTitle: 'Total hair product sales ($M)',
      categories: ['2008', '2009'],
      series: [
        { name: 'Grocery', values: [180, 190], labels: [], type: 'bar' },
        { name: 'Salons', values: [100, 100], labels: ['100', '100'] },
      ],
      totals: ['434M', '447M'],
      belowRows: [{ label: 'EBITDA', values: ['10%', '15%'] }],
      sideNotes: { heading: 'CAGR', items: ['0%', '5%'] },
      segmentNames: true,
      yMax: 500,
    };
    const parsed = parseBookSolution({ ...good, exhibits: [{ title: 'E', columns: ['A'], rows: [['1']], chart }] })?.exhibits[0].chart;
    expect(parsed).toMatchObject({ kind: 'stacked', axisTitle: 'Total hair product sales ($M)', totals: ['434M', '447M'], segmentNames: true, yMax: 500, percent: false, horizontal: false });
    expect(parsed?.series.map((x) => [x.name, x.type])).toEqual([['Grocery', 'bar'], ['Salons', 'bar']]);
    expect(parsed?.belowRows).toEqual([{ label: 'EBITDA', values: ['10%', '15%'] }]);
    expect(parsed?.sideNotes).toEqual({ heading: 'CAGR', items: ['0%', '5%'] });
    // a series that does not line up with the categories, or holds a non-figure, cannot be drawn
    const draw = (series: unknown) => parseBookSolution({ ...good, exhibits: [{ title: 'E', columns: ['A'], rows: [['1']], chart: { kind: 'bar', categories: ['a', 'b'], series } }] })?.exhibits[0].chart;
    expect(draw([{ name: 'x', values: [1, 2, 3] }])).toBeNull();
    expect(draw([{ name: 'x', values: [1, 'two'] }])).toBeNull();
    expect(draw([{ name: 'x', values: [1, 2] }])?.series).toHaveLength(1);
    // lines over bars, and panels
    const combo = parseBookSolution({ ...good, exhibits: [{ title: 'E', columns: ['A'], rows: [['1']], chart: { kind: 'bar', categories: ['a', 'b'], series: [{ name: 'Importance', values: [4.7, 4.5] }, { name: 'Brand A', values: [4.8, 4.5], type: 'line', color: 'yellow' }] } }] })?.exhibits[0].chart;
    expect(combo?.series.map((x) => [x.type, x.color])).toEqual([['bar', ''], ['line', 'yellow']]);
    const panels = parseBookSolution({ ...good, exhibits: [{ title: 'E', columns: ['A'], rows: [['1']], chart: { kind: 'stacked', panels: [{ kind: 'stacked', heading: 'VARIABLE', categories: ['Variable costs'], series: [{ name: 'COGS', values: [3] }] }, { kind: 'stacked', heading: 'FIXED', categories: ['Fixed costs'], series: [{ name: 'Warehouse', values: [1] }] }] } }] })?.exhibits[0].chart;
    expect(panels?.panels.map((p) => p.heading)).toEqual(['VARIABLE', 'FIXED']);
  });

  it('keeps an exhibit whose column headings are blank in the book, so the figures still line up', () => {
    const s = parseBookSolution({ ...good, exhibits: [{ title: 'Impact on Valuation', columns: ['', ''], rows: [['Total Cost Synergies', '$10,000,000']] }] });
    expect(s?.exhibits).toHaveLength(1);
    expect(s?.exhibits[0].columns).toEqual(['', '']);
    expect(s?.exhibits[0].rows).toEqual([['Total Cost Synergies', '$10,000,000']]);
  });

  it('keeps a wide table whole: up to sixteen columns, so no column of the books table is cut off', () => {
    const columns = Array.from({ length: 13 }, (_, i) => (i === 0 ? '' : `Product ${i}`));
    const row = columns.map((_, i) => (i === 0 ? 'Revenue' : String(i)));
    const s = parseBookSolution({ ...good, exhibits: [{ title: 'Revenue and Cost by Product', columns, rows: [row] }] });
    expect(s?.exhibits[0].columns).toHaveLength(13);
    expect(s?.exhibits[0].rows[0]).toHaveLength(13);
    expect(s?.exhibits[0].rows[0][12]).toBe('12');
  });

  it('keeps long tables and charts whole: up to seventy rows and seventy plotted points', () => {
    const n = 61;
    const rows = Array.from({ length: n }, (_, i) => [`M${i + 1}`, String(100 + i)]);
    const chart = { kind: 'line', categories: rows.map((r) => r[0]), series: [{ name: 'Price', values: rows.map((r) => Number(r[1])) }] };
    const s = parseBookSolution({ ...good, exhibits: [{ title: 'Monthly price', columns: ['Month', 'Price'], rows, chart }] });
    expect(s?.exhibits[0].rows).toHaveLength(n);
    expect(s?.exhibits[0].chart?.categories).toHaveLength(n);
    expect(s?.exhibits[0].chart?.series[0].values).toHaveLength(n);
  });

  it('tolerates missing lists and an odd confidence, and cuts rows to the columns', () => {
    const s = parseBookSolution({ prompt: 'q', recommendation: 'r', steps: [{ title: 't', body: 'b' }], confidence: 'weird', exhibits: [{ title: 'E', columns: ['A'], rows: [['1', '2', '3']] }] });
    expect(s).toMatchObject({ facts: [], structure: [], risks: [], nextSteps: [], ourTakeaways: [], confidence: 'high' });
    expect(s?.exhibits[0].rows).toEqual([['1']]);
  });
});
