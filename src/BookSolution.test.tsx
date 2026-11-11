import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { parseBookSolution } from './domain/bookSolution';
import { makeCase } from './test/builders';
import { createFakeEnv, SAMPLE_LIBRARY, TEST_USER, type FakeEnv } from './test/fakeBackend';

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
    await user.click(toggle);
    expect(section.queryByText('The solution, step by step')).not.toBeInTheDocument();
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
    bookErrors: ['Slip'],
    confidence: 'partial',
  };

  it('becomes a solution, tidied', () => {
    expect(parseBookSolution(good)).toMatchObject({ prompt: 'The question', recommendation: 'Do it', confidence: 'partial', bookErrors: ['Slip'] });
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

  it('tolerates missing lists and an odd confidence, and cuts rows to the columns', () => {
    const s = parseBookSolution({ prompt: 'q', recommendation: 'r', steps: [{ title: 't', body: 'b' }], confidence: 'weird', exhibits: [{ title: 'E', columns: ['A'], rows: [['1', '2', '3']] }] });
    expect(s).toMatchObject({ facts: [], structure: [], risks: [], nextSteps: [], bookErrors: [], confidence: 'high' });
    expect(s?.exhibits[0].rows).toEqual([['1']]);
  });
});
