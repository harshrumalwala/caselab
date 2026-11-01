import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlideRow } from './components/ui/useSlidingMark';
import { App } from './App';
import { makeCase } from './test/builders';
import { createFakeEnv } from './test/fakeBackend';

// jsdom does no layout, so give every element a size and a left edge by its place in its row: 100 wide, 110 apart, the first at 0.
const proto = HTMLElement.prototype;
const saved = {
  w: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
  h: Object.getOwnPropertyDescriptor(proto, 'offsetHeight'),
  l: Object.getOwnPropertyDescriptor(proto, 'offsetLeft'),
  t: Object.getOwnPropertyDescriptor(proto, 'offsetTop'),
};
beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 100 });
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => 30 });
  Object.defineProperty(proto, 'offsetTop', { configurable: true, get: () => 0 });
  Object.defineProperty(proto, 'offsetLeft', {
    configurable: true,
    get(this: HTMLElement) {
      // The mark floats above the row (it takes no room), so it doesn't count as a place.
      return this.parentElement ? [...this.parentElement.children].filter((c) => !c.hasAttribute('data-slide-mark')).indexOf(this) * 110 : 0;
    },
  });
});
afterEach(() => {
  for (const [name, d] of [['offsetWidth', saved.w], ['offsetHeight', saved.h], ['offsetLeft', saved.l], ['offsetTop', saved.t]] as const) {
    if (d) Object.defineProperty(proto, name, d);
    else delete (proto as unknown as Record<string, unknown>)[name];
  }
});

const mark = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-slide-mark]');

describe('the sliding highlight', () => {
  it('sits under the chosen tab on the Case Log and slides to the next one when it is chosen', async () => {
    const env = createFakeEnv();
    await env.repo.insertCase(makeCase({ date: '2026-09-01' }));
    window.location.hash = '#/log';
    const user = userEvent.setup();
    render(<App backend={env.backend} />);
    const row = await screen.findByRole('tablist', { name: 'Case log views' });

    // Under "My cases" (the first tab).
    await waitFor(() => expect(mark(row)).not.toBeNull());
    expect(mark(row)).toHaveStyle({ transform: 'translate(0px, 0px)', width: '100px' });
    expect(mark(row)).toHaveAttribute('aria-hidden', 'true');
    expect(mark(row)?.className).toContain('bg-sun');

    // Choosing another tab moves the mark to it.
    await user.click(within(row).getByRole('tab', { name: /Interviewed/ }));
    await waitFor(() => expect(mark(row)).toHaveStyle({ transform: 'translate(110px, 0px)' }));
    expect(within(row).getByRole('tab', { name: /Interviewed/ })).toHaveAttribute('data-slide-active', 'true');
    expect(within(row).getByRole('tab', { name: 'My cases' })).not.toHaveAttribute('data-slide-active');
  });

  it('is one control for the Community views too, with the mark under Members and then Inbox', async () => {
    window.location.hash = '#/people';
    const user = userEvent.setup();
    render(<App backend={createFakeEnv().backend} />);
    const row = await screen.findByRole('navigation', { name: 'Community' });
    await waitFor(() => expect(mark(row)).toHaveStyle({ transform: 'translate(0px, 0px)' }));
    await user.click(within(row).getByRole('link', { name: /^Inbox/ }));
    await waitFor(() => expect(mark(screen.getByRole('navigation', { name: 'Community' }))).toHaveStyle({ transform: 'translate(110px, 0px)' }));
  });

  it('marks the current page in the main navigation, and follows you to Community when you open the Inbox', async () => {
    window.location.hash = '#/warmup';
    render(<App backend={createFakeEnv().backend} />);
    const nav = (await screen.findAllByRole('navigation', { name: 'Primary' }))[0];
    expect(within(nav).getByRole('link', { name: 'Warm-up' })).toHaveAttribute('data-slide-active', 'true');
    await waitFor(() => expect(mark(nav)).toHaveStyle({ transform: 'translate(440px, 0px)' })); // the fifth link

    window.location.hash = '#/inbox';
    await waitFor(() => expect(within(nav).getByRole('link', { name: /^Community/ })).toHaveAttribute('data-slide-active', 'true'));
    await waitFor(() => expect(mark(nav)).toHaveStyle({ transform: 'translate(330px, 0px)' })); // the fourth link
  });

  it('is placed instantly the first time and only glides afterwards, so nothing slides in from the corner', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <SlideRow activeKey="a" markClass="bg-sun">
          <button data-slide-active="true">A</button>
          <button>B</button>
        </SlideRow>,
      );
      expect(mark(container.firstElementChild as HTMLElement)).not.toBeNull();
      expect(mark(container.firstElementChild as HTMLElement)?.className).not.toContain('transition-');
      act(() => void vi.advanceTimersByTime(100));
      expect(mark(container.firstElementChild as HTMLElement)?.className).toContain('transition-');
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves no mark behind when nothing can be measured', async () => {
    Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 0 });
    window.location.hash = '#/people';
    render(<App backend={createFakeEnv().backend} />);
    const row = await screen.findByRole('navigation', { name: 'Community' });
    expect(mark(row)).toBeNull();
    expect(within(row).getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
  });
});
