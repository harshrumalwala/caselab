import { ArrowRight, CheckCircle2, Flag, Sparkles } from 'lucide-react';
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
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the save changed, shown in place of the form so the effect is visible immediately. */
export function SavedPanel({ info, onUseSuggestion }: { info: SavedInfo; onUseSuggestion: (s: Suggestion) => void }) {
  const { record } = info;
  return (
    <div role="status" className="animate-rise">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-good-soft text-good">
          <CheckCircle2 className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight text-ink">Case saved</p>
          <p className="truncate text-sm text-muted">{record.title}</p>
        </div>
      </div>

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
