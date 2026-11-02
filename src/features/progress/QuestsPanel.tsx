import { Check } from 'lucide-react';
import { addDays, formatShortDate, startOfWeek, toISODate } from '../../domain/dates';
import { QUEST_XP, questsForWeek, questTotals } from '../../domain/quests';
import type { CaseRecord } from '../../domain/types';

/** This week's three quests and how far each one is, so there is always one small thing worth trying next. */
export function QuestsPanel({ cases, now }: { cases: CaseRecord[]; now: Date }) {
  const monday = startOfWeek(now);
  const quests = questsForWeek(cases, toISODate(monday));
  const finished = quests.filter((q) => q.done).length;
  const totals = questTotals(cases);
  return (
    <div>
      <p className="text-sm text-ink-2">
        Three small things to try this week, picked from your own log. Each one finished is worth {QUEST_XP} XP. They change on Monday (
        {formatShortDate(toISODate(addDays(monday, 7)))}).
      </p>
      <p className="mt-3 font-display text-lg font-extrabold text-ink">
        {finished === quests.length ? 'All three done this week. Nicely played.' : `${finished} of ${quests.length} done this week`}
      </p>
      <ul className="mt-3 space-y-2.5" aria-label="This week's quests">
        {quests.map((q) => (
          <li
            key={q.id}
            className={`flex items-center gap-3 rounded-2xl border-2 border-ink/80 p-3 shadow-[2px_2px_0_0_rgb(28_26_24/0.85)] ${q.done ? 'bg-teal-soft' : 'bg-surface'}`}
          >
            <span
              aria-hidden
              className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-ink/80 ${q.done ? 'bg-teal text-on-color' : 'bg-bg text-transparent'}`}
            >
              <Check className="size-4" strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-semibold text-ink ${q.done ? 'line-through decoration-ink/40' : ''}`}>{q.title}</span>
              <span className="num block text-xs text-ink-2">
                {q.done ? `Done, +${QUEST_XP} XP` : `${q.have} of ${q.need}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">
        {totals.done === 0 ? 'No quests finished yet.' : `${totals.done} ${totals.done === 1 ? 'quest' : 'quests'} finished in all, worth ${totals.xp} XP.`} They follow your cases, so
        they can be finished by logging or editing a case this week.
      </p>
    </div>
  );
}
