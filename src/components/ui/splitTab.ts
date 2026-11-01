/**
 * One control split evenly across the full width, for switching between views of the same page (Members | Inbox on Community,
 * My cases | Interviewed | Burned on the Case Log, Find a case | Shared cases on a profile). Each part is the same size, so the views
 * read as a pair (or a trio).
 *
 * It borrows the look of the main navigation: a sticker (outlined, with a hard shadow) holding the parts, with the chosen part marked by
 * the same yellow, outlined and raised, as the current page up top. The yellow is one mark that slides to the chosen part (see
 * `SlideRow`): put `splitTabsClass` and `splitMarkClass` on the row, and `splitTabClass(on)` plus `data-slide-active` on each part.
 */
export const splitTabsClass = 'sticker flex gap-1.5 p-1.5 text-sm font-bold';

/** The sliding yellow behind the chosen part. */
export const splitMarkClass = 'rounded-xl bg-sun ring-2 ring-ink/80 shadow-[2px_2px_0_0_rgb(28_26_24/0.85)]';

export const splitTabClass = (on: boolean): string =>
  `relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 transition-colors ${
    on ? 'text-on-sun' : 'text-ink-2 hover:bg-sun-soft hover:text-ink'
  }`;
