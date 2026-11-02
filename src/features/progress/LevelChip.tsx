import { useState } from 'react';
import { XP_RULES, titleForLevel, type Progress } from '../../domain/progress';
import { Dialog } from '../../components/ui/Dialog';
import { CountUp, GrowBar } from '../../components/ui/Motion';

const n = (v: number) => v.toLocaleString('en-US');

/**
 * Where you are, kept to the height of the page title so it never competes with practising but is hard to miss: a tilted level
 * sticker beside "Dashboard" with your job title, a bar for the way through the level and what is left. Click it for the whole
 * story. Hidden when the game is switched off.
 */
export function LevelChip({ progress }: { progress: Progress }) {
  const [open, setOpen] = useState(false);
  const { level, title, xp, pct, toNext, atMax } = progress;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
      {open && <LevelDetails progress={progress} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The full level story in a window: the level and title, the bar, what is next, where the XP came from and what earns it. */
function LevelDetails({ progress, onClose }: { progress: Progress; onClose: () => void }) {
  const { level, title, xp, pct, toNext, atMax, nextTitle, breakdown } = progress;
  const joke = titleForLevel(level).joke;
  return (
    <Dialog open onClose={onClose} title="Your level" description={`Level ${level}: ${title}`} width="md">
      <div className="flex items-start gap-4">
        <span
          className="flex size-16 shrink-0 -rotate-3 flex-col items-center justify-center rounded-2xl border-2 border-ink/80 bg-lilac text-on-color shadow-[2px_3px_0_0_rgb(28_26_24/0.85)]"
          aria-hidden
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-90">Level</span>
          <span className="num font-display text-3xl font-extrabold leading-none">{level}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl font-extrabold leading-snug text-ink">
            Level {level}: {title}
          </h3>
          <p className="text-sm text-ink-2">{joke}</p>
          <div className="mt-3">
            <div className="h-3 overflow-hidden rounded-full border-2 border-ink/80 bg-surface" role="img" aria-label={`${pct} percent of the way to the next level`}>
              <GrowBar className="h-full rounded-full bg-lilac" pct={pct} />
            </div>
            <p className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 text-sm text-ink-2">
              <span>
                <span className="font-semibold text-ink">
                  <CountUp value={xp} format={n} /> XP
                </span>
                {atMax ? ' · top of the ladder' : ` · ${n(toNext)} to level ${level + 1}`}
              </span>
              {nextTitle && (
                <span>
                  Next title: <span className="font-semibold text-ink">{nextTitle.title}</span> at level {nextTitle.level}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 text-sm text-ink-2 sm:grid-cols-2">
        <div>
          <p className="eyebrow">Where yours came from</p>
          <ul className="mt-1.5 space-y-1">
            <li className="flex justify-between gap-3"><span>Logging cases</span><span className="num font-semibold text-ink">{n(breakdown.logging)}</span></li>
            <li className="flex justify-between gap-3"><span>Trying something new</span><span className="num font-semibold text-ink">{n(breakdown.coverage)}</span></li>
            <li className="flex justify-between gap-3"><span>Solid weeks</span><span className="num font-semibold text-ink">{n(breakdown.consistency)}</span></li>
            <li className="flex justify-between gap-3"><span>Skills getting better</span><span className="num font-semibold text-ink">{n(breakdown.improvement)}</span></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow">What earns it</p>
          <ul className="mt-1.5 space-y-1">
            <li>A case: {XP_RULES.logged} XP, more for every rating, note and lesson you add (up to 59)</li>
            <li>First case in a new case type: {XP_RULES.newCaseType}. In a new industry: {XP_RULES.newIndustry}</li>
            <li>A week with {XP_RULES.solidWeekCases}+ cases: {XP_RULES.solidWeek}</li>
            <li>A skill that gets half a point, then a whole point, better: {XP_RULES.improvement[0].xp} each</li>
          </ul>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">
        It is worked out from your log every time, so it follows your cases: nothing to cheat, and an Excel import counts. Only the first{' '}
        {XP_RULES.fullPerDay} cases of a day earn in full. Burned and interviewed cases earn nothing. You can hide all of this in Settings.
      </p>
    </Dialog>
  );
}
