import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { rowToBookNotes } from './data/caseLibrary';
import { makeCase } from './test/builders';
import { createFakeEnv, SAMPLE_LIBRARY, TEST_USER, type FakeEnv } from './test/fakeBackend';

const HOTEL = SAMPLE_LIBRARY[0];
const SMOOTHIES = SAMPLE_LIBRARY[1]; // linked below, but we have no analysis of it

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
  return within(await screen.findByRole('dialog', { name: title }));
}

async function envWith(over: Parameters<typeof makeCase>[0]) {
  const env = createFakeEnv();
  await env.repo.insertCase(makeCase({ date: '2026-09-01', ...over }));
  return env;
}

describe('from the book, in a case you did', () => {
  it('shows what a strong answer covers, the ideas it tests, the common mistakes, the difficulty and the skills', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id });
    const drawer = await openCase('Army Hotel', env);
    const section = within(await drawer.findByRole('region', { name: 'From the book' }));
    expect(section.getByText('A hotel chain asks whether to open a new property near a military base.')).toBeInTheDocument();
    expect(section.getByText(/check the break-even occupancy/)).toBeInTheDocument();
    expect(section.getByText('Seasonality')).toBeInTheDocument();
    expect(section.getByText('Skipping the break-even check before recommending')).toBeInTheDocument();
    expect(section.getByText('Medium')).toBeInTheDocument();
    expect(section.getByText('Framework')).toBeInTheDocument();
    expect(section.getByText('Quant / Math')).toBeInTheDocument();
    expect(section.getByText(/in our own words/)).toBeInTheDocument();
    expect(section.queryByText(/couldn't be read/)).not.toBeInTheDocument();
  });

  it('is not there for a case with no link, or a linked case we have not read yet', async () => {
    const unlinked = await envWith({ title: 'My own case' });
    expect((await openCase('My own case', unlinked)).queryByRole('region', { name: 'From the book' })).not.toBeInTheDocument();
  });

  it('is not there for a linked case we have not analysed, and says nothing about it', async () => {
    const env = await envWith({ title: 'Hawaiian Smoothies', libraryId: SMOOTHIES.id });
    const drawer = await openCase('Hawaiian Smoothies', env);
    await waitFor(() => expect(env.library.notesAsked).toContain(SMOOTHIES.id));
    expect(drawer.queryByRole('region', { name: 'From the book' })).not.toBeInTheDocument();
  });

  it('stays quiet when the lookup fails', async () => {
    const env = await envWith({ title: 'Army Hotel', libraryId: HOTEL.id });
    env.library.state.failing = true;
    const drawer = await openCase('Army Hotel', env);
    await waitFor(() => expect(env.library.notesAsked).toContain(HOTEL.id));
    expect(drawer.queryByRole('region', { name: 'From the book' })).not.toBeInTheDocument();
    expect(drawer.getByText('Army Hotel')).toBeInTheDocument();
  });
});

describe('a row from the database', () => {
  const row = { difficulty: 4, skills: ['quant', 'exhibits'], concepts: ['NPV'], summary: ' A summary ', strong_answer: ' An answer ', pitfalls: ['A slip'], confidence: 'partial' };

  it('becomes our notes, tidied', () => {
    expect(rowToBookNotes(row)).toEqual({ difficulty: 4, skills: ['quant', 'exhibits'], concepts: ['NPV'], summary: 'A summary', strongAnswer: 'An answer', pitfalls: ['A slip'], confidence: 'partial' });
  });

  it('leaves out a row that is not shaped as expected, and tolerates missing lists and an odd difficulty or confidence', () => {
    expect(rowToBookNotes(null)).toBeNull();
    expect(rowToBookNotes({ ...row, summary: '' })).toBeNull();
    expect(rowToBookNotes({ ...row, strong_answer: undefined as unknown as string })).toBeNull();
    expect(rowToBookNotes({ ...row, skills: null, concepts: null, pitfalls: null })).toMatchObject({ skills: [], concepts: [], pitfalls: [] });
    expect(rowToBookNotes({ ...row, difficulty: 9 })?.difficulty).toBe(3);
    expect(rowToBookNotes({ ...row, confidence: 'weird' })?.confidence).toBe('high');
  });
});
