import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HERO_POSTER, HERO_VIDEO, HeroVideo } from './HeroVideo';

/** A browser that can say whether the person asked for less motion (jsdom can't, and then everything stays still). */
function browserWith({ reduceMotion = false, saveData = false } = {}) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: reduceMotion && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }),
  );
  Object.defineProperty(navigator, 'connection', { value: { saveData }, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'connection');
});

describe('the front-page video', () => {
  it('is a silent, looping video with a picture to show first, hidden from screen readers', () => {
    browserWith();
    const { container } = render(<HeroVideo />);
    const video = container.querySelector('video')!;
    expect(video).toBeInTheDocument();
    expect(video.getAttribute('src')).toBe(HERO_VIDEO);
    expect(video.getAttribute('poster')).toBe(HERO_POSTER);
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(video.hasAttribute('controls')).toBe(false);
    expect(video.tabIndex).toBe(-1); // nothing to tab to
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true'); // decorative
  });

  it('is only the picture for someone who prefers reduced motion, so nothing moves', () => {
    browserWith({ reduceMotion: true });
    const { container } = render(<HeroVideo />);
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(HERO_POSTER);
  });

  it('is only the picture when the browser says to save data, so no video is downloaded', () => {
    browserWith({ saveData: true });
    const { container } = render(<HeroVideo />);
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeInTheDocument();
  });

  it('is only the picture where the browser cannot say (older browsers, tests), rather than moving by surprise', () => {
    const { container } = render(<HeroVideo />);
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeInTheDocument();
  });

  it('falls back to the picture if the video cannot be loaded', () => {
    browserWith();
    const { container } = render(<HeroVideo />);
    fireEvent.error(container.querySelector('video')!);
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(HERO_POSTER);
  });

  it('plays while on screen and pauses when scrolled away, to spare the battery', () => {
    browserWith();
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
    const { container, unmount } = render(<HeroVideo />);
    const video = container.querySelector('video')!;
    const play = vi.spyOn(video, 'play').mockResolvedValue();
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});

    report([{ isIntersecting: true }]);
    expect(play).toHaveBeenCalledTimes(1);
    report([{ isIntersecting: false }]);
    expect(pause).toHaveBeenCalledTimes(1);

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('shrugs off a browser that refuses to autoplay', async () => {
    browserWith();
    let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof report) {
          report = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { container } = render(<HeroVideo />);
    const video = container.querySelector('video')!;
    vi.spyOn(video, 'play').mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    report([{ isIntersecting: true }]);
    await Promise.resolve();
    expect(container.querySelector('video')).toBeInTheDocument(); // the poster stays showing; no error
  });
});
