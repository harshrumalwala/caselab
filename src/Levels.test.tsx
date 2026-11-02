import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { progressFor, xpAtLevel } from './domain/progress';
import { GAME_KEY, levelKey } from './state/storageKeys';
import { makeCase } from './test/builders';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';

const day = (i: number) => `2026-09-${String(i).padStart(2, '0')}`;
const SEEN = levelKey(TEST_USER.userId);

/** Enough cases, spread over days, for a given level or better. */
const manyCases = (n: number) => Array.from({ length: n }, (_, i) => makeCase({ date: day(1 + (i % 28)), title: `Case ${i}`, caseType: i % 2 ? 'Revenue' : 'Profitability', overall: 4, concepts: 'x', improvementArea: 'quant' }));

async function envWith(cases: ReturnType<typeof makeCase>[]): Promise<FakeEnv> {
  const env = createFakeEnv();
  for (const c of cases) await env.repo.insertCase(c);
  return env;
}

async function open(env: FakeEnv) {
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  return user;
}

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(`caselab:v1:tour:${TEST_USER.userId}`, '1');
});

const chip = () => screen.findByRole('button', { name: /^Your level: level/ });

describe('the level chip', () => {
  it('is a small pill with your level, title and XP, not a big tile', async () => {
    const cases = manyCases(6);
    const p = progressFor(cases);
    await open(await envWith(cases));
    const c = await chip();
    expect(c).toHaveAccessibleName(`Your level: level ${p.level}, ${p.title}, ${p.xp.toLocaleString('en-US')} XP. Open the details.`);
    expect(c).toHaveTextContent(p.title);
    expect(c).toHaveTextContent(`${p.xp.toLocaleString('en-US')} XP`);
    expect(screen.queryByRole('region', { name: 'Your level' })).not.toBeInTheDocument();
  });

  it('opens the full story: the level, what is left, the next title, where the XP came from and what earns it', async () => {
    const cases = manyCases(6);
    const p = progressFor(cases);
    const user = await open(await envWith(cases));
    await user.click(await chip());
    const dialog = within(await screen.findByRole('dialog', { name: 'Your level' }));
    expect(dialog.getByRole('heading', { name: `Level ${p.level}: ${p.title}` })).toBeInTheDocument();
    expect(dialog.getByText(new RegExp(`${p.toNext.toLocaleString('en-US')} to level ${p.level + 1}`))).toBeInTheDocument();
    expect(dialog.getByText(/Next title:/)).toBeInTheDocument();
    expect(dialog.getByText('Where yours came from')).toBeInTheDocument();
    expect(dialog.getByText('Logging cases').nextElementSibling).toHaveTextContent(p.breakdown.logging.toLocaleString('en-US'));
    expect(dialog.getByText(/Burned and interviewed cases earn nothing/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Your level' })).not.toBeInTheDocument());
  });

  it('is not shown until there is a first case to earn from', async () => {
    await open(createFakeEnv());
    expect(screen.queryByRole('button', { name: /^Your level: level/ })).not.toBeInTheDocument();
  });

  it('is hidden by "Show levels and XP" in Settings, comes back when it is switched on, and is remembered', async () => {
    const user = await open(await envWith(manyCases(3)));
    await chip();
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    const settings = await screen.findByRole('dialog', { name: 'Data & settings' });
    const sw = within(settings).getByRole('switch', { name: 'Show levels and XP' });
    expect(sw).toHaveAttribute('aria-checked', 'true'); // on by default

    await user.click(sw);
    expect(window.localStorage.getItem(GAME_KEY)).toBe('off');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Data & settings' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^Your level: level/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Data & settings' })).getByRole('switch', { name: 'Show levels and XP' }));
    expect(window.localStorage.getItem(GAME_KEY)).toBeNull();
    await user.keyboard('{Escape}');
    expect(await chip()).toBeInTheDocument();
  });

  it('starts off for a browser that was told to keep it simple', async () => {
    window.localStorage.setItem(GAME_KEY, 'off');
    await open(await envWith(manyCases(3)));
    expect(screen.queryByRole('button', { name: /^Your level: level/ })).not.toBeInTheDocument();
  });

  it('counts the cases you solved only: an interviewed case earns nothing', async () => {
    const env = await envWith(manyCases(4));
    const before = progressFor(manyCases(4)).xp;
    await env.interviewed.add({ date: day(2), title: 'Interviewed one', source: '', caseType: 'Profitability', industry: 'Insurance', partner: '', feedback: 'x', learned: 'y' });
    await open(env);
    expect(await chip()).toHaveTextContent(new RegExp(`${before.toLocaleString('en-US')} XP`));
  });
});

describe('big numbers', () => {
  it('are written with a thousands separator, so 1,573 XP and not 1573 XP', async () => {
    const lots = Array.from({ length: 60 }, (_, i) => makeCase({ date: `2026-0${1 + (i % 9)}-${String(1 + Math.floor(i / 9)).padStart(2, '0')}`, caseType: i % 2 ? 'Revenue' : 'Profitability', overall: 4, concepts: 'x', improvementArea: 'quant' }));
    const xp = progressFor(lots).xp;
    expect(xp).toBeGreaterThan(999);
    await open(await envWith(lots));
    expect(await chip()).toHaveTextContent(`${xp.toLocaleString('en-US')} XP`);
  });
});

