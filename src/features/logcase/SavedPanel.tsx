import { ArrowRight, CheckCircle2, Flag, Sparkles } from 'lucide-react';
import { Confetti } from '../../components/ui/Motion';
import type { Milestone } from '../../domain/milestones';
import type { Suggestion } from '../../domain/suggestions';
import type { CaseRecord } from '../../domain/types';

export interface SavedInfo {
  record: CaseRecord;
  total: number;
  thisWeek: number;
  typeCount: number;
  industryCount: number;
  firstInIndustry: boolean;
  milestones: Milestone[];
  next: Suggestion | null;
  /** Your weekly goal after this save; `hit` is true when this very case is the one that reached it. */
  goal?: { goal: number; count: number; hit: boolean; streak: number } | null;
}

/** One of these under "Case saved", picked by how many cases you now have so it changes as you go. */
const CHEERS = [
  'Your future self just sent a thank-you note.',
  'Another one in the bank. Somewhere, a partner is nodding approvingly.',
  'Logged. Memory is unreliable, spreadsheets are forever (and this one is nicer).',
  'Nice. That is how patterns get found.',
  'Case closed. Well, case logged.',
  'Look at you, being organised.',
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the save changed, shown in place of the form so the effect is visible immediately. */
export function SavedPanel({ info, onUseSuggestion }: { info: SavedInfo; onUseSuggestion: (s: Suggestion) => void }) {
  const { record } = info;
  return (
    <div role="status" className="animate-rise">
      {/* A milestone (10th case, first of an industry, every main case type) gets confetti. */}
      {(info.milestones.length > 0 || info.firstInIndustry || info.goal?.hit) && <Confetti />}
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-good-soft text-good">
          <CheckCircle2 className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight text-ink">Case saved</p>
          <p className="truncate text-sm text-muted">{record.title}</p>
        </div>
        <span className="stamp ml-auto" aria-hidden>
          Logged
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-accent-text">{CHEERS[info.total % CHEERS.length]}</p>
      {info.goal && (
        <p className={`mt-1.5 text-sm font-semibold ${info.goal.hit ? 'text-good' : 'text-ink-2'}`}>
          {info.goal.hit
            ? `Weekly goal hit: ${info.goal.count} of ${info.goal.goal}.${info.goal.streak > 1 ? ` That is ${info.goal.streak} weeks in a row.` : ''}`
            : info.goal.count < info.goal.goal
              ? `Weekly goal: ${info.goal.count} of ${info.goal.goal}. ${info.goal.goal - info.goal.count} to go.`
              : `Weekly goal: already hit, and now ${info.goal.count} of ${info.goal.goal}. Overachiever.`}
        </p>
      )}

      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface-2/50 text-sm">
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-ink-2">Total cases</span>
          <span className="num font-semibold text-ink">
            {info.total}
            <span className="ml-2 font-normal text-muted">· {info.thisWeek} this week</span>
          </span>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-ink-2">{record.caseType}</span>
          <span className="num font-semibold text-ink">
            {plural(info.typeCount, 'case', 'cases')}
            <span className="ml-2 font-normal text-muted">
              {info.typeCount === 1 ? 'first one' : 'practiced multiple times'}
            </span>
          </span>
        </li>
        <li className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-ink-2">{record.industry}</span>
          <span className="num font-semibold text-ink">
            {plural(info.industryCount, 'case', 'cases')}
            {info.firstInIndustry && <span className="ml-2 font-normal text-accent-text">new industry</span>}
          </span>
        </li>
      </ul>

      {info.milestones.length > 0 && (
        <ul className="mt-4 space-y-2">
          {info.milestones.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2.5 rounded-xl bg-accent-soft px-4 py-2.5 text-sm font-medium text-accent-text"
            >
              <Flag className="size-4 shrink-0" /> {m.label}
            </li>
          ))}
        </ul>
      )}

      {info.next && (
        <div className="mt-4 rounded-2xl border border-line p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Sparkles className="size-3.5" /> Next up
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{info.next.text}</p>
          {info.next.action && (
            <button
              type="button"
              onClick={() => onUseSuggestion(info.next as Suggestion)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline"
            >
              {info.next.action.label} <ArrowRight className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
