/**
 * One control split evenly across the full width, for switching between two views of the same page (Members | Inbox on Community,
 * My cases | Burned on the Case Log, Find a case | Shared cases on a profile). Each half is the same size, so the views read as a pair.
 *
 * It borrows the look of the main navigation: a sticker (outlined, with a hard shadow) holding two halves, and the chosen half in the
 * same yellow, outlined and raised, as the current page up top. Use `splitTabsClass` on the container and `splitTabClass(on)` on each half.
 */
export const splitTabsClass = 'sticker flex gap-1.5 p-1.5 text-sm font-bold';

export const splitTabClass = (on: boolean): string =>
  `flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 transition ${
    on
      ? 'bg-sun text-on-sun shadow-[2px_2px_0_0_rgb(28_26_24/0.85)] ring-2 ring-ink/80'
      : 'text-ink-2 hover:bg-sun-soft hover:text-ink'
  }`;
