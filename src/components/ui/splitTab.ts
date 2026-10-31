/**
 * One control split evenly across the full width, for switching between two views of the same page (Members | Inbox on Community,
 * My cases | Burned on the Case Log, Find a case | Shared cases on a profile). Each half is the same size, so the views read as a pair.
 * Use `splitTabsClass` on the container and `splitTabClass(on)` on each half.
 */
export const splitTabsClass = 'flex gap-1 rounded-xl bg-surface-2 p-1 text-sm font-medium';

export const splitTabClass = (on: boolean): string =>
  `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 transition ${on ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`;
