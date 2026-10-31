import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Confetti, CountUp, GrowBar } from '../components/ui/Motion';
import { SavedPanel, type SavedInfo } from '../features/logcase/SavedPanel';
import { makeCase } from '../test/builders';
import { prefersReducedMotion, useCountUp, useGrowIn } from './motion';

/** Pretend to be a browser that does (or doesn't) ask for reduced motion. */
function setMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('reduced motion', () => {
  it('is on when the browser asks for it, off when it does not, and on when it cannot say', () => {
    setMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    setMotion(false);
    expect(prefersReducedMotion()).toBe(false);
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(true); // nothing animates by surprise
  });
});

describe('with reduced motion nothing waits or moves', () => {
  beforeEach(() => setMotion(true));

  it('shows the final number and the full bar straight away', () => {
    render(
      <>
        <CountUp value={16} />
        <GrowBar pct={60} className="bar" />
      </>,
    );
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(document.querySelector('.bar')).toHaveStyle({ width: '60%' });
  });

  it('draws no confetti and keeps the Logged stamp as plain text', () => {
    const { container } = render(<Confetti />);
    expect(container.querySelector('canvas')).toBeNull();
  });
});

describe('with motion allowed', () => {
  beforeEach(() => {
    setMotion(false);
    vi.useFakeTimers();
  });

  it('counts up from zero to the number and stops there', () => {
    const { result } = renderHook(() => useCountUp(16, 800));
    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(400));
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(16);
    act(() => void vi.advanceTimersByTime(600));
    expect(result.current).toBe(16);
  });

  it('counts on from where it was when the number changes', () => {
    const { result, rerender } = renderHook(({ n }) => useCountUp(n, 800), { initialProps: { n: 10 } });
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(10);
    rerender({ n: 14 });
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(14);
  });

  it('starts a bar empty and grows it to its width after the first frame', () => {
    const { result } = renderHook(() => useGrowIn(60));
    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(50));
    expect(result.current).toBe(60);
  });

  it('draws a confetti canvas that ignores the mouse and is hidden from screen readers', () => {
    const { container } = render(<Confetti />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas.className).toContain('pointer-events-none');
  });
});

describe('the saved panel', () => {
  const info = (over: Partial<SavedInfo> = {}): SavedInfo => ({
    record: makeCase({ title: 'Airline profit' }),
    total: 4,
    thisWeek: 2,
    typeCount: 1,
    industryCount: 2,
    firstInIndustry: false,
    milestones: [],
    next: null,
    ...over,
  });

  it('stamps every saved case as Logged, without confetti on an ordinary save', () => {
    setMotion(false);
    const { container } = render(<SavedPanel info={info()} onUseSuggestion={() => {}} />);
    expect(screen.getByText('Logged')).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('adds confetti for a milestone, and for the first case in a new industry', () => {
    setMotion(false);
    const milestone = { id: 'count-10', label: '10 cases completed', date: '2026-10-30', kind: 'count' as const };
    const a = render(<SavedPanel info={info({ milestones: [milestone] })} onUseSuggestion={() => {}} />);
    expect(a.container.querySelector('canvas')).not.toBeNull();
    a.unmount();
    const b = render(<SavedPanel info={info({ firstInIndustry: true })} onUseSuggestion={() => {}} />);
    expect(b.container.querySelector('canvas')).not.toBeNull();
  });

  it('keeps the confetti away when the person prefers reduced motion', () => {
    setMotion(true);
    const milestone = { id: 'count-10', label: '10 cases completed', date: '2026-10-30', kind: 'count' as const };
    const { container } = render(<SavedPanel info={info({ milestones: [milestone] })} onUseSuggestion={() => {}} />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByText('Logged')).toBeInTheDocument();
  });
});
