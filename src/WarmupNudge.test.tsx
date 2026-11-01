import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { needsWarmup, type Suggestion } from './domain/suggestions';
import { casesWithRatings } from './test/builders';
import { createFakeEnv } from './test/fakeBackend';

const LINK = { name: /Warm up with a quick sprint/ };

async function openWith(quant: (1 | 2 | 3 | 4 | 5)[], hash = '') {
  const env = createFakeEnv();
  for (const c of casesWithRatings('quant', quant)) await env.repo.insertCase(c);
  window.location.hash = hash;
  render(<App backend={env.backend} />);
}

beforeEach(() => {
  window.location.hash = '';
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('the Warm-up nudge', () => {
  it('points advice about Quant / Math at the sprint, and nothing else', () => {
    const s = (id: string): Suggestion => ({ id, kind: 'skill', text: '' });
    expect(needsWarmup(s('skill-quant'))).toBe(true);
    expect(needsWarmup(s('decline-quant'))).toBe(true);
    expect(needsWarmup(s('skill-framework'))).toBe(false);
    expect(needsWarmup(s('casetype-Pricing'))).toBe(false);
  });

  it('shows on the dashboard when Quant / Math is the weak spot, linking to the sprint', async () => {
    await openWith([2, 2, 2, 2, 2]);
    await screen.findByRole('heading', { name: 'Dashboard' });
    const links = await screen.findAllByRole('link', LINK);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l).toHaveAttribute('href', '#/warmup');
  });

  it('shows beside the Quant / Math priority on Improvement Areas', async () => {
    await openWith([2, 2, 2, 2, 2], '#/improve');
    await screen.findByRole('heading', { name: 'Improvement Areas' });
    expect(await screen.findByRole('link', LINK)).toHaveAttribute('href', '#/warmup');
  });

  it('stays away when Quant / Math is going well', async () => {
    await openWith([5, 5, 5, 5, 5]);
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.queryByRole('link', LINK)).not.toBeInTheDocument();
  });
});