describe('reaching a new level', () => {
  it('celebrates once with a stamp, the new level and a job title, and not again', async () => {
    window.localStorage.setItem(SEEN, '1');
    const cases = manyCases(8);
    const p = progressFor(cases);
    expect(p.level).toBeGreaterThan(1);
    const env = await envWith(cases);
    const user = await open(env);
    const dialog = await screen.findByRole('dialog', { name: new RegExp(`^(Promoted to .+|Level ${p.level})$`) });
    expect(within(dialog).getByText(String(p.level))).toBeInTheDocument();
    expect(within(dialog).getByText(p.title)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Keep casing' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Promoted|Level \d/ })).not.toBeInTheDocument());
    expect(window.localStorage.getItem(SEEN)).toBe(String(p.level));

    // A fresh page load at the same level has nothing new to celebrate.
    document.body.innerHTML = '';
    render(<App backend={env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.queryByRole('dialog', { name: /Promoted|Level \d/ })).not.toBeInTheDocument();
  });

  it('says "Promoted" for a new job title and plain "Level" for a level within the same one', async () => {
    window.localStorage.setItem(SEEN, '1');
    const needAnalyst = manyCases(40); // well past level 4, where Analyst starts
    expect(progressFor(needAnalyst).level).toBeGreaterThanOrEqual(5);
    await open(await envWith(needAnalyst));
    expect(await screen.findByRole('dialog', { name: /^Promoted to / })).toBeInTheDocument();
  });

  it('only notes where you are the first time it sees you, so nobody with cases gets a pile of celebrations', async () => {
    const cases = manyCases(8);
    await open(await envWith(cases));
    await chip();
    expect(screen.queryByRole('dialog', { name: /Promoted|Level \d/ })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN)).toBe(String(progressFor(cases).level));
  });

  it('lets you drop a level (deleting cases) without taking the celebration back or repeating it on the way up', async () => {
    window.localStorage.setItem(SEEN, '6');
    const cases = manyCases(3);
    expect(progressFor(cases).level).toBeLessThan(6);
    await open(await envWith(cases));
    expect(screen.queryByRole('dialog', { name: /Promoted|Level \d/ })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN)).toBe('6'); // the highest it has seen stays
  });

  it('keeps quiet when levels are switched off, but still notes the level so switching on later is not a surprise', async () => {
    window.localStorage.setItem(GAME_KEY, 'off');
    window.localStorage.setItem(SEEN, '1');
    const cases = manyCases(8);
    await open(await envWith(cases));
    expect(screen.queryByRole('dialog', { name: /Promoted|Level \d/ })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN)).toBe(String(progressFor(cases).level));
  });

  it('never counts sample data in demo mode', async () => {
    window.localStorage.setItem(SEEN, '1');
    const user = await open(createFakeEnv());
    await user.click(await screen.findByRole('button', { name: /Explore with demo data/ }));
    await screen.findByRole('region', { name: 'Your week' });
    expect(screen.queryByRole('dialog', { name: /Promoted|Level \d/ })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN)).toBe('1');
    expect(screen.getByRole('button', { name: /^Your level: level/ })).toBeInTheDocument(); // the chip still shows, for the fun of it
  });
});

describe('XP when you save a case', () => {
  async function logCase(user: ReturnType<typeof userEvent.setup>, rated: boolean) {
    await user.click(screen.getByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await user.type(within(dialog).getByLabelText(/Case title/), 'My case');
    await user.selectOptions(within(dialog).getByLabelText(/Case type/), 'Profitability');
    await user.selectOptions(within(dialog).getByLabelText(/Industry/), 'Technology / SaaS');
    if (rated) await user.click(within(dialog).getByRole('radio', { name: /Overall performance: 4,/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save case' }));
    return dialog;
  }

  it('says how much the case earned and how far to the next level', async () => {
    const user = await open(createFakeEnv());
    const dialog = await logCase(user, true);
    // 20 for the case, 5 for the rating, 30 for a first case type and 20 for a first industry.
    expect(await within(dialog).findByText(/\+75 XP\./)).toBeInTheDocument();
    expect(within(dialog).getByText(/Level up: you are now level 2, Intern\./)).toBeInTheDocument();
  });

  it('shows the distance to the next level when it did not level you up', async () => {
    const cases = manyCases(3);
    const before = progressFor(cases);
    const user = await open(await envWith(cases));
    const dialog = await logCase(user, false);
    expect(await within(dialog).findByText(/\+\d+ XP\./)).toBeInTheDocument();
    expect(before.level).toBeGreaterThanOrEqual(1);
    expect(xpAtLevel(before.level + 1)).toBeGreaterThan(before.xp);
  });

  it('says nothing about XP when levels are switched off', async () => {
    window.localStorage.setItem(GAME_KEY, 'off');
    const user = await open(createFakeEnv());
    const dialog = await logCase(user, true);
    expect(await within(dialog).findByText('Case saved')).toBeInTheDocument();
    expect(within(dialog).queryByText(/XP/)).not.toBeInTheDocument();
  });
});
