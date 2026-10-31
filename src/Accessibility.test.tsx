import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { makeCase } from './test/builders';
import { createFakeEnv } from './test/fakeBackend';

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
});

async function open() {
  const env = createFakeEnv();
  await env.repo.insertCase(makeCase({ date: '2026-09-01' }));
  const user = userEvent.setup();
  render(<App backend={env.backend} />);
  await screen.findByRole('heading', { name: 'Dashboard' });
  return user;
}

describe('using the keyboard', () => {
  it('makes "Skip to main content" the first stop, and it moves focus past the navigation', async () => {
    const user = await open();
    await user.tab();
    const skip = screen.getByRole('button', { name: 'Skip to main content' });
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(document.getElementById('main-content')).toHaveFocus();
    expect(window.location.hash).toBe(''); // a hash link would have changed the page
  });

  it('lets the keyboard into a window whose text has nothing to tab to, so it can be scrolled', async () => {
    const user = await open();
    await user.keyboard('?');
    const list = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    const body = within(list).getByText(/Shortcuts are paused/).closest('.overflow-y-auto') as HTMLElement;
    expect(body).toHaveAttribute('tabindex', '0');
  });

  it('adds no extra stop to a window that already has buttons and fields in it', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Data and settings' }));
    const settings = await screen.findByRole('dialog', { name: 'Data & settings' });
    const body = within(settings).getByText('Your account').closest('.overflow-y-auto') as HTMLElement;
    expect(body).not.toHaveAttribute('tabindex');
  });
});
