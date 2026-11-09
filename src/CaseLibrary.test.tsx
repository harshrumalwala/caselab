import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { makeCase } from './test/builders';
import { createFakeEnv, SAMPLE_LIBRARY, TEST_USER, type FakeEnv } from './test/fakeBackend';

const HOTEL = SAMPLE_LIBRARY[0];

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(`caselab:v1:tour:${TEST_USER.userId}`, '1');
});

async function openLogCase(env: FakeEnv = createFakeEnv()) {
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  await user.click(screen.getByRole('button', { name: 'Log case' }));
  const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
  const d = within(dialog);
  return { user, env, dialog: d, title: d.getByRole('combobox', { name: /Case title/ }) };
}

const saved = async (env: FakeEnv) => (await env.repo.loadAll()).cases;
const settle = () => new Promise((r) => setTimeout(r, 450));

describe('suggestions while you type a case title', () => {
  it('is just the case title box until you start typing, and looks nothing up on its own', async () => {
    const { env, dialog, title } = await openLogCase();
    expect(title).toHaveValue('');
    expect(dialog.queryByRole('listbox', { name: 'Casebook cases' })).not.toBeInTheDocument();
    expect(dialog.queryByLabelText(/Find it in the casebooks/)).not.toBeInTheDocument(); // no separate search box
    expect(env.library.queries).toEqual([]);
  });

  it('suggests casebook cases with the book, type and industry, and marks the co-chairs\' picks', async () => {
    const { user, dialog, title } = await openLogCase();
    await user.type(title, 'army');
    const list = await dialog.findByRole('listbox', { name: 'Casebook cases' });
    expect(within(list).getByText(/pick one to fill in the rest/)).toBeInTheDocument();
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Army Hotel');
    expect(options[0]).toHaveTextContent('Co-chair pick');
    expect(options[0]).toHaveTextContent('Booth MCG 2026-2027 · Market Entry · Travel / Hospitality');
    expect(options[1]).toHaveTextContent('Army Base Housing');
    expect(options[1]).not.toHaveTextContent('Co-chair pick');
  });

  it('says which other books a case is also in, so someone who did it from another book recognises it', async () => {
    const { user, dialog, title } = await openLogCase();
    await user.type(title, 'smoothies');
    const list = await dialog.findByRole('listbox', { name: 'Casebook cases' });
    expect(within(list).getByRole('option', { name: /Hawaiian Smoothies/ })).toHaveTextContent('Also in Kellogg Case Book 2020');
    // And a case that is in one book only says nothing of the kind.
    await user.clear(title);
    await user.type(title, 'army ho');
    expect(await within(await dialog.findByRole('listbox', { name: 'Casebook cases' })).findByRole('option', { name: /Army Hotel/ })).not.toHaveTextContent('Also in');
  });

  it('fills in the title, the book as the source, the case type and the industry when you pick one', async () => {
    const { user, dialog, title } = await openLogCase();
    await user.type(title, 'army ho');
    await user.click(await dialog.findByRole('option', { name: /Army Hotel/ }));
    expect(title).toHaveValue('Army Hotel');
    expect(dialog.getByLabelText('Case source')).toHaveValue('Booth MCG 2026-2027');
    expect(dialog.getByLabelText(/Case type/)).toHaveValue('Market Entry');
    expect(dialog.getByLabelText(/Industry/)).toHaveValue('Travel / Hospitality');
    expect(dialog.getByText(/Filled in from Army Hotel \(Booth MCG 2026-2027\)/)).toBeInTheDocument();
    expect(dialog.queryByRole('listbox', { name: 'Casebook cases' })).not.toBeInTheDocument();
  });

  it('does not suggest the case you just picked all over again', async () => {
    const { user, env, dialog, title } = await openLogCase();
    await user.type(title, 'army ho');
    await user.click(await dialog.findByRole('option', { name: /Army Hotel/ }));
    const asked = env.library.queries.length;
    await settle();
    expect(env.library.queries.length).toBe(asked);
    expect(dialog.queryByRole('listbox', { name: 'Casebook cases' })).not.toBeInTheDocument();
    // But editing the title does bring suggestions back.
    await user.type(title, 's');
    await waitFor(() => expect(env.library.queries.length).toBeGreaterThan(asked));
  });

  it('remembers which casebook case it was, so the log can tell it is done', async () => {
    const { user, env, dialog, title } = await openLogCase();
    await user.type(title, 'army ho');
    await user.click(await dialog.findByRole('option', { name: /Army Hotel/ }));
    await user.click(dialog.getByRole('button', { name: 'Save case' }));
    await dialog.findByText('Case saved');
    const [only] = await saved(env);
    expect(only).toMatchObject({ title: 'Army Hotel', source: 'Booth MCG 2026-2027', caseType: 'Market Entry', libraryId: HOTEL.id });
  });

  it('lets you choose with the keyboard: arrows to move, Enter to take it, and Enter does not submit the form', async () => {
    const { user, env, dialog, title } = await openLogCase();
    await user.type(title, 'army');
    await dialog.findByRole('listbox', { name: 'Casebook cases' });
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}'); // the second suggestion: Army Base Housing
    expect(title).toHaveValue('Army Base Housing');
    expect(dialog.getByLabelText(/Case type/)).toHaveValue('Investment Decision');
    expect(screen.queryByText('Case saved')).not.toBeInTheDocument();
    expect(await saved(env)).toEqual([]);
  });

  it('never takes a suggestion by surprise: Enter without choosing one leaves what you typed', async () => {
    const { user, dialog, title } = await openLogCase();
    await user.type(title, 'army');
    await dialog.findByRole('listbox', { name: 'Casebook cases' });
    await user.keyboard('{Enter}');
    expect(title).toHaveValue('army');
    expect(dialog.queryByText(/Filled in from/)).not.toBeInTheDocument();
  });

  it('closes the list on Escape without closing the whole form', async () => {
    const { user, dialog, title } = await openLogCase();
    await user.type(title, 'army');
    await dialog.findByRole('listbox', { name: 'Casebook cases' });
    await user.keyboard('{Escape}');
    expect(title).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('dialog', { name: 'Log a case' })).toBeInTheDocument();
  });

  it('says nothing, and does not look anything up, for a single letter', async () => {
    const { user, env, title } = await openLogCase();
    await user.type(title, 'a');
    await settle();
    expect(env.library.queries).toEqual([]);
  });

  it('says nothing when no book has the case, and a title of your own is saved as before, with no link', async () => {
    const { user, env, dialog, title } = await openLogCase();
    await user.type(title, 'My own regional airline case');
    await settle();
    expect(dialog.queryByRole('listbox', { name: 'Casebook cases' })).not.toBeInTheDocument();
    expect(dialog.queryByText(/No case found|Couldn't/)).not.toBeInTheDocument();
    await user.selectOptions(dialog.getByLabelText(/Case type/), 'Profitability');
    await user.selectOptions(dialog.getByLabelText(/Industry/), 'Transportation / Logistics');
    await user.click(dialog.getByRole('button', { name: 'Save case' }));
    await dialog.findByText('Case saved');
    const [only] = await saved(env);
    expect(only.title).toBe('My own regional airline case');
    expect(only.libraryId ?? null).toBeNull();
  });

  it('does not get in the way when looking in the casebooks fails', async () => {
    const { user, env, dialog, title } = await openLogCase();
    env.library.state.failing = true;
    await user.type(title, 'army');
    await settle();
    expect(dialog.queryByRole('listbox', { name: 'Casebook cases' })).not.toBeInTheDocument();
    expect(dialog.queryByText(/Couldn't/)).not.toBeInTheDocument();
    expect(title).toHaveValue('army');
  });

  it('keeps what you picked but drops the link when you remove it', async () => {
    const { user, env, dialog, title } = await openLogCase();
    await user.type(title, 'army ho');
    await user.click(await dialog.findByRole('option', { name: /Army Hotel/ }));
    await user.click(dialog.getByRole('button', { name: 'Remove the link to the casebook case' }));
    expect(dialog.queryByText(/Filled in from/)).not.toBeInTheDocument();
    expect(title).toHaveValue('Army Hotel');
    await user.click(dialog.getByRole('button', { name: 'Save case' }));
    await dialog.findByText('Case saved');
    const [only] = await saved(env);
    expect(only.title).toBe('Army Hotel');
    expect(only.libraryId ?? null).toBeNull();
  });

  it('is a plain title box when editing a case', async () => {
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ title: 'Already logged', date: '2026-09-01' }));
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    window.location.hash = '#/log';
    await screen.findByRole('heading', { name: 'My Case Log' });
    await user.click((await screen.findAllByRole('button', { name: /Edit/ }))[0]);
    const dialog = within(await screen.findByRole('dialog', { name: /Edit case/ }));
    const title = dialog.getByRole('textbox', { name: /Case title/ });
    await user.type(title, ' army');
    await settle();
    expect(dialog.queryByRole('combobox', { name: /Case title/ })).not.toBeInTheDocument();
    expect(env.library.queries).toEqual([]);
  });

  it('is a plain title box in demo mode, where the account is not used', async () => {
    const env = createFakeEnv();
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    await user.click(await screen.findByRole('button', { name: /Explore with demo data/ }));
    await screen.findByRole('region', { name: 'Your week' });
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Log a case' }));
    await user.type(dialog.getByRole('textbox', { name: /Case title/ }), 'army');
    await settle();
    expect(env.library.queries).toEqual([]);
  });
});

describe('the link on a case', () => {
  it('survives editing the case', async () => {
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ title: 'Army Hotel', libraryId: HOTEL.id, date: '2026-09-01' }));
    const [c] = await saved(env);
    expect(c.libraryId).toBe(HOTEL.id);
    await env.repo.updateCase({ ...c, title: 'Army Hotel, redone' });
    await waitFor(async () => expect((await saved(env))[0].libraryId).toBe(HOTEL.id));
  });
});
