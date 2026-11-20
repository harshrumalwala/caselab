import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NO_SHARING, type Profile, type SharedCase } from './domain/community';
import type { SharedScore } from './domain/giveNext';
import { GiveThemNext } from './features/people/GiveThemNext';
import { SharedScores } from './features/people/SharedScores';
import { ThemeProvider } from './state/theme';

/**
 * The bars on a profile link (issue #237). They were drawn by Recharts, with the name in a fixed pixel
 * gutter (`nameWidth`, 142 and 132) handed to a `YAxis` inside an SVG with `overflow: hidden`, so a name
 * longer than the gutter lost its first letters — "lthcare / Pharmaceuticals" — at every window width.
 *
 * **What these tests cannot do.** jsdom has no layout engine: every width and every box it reports is zero,
 * so nothing here can tell a clipped label from a drawn one, and that is why the whole suite was green while
 * this shipped. They pin what is real instead: the whole name is text in the drawn block rather than only in
 * the `sr-only` list beside it, and no pixel count is left anywhere in that block to be wrong again.
 */

const BOB: Profile = {
  userId: 'bob',
  displayName: 'Bob Brown',
  mbaClass: 'Class of 2027',
  listed: true,
  publicProfile: true,
  burnedBooks: [],
  burnedCases: [],
  sharing: { ...NO_SHARING, cases: true, overall: true, skills: true },
};

const row = (over: Partial<SharedCase> & Pick<SharedCase, 'caseId' | 'title'>): SharedCase => ({
  ownerId: 'bob',
  date: '2026-10-01',
  source: '',
  partner: '',
  otherNotes: '',
  caseType: 'Profitability',
  industry: 'Technology / SaaS',
  overall: null,
  skillScores: null,
  feedback: null,
  improvementArea: null,
  notes: null,
  ...over,
});

/** The long industry names from the real list, each with a case behind it so each is drawn as a bar. */
const LONG_INDUSTRIES = [
  'Healthcare / Pharmaceuticals',
  'Healthcare / Pharmaceuticals',
  'Consumer Products / Retail',
  'Transportation / Logistics',
  'Manufacturing / Industrials',
  'Real Estate / Construction',
  'Public Sector / Education',
];
const CASES: SharedCase[] = LONG_INDUSTRIES.map((industry, i) => row({ caseId: `i${i}`, title: `Case ${i}`, industry }));

/** Every skill the dashboard reads, so the one with the longest name is among the bars, on 14 cases. */
const SCORES: SharedScore[] = [
  { key: 'prompt', label: 'Prompt / Pre-framework', average: 3.4, count: 14, thin: false },
  { key: 'quant', label: 'Quantitative', average: 4.2, count: 14, thin: false },
];

const bars = (el: HTMLElement) => el.querySelector('[data-profile-bars]') as HTMLElement | null;

describe('the bars on a profile link', () => {
  it('carries the whole of every long name in the drawn block, not only in the list beside it', () => {
    render(
      <ThemeProvider>
        <GiveThemNext person={BOB} shared={CASES} />
      </ThemeProvider>,
    );
    const lane = screen.getByRole('group', { name: 'Industries' });
    const block = bars(lane);
    expect(block).not.toBeNull();
    for (const name of new Set(LONG_INDUSTRIES)) expect(block?.textContent).toContain(name);
  });

  it('carries a score name and its quieter figure in the drawn block', () => {
    render(
      <ThemeProvider>
        <SharedScores scores={SCORES} thin={[]} label="Scores Bob shares" />
      </ThemeProvider>,
    );
    const block = bars(document.body);
    expect(block?.textContent).toContain('Prompt / Pre-framework');
    expect(block?.textContent).toContain('n=14');
    expect(block?.textContent).toContain('3.4');
  });

  it('leaves no fixed pixel width for the name anywhere in the drawn block', () => {
    render(
      <ThemeProvider>
        <SharedScores scores={SCORES} thin={[]} label="Scores Bob shares" />
      </ThemeProvider>,
    );
    const block = bars(document.body) as HTMLElement;
    // A bar's own length is a percentage of the row; nothing in here may be sized in pixels.
    expect(block.outerHTML).not.toMatch(/width:\s*\d+(\.\d+)?px/);
    expect(block.querySelector('[width]')).toBeNull();
  });

  it('keeps the list a screen reader reads, word for word, beside the bars', () => {
    render(
      <ThemeProvider>
        <GiveThemNext person={BOB} shared={CASES} />
      </ThemeProvider>,
    );
    const list = screen.getByRole('list', { name: 'Industries: cased' });
    expect(list).toHaveClass('sr-only');
    expect(list.textContent).toContain('Healthcare / Pharmaceuticals: 2 cases');
    expect(list.textContent).toContain('Consumer Products / Retail: 1 case');
    expect(bars(screen.getByRole('group', { name: 'Industries' }))).toHaveAttribute('aria-hidden', 'true');
  });
});
