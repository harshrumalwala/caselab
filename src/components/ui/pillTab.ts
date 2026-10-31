/** The yellow pill used for every row of tabs (Case Log, Community), so they all look and feel the same. */
export const pillTabClass = (on: boolean): string =>
  `inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-ink/80 px-4 py-1.5 text-sm font-bold transition ${
    on ? 'bg-sun text-on-sun shadow-[2px_2px_0_0_rgb(28_26_24/0.85)]' : 'bg-surface text-ink-2 hover:bg-sun-soft'
  }`;
