import { GrowBar } from '../../components/ui/Motion';
import type { Progress } from '../../domain/progress';

const n = (v: number) => v.toLocaleString('en-US');

/**
 * Where you are, kept to the height of the page title so it never competes with practising but is hard to miss: a tilted level
 * sticker beside "Dashboard" with your job title, a bar for the way through the level and what is left. Click it for the whole
 * story (the level, quests, medals and sticker book). Hidden when the game is switched off.
 */
export function LevelChip({ progress, onOpen }: { progress: Progress; onOpen: () => void }) {
  const { level, title, xp, pct, toNext, atMax } = progress;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Your level: level ${level}, ${title}, ${n(xp)} XP. Open the details.`}
      className="group -ml-1 inline-flex w-fit items-center gap-3 rounded-2xl p-1 pr-3 text-left transition hover:bg-lilac-soft focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span
        aria-hidden
        className="flex size-12 shrink-0 -rotate-3 flex-col items-center justify-center rounded-xl border-2 border-ink/80 bg-lilac text-on-color shadow-[2px_3px_0_0_rgb(28_26_24/0.85)] transition group-hover:rotate-0"
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-90">Level</span>
        <span className="num font-display text-xl font-extrabold leading-none">{level}</span>
      </span>
      <span aria-hidden className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-base font-extrabold leading-none text-ink">{title}</span>
        <span className="h-2.5 w-36 overflow-hidden rounded-full border-2 border-ink/80 bg-surface">
          <GrowBar className="h-full rounded-full bg-lilac" pct={pct} />
        </span>
        <span className="num text-xs leading-none text-ink-2">
          {n(xp)} XP{atMax ? ' · top of the ladder' : ` · ${n(toNext)} to level ${level + 1}`}
        </span>
      </span>
    </button>
  );
}
