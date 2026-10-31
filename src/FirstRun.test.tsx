import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { takeImportIntent } from './state/afterSignup';
import { makeCase } from './test/builders';
import { createFakeEnv, TEST_USER, type FakeEnv } from './test/fakeBackend';

const WISH = 'caselab:v1:after-signup';

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

async function open(env: FakeEnv = createFakeEnv()) {
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  return { user, env };
}

describe('"Create account and import" on the landing page', () => {
  it('remembers the wish, so the import is waiting after sign-up', async () => {
    const user = userEvent.setup();
    render(<App backend={createFakeEnv({ signedIn: false }).backend} />);
    await user.click(await screen.findByRole('link', { name: /Create account and import/ }));
    expect(takeImportIntent()).toBe(true);
  });

  it('opens the import for a new account with nothing in it', async () => {
    window.localStorage.setItem(WISH, JSON.stringify({ import: true, at: Date.now() }));
    await open();
    expect(await screen.findByRole('dialog', { name: 'Import from Excel' })).toBeInTheDocument();
    expect(window.localStorage.getItem(WISH)).toBeNull(); // used up
  });

  it('leaves someone who already has cases alone, and still forgets the wish', async () => {
    window.localStorage.setItem(WISH, JSON.stringify({ import: true, at: Date.now() }));
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ date: '2026-09-01' }));
    await open(env);
    await waitFor(() => expect(window.localStorage.getItem(WISH)).toBeNull());
    expect(screen.queryByRole('dialog', { name: 'Import from Excel' })).not.toBeInTheDocument();
  });

  it('does nothing when nobody asked for it', async () => {
    await open();
    expect(screen.queryByRole('dialog', { name: 'Import from Excel' })).not.toBeInTheDocument();
  });
});

describe('keyboard shortcuts', () => {
  it('lists them with "?", and "n" opens the Log Case form', async () => {
    const { user } = await open();
    await user.keyboard('?');
    const list = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(list).getByText('Log a case')).toBeInTheDocument();
    expect(within(list).getByText('Go to My Case Log')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument());

    await user.keyboard('n');
    expect(await screen.findByRole('dialog', { name: 'Log a case' })).toBeInTheDocument();
  });

  it('jumps to a screen with "g" then a letter', async () => {
    const { user } = await open();
    await user.keyboard('gl');
    expect(await screen.findByRole('heading', { name: 'My Case Log' })).toBeInTheDocument();
    await user.keyboard('gw');
    expect(await screen.findByRole('heading', { name: 'Warm-up' })).toBeInTheDocument();
    await user.keyboard('gd');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('leaves the keys alone while you are typing in a box', async () => {
    const { user } = await open();
    await user.keyboard('gl');
    await screen.findByRole('heading', { name: 'My Case Log' });
    window.location.hash = '#/dashboard';
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(await screen.findByRole('button', { name: 'Log case' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a case' });
    await user.type(within(dialog).getByLabelText(/Case title/), 'n?gl');
    expect(within(dialog).getByLabelText(/Case title/)).toHaveValue('n?gl');
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
  });

  it('can be opened from Settings too', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await user.click(await screen.findByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});

describe('installing as an app', () => {
  it('offers the install button once the browser says it can, and uses the browser prompt', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    const settings = await screen.findByRole('dialog', { name: 'Data & settings' });
    expect(within(settings).queryByRole('button', { name: 'Install CaseLab' })).not.toBeInTheDocument();
    expect(within(settings).getByText(/Add to Home Screen/)).toBeInTheDocument();

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => void window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true); // we keep it for our own button

    await user.click(await within(settings).findByRole('button', { name: 'Install CaseLab' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(settings).queryByRole('button', { name: 'Install CaseLab' })).not.toBeInTheDocument());
  });
});

describe('the first-login tour', () => {
  // jsdom does no layout, so say that the tour's targets are on screen and where they are.
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      return [{ top: 10, left: 10, width: 100, height: 30 }] as unknown as DOMRectList;
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 10, left: 10, width: 100, height: 30, right: 110, bottom: 40, x: 10, y: 10, toJSON: () => ({}),
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('walks a new account through Log Case, Import and Community, once', async () => {
    const { user } = await open();
    const tour = await screen.findByRole('dialog', { name: 'Quick tour' });
    expect(within(tour).getByText('1 of 3')).toBeInTheDocument();
    expect(within(tour).getByText('Log a case here')).toBeInTheDocument();

    await user.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(await within(tour).findByText('Coming from Excel?')).toBeInTheDocument();
    expect(within(tour).getByText('2 of 3')).toBeInTheDocument();

    await user.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(await within(tour).findByText('Find someone to case with')).toBeInTheDocument();
    await user.click(within(tour).getByRole('button', { name: 'Got it' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quick tour' })).not.toBeInTheDocument());
    expect(window.localStorage.getItem(`caselab:v1:tour:${TEST_USER.userId}`)).toBe('1');
  });

  it('keeps its ring on the button when the button moves or changes size by itself', async () => {
    let box = { top: 10, left: 10, width: 100, height: 30 };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) }) as DOMRect,
    );
    await open();
    await screen.findByRole('dialog', { name: 'Quick tour' });
    const ring = () => document.querySelector('.ring-sun') as HTMLElement;
    expect(ring().style.left).toBe('6px');
    expect(ring().style.width).toBe('108px');

    box = { top: 10, left: 40, width: 130, height: 30 }; // a web font arrived and the button grew, with no scroll or resize
    await waitFor(() => expect(ring().style.width).toBe('138px'), { timeout: 2000 });
    expect(ring().style.left).toBe('36px');
  });

  it('can be skipped, and then never comes back', async () => {
    const first = await open();
    await first.user.click(await screen.findByRole('button', { name: 'Skip tour' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quick tour' })).not.toBeInTheDocument());
    first.user.keyboard('{Escape}');

    document.body.innerHTML = '';
    render(<App backend={first.env.backend} />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.queryByRole('dialog', { name: 'Quick tour' })).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { user } = await open();
    await screen.findByRole('dialog', { name: 'Quick tour' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quick tour' })).not.toBeInTheDocument());
    expect(window.localStorage.getItem(`caselab:v1:tour:${TEST_USER.userId}`)).toBe('1');
  });

  it('is only for accounts with nothing in them yet', async () => {
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ date: '2026-09-01' }));
    await open(env);
    expect(screen.queryByRole('dialog', { name: 'Quick tour' })).not.toBeInTheDocument();
  });

  it('steps aside while a window is open', async () => {
    const { user } = await open();
    await screen.findByRole('dialog', { name: 'Quick tour' });
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    await screen.findByRole('dialog', { name: 'Data & settings' });
    expect(screen.queryByRole('dialog', { name: 'Quick tour' })).not.toBeInTheDocument();
  });
});
