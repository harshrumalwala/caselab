import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevealOnView } from './RevealOnView';

afterEach(() => vi.unstubAllGlobals());

describe('RevealOnView', () => {
  it('is just there where the browser cannot tell when something scrolls into view', () => {
    render(<RevealOnView>hello</RevealOnView>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('draws its content only when it scrolls into view, then keeps it, and lets go of the watcher', () => {
    let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof report) {
          report = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { container } = render(<RevealOnView className="box">hello</RevealOnView>);
    expect(container.querySelector('.box')).toBeInTheDocument(); // the box holds its place
    expect(screen.queryByText('hello')).not.toBeInTheDocument();

    act(() => report([{ isIntersecting: false }]));
    expect(screen.queryByText('hello')).not.toBeInTheDocument();

    act(() => report([{ isIntersecting: true }]));
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled(); // nothing left to watch

    act(() => report([{ isIntersecting: false }])); // scrolling away doesn't remove it again
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
