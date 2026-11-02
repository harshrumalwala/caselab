import { titleForLevel } from '../../domain/progress';
import type { Profile } from '../../domain/community';

/** A member's shared level as a small pill ("Lv 8 · Associate"), or nothing when they don't share one. Members only. */
export function LevelTag({ person, className = '' }: { person: Pick<Profile, 'level' | 'sharing'>; className?: string }) {
  const level = person.sharing.level ? person.level : null;
  if (!level) return null;
  const title = titleForLevel(level).title;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border-2 border-ink/80 bg-lilac-soft px-2 py-0.5 text-[11px] font-bold leading-none text-lilac-ink shadow-[1px_1px_0_0_rgb(28_26_24/0.85)] ${className}`}
      aria-label={`Level ${level}, ${title}`}
    >
      <span aria-hidden>
        Lv {level} · {title}
      </span>
    </span>
  );
}
