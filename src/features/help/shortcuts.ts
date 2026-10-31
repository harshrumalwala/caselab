import type { Route } from '../../state/route';

/** Press `g`, then one of these, to jump to a screen. */
export const GO_KEYS: { key: string; route: Route; label: string }[] = [
  { key: 'd', route: 'dashboard', label: 'Dashboard' },
  { key: 'l', route: 'log', label: 'My Case Log' },
  { key: 'i', route: 'improve', label: 'Improvement Areas' },
  { key: 'c', route: 'people', label: 'Community' },
  { key: 'w', route: 'warmup', label: 'Warm-up' },
];

/** How long after `g` the next key still counts. */
export const GO_WINDOW_MS = 1200;

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}
