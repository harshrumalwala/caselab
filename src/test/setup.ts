import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Whole-screen renders are slow on modest machines, and the first test of a file pays for loading the whole app while many files run at
// once: wait longer before a query gives up. (A test still fails at the 20-second test limit in vite.config.ts, so a real hang is not hidden.)
configure({ asyncUtilTimeout: 15000 });

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') {
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
  window.scrollTo = () => {}; // jsdom logs "not implemented" otherwise
}

afterEach(() => {
  // Some test files run in a plain node environment (no DOM) and have nothing to reset.
  if (typeof window === 'undefined') return;
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.classList.remove('dark');
  window.location.hash = '';
});
